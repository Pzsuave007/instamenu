"""Dashboard-side device management: pairing confirmation, listing, reassignment."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.deps import audit, require_org_user
from core.models import DeviceUpdate, PairConfirmIn, new_id, now_iso
from core.security import new_device_token

router = APIRouter(prefix="/devices", tags=["devices"])
ONLINE_WINDOW = 120


def is_online(last_seen):
    if not last_seen:
        return False
    return datetime.now(timezone.utc) - datetime.fromisoformat(last_seen) < timedelta(seconds=ONLINE_WINDOW)


@router.get("")
async def list_devices(user: dict = Depends(require_org_user)):
    org_id = user["org_id"]
    devices = await db.devices.find({"org_id": org_id}, {"_id": 0, "device_token": 0}).sort("created_at", -1).to_list(500)
    screens = {s["id"]: s["name"] for s in await db.screens.find({"org_id": org_id}, {"_id": 0}).to_list(500)}
    locations = {l["id"]: l["name"] for l in await db.locations.find({"org_id": org_id}, {"_id": 0}).to_list(500)}
    return [
        {
            **d,
            "screen_name": screens.get(d.get("screen_id")),
            "location_name": locations.get(d.get("location_id")),
            "online": is_online(d.get("last_seen")),
        }
        for d in devices
    ]


@router.post("/pair", status_code=201)
async def confirm_pairing(payload: PairConfirmIn, user: dict = Depends(require_org_user)):
    """Restaurant user enters the code shown on the TV and assigns it to a screen."""
    code_doc = await db.pairing_codes.find_one({"code": payload.code.strip()}, {"_id": 0})
    if not code_doc:
        raise HTTPException(status_code=404, detail="That pairing code is not valid")
    if code_doc.get("claimed"):
        raise HTTPException(status_code=409, detail="That pairing code was already used")
    if datetime.fromisoformat(code_doc["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="That pairing code has expired. Restart the TV app for a new code.")
    screen = await db.screens.find_one({"id": payload.screen_id, "org_id": user["org_id"]}, {"_id": 0})
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    existing = await db.devices.find_one({"screen_id": payload.screen_id}, {"_id": 0})
    if existing:
        await db.devices.update_one({"id": existing["id"]}, {"$set": {"screen_id": None}})
    default_name = screen["name"] if "tv" in screen["name"].lower() else f"{screen['name']} TV"
    device = {
        "id": new_id(),
        "org_id": user["org_id"],
        "location_id": payload.location_id or screen.get("location_id"),
        "screen_id": payload.screen_id,
        "name": (payload.name or "").strip() or default_name,
        "hardware_id": code_doc.get("hardware_id"),
        "model": code_doc.get("model"),
        "app_version": code_doc.get("app_version"),
        "device_token": new_device_token(),
        "status": "paired",
        "last_seen": None,
        "playlist_version": None,
        "created_at": now_iso(),
    }
    await db.devices.insert_one(dict(device))
    await db.pairing_codes.update_one(
        {"code": code_doc["code"]},
        {"$set": {"claimed": True, "device_id": device["id"], "device_token": device["device_token"]}},
    )
    await audit(user["org_id"], user["id"], "device.pair", "device", device["id"])
    return {k: v for k, v in device.items() if k != "device_token"}


@router.patch("/{device_id}")
async def update_device(device_id: str, payload: DeviceUpdate, user: dict = Depends(require_org_user)):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if data.get("screen_id"):
        screen = await db.screens.find_one({"id": data["screen_id"], "org_id": user["org_id"]}, {"_id": 0})
        if not screen:
            raise HTTPException(status_code=404, detail="Screen not found")
        await db.devices.update_many(
            {"screen_id": data["screen_id"], "org_id": user["org_id"]}, {"$set": {"screen_id": None}}
        )
        data["location_id"] = screen.get("location_id")
    res = await db.devices.update_one({"id": device_id, "org_id": user["org_id"]}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return await db.devices.find_one({"id": device_id}, {"_id": 0, "device_token": 0})


@router.delete("/{device_id}")
async def unpair_device(device_id: str, user: dict = Depends(require_org_user)):
    res = await db.devices.delete_one({"id": device_id, "org_id": user["org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    await audit(user["org_id"], user["id"], "device.unpair", "device", device_id)
    return {"ok": True}
