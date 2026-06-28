'use client';

/**
 * Ask Your Finances — the streaming agent UI.
 *
 * Renders, for each question: the graph's live status steps (Routing → Computing/Searching →
 * Writing → Checking), the answer streamed token-by-token, and a metrics line that shows the
 * measured TTFT (client + server) plus the route the agent took and how many transactions it
 * cited. The step indicator makes the LangGraph branching visible.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Calculator, CheckCircle2, Loader2, PencilLine, Route, Search,
  Send, ShieldCheck, Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getSession } from 'next-auth/react';
import { useAgentStream, type AgentResult, type AgentStreamState } from '@/hooks/useAgentStream';

const NODE_ICON: Record<string, typeof Route> = {
  classify: Route,
  compute: Calculator,
  retrieve: Search,
  synthesize: PencilLine,
  validate: ShieldCheck,
  refuse: AlertCircle,
};

const SUGGESTIONS = [
  'How much do I have in stocks?',
  'Am I over my dining budget in May 2026?',
  "How's my emergency fund goal?",
  'Can I afford a $1,200 purchase?',
];

interface Turn {
  question: string;
  final: AgentStreamState | null;
}

export function AskYourFinances() {
  const stream = useAgentStream();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Finalize the active turn once the stream ends.
  useEffect(() => {
    if (!stream.isStreaming && (stream.result || stream.error)) {
      setTurns((prev) => {
        if (!prev.length || prev[prev.length - 1].final) return prev;
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], final: { ...stream } };
        return copy;
      });
    }
  }, [stream.isStreaming, stream.result, stream.error]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, stream.tokens, stream.status]);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question || stream.isStreaming) return;
    // Send the last few completed turns as history so follow-ups ("how is it distributed?")
    // can resolve references. Cap to keep the payload small.
    const history = turns
      .filter((t) => t.final)
      .flatMap((t) => [
        { role: 'user' as const, content: t.question },
        { role: 'assistant' as const, content: t.final!.result?.answer || t.final!.tokens || '' },
      ])
      .slice(-8);
    setTurns((prev) => [...prev, { question, final: null }]);
    setInput('');
    stream.ask(question, history);
  };

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Ask your finances</h1>
        <Badge variant="secondary" className="text-xs">streaming agent</Badge>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-2">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {turns.map((turn, i) => {
          const isActive = i === turns.length - 1 && !turn.final;
          const view = turn.final ?? (isActive ? (stream as AgentStreamState) : null);
          return (
            <div key={i} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {turn.question}
                </div>
              </div>
              {view && <AnswerBlock view={view} />}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your spending, income, net worth…"
          disabled={stream.isStreaming}
        />
        <Button type="submit" size="icon" disabled={stream.isStreaming || !input.trim()}>
          {stream.isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

function AnswerBlock({ view }: { view: AgentStreamState }) {
  const done = !view.isStreaming && (view.result || view.error);
  const answer = view.result?.answer || view.tokens;

  return (
    <Card className="max-w-[92%]">
      <CardContent className="space-y-3 p-3">
        {/* Step indicator — the graph's branching, live */}
        {view.status.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {view.status.map((step, idx) => {
              const Icon = NODE_ICON[step.node] ?? Route;
              const isLast = idx === view.status.length - 1;
              const spinning = !done && isLast;
              return (
                <span
                  key={`${step.node}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {spinning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
                  {step.label}
                </span>
              );
            })}
          </div>
        )}

        {view.error ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {view.error}
          </p>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm">
              {answer}
              {view.isStreaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/60 align-middle" />}
            </p>
            {view.result?.proposed_action?.action_type === 'create_expense' && (
              <ConfirmExpenseCard action={view.result.proposed_action} />
            )}
          </>
        )}

        {/* Metrics + provenance */}
        {(done || view.clientTtftMs != null) && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
            {view.result?.route && (
              <Badge variant="outline" className="text-[10px]">route: {view.result.route}</Badge>
            )}
            {view.result?.refused && (
              <Badge variant="outline" className="text-[10px] text-amber-600">refused</Badge>
            )}
            {view.clientTtftMs != null && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                first token {Math.round(view.clientTtftMs)}ms
                {view.serverTtftMs != null && <span className="opacity-60"> (server {Math.round(view.serverTtftMs)}ms)</span>}
              </span>
            )}
            {view.result?.total_ms != null && <span>· {Math.round(view.result.total_ms)}ms total</span>}
            {!!view.result?.cited_ids?.length && (
              <span>· {view.result.cited_ids.length} source{view.result.cited_ids.length === 1 ? '' : 's'} cited</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmExpenseCard({ action }: { action: NonNullable<AgentResult['proposed_action']> }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'cancelled' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const a = action.args;
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  async function confirm() {
    setStatus('saving');
    try {
      const session = await getSession();
      const token = (session as { accessToken?: string } | null)?.accessToken
        || process.env.NEXT_PUBLIC_DEV_AGENT_TOKEN || '';
      const res = await fetch(`${API_URL}/api/v1/agent/actions/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action_type: action.action_type,
          args: a,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      if (!res.ok) throw new Error(`(${res.status})`);
      setStatus('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  if (status === 'done') {
    return <div className="mt-2 text-sm text-green-600 dark:text-green-400">✓ Added &quot;{a.name}&quot; (${a.amount.toFixed(2)})</div>;
  }
  if (status === 'cancelled') {
    return <div className="mt-2 text-sm text-muted-foreground">Cancelled.</div>;
  }
  return (
    <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm">
      <div className="font-medium mb-1">Add this expense?</div>
      <div className="text-gray-600 dark:text-gray-300">
        {a.name} · ${a.amount.toFixed(2)}{a.category ? ` · ${a.category}` : ''}{a.date ? ` · ${a.date}` : ''}
      </div>
      {status === 'error' && <div className="text-red-600 dark:text-red-400 mt-1">Couldn&apos;t save {err}</div>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={confirm}
          disabled={status === 'saving'}
          className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Confirm'}
        </button>
        <button
          onClick={() => setStatus('cancelled')}
          className="rounded-md px-3 py-1 ring-1 ring-gray-300 dark:ring-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
