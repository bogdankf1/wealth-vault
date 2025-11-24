'use client';

import { useState } from 'react';
import { CreditCard, Wallet, Banknote, Globe, Building2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export type PaymentMethod = 'stripe' | 'paypal' | 'mono' | 'payoneer' | 'bank_transfer';

interface PaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => void;
  tierName: string;
  tierPrice: number;
  currency?: string;
  isLoading?: boolean;
}

export function PaymentMethodModal({
  isOpen,
  onClose,
  onConfirm,
  tierName,
  tierPrice,
  currency = 'USD',
  isLoading = false,
}: PaymentMethodModalProps) {
  const t = useTranslations('pricing.paymentModal');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('stripe');

  const handleConfirm = () => {
    onConfirm(selectedMethod);
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
      // Reset to default when closing
      setTimeout(() => setSelectedMethod('stripe'), 200);
    }
  };

  const paymentMethods = [
    {
      id: 'stripe' as PaymentMethod,
      name: 'Stripe',
      description: t('stripe.description'),
      icon: CreditCard,
      available: true,
    },
    {
      id: 'paypal' as PaymentMethod,
      name: 'PayPal',
      description: t('paypal.description'),
      icon: Wallet,
      available: false,
    },
    {
      id: 'mono' as PaymentMethod,
      name: 'Plata by Mono',
      description: t('mono.description'),
      icon: Banknote,
      available: false,
    },
    {
      id: 'payoneer' as PaymentMethod,
      name: 'Payoneer',
      description: t('payoneer.description'),
      icon: Globe,
      available: false,
    },
    {
      id: 'bank_transfer' as PaymentMethod,
      name: t('bankTransfer.name'),
      description: t('bankTransfer.description'),
      icon: Building2,
      available: false,
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t('title')}</DialogTitle>
          <DialogDescription className="text-base pt-1">
            {t('description', { tier: tierName, price: tierPrice, currency })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label className="text-base font-semibold mb-4 block">
            {t('selectMethod')}
          </Label>

          <RadioGroup
            value={selectedMethod}
            onValueChange={(value) => setSelectedMethod(value as PaymentMethod)}
            className="space-y-3"
          >
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={cn(
                  'relative flex items-start space-x-3 rounded-lg border-2 p-4 transition-all',
                  selectedMethod === method.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                  !method.available && 'opacity-50 cursor-not-allowed'
                )}
              >
                <RadioGroupItem
                  value={method.id}
                  id={method.id}
                  disabled={!method.available}
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label
                    htmlFor={method.id}
                    className={cn(
                      'flex items-center gap-3 cursor-pointer',
                      !method.available && 'cursor-not-allowed'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full',
                        selectedMethod === method.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <method.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">{method.name}</span>
                        {!method.available && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                            {t('comingSoon')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {method.description}
                      </p>
                    </div>
                  </Label>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || !paymentMethods.find(m => m.id === selectedMethod)?.available}
            className="w-full sm:w-auto"
          >
            {isLoading ? t('processing') : t('continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
