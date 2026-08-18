"""Tenant-scoped organization data: profile, locations, users, dashboard stats."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.deps import ROLE_SUPER_ADMIN, audit, require_org_user
from core.models import LocationIn, UserIn, new_id, now_iso
from core.security import hash_password

router = APIRouter(tags=["organization"])
ONLINE_WINDOW = 120


def is_online(last_seen):
    if not last_seen:
        return False
    return datetime.now(timezone.utc) - datetime.fromisoformat(last_seen) < timedelta(seconds=ONLINE_WINDOW)


@router.get("/dashboard")
async def dashboard(user: dict = Depends(require_org_user)):
    org_id = user["org_id"]
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    screens = await db.screens.find({"org_id": org_id}, {"_id": 0}).to_list(500)
    devices = await db.devices.find({"org_id": org_id}, {"_id": 0, "device_token": 0}).to_list(500)
    playlists = await db.playlists.find({"org_id": org_id}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    media = await db.media.find({"org_id": org_id, "is_deleted": False}, {"_id": 0, "size": 1}).to_list(20000)
    locations = await db.locations.find({"org_id": org_id}, {"_id": 0}).to_list(200)
    loc_names = {l["id"]: l["name"] for l in locations}
    pl_names = {p["id"]: p["name"] for p in playlists}
    dev_by_screen = {d["screen_id"]: d for d in devices if d.get("screen_id")}
    screen_rows = []
    for s in screens:
        dev = dev_by_screen.get(s["id"])
        pl = await db.playlists.find_one({"id": s.get("playlist_id")}, {"_id": 0, "items": 1, "name": 1}) if s.get("playlist_id") else None
        pl_items = (pl.get("items") if pl else None) or []
        item_media_ids = [i.get("media_id") for i in pl_items if i.get("media_id")]
        kinds = {}
        if item_media_ids:
            async for m in db.media.find({"id": {"$in": item_media_ids}}, {"_id": 0, "id": 1, "kind": 1}):
                kinds[m["id"]] = m.get("kind")
        preview_items = [
            {"media_id": i["media_id"], "kind": kinds.get(i["media_id"]), "duration": i.get("duration", 10)}
            for i in pl_items
            if i.get("media_id") and kinds.get(i["media_id"]) in ("video", "image")
        ]
        thumb = pl_items[0].get("media_id") if pl_items else None
        screen_rows.append(
            {
                **s,
                "location_name": loc_names.get(s.get("location_id")),
                "playlist_name": pl_names.get(s.get("playlist_id")),
                "item_count": len(pl_items),
                "thumbnail_media_id": thumb,
                "thumbnail_kind": kinds.get(thumb),
                "preview_items": preview_items,
                "device_name": dev["name"] if dev else None,
                "last_seen": dev.get("last_seen") if dev else None,
                "online": is_online(dev.get("last_seen")) if dev else False,
            }
        )
    return {
        "organization": org,
        "stats": {
            "locations": len(locations),
            "screens": len(screens),
            "devices": len(devices),
            "devices_online": sum(1 for d in devices if is_online(d.get("last_seen"))),
            "playlists": len(playlists),
            "media_files": len(media),
            "storage_bytes": sum(m.get("size", 0) for m in media),
        },
        "screens": screen_rows,
    }


@router.get("/organization")
async def get_org(user: dict = Depends(require_org_user)):
    return await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})


@router.patch("/organization")
async def update_org(payload: dict, user: dict = Depends(require_org_user)):
    allowed = {k: v for k, v in (payload or {}).items() if k in {"name", "contact_email", "phone"} and v is not None}
    if not allowed:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.organizations.update_one({"id": user["org_id"]}, {"$set": allowed})
    return await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})


# ---------- locations ----------
@router.get("/locations")
async def list_locations(user: dict = Depends(require_org_user)):
    locations = await db.locations.find({"org_id": user["org_id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    for loc in locations:
        loc["screens"] = await db.screens.count_documents({"location_id": loc["id"]})
        loc["devices"] = await db.devices.count_documents({"location_id": loc["id"]})
    return locations


@router.post("/locations", status_code=201)
async def create_location(payload: LocationIn, user: dict = Depends(require_org_user)):
    loc = {"id": new_id(), "org_id": user["org_id"], **payload.model_dump(), "created_at": now_iso()}
    await db.locations.insert_one(dict(loc))
    await audit(user["org_id"], user["id"], "location.create", "location", loc["id"])
    return {**loc, "screens": 0, "devices": 0}

@router.patch("/locations/{location_id}")
async def update_location(location_id: str, payload: LocationIn, user: dict = Depends(require_org_user)):
    res = await db.locations.update_one(
        {"id": location_id, "org_id": user["org_id"]}, {"$set": payload.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    return await db.locations.find_one({"id": location_id}, {"_id": 0})


@router.delete("/locations/{location_id}")
async def delete_location(location_id: str, user: dict = Depends(require_org_user)):
    if await db.screens.count_documents({"location_id": location_id}):
        raise HTTPException(status_code=409, detail="Remove the screens in this location first")
    res = await db.locations.delete_one({"id": location_id, "org_id": user["org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    return {"ok": True}


# ---------- team users ----------
@router.get("/team")
async def list_team(user: dict = Depends(require_org_user)):
    return await db.users.find({"org_id": user["org_id"]}, {"_id": 0, "password_hash": 0}).to_list(200)


@router.post("/team", status_code=201)
async def add_team_member(payload: UserIn, user: dict = Depends(require_org_user)):
    if user["role"] not in {"owner", ROLE_SUPER_ADMIN}:
        raise HTTPException(status_code=403, detail="Only owners can add team members")
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    member = {
        "id": new_id(),
        "email": email,
        "name": payload.name.strip(),
        "role": payload.role if payload.role in {"owner", "manager"} else "manager",
        "org_id": user["org_id"],
        "is_active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one({**member, "password_hash": hash_password(payload.password)})
    return member


@router.delete("/team/{user_id}")
async def remove_team_member(user_id: str, user: dict = Depends(require_org_user)):
    if user["role"] not in {"owner", ROLE_SUPER_ADMIN}:
        raise HTTPException(status_code=403, detail="Only owners can remove team members")
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")
    res = await db.users.delete_one({"id": user_id, "org_id": user["org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
