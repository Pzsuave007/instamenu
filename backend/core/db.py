"""Mongo connection and index setup."""
import os

from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("org_id")
    await db.organizations.create_index("slug")
    await db.locations.create_index("org_id")
    await db.screens.create_index([("org_id", 1), ("location_id", 1)])
    await db.media.create_index("org_id")
    await db.playlists.create_index("org_id")
    await db.devices.create_index("org_id")
    await db.devices.create_index("device_token", unique=True, sparse=True)
    await db.pairing_codes.create_index("code", unique=True)
    await db.pairing_codes.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.audit_logs.create_index("org_id")
