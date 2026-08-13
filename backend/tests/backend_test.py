"""Backend tests for InstaMenu 2.0 covering auth, admin, tenant CRUD, media, playlists, devices, tenant isolation."""
import io
import os
import struct
import time
import uuid
import zlib
from typing import Optional

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://firetv-dash.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = {"email": "admin@instamenu.com", "password": "Admin123!"}
OWNER = {"email": "owner@casalola.com", "password": "Owner123!"}


# ---------------- helpers ----------------
def make_png(w: int = 8, h: int = 8, color=(255, 0, 0)) -> bytes:
    """Craft a minimal PNG file."""
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b""
    for _ in range(h):
        raw += b"\x00" + bytes(color * w)
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = login(**SUPER)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def owner_token():
    r = login(**OWNER)
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def owner_org_id(owner_token):
    r = requests.get(f"{API}/auth/me", headers=bearer(owner_token), timeout=10)
    assert r.status_code == 200
    return r.json()["org_id"]


# ---------------- 1) Auth & lockout ----------------
class TestAuth:
    def test_super_admin_login(self, admin_token):
        assert admin_token

    def test_owner_login(self, owner_token):
        assert owner_token

    def test_me_returns_role(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=bearer(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "super_admin"
        assert data["email"] == SUPER["email"]

    def test_brute_force_lockout(self):
        email = f"TEST_bf_{uuid.uuid4().hex[:6]}@x.com"  # unique per run to avoid pre-existing lockouts
        # Not registered but still triggers lockout counter per (ip,email)
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrongpw"}, timeout=10)
            codes.append(r.status_code)
        # Expect at least one 429 by the 6th attempt
        assert 429 in codes, f"No 429 lockout observed: {codes}"


# ---------------- 2) Super admin: overview + orgs + users ----------------
class TestAdmin:
    def test_overview(self, admin_token):
        r = requests.get(f"{API}/admin/overview", headers=bearer(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        for k in ("organizations", "locations", "screens", "devices", "users", "storage_bytes"):
            assert k in data

    def test_org_lifecycle_and_user_lifecycle(self, admin_token):
        name = f"TEST_Org_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{API}/admin/organizations",
            json={"name": name, "contact_email": "t@t.com", "plan": "trial"},
            headers=bearer(admin_token),
            timeout=15,
        )
        assert r.status_code == 201, r.text
        org = r.json()
        assert org["name"] == name
        org_id = org["id"]

        # Verify persisted
        r = requests.get(f"{API}/admin/organizations", headers=bearer(admin_token), timeout=10)
        assert r.status_code == 200
        assert any(o["id"] == org_id for o in r.json())

        # Toggle status
        r = requests.patch(
            f"{API}/admin/organizations/{org_id}",
            json={"status": "disabled"},
            headers=bearer(admin_token),
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "disabled"

        # Create restaurant user
        u_email = f"TEST_user_{uuid.uuid4().hex[:6]}@x.com"
        r = requests.post(
            f"{API}/admin/users",
            json={"email": u_email, "password": "Password1!", "name": "Test User", "role": "owner", "org_id": org_id},
            headers=bearer(admin_token),
            timeout=10,
        )
        assert r.status_code == 201, r.text
        user_id = r.json()["id"]

        # Reset password
        r = requests.post(
            f"{API}/admin/users/{user_id}/reset-password",
            json={"password": "NewPassword2!"},
            headers=bearer(admin_token),
            timeout=10,
        )
        assert r.status_code == 200

        # Login with new password
        r = login(u_email, "NewPassword2!")
        assert r.status_code == 200

        # Toggle inactive
        r = requests.patch(
            f"{API}/admin/users/{user_id}",
            json={"is_active": False},
            headers=bearer(admin_token),
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["is_active"] is False

        # Login now fails
        r = login(u_email, "NewPassword2!")
        assert r.status_code == 403

        # Delete user
        r = requests.delete(f"{API}/admin/users/{user_id}", headers=bearer(admin_token), timeout=10)
        assert r.status_code == 200

        # Impersonate the org
        r = requests.post(f"{API}/admin/impersonate/{org_id}", headers=bearer(admin_token), timeout=10)
        assert r.status_code == 200
        imp_token = r.json()["token"]
        r = requests.get(f"{API}/dashboard", headers=bearer(imp_token), timeout=10)
        assert r.status_code == 200
        # Stop impersonation
        r = requests.post(f"{API}/auth/stop-impersonation", headers=bearer(imp_token), timeout=10)
        assert r.status_code == 200

        # Delete org
        r = requests.delete(f"{API}/admin/organizations/{org_id}", headers=bearer(admin_token), timeout=15)
        assert r.status_code == 200


# ---------------- 3) Owner dashboard + locations ----------------
class TestDashboardAndLocations:
    def test_dashboard(self, owner_token):
        r = requests.get(f"{API}/dashboard", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "stats" in d and "screens" in d
        assert d["stats"]["screens"] >= 3

    def test_location_crud_and_delete_with_screens_blocked(self, owner_token):
        # Create
        r = requests.post(
            f"{API}/locations",
            json={"name": f"TEST_Loc_{uuid.uuid4().hex[:6]}", "city": "Spokane"},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 201
        loc_id = r.json()["id"]
        # Edit
        r = requests.patch(
            f"{API}/locations/{loc_id}",
            json={"name": "TEST_Loc_Updated", "city": "Spokane"},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Loc_Updated"

        # Delete (no screens -> OK)
        r = requests.delete(f"{API}/locations/{loc_id}", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200

        # Try deleting the seeded location which has screens -> expect 409
        r = requests.get(f"{API}/locations", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200
        locs_with_screens = [l for l in r.json() if l.get("screens", 0) > 0]
        if locs_with_screens:
            r = requests.delete(
                f"{API}/locations/{locs_with_screens[0]['id']}", headers=bearer(owner_token), timeout=10
            )
            assert r.status_code == 409


# ---------------- 4) Media upload / rename / delete / serve ----------------
class TestMedia:
    def test_upload_list_rename_serve_delete(self, owner_token):
        png = make_png(16, 12)
        files = {"file": (f"TEST_{uuid.uuid4().hex[:6]}.png", png, "image/png")}
        r = requests.post(f"{API}/media/upload", headers=bearer(owner_token), files=files, timeout=30)
        assert r.status_code == 201, r.text
        m = r.json()
        assert m["width"] == 16 and m["height"] == 12
        assert m["size"] > 0
        media_id = m["id"]

        # List
        r = requests.get(f"{API}/media", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200
        assert any(x["id"] == media_id for x in r.json())

        # Rename
        r = requests.patch(
            f"{API}/media/{media_id}", json={"name": "TEST_renamed.png"}, headers=bearer(owner_token), timeout=10
        )
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_renamed.png"

        # Serve via ?auth=<jwt>
        r = requests.get(f"{API}/media/{media_id}/file?auth={owner_token}", timeout=15)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/")
        assert len(r.content) == len(png)

        # Delete unused
        r = requests.delete(f"{API}/media/{media_id}", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200

    def test_reject_bad_extension(self, owner_token):
        files = {"file": ("bad.txt", b"hello", "text/plain")}
        r = requests.post(f"{API}/media/upload", headers=bearer(owner_token), files=files, timeout=15)
        assert r.status_code == 400


# ---------------- 5) Playlists incl. version bump ----------------
class TestPlaylists:
    def test_create_edit_version_bump(self, owner_token):
        # upload two media
        ids = []
        for i in range(2):
            files = {"file": (f"TEST_pl_{i}_{uuid.uuid4().hex[:5]}.png", make_png(8, 8), "image/png")}
            r = requests.post(f"{API}/media/upload", headers=bearer(owner_token), files=files, timeout=20)
            assert r.status_code == 201
            ids.append(r.json()["id"])

        # Create playlist empty
        r = requests.post(
            f"{API}/playlists",
            json={"name": f"TEST_PL_{uuid.uuid4().hex[:5]}", "items": []},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 201
        pl = r.json()
        assert pl["version"] == 1
        pl_id = pl["id"]

        # Add items
        r = requests.patch(
            f"{API}/playlists/{pl_id}",
            json={"items": [{"media_id": ids[0], "duration": 10}, {"media_id": ids[1], "duration": 15}]},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["version"] == 2  # bumped

        # Change durations (content change)
        r = requests.patch(
            f"{API}/playlists/{pl_id}",
            json={"items": [{"media_id": ids[0], "duration": 20}, {"media_id": ids[1], "duration": 15}]},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["version"] == 3

        # Duplicate
        r = requests.post(
            f"{API}/playlists/{pl_id}/duplicate", headers=bearer(owner_token), timeout=10
        )
        assert r.status_code == 201
        dup_id = r.json()["id"]

        # Delete duplicate
        r = requests.delete(f"{API}/playlists/{dup_id}", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200

        # Deleting media used by playlist must warn (409) without force
        r = requests.delete(f"{API}/media/{ids[0]}", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 409
        # Force delete succeeds
        r = requests.delete(f"{API}/media/{ids[0]}?force=true", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200

        # Cleanup
        requests.delete(f"{API}/playlists/{pl_id}?force=true", headers=bearer(owner_token), timeout=10)
        requests.delete(f"{API}/media/{ids[1]}", headers=bearer(owner_token), timeout=10)


# ---------------- 6) Screens: assign playlist ----------------
class TestScreens:
    def test_assign_playlist_and_persist_settings(self, owner_token):
        r = requests.get(f"{API}/screens", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200
        screens = r.json()
        assert len(screens) >= 1
        screen_id = screens[0]["id"]

        # Create playlist
        r = requests.post(
            f"{API}/playlists",
            json={"name": f"TEST_screen_pl_{uuid.uuid4().hex[:5]}", "items": []},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 201
        pl_id = r.json()["id"]

        # Assign
        r = requests.patch(
            f"{API}/screens/{screen_id}",
            json={"playlist_id": pl_id, "image_fit": "fill", "orientation": "landscape"},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["playlist_id"] == pl_id
        assert r.json()["image_fit"] == "fill"

        # Deleting the assigned playlist should 409 without force
        r = requests.delete(f"{API}/playlists/{pl_id}", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 409
        r = requests.delete(f"{API}/playlists/{pl_id}?force=true", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200


# ---------------- 7) Device pairing E2E ----------------
class TestDeviceAPI:
    def test_full_device_flow_and_heartbeat_update_flag(self, owner_token, owner_org_id):
        hardware_id = f"TEST_hw_{uuid.uuid4().hex[:8]}"

        # 1) pair/request
        r = requests.post(
            f"{API}/device/pair/request",
            json={"hardware_id": hardware_id, "app_version": "1.0.0", "model": "FireTV"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        code = r.json()["code"]
        assert len(code) == 6

        # pick a location and screen with no device
        r = requests.get(f"{API}/screens", headers=bearer(owner_token), timeout=10)
        screens = r.json()
        chosen = next((s for s in screens if not s.get("device")), screens[-1])
        screen_id = chosen["id"]
        location_id = chosen["location_id"]

        # 2) dashboard confirms pair
        r = requests.post(
            f"{API}/devices/pair",
            json={"code": code, "location_id": location_id, "screen_id": screen_id, "name": "TEST_Device"},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 201, r.text
        device_id = r.json()["id"]

        # 3) pair/status returns token
        r = requests.get(
            f"{API}/device/pair/status", params={"hardware_id": hardware_id, "code": code}, timeout=10
        )
        assert r.status_code == 200
        assert r.json()["paired"] is True
        device_token = r.json()["device_token"]
        assert device_token

        # 4) reusing the code again should 409
        r = requests.post(
            f"{API}/devices/pair",
            json={"code": code, "location_id": location_id, "screen_id": screen_id, "name": "again"},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 409

        # 5) /device/config with bogus token 401
        r = requests.get(f"{API}/device/config", headers={"X-Device-Token": "bogus"}, timeout=10)
        assert r.status_code == 401
        r = requests.get(f"{API}/device/config", timeout=10)
        assert r.status_code == 401

        # 6) /device/config with real token
        r = requests.get(f"{API}/device/config", headers={"X-Device-Token": device_token}, timeout=10)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["screen"]["id"] == screen_id

        # Create playlist with content, assign to screen
        files = {"file": (f"TEST_dev_{uuid.uuid4().hex[:5]}.png", make_png(20, 20), "image/png")}
        r = requests.post(f"{API}/media/upload", headers=bearer(owner_token), files=files, timeout=20)
        media_id = r.json()["id"]

        r = requests.post(
            f"{API}/playlists",
            json={"name": f"TEST_devpl_{uuid.uuid4().hex[:5]}",
                  "items": [{"media_id": media_id, "duration": 10}]},
            headers=bearer(owner_token),
            timeout=10,
        )
        pl_id = r.json()["id"]
        server_version = r.json()["version"]

        r = requests.patch(
            f"{API}/screens/{screen_id}",
            json={"playlist_id": pl_id},
            headers=bearer(owner_token),
            timeout=10,
        )
        assert r.status_code == 200

        # /device/playlist manifest
        r = requests.get(f"{API}/device/playlist", headers={"X-Device-Token": device_token}, timeout=10)
        assert r.status_code == 200
        manifest = r.json()
        assert manifest["version"] == server_version
        assert len(manifest["items"]) == 1
        media_url = manifest["items"][0]["url"]
        # Fetch media using device_token in URL (no user login)
        assert "device_token=" in media_url
        r = requests.get(media_url, timeout=15)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/")

        # Heartbeat with older version -> update_available=True
        time.sleep(2.1)  # heartbeat rate limit
        r = requests.post(
            f"{API}/device/heartbeat",
            json={"playlist_version": 0, "status": "playing"},
            headers={"X-Device-Token": device_token},
            timeout=10,
        )
        assert r.status_code == 200
        hb = r.json()
        assert hb["update_available"] is True
        assert hb["playlist_version"] == server_version

        # Heartbeat with equal version -> update_available=False
        time.sleep(2.1)
        r = requests.post(
            f"{API}/device/heartbeat",
            json={"playlist_version": server_version, "status": "playing"},
            headers={"X-Device-Token": device_token},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["update_available"] is False

        # Cleanup
        requests.delete(f"{API}/devices/{device_id}", headers=bearer(owner_token), timeout=10)
        requests.patch(f"{API}/screens/{screen_id}", json={"playlist_id": None}, headers=bearer(owner_token), timeout=10)
        requests.delete(f"{API}/playlists/{pl_id}?force=true", headers=bearer(owner_token), timeout=10)
        requests.delete(f"{API}/media/{media_id}?force=true", headers=bearer(owner_token), timeout=10)


# ---------------- 7b) Simplified screen flow (v2) ----------------
class TestSimplifiedScreenFlow:
    def test_create_screen_with_name_only(self, owner_token):
        name = f"TEST_Simple_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/screens", json={"name": name}, headers=bearer(owner_token), timeout=10)
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["name"] == name
        assert s.get("location_id"), "expected auto location_id"
        assert s.get("playlist_id"), "expected auto playlist_id"
        # Verify GET returns hydrated playlist
        rg = requests.get(f"{API}/screens/{s['id']}", headers=bearer(owner_token), timeout=10)
        assert rg.status_code == 200
        pl = rg.json().get("playlist")
        assert pl is not None
        assert pl["version"] == 1
        # Cleanup
        requests.delete(f"{API}/screens/{s['id']}", headers=bearer(owner_token), timeout=10)
        requests.delete(f"{API}/playlists/{s['playlist_id']}?force=true", headers=bearer(owner_token), timeout=10)

    def test_upload_content_onto_screen_and_reorder(self, owner_token):
        # Create screen
        name = f"TEST_Content_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/screens", json={"name": name}, headers=bearer(owner_token), timeout=10)
        assert r.status_code == 201, r.text
        screen = r.json()
        sid = screen["id"]
        pid = screen["playlist_id"]

        # POST content with 2 valid + 1 bad
        files = [
            ("files", (f"TEST_a_{uuid.uuid4().hex[:5]}.png", make_png(10, 10), "image/png")),
            ("files", (f"TEST_b_{uuid.uuid4().hex[:5]}.png", make_png(12, 8), "image/png")),
            ("files", ("bad.txt", b"nope", "text/plain")),
        ]
        r = requests.post(f"{API}/screens/{sid}/content", headers=bearer(owner_token), files=files, timeout=30)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["added"] == 2
        assert len(body["errors"]) >= 1
        assert body["playlist"]["version"] >= 2
        items = body["playlist"]["items"]
        assert len(items) == 2
        media_ids = [it["media_id"] for it in items]

        # Screen list shows item_count and thumbnail
        r = requests.get(f"{API}/screens", headers=bearer(owner_token), timeout=10)
        row = next(s for s in r.json() if s["id"] == sid)
        assert row["item_count"] == 2
        assert row["thumbnail_media_id"] == media_ids[0]
        assert row.get("thumbnail_kind") in ("image", None) or row["thumbnail_kind"] == "image"

        # PUT reorder + retime
        new_items = [
            {"media_id": media_ids[1], "duration": 25},
            {"media_id": media_ids[0], "duration": 7},
        ]
        r = requests.put(f"{API}/screens/{sid}/content",
                         json={"items": new_items}, headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200
        updated = r.json()
        assert updated["version"] >= 3
        assert updated["items"][0]["media_id"] == media_ids[1]
        assert updated["items"][0]["duration"] == 25

        # Dashboard reflects thumbnail_media_id + thumbnail_kind
        r = requests.get(f"{API}/dashboard", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200
        dash_screen = next((s for s in r.json()["screens"] if s["id"] == sid), None)
        assert dash_screen is not None
        assert "thumbnail_media_id" in dash_screen
        assert "thumbnail_kind" in dash_screen

        # Cleanup
        requests.delete(f"{API}/screens/{sid}", headers=bearer(owner_token), timeout=10)
        requests.delete(f"{API}/playlists/{pid}?force=true", headers=bearer(owner_token), timeout=10)
        for mid in media_ids:
            requests.delete(f"{API}/media/{mid}?force=true", headers=bearer(owner_token), timeout=10)

    def test_pair_with_code_and_screen_only(self, owner_token):
        # Create screen (name only)
        sname = f"TEST_PairS_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/screens", json={"name": sname}, headers=bearer(owner_token), timeout=10)
        sid = r.json()["id"]
        pid = r.json()["playlist_id"]

        hardware_id = f"TEST_hw_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/device/pair/request",
                          json={"hardware_id": hardware_id, "app_version": "1.0.0"}, timeout=10)
        code = r.json()["code"]

        # Pair with ONLY code + screen_id (no location, no name)
        r = requests.post(f"{API}/devices/pair",
                          json={"code": code, "screen_id": sid},
                          headers=bearer(owner_token), timeout=10)
        assert r.status_code == 201, r.text
        dev = r.json()
        assert dev["screen_id"] == sid
        assert dev["location_id"], "expected location auto-filled from screen"
        # default_name = screen name (with 'tv' or ' TV' appended)
        assert sname in dev["name"] or dev["name"].endswith("TV")

        # Cleanup
        requests.delete(f"{API}/devices/{dev['id']}", headers=bearer(owner_token), timeout=10)
        requests.delete(f"{API}/screens/{sid}", headers=bearer(owner_token), timeout=10)
        requests.delete(f"{API}/playlists/{pid}?force=true", headers=bearer(owner_token), timeout=10)

    def test_cross_org_screen_content_forbidden(self, admin_token, owner_token):
        # Owner's screen
        r = requests.get(f"{API}/screens", headers=bearer(owner_token), timeout=10)
        owner_sid = r.json()[0]["id"]
        # Create other org + user
        name = f"TEST_XOrg_{uuid.uuid4().hex[:5]}"
        r = requests.post(f"{API}/admin/organizations",
                          json={"name": name, "plan": "trial"},
                          headers=bearer(admin_token), timeout=10)
        other_org_id = r.json()["id"]
        email = f"TEST_xo_{uuid.uuid4().hex[:5]}@x.com"
        requests.post(f"{API}/admin/users",
                      json={"email": email, "password": "Pwd123456!", "name": "X",
                            "role": "owner", "org_id": other_org_id},
                      headers=bearer(admin_token), timeout=10)
        other_token = login(email, "Pwd123456!").json()["token"]
        # POST content to foreign screen -> 404
        files = [("files", ("x.png", make_png(4, 4), "image/png"))]
        r = requests.post(f"{API}/screens/{owner_sid}/content",
                          headers=bearer(other_token), files=files, timeout=15)
        assert r.status_code == 404
        # PUT content to foreign screen -> 404
        r = requests.put(f"{API}/screens/{owner_sid}/content",
                         json={"items": []}, headers=bearer(other_token), timeout=10)
        assert r.status_code == 404
        # Cleanup
        requests.delete(f"{API}/admin/organizations/{other_org_id}",
                        headers=bearer(admin_token), timeout=15)


# ---------------- 7c) Reassignment bug fix (playlist_id compare) ----------------
class TestReassignmentBugFix:
    def _pair_device(self, owner_token, screen_id):
        hw = f"TEST_hw_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/device/pair/request", json={"hardware_id": hw, "app_version": "1.0.0"}, timeout=10)
        code = r.json()["code"]
        r = requests.post(f"{API}/devices/pair", json={"code": code, "screen_id": screen_id},
                          headers=bearer(owner_token), timeout=10)
        assert r.status_code == 201, r.text
        device_id = r.json()["id"]
        r = requests.get(f"{API}/device/pair/status", params={"hardware_id": hw, "code": code}, timeout=10)
        return device_id, r.json()["device_token"]

    def _get_screen(self, owner_token, screen_id):
        r = requests.get(f"{API}/screens/{screen_id}", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200, r.text
        return r.json()

    def test_reassign_triggers_update_via_playlist_id(self, owner_token):
        # Grab the three seeded screens
        r = requests.get(f"{API}/screens", headers=bearer(owner_token), timeout=10)
        assert r.status_code == 200
        screens = r.json()
        # Use first two screens with a playlist_id
        s_with_pl = [s for s in screens if s.get("playlist_id")]
        assert len(s_with_pl) >= 2, "need at least two screens with playlists"
        A, B = s_with_pl[0], s_with_pl[1]
        A_full = self._get_screen(owner_token, A["id"])
        B_full = self._get_screen(owner_token, B["id"])
        A_pl_id = A_full["playlist"]["id"]
        A_pl_ver = A_full["playlist"]["version"]
        B_pl_id = B_full["playlist"]["id"]
        B_pl_ver = B_full["playlist"]["version"]
        assert A_pl_id != B_pl_id

        # Pair a device to A
        device_id, dev_token = self._pair_device(owner_token, A["id"])
        try:
            # heartbeat reporting A -> update_available False
            time.sleep(2.1)
            r = requests.post(f"{API}/device/heartbeat",
                              json={"playlist_id": A_pl_id, "playlist_version": A_pl_ver, "status": "playing"},
                              headers={"X-Device-Token": dev_token}, timeout=10)
            assert r.status_code == 200
            hb = r.json()
            assert hb["update_available"] is False, f"expected no update for same screen A, got {hb}"
            assert hb["playlist_id"] == A_pl_id
            assert hb["screen_id"] == A["id"]

            # Reassign device to screen B
            r = requests.patch(f"{API}/devices/{device_id}", json={"screen_id": B["id"]},
                               headers=bearer(owner_token), timeout=10)
            assert r.status_code == 200, r.text
            # server should clear reported_playlist_id/version on device doc
            assert r.json().get("reported_playlist_id") is None
            assert r.json().get("playlist_version") is None

            # heartbeat still reporting A's playlist_id -> update_available True (THE BUG FIX)
            time.sleep(2.1)
            r = requests.post(f"{API}/device/heartbeat",
                              json={"playlist_id": A_pl_id, "playlist_version": A_pl_ver, "status": "playing"},
                              headers={"X-Device-Token": dev_token}, timeout=10)
            assert r.status_code == 200
            hb = r.json()
            assert hb["screen_id"] == B["id"]
            assert hb["playlist_id"] == B_pl_id
            assert hb["update_available"] is True, f"BUG: after reassignment update_available should be True, got {hb}"

            # /device/config now reports screen B
            r = requests.get(f"{API}/device/config", headers={"X-Device-Token": dev_token}, timeout=10)
            assert r.status_code == 200
            cfg = r.json()
            assert cfg["screen"]["id"] == B["id"]
            assert cfg["playlist_id"] == B_pl_id

            # /device/playlist returns B's manifest
            r = requests.get(f"{API}/device/playlist", headers={"X-Device-Token": dev_token}, timeout=10)
            assert r.status_code == 200
            mani = r.json()
            assert mani["playlist_id"] == B_pl_id

            # after device now reports B, update_available becomes False
            time.sleep(2.1)
            r = requests.post(f"{API}/device/heartbeat",
                              json={"playlist_id": B_pl_id, "playlist_version": B_pl_ver, "status": "playing"},
                              headers={"X-Device-Token": dev_token}, timeout=10)
            assert r.status_code == 200
            assert r.json()["update_available"] is False
        finally:
            requests.delete(f"{API}/devices/{device_id}", headers=bearer(owner_token), timeout=10)

    def test_reassign_same_version_different_playlist(self, owner_token):
        """Construct exact bug: both playlists at same version, only playlist_id differs."""
        # Create two screens (each auto-creates a playlist at version 1)
        r1 = requests.post(f"{API}/screens", json={"name": f"TEST_A_{uuid.uuid4().hex[:5]}"},
                           headers=bearer(owner_token), timeout=10)
        assert r1.status_code == 201
        SA = r1.json()
        r2 = requests.post(f"{API}/screens", json={"name": f"TEST_B_{uuid.uuid4().hex[:5]}"},
                           headers=bearer(owner_token), timeout=10)
        assert r2.status_code == 201
        SB = r2.json()
        try:
            # Both playlists start at v1 - exactly the ambiguous case
            a_pl = self._get_screen(owner_token, SA["id"])["playlist"]
            b_pl = self._get_screen(owner_token, SB["id"])["playlist"]
            assert a_pl["version"] == b_pl["version"]  # both v1
            assert a_pl["id"] != b_pl["id"]

            device_id, dev_token = self._pair_device(owner_token, SA["id"])
            try:
                # baseline heartbeat
                time.sleep(2.1)
                r = requests.post(f"{API}/device/heartbeat",
                                  json={"playlist_id": a_pl["id"], "playlist_version": a_pl["version"]},
                                  headers={"X-Device-Token": dev_token}, timeout=10)
                assert r.json()["update_available"] is False

                # reassign
                r = requests.patch(f"{API}/devices/{device_id}", json={"screen_id": SB["id"]},
                                   headers=bearer(owner_token), timeout=10)
                assert r.status_code == 200

                # Same version but different playlist id -> MUST flag update
                time.sleep(2.1)
                r = requests.post(f"{API}/device/heartbeat",
                                  json={"playlist_id": a_pl["id"], "playlist_version": a_pl["version"]},
                                  headers={"X-Device-Token": dev_token}, timeout=10)
                assert r.status_code == 200
                hb = r.json()
                assert hb["update_available"] is True, f"REGRESSION: same version diff playlist not detected: {hb}"
                assert hb["playlist_id"] == b_pl["id"]
            finally:
                requests.delete(f"{API}/devices/{device_id}", headers=bearer(owner_token), timeout=10)
        finally:
            requests.delete(f"{API}/screens/{SA['id']}", headers=bearer(owner_token), timeout=10)
            requests.delete(f"{API}/screens/{SB['id']}", headers=bearer(owner_token), timeout=10)
            requests.delete(f"{API}/playlists/{SA['playlist_id']}?force=true", headers=bearer(owner_token), timeout=10)
            requests.delete(f"{API}/playlists/{SB['playlist_id']}?force=true", headers=bearer(owner_token), timeout=10)

    def test_heartbeat_backwards_compatible_no_playlist_id(self, owner_token):
        """Older client omitting playlist_id must still work: version-only comparison."""
        r = requests.get(f"{API}/screens", headers=bearer(owner_token), timeout=10)
        s = next(x for x in r.json() if x.get("playlist_id"))
        full = self._get_screen(owner_token, s["id"])
        pl_ver = full["playlist"]["version"]

        device_id, dev_token = self._pair_device(owner_token, s["id"])
        try:
            # Old client: no playlist_id, version matches -> update_available False
            time.sleep(2.1)
            r = requests.post(f"{API}/device/heartbeat",
                              json={"playlist_version": pl_ver, "status": "playing"},
                              headers={"X-Device-Token": dev_token}, timeout=10)
            assert r.status_code == 200
            assert r.json()["update_available"] is False

            # Old client: no playlist_id, version stale -> update_available True
            time.sleep(2.1)
            r = requests.post(f"{API}/device/heartbeat",
                              json={"playlist_version": 0, "status": "playing"},
                              headers={"X-Device-Token": dev_token}, timeout=10)
            assert r.status_code == 200
            assert r.json()["update_available"] is True
        finally:
            requests.delete(f"{API}/devices/{device_id}", headers=bearer(owner_token), timeout=10)


# ---------------- 8) Tenant isolation & role guards ----------------
class TestIsolation:
    def test_owner_forbidden_from_admin_endpoints(self, owner_token):
        for path in ("/admin/overview", "/admin/organizations", "/admin/users", "/admin/devices"):
            r = requests.get(f"{API}{path}", headers=bearer(owner_token), timeout=10)
            assert r.status_code == 403, f"{path} returned {r.status_code}"

    def test_cross_org_screen_and_media_404(self, admin_token, owner_token):
        # Create second org + user
        name = f"TEST_OtherOrg_{uuid.uuid4().hex[:5]}"
        r = requests.post(
            f"{API}/admin/organizations",
            json={"name": name, "plan": "trial"},
            headers=bearer(admin_token),
            timeout=10,
        )
        other_org_id = r.json()["id"]
        email = f"TEST_other_{uuid.uuid4().hex[:5]}@x.com"
        r = requests.post(
            f"{API}/admin/users",
            json={"email": email, "password": "OtherPass1!", "name": "Other", "role": "owner", "org_id": other_org_id},
            headers=bearer(admin_token),
            timeout=10,
        )
        assert r.status_code == 201
        r = login(email, "OtherPass1!")
        other_token = r.json()["token"]

        # Get owner's first screen id
        r = requests.get(f"{API}/screens", headers=bearer(owner_token), timeout=10)
        owner_screen_id = r.json()[0]["id"]

        # Cross-org access must be 404
        r = requests.get(f"{API}/screens/{owner_screen_id}", headers=bearer(other_token), timeout=10)
        assert r.status_code == 404
        r = requests.patch(
            f"{API}/screens/{owner_screen_id}",
            json={"name": "hax"},
            headers=bearer(other_token),
            timeout=10,
        )
        assert r.status_code == 404

        # Cleanup
        requests.delete(f"{API}/admin/organizations/{other_org_id}", headers=bearer(admin_token), timeout=15)
