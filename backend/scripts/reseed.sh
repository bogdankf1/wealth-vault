#!/usr/bin/env bash
#
# Re-seed the dev database AND rebuild RAG embeddings, in the correct order.
#
# Why this exists: `seed_demo_data` replaces the rows that embeddings point at, so a bare
# re-seed leaves `document_embeddings` stale/empty and the agent's semantic/hybrid answers
# silently degrade (a footgun we hit repeatedly). Always run this instead of seeding alone.
#
# Usage (from anywhere, with your backend venv active):
#   backend/scripts/reseed.sh
#
# Reads DATABASE_URL / OPENAI_API_KEY from backend/.env automatically (app.scripts loads it).
set -euo pipefail

cd "$(dirname "$0")/.."   # -> backend/

echo "→ Seeding demo data…"
python -m app.scripts.seed_demo_data

echo "→ Rebuilding embeddings (embed_backfill)…"
python -m app.scripts.embed_backfill

echo "✅ Reseed complete — demo data + embeddings are in sync."
