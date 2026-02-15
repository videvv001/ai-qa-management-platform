"""
JWT-based authentication for the QA platform.
Credentials checked against env vars (USERNAME/PASSWORD or AI_TC_GEN_AUTH_*).
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

security = HTTPBearer(auto_error=False)


def _get_credentials() -> tuple[Optional[str], Optional[str]]:
    """Return (username, password) from config or env. Supports USERNAME/PASSWORD and AI_TC_GEN_AUTH_*."""
    import os

    s = get_settings()
    u = s.auth_username or os.environ.get("USERNAME")
    p = s.auth_password or os.environ.get("PASSWORD")
    return (u, p)


def auth_enabled() -> bool:
    """True if username and password are configured."""
    username, password = _get_credentials()
    return bool(username and password)


def create_token(username: str) -> str:
    """Create a JWT for the given username."""
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + timedelta(minutes=s.jwt_expire_minutes),
    }
    return jwt.encode(
        payload,
        s.jwt_secret,
        algorithm="HS256",
    )


def verify_token(token: str) -> Optional[dict[str, Any]]:
    """Verify JWT and return payload or None."""
    s = get_settings()
    try:
        return jwt.decode(token, s.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict[str, Any]:
    """
    Dependency that returns the current user from the JWT.
    If auth is disabled, returns a dummy user. If auth is enabled and token invalid/missing, raises 401.
    """
    s = get_settings()
    if not auth_enabled():
        return {"sub": "anonymous"}

    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )

    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return payload
