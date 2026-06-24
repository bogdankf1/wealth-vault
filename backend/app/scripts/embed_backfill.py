"""
Embed existing user data into the pgvector store (document_embeddings).

Chunking strategy (the interesting design decision):
  * Structured records (expense, income transaction, subscription) are SHORT, so each
    becomes exactly ONE templated natural-language chunk — e.g.
    "2026-03-14 — Expense — Apple Store — $2499.00 USD — Electronics — MacBook Pro M4".
    We attach structured metadata (date/category/amount) for filtering + citation.
  * parsed_documents.raw_text is longer free text, so it is split into ~400-char chunks
    with small overlap (classic recursive splitting).

`source_table` + `source_id` link every chunk back to its origin row, which is what lets
the agent cite transactions and lets the evals assert "did it retrieve the right rows".

Embeddings are generated SYNCHRONOUSLY here (one batched OpenAI call). At a personal-
finance user's data volume this is sub-second and does not justify a background queue —
the existing Celery stack is intentionally left out of this path.

Run:
    DATABASE_URL=... OPENAI_API_KEY=... python -m app.scripts.embed_backfill
"""
import asyncio
from typing import Iterable
from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401  initialize app.models before importing module models (circular-import guard)
from app.modules.expenses.models import Expense
from app.modules.income.models import IncomeTransaction
from app.modules.subscriptions.models import Subscription
from app.modules.ai.models import AIInsight, UploadedFile  # noqa: F401 (FK registration)
from app.modules.rag.models import ParsedDocument, DocumentEmbedding
from app.services.embeddings import embedding_service

BATCH = 96  # OpenAI embeddings accept many inputs per call


def _date(value) -> str:
    return value.date().isoformat() if value else ""


def split_text(text: str, max_chars: int = 400, overlap: int = 80) -> list[str]:
    """Simple recursive-ish splitter for free text: pack sentences up to max_chars."""
    import re
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks, current = [], ""
    for s in sentences:
        if len(current) + len(s) + 1 <= max_chars:
            current = f"{current} {s}".strip()
        else:
            if current:
                chunks.append(current)
            # carry a little overlap for context continuity
            current = (current[-overlap:] + " " + s).strip() if overlap and current else s
    if current:
        chunks.append(current)
    return chunks or [text.strip()]


def _build_chunks_for_rows(expenses, incomes, subs, insights, docs) -> list[dict]:
    """Return a list of {content, source_table, source_id, chunk_index, metadata}."""
    chunks: list[dict] = []

    for e in expenses:
        parts = [_date(e.date), "Expense", e.name, f"${e.amount} {e.currency}",
                 e.category or "Uncategorized"]
        if e.description:
            parts.append(e.description)
        chunks.append({
            "content": " — ".join(p for p in parts if p),
            "source_table": "expense", "source_id": e.id, "chunk_index": 0,
            "metadata": {"date": _date(e.date), "category": e.category,
                          "amount": float(e.amount), "currency": e.currency, "name": e.name},
        })

    for t in incomes:
        parts = [_date(t.date), "Income", t.description or "Income received",
                 f"${t.amount} {t.currency}", t.category or "Uncategorized"]
        chunks.append({
            "content": " — ".join(p for p in parts if p),
            "source_table": "income_transaction", "source_id": t.id, "chunk_index": 0,
            "metadata": {"date": _date(t.date), "category": t.category,
                          "amount": float(t.amount), "currency": t.currency},
        })

    for s in subs:
        parts = ["Subscription", s.name, f"${s.amount} {s.currency}/{s.frequency}",
                 s.category or "Uncategorized"]
        if s.description:
            parts.append(s.description)
        chunks.append({
            "content": " — ".join(p for p in parts if p),
            "source_table": "subscription", "source_id": s.id, "chunk_index": 0,
            "metadata": {"category": s.category, "amount": float(s.amount),
                          "currency": s.currency, "name": s.name, "status": s.status},
        })

    for ins in insights:
        chunks.append({
            "content": f"Insight ({ins.insight_type}): {ins.content}",
            "source_table": "ai_insight", "source_id": ins.id, "chunk_index": 0,
            "metadata": {"insight_type": ins.insight_type},
        })

    for doc in docs:
        if not doc.raw_text:
            continue
        for i, piece in enumerate(split_text(doc.raw_text)):
            chunks.append({
                "content": piece,
                "source_table": "parsed_document", "source_id": doc.id, "chunk_index": i,
                "metadata": {"doc_type": doc.doc_type},
            })

    return chunks


async def _user_ids_with_data(session: AsyncSession) -> set[UUID]:
    ids: set[UUID] = set()
    for model in (Expense, IncomeTransaction, Subscription, ParsedDocument):
        rows = await session.execute(select(model.user_id).distinct())
        ids.update(r[0] for r in rows.all())
    return ids


async def backfill_user(session: AsyncSession, user_id: UUID) -> int:
    expenses = (await session.execute(select(Expense).where(Expense.user_id == user_id))).scalars().all()
    incomes = (await session.execute(select(IncomeTransaction).where(IncomeTransaction.user_id == user_id))).scalars().all()
    subs = (await session.execute(select(Subscription).where(Subscription.user_id == user_id))).scalars().all()
    insights = (await session.execute(select(AIInsight).where(AIInsight.user_id == user_id))).scalars().all()
    docs = (await session.execute(select(ParsedDocument).where(ParsedDocument.user_id == user_id))).scalars().all()

    chunks = _build_chunks_for_rows(expenses, incomes, subs, insights, docs)
    if not chunks:
        return 0

    # Idempotent: replace this user's embeddings.
    await session.execute(delete(DocumentEmbedding).where(DocumentEmbedding.user_id == user_id))

    for start in range(0, len(chunks), BATCH):
        batch = chunks[start:start + BATCH]
        vectors = await embedding_service.embed_batch([c["content"] for c in batch])
        for chunk, vec in zip(batch, vectors):
            session.add(DocumentEmbedding(
                user_id=user_id,
                source_table=chunk["source_table"],
                source_id=chunk["source_id"],
                chunk_index=chunk["chunk_index"],
                content=chunk["content"],
                embedding=vec,
                meta=chunk["metadata"],
            ))
    await session.commit()
    return len(chunks)


async def main() -> None:
    async with AsyncSessionLocal() as session:
        user_ids = await _user_ids_with_data(session)
        total = 0
        for uid in user_ids:
            n = await backfill_user(session, uid)
            total += n
            print(f"  user {uid}: {n} chunks embedded")
        print(f"✅ Backfill complete: {total} chunks across {len(user_ids)} user(s)")


if __name__ == "__main__":
    asyncio.run(main())
