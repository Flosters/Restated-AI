"""
Shared test fixtures for Restated AI tests.
Uses an in-memory SQLite database so tests never touch production data.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

import app.database as database_module
from app.database import Base, get_db
from app.main import app


# In-memory SQLite for tests.
# StaticPool ensures all connections share the same in-memory database
# (without it, each connection gets its own empty database).
TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


@pytest.fixture(autouse=True)
def setup_test_db():
    """Create all tables before each test, drop them after."""
    Base.metadata.create_all(bind=TEST_ENGINE)

    # Also patch the module-level engine/SessionLocal so any code that
    # imports them directly (e.g. amendment.py using SessionLocal)
    # hits the test database instead of production.
    original_engine = database_module.engine
    original_session_local = database_module.SessionLocal
    database_module.engine = TEST_ENGINE
    database_module.SessionLocal = TestSessionLocal

    yield

    database_module.engine = original_engine
    database_module.SessionLocal = original_session_local
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture
def db(setup_test_db):
    """Provide a transactional test database session."""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    """
    FastAPI TestClient wired to the test database.
    Overrides the app's `get_db` dependency so no production DB is touched.
    """
    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
