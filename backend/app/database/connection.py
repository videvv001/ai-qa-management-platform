from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from app.core.config import get_settings


Base = declarative_base()


def _get_database_url() -> str:
    """
    Resolve the database URL from settings.

    Defaults to a local SQLite database in the backend working directory.
    """
    settings = get_settings()
    # type: ignore[attr-defined] - added dynamically to settings
    return getattr(settings, "database_url", "sqlite:///./testcases.db")


_ENGINE = create_engine(
    _get_database_url(),
    connect_args={"check_same_thread": False} if "sqlite" in _get_database_url() else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_ENGINE)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that provides a database session and ensures it is closed.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Create all database tables and run migrations.

    Import models inside the function to avoid import cycles.
    """
    # Import here so models are registered on Base before create_all.
    from app.database import models  # noqa: F401

    Base.metadata.create_all(bind=_ENGINE)

    url = _get_database_url()

    # Migration: add status column to modules if missing (SQLite)
    if "sqlite" in url:
        with _ENGINE.connect() as conn:
            cursor = conn.execute(
                text("SELECT 1 FROM pragma_table_info('modules') WHERE name='status'")
            )
            if cursor.fetchone() is None:
                conn.execute(text("ALTER TABLE modules ADD COLUMN status VARCHAR(32) DEFAULT 'to do' NOT NULL"))
                conn.commit()

    # Migration: add test_data column to test_cases if missing (SQLite)
    if "sqlite" in url:
        with _ENGINE.connect() as conn:
            cursor = conn.execute(
                text("SELECT 1 FROM pragma_table_info('test_cases') WHERE name='test_data'")
            )
            if cursor.fetchone() is None:
                conn.execute(text("ALTER TABLE test_cases ADD COLUMN test_data TEXT"))
                conn.commit()


@contextmanager
def db_session() -> Generator[Session, None, None]:
    """
    Convenience context manager for non-request scoped usage (e.g. scripts).
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

