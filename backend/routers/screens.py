"""Screens, playlists (with versioning), schedules, and resolved playback config."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.deps import audit, require_org_user
from core.models import (
    PlaylistIn,
    PlaylistUpdate,
    ScheduleIn,
    ScreenIn,
    ScreenUpdate,
    new_id,
    now_iso,
)

router = APIRouter(tags=["screens"])
ONLINE_WINDOW = 120


def is_online(last_seen):
    if not last_seen:
        return False
    return datetime.now(timezone.utc) - datetime.fromisoformat(last_seen) < timedelta(seconds=ONLINE_WINDOW)


async def hydrate_playlist(org_id: str, playlist: dict) -> dict:
    """Attach full media records to playlist items, dropping deleted media."""
    media_ids = [i["media_id"] for i in playlist.get("items", [])]
    media = await db.media.find({"org_id": org_id, "id": {"$in": media_ids}}, {"_id": 0}).to_list(2000)
    by_id = {m["id"]: m for m in media if not m.get("is_deleted")}
    items = []
    total = 0
    for idx, item in enumerate(playlist.get("items", [])):
        m = by_id.get(item["media_id"])
        if not m:
            continue
        duration = item.get("duration", 10)
        total += duration
        items.append({**item, "position": idx, "media": m, "duration": duration})
    return {**playlist, "items": items, "item_count": len(items), "total_duration": total}


async def resolve_active_playlist(screen: dict) -> dict | None:
    """Schedule-aware playlist resolution; falls back to the screen default playlist."""
    now = datetime.now(timezone.utc)
    schedules = await db.schedules.find(
        {"screen_id": screen["id"], "is_active": True}, {"_id": 0}
    ).sort("priority", -1).to_list(100)
    minutes_now = now.hour * 60 + now.minute
    for sch in schedules:
        dow = now.weekday()
        if sch.get("days_of_week") and dow not in sch["days_of_week"]:
            continue
        start = sch.get("start_time", "00:00").split(":")
        end = sch.get("end_time", "23:59").split(":")
        start_m = int(start[0]) * 60 + int(start[1])
        end_m = int(end[0]) * 60 + int(end[1])
        in_window = start_m <= minutes_now <= end_m if start_m <= end_m else (minutes_now >= start_m or minutes_now <= end_m)
        if in_window:
            pl = await db.playlists.find_one({"id": sch["playlist_id"]}, {"_id": 0})
            if pl:
                return pl
    if screen.get("playlist_id"):
        return await db.playlists.find_one({"id": screen["playlist_id"]}, {"_id": 0})
    return None


# ---------------- screens ----------------
@router.get("/screens")
async def list_screens(user: dict = Depends(require_org_user)):
    org_id = user["org_id"]
    screens = await db.screens.find({"org_id": org_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    locations = {l["id"]: l["name"] for l in await db.locations.find({"org_id": org_id}, {"_id": 0}).to_list(500)}
    playlists = {p["id"]: p for p in await db.playlists.find({"org_id": org_id}, {"_id": 0}).to_list(500)}
    devices = await db.devices.find({"org_id": org_id}, {"_id": 0, "device_token": 0}).to_list(500)
    dev_by_screen = {d["screen_id"]: d for d in devices if d.get("screen_id")}
    out = []
    for s in screens:
        dev = dev_by_screen.get(s["id"])
        pl = playlists.get(s.get("playlist_id"))
        out.append(
            {
                **s,
                "location_name": locations.get(s.get("location_id")),
                "playlist_name": pl["name"] if pl else None,
                "playlist_version": pl.get("version") if pl else None,
                "device": dev,
                "online": is_online(dev.get("last_seen")) if dev else False,
                "last_seen": dev.get("last_seen") if dev else None,
            }
        )
    return out


@router.post("/screens", status_code=201)
async def create_screen(payload: ScreenIn, user: dict = Depends(require_org_user)):
    loc = await db.locations.find_one({"id": payload.location_id, "org_id": user["org_id"]})
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    screen = {"id": new_id(), "org_id": user["org_id"], **payload.model_dump(), "created_at": now_iso()}
    await db.screens.insert_one(dict(screen))
    await audit(user["org_id"], user["id"], "screen.create", "screen", screen["id"])
    return screen


@router.get("/screens/{screen_id}")
async def get_screen(screen_id: str, user: dict = Depends(require_org_user)):
    screen = await db.screens.find_one({"id": screen_id, "org_id": user["org_id"]}, {"_id": 0})
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    playlist = await resolve_active_playlist(screen)
    device = await db.devices.find_one({"screen_id": screen_id}, {"_id": 0, "device_token": 0})
    location = await db.locations.find_one({"id": screen.get("location_id")}, {"_id": 0})
    return {
        **screen,
        "location_name": location["name"] if location else None,
        "playlist": await hydrate_playlist(user["org_id"], playlist) if playlist else None,
        "device": device,
        "online": is_online(device.get("last_seen")) if device else False,
        "last_seen": device.get("last_seen") if device else None,
    }


@router.patch("/screens/{screen_id}")
async def update_screen(screen_id: str, payload: ScreenUpdate, user: dict = Depends(require_org_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "playlist_id" in payload.model_dump(exclude_unset=True):
        updates["playlist_id"] = payload.playlist_id
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = now_iso()
    res = await db.screens.update_one({"id": screen_id, "org_id": user["org_id"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Screen not found")
    await audit(user["org_id"], user["id"], "screen.update", "screen", screen_id, updates)
    return await db.screens.find_one({"id": screen_id}, {"_id": 0})


@router.delete("/screens/{screen_id}")
async def delete_screen(screen_id: str, user: dict = Depends(require_org_user)):
    res = await db.screens.delete_one({"id": screen_id, "org_id": user["org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Screen not found")
    await db.devices.update_many({"screen_id": screen_id}, {"$set": {"screen_id": None}})
    await db.schedules.delete_many({"screen_id": screen_id})
    return {"ok": True}


# ---------------- playlists ----------------
@router.get("/playlists")
async def list_playlists(user: dict = Depends(require_org_user)):
    org_id = user["org_id"]
    playlists = await db.playlists.find({"org_id": org_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    locations = {l["id"]: l["name"] for l in await db.locations.find({"org_id": org_id}, {"_id": 0}).to_list(500)}
    out = []
    for pl in playlists:
        hydrated = await hydrate_playlist(org_id, pl)
        assigned = await db.screens.count_documents({"playlist_id": pl["id"]})
        out.append(
            {
                **hydrated,
                "location_name": locations.get(pl.get("location_id")),
                "assigned_screens": assigned,
                "thumbnail_media_id": hydrated["items"][0]["media_id"] if hydrated["items"] else None,
            }
        )
    return out


@router.post("/playlists", status_code=201)
async def create_playlist(payload: PlaylistIn, user: dict = Depends(require_org_user)):
    doc = {
        "id": new_id(),
        "org_id": user["org_id"],
        "name": payload.name.strip(),
        "location_id": payload.location_id,
        "items": [i.model_dump() for i in payload.items],
        "version": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.playlists.insert_one(dict(doc))
    await audit(user["org_id"], user["id"], "playlist.create", "playlist", doc["id"])
    return await hydrate_playlist(user["org_id"], doc)


@router.get("/playlists/{playlist_id}")
async def get_playlist(playlist_id: str, user: dict = Depends(require_org_user)):
    pl = await db.playlists.find_one({"id": playlist_id, "org_id": user["org_id"]}, {"_id": 0})
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return await hydrate_playlist(user["org_id"], pl)


@router.patch("/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, payload: PlaylistUpdate, user: dict = Depends(require_org_user)):
    pl = await db.playlists.find_one({"id": playlist_id, "org_id": user["org_id"]}, {"_id": 0})
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    updates = {}
    if payload.name:
        updates["name"] = payload.name.strip()
    if payload.location_id is not None:
        updates["location_id"] = payload.location_id
    content_changed = payload.items is not None
    if content_changed:
        media_ids = [i.media_id for i in payload.items]
        found = await db.media.find(
            {"org_id": user["org_id"], "id": {"$in": media_ids}, "is_deleted": False}, {"_id": 0, "id": 1}
        ).to_list(2000)
        valid = {m["id"] for m in found}
        missing = [m for m in media_ids if m not in valid]
        if missing:
            raise HTTPException(status_code=400, detail="One or more media files no longer exist")
        updates["items"] = [i.model_dump() for i in payload.items]
    updates["updated_at"] = now_iso()
    ops = {"$set": updates}
    if content_changed:
        ops["$inc"] = {"version": 1}  # version bump drives Fire TV auto-update
    await db.playlists.update_one({"id": playlist_id}, ops)
    fresh = await db.playlists.find_one({"id": playlist_id}, {"_id": 0})
    return await hydrate_playlist(user["org_id"], fresh)


@router.post("/playlists/{playlist_id}/duplicate", status_code=201)
async def duplicate_playlist(playlist_id: str, user: dict = Depends(require_org_user)):
    pl = await db.playlists.find_one({"id": playlist_id, "org_id": user["org_id"]}, {"_id": 0})
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    copy = {
        **pl,
        "id": new_id(),
        "name": f"{pl['name']} (Copy)",
        "version": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.playlists.insert_one(dict(copy))
    return await hydrate_playlist(user["org_id"], copy)


@router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, force: bool = False, user: dict = Depends(require_org_user)):
    assigned = await db.screens.find({"playlist_id": playlist_id}, {"_id": 0, "name": 1}).to_list(100)
    if assigned and not force:
        names = ", ".join(s["name"] for s in assigned)
        raise HTTPException(status_code=409, detail=f"This playlist is assigned to: {names}. Confirm to remove anyway.")
    res = await db.playlists.delete_one({"id": playlist_id, "org_id": user["org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playlist not found")
    await db.screens.update_many({"playlist_id": playlist_id}, {"$set": {"playlist_id": None}})
    await db.schedules.delete_many({"playlist_id": playlist_id})
    return {"ok": True}


# ---------------- schedules ----------------
@router.get("/schedules")
async def list_schedules(screen_id: str | None = None, user: dict = Depends(require_org_user)):
    query = {"org_id": user["org_id"]}
    if screen_id:
        query["screen_id"] = screen_id
    return await db.schedules.find(query, {"_id": 0}).sort("priority", -1).to_list(500)


@router.post("/schedules", status_code=201)
async def create_schedule(payload: ScheduleIn, user: dict = Depends(require_org_user)):
    screen = await db.screens.find_one({"id": payload.screen_id, "org_id": user["org_id"]})
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    doc = {"id": new_id(), "org_id": user["org_id"], **payload.model_dump(), "created_at": now_iso()}
    await db.schedules.insert_one(dict(doc))
    return doc


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, user: dict = Depends(require_org_user)):
    res = await db.schedules.delete_one({"id": schedule_id, "org_id": user["org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"ok": True}
