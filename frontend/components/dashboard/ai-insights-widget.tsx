/**
 * AI Insights Widget
 * Displays AI-generated financial insights on the dashboard
 */
'use client';

import { useState } from 'react';
import { Sparkles, TrendingUp, PiggyBank, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useGetFinancialInsightsQuery } from '@/lib/api/aiApi';
import { useTranslations } from 'next-intl';

export function AIInsightsWidget() {
  const t = useTranslations('dashboard.widgets.aiInsights');
  const [forceRefresh, setForceRefresh] = useState(false);
  const { data: insights, isLoading, error, refetch } = useGetFinancialInsightsQuery({ forceRefresh });

  const handleRefresh = async () => {
    setForceRefresh(true);
    await refetch();
    setForceRefresh(false);
  };

  if (isLoading) {
    return (
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{t('title')}</span>
          </div>
          <Badge variant="secondary" className="text-xs">{t('badge')}</Badge>
        </div>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{t('title')}</span>
          </div>
          <Badge variant="secondary" className="text-xs">{t('badge')}</Badge>
        </div>
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-3 w-3" />
          <AlertDescription className="text-xs">{t('error')}</AlertDescription>
        </Alert>
      </Card>
    );
  }

  const hasInsights =
    insights &&
    (insights.spending.length > 0 ||
      insights.savings.length > 0 ||
      insights.anomalies.length > 0);

  return (
    <TooltipProvider>
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{t('title')}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">{t('tooltip.heading')}</p>
                <p className="text-sm">{t('tooltip.description')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs">{t('badge')}</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleRefresh}
              disabled={isLoading}
              title={t('refreshTitle')}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        {!hasInsights ? (
          <div className="text-center py-4">
            <Sparkles className="mx-auto h-6 w-6 text-muted-foreground mb-2 opacity-50" />
            <p className="text-xs text-muted-foreground">{t('emptyState.title')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Spending Insights - Show first one only */}
            {insights.spending.length > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
                <TrendingUp className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-900 dark:text-blue-100 line-clamp-2">{insights.spending[0]}</p>
              </div>
            )}

            {/* Savings Insights - Show first one only */}
            {insights.savings.length > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-md border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50">
                <PiggyBank className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-green-900 dark:text-green-100 line-clamp-2">{insights.savings[0]}</p>
              </div>
            )}

            {/* Anomalies - Show first one only */}
            {insights.anomalies.length > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-900 dark:text-amber-100 line-clamp-2">{insights.anomalies[0]}</p>
              </div>
            )}
          </div>
        )}
      </Card>
    </TooltipProvider>
  );
}
