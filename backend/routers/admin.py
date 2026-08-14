"""Super admin: organizations, users, devices overview, subscriptions, impersonation."""
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response

from core.db import db
from core.deps import ROLE_SUPER_ADMIN, audit, require_super_admin
from core.models import OrgIn, OrgUpdate, UserIn, UserUpdate, new_id, now_iso
from core.security import JWT_ALGORITHM, ACCESS_TTL_MIN, _secret, create_refresh_token, hash_password

router = APIRouter(prefix="/admin", tags=["admin"])
ONLINE_WINDOW = 120  # seconds


def _is_online(last_seen: Optional[str]) -> bool:
    if not last_seen:
        return False
    return datetime.now(timezone.utc) - datetime.fromisoformat(last_seen) < timedelta(seconds=ONLINE_WINDOW)


@router.get("/overview")
async def overview(_: dict = Depends(require_super_admin)):
    devices = await db.devices.find({}, {"_id": 0}).to_list(5000)
    media = await db.media.find({"is_deleted": False}, {"_id": 0, "size": 1}).to_list(20000)
    return {
        "organizations": await db.organizations.count_documents({}),
        "active_organizations": await db.organizations.count_documents({"status": "active"}),
        "locations": await db.locations.count_documents({}),
        "screens": await db.screens.count_documents({}),
        "devices": len(devices),
        "devices_online": sum(1 for d in devices if _is_online(d.get("last_seen"))),
        "users": await db.users.count_documents({}),
        "media_files": len(media),
        "storage_bytes": sum(m.get("size", 0) for m in media),
    }


@router.get("/organizations")
async def list_orgs(_: dict = Depends(require_super_admin)):
    orgs = await db.organizations.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    out = []
    for org in orgs:
        devices = await db.devices.find({"org_id": org["id"]}, {"_id": 0, "last_seen": 1}).to_list(1000)
        media = await db.media.find({"org_id": org["id"], "is_deleted": False}, {"_id": 0, "size": 1}).to_list(20000)
        out.append(
            {
                **org,
                "locations": await db.locations.count_documents({"org_id": org["id"]}),
                "screens": await db.screens.count_documents({"org_id": org["id"]}),
                "users": await db.users.count_documents({"org_id": org["id"]}),
                "devices": len(devices),
                "devices_online": sum(1 for d in devices if _is_online(d.get("last_seen"))),
                "media_files": len(media),
                "storage_bytes": sum(m.get("size", 0) for m in media),
            }
        )
    return out


@router.post("/organizations", status_code=201)
async def create_org(payload: OrgIn, admin: dict = Depends(require_super_admin)):
    org = {
        "id": new_id(),
        "name": payload.name.strip(),
        "slug": payload.name.lower().strip().replace(" ", "-"),
        "contact_email": payload.contact_email,
        "phone": payload.phone,
        "plan": payload.plan,
        "status": "active",
        "subscription": {"plan": payload.plan, "status": "trialing", "screen_limit": 10, "renews_at": None},
        "created_at": now_iso(),
    }
    await db.organizations.insert_one(dict(org))
    await audit(org["id"], admin["id"], "org.create", "organization", org["id"])
    return org


@router.patch("/organizations/{org_id}")
async def update_org(org_id: str, payload: OrgUpdate, admin: dict = Depends(require_super_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.organizations.update_one({"id": org_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    await audit(org_id, admin["id"], "org.update", "organization", org_id, updates)
    return await db.organizations.find_one({"id": org_id}, {"_id": 0})


@router.delete("/organizations/{org_id}")
async def delete_org(org_id: str, admin: dict = Depends(require_super_admin)):
    for coll in (db.locations, db.screens, db.playlists, db.devices, db.media, db.schedules, db.users):
        await coll.delete_many({"org_id": org_id})
    res = await db.organizations.delete_one({"id": org_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    await audit(org_id, admin["id"], "org.delete", "organization", org_id)
    return {"ok": True}


@router.get("/users")
async def list_users(org_id: Optional[str] = None, _: dict = Depends(require_super_admin)):
    query = {"org_id": org_id} if org_id else {}
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)
    orgs = {o["id"]: o["name"] for o in await db.organizations.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    return [{**u, "organization_name": orgs.get(u.get("org_id"))} for u in users]


@router.post("/users", status_code=201)
async def create_user(payload: UserIn, admin: dict = Depends(require_super_admin)):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    if payload.role != ROLE_SUPER_ADMIN and not payload.org_id:
        raise HTTPException(status_code=400, detail="org_id is required for restaurant users")
    user = {
        "id": new_id(),
        "email": email,
        "name": payload.name.strip(),
        "role": payload.role,
        "org_id": payload.org_id if payload.role != ROLE_SUPER_ADMIN else None,
        "is_active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one({**user, "password_hash": hash_password(payload.password)})
    await audit(user["org_id"], admin["id"], "user.create", "user", user["id"])
    return user


@router.patch("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, admin: dict = Depends(require_super_admin)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.users.update_one({"id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, payload: dict, admin: dict = Depends(require_super_admin)):
    password = (payload or {}).get("password") or ""
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    res = await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(password)}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await audit(None, admin["id"], "user.reset_password", "user", user_id)
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_super_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@router.post("/impersonate/{org_id}")
async def impersonate(org_id: str, response: Response, admin: dict = Depends(require_super_admin)):
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    payload = {
        "sub": admin["id"],
        "email": admin["email"],
        "role": ROLE_SUPER_ADMIN,
        "act_org_id": org_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
    }
    token = jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie(
        "refresh_token", create_refresh_token(admin["id"]), httponly=True, secure=True, samesite="none", path="/"
    )
    await audit(org_id, admin["id"], "org.impersonate", "organization", org_id)
    return {"token": token, "organization": org}


@router.get("/devices")
async def all_devices(_: dict = Depends(require_super_admin)):
    devices = await db.devices.find({}, {"_id": 0, "device_token": 0}).to_list(5000)
    orgs = {o["id"]: o["name"] for o in await db.organizations.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    screens = {s["id"]: s["name"] for s in await db.screens.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    return [
        {
            **d,
            "organization_name": orgs.get(d.get("org_id")),
            "screen_name": screens.get(d.get("screen_id")),
            "online": _is_online(d.get("last_seen")),
        }
        for d in devices
    ]


@router.get("/audit-logs")
async def audit_logs(_: dict = Depends(require_super_admin)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
