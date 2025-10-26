'use client';

import { useState } from 'react';
import { FileText, DollarSign, Percent, Edit, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { ModuleHeader } from '@/components/ui/module-header';
import { StatsCards } from '@/components/ui/stats-cards';
import { SearchFilter, filterBySearchAndCategory } from '@/components/ui/search-filter';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { TaxForm } from '@/components/taxes/tax-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useListTaxesQuery,
  useGetTaxStatsQuery,
  useDeleteTaxMutation,
  type Tax,
} from '@/lib/api/taxesApi';

export default function TaxesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [deletingTax, setDeletingTax] = useState<Tax | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');

  const { data: taxesData, isLoading, error, refetch } = useListTaxesQuery();
  const { data: stats } = useGetTaxStatsQuery();
  const [deleteTax] = useDeleteTaxMutation();

  const handleEdit = (taxId: string) => {
    setEditingTaxId(taxId);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingTaxId(null);
  };

  const handleDeleteClick = (tax: Tax) => {
    setDeletingTax(tax);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTax) return;

    try {
      await deleteTax(deletingTax.id).unwrap();
      setDeletingTax(null);
    } catch (error) {
      console.error('Failed to delete tax:', error);
    }
  };

  const taxes = taxesData?.items || [];
  const hasTaxes = taxes.length > 0;

  // Type categories
  const typeCategories = ['Fixed', 'Percentage'];

  // Filter taxes
  const filteredTaxes = taxes.filter((tax) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = tax.name.toLowerCase().includes(query);
      const matchesDescription = tax.description?.toLowerCase().includes(query);
      if (!matchesName && !matchesDescription) return false;
    }

    // Type filter
    if (selectedType) {
      if (selectedType.toLowerCase() !== tax.tax_type) return false;
    }

    return true;
  });

  // Stats cards
  const statsCards = stats
    ? [
        {
          title: 'Total Taxes',
          value: (
            <CurrencyDisplay
              amount={stats.total_tax_amount}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: `${stats.active_taxes} active ${stats.active_taxes === 1 ? 'tax' : 'taxes'}`,
          icon: FileText,
        },
        {
          title: 'Fixed Taxes',
          value: (
            <CurrencyDisplay
              amount={stats.total_fixed_taxes}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: 'Monthly fixed amount',
          icon: DollarSign,
        },
        {
          title: 'Percentage-Based',
          value: (
            <CurrencyDisplay
              amount={stats.total_percentage_taxes}
              currency={stats.currency}
              showSymbol={true}
              showCode={false}
            />
          ),
          description: 'Based on income',
          icon: Percent,
        },
      ]
    : [];

  return (
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      <ModuleHeader
        title="Taxes"
        description="Manage your tax obligations and estimates"
        actionLabel="Add Tax"
        onAction={() => setIsFormOpen(true)}
      />

      {/* Statistics Cards */}
      {isLoading ? (
        <LoadingCards count={3} />
      ) : stats ? (
        <StatsCards stats={statsCards} />
      ) : null}

      {/* Search and Filters */}
      {hasTaxes && (
        <div>
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedType}
            onCategoryChange={(type) => setSelectedType(type || '')}
            categories={typeCategories}
            searchPlaceholder="Search taxes..."
            categoryPlaceholder="All Types"
          />
        </div>
      )}

      {/* Taxes List */}
      {isLoading ? (
        <LoadingCards count={6} />
      ) : error ? (
        <ApiErrorState error={error} onRetry={refetch} />
      ) : !hasTaxes ? (
        <EmptyState
          icon={FileText}
          title="No taxes yet"
          description="Start tracking your tax obligations by adding your first tax record"
          actionLabel="Add Tax"
          onAction={() => setIsFormOpen(true)}
        />
      ) : filteredTaxes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No taxes found matching your filters.</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchQuery('');
              setSelectedType('');
            }}
            className="mt-2"
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredTaxes.map((tax) => (
            <Card key={tax.id} className="relative">
              <CardHeader className="pb-3 md:pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base md:text-lg truncate">
                      {tax.name}
                    </CardTitle>
                    <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                      {tax.description || ' '}
                    </CardDescription>
                  </div>
                  {tax.is_active ? (
                    <Badge variant="default" className="bg-green-600 text-xs flex-shrink-0">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      Inactive
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 md:space-y-3">
                  {/* Tax Type and Frequency Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {tax.tax_type === 'fixed' ? (
                      <Badge variant="outline" className="text-xs">
                        <DollarSign className="h-3 w-3 mr-1" />
                        Fixed Amount
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        <Percent className="h-3 w-3 mr-1" />
                        Percentage-Based
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs capitalize">
                      {tax.frequency}
                    </Badge>
                  </div>

                  {/* Tax Amount */}
                  <div className="rounded-lg border bg-muted/50 p-3">
                    {tax.tax_type === 'fixed' && tax.fixed_amount ? (
                      <>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Amount</span>
                          <span className="text-2xl font-bold">
                            <CurrencyDisplay
                              amount={tax.display_fixed_amount ?? tax.fixed_amount}
                              currency={tax.display_currency ?? tax.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                        {tax.display_currency && tax.display_currency !== tax.currency && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Original: <CurrencyDisplay
                              amount={tax.fixed_amount}
                              currency={tax.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </div>
                        )}
                      </>
                    ) : tax.tax_type === 'percentage' && tax.percentage ? (
                      <>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Rate</span>
                          <span className="text-2xl font-bold">{tax.percentage}%</span>
                        </div>
                        {tax.calculated_amount !== undefined && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Estimated: <CurrencyDisplay
                              amount={tax.calculated_amount}
                              currency={tax.display_currency ?? 'USD'}
                              showSymbol={true}
                              showCode={false}
                            /> monthly
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>

                  {tax.notes && (
                    <div className="min-h-[40px] rounded-lg bg-muted p-2 md:p-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">{tax.notes}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(tax.id)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(tax)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tax Form Dialog */}
      {isFormOpen && (
        <TaxForm
          taxId={editingTaxId}
          isOpen={isFormOpen}
          onClose={handleCloseForm}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!deletingTax}
        onOpenChange={(open) => !open && setDeletingTax(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Tax"
        description={`Are you sure you want to delete "${deletingTax?.name}"? This action cannot be undone.`}
        itemName="tax"
      />
    </div>
  );
}
