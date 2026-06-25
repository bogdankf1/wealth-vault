"""
Embedding service for the RAG layer.

Uses OpenAI text-embedding-3-small (1536-dim) to stay consistent with the rest of the
app's OpenAI usage and avoid standing up a local model / GPU. The data already leaves the
trust boundary via the Vision pipeline, so this doesn't change the privacy posture.

Lazy async client, mirroring AIInsightsService in app/services/ai_insights.py.
"""
import os
from typing import List

from openai import AsyncOpenAI

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


class EmbeddingService:
    """Thin wrapper around the OpenAI embeddings endpoint."""

    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY environment variable not set")
            self._client = AsyncOpenAI(api_key=api_key)
        return self._client

    async def embed(self, text: str) -> List[float]:
        """Embed a single string (e.g. a user's question)."""
        resp = await self.client.embeddings.create(model=EMBEDDING_MODEL, input=text)
        return resp.data[0].embedding

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Embed many strings in one request. OpenAI returns them in input order."""
        if not texts:
            return []
        resp = await self.client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
        return [item.embedding for item in resp.data]


# Module-level singleton, reused across requests (the client is connection-pooled).
embedding_service = EmbeddingService()
