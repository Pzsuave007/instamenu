"""Screens, playlists (with versioning), schedules, and resolved playback config."""
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from core.db import db
from core.deps import audit, require_org_user
from core.models import (
    PlaylistIn,
    PlaylistUpdate,
    ScheduleIn,
    ScreenContentIn,
    ScreenIn,
    ScreenUpdate,
    new_id,
    now_iso,
)
from routers.media import save_upload_file

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


async def resolve_active_playlist(screen: dict) -> Optional[dict]:
    """Schedule-aware playlist resolution in the location's own timezone.

    Falls back to the screen's default playlist when no time slot matches.
    """
    location = await db.locations.find_one({"id": screen.get("location_id")}, {"_id": 0, "timezone": 1})
    try:
        tz = ZoneInfo((location or {}).get("timezone") or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    now = datetime.now(tz)
    minutes_now = now.hour * 60 + now.minute
    today = now.date().isoformat()
    schedules = await db.schedules.find(
        {"screen_id": screen["id"], "is_active": True}, {"_id": 0}
    ).sort("priority", -1).to_list(100)
    for sch in schedules:
        if sch.get("days_of_week") and now.weekday() not in sch["days_of_week"]:
            continue
        if sch.get("start_date") and today < sch["start_date"]:
            continue
        if sch.get("end_date") and today > sch["end_date"]:
            continue
        start = sch.get("start_time", "00:00").split(":")
        end = sch.get("end_time", "23:59").split(":")
        start_m = int(start[0]) * 60 + int(start[1])
        end_m = int(end[0]) * 60 + int(end[1])
        in_window = (
            start_m <= minutes_now <= end_m if start_m <= end_m else (minutes_now >= start_m or minutes_now <= end_m)
        )
        if in_window:
            pl = await db.playlists.find_one({"id": sch["playlist_id"], "org_id": screen["org_id"]}, {"_id": 0})
            if pl:
                return pl
    if screen.get("playlist_id"):
        return await db.playlists.find_one({"id": screen["playlist_id"]}, {"_id": 0})
    return None


async def ensure_default_location(org_id: str) -> dict:
    """Most restaurants have one address; never make them create it by hand."""
    loc = await db.locations.find_one({"org_id": org_id}, {"_id": 0})
    if loc:
        return loc
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
    loc = {
        "id": new_id(),
        "org_id": org_id,
        "name": (org or {}).get("name") or "Main Location",
        "address": None,
        "city": None,
        "state": None,
        "timezone": "America/Los_Angeles",
        "created_at": now_iso(),
    }
    await db.locations.insert_one(dict(loc))
    return loc


async def ensure_screen_playlist(screen: dict, user: dict) -> dict:
    """Every screen owns a playlist so users can just drop files onto the screen."""
    if screen.get("playlist_id"):
        pl = await db.playlists.find_one({"id": screen["playlist_id"], "org_id": user["org_id"]}, {"_id": 0})
        if pl:
            return pl
    pl = {
        "id": new_id(),
        "org_id": user["org_id"],
        "name": f"{screen['name']} content",
        "location_id": screen.get("location_id"),
        "items": [],
        "version": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.playlists.insert_one(dict(pl))
    await db.screens.update_one({"id": screen["id"]}, {"$set": {"playlist_id": pl["id"]}})
    return pl



async def normalize_items(org_id: str, items: list[dict]) -> list[dict]:
    """Videos always play their full length, so their stored duration is pinned to 0."""
    media = await db.media.find(
        {"org_id": org_id, "id": {"$in": [i["media_id"] for i in items]}}, {"_id": 0, "id": 1, "kind": 1}
    ).to_list(2000)
    kinds = {m["id"]: m["kind"] for m in media}
    return [
        {**i, "duration": 0 if kinds.get(i["media_id"]) == "video" else max(1, int(i.get("duration") or 10))}
        for i in items
    ]


# ---------------- screens ----------------
@router.get("/screens")
async def list_screens(user: dict = Depends(require_org_user)):
    org_id = user["org_id"]
    screens = await db.screens.find({"org_id": org_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    locations = {l["id"]: l["name"] for l in await db.locations.find({"org_id": org_id}, {"_id": 0}).to_list(500)}
    playlists = {p["id"]: p for p in await db.playlists.find({"org_id": org_id}, {"_id": 0}).to_list(500)}
    devices = await db.devices.find({"org_id": org_id}, {"_id": 0, "device_token": 0}).to_list(500)
    dev_by_screen = {d["screen_id"]: d for d in devices if d.get("screen_id")}
    thumb_ids = [
        (playlists.get(s.get("playlist_id")) or {}).get("items", [{}])[0].get("media_id")
        for s in screens
        if (playlists.get(s.get("playlist_id")) or {}).get("items")
    ]
    thumb_kinds = {
        m["id"]: m["kind"]
        for m in await db.media.find({"id": {"$in": thumb_ids}}, {"_id": 0, "id": 1, "kind": 1}).to_list(500)
    }
    out = []
    for s in screens:
        dev = dev_by_screen.get(s["id"])
        pl = playlists.get(s.get("playlist_id"))
        thumb = (pl.get("items") or [{}])[0].get("media_id") if pl and pl.get("items") else None
        out.append(
            {
                **s,
                "location_name": locations.get(s.get("location_id")),
                "playlist_name": pl["name"] if pl else None,
                "playlist_version": pl.get("version") if pl else None,
                "item_count": len(pl.get("items", [])) if pl else 0,
                "thumbnail_media_id": thumb,
                "thumbnail_kind": thumb_kinds.get(thumb),
                "device": dev,
                "online": is_online(dev.get("last_seen")) if dev else False,
                "last_seen": dev.get("last_seen") if dev else None,
            }
        )
    return out


@router.post("/screens", status_code=201)
async def create_screen(payload: ScreenIn, user: dict = Depends(require_org_user)):
    data = payload.model_dump()
    if data.get("location_id"):
        loc = await db.locations.find_one({"id": data["location_id"], "org_id": user["org_id"]})
        if not loc:
            raise HTTPException(status_code=404, detail="Location not found")
    else:
        data["location_id"] = (await ensure_default_location(user["org_id"]))["id"]
    screen = {"id": new_id(), "org_id": user["org_id"], **data, "created_at": now_iso()}
    await db.screens.insert_one(dict(screen))
    playlist = await ensure_screen_playlist(screen, user)
    screen["playlist_id"] = playlist["id"]
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
    rules = await db.schedules.find({"screen_id": screen_id, "org_id": user["org_id"]}, {"_id": 0}).sort("start_time", 1).to_list(100)
    names = {p["id"]: p["name"] for p in await db.playlists.find({"org_id": user["org_id"]}, {"_id": 0}).to_list(500)}
    return {
        **screen,
        "location_name": location["name"] if location else None,
        "timezone": (location or {}).get("timezone"),
        "playlist": await hydrate_playlist(user["org_id"], playlist) if playlist else None,
        "scheduled_now": bool(playlist and playlist["id"] != screen.get("playlist_id")),
        "schedules": [{**r, "playlist_name": names.get(r["playlist_id"])} for r in rules],
        "device": device,
        "online": is_online(device.get("last_seen")) if device else False,
        "last_seen": device.get("last_seen") if device else None,
    }


@router.post("/screens/{screen_id}/content", status_code=201)
async def add_screen_content(
    screen_id: str,
    files: List[UploadFile] = File(...),
    user: dict = Depends(require_org_user),
):
    """Upload files straight onto a screen: stores them and appends to that screen's loop."""
    screen = await db.screens.find_one({"id": screen_id, "org_id": user["org_id"]}, {"_id": 0})
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    playlist = await ensure_screen_playlist(screen, user)
    items = list(playlist.get("items", []))
    added, errors = 0, []
    for file in files:
        try:
            doc = await save_upload_file(file, user["org_id"], user["id"], screen.get("location_id"))
        except HTTPException as exc:
            errors.append(f"{file.filename}: {exc.detail}")
            continue
        items.append(
            {"media_id": doc["id"], "duration": 0 if doc["kind"] == "video" else screen.get("default_image_duration", 10)}
        )
        added += 1
    if added:
        await db.playlists.update_one(
            {"id": playlist["id"]}, {"$set": {"items": items, "updated_at": now_iso()}, "$inc": {"version": 1}}
        )
    fresh = await db.playlists.find_one({"id": playlist["id"]}, {"_id": 0})
    return {"added": added, "errors": errors, "playlist": await hydrate_playlist(user["org_id"], fresh)}


@router.post("/screens/{screen_id}/content/existing", status_code=201)
async def add_existing_media(screen_id: str, payload: dict, user: dict = Depends(require_org_user)):
    """Append media already in the library to a screen's loop (used by the Media Library)."""
    media_ids = (payload or {}).get("media_ids") or []
    if not media_ids:
        raise HTTPException(status_code=400, detail="Choose at least one file")
    screen = await db.screens.find_one({"id": screen_id, "org_id": user["org_id"]}, {"_id": 0})
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    found = await db.media.find(
        {"org_id": user["org_id"], "id": {"$in": media_ids}, "is_deleted": False}, {"_id": 0}
    ).to_list(200)
    if len(found) != len(set(media_ids)):
        raise HTTPException(status_code=404, detail="One or more files were not found")
    playlist = await ensure_screen_playlist(screen, user)
    by_id = {m["id"]: m for m in found}
    items = list(playlist.get("items", [])) + [
        {
            "media_id": mid,
            "duration": 0 if by_id[mid]["kind"] == "video" else screen.get("default_image_duration", 10),
        }
        for mid in media_ids
    ]
    await db.playlists.update_one(
        {"id": playlist["id"]}, {"$set": {"items": items, "updated_at": now_iso()}, "$inc": {"version": 1}}
    )
    fresh = await db.playlists.find_one({"id": playlist["id"]}, {"_id": 0})
    return {"screen_name": screen["name"], "added": len(media_ids), "playlist": await hydrate_playlist(user["org_id"], fresh)}


@router.put("/screens/{screen_id}/content")
async def set_screen_content(screen_id: str, payload: ScreenContentIn, user: dict = Depends(require_org_user)):
    """Reorder, retime or remove what a screen is playing, without touching playlist screens."""
    screen = await db.screens.find_one({"id": screen_id, "org_id": user["org_id"]}, {"_id": 0})
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    playlist = await ensure_screen_playlist(screen, user)
    items = await normalize_items(user["org_id"], [i.model_dump() for i in payload.items])
    await db.playlists.update_one(
        {"id": playlist["id"]},
        {"$set": {"items": items, "updated_at": now_iso()}, "$inc": {"version": 1}},
    )
    fresh = await db.playlists.find_one({"id": playlist["id"]}, {"_id": 0})
    return await hydrate_playlist(user["org_id"], fresh)


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
                "thumbnail_kind": hydrated["items"][0]["media"].get("kind") if hydrated["items"] else None,
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
        updates["items"] = await normalize_items(user["org_id"], [i.model_dump() for i in payload.items])
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
async def list_schedules(screen_id: Optional[str] = None, user: dict = Depends(require_org_user)):
    query = {"org_id": user["org_id"]}
    if screen_id:
        query["screen_id"] = screen_id
    rules = await db.schedules.find(query, {"_id": 0}).sort("start_time", 1).to_list(500)
    names = {p["id"]: p["name"] for p in await db.playlists.find({"org_id": user["org_id"]}, {"_id": 0}).to_list(500)}
    return [{**r, "playlist_name": names.get(r["playlist_id"])} for r in rules]


@router.post("/schedules", status_code=201)
async def create_schedule(payload: ScheduleIn, user: dict = Depends(require_org_user)):
    screen = await db.screens.find_one({"id": payload.screen_id, "org_id": user["org_id"]}, {"_id": 0})
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    playlist = await db.playlists.find_one({"id": payload.playlist_id, "org_id": user["org_id"]}, {"_id": 0})
    if not playlist:
        raise HTTPException(status_code=404, detail="Menu not found")
    if payload.start_time >= payload.end_time and payload.end_time != "00:00":
        pass  # overnight windows (e.g. 16:00 -> 02:00) are allowed
    doc = {"id": new_id(), "org_id": user["org_id"], **payload.model_dump(), "created_at": now_iso()}
    await db.schedules.insert_one(dict(doc))
    # Bump the screen so paired televisions re-check what they should be playing.
    if screen.get("playlist_id"):
        await db.playlists.update_one({"id": screen["playlist_id"]}, {"$inc": {"version": 1}})
    await audit(user["org_id"], user["id"], "schedule.create", "schedule", doc["id"])
    return {**doc, "playlist_name": playlist["name"]}


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, user: dict = Depends(require_org_user)):
    res = await db.schedules.delete_one({"id": schedule_id, "org_id": user["org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"ok": True}
