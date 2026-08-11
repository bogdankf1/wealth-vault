/**
 * Replays a request list against FastAPI (:8000) and Nest (:8001) and diffs
 * normalized JSON responses. The acceptance oracle for every ported module.
 *
 * Usage:
 *   TOKEN=<jwt> npx ts-node scripts/parity-diff.ts [scripts/requests/core.json]
 * Env: FASTAPI_URL (default http://localhost:8000), NEST_URL (default http://localhost:8001)
 */
import { readFileSync } from 'node:fs';

interface Req {
  method: string;
  path: string;
  auth?: boolean;
  body?: unknown;
  /**
   * Set when the two backends are KNOWN to differ and the difference is intentional. The row still
   * runs and still prints both bodies, but it does not fail the check. Every use must name the
   * reason — an unexplained diff is a defect, not a note.
   */
  expectDiff?: string;
}

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000';
const NEST_URL = process.env.NEST_URL ?? 'http://localhost:8001';
const TOKEN = process.env.TOKEN ?? '';
const ISO_TS =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Sort keys recursively and collapse timestamp formatting differences. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v)]),
    );
  }
  if (typeof value === 'string' && ISO_TS.test(value)) {
    return new Date(value).toISOString().replace(/\.\d+Z$/, 'Z'); // drop sub-second precision
  }
  return value;
}

async function call(
  base: string,
  req: Req,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (req.auth) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${base}${req.path}`, {
    method: req.method,
    headers,
    body: req.body ? JSON.stringify(req.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text for non-JSON responses
  }
  return { status: res.status, body };
}

async function main(): Promise<void> {
  const file = process.argv[2] ?? 'scripts/requests/core.json';
  const rawRequests: unknown = JSON.parse(readFileSync(file, 'utf-8'));
  const requests = rawRequests as Req[];
  let failures = 0;

  for (const req of requests) {
    if (req.auth && !TOKEN) {
      console.log(`SKIP  ${req.method} ${req.path} (no TOKEN set)`);
      continue;
    }
    const [a, b] = await Promise.all([
      call(FASTAPI_URL, req),
      call(NEST_URL, req),
    ]);
    // Exact status, not just its class. Comparing Math.floor(status / 100) treated Nest's 201 on
    // POST /auth/google as matching FastAPI's 200 all through Phase 0.
    const sameStatus = a.status === b.status;
    const same =
      JSON.stringify(normalize(a.body)) === JSON.stringify(normalize(b.body));
    if (req.expectDiff) {
      console.log(`KNOWN ${req.method} ${req.path} — ${req.expectDiff}`);
      console.log(
        `  fastapi(${a.status}): ${JSON.stringify(normalize(a.body)).slice(0, 200)}`,
      );
      console.log(
        `  nest(${b.status}):    ${JSON.stringify(normalize(b.body)).slice(0, 200)}`,
      );
    } else if (sameStatus && same) {
      console.log(`PASS  ${req.method} ${req.path}`);
    } else {
      failures += 1;
      console.log(
        `DIFF  ${req.method} ${req.path} (fastapi=${a.status}, nest=${b.status})`,
      );
      console.log(
        `  fastapi: ${JSON.stringify(normalize(a.body)).slice(0, 500)}`,
      );
      console.log(
        `  nest:    ${JSON.stringify(normalize(b.body)).slice(0, 500)}`,
      );
    }
  }

  console.log(
    failures ? `\n${failures} request(s) differ` : '\nAll requests match',
  );
  process.exit(failures ? 1 : 0);
}

main();
