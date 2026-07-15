"""Demo accounts must be blocked server-side from real payment endpoints.

The frontend redirect is UI-only; a demo bearer token could otherwise POST straight
to Stripe/PayPal/Paddle. This verifies the `forbid_demo_users` dependency rejects a
demo user with 403 BEFORE any payment-provider call happens.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.security import create_access_token
from app.models.user import User, UserRole


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest_asyncio.fixture
async def client(db):
    # Route the app's DB dependency to the test's per-test NullPool session so
    # request handling stays on the test's event loop (see conftest docstring).
    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)


async def _make_demo_user(db) -> uuid.UUID:
    uid = uuid.uuid4()
    db.add(User(
        id=uid,
        email=f"demo+{uid.hex}@wealthvault.app",
        name="Demo User",
        role=UserRole.USER,
        is_demo=True,
        demo_expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    ))
    await db.commit()
    return uid


def _token(uid: uuid.UUID) -> str:
    return create_access_token(
        data={"sub": str(uid), "email": "d", "role": "USER", "tier": "wealth"}
    )


@pytest.mark.asyncio
async def test_demo_user_cannot_create_checkout(client, db):
    uid = await _make_demo_user(db)
    token = _token(uid)
    try:
        r = await client.post(
            "/api/v1/billing/create-checkout",
            json={
                "price_id": "price_test",
                "success_url": "https://example.com/ok",
                "cancel_url": "https://example.com/cancel",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403, r.text
        assert "demo" in r.text.lower()
    finally:
        await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": str(uid)})
        await db.commit()


@pytest.mark.asyncio
async def test_demo_user_cannot_activate_paypal(client, db):
    uid = await _make_demo_user(db)
    token = _token(uid)
    try:
        r = await client.post(
            "/api/v1/billing/paypal/activate",
            json={"subscription_id": "I-TEST"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403, r.text
        assert "demo" in r.text.lower()
    finally:
        await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": str(uid)})
        await db.commit()


@pytest.mark.asyncio
async def test_demo_user_cannot_activate_paddle(client, db):
    uid = await _make_demo_user(db)
    token = _token(uid)
    try:
        r = await client.post(
            "/api/v1/billing/paddle/activate",
            json={"subscription_id": "sub_test", "transaction_id": "txn_test"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403, r.text
        assert "demo" in r.text.lower()
    finally:
        await db.execute(text("DELETE FROM users WHERE id = :u"), {"u": str(uid)})
        await db.commit()
