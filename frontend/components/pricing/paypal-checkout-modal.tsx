'use client';

import { useState, useEffect } from 'react';
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useActivatePayPalSubscriptionMutation } from '@/lib/api/billingApi';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface PayPalCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tierName: string;
  tierDisplayName: string;
  tierPrice: number;
  planId: string;
  currency?: string;
}

export function PayPalCheckoutModal({
  isOpen,
  onClose,
  tierName,
  tierDisplayName,
  tierPrice,
  planId,
  currency = 'USD',
}: PayPalCheckoutModalProps) {
  const t = useTranslations('pricing.paypalCheckout');
  const router = useRouter();
  const [activateSubscription] = useActivatePayPalSubscriptionMutation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';

  useEffect(() => {
    // Reset state when modal opens
    if (isOpen) {
      setError(null);
      setIsProcessing(false);
    }
  }, [isOpen]);

  const handleApprove = async (data: { subscriptionID?: string | null }) => {
    if (!data.subscriptionID) {
      setError(t('errors.noSubscriptionId'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const result = await activateSubscription({
        subscription_id: data.subscriptionID,
      }).unwrap();

      if (result.success) {
        toast.success(t('success', { tier: tierDisplayName }));
        onClose();
        // Redirect to dashboard with success message
        router.push('/dashboard?subscription=success');
      }
    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'data' in err
        ? (err.data as { detail?: string })?.detail || t('errors.activationFailed')
        : t('errors.activationFailed');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleError = (err: Record<string, unknown>) => {
    console.error('PayPal error:', err);
    setError(t('errors.paypalError'));
  };

  const handleCancel = () => {
    setError(null);
  };

  if (!clientId) {
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
          ) : (
            <PayPalScriptProvider
              options={{
                clientId,
                vault: true,
                intent: 'subscription',
                components: 'buttons',
              }}
            >
              <PayPalButtonsWrapper
                planId={planId}
                onApprove={handleApprove}
                onError={handleError}
                onCancel={handleCancel}
              />
            </PayPalScriptProvider>
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

// Wrapper component to handle PayPal script loading state
function PayPalButtonsWrapper({
  planId,
  onApprove,
  onError,
  onCancel,
}: {
  planId: string;
  onApprove: (data: { subscriptionID?: string | null }) => Promise<void>;
  onError: (err: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [{ isPending, isResolved, isRejected }] = usePayPalScriptReducer();

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading PayPal...</p>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
        <p className="text-sm text-destructive">Failed to load PayPal. Please try again.</p>
      </div>
    );
  }

  if (isResolved) {
    return (
      <PayPalButtons
        style={{
          layout: 'vertical',
          shape: 'rect',
          label: 'subscribe',
        }}
        createSubscription={(data, actions) => {
          return actions.subscription.create({
            plan_id: planId,
          });
        }}
        onApprove={onApprove}
        onError={onError}
        onCancel={onCancel}
      />
    );
  }

  return null;
}
