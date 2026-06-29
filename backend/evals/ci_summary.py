"""
Build the agent eval-gate summary for CI.

Writes `eval-summary.md` (used as the body of a sticky PR comment) and appends the same
markdown to the GitHub Actions job summary. Reads step outcomes from env vars and, best-effort,
the Promptfoo pass/fail counts from evals/results.json. Run from the `backend/` directory.
"""
import json
import os


def emoji(outcome: str) -> str:
    return {"success": "✅", "failure": "❌", "skipped": "⏭️", "cancelled": "⏭️"}.get(outcome, "❔")


pt = os.environ.get("PYTEST_OUTCOME", "?")
ip = os.environ.get("INPROC_OUTCOME", "?")
pf = os.environ.get("PROMPTFOO_OUTCOME", "?")

# Best-effort Promptfoo counts from results.json (shape varies by version, so search for stats).
counts = ""
try:
    data = json.load(open("evals/results.json"))

    def find_stats(obj):
        if isinstance(obj, dict):
            if "successes" in obj and "failures" in obj:
                return obj
            for v in obj.values():
                r = find_stats(v)
                if r:
                    return r
        elif isinstance(obj, list):
            for v in obj:
                r = find_stats(v)
                if r:
                    return r
        return None

    stats = find_stats(data) or {}
    if stats:
        p, f = int(stats.get("successes", 0)), int(stats.get("failures", 0))
        counts = f" — {p}/{p + f} passed"
except Exception:
    pass

# pytest pass count (best-effort; the workflow writes PYTEST_PASSED to the env).
_pytest_n = os.environ.get("PYTEST_PASSED", "").strip()
pt_extra = f" — {_pytest_n} passed" if _pytest_n else ""

# In-process eval counts + dedicated Safety / Groundedness / Cost rows (best-effort).
inproc_extra = ""
safety_row = ""
ground_row = ""
cost_row = ""
try:
    s = json.load(open("evals/inproc-summary.json"))
    inproc_extra = f" — {s['passed']}/{s['total']} passed"
    sf = (s.get("by_category") or {}).get("safety")
    if sf and sf.get("total"):
        sem = "✅" if sf["passed"] == sf["total"] else "❌"
        safety_row = f"\n| Safety / injection (subset) | {sem} {sf['passed']}/{sf['total']} passed |"
    g = s.get("groundedness")
    if g and g.get("applicable"):
        gem = "✅" if g.get("ok") else "❌"
        ground_row = f"\n| Groundedness ($-figures) | {gem} {g['grounded']}/{g['applicable']} grounded |"
    c, lat = s.get("cost"), s.get("latency") or {}
    if c:
        cem = "✅" if c.get("ok") else "❌"
        cost_row = (f"\n| Cost / latency | {cem} {c['avg_tokens_per_case']} avg tok/case "
                    f"(budget {c['budget_per_case']}) · {round((lat.get('wall_ms_total') or 0)/1000)}s total |")
except Exception:
    pass

overall = "✅ passed" if pf == "success" else ("❌ failed" if "failure" in (pt, ip, pf) else "⏭️ incomplete")
run_url = os.environ.get("RUN_URL", "")
sha = os.environ.get("SHA", "")[:7]

md = f"""## 🤖 Agent eval gate — {overall}

| Check | Result |
| --- | --- |
| Compute-tool tests (pytest) | {emoji(pt)} {pt}{pt_extra} |
| In-process eval cases | {emoji(ip)} {ip}{inproc_extra} |{safety_row}{ground_row}{cost_row}
| Promptfoo (vs live agent endpoint) | {emoji(pf)} {pf}{counts} |

📊 [Full run &amp; logs]({run_url}) · commit `{sha}`
<sub>Posted automatically by CI — updates on each run.</sub>
"""

open("eval-summary.md", "w").write(md)
step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
if step_summary:
    with open(step_summary, "a") as fh:
        fh.write(md)
print(md)
