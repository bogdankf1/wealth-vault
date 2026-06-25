"""
Smoke-test the agent across every branch of the graph.

Exercises: compute (exact number), semantic (RAG over a fuzzy ask), hybrid, and refuse —
and prints the route + answer + citations + which nodes ran, so you can SEE the branching
and the validation step. Requires a seeded + embedded DB and OPENAI_API_KEY.

    DATABASE_URL=... SECRET_KEY=... OPENAI_API_KEY=... python -m app.scripts.agent_smoke
"""
import asyncio

from app.modules.agent.graph import run_agent
from app.scripts.seed_demo_data import DEMO_USER_ID

QUESTIONS = [
    "How much did I spend on dining in May 2026?",          # compute → exact number
    "What was that big electronics purchase I made?",        # semantic → RAG
    "How much are my subscriptions and is Netflix one of them?",  # hybrid
    "What's the weather in Paris tomorrow?",                 # refuse (out of scope)
]


async def main() -> None:
    for q in QUESTIONS:
        r = await run_agent(q, DEMO_USER_ID)
        nodes = " → ".join(s["node"] for s in r.get("steps", []))
        print("\n" + "=" * 78)
        print(f"Q: {q}")
        print(f"route   : {r.get('route')}   refused={r.get('refused')}")
        print(f"nodes   : {nodes}")
        print(f"cited   : {len(r.get('cited_ids') or [])} sources")
        if r.get("computed"):
            print(f"computed: {[ {k: c.get(k) for k in ('tool','total','monthly_total','count') if k in c} for c in r['computed'] ]}")
        print(f"A: {r.get('answer')}")
    print("\n" + "=" * 78)


if __name__ == "__main__":
    asyncio.run(main())
