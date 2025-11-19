/**
 * Exchange Rates Widget
 * Shows current exchange rates between major currencies
 * Dynamically loads active currencies from API
 */
'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, RefreshCw } from 'lucide-react';
import { useGetExchangeRateQuery, useRefreshExchangeRatesMutation, useGetCurrenciesQuery } from '@/lib/api/currenciesApi';
import { useState, useEffect, useMemo } from 'react';
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

  // Fetch active currencies dynamically
  const { data: currencies, isLoading: isLoadingCurrencies } = useGetCurrenciesQuery({ active_only: true });

  // Generate currency columns dynamically based on fetched currencies
  const currencyColumns = useMemo((): CurrencyColumn[] => {
    if (!currencies || currencies.length === 0) {
      return [];
    }

    // Take top 3-5 currencies (or all if fewer than 3)
    const topCurrencies = currencies.slice(0, Math.min(5, currencies.length));

    // Generate columns - each currency gets its own column with pairs to other currencies
    return topCurrencies.map((baseCurrency) => ({
      base: baseCurrency.code,
      baseName: baseCurrency.name,
      pairs: topCurrencies
        .filter((c) => c.code !== baseCurrency.code)
        .map((targetCurrency) => ({
          from: baseCurrency.code,
          to: targetCurrency.code,
          label: targetCurrency.code,
        })),
    }));
  }, [currencies]);

  const handleRefresh = async () => {
    try {
      await refreshExchangeRates().unwrap();
      setLastRefreshed(new Date());
      setRefetchKey(Date.now()); // Force refetch by changing key
    } catch (error) {
      // Failed to refresh exchange rates
    }
  };

  // Show loading skeleton while currencies are being fetched
  if (isLoadingCurrencies) {
    return (
      <Card className="p-6">
        <div className="mb-6">
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Show empty state if no currencies available
  if (!currencyColumns || currencyColumns.length === 0) {
    return (
      <Card className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold">{t('title')}</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('description')}
          </p>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No active currencies available</p>
        </div>
      </Card>
    );
  }

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

      {/* Exchange Rate Columns - dynamically generated based on active currencies */}
      <div className={`grid grid-cols-1 gap-6 ${
        currencyColumns.length >= 3 ? 'md:grid-cols-3' : currencyColumns.length === 2 ? 'md:grid-cols-2' : ''
      }`}>
        {currencyColumns.map((column) => (
          <div key={column.base} className="space-y-3">
            {/* Column Header */}
            <div className="pb-2 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h4 className="text-sm font-semibold">{column.baseName}</h4>
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
