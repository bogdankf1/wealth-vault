"""Typed state passed between LangGraph nodes.

The compiled graph is a stateless module-level singleton; ALL per-request, per-tenant data
lives in this object (plus the user_id seeded into the initial state). Nodes open their own
short-lived DB sessions, so nothing mutable is shared across requests — that's how state
leakage is avoided under concurrency.
"""
from typing import Any, Optional, TypedDict


class AgentState(TypedDict, total=False):
    # inputs
    question: str
    user_id: str  # UUID as string
    history: list  # prior turns [{role: "user"|"assistant", content: str}] for follow-ups

    # routing
    route: str            # "compute" | "semantic" | "hybrid" | "refuse"
    plan: dict            # {tool_calls: [...], search_query: str|None, reason: str}

    # working data
    computed: Optional[dict]   # {results: [tool dicts], cited_ids: [...]}
    retrieved: list            # [{content, source_table, source_id, score, metadata}]
    cited_ids: list            # union of ids the answer is grounded on

    # synthesis + validation
    draft: str
    validation: dict           # {ok: bool, reason: str, decision: str}
    retries: int
    strict: bool               # set on a grounding-retry to tighten synthesis

    # outputs
    answer: str
    refused: bool
    steps: list[dict[str, Any]]  # node-by-node trace, surfaced to the UI/stream
    proposed_action: Optional[dict]  # {action_type, args} when the turn proposes a write (Level D)
