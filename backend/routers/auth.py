"""Auth: login, me, logout, refresh, password change."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from core.db import db
from core.deps import ROLE_SUPER_ADMIN, get_current_user
from core.models import LoginIn, PasswordIn
from core.security import (
    check_lockout,
    clear_failures,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    record_failure,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


async def _profile(user: dict) -> dict:
    org = None
    if user.get("org_id"):
        org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})
    return {**user, "organization": org}


@router.post("/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower().strip()
    ident = email  # keyed by email: the load balancer rotates client IPs
    locked = await check_lockout(db, ident)
    if locked:
        raise HTTPException(status_code=429, detail=f"Too many attempts. Try again in {locked} minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failure(db, ident)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="This account is disabled")
    await clear_failures(db, ident)
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_cookies(response, access, refresh)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": access, "user": await _profile(user)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return await _profile(user)


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["email"], user["role"])
    _set_cookies(response, access, token)
    return {"token": access}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.post("/change-password")
async def change_password(payload: PasswordIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(payload.password)}})
    return {"ok": True}


@router.post("/stop-impersonation")
async def stop_impersonation(request: Request, response: Response, user: dict = Depends(get_current_user)):
    if user["role"] != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Not permitted")
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    access = create_access_token(fresh["id"], fresh["email"], fresh["role"])
    _set_cookies(response, access, create_refresh_token(fresh["id"]))
    return {"token": access, "user": await _profile(fresh)}
