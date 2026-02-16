"""
Single entrypoint for the QA platform backend.

Run from backend directory: uvicorn app.main:app --reload
"""
from fastapi import FastAPI

from app.core.config import get_settings
from app.core.logging_config import configure_logging
from app.api import register_routes
from app.database.connection import init_db
from fastapi.middleware.cors import CORSMiddleware

def create_app() -> FastAPI:
    """
    Application factory for the FastAPI app.
    """
    configure_logging()

    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description=(
            "Backend service for AI-assisted test case generation and "
            "personal QA management with persistent test projects."
        ),
        version="0.1.0",
    )

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_routes(app)

    @app.on_event("startup")
    async def _on_startup() -> None:  # pragma: no cover - side-effect wiring
        init_db()

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
