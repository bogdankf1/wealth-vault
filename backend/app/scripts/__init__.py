"""Dev/ops scripts.

Auto-load backend/.env so `python -m app.scripts.<name>` works without manually exporting
DATABASE_URL / SECRET_KEY / OPENAI_API_KEY. load_dotenv() never overrides existing env vars,
so a real deploy's injected environment still wins.
"""
from dotenv import load_dotenv

load_dotenv()
