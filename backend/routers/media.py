"""Media library: upload, list, rename, soft-delete, protected file serving."""
import io
import re
import struct
import uuid
from typing import Optional

import requests
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile

from core.db import db
from core.deps import get_current_user, require_org_user, user_from_token
from core.models import MediaUpdate, new_id, now_iso
from core.storage import APP_PREFIX, get_object, put_object, local_file, STORAGE_BACKEND
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/media", tags=["media"])

ALLOWED = {
    "jpg": ("image/jpeg", "image"),
    "jpeg": ("image/jpeg", "image"),
    "png": ("image/png", "image"),
    "webp": ("image/webp", "image"),
    "mp4": ("video/mp4", "video"),
}
MAX_BYTES = 200 * 1024 * 1024


def _png_size(data: bytes):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", data[16:24])
        return w, h
    return None


def _jpeg_size(data: bytes):
    try:
        i = 2
        while i < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3):
                h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                return w, h
            seg_len = struct.unpack(">H", data[i + 2 : i + 4])[0]
            i += 2 + seg_len
    except Exception:
        return None
    return None


def _dimensions(data: bytes, ext: str):
    if ext == "png":
        return _png_size(data)
    if ext in ("jpg", "jpeg"):
        return _jpeg_size(data)
    return None


async def _usage(org_id: str, media_id: str):
    playlists = await db.playlists.find(
        {"org_id": org_id, "items.media_id": media_id}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(200)
    return playlists


@router.get("")
async def list_media(user: dict = Depends(require_org_user)):
    items = await db.media.find(
        {"org_id": user["org_id"], "is_deleted": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(2000)
    for item in items:
        item["used_in"] = await _usage(user["org_id"], item["id"])
    return items


async def save_upload_file(file: UploadFile, org_id: str, user_id: str, location_id: Optional[str] = None) -> dict:
    """Validate, push to object storage and record one uploaded file. Shared by media + screens."""
    filename = (file.filename or "upload").strip()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, WEBP and MP4 files are supported")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than the 200 MB limit")
    content_type, kind = ALLOWED[ext]
    path = f"{APP_PREFIX}/{org_id}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, content_type)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {exc}")
    dims = _dimensions(data, ext)
    doc = {
        "id": new_id(),
        "org_id": org_id,
        "location_id": location_id,
        "name": filename,
        "storage_path": result["path"],
        "content_type": content_type,
        "kind": kind,
        "ext": ext,
        "size": result.get("size", len(data)),
        "width": dims[0] if dims else None,
        "height": dims[1] if dims else None,
        "is_deleted": False,
        "created_at": now_iso(),
        "uploaded_by": user_id,
    }
    await db.media.insert_one(dict(doc))
    return doc


@router.post("/upload", status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    location_id: Optional[str] = Query(None),
    user: dict = Depends(require_org_user),
):
    doc = await save_upload_file(file, user["org_id"], user["id"], location_id)
    return {**doc, "used_in": []}


def normalize_web_link(url: str) -> str:
    """Turn a Canva share/short link into its embeddable (iframe-able) form."""
    u = (url or "").strip()
    if not u:
        return u
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    if "canva" in u:
        final = u
        try:
            r = requests.head(u, allow_redirects=True, timeout=10)
            final = r.url or u
        except Exception:
            final = u
        m = re.search(r"/design/([^/?#]+)/([^/?#]+)", final)
        if m:
            return f"https://www.canva.com/design/{m.group(1)}/{m.group(2)}/view?embed"
        m = re.search(r"/design/([^/?#]+)", final)
        if m:
            return f"https://www.canva.com/design/{m.group(1)}/view?embed"
    return u


@router.post("/link", status_code=201)
async def create_web_link(payload: dict, user: dict = Depends(require_org_user)):
    """Add a live web page (e.g. a Canva design) as a content item — no file upload."""
    name = (payload.get("name") or "").strip()
    raw_url = (payload.get("url") or "").strip()
    if not raw_url:
        raise HTTPException(status_code=400, detail="A URL is required")
    embed_url = normalize_web_link(raw_url)
    doc = {
        "id": new_id(),
        "org_id": user["org_id"],
        "location_id": None,
        "name": name or "Web link",
        "storage_path": None,
        "url": embed_url,
        "source_url": raw_url,
        "content_type": "text/html",
        "kind": "url",
        "ext": None,
        "size": 0,
        "width": None,
        "height": None,
        "is_deleted": False,
        "created_at": now_iso(),
        "uploaded_by": user["id"],
    }
    await db.media.insert_one(dict(doc))
    return {**doc, "used_in": []}



@router.patch("/{media_id}")
async def rename_media(media_id: str, payload: MediaUpdate, user: dict = Depends(require_org_user)):
    if not payload.name:
        raise HTTPException(status_code=400, detail="Name is required")
    res = await db.media.update_one(
        {"id": media_id, "org_id": user["org_id"]}, {"$set": {"name": payload.name.strip()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Media not found")
    return await db.media.find_one({"id": media_id}, {"_id": 0})


@router.delete("/{media_id}")
async def delete_media(media_id: str, force: bool = False, user: dict = Depends(require_org_user)):
    media = await db.media.find_one({"id": media_id, "org_id": user["org_id"]}, {"_id": 0})
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    used = await _usage(user["org_id"], media_id)
    if used and not force:
        names = ", ".join(p["name"] for p in used)
        raise HTTPException(status_code=409, detail=f"This file is used in: {names}. Confirm to remove it anyway.")
    if used:
        for pl in used:
            doc = await db.playlists.find_one({"id": pl["id"]}, {"_id": 0})
            items = [i for i in doc.get("items", []) if i["media_id"] != media_id]
            await db.playlists.update_one(
                {"id": pl["id"]},
                {"$set": {"items": items, "updated_at": now_iso()}, "$inc": {"version": 1}},
            )
    await db.media.update_one({"id": media_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}


def _parse_range(range_header: str, file_size: int):
    m = re.match(r"bytes=(\d+)-(\d*)", range_header.strip())
    if not m:
        return None
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else file_size - 1
    end = min(end, file_size - 1)
    if start >= file_size or start > end:
        return "invalid"
    return start, end


def _iter_file(path, start: int, end: int, chunk_size: int = 262144):
    """Stream a byte range straight from disk, 256KB at a time (constant memory)."""
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = f.read(min(chunk_size, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


async def _serve(media_id: str, org_id: Optional[str] = None, range_header: Optional[str] = None):
    query = {"id": media_id, "is_deleted": False}
    if org_id:
        query["org_id"] = org_id
    media = await db.media.find_one(query, {"_id": 0})
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    base_headers = {"Cache-Control": "private, max-age=86400", "Accept-Ranges": "bytes"}

    # Local disk (production/self-hosted): STREAM from disk, never load whole file in RAM.
    if STORAGE_BACKEND == "local":
        try:
            src, file_size, ctype = local_file(media["storage_path"])
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Media file missing")
        media_type = media.get("content_type") or ctype
        if range_header:
            rng = _parse_range(range_header, file_size)
            if rng == "invalid":
                return Response(status_code=416, headers={**base_headers, "Content-Range": f"bytes */{file_size}"})
            if rng:
                start, end = rng
                return StreamingResponse(
                    _iter_file(src, start, end),
                    status_code=206,
                    media_type=media_type,
                    headers={
                        **base_headers,
                        "Content-Range": f"bytes {start}-{end}/{file_size}",
                        "Content-Length": str(end - start + 1),
                    },
                )
        return StreamingResponse(
            _iter_file(src, 0, file_size - 1),
            media_type=media_type,
            headers={**base_headers, "Content-Length": str(file_size)},
        )

    # Emergent object storage (Emergent preview only): fetched over HTTP into memory.
    try:
        data, content_type = get_object(media["storage_path"])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage read failed: {exc}")
    media_type = media.get("content_type", content_type)
    file_size = len(data)
    if range_header:
        rng = _parse_range(range_header, file_size)
        if rng == "invalid":
            return Response(status_code=416, headers={**base_headers, "Content-Range": f"bytes */{file_size}"})
        if rng:
            start, end = rng
            chunk = data[start : end + 1]
            return Response(
                content=chunk,
                status_code=206,
                media_type=media_type,
                headers={
                    **base_headers,
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(len(chunk)),
                },
            )
    return Response(
        content=data,
        media_type=media_type,
        headers={**base_headers, "Content-Length": str(file_size)},
    )


@router.get("/{media_id}/file")
async def media_file(media_id: str, request: Request, auth: Optional[str] = Query(None)):
    """Serve media to authenticated dashboard users or paired devices."""
    device_token = request.headers.get("X-Device-Token") or request.query_params.get("device_token")
    range_header = request.headers.get("range")
    if device_token:
        device = await db.devices.find_one({"device_token": device_token}, {"_id": 0})
        if not device:
            raise HTTPException(status_code=401, detail="Invalid device token")
        return await _serve(media_id, device["org_id"], range_header)
    if auth:
        user = await user_from_token(auth)
    else:
        user = await get_current_user(request)
    org_id = None if user["role"] == "super_admin" and not user.get("org_id") else user.get("org_id")
    return await _serve(media_id, org_id, range_header)
