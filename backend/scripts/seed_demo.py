"""Seed a self-contained DEMO account for the Amazon Appstore reviewer.

Creates: org + owner user + location + 2 demo images + a playlist + a screen
(with the playlist assigned). Idempotent: re-running wipes and recreates the demo org.

Run on the production server with the backend venv:
    cd <repo>/backend && /opt/<user>/backend/venv/bin/python scripts/seed_demo.py
or simply:  bash deploy/seed_demo.sh
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

# ---- load backend/.env BEFORE importing core modules (they read env at import) ----
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))
for line in (BACKEND_DIR / ".env").read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)

from core.db import db  # noqa: E402
from core.security import hash_password  # noqa: E402
from core.storage import APP_PREFIX, init_storage, put_object  # noqa: E402

# ------------------------------- DEMO CONFIG -------------------------------
DEMO_EMAIL = "demo@instamenuapp.com"
DEMO_PASSWORD = "DemoReview2026"
DEMO_NAME = "InstaMenu Demo"
ORG_NAME = "InstaMenu Demo Restaurant"
LOCATION_NAME = "Demo Location"
SCREEN_NAME = "Demo Menu TV"

ASSET_DIR = REPO_DIR / "frontend" / "public" / "store-assets"
IMAGES = [
    ("Demo Menu Board", "screenshot-1-menu-1280x720.png"),
    ("Daily Special", "screenshot-2-promo-1280x720.png"),
]


def now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


async def main():
    init_storage()

    # --- idempotent: remove any previous demo org so we start clean ---
    existing = await db.users.find_one({"email": DEMO_EMAIL})
    old_org = existing.get("org_id") if existing else None
    if old_org:
        for coll in ("organizations", "users", "locations", "screens", "playlists", "media", "devices", "schedules"):
            await db[coll].delete_many({"org_id": old_org})
        print(f"Removed previous demo org {old_org}")
    # also drop the demo user if it was orphaned
    await db.users.delete_many({"email": DEMO_EMAIL})

    org_id = str(uuid.uuid4())
    await db.organizations.insert_one({
        "id": org_id,
        "name": ORG_NAME,
        "slug": ORG_NAME.lower().replace(" ", "-"),
        "contact_email": DEMO_EMAIL,
        "phone": None,
        "plan": "trial",
        "subscription": {"plan": "trial", "status": "trialing", "screen_limit": 10, "renews_at": None},
        "created_at": now_iso(),
    })

    user_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": user_id,
        "email": DEMO_EMAIL,
        "name": DEMO_NAME,
        "role": "owner",
        "org_id": org_id,
        "is_active": True,
        "created_at": now_iso(),
        "password_hash": hash_password(DEMO_PASSWORD),
    })

    location_id = str(uuid.uuid4())
    await db.locations.insert_one({
        "id": location_id,
        "org_id": org_id,
        "name": LOCATION_NAME,
        "address": "123 Demo St",
        "city": "Spokane",
        "state": "WA",
        "timezone": "America/Los_Angeles",
        "created_at": now_iso(),
    })

    # --- store the demo images via the real storage backend ---
    items = []
    for display_name, fname in IMAGES:
        data = (ASSET_DIR / fname).read_bytes()
        path = f"{APP_PREFIX}/{org_id}/{uuid.uuid4()}.png"
        result = put_object(path, data, "image/png")
        media_id = str(uuid.uuid4())
        await db.media.insert_one({
            "id": media_id,
            "org_id": org_id,
            "location_id": location_id,
            "name": display_name,
            "storage_path": result["path"],
            "content_type": "image/png",
            "kind": "image",
            "ext": "png",
            "size": result.get("size", len(data)),
            "width": 1280,
            "height": 720,
            "is_deleted": False,
            "created_at": now_iso(),
            "uploaded_by": user_id,
        })
        items.append({"media_id": media_id, "duration": 10})

    playlist_id = str(uuid.uuid4())
    await db.playlists.insert_one({
        "id": playlist_id,
        "org_id": org_id,
        "name": "Demo Menu Playlist",
        "location_id": location_id,
        "items": items,
        "version": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })

    screen_id = str(uuid.uuid4())
    await db.screens.insert_one({
        "id": screen_id,
        "org_id": org_id,
        "name": SCREEN_NAME,
        "location_id": location_id,
        "orientation": "landscape",
        "resolution": "1920x1080",
        "image_fit": "fill",
        "default_image_duration": 10,
        "playlist_id": playlist_id,
        "created_at": now_iso(),
    })

    print("=" * 56)
    print("  DEMO ACCOUNT READY (for the Amazon reviewer)")
    print("=" * 56)
    print(f"  Login URL : https://instamenuapp.com")
    print(f"  Email     : {DEMO_EMAIL}")
    print(f"  Password  : {DEMO_PASSWORD}")
    print(f"  Org       : {ORG_NAME}")
    print(f"  Screen    : {SCREEN_NAME}  (playlist with {len(items)} images)")
    print("=" * 56)
    print("  Reviewer: open the player, note the pairing code, then in the")
    print("  dashboard go to Fire TV Devices > Pair New Device > enter code,")
    print(f"  and assign it to '{SCREEN_NAME}'. Content plays immediately.")
    print("=" * 56)


if __name__ == "__main__":
    asyncio.run(main())
