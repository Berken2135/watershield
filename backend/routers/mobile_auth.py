"""
Mobile user authentication for WaterShield River Collector.

Storage : flat JSON file at backend/mobile_data/users.json
Auth    : JWT (HS256), 30-day expiry, secret from JWT_SECRET env var
Passwords: bcrypt
"""

import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, field_validator

router = APIRouter()

# ---------------------------------------------------------------------------
# Storage paths
# ---------------------------------------------------------------------------

MOBILE_DATA_DIR = Path(__file__).parent.parent / "mobile_data"
USERS_FILE = MOBILE_DATA_DIR / "users.json"
SIGHTINGS_FILE = Path(__file__).parent.parent / "sightings_data" / "metadata.json"

# ---------------------------------------------------------------------------
# JWT config
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production-please")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 30

# Pre-computed dummy hash used to keep the login path constant-time even when
# the username does not exist (prevents user-enumeration via timing).
_DUMMY_HASH: bytes = bcrypt.hashpw(b"dummy_constant_string", bcrypt.gensalt(rounds=4))

# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        if not _USERNAME_RE.match(v):
            raise ValueError("Username must be 3–20 characters: letters, numbers, underscores only")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        if len(v) > 128:
            raise ValueError("Password too long")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def _ensure_dirs() -> None:
    MOBILE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not USERS_FILE.exists():
        USERS_FILE.write_text("[]", encoding="utf-8")


def _load_users() -> list[dict]:
    _ensure_dirs()
    try:
        return json.loads(USERS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_users(users: list[dict]) -> None:
    _ensure_dirs()
    USERS_FILE.write_text(
        json.dumps(users, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _find_by_username(username: str) -> Optional[dict]:
    return next(
        (u for u in _load_users() if u["username"].lower() == username.lower()),
        None,
    )


def _find_by_id(user_id: str) -> Optional[dict]:
    return next((u for u in _load_users() if u["id"] == user_id), None)


def _public_user(user: dict) -> dict:
    """Strip sensitive fields from a user dict before sending to the client."""
    return {k: v for k, v in user.items() if k != "passwordHash"}


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def _create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> Optional[str]:
    """Return user_id from a valid token, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]


def _require_user(authorization: Optional[str]) -> dict:
    """Decode the Authorization header and return the user dict, or raise 401."""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = _decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = _find_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# Badge helpers (derived from sightings, not stored on the user)
# ---------------------------------------------------------------------------

def _load_sightings() -> list[dict]:
    try:
        return json.loads(SIGHTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _badges_for(user_id: str) -> list[str]:
    """Return distinct river IDs the user has photographed (= earned badges)."""
    return list({s["riverId"] for s in _load_sightings() if s.get("userId") == user_id})


def _sighting_count_for(user_id: str) -> int:
    return sum(1 for s in _load_sightings() if s.get("userId") == user_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", status_code=201)
def register(body: RegisterRequest):
    """Create a new account. Returns JWT token + user (no passwordHash)."""
    _ensure_dirs()
    users = _load_users()

    for u in users:
        if u["username"].lower() == body.username.lower():
            raise HTTPException(status_code=409, detail="Username already taken")
        if u["email"].lower() == body.email.lower():
            raise HTTPException(status_code=409, detail="Email already registered")

    password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")
    user: dict = {
        "id": str(uuid.uuid4()),
        "username": body.username,
        "email": body.email,
        "passwordHash": password_hash,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "friendIds": [],
    }
    users.append(user)
    _save_users(users)

    return {"token": _create_token(user["id"]), "user": _public_user(user)}


@router.post("/login")
def login(body: LoginRequest):
    """Log in. Returns JWT token + user."""
    user = _find_by_username(body.username)

    # Always run bcrypt — prevents user-enumeration via timing differences.
    stored = user["passwordHash"].encode("utf-8") if user else _DUMMY_HASH
    match = bcrypt.checkpw(body.password.encode("utf-8"), stored)

    if not user or not match:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {"token": _create_token(user["id"]), "user": _public_user(user)}


@router.get("/me")
def get_me(authorization: Optional[str] = Header(None)):
    """Current user profile + earned badges."""
    user = _require_user(authorization)
    return {
        "user": _public_user(user),
        "badges": _badges_for(user["id"]),
        "sightingCount": _sighting_count_for(user["id"]),
    }


@router.get("/profile/{username}")
def get_profile(username: str):
    """Public profile — no auth required."""
    user = _find_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "username": user["username"],
        "badges": _badges_for(user["id"]),
        "sightingCount": _sighting_count_for(user["id"]),
    }


@router.post("/friends/{username}")
def add_friend(username: str, authorization: Optional[str] = Header(None)):
    """Add a friend by username."""
    me = _require_user(authorization)
    if me["username"].lower() == username.lower():
        raise HTTPException(status_code=400, detail="You cannot add yourself")

    target = _find_by_username(username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    users = _load_users()
    for u in users:
        if u["id"] == me["id"]:
            if target["id"] in u["friendIds"]:
                raise HTTPException(status_code=409, detail="Already friends")
            u["friendIds"].append(target["id"])
            break
    _save_users(users)
    return {"ok": True, "friendUsername": target["username"]}


@router.delete("/friends/{username}")
def remove_friend(username: str, authorization: Optional[str] = Header(None)):
    """Remove a friend."""
    me = _require_user(authorization)
    target = _find_by_username(username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    users = _load_users()
    for u in users:
        if u["id"] == me["id"]:
            if target["id"] not in u["friendIds"]:
                raise HTTPException(status_code=404, detail="Not in your friends list")
            u["friendIds"].remove(target["id"])
            break
    _save_users(users)
    return {"ok": True}


@router.get("/friends")
def get_friends(authorization: Optional[str] = Header(None)):
    """List friends with their badges and sighting count."""
    me = _require_user(authorization)
    all_users = _load_users()
    friend_ids = set(me.get("friendIds", []))
    result = []
    for u in all_users:
        if u["id"] in friend_ids:
            result.append({
                "username": u["username"],
                "badges": _badges_for(u["id"]),
                "sightingCount": _sighting_count_for(u["id"]),
            })
    return result
