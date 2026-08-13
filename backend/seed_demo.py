"""Seed a demo restaurant org, owner user, location, screens and a playlist.

Run:  cd /app/backend && python seed_demo.py
Idempotent: safe to re-run.
"""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from core.db import db  # noqa: E402
from core.models import new_id, now_iso  # noqa: E402
from core.security import hash_password  # noqa: E402


async def main():
    org = await db.organizations.find_one({"slug": "casa-lola-kitchen"}, {"_id": 0})
    if not org:
        org = {
            "id": new_id(),
            "name": "Casa Lola Kitchen",
            "slug": "casa-lola-kitchen",
            "contact_email": "owner@casalola.com",
            "phone": "+1 509 555 0134",
            "plan": "pro",
            "status": "active",
            "subscription": {"plan": "pro", "status": "active", "screen_limit": 25, "renews_at": None},
            "created_at": now_iso(),
        }
        await db.organizations.insert_one(dict(org))
        print("created org", org["name"])

    if not await db.users.find_one({"email": "owner@casalola.com"}):
        await db.users.insert_one(
            {
                "id": new_id(),
                "email": "owner@casalola.com",
                "name": "Lola Martinez",
                "role": "owner",
                "org_id": org["id"],
                "is_active": True,
                "password_hash": hash_password("Owner123!"),
                "created_at": now_iso(),
            }
        )
        print("created owner user owner@casalola.com / Owner123!")

    loc = await db.locations.find_one({"org_id": org["id"]}, {"_id": 0})
    if not loc:
        loc = {
            "id": new_id(),
            "org_id": org["id"],
            "name": "Downtown Spokane",
            "address": "212 W Main Ave",
            "city": "Spokane",
            "state": "WA",
            "timezone": "America/Los_Angeles",
            "created_at": now_iso(),
        }
        await db.locations.insert_one(dict(loc))

    if not await db.screens.count_documents({"org_id": org["id"]}):
        for name in ("Main Menu Left", "Main Menu Right", "Specials TV"):
            await db.screens.insert_one(
                {
                    "id": new_id(),
                    "org_id": org["id"],
                    "location_id": loc["id"],
                    "name": name,
                    "orientation": "landscape",
                    "resolution": "1920x1080",
                    "image_fit": "fill",
                    "default_image_duration": 10,
                    "playlist_id": None,
                    "created_at": now_iso(),
                }
            )
        print("created 3 screens")

    if not await db.playlists.count_documents({"org_id": org["id"]}):
        await db.playlists.insert_one(
            {
                "id": new_id(),
                "org_id": org["id"],
                "name": "Dinner Menu",
                "location_id": loc["id"],
                "items": [],
                "version": 1,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
        )
        print("created starter playlist")

    print("demo seed complete")


if __name__ == "__main__":
    asyncio.run(main())
