"""Media library: upload, list, rename, soft-delete, protected file serving."""
import io
import struct
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile

from core.db import db
from core.deps import get_current_user, require_org_user, user_from_token
from core.models import MediaUpdate, new_id, now_iso
from core.storage import APP_PREFIX, get_object, put_object

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


@router.post("/upload", status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    location_id: Optional[str] = Query(None),
    user: dict = Depends(require_org_user),
):
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
    path = f"{APP_PREFIX}/{user['org_id']}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, content_type)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {exc}")
    dims = _dimensions(data, ext)
    doc = {
        "id": new_id(),
        "org_id": user["org_id"],
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


async def _serve(media_id: str, org_id: Optional[str] = None):
    query = {"id": media_id, "is_deleted": False}
    if org_id:
        query["org_id"] = org_id
    media = await db.media.find_one(query, {"_id": 0})
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    try:
        data, content_type = get_object(media["storage_path"])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage read failed: {exc}")
    return Response(
        content=data,
        media_type=media.get("content_type", content_type),
        headers={"Cache-Control": "private, max-age=86400", "Accept-Ranges": "bytes"},
    )


@router.get("/{media_id}/file")
async def media_file(media_id: str, request: Request, auth: Optional[str] = Query(None)):
    """Serve media to authenticated dashboard users or paired devices."""
    device_token = request.headers.get("X-Device-Token") or request.query_params.get("device_token")
    if device_token:
        device = await db.devices.find_one({"device_token": device_token}, {"_id": 0})
        if not device:
            raise HTTPException(status_code=401, detail="Invalid device token")
        return await _serve(media_id, device["org_id"])
    if auth:
        user = await user_from_token(auth)
    else:
        user = await get_current_user(request)
    org_id = None if user["role"] == "super_admin" and not user.get("org_id") else user.get("org_id")
    return await _serve(media_id, org_id)
