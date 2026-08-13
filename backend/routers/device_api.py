"""Display-device REST API (Fire TV player). Token-authenticated, no user credentials.

Flow:
  1. POST /api/device/pair/request  -> returns pairing code (shown on TV)
  2. GET  /api/device/pair/status   -> polls until dashboard claims the code, returns device_token
  3. GET  /api/device/config        -> screen config + playlist version
  4. GET  /api/device/playlist      -> full playlist manifest with media URLs + checksums
  5. POST /api/device/heartbeat     -> liveness + reported playlist version
"""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from core.db import db
from core.deps import get_device
from core.models import HeartbeatIn, PairRequestIn, now_iso
from core.security import new_pairing_code
from routers.screens import hydrate_playlist, resolve_active_playlist

router = APIRouter(prefix="/device", tags=["device-api"])
CODE_TTL_MINUTES = 15
RATE_WINDOW_SECONDS = 20


@router.post("/pair/request")
async def pair_request(payload: PairRequestIn, request: Request):
    """Called on first TV launch. Returns a short-lived pairing code."""
    existing = await db.pairing_codes.find_one(
        {"hardware_id": payload.hardware_id, "claimed": False}, {"_id": 0}
    )
    if existing and datetime.fromisoformat(existing["expires_at"]) > datetime.now(timezone.utc):
        return {
            "code": existing["code"],
            "expires_at": existing["expires_at"],
            "poll_interval_seconds": 5,
        }
    device = await db.devices.find_one({"hardware_id": payload.hardware_id}, {"_id": 0})
    if device:
        return {
            "already_paired": True,
            "device_token": device["device_token"],
            "device_id": device["id"],
        }
    for _ in range(10):
        code = new_pairing_code()
        if not await db.pairing_codes.find_one({"code": code}):
            break
    else:
        raise HTTPException(status_code=503, detail="Could not allocate a pairing code, try again")
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)
    doc = {
        "code": code,
        "hardware_id": payload.hardware_id,
        "app_version": payload.app_version,
        "model": payload.model,
        "claimed": False,
        "created_at": now_iso(),
        "expires_at": expires_at.isoformat(),
    }
    await db.pairing_codes.insert_one(dict(doc))
    return {"code": code, "expires_at": doc["expires_at"], "poll_interval_seconds": 5}


@router.get("/pair/status")
async def pair_status(hardware_id: str = Query(...), code: str = Query(...)):
    """TV polls this; once the dashboard pairs the code, the persistent token is returned."""
    doc = await db.pairing_codes.find_one({"code": code, "hardware_id": hardware_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Unknown pairing code")
    if not doc.get("claimed"):
        return {"paired": False}
    return {"paired": True, "device_token": doc["device_token"], "device_id": doc["device_id"]}


def _media_url(request: Request, media_id: str, token: str) -> str:
    """Media URLs must be reachable from outside the cluster (Fire TV devices)."""
    base = (os.environ.get("PUBLIC_BASE_URL") or "").strip().rstrip("/") or str(request.base_url).rstrip("/")
    return f"{base}/api/media/{media_id}/file?device_token={token}"


async def _screen_for(device: dict) -> dict:
    if not device.get("screen_id"):
        raise HTTPException(status_code=409, detail="This device is not assigned to a screen yet")
    screen = await db.screens.find_one({"id": device["screen_id"], "org_id": device["org_id"]}, {"_id": 0})
    if not screen:
        raise HTTPException(status_code=404, detail="Assigned screen no longer exists")
    return screen


@router.get("/config")
async def device_config(device: dict = Depends(get_device)):
    """Lightweight poll: everything the player needs to decide whether to refetch media."""
    screen = await _screen_for(device)
    playlist = await resolve_active_playlist(screen)
    org = await db.organizations.find_one({"id": device["org_id"]}, {"_id": 0, "name": 1, "status": 1})
    return {
        "device": {"id": device["id"], "name": device["name"]},
        "organization": {"name": org.get("name") if org else None, "active": (org or {}).get("status") == "active"},
        "screen": {
            "id": screen["id"],
            "name": screen["name"],
            "orientation": screen.get("orientation", "landscape"),
            "resolution": screen.get("resolution", "1920x1080"),
            "image_fit": screen.get("image_fit", "fit"),
            "default_image_duration": screen.get("default_image_duration", 10),
        },
        "playlist_id": playlist["id"] if playlist else None,
        "playlist_version": playlist.get("version") if playlist else None,
        "heartbeat_interval_seconds": 60,
        "config_poll_interval_seconds": 60,
        "server_time": now_iso(),
    }


@router.get("/playlist")
async def device_playlist(request: Request, device: dict = Depends(get_device)):
    """Full manifest. The player downloads these assets before switching playlists."""
    screen = await _screen_for(device)
    playlist = await resolve_active_playlist(screen)
    if not playlist:
        return {"playlist_id": None, "version": 0, "items": []}
    hydrated = await hydrate_playlist(device["org_id"], playlist)
    token = device["device_token"]
    items = []
    for item in hydrated["items"]:
        media = item["media"]
        items.append(
            {
                "id": media["id"],
                "position": item["position"],
                "type": media["kind"],
                "filename": media["name"],
                "url": _media_url(request, media["id"], token),
                "content_type": media["content_type"],
                "size": media.get("size"),
                "width": media.get("width"),
                "height": media.get("height"),
                "duration": item["duration"] if media["kind"] == "image" else None,
                "cache_key": f"{media['id']}:{media.get('size')}",
            }
        )
    return {
        "playlist_id": hydrated["id"],
        "name": hydrated["name"],
        "version": hydrated.get("version", 1),
        "image_fit": screen.get("image_fit", "fit"),
        "default_image_duration": screen.get("default_image_duration", 10),
        "items": items,
    }


@router.post("/heartbeat")
async def heartbeat(payload: HeartbeatIn, device: dict = Depends(get_device)):
    last = device.get("last_seen")
    too_soon = bool(last) and (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() < 1
    updates = {"last_seen": now_iso(), "status": payload.status or "playing"}
    if payload.app_version:
        updates["app_version"] = payload.app_version
    if payload.playlist_version is not None:
        updates["playlist_version"] = payload.playlist_version
    if payload.playlist_id is not None:
        updates["reported_playlist_id"] = payload.playlist_id
    if payload.current_item:
        updates["current_item"] = payload.current_item
    await db.devices.update_one({"id": device["id"]}, {"$set": updates})
    if not too_soon:  # avoid log spam on player restarts, but never fail the call
        await db.device_heartbeats.insert_one(
            {
                "device_id": device["id"],
                "org_id": device["org_id"],
                "at": updates["last_seen"],
                "status": updates["status"],
            }
        )
    screen = await db.screens.find_one({"id": device.get("screen_id")}, {"_id": 0})
    playlist = await resolve_active_playlist(screen) if screen else None
    server_version = playlist.get("version") if playlist else None
    server_playlist_id = playlist["id"] if playlist else None
    # A device moved to another screen must reload even when both playlists share a version number.
    playlist_changed = payload.playlist_id is not None and payload.playlist_id != server_playlist_id
    version_changed = payload.playlist_version != server_version
    return {
        "ok": True,
        "screen_id": screen["id"] if screen else None,
        "playlist_id": server_playlist_id,
        "playlist_version": server_version,
        "update_available": playlist_changed or version_changed,
        "next_heartbeat_seconds": 60,
    }
