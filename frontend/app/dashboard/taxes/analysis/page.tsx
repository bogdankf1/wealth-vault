/**
 * Taxes Analysis Page
 * Provides detailed analytics on tax obligations and breakdowns
 */
'use client';

import React from 'react';
import { Receipt, DollarSign, TrendingUp, Percent } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGetTaxStatsQuery } from '@/lib/api/taxesApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export default function TaxesAnalysisPage() {
  const tAnalysis = useTranslations('taxes.analysis');
  const tCommon = useTranslations('common');
  const tTypes = useTranslations('taxes.types');
  const tFrequencies = useTranslations('taxes.frequencies');

  const { data: stats, isLoading, error } = useGetTaxStatsQuery();

  // Loading state
  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  // Error state
  if (error) {
    return <ApiErrorState error={error} />;
  }

  // Empty state
  if (!stats || stats.total_taxes === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={tAnalysis('noData')}
        description={tAnalysis('noDataDescription')}
      />
    );
  }

  // Calculate total tax amount for percentage calculations
  const totalTaxAmount = Number(stats.total_fixed_taxes) + Number(stats.total_percentage_taxes);

  return (
    <div className="space-y-6">
      {/* Tax Overview - Top Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Taxes */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4 text-blue-600" />
              {tAnalysis('totalTaxes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-5xl font-bold text-blue-600">{stats.total_taxes}</p>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('taxesBeingTracked')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Taxes */}
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              {tAnalysis('activeTaxes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold text-green-600">{stats.active_taxes}</p>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {stats.total_taxes > 0
                    ? ((stats.active_taxes / stats.total_taxes) * 100).toFixed(0)
                    : 0}%
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('activeTaxObligations')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Total Tax Amount */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {tAnalysis('totalEstimatedAnnual')}
          </CardTitle>
          <CardDescription>
            {tAnalysis('totalAnnualTaxLiability')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-4xl font-bold text-purple-600">
              <CurrencyDisplay
                amount={stats.total_tax_amount}
                currency={stats.currency}
                showSymbol={true}
                showCode={false}
              />
            </p>
            <p className="text-sm text-muted-foreground">
              {tAnalysis('totalAnnualTaxLiability')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tax Type Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Fixed Taxes */}
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-indigo-600" />
              {tAnalysis('fixedTaxes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-bold text-indigo-600">
                  <CurrencyDisplay
                    amount={stats.total_fixed_taxes}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('fixedAmountTaxes')}
              </p>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{tCommon('common.total')}</span>
                  <Badge variant="secondary">
                    {totalTaxAmount > 0
                      ? ((Number(stats.total_fixed_taxes) / totalTaxAmount) * 100).toFixed(2)
                      : 0}%
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Percentage Taxes */}
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Percent className="h-4 w-4 text-orange-600" />
              {tAnalysis('percentageTaxes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-bold text-orange-600">
                  <CurrencyDisplay
                    amount={stats.total_percentage_taxes}
                    currency={stats.currency}
                    showSymbol={true}
                    showCode={false}
                  />
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {tAnalysis('incomeBasedTaxes')}
              </p>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{tCommon('common.total')}</span>
                  <Badge variant="secondary">
                    {totalTaxAmount > 0
                      ? ((Number(stats.total_percentage_taxes) / totalTaxAmount) * 100).toFixed(2)
                      : 0}%
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tax Distribution Overview */}
      <Card>
        <CardHeader>
          <CardTitle>{tAnalysis('taxesByType')}</CardTitle>
          <CardDescription>
            {tAnalysis('taxesByTypeDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Fixed Taxes Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{tAnalysis('fixedTaxes')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    <CurrencyDisplay
                      amount={stats.total_fixed_taxes}
                      currency={stats.currency}
                      showSymbol={true}
                      showCode={false}
                    />
                  </span>
                  <Badge variant="secondary">
                    {totalTaxAmount > 0
                      ? ((Number(stats.total_fixed_taxes) / totalTaxAmount) * 100).toFixed(2)
                      : 0}%
                  </Badge>
                </div>
              </div>
              <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{
                    width: `${totalTaxAmount > 0
                      ? (Number(stats.total_fixed_taxes) / totalTaxAmount) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>

            {/* Percentage Taxes Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{tAnalysis('percentageTaxes')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    <CurrencyDisplay
                      amount={stats.total_percentage_taxes}
                      currency={stats.currency}
                      showSymbol={true}
                      showCode={false}
                    />
                  </span>
                  <Badge variant="secondary">
                    {totalTaxAmount > 0
                      ? ((Number(stats.total_percentage_taxes) / totalTaxAmount) * 100).toFixed(2)
                      : 0}%
                  </Badge>
                </div>
              </div>
              <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{
                    width: `${totalTaxAmount > 0
                      ? (Number(stats.total_percentage_taxes) / totalTaxAmount) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle>{tAnalysis('title')}</CardTitle>
          <CardDescription>
            {tAnalysis('description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{tAnalysis('totalEstimatedAnnual')}</p>
              <p className="text-2xl font-bold">
                <CurrencyDisplay
                  amount={stats.total_tax_amount}
                  currency={stats.currency}
                  showSymbol={true}
                  showCode={true}
                />
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{tAnalysis('activeTaxes')}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">{stats.active_taxes}</p>
                <p className="text-sm text-muted-foreground">{tCommon('common.total')} {stats.total_taxes}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
