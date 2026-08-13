"""Auth dependencies: user auth, role guards, tenant scoping, device auth."""
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException, Request

from .db import db
from .security import decode_token

ROLE_SUPER_ADMIN = "super_admin"
ROLE_OWNER = "owner"
ROLE_MANAGER = "manager"


def _bearer(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    return token


async def get_current_user(request: Request) -> dict:
    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or user.get("is_active") is False:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    # Support-impersonation: super admin acting inside an org
    if payload.get("act_org_id"):
        user["org_id"] = payload["act_org_id"]
        user["impersonating"] = True
    return user


async def user_from_token(token: str) -> dict:
    """Resolve a user from a raw access token (used for query-param media auth)."""
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or user.get("is_active") is False:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    if payload.get("act_org_id"):
        user["org_id"] = payload["act_org_id"]
        user["impersonating"] = True
    return user


async def require_super_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user["role"] != ROLE_SUPER_ADMIN or user.get("impersonating"):
        raise HTTPException(status_code=403, detail="Super admin only")
    return user


async def require_org_user(request: Request) -> dict:
    """Any authenticated user scoped to an organization."""
    user = await get_current_user(request)
    if not user.get("org_id"):
        raise HTTPException(status_code=403, detail="No organization context")
    org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.get("status") == "disabled" and user["role"] != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Organization is disabled")
    return user


async def get_device(request: Request) -> dict:
    token = request.headers.get("X-Device-Token") or ""
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Device "):
            token = header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Missing device token")
    device = await db.devices.find_one({"device_token": token}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=401, detail="Invalid device token")
    return device


async def audit(org_id, actor_id, action, entity, entity_id=None, meta=None):
    await db.audit_logs.insert_one(
        {
            "org_id": org_id,
            "actor_id": actor_id,
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "meta": meta or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
