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
    # ---- pre-existing cases (must keep passing) ----
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

    # ---- new: portfolio / domain expansion ----
    ("How much do I have in stocks?",
     lambda r: ("2200" in norm(r["answer"]) or "2,200" in r["answer"]) and not r["refused"]),
    ("How much is owed to me in total?",
     lambda r: ("1300" in norm(r["answer"]) or "1,300" in r["answer"]) and not r["refused"]),
    ("What's the remaining balance on my car loan?",
     lambda r: ("18600" in norm(r["answer"]) or "18,600" in r["answer"]) and not r["refused"]),

    # ---- new: analytics / budget ----
    ("Am I over my dining budget in May 2026?",
     lambda r: not r["refused"] and "over" in r["answer"].lower()),
    ("How's my emergency fund goal?",
     lambda r: not r["refused"] and "60" in norm(r["answer"])),
    ("What's my savings rate in May 2026?",
     lambda r: not r["refused"] and "82" in norm(r["answer"])),

    # ---- new: affordability ----
    ("Can I afford a $1,200 purchase?",
     lambda r: not r["refused"] and "afford" in r["answer"].lower()),

    # ---- new: capability / meta ----
    ("What can you do?",
     lambda r: r["refused"] is False and (
         "budget" in r["answer"].lower() or "portfolio" in r["answer"].lower()
     )),

    # ---- new: time-aware (no data in current week = graceful, not a refusal) ----
    ("What did I spend last week?",
     lambda r: not r["refused"]),

    # ---- new: refusal — investment advice ----
    ("Should I buy NVIDIA stock?",
     lambda r: r["refused"] is True),

    # ---- new: savings (read + projection with disclaimer) ----
    ("How much do I have in savings?",
     lambda r: not r["refused"] and "23820.5" in norm(r["answer"])),
    ("What will my savings be worth in 5 years?",
     lambda r: not r["refused"] and "not financial advice" in r["answer"].lower()),

    # ---- new: cash flow + runway/balance projections ----
    ("What's my monthly cash flow?",
     lambda r: not r["refused"] and r["route"] == "compute"),
    ("How long would my savings last if my income stopped?",
     lambda r: not r["refused"] and "not financial advice" in r["answer"].lower()),
    ("What will my balance be in 2 years?",
     lambda r: not r["refused"] and "not financial advice" in r["answer"].lower()),

    # ---- new: expense/income analysis ----
    ("What percentage of my spending was dining in May 2026?",
     lambda r: not r["refused"] and "dining" in r["answer"].lower()),
    ("How much of my income is from freelance vs salary?",
     lambda r: not r["refused"] and r["route"] == "compute"),
    ("What's my after-tax income for 2026?",
     lambda r: not r["refused"] and r["route"] == "compute"),

    # ---- new: portfolio analysis + projection ----
    ("How is my portfolio allocated?",
     lambda r: not r["refused"] and r["route"] == "compute"),
    ("What could my portfolio be worth in 20 years?",
     lambda r: not r["refused"] and "not financial advice" in r["answer"].lower()),
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
