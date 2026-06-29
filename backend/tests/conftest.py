"""Shared fixtures for agent tests.

These run against a database already seeded by app.scripts.seed_demo_data (locally or in
CI). They verify the COMPUTE ARM directly — no LLM, no API key — so they're a fast,
deterministic gate complementary to the Promptfoo agent evals.

Each test gets its OWN NullPool engine, created and disposed within that test's event loop.
The app's shared engine is connection-pooled and binds to a single loop; pytest-asyncio
runs each test in a fresh loop, so reusing the pooled engine raises "Event loop is closed".
A per-test NullPool engine sidesteps that without touching application code.
"""
import pytest
import pytest_asyncio
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.scripts.seed_demo_data import DEMO_USER_ID

# Idempotency keys hard-coded in test_actions.py — purge them before each run of that
# module so the tests are idempotent across repeated invocations against the same DB.
_TEST_ACTION_IDEM_KEYS = {"idem-happy-1", "idem-bad-1", "idem-bad-2", "idem-dup", "idem-scope-1",
                         "idem-atomic-1", "idem-race-1"}


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def user_id():
    return DEMO_USER_ID


@pytest_asyncio.fixture(autouse=True)
async def _clean_agent_action_logs(request, db, user_id):
    """Before each test in test_actions.py, delete stale action-log rows for the
    hard-coded idempotency keys so the tests are repeatable against the same DB."""
    if "test_actions" in str(getattr(request.module, "__file__", "")):
        from app.modules.agent.models import AgentActionLog
        await db.execute(
            delete(AgentActionLog).where(
                AgentActionLog.user_id == user_id,
                AgentActionLog.idempotency_key.in_(_TEST_ACTION_IDEM_KEYS),
            )
        )
        await db.commit()
    yield
