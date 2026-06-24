"""
LangGraph nodes for the financial Q&A agent.

Branching is real:
  route → {compute | semantic | hybrid | refuse}        (LLM structured-output decision)
  compute → {retrieve (if hybrid) | synthesize}
  synthesize → validate
  validate → {END | synthesize (grounding retry) | refuse}   (programmatic, with retry guard)

LLMs:
  * route      — gpt-4o-mini with structured output (picks tools + args, or refuses).
  * synthesize — gpt-4o-mini, streamed in the SSE endpoint via astream_events.
  * validate   — NO LLM. Deterministic numeric-grounding + sufficiency checks make the
                 gate reliable and cheap, and give the evals something exact to assert.
"""
import os
import re
from datetime import date
from typing import List, Literal, Optional
from uuid import UUID

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.core.database import AsyncSessionLocal
from app.modules.agent.state import AgentState
from app.modules.agent.tools import run_tool
from app.services.retrieval import retrieval_service

MAX_RETRIES = 1  # one grounding self-correction pass, then refuse

# What the router is allowed to choose. Kept in sync with tools.TOOLS.
ROUTE_TOOL_CATALOG = """\
Available compute tools (you choose which to call and fill the args):
- sum_expenses(category?, start?, end?): total spending; optional category and [start,end) date range.
- total_income(start?, end?): total income received over [start,end).
- net_worth(): sum of current account balances.
- list_subscriptions(active_only=true): active subscriptions and combined monthly cost.
- find_expenses(category?, min_amount?, start?, end?, limit?): list largest matching expenses.
Dates are ISO (YYYY-MM-DD). `end` is EXCLUSIVE — for "May 2026" use start=2026-05-01, end=2026-06-01.
"""


class ToolCall(BaseModel):
    tool: str = Field(description="one of the compute tool names")
    args: dict = Field(default_factory=dict, description="keyword args for the tool")


class RouteDecision(BaseModel):
    """Structured routing decision returned by the router LLM."""
    route: Literal["compute", "semantic", "hybrid", "refuse"]
    reason: str
    tool_calls: List[ToolCall] = Field(default_factory=list)
    search_query: Optional[str] = Field(
        default=None, description="natural-language query for semantic retrieval (semantic/hybrid)"
    )


_route_llm: Optional[ChatOpenAI] = None
_synth_llm: Optional[ChatOpenAI] = None


def get_route_llm() -> ChatOpenAI:
    global _route_llm
    if _route_llm is None:
        _route_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0,
                                api_key=os.getenv("OPENAI_API_KEY"))
    return _route_llm


def get_synth_llm(streaming: bool = False) -> ChatOpenAI:
    """Synthesis model. `streaming=True` lets astream_events emit token deltas (SSE)."""
    return ChatOpenAI(model="gpt-4o-mini", temperature=0.2, streaming=streaming,
                      api_key=os.getenv("OPENAI_API_KEY"))


def _trace(state: AgentState, node: str, detail: str) -> list:
    steps = list(state.get("steps", []))
    steps.append({"node": node, "detail": detail})
    return steps


def _history_messages(history) -> list:
    """Convert prior turns [{role, content}] into LangChain message tuples so the router and
    synthesizer have conversation context (lets follow-ups resolve "it"/"that")."""
    role_map = {"user": "human", "assistant": "ai"}
    msgs = []
    for m in (history or []):
        content = (m or {}).get("content") or ""
        if content:
            msgs.append((role_map.get(m.get("role"), "human"), content))
    return msgs


# --------------------------------------------------------------------------- route
ROUTE_SYSTEM = """You are the router for a personal-finance assistant. Decide how to answer \
the user's question about THEIR OWN financial data. Use the conversation so far to resolve \
references like "it"/"that"/"those" — e.g. a follow-up "how is it distributed?" after a net-worth \
question means "how is my net worth distributed across my accounts".

Choose route:
- "compute"  : any FACTUAL question answerable from the user's data — totals, balances, counts, \
breakdowns/distributions (e.g. "how is my net worth split across accounts", "my spending by \
category"), AND rankings/superlatives ("biggest/most expensive purchase", "top expenses" — \
find_expenses sorts by amount). net_worth returns the per-account balances, so a net-worth \
breakdown IS a compute question. Provide tool_calls.
- "semantic" : qualitative/fuzzy question best answered by searching the user's transactions \
and documents (e.g. "what was that big electronics purchase?"). Provide search_query.
- "hybrid"   : needs BOTH an exact number AND context. Provide tool_calls AND search_query.
- "refuse"   : ONLY for things outside the user's tracked data — general knowledge, chit-chat, \
or ADVICE/RECOMMENDATIONS ("what should I buy/invest/do"). A factual breakdown of existing data \
is NOT a refusal. Provide a short reason.

Numbers must come from tools, never guessed. {catalog}
Today's date is {today}."""


async def route_node(state: AgentState) -> dict:
    llm = get_route_llm().with_structured_output(RouteDecision)
    system = ROUTE_SYSTEM.format(catalog=ROUTE_TOOL_CATALOG, today=date.today().isoformat())
    decision: RouteDecision = await llm.ainvoke(
        [("system", system), *_history_messages(state.get("history")), ("human", state["question"])]
    )
    plan = {
        "tool_calls": [tc.model_dump() for tc in decision.tool_calls],
        "search_query": decision.search_query,
        "reason": decision.reason,
    }
    return {
        "route": decision.route,
        "plan": plan,
        "steps": _trace(state, "route", f"route={decision.route}: {decision.reason}"),
    }


def route_decider(state: AgentState) -> str:
    return state.get("route", "refuse")


# ------------------------------------------------------------------------- compute
async def compute_node(state: AgentState) -> dict:
    user_id = UUID(state["user_id"])
    calls = state.get("plan", {}).get("tool_calls", [])
    results, cited = [], []
    async with AsyncSessionLocal() as db:
        for call in calls:
            res = await run_tool(db, user_id, call.get("tool", ""), call.get("args", {}))
            results.append(res)
            cited.extend(res.get("cited_ids", []))
    detail = ", ".join(f"{r.get('tool')}→{r.get('total', r.get('count', 'ok'))}" for r in results) or "no tools"
    return {
        "computed": {"results": results, "cited_ids": cited},
        "cited_ids": list(dict.fromkeys(state.get("cited_ids", []) + cited)),
        "steps": _trace(state, "compute", detail),
    }


def after_compute(state: AgentState) -> str:
    return "retrieve" if state.get("route") == "hybrid" else "synthesize"


# ------------------------------------------------------------------------ retrieve
async def retrieve_node(state: AgentState) -> dict:
    user_id = UUID(state["user_id"])
    query = state.get("plan", {}).get("search_query") or state["question"]
    # Broaden k on a retry pass.
    k = 12 if state.get("retries", 0) > 0 else 8
    async with AsyncSessionLocal() as db:
        chunks = await retrieval_service.search(db, user_id, query, k=k)
    retrieved = [
        {"content": c.content, "source_table": c.source_table, "source_id": c.source_id,
         "score": c.score, "metadata": c.metadata}
        for c in chunks
    ]
    cited = [c["source_id"] for c in retrieved if c["source_id"]]
    return {
        "retrieved": retrieved,
        "cited_ids": list(dict.fromkeys(state.get("cited_ids", []) + cited)),
        "steps": _trace(state, "retrieve", f"{len(retrieved)} chunks for '{query[:48]}'"),
    }


# ----------------------------------------------------------------------- synthesize
SYNTH_SYSTEM = """You are a precise personal-finance assistant. Answer the user's question \
using ONLY the evidence provided (computed results and/or retrieved context).

Rules:
- State exact base numbers from the computed results verbatim — never invent a figure.
- You MAY do arithmetic (add, subtract, multiply, divide, percentage) on those exact figures to \
answer derived / "what-if" questions. Show it as a SINGLE step `A op B = C` (e.g. "$320.50 - \
$190.00 = $130.50" or "15% of $23,820.50 = $3,573.08") — one operation only, no chaining \
("= X = Y") and no intermediate decimals. Every operand must be an exact figure from the evidence \
or a number from the question.
- If you reference a transaction, mention it naturally (merchant, amount, date).
- Be concise (1-4 sentences). Use the user's currency (USD).
- If the evidence is empty or doesn't answer the question, say you don't have that data."""


def _evidence_block(state: AgentState) -> str:
    parts = []
    computed = state.get("computed")
    if computed and computed.get("results"):
        parts.append("COMPUTED RESULTS:")
        for r in computed["results"]:
            parts.append(f"- {r}")
    retrieved = state.get("retrieved")
    if retrieved:
        parts.append("\nRETRIEVED CONTEXT:")
        for c in retrieved[:8]:
            parts.append(f"- ({c['source_table']}, score={c['score']}) {c['content']}")
    return "\n".join(parts) if parts else "(no evidence found)"


async def synthesize_node(state: AgentState) -> dict:
    strict = state.get("strict", False)
    system = SYNTH_SYSTEM + (
        "\nIMPORTANT: a previous answer had an ungrounded or mis-calculated number. Re-answer "
        "using ONLY exact figures from the evidence, and show every calculation explicitly as "
        "`A op B = C`, double-checking the arithmetic." if strict else ""
    )
    human = f"Question: {state['question']}\n\nEvidence:\n{_evidence_block(state)}"
    # streaming=True so the SSE endpoint's astream_events captures token deltas; ainvoke
    # still returns the full message for the non-streaming /query path.
    llm = get_synth_llm(streaming=True)
    msg = await llm.ainvoke(
        [("system", system), *_history_messages(state.get("history")), ("human", human)]
    )
    draft = msg.content if isinstance(msg.content, str) else str(msg.content)
    return {"draft": draft, "steps": _trace(state, "synthesize", f"{len(draft)} chars")}


# ------------------------------------------------------------------------- validate
# Only $-amounts and decimal/cents numbers count as financial claims to ground. Bare
# integers (years like "2026", dates, plain counts) are ignored so prose doesn't trip the
# grounding check — otherwise "...in May 2026" reads "2026" as an ungrounded figure.
_MONEY_RE = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*\.\d{2}")


def _numbers_in(text: str) -> set[float]:
    out = set()
    for m in _MONEY_RE.finditer(text or ""):
        token = m.group(0).replace("$", "").replace(",", "").strip()
        try:
            out.add(round(float(token), 2))
        except ValueError:
            pass
    return out


def _computed_numbers(state: AgentState) -> set[float]:
    nums: set[float] = set()
    computed = state.get("computed") or {}
    for r in computed.get("results", []):
        for key in ("total", "monthly_total", "count"):
            if isinstance(r.get(key), (int, float)):
                nums.add(round(float(r[key]), 2))
        for acc in r.get("accounts", []) or []:
            nums.add(round(float(acc["balance"]), 2))
        for item in r.get("items", []) or []:
            if "amount" in item:
                nums.add(round(float(item["amount"]), 2))
    return nums


# Looser extraction for the QUESTION — user-supplied operands ("subtract 190") may have no
# $/decimals, so accept bare integers here (these are allowed operands).
_ANY_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _question_numbers(text: str) -> set[float]:
    out = set()
    for m in _ANY_NUM_RE.finditer(text or ""):
        try:
            out.add(round(float(m.group(0).replace(",", "")), 2))
        except ValueError:
            pass
    return out


def _derivable(n: float, base: list[float]) -> bool:
    """True if n is a grounded figure, or a SINGLE arithmetic step (+, -, *, /, or 'a% of b')
    over two grounded figures. This grounds legitimate derived / what-if numbers while still
    rejecting a hallucinated or mis-calculated one (which won't equal any such combination) —
    and it's independent of how the LLM phrases the calculation."""
    if any(abs(n - b) < 0.01 for b in base):
        return True
    for a in base:
        for b in base:
            cands = [a + b, a - b, a * b]
            if b:
                cands.append(a / b)
                cands.append(a / 100.0 * b)  # "a% of b"
            if any(abs(n - c) < 0.01 for c in cands):
                return True
    return False


async def validate_node(state: AgentState) -> dict:
    route = state.get("route")
    draft = state.get("draft", "")
    used_compute = route in ("compute", "hybrid") and bool((state.get("computed") or {}).get("results"))
    has_evidence = bool((state.get("computed") or {}).get("results")) or bool(state.get("retrieved"))

    # Sufficiency: nothing to ground an answer on → refuse rather than hallucinate.
    if not has_evidence:
        return {"validation": {"ok": False, "reason": "no evidence", "decision": "refuse"},
                "steps": _trace(state, "validate", "insufficient evidence → refuse")}

    # Numeric grounding: every $-figure in the answer must be a tool figure, a number from the
    # question, or the (independently re-verified) result of a shown calculation. Arithmetic is
    # re-computed deterministically, so a wrong LLM calculation fails grounding and retries.
    grounded = True
    reason = "grounded"
    if used_compute:
        base = list(_computed_numbers(state) | _question_numbers(state.get("question", "")))
        unmatched = [n for n in _numbers_in(draft) if not _derivable(n, base)]
        grounded = not unmatched
        if unmatched:
            reason = "ungrounded number"

    retries = state.get("retries", 0)
    if grounded:
        return {"validation": {"ok": True, "reason": "grounded", "decision": "ok"},
                "answer": draft,
                "steps": _trace(state, "validate", "grounded ✓")}
    if retries < MAX_RETRIES:
        return {"validation": {"ok": False, "reason": reason, "decision": "retry"},
                "retries": retries + 1, "strict": True,
                "steps": _trace(state, "validate", f"{reason} → retry synthesis (strict)")}
    return {"validation": {"ok": False, "reason": "could not ground the answer", "decision": "refuse"},
            "steps": _trace(state, "validate", f"{reason} → refuse")}


def after_validate(state: AgentState) -> str:
    return state.get("validation", {}).get("decision", "refuse")


# --------------------------------------------------------------------------- refuse
async def refuse_node(state: AgentState) -> dict:
    reason = state.get("plan", {}).get("reason") or state.get("validation", {}).get("reason", "")
    answer = (
        "I can only answer questions about your own financial data in Wealth Vault, "
        "and I don't have what I'd need to answer that"
        + (f" ({reason})." if reason else ".")
    )
    return {
        "answer": answer,
        "refused": True,
        "steps": _trace(state, "refuse", reason or "out of scope"),
    }
