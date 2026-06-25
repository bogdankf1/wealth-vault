/**
 * Standalone demo page for the streaming agent.
 *
 * Lives OUTSIDE /dashboard so it isn't gated by the auth middleware — combined with
 * NEXT_PUBLIC_DEV_AGENT_TOKEN it lets you test the agent against the seeded demo user
 * without Google login. The production entry is /dashboard/ask (uses the real session).
 */
import { AskYourFinances } from '@/components/agent/ask-your-finances';

export default function AgentDemoPage() {
  return (
    <main className="mx-auto h-[100dvh] max-w-2xl p-3 md:p-6">
      <AskYourFinances />
    </main>
  );
}
