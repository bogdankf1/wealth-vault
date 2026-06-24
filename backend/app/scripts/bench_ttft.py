"""
Measure time-to-first-token (TTFT): streaming vs non-streaming, same agent graph.

"Before" = the /query endpoint. It is non-streaming, so the user sees NOTHING until the
whole answer is ready — TTFT effectively equals total latency.
"After"  = the /stream endpoint. TTFT = time until the first answer token arrives.

Both hit the identical compiled graph, so the comparison is apples-to-apples and isolates
the win from streaming. Prints p50/p95.

    AGENT_BASE_URL=http://localhost:8000 AGENT_TOKEN=<jwt> python -m app.scripts.bench_ttft
"""
import asyncio
import os
import statistics
import time

import httpx

BASE = os.getenv("AGENT_BASE_URL", "http://localhost:8000")
TOKEN = os.getenv("AGENT_TOKEN", "")

QUESTIONS = [
    "How much did I spend on dining in May 2026?",
    "What's my net worth right now?",
    "How much do my subscriptions cost per month?",
    "What was my single biggest purchase this year?",
    "How much income did I receive in 2026 so far?",
]


async def time_non_streaming(client: httpx.AsyncClient, q: str) -> float:
    t0 = time.perf_counter()
    r = await client.post(f"{BASE}/api/v1/agent/query", json={"question": q}, timeout=60)
    r.raise_for_status()
    return (time.perf_counter() - t0) * 1000  # full answer only — TTFT == total here


async def time_streaming(client: httpx.AsyncClient, q: str) -> tuple[float, float]:
    """Returns (time-to-first-feedback, time-to-first-token) in ms.

    First feedback = the first `status` event ("Routing…"), which is what the user actually
    perceives as "it's working". First token = the first answer character.
    """
    t0 = time.perf_counter()
    first_feedback: float | None = None
    current_event = None
    async with client.stream("POST", f"{BASE}/api/v1/agent/stream",
                             json={"question": q}, timeout=60) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if line.startswith("event:"):
                current_event = line.split(":", 1)[1].strip()
                if first_feedback is None and current_event == "status":
                    first_feedback = (time.perf_counter() - t0) * 1000
            elif line.startswith("data:") and current_event == "token":
                token = (time.perf_counter() - t0) * 1000
                return (first_feedback or token, token)
    end = (time.perf_counter() - t0) * 1000
    return (first_feedback or end, end)


def _stats(label: str, xs: list[float]) -> str:
    xs = sorted(xs)
    p50 = statistics.median(xs)
    p95 = xs[max(0, int(len(xs) * 0.95) - 1)]
    return f"{label:<28} p50={p50:8.1f}ms  p95={p95:8.1f}ms  mean={statistics.mean(xs):8.1f}ms"


async def main() -> None:
    if not TOKEN:
        raise SystemExit("Set AGENT_TOKEN (run app.scripts.make_demo_token)")
    headers = {"Authorization": f"Bearer {TOKEN}"}
    async with httpx.AsyncClient(headers=headers) as client:
        non_stream, first_feedback, first_token = [], [], []
        for q in QUESTIONS:
            non_stream.append(await time_non_streaming(client, q))
            fb, tok = await time_streaming(client, q)
            first_feedback.append(fb)
            first_token.append(tok)

    print("\n===================== TTFT: before vs after =====================")
    print(_stats("BEFORE  (/query, full answer)", non_stream))
    print(_stats("AFTER   (/stream, first token)", first_token))
    print(_stats("AFTER   (/stream, first status)", first_feedback))
    tok_win = statistics.median(non_stream) / max(statistics.median(first_token), 1e-6)
    fb_win = statistics.median(non_stream) / max(statistics.median(first_feedback), 1e-6)
    print(f"\nFirst token   ~{tok_win:.1f}x sooner than the full answer.")
    print(f"First feedback ~{fb_win:.1f}x sooner (the 'Routing… / Computing…' status).")
    print("=================================================================\n")


if __name__ == "__main__":
    asyncio.run(main())
