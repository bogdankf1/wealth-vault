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

overall = "✅ passed" if pf == "success" else ("❌ failed" if "failure" in (pt, ip, pf) else "⏭️ incomplete")
run_url = os.environ.get("RUN_URL", "")
sha = os.environ.get("SHA", "")[:7]

md = f"""## 🤖 Agent eval gate — {overall}

| Check | Result |
| --- | --- |
| Compute-tool tests (pytest) | {emoji(pt)} {pt} |
| In-process eval cases | {emoji(ip)} {ip} |
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
