"""
River sightings API — stores user-submitted photos from QR scan landing pages.

Storage: flat JSON metadata file + photos saved to sightings_data/photos/.
Photos are served via StaticFiles mounted at /static/sightings in main.py.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import jwt as _jwt
    _HAS_JWT = True
except ImportError:
    _HAS_JWT = False

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

router = APIRouter()

SIGHTINGS_DIR = Path(__file__).parent.parent / "sightings_data"
PHOTOS_DIR = SIGHTINGS_DIR / "photos"
METADATA_FILE = SIGHTINGS_DIR / "metadata.json"

_JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production-please")
_USERS_FILE = Path(__file__).parent.parent / "mobile_data" / "users.json"


def _resolve_user_from_token(authorization: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Return (userId, username) extracted from a Bearer token, or (None, None)."""
    if not _HAS_JWT or not authorization:
        return None, None
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None, None
    try:
        payload = _jwt.decode(parts[1], _JWT_SECRET, algorithms=["HS256"])  # type: ignore[attr-defined]
        user_id = payload.get("sub")
        if not user_id or not _USERS_FILE.exists():
            return None, None
        users: list[dict] = json.loads(_USERS_FILE.read_text(encoding="utf-8"))
        user = next((u for u in users if u["id"] == user_id), None)
        if not user:
            return None, None
        return user["id"], user["username"]
    except Exception:
        return None, None

# Only these river IDs are accepted, mirroring the frontend RIVER_INFO map.
VALID_RIVER_IDS = {"odra", "danube", "rhine", "glomma", "vardar"}

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_DISPLAY_NAME_LEN = 80


def _ensure_dirs() -> None:
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    if not METADATA_FILE.exists():
        METADATA_FILE.write_text("[]", encoding="utf-8")


def _load() -> list[dict]:
    _ensure_dirs()
    try:
        return json.loads(METADATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save(sightings: list[dict]) -> None:
    _ensure_dirs()
    METADATA_FILE.write_text(
        json.dumps(sightings, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# POST /api/sightings/{river_id}  — upload a new sighting
# ---------------------------------------------------------------------------

@router.post("/{river_id}")
async def create_sighting(
    river_id: str,
    photo: UploadFile = File(...),
    display_name: str = Form(...),
    authorization: Optional[str] = Header(None),
):
    """Upload a river sighting photo and record it."""
    if river_id not in VALID_RIVER_IDS:
        raise HTTPException(status_code=400, detail=f"Unknown river '{river_id}'")

    if photo.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Photo must be JPEG, PNG, WebP, or GIF",
        )

    content = await photo.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 5 MB limit")

    display_name = display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name is required")
    display_name = display_name[:MAX_DISPLAY_NAME_LEN]

    ext_map = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    ext = ext_map.get(photo.content_type, "jpg")
    file_id = str(uuid.uuid4())
    photo_filename = f"{file_id}.{ext}"

    _ensure_dirs()
    (PHOTOS_DIR / photo_filename).write_bytes(content)

    user_id, username = _resolve_user_from_token(authorization)

    sighting = {
        "id": file_id,
        "riverId": river_id,
        "displayName": display_name,
        "photoFilename": photo_filename,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "userId": user_id,
        "username": username,
    }

    sightings = _load()
    sightings.append(sighting)
    _save(sightings)

    return sighting


# ---------------------------------------------------------------------------
# GET /api/sightings          — all sightings (optional ?river_id= filter)
# GET /api/sightings/{river_id} — sightings for one river
# ---------------------------------------------------------------------------

@router.get("")
def get_sightings(river_id: Optional[str] = None):
    """Return all sightings newest-first, optionally filtered by river_id."""
    sightings = _load()
    if river_id:
        sightings = [s for s in sightings if s["riverId"] == river_id]
    return sorted(sightings, key=lambda s: s["timestamp"], reverse=True)


@router.get("/{river_id}")
def get_river_sightings(river_id: str):
    """Return sightings for a specific river, newest-first."""
    if river_id not in VALID_RIVER_IDS:
        raise HTTPException(status_code=400, detail=f"Unknown river '{river_id}'")
    sightings = _load()
    return sorted(
        [s for s in sightings if s["riverId"] == river_id],
        key=lambda s: s["timestamp"],
        reverse=True,
    )
