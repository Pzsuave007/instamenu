"""Regression tests for PEP 604 -> Optional conversion (Python 3.9 compat)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://screen-manager-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@instamenu.com", "password": "Admin123!"}
OWNER = {"email": "owner@casalola.com", "password": "Owner123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    data = r.json()
    return data["token"], data


@pytest.fixture(scope="module")
def admin_headers():
    tok, _ = _login(ADMIN)
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def owner_ctx():
    tok, data = _login(OWNER)
    return {"headers": {"Authorization": f"Bearer {tok}"}, "user": data.get("user", {})}


# ---------- Admin endpoints ----------
class TestAdminUsers:
    def test_list_users_no_filter(self, admin_headers):
        r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_list_users_with_org_id(self, admin_headers):
        # Grab an org_id first
        orgs = requests.get(f"{API}/admin/organizations", headers=admin_headers, timeout=30)
        assert orgs.status_code == 200, orgs.text
        org_list = orgs.json()
        if not org_list:
            pytest.skip("No orgs available")
        org_id = org_list[0].get("id") or org_list[0].get("_id")
        r = requests.get(f"{API}/admin/users", params={"org_id": org_id},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ---------- Schedules ----------
class TestSchedules:
    def test_list_schedules(self, owner_ctx):
        r = requests.get(f"{API}/schedules", headers=owner_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_list_schedules_with_screen_filter(self, owner_ctx):
        screens = requests.get(f"{API}/screens", headers=owner_ctx["headers"], timeout=30)
        assert screens.status_code == 200, screens.text
        slist = screens.json()
        if not slist:
            pytest.skip("No screens")
        sid = slist[0].get("id") or slist[0].get("_id")
        r = requests.get(f"{API}/schedules", params={"screen_id": sid},
                         headers=owner_ctx["headers"], timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_schedule_create_list_delete(self, owner_ctx):
        h = owner_ctx["headers"]
        screens = requests.get(f"{API}/screens", headers=h, timeout=30).json()
        playlists = requests.get(f"{API}/playlists", headers=h, timeout=30)
        if playlists.status_code != 200 or not screens or not playlists.json():
            pytest.skip("Missing screens/playlists for schedule test")
        sid = screens[0].get("id") or screens[0].get("_id")
        pid = playlists.json()[0].get("id") or playlists.json()[0].get("_id")
        payload = {
            "screen_id": sid,
            "playlist_id": pid,
            "name": "TEST_regression_schedule",
            "start_time": "09:00",
            "end_time": "10:00",
            "days_of_week": [1, 2, 3, 4, 5],
            "priority": 1,
            "active": True,
        }
        c = requests.post(f"{API}/schedules", json=payload, headers=h, timeout=30)
        assert c.status_code in (200, 201), c.text
        created = c.json()
        sched_id = created.get("id") or created.get("_id")
        assert sched_id

        # Verify in list
        lst = requests.get(f"{API}/schedules", params={"screen_id": sid},
                           headers=h, timeout=30).json()
        ids = [s.get("id") or s.get("_id") for s in lst]
        assert sched_id in ids

        # Delete
        d = requests.delete(f"{API}/schedules/{sched_id}", headers=h, timeout=30)
        assert d.status_code in (200, 204), d.text


# ---------- Add existing media to screen ----------
class TestAddExistingMedia:
    def test_add_existing_media_to_screen(self, owner_ctx):
        h = owner_ctx["headers"]
        screens = requests.get(f"{API}/screens", headers=h, timeout=30).json()
        media = requests.get(f"{API}/media", headers=h, timeout=30)
        if media.status_code != 200 or not screens or not media.json():
            pytest.skip("Missing screens/media")
        sid = screens[0].get("id") or screens[0].get("_id")
        mid = media.json()[0].get("id") or media.json()[0].get("_id")
        r = requests.post(f"{API}/screens/{sid}/content/existing",
                          json={"media_ids": [mid]}, headers=h, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"
