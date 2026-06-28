"""
Agent API.

POST /api/v1/agent/query   — non-streaming JSON. Returns the answer plus the structured
                             fields the evals assert on (route, refused, cited_ids,
                             computed). The SSE streaming endpoint is added in Phase 4 and
                             drives the same compiled graph.
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError

from app.core.permissions import get_current_user
from app.models.user import User
from app.modules.agent.graph import run_agent, astream_agent
from app.core.database import AsyncSessionLocal
from app.modules.agent.actions import commit_action, ActionError

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
    proposed_action: dict | None = None  # Level D: a typed action awaiting user confirmation


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


class ConfirmActionRequest(BaseModel):
    action_type: str = Field(..., min_length=1, max_length=50)
    args: dict = Field(default_factory=dict)
    idempotency_key: str = Field(..., min_length=8, max_length=100)


@router.post("/actions/confirm")
async def confirm_action(
    body: ConfirmActionRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Deterministically commit a proposed agent action (no LLM). The sole write path; the
    action is re-validated server-side and scoped to the authenticated user."""
    async with AsyncSessionLocal() as db:
        try:
            return await commit_action(db, current_user.id, body.action_type,
                                       body.args, body.idempotency_key)
        except ActionError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
