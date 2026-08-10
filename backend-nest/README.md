# Wealth Vault API v2 (NestJS)

Learning port of the FastAPI backend (`../backend`). Same Postgres DB, same JWTs,
same routes under `/api/v1` — a drop-in twin for the core API. See
`docs/superpowers/specs/2026-08-10-nestjs-backend-v2-design.md`.

## Rules of the road
- **Alembic (FastAPI side) owns the schema.** `synchronize: false`, always. No TypeORM migrations.
- Response/error JSON must match FastAPI byte-for-byte where practical — verify with `npm run parity`.

## Setup
1. `cp .env.example .env`, copy `DATABASE_URL`, `SECRET_KEY`, `REDIS_URL`, `GOOGLE_CLIENT_ID` from `../backend/.env` (strip `+asyncpg`).
2. `npm install`
3. Dev DB + Redis must be running (same ones FastAPI dev uses).

## Commands
- `npm run start:dev` — dev server on :8001 (swagger at /docs)
- `npm test` — unit tests
- `npm run test:e2e` — e2e (needs live dev DB + Redis)
- `npm run parity` — diff responses against FastAPI (both servers running; `TOKEN=<jwt>` for authed routes)
