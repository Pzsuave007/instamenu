"""InstaMenu 2.0 API entrypoint."""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import APIRouter, FastAPI  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from core.db import client, db, ensure_indexes  # noqa: E402
from core.models import new_id, now_iso  # noqa: E402
from core.security import hash_password, verify_password  # noqa: E402
from core.storage import init_storage  # noqa: E402
from routers import admin, auth, device_api, devices, media, org, screens  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("instamenu")

app = FastAPI(title="InstaMenu 2.0 API", version="2.0.0")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"service": "InstaMenu 2.0", "status": "ok"}


api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(org.router)
api_router.include_router(media.router)
api_router.include_router(screens.router)
api_router.include_router(devices.router)
api_router.include_router(device_api.router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


async def seed_super_admin():
    email = os.environ["ADMIN_EMAIL"].lower()
    password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one(
            {
                "id": new_id(),
                "email": email,
                "name": "Platform Admin",
                "role": "super_admin",
                "org_id": None,
                "is_active": True,
                "password_hash": hash_password(password),
                "created_at": now_iso(),
            }
        )
        logger.info("Seeded super admin %s", email)
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await seed_super_admin()
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as exc:
        logger.error("Storage init failed: %s", exc)


@app.on_event("shutdown")
async def shutdown():
    client.close()
