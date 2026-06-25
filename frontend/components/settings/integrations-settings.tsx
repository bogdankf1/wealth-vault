'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, CheckCircle2, Crown, ExternalLink, Loader2, Plug, Unplug } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useGetCurrentUserQuery } from '@/lib/api/authApi';
import {
  useGetMonobankStatusQuery,
  useConnectMonobankMutation,
  useDisconnectMonobankMutation,
  useListMonobankAccountsQuery,
  useLinkMonobankAccountMutation,
  type MonoAccount,
} from '@/lib/api/monobankApi';


const ALLOWED_TIERS = new Set(['growth', 'wealth']);


export function IntegrationsSettings() {
  const { data: currentUser } = useGetCurrentUserQuery();
  const tierName = currentUser?.tier?.name?.toLowerCase();
  const hasAccess = tierName ? ALLOWED_TIERS.has(tierName) : false;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>
        <p className="text-xs text-muted-foreground">
          Connect external services to sync data into Wealth Vault automatically.
        </p>
      </div>

      <MonobankCard hasAccess={hasAccess} tierName={tierName} />
    </div>
  );
}


function MonobankCard({ hasAccess, tierName }: { hasAccess: boolean; tierName?: string }) {
  const { toast } = useToast();
  const { data: status, isLoading: statusLoading } = useGetMonobankStatusQuery(
    undefined,
    { skip: !hasAccess },
  );
  const [token, setToken] = useState('');
  const [connect, { isLoading: connecting }] = useConnectMonobankMutation();
  const [disconnect, { isLoading: disconnecting }] = useDisconnectMonobankMutation();

  const handleConnect = async () => {
    if (token.trim().length < 20) {
      toast({ title: 'Invalid token', description: 'Paste your Monobank personal token.', variant: 'destructive' });
      return;
    }
    try {
      await connect({ token: token.trim() }).unwrap();
      setToken('');
      toast({ title: 'Connected to Monobank', description: 'Pick the accounts you want to sync below.' });
    } catch (e) {
      toast({
        title: 'Connection failed',
        description: (e as { data?: { detail?: string } })?.data?.detail || 'Monobank rejected the token.',
        variant: 'destructive',
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect().unwrap();
      toast({ title: 'Disconnected from Monobank' });
    } catch {
      toast({ title: 'Could not disconnect', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            <CardTitle className="text-base">Monobank</CardTitle>
          </div>
          {!hasAccess && (
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" /> Requires Growth or Wealth
            </Badge>
          )}
          {hasAccess && status?.connected && (
            <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          )}
        </div>
        <CardDescription>
          Auto-import balances and transactions from your Monobank accounts and jars.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!hasAccess && (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Your <strong>{tierName ?? 'Starter'}</strong> tier doesn’t include integrations.
            <Link href="/dashboard/settings/subscription" className="ml-1 text-primary underline">
              Upgrade to Growth
            </Link>{' '}
            to connect Monobank.
          </div>
        )}

        {hasAccess && statusLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}

        {hasAccess && !statusLoading && !status?.connected && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mono-token" className="text-xs">
                Personal token
              </Label>
              <Input
                id="mono-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your Monobank personal token"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Generate one at{' '}
                <a
                  href="https://api.monobank.ua/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary underline"
                >
                  api.monobank.ua <ExternalLink className="h-3 w-3" />
                </a>
                . The token is stored encrypted; we never log it.
              </p>
            </div>
            <Button onClick={handleConnect} disabled={connecting} size="sm" className="gap-2">
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              Connect
            </Button>
          </div>
        )}

        {hasAccess && status?.connected && (
          <>
            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              {status.mono_client_name && (
                <div>
                  <span className="text-muted-foreground/70">Client:</span>{' '}
                  <span className="text-foreground">{status.mono_client_name}</span>
                </div>
              )}
              {status.last_full_sync_at && (
                <div>
                  <span className="text-muted-foreground/70">Last sync:</span>{' '}
                  {new Date(status.last_full_sync_at).toLocaleString()}
                </div>
              )}
              {status.last_webhook_at && (
                <div>
                  <span className="text-muted-foreground/70">Last webhook:</span>{' '}
                  {new Date(status.last_webhook_at).toLocaleString()}
                </div>
              )}
              {status.last_error && (
                <div className="sm:col-span-2 text-destructive">{status.last_error}</div>
              )}
            </div>

            <MonoAccountsList />

            <div className="pt-2">
              <Button onClick={handleDisconnect} disabled={disconnecting} variant="outline" size="sm" className="gap-2">
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                Disconnect
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}


function MonoAccountsList() {
  const { toast } = useToast();
  const { data, isLoading, error } = useListMonobankAccountsQuery();
  const [linkAccount, { isLoading: linking }] = useLinkMonobankAccountMutation();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleLink = async (acc: MonoAccount) => {
    setPendingId(acc.mono_account_id);
    try {
      await linkAccount({
        monoAccountId: acc.mono_account_id,
        body: { backfill_months: 3 },
      }).unwrap();
      toast({
        title: 'Account linked',
        description: 'Started backfilling the last 3 months — this can take several minutes per account.',
      });
    } catch (e) {
      toast({
        title: 'Link failed',
        description: (e as { data?: { detail?: string } })?.data?.detail || 'Could not link this account.',
        variant: 'destructive',
      });
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Discovering accounts…
      </div>
    );
  }
  if (error) {
    return <div className="text-xs text-destructive">Couldn’t load Mono accounts. Try reconnecting.</div>;
  }

  const all = [...(data?.accounts ?? []), ...(data?.jars ?? [])];
  if (all.length === 0) {
    return <div className="text-xs text-muted-foreground">No Monobank accounts discovered.</div>;
  }

  return (
    <div className="rounded-md border">
      <div className="border-b px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        Accounts &amp; jars
      </div>
      <ul className="divide-y">
        {all.map((acc) => {
          const linked = !!acc.linked_savings_account_id;
          const isPending = pendingId === acc.mono_account_id && linking;
          return (
            <li key={acc.mono_account_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{acc.title || acc.mono_account_id}</div>
                <div className="text-[11px] text-muted-foreground">
                  {acc.kind === 'jar' ? 'Jar' : acc.type ?? 'account'} · {acc.currency} ·{' '}
                  {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              {linked ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Linked
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => handleLink(acc)}
                  className="gap-2"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                  Link &amp; backfill
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
