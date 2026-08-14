"""Media storage with two interchangeable backends.

- ``local``    : files live on this server's disk (self-hosted / your own VPS).
- ``emergent`` : Emergent object storage cloud (default in the Emergent preview).

Pick one with the ``STORAGE_BACKEND`` env var. The public interface never changes:
    init_storage()
    put_object(path, data, content_type) -> {"path": str, "size": int}
    get_object(path) -> (bytes, content_type)
"""
import mimetypes
import os
from pathlib import Path

import requests

APP_PREFIX = os.environ.get("APP_STORAGE_PREFIX", "instamenu")
STORAGE_BACKEND = (os.environ.get("STORAGE_BACKEND") or "emergent").strip().lower()

# ---------------- local disk backend ----------------
MEDIA_DIR = Path(
    os.environ.get("MEDIA_STORAGE_DIR") or (Path(__file__).resolve().parent.parent / "media_data")
)


def _local_init():
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    return str(MEDIA_DIR)


def _local_put(path: str, data: bytes, content_type: str) -> dict:
    dest = MEDIA_DIR / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return {"path": path, "size": len(data)}


def _local_get(path: str):
    src = MEDIA_DIR / path
    if not src.exists():
        raise FileNotFoundError(path)
    ctype = mimetypes.guess_type(str(src))[0] or "application/octet-stream"
    return src.read_bytes(), ctype


# ---------------- Emergent object storage backend ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

storage_key = None


def _emergent_init(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def _emergent_put(path: str, data: bytes, content_type: str) -> dict:
    key = _emergent_init()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=180,
    )
    if resp.status_code == 404:
        key = _emergent_init(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=180,
        )
    resp.raise_for_status()
    return resp.json()


def _emergent_get(path: str):
    key = _emergent_init()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=120)
    if resp.status_code == 404:
        key = _emergent_init(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=120)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------- public interface ----------------
def init_storage(force: bool = False):
    if STORAGE_BACKEND == "local":
        return _local_init()
    return _emergent_init(force)


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if STORAGE_BACKEND == "local":
        return _local_put(path, data, content_type)
    return _emergent_put(path, data, content_type)


def get_object(path: str):
    if STORAGE_BACKEND == "local":
        return _local_get(path)
    return _emergent_get(path)
