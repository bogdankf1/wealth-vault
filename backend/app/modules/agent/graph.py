"""
Compile the financial Q&A agent's StateGraph and expose entrypoints.

Graph shape (real branching + a real cycle):

    START → route ─┬─(compute)─→ compute ─┬─(hybrid)──→ retrieve ─→ synthesize
                   │                       └─(else)────────────────→ synthesize
                   ├─(semantic)→ retrieve ─────────────────────────→ synthesize
                   └─(refuse)──→ refuse → END
                              synthesize → validate ─┬─(ok)─────→ END
                                                     ├─(retry)──→ synthesize   ← cycle
                                                     └─(refuse)─→ refuse → END

The compiled graph is a stateless module-level singleton (see state.py).
"""
import time
from typing import AsyncIterator
from uuid import UUID

from langgraph.graph import StateGraph, START, END

from app.modules.agent import nodes
from app.modules.agent.state import AgentState

_compiled = None

# Friendly, user-facing labels for each node — surfaced as "status" SSE events so the UI
# can show "Routing… / Computing… / Searching… / Writing… / Checking…" and, not incidentally,
# make the graph's branching visible to anyone watching.
NODE_LABELS = {
    "classify": "Routing your question…",
    "compute": "Computing exact figures…",
    "retrieve": "Searching your transactions…",
    "synthesize": "Writing the answer…",
    "validate": "Checking the numbers…",
    "refuse": "Preparing a response…",
    "capability": "Preparing a response…",
    "propose_action": "Preparing an action…",
}


def build_graph():
    b = StateGraph(AgentState)
    # Node is named "classify" (not "route") because LangGraph forbids a node name that
    # matches a state key, and `route` is the state field holding the decision.
    b.add_node("classify", nodes.route_node)
    b.add_node("compute", nodes.compute_node)
    b.add_node("retrieve", nodes.retrieve_node)
    b.add_node("synthesize", nodes.synthesize_node)
    b.add_node("validate", nodes.validate_node)
    b.add_node("refuse", nodes.refuse_node)
    b.add_node("capability", nodes.capability_node)
    b.add_node("propose_action", nodes.propose_action)

    b.add_edge(START, "classify")
    b.add_conditional_edges("classify", nodes.route_decider, {
        "compute": "compute", "semantic": "retrieve", "hybrid": "compute", "refuse": "refuse",
        "capability": "capability", "action": "propose_action",
    })
    b.add_edge("capability", END)
    b.add_edge("propose_action", END)
    b.add_conditional_edges("compute", nodes.after_compute, {
        "retrieve": "retrieve", "synthesize": "synthesize",
    })
    b.add_edge("retrieve", "synthesize")
    b.add_edge("synthesize", "validate")
    b.add_conditional_edges("validate", nodes.after_validate, {
        "ok": END, "retry": "synthesize", "refuse": "refuse",
    })
    b.add_edge("refuse", END)
    return b.compile()


def get_graph():
    global _compiled
    if _compiled is None:
        _compiled = build_graph()
    return _compiled


def _initial_state(question: str, user_id: UUID, history: list | None = None) -> dict:
    return {"question": question, "user_id": str(user_id), "history": history or [],
            "retries": 0, "steps": [], "cited_ids": [], "retrieved": []}


def format_result(final: dict) -> dict:
    """Shape the final graph state into the API/eval response."""
    return {
        "answer": final.get("answer") or final.get("draft", ""),
        "route": final.get("route"),
        "refused": bool(final.get("refused", False)),
        "cited_ids": final.get("cited_ids", []),
        "computed": (final.get("computed") or {}).get("results"),
        "retrieved": [
            {"content": c["content"], "source_table": c["source_table"],
             "source_id": c["source_id"], "score": c["score"]}
            for c in final.get("retrieved", [])
        ],
        "steps": final.get("steps", []),
        "validation": final.get("validation"),
        "proposed_action": final.get("proposed_action"),
    }


async def run_agent(question: str, user_id: UUID, history: list | None = None) -> dict:
    """Non-streaming run — used by the JSON endpoint and the evals."""
    final = await get_graph().ainvoke(_initial_state(question, user_id, history))
    return format_result(final)


async def astream_agent(question: str, user_id: UUID, history: list | None = None) -> AsyncIterator[dict]:
    """
    Stream the agent as typed events for SSE:
      {type: "status", node, label}      — emitted once per node as the graph branches.
      {type: "ttft", ttft_ms}            — the moment the FIRST answer token is produced.
      {type: "token", text}              — answer token deltas (synthesize node only).
      {type: "done", result}             — final structured result + ttft_ms/total_ms.

    Token deltas are filtered to the synthesize node via metadata.langgraph_node so the
    router's structured-output call doesn't leak tokens into the answer stream. TTFT is
    measured server-side from request start to first emitted token.
    """
    graph = get_graph()
    t0 = time.perf_counter()
    first_token_at: float | None = None
    root_run_id = None
    final_state: dict = {}
    emitted_status: set[str] = set()

    async for ev in graph.astream_events(_initial_state(question, user_id, history), version="v2"):
        kind = ev["event"]
        name = ev.get("name")
        meta = ev.get("metadata", {}) or {}

        if root_run_id is None and kind == "on_chain_start":
            root_run_id = ev.get("run_id")

        if kind == "on_chain_start" and name in NODE_LABELS and name not in emitted_status:
            emitted_status.add(name)
            yield {"type": "status", "node": name, "label": NODE_LABELS[name]}

        elif kind == "on_chat_model_stream" and meta.get("langgraph_node") == "synthesize":
            chunk = ev["data"]["chunk"]
            text = getattr(chunk, "content", "") or ""
            if text:
                if first_token_at is None:
                    first_token_at = time.perf_counter()
                    yield {"type": "ttft", "ttft_ms": round((first_token_at - t0) * 1000, 1)}
                yield {"type": "token", "text": text}

        elif kind == "on_chain_end" and ev.get("run_id") == root_run_id:
            final_state = ev["data"]["output"]

    result = format_result(final_state)
    result["ttft_ms"] = round((first_token_at - t0) * 1000, 1) if first_token_at else None
    result["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    yield {"type": "done", "result": result}
