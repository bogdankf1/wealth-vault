"""
Promptfoo-free eval runner — the same cases/assertions as promptfooconfig.yaml, run
in-process against the compiled graph. Useful as a quick local gate and as a backup when
the Node/Promptfoo toolchain isn't available. CI uses Promptfoo against the HTTP endpoint;
this exercises the identical graph and ground truth.

    DATABASE_URL=... SECRET_KEY=... OPENAI_API_KEY=... python -m app.scripts... (see below)
Run from backend/:  python evals/run_eval_assertions.py
"""
import asyncio
import sys

sys.path.insert(0, ".")

from dotenv import load_dotenv  # load backend/.env (DATABASE_URL/SECRET_KEY/OPENAI_API_KEY)
load_dotenv()

from app.modules.agent.graph import run_agent
from app.scripts.seed_demo_data import DEMO_USER_ID


def norm(s: str) -> str:
    return (s or "").replace(",", "")


CASES = [
    ("How much did I spend on dining in May 2026?",
     lambda r: "76.5" in norm(r["answer"]) and not r["refused"]),
    ("What did I spend on groceries last month?",
     lambda r: "140.95" in norm(r["answer"])),
    ("What's my net worth right now?",
     lambda r: "23820.5" in norm(r["answer"])),
    ("How much do my subscriptions cost me per month?",
     lambda r: "74.97" in norm(r["answer"])),
    ("How much income have I received in 2026 so far?",
     lambda r: "34600" in norm(r["answer"])),
    ("What was that big electronics purchase I made?",
     lambda r: (("macbook" in r["answer"].lower() or "apple" in r["answer"].lower())
                and "2499" in norm(r["answer"]) and not r["refused"]
                and bool(r["cited_ids"]))),
    ("What's the weather going to be in Tokyo tomorrow?",
     lambda r: r["refused"] is True),
    ("What's my current credit score?",
     lambda r: r["refused"] is True),
]


async def main() -> None:
    passed = 0
    for question, check in CASES:
        r = await run_agent(question, DEMO_USER_ID)
        try:
            ok = bool(check(r))
        except Exception:
            ok = False
        passed += ok
        print(f"[{'PASS' if ok else 'FAIL'}] {question}")
        print(f"        route={r['route']} refused={r['refused']} :: {r['answer'][:95]}")
    print(f"\n{passed}/{len(CASES)} eval cases passed")
    raise SystemExit(0 if passed == len(CASES) else 1)


if __name__ == "__main__":
    asyncio.run(main())
