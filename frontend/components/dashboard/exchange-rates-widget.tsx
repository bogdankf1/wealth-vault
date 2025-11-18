/**
 * Exchange Rates Widget
 * Shows current exchange rates between major currencies
 */
'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, RefreshCw } from 'lucide-react';
import { useGetExchangeRateQuery, useRefreshExchangeRatesMutation } from '@/lib/api/currenciesApi';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface ExchangeRatePair {
  from: string;
  to: string;
  label: string;
}

interface CurrencyColumn {
  base: string;
  baseName: string;
  pairs: ExchangeRatePair[];
}

// Organize by base currency - each column shows rates FROM one currency
const CURRENCY_COLUMNS: CurrencyColumn[] = [
  {
    base: 'USD',
    baseName: 'USD',
    pairs: [
      { from: 'USD', to: 'EUR', label: 'EUR' },
      { from: 'USD', to: 'UAH', label: 'UAH' },
    ],
  },
  {
    base: 'EUR',
    baseName: 'EUR',
    pairs: [
      { from: 'EUR', to: 'USD', label: 'USD' },
      { from: 'EUR', to: 'UAH', label: 'UAH' },
    ],
  },
  {
    base: 'UAH',
    baseName: 'UAH',
    pairs: [
      { from: 'UAH', to: 'USD', label: 'USD' },
      { from: 'UAH', to: 'EUR', label: 'EUR' },
    ],
  },
];

interface ExchangeRateItemProps {
  from: string;
  to: string;
  label: string;
  refetchKey?: number;
}

function ExchangeRateItem({ from, to, label, refetchKey }: ExchangeRateItemProps) {
  const t = useTranslations('dashboard.widgets.exchangeRates');
  const { data, isLoading, refetch } = useGetExchangeRateQuery(
    { from, to, force_refresh: false },
    { refetchOnMountOrArgChange: true }
  );

  // Refetch when refetchKey changes
  useEffect(() => {
    if (refetchKey) {
      refetch();
    }
  }, [refetchKey, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-24" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">N/A</span>
      </div>
    );
  }

  const rate = parseFloat(data.rate.toString());
  const fetchedDate = new Date(data.fetched_at);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-between py-2 hover:bg-muted/50 px-2 -mx-2 rounded transition-colors cursor-help">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {rate.toFixed(4)}
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="text-xs">
              {t('rateDetails.formula', { from, rate: rate.toFixed(4), to })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('rateDetails.updated', { datetime: fetchedDate.toLocaleString() })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('rateDetails.source', { source: data.source })}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ExchangeRatesWidget() {
  const t = useTranslations('dashboard.widgets.exchangeRates');
  const [refreshExchangeRates, { isLoading: isRefreshing }] = useRefreshExchangeRatesMutation();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refetchKey, setRefetchKey] = useState(Date.now());

  const handleRefresh = async () => {
    try {
      await refreshExchangeRates().unwrap();
      setLastRefreshed(new Date());
      setRefetchKey(Date.now()); // Force refetch by changing key
    } catch (error) {
      console.error('Failed to refresh exchange rates:', error);
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{t('title')}</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    {t('tooltip')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title={t('refreshTitle')}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('description')}
          {lastRefreshed && (
            <span className="ml-2 text-xs text-muted-foreground">
              {t('refreshed', { time: lastRefreshed.toLocaleTimeString() })}
            </span>
          )}
        </p>
      </div>

      {/* Exchange Rate Columns - 3 columns, each for one base currency */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {CURRENCY_COLUMNS.map((column) => (
          <div key={column.base} className="space-y-3">
            {/* Column Header */}
            <div className="pb-2 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h4 className="text-sm font-semibold">{t(`currencies.${column.base}`)}</h4>
                <p className="text-xs text-muted-foreground">{t('equalsLabel', { currency: column.base })}</p>
              </div>
            </div>

            {/* Rates for this currency */}
            <div className="space-y-1">
              {column.pairs.map((pair) => (
                <ExchangeRateItem
                  key={`${pair.from}-${pair.to}`}
                  from={pair.from}
                  to={pair.to}
                  label={pair.label}
                  refetchKey={refetchKey}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span>{t('footer.realTime')}</span>
          </div>
          <span>{t('footer.updateFrequency')}</span>
        </div>
      </div>
    </Card>
  );
}
