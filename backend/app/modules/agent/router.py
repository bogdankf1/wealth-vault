"""
Agent API.

POST /api/v1/agent/query   — non-streaming JSON. Returns the answer plus the structured
                             fields the evals assert on (route, refused, cited_ids,
                             computed). The SSE streaming endpoint is added in Phase 4 and
                             drives the same compiled graph.
"""
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.permissions import get_current_user
from app.models.user import User
from app.modules.agent.graph import run_agent, astream_agent

router = APIRouter(prefix="/agent", tags=["agent"])

# Headers that keep an SSE stream from being buffered by proxies / nginx / gzip.
SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


class AgentQueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    # Recent prior turns for follow-ups: [{role: "user"|"assistant", content: str}].
    history: list[dict] = Field(default_factory=list)


class AgentQueryResponse(BaseModel):
    answer: str
    route: str | None = None
    refused: bool = False
    cited_ids: list[str] = []
    computed: list[dict] | None = None
    retrieved: list[dict] = []
    steps: list[dict] = []
    validation: dict | None = None


@router.post("/query", response_model=AgentQueryResponse)
async def query_agent(
    body: AgentQueryRequest,
    current_user: User = Depends(get_current_user),
) -> AgentQueryResponse:
    result = await run_agent(body.question, current_user.id, body.history)
    return AgentQueryResponse(**result)


@router.post("/stream")
async def stream_agent(
    body: AgentQueryRequest,
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Token-by-token SSE stream of the agent, with intermediate node-status events and
    a server-measured TTFT. The frontend consumes this with fetch + ReadableStream (not
    EventSource) so it can send the Bearer token."""
    user_id = current_user.id
    history = body.history

    async def event_source():
        try:
            async for event in astream_agent(body.question, user_id, history):
                yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
        except Exception as exc:  # surface errors to the client instead of a dead stream
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream", headers=SSE_HEADERS)
