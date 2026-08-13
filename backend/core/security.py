"""Password hashing, JWT tokens, brute-force tracking."""
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 12
REFRESH_TTL_DAYS = 7
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])


def new_device_token() -> str:
    return secrets.token_urlsafe(48)


def new_pairing_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(6))


async def check_lockout(db, identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec:
        return None
    if rec.get("count", 0) >= MAX_ATTEMPTS:
        last = datetime.fromisoformat(rec["last_at"])
        if datetime.now(timezone.utc) - last < timedelta(minutes=LOCKOUT_MINUTES):
            return LOCKOUT_MINUTES
        await db.login_attempts.delete_one({"identifier": identifier})
    return None


async def record_failure(db, identifier: str):
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$inc": {"count": 1}, "$set": {"last_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


async def clear_failures(db, identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})
