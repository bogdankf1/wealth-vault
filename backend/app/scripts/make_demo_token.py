"""
Mint a long-lived JWT for the seeded demo user.

Used by the eval harness (Promptfoo sends it as the Bearer token) and for manual curling
of the agent endpoints. Signed with SECRET_KEY via the app's own create_access_token, so
get_current_user accepts it like any real token.

    DATABASE_URL=... SECRET_KEY=... python -m app.scripts.make_demo_token
"""
from datetime import timedelta

from app.core.security import create_access_token
from app.scripts.seed_demo_data import DEMO_USER_ID, DEMO_EMAIL


def make_token() -> str:
    return create_access_token(
        data={"sub": str(DEMO_USER_ID), "email": DEMO_EMAIL, "role": "USER", "tier": "wealth"},
        expires_delta=timedelta(days=30),
    )


if __name__ == "__main__":
    print(make_token())
