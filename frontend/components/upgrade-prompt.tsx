'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface UpgradePromptProps {
  feature: string;
  currentTier: string;
  requiredTier: string;
  onDismiss?: () => void;
}

export function UpgradePrompt({ feature, currentTier, requiredTier, onDismiss }: UpgradePromptProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);

  const handleUpgrade = () => {
    router.push('/dashboard/pricing');
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isDismissed) return null;

  return (
    <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="relative pb-3">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Upgrade to {requiredTier}</CardTitle>
        </div>
        <CardDescription>
          You have reached the limit for <span className="font-semibold">{feature}</span> on the{' '}
          <span className="font-semibold capitalize">{currentTier}</span> plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Upgrade to the <span className="font-semibold capitalize">{requiredTier}</span> plan to unlock
          unlimited access and more premium features.
        </p>
        <div className="flex gap-2">
          <Button onClick={handleUpgrade} className="flex-1">
            View Plans
          </Button>
          <Button onClick={handleDismiss} variant="outline">
            Maybe Later
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface InlineUpgradePromptProps {
  feature: string;
  currentTier: string;
  requiredTier: string;
  compact?: boolean;
}

export function InlineUpgradePrompt({
  feature,
  currentTier,
  requiredTier,
  compact = false,
}: InlineUpgradePromptProps) {
  const router = useRouter();

  if (compact) {
    return (
      <div className="flex items-center justify-between p-4 bg-muted/50 border border-border rounded-lg">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm">
            <span className="font-semibold">{feature}</span> limit reached
          </p>
        </div>
        <Button size="sm" onClick={() => router.push('/dashboard/pricing')}>
          Upgrade
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/30 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-full">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1">Upgrade Required</h3>
          <p className="text-sm text-muted-foreground mb-4">
            You have reached the limit for <span className="font-semibold">{feature}</span> on your{' '}
            <span className="font-semibold capitalize">{currentTier}</span> plan. Upgrade to{' '}
            <span className="font-semibold capitalize">{requiredTier}</span> to continue.
          </p>
          <Button onClick={() => router.push('/dashboard/pricing')}>View Upgrade Options</Button>
        </div>
      </div>
    </div>
  );
}

interface UpgradePromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  currentTier: string;
  requiredTier: string;
  currentLimit: number;
}

export function UpgradePromptDialog({
  isOpen,
  onClose,
  feature,
  currentTier,
  requiredTier,
  currentLimit,
}: UpgradePromptDialogProps) {
  const router = useRouter();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="max-w-md w-full mx-4">
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-primary/10 rounded-full">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Limit Reached</CardTitle>
          </div>
          <CardDescription>
            You have reached the maximum of {currentLimit} {feature.toLowerCase()} allowed on the{' '}
            <span className="font-semibold capitalize">{currentTier}</span> plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upgrade to the <span className="font-semibold capitalize">{requiredTier}</span> plan to:
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Unlock unlimited {feature.toLowerCase()}</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Access advanced features and analytics</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Get AI-powered insights</span>
            </li>
          </ul>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => router.push('/dashboard/pricing')} className="flex-1">
              View Plans
            </Button>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
