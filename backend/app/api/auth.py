"""
Basic login endpoint. Validates credentials against env vars and returns a JWT.
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.auth import auth_enabled, create_token
from app.core.config import get_settings

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest) -> LoginResponse:
    """
    Authenticate with username and password.
    Returns a JWT to use in the Authorization header.
    """
    if not auth_enabled():
        # When auth is disabled, accept any credentials for convenience
        return LoginResponse(token=create_token(req.username or "anonymous"))

    from app.core.auth import _get_credentials

    username, password = _get_credentials()
    if req.username != username or req.password != password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_token(req.username)
    return LoginResponse(token=token)


@router.get("/auth-enabled")
async def check_auth_enabled() -> dict:
    """Public endpoint to check if auth is required (frontend uses this)."""
    return {"auth_enabled": auth_enabled()}
