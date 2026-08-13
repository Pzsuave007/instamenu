"""Pydantic request/response schemas. Documents use uuid `id` strings (no ObjectId leakage)."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ---------- auth ----------
class LoginIn(Base):
    email: EmailStr
    password: str


class PasswordIn(Base):
    password: str = Field(min_length=6, max_length=128)


# ---------- organizations ----------
class OrgIn(Base):
    name: str = Field(min_length=2, max_length=120)
    contact_email: Optional[EmailStr] = None
    phone: Optional[str] = None
    plan: str = "trial"


class OrgUpdate(Base):
    name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    phone: Optional[str] = None
    plan: Optional[str] = None
    status: Optional[str] = None


class UserIn(Base):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    role: str = "owner"
    org_id: Optional[str] = None


class UserUpdate(Base):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


# ---------- locations ----------
class LocationIn(Base):
    name: str = Field(min_length=1, max_length=120)
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    timezone: str = "America/Los_Angeles"


# ---------- screens ----------
class ScreenIn(Base):
    name: str = Field(min_length=1, max_length=120)
    location_id: Optional[str] = None
    orientation: str = "landscape"
    resolution: str = "1920x1080"
    image_fit: str = "fit"  # fit | fill | stretch
    default_image_duration: int = 10
    playlist_id: Optional[str] = None


class ScreenUpdate(Base):
    name: Optional[str] = None
    location_id: Optional[str] = None
    orientation: Optional[str] = None
    resolution: Optional[str] = None
    image_fit: Optional[str] = None
    default_image_duration: Optional[int] = None
    playlist_id: Optional[str] = None


# ---------- playlists ----------
class PlaylistItemIn(Base):
    media_id: str
    duration: int = 10


class PlaylistIn(Base):
    name: str = Field(min_length=1, max_length=120)
    location_id: Optional[str] = None
    items: List[PlaylistItemIn] = []


class PlaylistUpdate(Base):
    name: Optional[str] = None
    location_id: Optional[str] = None
    items: Optional[List[PlaylistItemIn]] = None


# ---------- schedules (data model ready; UI minimal) ----------
class ScreenContentIn(Base):
    items: List[PlaylistItemIn] = []


class ScheduleIn(Base):
    screen_id: str
    playlist_id: str
    days_of_week: List[int] = []  # 0=Mon .. 6=Sun ; empty = every day
    start_time: str = "00:00"
    end_time: str = "23:59"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    priority: int = 0
    is_active: bool = True


# ---------- media ----------
class MediaUpdate(Base):
    name: Optional[str] = None


# ---------- devices ----------
class PairRequestIn(Base):
    hardware_id: str
    app_version: Optional[str] = "1.0.0"
    model: Optional[str] = None


class PairConfirmIn(Base):
    code: str = Field(min_length=6, max_length=6)
    location_id: Optional[str] = None
    screen_id: str
    name: Optional[str] = None


class PairClaimIn(Base):
    hardware_id: str
    code: str


class DeviceUpdate(Base):
    name: Optional[str] = None
    screen_id: Optional[str] = None
    location_id: Optional[str] = None


class HeartbeatIn(Base):
    app_version: Optional[str] = None
    playlist_id: Optional[str] = None
    playlist_version: Optional[int] = None
    status: Optional[str] = "playing"
    current_item: Optional[str] = None
