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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>{t('title')}</CardTitle>
            </div>
            <Badge variant="secondary">{t('badge')}</Badge>
          </div>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>{t('title')}</CardTitle>
            </div>
            <Badge variant="secondary">{t('badge')}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('error')}
            </AlertDescription>
          </Alert>
        </CardContent>
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>{t('title')}</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">{t('tooltip.heading')}</p>
                  <p className="text-sm">{t('tooltip.description')}</p>
                  <p className="text-sm mt-2">• {t('tooltip.spendingPatterns')}</p>
                  <p className="text-sm">• {t('tooltip.savingsOpportunities')}</p>
                  <p className="text-sm">• {t('tooltip.budgetOptimization')}</p>
                  <p className="text-sm">• {t('tooltip.financialHealth')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{t('badge')}</Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={isLoading}
                title={t('refreshTitle')}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
      <CardContent>
        {!hasInsights ? (
          <div className="text-center py-8">
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">{t('emptyState.title')}</p>
            <p className="text-sm text-muted-foreground">
              {t('emptyState.description')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Spending Insights */}
            {insights.spending.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <h4 className="font-semibold text-sm">{t('sections.spendingPatterns')}</h4>
                </div>
                {insights.spending.map((insight, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3"
                  >
                    <p className="text-sm text-blue-900 dark:text-blue-100">{insight}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Savings Insights */}
            {insights.savings.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <PiggyBank className="h-4 w-4 text-green-500" />
                  <h4 className="font-semibold text-sm">{t('sections.savingsOpportunities')}</h4>
                </div>
                {insights.savings.map((insight, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-3"
                  >
                    <p className="text-sm text-green-900 dark:text-green-100">{insight}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Anomalies */}
            {insights.anomalies.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h4 className="font-semibold text-sm">{t('sections.spendingAlerts')}</h4>
                </div>
                {insights.anomalies.map((insight, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950 p-3"
                  >
                    <p className="text-sm text-amber-900 dark:text-amber-100">{insight}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground text-center">
                {t('cacheNotice')}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
