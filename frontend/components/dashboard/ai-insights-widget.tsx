/**
 * AI Insights Widget
 * Displays AI-generated financial insights on the dashboard
 */
'use client';

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

export function AIInsightsWidget() {
  const { data: insights, isLoading, error, refetch } = useGetFinancialInsightsQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>AI Insights</CardTitle>
            </div>
            <Badge variant="secondary">Powered by AI</Badge>
          </div>
          <CardDescription>Personalized financial recommendations</CardDescription>
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
              <CardTitle>AI Insights</CardTitle>
            </div>
            <Badge variant="secondary">Powered by AI</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load insights. Please try again later.
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
              <CardTitle>AI Insights</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">How it works:</p>
                  <p className="text-sm">AI analyzes your financial data to provide personalized recommendations:</p>
                  <p className="text-sm mt-2">• Spending patterns and anomalies</p>
                  <p className="text-sm">• Savings opportunities</p>
                  <p className="text-sm">• Budget optimization suggestions</p>
                  <p className="text-sm">• Financial health improvements</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Powered by AI</Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                title="Refresh insights"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardDescription>Personalized financial recommendations</CardDescription>
        </CardHeader>
      <CardContent>
        {!hasInsights ? (
          <div className="text-center py-8">
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">No insights available yet</p>
            <p className="text-sm text-muted-foreground">
              Add more expenses and savings goals to get personalized insights
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Spending Insights */}
            {insights.spending.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <h4 className="font-semibold text-sm">Spending Patterns</h4>
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
                  <h4 className="font-semibold text-sm">Savings Opportunities</h4>
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
                  <h4 className="font-semibold text-sm">Spending Alerts</h4>
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
                Insights are updated every 24 hours
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
