from fastapi import APIRouter, Depends, FastAPI

from app.core.auth import get_current_user
from app.core.config import get_settings

from . import auth, health, testcases, projects, modules, dashboard


def get_api_router() -> APIRouter:
    """
    Aggregate and return the root API router.
    """
    root_router = APIRouter()

    # Public routes (no auth)
    root_router.include_router(
        health.router,
        prefix="",
        tags=["health"],
    )
    root_router.include_router(
        auth.router,
        prefix="/auth",
        tags=["auth"],
    )

    # Protected routes (require auth when configured)
    protected = APIRouter(dependencies=[Depends(get_current_user)])
    protected.include_router(testcases.router, prefix="/testcases", tags=["testcases"])
    protected.include_router(projects.router, prefix="/projects", tags=["projects"])
    protected.include_router(modules.router, prefix="", tags=["modules"])
    protected.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
    root_router.include_router(protected)

    return root_router


def register_routes(app: FastAPI) -> None:
    """
    Attach all API routes to the FastAPI application.
    """
    settings = get_settings()
    api_router = get_api_router()
    app.include_router(api_router, prefix=settings.api_prefix)
