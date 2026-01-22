'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useActivatePaddleSubscriptionMutation } from '@/lib/api/billingApi';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

// Paddle types
declare global {
  interface Window {
    Paddle?: {
      Environment: {
        set: (env: 'sandbox' | 'production') => void;
      };
      Setup: (options: { token: string }) => void;
      Checkout: {
        open: (options: PaddleCheckoutOptions) => void;
      };
    };
  }
}

interface PaddleCheckoutOptions {
  items: Array<{
    priceId: string;
    quantity: number;
  }>;
  customer?: {
    email?: string;
  };
  customData?: Record<string, string>;
  settings?: {
    displayMode?: 'overlay' | 'inline';
    theme?: 'light' | 'dark';
    locale?: string;
    successUrl?: string;
    allowLogout?: boolean;
  };
}

interface PaddleCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tierName: string;
  tierDisplayName: string;
  tierPrice: number;
  priceId: string;
  currency?: string;
  userEmail?: string;
}

// Hook to load Paddle.js
function usePaddleScript() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if already loaded
    if (window.Paddle) {
      setIsLoaded(true);
      return;
    }

    // Check if script is already in DOM
    const existingScript = document.querySelector('script[src*="paddle.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        initializePaddle();
        setIsLoaded(true);
      });
      return;
    }

    // Load the script
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;

    script.onload = () => {
      initializePaddle();
      setIsLoaded(true);
    };

    script.onerror = () => {
      setError('Failed to load Paddle checkout');
    };

    document.head.appendChild(script);

    return () => {
      // Don't remove the script on cleanup - Paddle expects it to persist
    };
  }, []);

  const initializePaddle = () => {
    if (!window.Paddle) return;

    const paddleEnv = process.env.NEXT_PUBLIC_PADDLE_ENV || 'sandbox';
    const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || '';

    if (!clientToken) {
      setError('Paddle client token not configured');
      return;
    }

    // Set environment first
    window.Paddle.Environment.set(paddleEnv as 'sandbox' | 'production');

    // Initialize with client token
    window.Paddle.Setup({ token: clientToken });
  };

  return { isLoaded, error };
}

export function PaddleCheckoutModal({
  isOpen,
  onClose,
  tierName,
  tierDisplayName,
  tierPrice,
  priceId,
  currency = 'USD',
  userEmail,
}: PaddleCheckoutModalProps) {
  const t = useTranslations('pricing.paddleCheckout');
  const router = useRouter();
  const [activateSubscription] = useActivatePaddleSubscriptionMutation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isLoaded: isPaddleLoaded, error: paddleError } = usePaddleScript();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsProcessing(false);
    }
  }, [isOpen]);

  // Handle checkout completion - this is called by Paddle's event system
  const handleCheckoutComplete = useCallback(
    async (data: { subscription_id?: string; transaction_id?: string }) => {
      if (!data.subscription_id || !data.transaction_id) {
        setError(t('errors.noSubscriptionId'));
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        const result = await activateSubscription({
          subscription_id: data.subscription_id,
          transaction_id: data.transaction_id,
        }).unwrap();

        if (result.success) {
          toast.success(t('success', { tier: tierDisplayName }));
          onClose();
          router.push('/dashboard?subscription=success');
        }
      } catch (err: unknown) {
        const errorMessage =
          err && typeof err === 'object' && 'data' in err
            ? ((err.data as { detail?: string })?.detail || t('errors.activationFailed'))
            : t('errors.activationFailed');
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsProcessing(false);
      }
    },
    [activateSubscription, onClose, router, t, tierDisplayName]
  );

  // Open Paddle checkout
  const openPaddleCheckout = useCallback(() => {
    if (!window.Paddle || !priceId) {
      setError(t('errors.paddleNotReady'));
      return;
    }

    // Set up event listeners for checkout events
    const handlePaddleEvent = (event: CustomEvent) => {
      const eventData = event.detail;

      if (eventData?.name === 'checkout.completed') {
        const checkoutData = eventData.data;
        handleCheckoutComplete({
          subscription_id: checkoutData?.subscription_id,
          transaction_id: checkoutData?.transaction_id,
        });
      } else if (eventData?.name === 'checkout.closed') {
        // User closed checkout without completing
        setIsProcessing(false);
      }
    };

    // Add event listener
    document.addEventListener('paddle:checkout', handlePaddleEvent as EventListener);

    // Open checkout
    window.Paddle.Checkout.open({
      items: [
        {
          priceId: priceId,
          quantity: 1,
        },
      ],
      customer: userEmail ? { email: userEmail } : undefined,
      settings: {
        displayMode: 'overlay',
        theme: 'light',
        allowLogout: false,
        successUrl: `${window.location.origin}/dashboard?subscription=success`,
      },
    });

    // Cleanup listener after a timeout (in case user closes browser)
    setTimeout(() => {
      document.removeEventListener('paddle:checkout', handlePaddleEvent as EventListener);
    }, 600000); // 10 minutes
  }, [priceId, userEmail, handleCheckoutComplete, t]);

  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || '';

  if (!clientToken) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('configError')}</DialogTitle>
            <DialogDescription>{t('configErrorDesc')}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={isProcessing ? undefined : onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { tier: tierDisplayName, price: tierPrice, currency })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('processing')}</p>
            </div>
          ) : paddleError ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <p className="text-sm text-destructive">{paddleError}</p>
            </div>
          ) : !isPaddleLoaded ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('loadingPaddle')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {t('clickToProceed')}
              </p>
              <Button onClick={openPaddleCheckout} size="lg" className="w-full">
                {t('proceedToCheckout')}
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
