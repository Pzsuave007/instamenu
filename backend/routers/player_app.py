"""Self-hosted distribution of the Fire TV player APK.

Super Admin uploads the APK once; every television then installs it from a short link
(`/api/apk`) typed into the Fire TV "Downloader" app. No GitHub, Drive or ADB needed.
"""
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse

from core.db import db
from core.deps import require_org_user, require_super_admin
from core.models import now_iso
from core.storage import APP_PREFIX, STORAGE_BACKEND, get_object, local_file, put_object

router = APIRouter(tags=["player-app"])

APK_KEY = "player_apk"
APK_CONTENT_TYPE = "application/vnd.android.package-archive"
MAX_APK_BYTES = 300 * 1024 * 1024


def _public_url() -> str:
    base = (os.environ.get("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    return f"{base}/api/apk"


@router.post("/admin/player-apk", status_code=201)
async def upload_player_apk(
    file: UploadFile = File(...),
    version: str = Form("1.0.0"),
    admin: dict = Depends(require_super_admin),
):
    filename = (file.filename or "").strip()
    if not filename.lower().endswith(".apk"):
        raise HTTPException(status_code=400, detail="Please choose the .apk file built for the player")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="That file is empty")
    if len(data) > MAX_APK_BYTES:
        raise HTTPException(status_code=413, detail="APK is larger than the 300 MB limit")
    path = f"{APP_PREFIX}/system/instamenu-player.apk"
    try:
        put_object(path, data, APK_CONTENT_TYPE)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {exc}")
    record = {
        "key": APK_KEY,
        "storage_path": path,
        "filename": filename,
        "version": version.strip() or "1.0.0",
        "size": len(data),
        "uploaded_at": now_iso(),
        "uploaded_by": admin["id"],
    }
    await db.system_settings.update_one({"key": APK_KEY}, {"$set": record}, upsert=True)
    return {**record, "download_url": _public_url()}


@router.get("/admin/player-apk")
async def player_apk_info(admin: dict = Depends(require_super_admin)):
    record = await db.system_settings.find_one({"key": APK_KEY}, {"_id": 0})
    if not record:
        return {"available": False, "download_url": _public_url()}
    return {**record, "available": True, "download_url": _public_url()}


@router.delete("/admin/player-apk")
async def delete_player_apk(admin: dict = Depends(require_super_admin)):
    await db.system_settings.delete_one({"key": APK_KEY})
    return {"ok": True}


@router.get("/player-app")
async def player_app_for_restaurant(user: dict = Depends(require_org_user)):
    """What a restaurant needs to install the app on a new television."""
    record = await db.system_settings.find_one({"key": APK_KEY}, {"_id": 0, "version": 1, "uploaded_at": 1})
    return {
        "available": bool(record),
        "version": (record or {}).get("version"),
        "download_url": _public_url(),
    }


@router.get("/apk")
async def download_player_apk():
    """Public installer endpoint: this is the URL typed into the Downloader app on the TV."""
    record = await db.system_settings.find_one({"key": APK_KEY}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="No player app has been uploaded yet")
    headers = {
        "Content-Disposition": 'attachment; filename="instamenu-player.apk"',
        "Cache-Control": "no-cache",
    }
    # Local (VPS self-hosted): stream from disk so the whole APK never sits in RAM.
    if STORAGE_BACKEND == "local":
        try:
            path, _size, _ctype = local_file(record["storage_path"])
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Storage read failed: {exc}")
        return FileResponse(path, media_type=APK_CONTENT_TYPE, headers=headers)
    try:
        data, _ = get_object(record["storage_path"])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage read failed: {exc}")
    headers["Content-Length"] = str(len(data))
    return Response(content=data, media_type=APK_CONTENT_TYPE, headers=headers)
