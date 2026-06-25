"""
Retrieval service: the semantic arm of the agent.

pgvector cosine-similarity search over document_embeddings, ALWAYS scoped to a single
user (`WHERE user_id = :user_id`) so the agent can never read another tenant's rows.
Optional metadata pre-filters (source tables) narrow the search the same way a hybrid
keyword+vector system would.

Cosine distance is computed via pgvector's `<=>` operator, exposed by
pgvector.sqlalchemy's Vector.cosine_distance(). The query vector is bound as a literal
(string-cast), which is what makes this safe under the Supabase pgbouncer transaction
pooler where per-connection type codecs (register_vector) are unreliable.
"""
from dataclasses import dataclass
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rag.models import DocumentEmbedding
from app.services.embeddings import EmbeddingService, embedding_service


@dataclass
class RetrievedChunk:
    content: str
    source_table: str
    source_id: Optional[str]
    score: float  # cosine similarity in [0, 1] (higher = closer)
    metadata: Optional[dict]


class RetrievalService:
    def __init__(self, embedder: EmbeddingService = embedding_service) -> None:
        self.embedder = embedder

    async def search(
        self,
        db: AsyncSession,
        user_id: UUID,
        query: str,
        k: int = 8,
        source_tables: Optional[List[str]] = None,
    ) -> List[RetrievedChunk]:
        """Return the top-k most similar chunks for this user's query."""
        query_vec = await self.embedder.embed(query)
        distance = DocumentEmbedding.embedding.cosine_distance(query_vec)

        stmt = (
            select(DocumentEmbedding, distance.label("distance"))
            .where(DocumentEmbedding.user_id == user_id)
        )
        if source_tables:
            stmt = stmt.where(DocumentEmbedding.source_table.in_(source_tables))
        stmt = stmt.order_by(distance).limit(k)

        rows = (await db.execute(stmt)).all()
        return [
            RetrievedChunk(
                content=emb.content,
                source_table=emb.source_table,
                source_id=str(emb.source_id) if emb.source_id else None,
                score=round(1.0 - float(dist), 4),
                metadata=emb.meta,
            )
            for emb, dist in rows
        ]


retrieval_service = RetrievalService()
