'use client';

/**
 * useAgentStream — consume the agent's SSE stream (/api/v1/agent/stream).
 *
 * RTK Query can't stream, so this is a standalone hook using fetch + ReadableStream (which,
 * unlike EventSource, lets us send the NextAuth Bearer token). It surfaces:
 *   - status steps   (the graph's branching: Routing → Computing/Searching → Writing → Checking)
 *   - streamed tokens (the answer, rendered as it arrives)
 *   - TTFT           (measured BOTH client-side here and server-side in the stream)
 *   - the final structured result (route, citations, computed figures)
 */
import { useCallback, useRef, useState } from 'react';
import { getSession } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface AgentStep {
  node: string;
  label: string;
}

export interface AgentResult {
  answer: string;
  route?: string;
  refused?: boolean;
  cited_ids?: string[];
  computed?: Array<Record<string, unknown>> | null;
  retrieved?: Array<Record<string, unknown>>;
  validation?: Record<string, unknown> | null;
  ttft_ms?: number | null;
  total_ms?: number | null;
  proposed_action?: {
    action_type: string;
    args: { name: string; amount: number; category?: string | null; date?: string | null };
  } | null;
}

export interface AgentStreamState {
  status: AgentStep[];
  tokens: string;
  clientTtftMs: number | null;
  serverTtftMs: number | null;
  result: AgentResult | null;
  isStreaming: boolean;
  error: string | null;
}

const INITIAL: AgentStreamState = {
  status: [],
  tokens: '',
  clientTtftMs: null,
  serverTtftMs: null,
  result: null,
  isStreaming: false,
  error: null,
};

function parseFrame(frame: string): Record<string, unknown> | null {
  const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice(5).trim());
  } catch {
    return null;
  }
}

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>(INITIAL);
  const startRef = useRef(0);

  const ask = useCallback(async (
    question: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ) => {
    setState({ ...INITIAL, isStreaming: true });
    startRef.current = performance.now();
    let clientTtft: number | null = null;

    try {
      // Auth: prefer the real NextAuth session (so a logged-in dashboard user queries their
      // own data). Fall back to NEXT_PUBLIC_DEV_AGENT_TOKEN (local dev only) so the no-login
      // /agent-demo page can hit the agent as the seeded demo user.
      const session = await getSession();
      let token = (session as { accessToken?: string } | null)?.accessToken;
      if (!token) token = process.env.NEXT_PUBLIC_DEV_AGENT_TOKEN ?? '';
      const resp = await fetch(`${API_URL}/api/v1/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question, history }),
      });
      if (!resp.ok || !resp.body) throw new Error(`Request failed (${resp.status})`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const ev = parseFrame(frame);
          if (!ev) continue;
          switch (ev.type) {
            case 'status':
              setState((s) => ({
                ...s,
                status: [...s.status, { node: ev.node as string, label: ev.label as string }],
              }));
              break;
            case 'ttft':
              setState((s) => ({ ...s, serverTtftMs: ev.ttft_ms as number }));
              break;
            case 'token':
              if (clientTtft === null) {
                clientTtft = performance.now() - startRef.current;
                setState((s) => ({ ...s, clientTtftMs: clientTtft }));
              }
              setState((s) => ({ ...s, tokens: s.tokens + (ev.text as string) }));
              break;
            case 'done':
              setState((s) => ({ ...s, result: ev.result as AgentResult, isStreaming: false }));
              break;
            case 'error':
              setState((s) => ({ ...s, error: ev.message as string, isStreaming: false }));
              break;
          }
        }
      }
      setState((s) => ({ ...s, isStreaming: false }));
    } catch (e) {
      setState((s) => ({ ...s, error: (e as Error).message, isStreaming: false }));
    }
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return { ...state, ask, reset };
}
