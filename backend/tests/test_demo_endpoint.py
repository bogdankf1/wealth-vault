import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.config import settings
from app.scripts.seed_demo_data import DEMO_USER_ID


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_create_demo_session(client, db, monkeypatch):
    # clone from the seeded demo user (the real template id isn't seeded in the test DB)
    monkeypatch.setattr(settings, "DEMO_TEMPLATE_USER_ID", str(DEMO_USER_ID))

    r = await client.post("/api/v1/auth/demo")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["access_token"]
    assert data["user"]["email"].startswith("demo+")
    uid = data["user"]["id"]

    cnt = await db.scalar(text("SELECT count(*) FROM savings_accounts WHERE user_id = :u"), {"u": uid})
    assert cnt > 0

    for t in ("income_transactions", "income_sources", "budgets"):
        await db.execute(text(f'DELETE FROM "{t}" WHERE user_id = :u'), {"u": uid})
    await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": uid})
    await db.commit()
