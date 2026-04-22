'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, DollarSign, Percent, Trash2, Archive, LayoutGrid, List, CheckCircle, Clock, Sparkles, AlertCircle, Plus, Loader2, Play, Filter, Search, ArrowUp, ArrowDown, Lock, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CurrencyDisplay } from '@/components/currency/currency-display';

import { TaxesActionsContext } from '../context';
import { filterBySearchAndCategory } from '@/components/ui/search-filter';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { BatchDeleteConfirmDialog } from '@/components/ui/batch-delete-confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { TaxForm } from '@/components/taxes/tax-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SplitButton } from '@/components/ui/split-button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  useListTaxesQuery,
  useGetTaxStatsQuery,
  useUpdateTaxMutation,
  useDeleteTaxMutation,
  useBatchDeleteTaxRecordsMutation,
  useCreateTaxMutation,
  useProcessTaxDuePaymentsMutation,
  type Tax,
} from '@/lib/api/taxesApi';
import { useGetMyPreferencesQuery } from '@/lib/api/preferencesApi';
import { useGetTaxPresetsMutation, type TaxPreset } from '@/lib/api/aiApi';
import { useListAccountsQuery } from '@/lib/api/savingsApi';
import { useListIncomeSourcesQuery } from '@/lib/api/incomeApi';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { sortItems, type SortField, type SortDirection } from '@/components/ui/sort-filter';
import { useColumnVisibility, type ColumnConfig } from '@/lib/hooks/use-column-visibility';
import { useViewPreferences } from '@/lib/hooks/use-view-preferences';
import { toast } from 'sonner';

export default function TaxesPage() {
  const router = useRouter();

  // Translation hooks
  const tOverview = useTranslations('taxes.overview');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('taxes.status');
  const tTypes = useTranslations('taxes.types');
  const tFrequencies = useTranslations('taxes.frequencies');
  const tPayment = useTranslations('taxes.paymentStatus');

  // Get context for setting actions
  const { setActions } = React.useContext(TaxesActionsContext);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [deletingTax, setDeletingTax] = useState<Tax | null>(null);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [selectedTaxIds, setSelectedTaxIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Use default view preferences from user settings
  const { viewMode, setViewMode } = useViewPreferences();
  // Column visibility configuration
  const columnConfig: ColumnConfig[] = React.useMemo(() => [
    { id: 'name', label: tOverview('name'), locked: true },
    { id: 'description', label: tOverview('description') },
    { id: 'type', label: tOverview('type') },
    { id: 'amount', label: tOverview('amount') },
    { id: 'frequency', label: tCommon('common.frequency') },
    { id: 'notes', label: tCommon('common.description') },
    { id: 'originalAmount', label: tCommon('common.originalAmount') },
    { id: 'status', label: tCommon('common.status') },
    { id: 'periodStatus', label: tPayment('periodStatus') },
  ], [tOverview, tCommon, tPayment]);

  const { visibleColumns, toggleColumn, showAllColumns, isColumnVisible } = useColumnVisibility('taxes', columnConfig);

  const { data: taxesData, isLoading, error, refetch } = useListTaxesQuery({ is_active: true });
  const { data: stats } = useGetTaxStatsQuery();
  const { data: preferences } = useGetMyPreferencesQuery();
  const { data: accountsData } = useListAccountsQuery({});
  const { data: incomeSourcesData } = useListIncomeSourcesQuery({ is_active: true });
  const [updateTax] = useUpdateTaxMutation();
  const [deleteTax] = useDeleteTaxMutation();
  const [createTax] = useCreateTaxMutation();
  const [batchDeleteTaxRecords, { isLoading: isBatchDeleting }] = useBatchDeleteTaxRecordsMutation();
  const [getTaxPresets, { isLoading: isLoadingPresets }] = useGetTaxPresetsMutation();
  const [processTaxDuePayments, { isLoading: isProcessingPayments }] = useProcessTaxDuePaymentsMutation();

  // AI Tax Presets state
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [taxPresets, setTaxPresets] = useState<TaxPreset[]>([]);
  const [presetsDisclaimer, setPresetsDisclaimer] = useState('');
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [addingPresets, setAddingPresets] = useState<Set<number>>(new Set());
  const [presetSelections, setPresetSelections] = useState<Record<number, { accountId?: string; incomeSourceId?: string }>>({});

  // Get accounts and income sources for selection
  const accounts = accountsData?.items || [];
  const incomeSources = incomeSourcesData?.items || [];

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
      toast.success(tOverview('deleteSuccess'));
      setDeletingTax(null);
    } catch (error) {
      toast.error(tOverview('deleteError'));
    }
  };

  const handleArchiveTax = async (id: string) => {
    try {
      await updateTax({ id, data: { is_active: false } }).unwrap();
      toast.success(tOverview('archiveSuccess'));
      setSelectedTaxIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      toast.error(tOverview('archiveError'));
    }
  };

  const handleBatchArchive = React.useCallback(async () => {
    const idsToArchive = Array.from(selectedTaxIds);
    let successCount = 0;
    let failCount = 0;

    for (const id of idsToArchive) {
      try {
        await updateTax({ id, data: { is_active: false } }).unwrap();
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(tOverview('batchArchiveSuccess', { count: successCount }));
    }
    if (failCount > 0) {
      toast.error(tOverview('batchArchiveError', { count: failCount }));
    }

    setSelectedTaxIds(new Set());
  }, [selectedTaxIds, updateTax, tOverview]);

  const handleToggleSelect = (taxId: string) => {
    const newSelected = new Set(selectedTaxIds);
    if (newSelected.has(taxId)) {
      newSelected.delete(taxId);
    } else {
      newSelected.add(taxId);
    }
    setSelectedTaxIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTaxIds.size === filteredTaxes.length) {
      setSelectedTaxIds(new Set());
    } else {
      setSelectedTaxIds(new Set(filteredTaxes.map(tax => tax.id)));
    }
  };

  const handleBatchDelete = useCallback(() => {
    if (selectedTaxIds.size === 0) return;
    setBatchDeleteDialogOpen(true);
  }, [selectedTaxIds]);

  const handleAddTax = useCallback(() => {
    setDeletingTax(null);
    setIsFormOpen(true);
  }, []);

  // AI Tax Search handlers
  const handleOpenAiSearch = useCallback(async () => {
    setAiDialogOpen(true);
    setTaxPresets([]);
    setPresetsError(null);
    setPresetsDisclaimer('');
    setPresetSelections({});

    // Check if user has country and occupation set
    if (!preferences?.country || !preferences?.occupation) {
      setPresetsError(tOverview('aiSearch.missingSettings'));
      return;
    }

    try {
      const result = await getTaxPresets({
        country: preferences.country,
        occupation: preferences.occupation,
      }).unwrap();

      setTaxPresets(result.presets);
      setPresetsDisclaimer(result.disclaimer);
    } catch (err) {
      setPresetsError(tOverview('aiSearch.fetchError'));
    }
  }, [preferences, getTaxPresets, tOverview]);

  const handlePresetSelectionChange = useCallback((index: number, field: 'accountId' | 'incomeSourceId', value: string | undefined) => {
    setPresetSelections(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        [field]: value === 'none' ? undefined : value,
      },
    }));
  }, []);

  const handleProcessDuePayments = useCallback(async () => {
    try {
      const result = await processTaxDuePayments().unwrap();
      if (result.due_count === 0) {
        toast.info(tOverview('noDuePayments'));
      } else if (result.processed > 0) {
        toast.success(tOverview('paymentsProcessed', {
          processed: result.processed,
          autoPaid: result.auto_paid
        }));
      }
      if (result.failed_payments.length > 0) {
        result.failed_payments.forEach((failure) => {
          toast.error(tOverview('paymentFailed', { name: failure.tax_name, reason: failure.reason }));
        });
      }
      refetch();
    } catch (error) {
      toast.error(tOverview('processPaymentsError'));
    }
  }, [processTaxDuePayments, refetch, tOverview]);

  const handleAddPresetAsTax = useCallback(async (preset: TaxPreset, index: number) => {
    setAddingPresets(prev => new Set(prev).add(index));

    const selection = presetSelections[index] || {};

    try {
      await createTax({
        name: preset.name,
        description: preset.description,
        tax_type: preset.tax_type,
        percentage: preset.tax_type === 'percentage' ? preset.rate * 100 : undefined,
        fixed_amount: preset.tax_type === 'fixed' ? preset.rate : undefined,
        currency: preferences?.currency || 'USD',
        frequency: preset.frequency,
        notes: preset.notes || undefined,
        is_active: true,
        payment_account_id: selection.accountId || null,
        income_source_id: selection.incomeSourceId || null,
      }).unwrap();

      toast.success(tOverview('aiSearch.addSuccess', { name: preset.name }));

      // Reset the selection for this preset so user can add again with different account/income
      setPresetSelections(prev => ({
        ...prev,
        [index]: { accountId: undefined, incomeSourceId: undefined },
      }));
    } catch (err) {
      toast.error(tOverview('aiSearch.addError'));
    } finally {
      setAddingPresets(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  }, [createTax, preferences?.currency, tOverview, presetSelections]);

  // Set action buttons in layout
  React.useEffect(() => {
    setActions(
      <div className="flex gap-2 flex-wrap">
        {selectedTaxIds.size > 0 && (
          <>
            {/* Archive hidden for now
            <Button
              onClick={handleBatchArchive}
              variant="outline"
              size="default"
              className="w-full sm:w-auto"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('archiveSelected', { count: selectedTaxIds.size })}</span>
            </Button>
            */}
            <Button
              onClick={handleBatchDelete}
              variant="destructive"
              size="default"
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span className="truncate">{tOverview('deleteSelected', { count: selectedTaxIds.size })}</span>
            </Button>
          </>
        )}
        <SplitButton
          primaryLabel={tOverview('aiSearch.button')}
          onPrimaryClick={handleOpenAiSearch}
          primaryIcon={<Sparkles className="h-4 w-4" />}
          options={[
            {
              label: tOverview('addManually'),
              onClick: handleAddTax,
              icon: <Plus className="h-4 w-4" />,
            },
            {
              label: isProcessingPayments ? tOverview('processingPayments') : tOverview('processDuePayments'),
              onClick: handleProcessDuePayments,
              icon: <Play className="h-4 w-4" />,
              disabled: isProcessingPayments,
            },
          ]}
          className="w-full sm:w-auto"
        />
      </div>
    );

    return () => setActions(null);
  }, [selectedTaxIds.size, setActions, handleBatchArchive, handleBatchDelete, handleAddTax, handleOpenAiSearch, handleProcessDuePayments, isProcessingPayments, tOverview]);

  const confirmBatchDelete = async () => {
    if (selectedTaxIds.size === 0) return;

    try {
      const result = await batchDeleteTaxRecords({
        ids: Array.from(selectedTaxIds),
      }).unwrap();

      if (result.failed_ids.length > 0) {
        toast.error(tOverview('batchDeleteError', { count: result.failed_ids.length }));
      } else {
        toast.success(tOverview('batchDeleteSuccess', { count: result.deleted_count }));
      }
      setBatchDeleteDialogOpen(false);
      setSelectedTaxIds(new Set());
    } catch (error) {
      toast.error(tOverview('batchDeleteError', { count: selectedTaxIds.size }));
    }
  };

  const taxes = taxesData?.items || [];
  const hasTaxes = taxes.length > 0;

  // Type categories
  const typeCategories = ['Fixed', 'Percentage'];

  // Filter taxes
  const searchFilteredTaxes = taxes.filter((tax) => {
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

  // Apply sorting (using calculated_amount for currency-aware sorting)
  const filteredTaxes = sortItems(
    searchFilteredTaxes,
    sortField,
    sortDirection,
    (tax) => tax.name,
    (tax) => tax.calculated_amount || tax.fixed_amount || 0,
    (tax) => tax.created_at
  ) || [];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedType !== '') count++;
    if (sortField !== 'name' || sortDirection !== 'asc') count++;
    return count;
  }, [selectedType, sortField, sortDirection]);

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Search and Filters */}
      {hasTaxes && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={tOverview('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9"
              />
            </div>

            {/* Filters Popover */}
            <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              {/* Filter section */}
              <div className="p-2 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.filter')}</p>

                {/* Category (Type) */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tOverview('type')}</label>
                  <Select
                    value={selectedType || 'all'}
                    onValueChange={(value) => setSelectedType(value === 'all' ? '' : value)}
                  >
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue placeholder={tOverview('allTypes')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tOverview('allTypes')}</SelectItem>
                      {typeCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Sort section */}
              <div className="p-2 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.sort')}</p>
                <div className="flex items-center gap-2">
                  <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                    <SelectTrigger className="h-8 flex-1 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">{tCommon('common.name')}</SelectItem>
                      <SelectItem value="amount">{tCommon('common.amount')}</SelectItem>
                      <SelectItem value="date">{tCommon('common.date')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                    className="h-8 gap-1.5 flex-shrink-0"
                  >
                    {sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                    <span className="text-sm">
                      {sortField === 'name'
                        ? (sortDirection === 'asc' ? tCommon('common.sortAZ') : tCommon('common.sortZA'))
                        : sortField === 'amount'
                          ? (sortDirection === 'asc' ? tCommon('common.sortLowToHigh') : tCommon('common.sortHighToLow'))
                          : (sortDirection === 'asc' ? tCommon('common.sortOldestFirst') : tCommon('common.sortNewestFirst'))
                      }
                    </span>
                  </Button>
                </div>
              </div>

              <Separator />

              {/* View section */}
              <div className="p-2 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.view')}</p>
                <div className="inline-flex items-center gap-1 border rounded-md p-0.5" style={{ height: '32px' }}>
                  <Button
                    variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('card')}
                    className="h-[32px] w-[32px] p-0"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="h-[32px] w-[32px] p-0"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Columns section (list view only) */}
              {viewMode === 'list' && (
                <>
                  <Separator />
                  <div className="p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCommon('common.columns')}</p>
                      {Object.values(visibleColumns).filter(Boolean).length < columnConfig.length && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={showAllColumns}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          {tCommon('common.showAll')}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {columnConfig.map((column) => (
                        <label
                          key={column.id}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                            column.locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted'
                          }`}
                        >
                          <Checkbox
                            checked={visibleColumns[column.id] ?? true}
                            onCheckedChange={() => toggleColumn(column.id)}
                            disabled={column.locked}
                          />
                          <span className="flex-1">{column.label}</span>
                          {column.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </PopoverContent>
            </Popover>
          </div>

          {/* Inline stats */}
          {stats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0 max-w-xs">
              <span><span className="font-semibold text-foreground"><CurrencyDisplay amount={stats.total_tax_amount} currency={stats.currency} decimals={0} /></span> total</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground">{stats.total_fixed_taxes}</span> fixed</span>
              <span>·</span>
              <span><span className="font-semibold text-foreground">{stats.total_percentage_taxes}</span> %-based</span>
            </div>
          )}
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
          title={tOverview('noTaxes')}
          description={tOverview('noTaxesDescription')}
          actionLabel={tOverview('aiSearch.button')}
          onAction={handleOpenAiSearch}
        />
      ) : filteredTaxes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tOverview('noFilterResults')}
          description={tOverview('noTaxesDescription')}
          actionLabel={tOverview('aiSearch.button')}
          onAction={handleOpenAiSearch}
        />
      ) : viewMode === 'card' ? (
        <div className="space-y-3">
          {filteredTaxes.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selectedTaxIds.size === filteredTaxes.length}
                onCheckedChange={handleSelectAll}
                aria-label="Select all taxes"
              />
              <span className="text-sm text-muted-foreground">
                {selectedTaxIds.size === filteredTaxes.length ? tCommon('common.deselectAll') : tCommon('common.selectAll')}
              </span>
            </div>
          )}
          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredTaxes.map((tax) => (
            <Card
              key={tax.id}
              className="relative cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/dashboard/taxes/${tax.id}`)}
            >
              <CardHeader className="pb-3 md:pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedTaxIds.has(tax.id)}
                        onCheckedChange={() => handleToggleSelect(tax.id)}
                        aria-label={`Select ${tax.name}`}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex-1">
                    <CardTitle className="text-base md:text-lg truncate">
                      {tax.name}
                    </CardTitle>
                    <CardDescription className="mt-1 min-h-[20px] text-xs md:text-sm line-clamp-2">
                      {tax.description || ' '}
                    </CardDescription>
                    </div>
                  </div>
                  {tax.is_active ? (
                    <Badge variant="default" className="bg-green-600 text-xs flex-shrink-0">
                      {tStatus('active')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      {tStatus('inactive')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 md:space-y-3">
                  {/* Tax Type, Frequency, and Payment Status Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {tax.tax_type === 'fixed' ? (
                      <Badge variant="outline" className="text-xs">
                        <DollarSign className="h-3 w-3 mr-1" />
                        {tTypes('fixed')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        <Percent className="h-3 w-3 mr-1" />
                        {tTypes('percentage')}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs capitalize">
                      {tFrequencies(tax.frequency as 'monthly' | 'quarterly' | 'annually')}
                    </Badge>
                    {/* Payment Status Badge */}
                    {tax.is_paid_current_period ? (
                      <Badge variant="default" className="text-xs bg-emerald-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {tPayment('paid')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                        <Clock className="h-3 w-3 mr-1" />
                        {tPayment('due')}
                      </Badge>
                    )}
                  </div>

                  {/* Tax Amount */}
                  <div className="rounded-lg border bg-muted/50 p-3">
                    {tax.tax_type === 'fixed' && tax.fixed_amount ? (
                      <>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{tOverview('amount')}</span>
                          <span className="text-lg md:text-2xl font-bold">
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
                            {tCommon('common.originalAmount')}: <CurrencyDisplay
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
                          <span className="text-xs text-muted-foreground">{tOverview('type')}</span>
                          <span className="text-lg md:text-2xl font-bold">{tax.percentage}%</span>
                        </div>
                        {tax.calculated_amount !== undefined && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {tFrequencies('monthly')}: <CurrencyDisplay
                              amount={tax.calculated_amount}
                              currency={tax.display_currency ?? 'USD'}
                              showSymbol={true}
                              showCode={false}
                            />
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
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedTaxIds.size === filteredTaxes.length}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all taxes"
                  />
                </TableHead>
                {isColumnVisible('name') && (
                  <TableHead>{tOverview('name')}</TableHead>
                )}
                {isColumnVisible('description') && (
                  <TableHead className="hidden md:table-cell">{tOverview('description')}</TableHead>
                )}
                {isColumnVisible('type') && (
                  <TableHead>{tOverview('type')}</TableHead>
                )}
                {isColumnVisible('amount') && (
                  <TableHead className="text-right">{tOverview('amount')}</TableHead>
                )}
                {isColumnVisible('frequency') && (
                  <TableHead className="hidden lg:table-cell">{tCommon('common.frequency')}</TableHead>
                )}
                {isColumnVisible('notes') && (
                  <TableHead className="hidden xl:table-cell">{tCommon('common.description')}</TableHead>
                )}
                {isColumnVisible('originalAmount') && (
                  <TableHead className="hidden 2xl:table-cell text-right">{tCommon('common.originalAmount')}</TableHead>
                )}
                {isColumnVisible('status') && (
                  <TableHead className="hidden sm:table-cell">{tCommon('common.status')}</TableHead>
                )}
                {isColumnVisible('periodStatus') && (
                  <TableHead className="hidden md:table-cell">{tPayment('periodStatus')}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTaxes.map((tax) => (
                <TableRow
                  key={tax.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/taxes/${tax.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedTaxIds.has(tax.id)}
                      onCheckedChange={() => handleToggleSelect(tax.id)}
                      aria-label={`Select ${tax.name}`}
                    />
                  </TableCell>
                  {isColumnVisible('name') && (
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{tax.name}</span>
                        <span className="text-xs text-muted-foreground md:hidden line-clamp-1">
                          {tax.description}
                        </span>
                      </div>
                    </TableCell>
                  )}
                  {isColumnVisible('description') && (
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm line-clamp-2">{tax.description || '-'}</span>
                    </TableCell>
                  )}
                  {isColumnVisible('type') && (
                    <TableCell>
                      {tax.tax_type === 'fixed' ? (
                        <Badge variant="outline" className="text-xs">
                          <DollarSign className="h-3 w-3 mr-1" />
                          {tTypes('fixed')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Percent className="h-3 w-3 mr-1" />
                          {tTypes('percentage')}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  {isColumnVisible('amount') && (
                    <TableCell className="text-right">
                      {tax.tax_type === 'fixed' && tax.fixed_amount ? (
                        <div className="flex flex-col items-end">
                          <span className="font-semibold">
                            <CurrencyDisplay
                              amount={tax.display_fixed_amount ?? tax.fixed_amount}
                              currency={tax.display_currency ?? tax.currency}
                              showSymbol={true}
                              showCode={false}
                            />
                          </span>
                        </div>
                      ) : tax.tax_type === 'percentage' && tax.percentage ? (
                        <div className="flex flex-col items-end">
                          <span className="font-semibold">{tax.percentage}%</span>
                          {tax.calculated_amount !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              ~<CurrencyDisplay
                                amount={tax.calculated_amount}
                                currency={tax.display_currency ?? 'USD'}
                                showSymbol={true}
                                showCode={false}
                              />
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  {isColumnVisible('frequency') && (
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="secondary" className="text-xs capitalize">
                        {tFrequencies(tax.frequency as 'monthly' | 'quarterly' | 'annually')}
                      </Badge>
                    </TableCell>
                  )}
                  {isColumnVisible('notes') && (
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-sm line-clamp-2">{tax.notes || '-'}</span>
                    </TableCell>
                  )}
                  {isColumnVisible('originalAmount') && (
                    <TableCell className="hidden 2xl:table-cell text-right">
                      {tax.display_currency && tax.display_currency !== tax.currency && tax.tax_type === 'fixed' ? (
                        <span className="text-sm text-muted-foreground">
                          {tax.fixed_amount} {tax.currency}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  {isColumnVisible('status') && (
                    <TableCell className="hidden sm:table-cell">
                      {tax.is_active ? (
                        <Badge variant="default" className="bg-green-600 text-xs">
                          {tStatus('active')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {tStatus('inactive')}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  {isColumnVisible('periodStatus') && (
                    <TableCell className="hidden md:table-cell">
                      {tax.is_paid_current_period ? (
                        <Badge variant="default" className="text-xs bg-emerald-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {tPayment('paid')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                          <Clock className="h-3 w-3 mr-1" />
                          {tPayment('due')}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
        title={tOverview('deleteConfirmTitle')}
        description={`${deletingTax?.name}`}
        itemName={tOverview('tax')}
      />

      {/* Batch Delete Confirmation Dialog */}
      <BatchDeleteConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        count={selectedTaxIds.size}
        itemName={tOverview('tax')}
        isDeleting={isBatchDeleting}
      />

      {/* AI Tax Presets Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {tOverview('aiSearch.title')}
            </DialogTitle>
            <DialogDescription>
              {tOverview('aiSearch.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Loading state */}
            {isLoadingPresets && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">{tOverview('aiSearch.loading')}</span>
              </div>
            )}

            {/* Error state */}
            {presetsError && !isLoadingPresets && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{presetsError}</AlertDescription>
              </Alert>
            )}

            {/* Presets list */}
            {!isLoadingPresets && !presetsError && taxPresets.length > 0 && (
              <>
                <div className="max-h-[400px] overflow-y-auto pr-2">
                  <div className="space-y-3">
                    {taxPresets.map((preset, index) => (
                      <Card key={index} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium truncate">{preset.name}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {preset.description}
                              </p>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <Badge variant="outline" className="text-xs">
                                  {preset.tax_type === 'percentage' ? (
                                    <><Percent className="h-3 w-3 mr-1" />{(preset.rate * 100).toFixed(1)}%</>
                                  ) : (
                                    <><DollarSign className="h-3 w-3 mr-1" />{preset.rate}</>
                                  )}
                                </Badge>
                                <Badge variant="secondary" className="text-xs capitalize">
                                  {tFrequencies(preset.frequency as 'monthly' | 'quarterly' | 'annually')}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {preset.category}
                                </Badge>
                                {preset.is_deductible && (
                                  <Badge variant="default" className="text-xs bg-green-600">
                                    {tOverview('aiSearch.deductible')}
                                  </Badge>
                                )}
                              </div>
                              {preset.notes && (
                                <p className="text-xs text-muted-foreground mt-2 italic">
                                  {preset.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Account and Income Source Selection */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                            <div className="space-y-1">
                              <Label className="text-xs">{tOverview('aiSearch.paymentAccount')}</Label>
                              <Select
                                value={presetSelections[index]?.accountId || 'none'}
                                onValueChange={(value) => handlePresetSelectionChange(index, 'accountId', value)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder={tOverview('aiSearch.selectAccount')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{tOverview('aiSearch.noAccount')}</SelectItem>
                                  {accounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                      {account.name} ({account.currency})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {preset.tax_type === 'percentage' && (
                              <div className="space-y-1">
                                <Label className="text-xs">{tOverview('aiSearch.incomeSource')}</Label>
                                <Select
                                  value={presetSelections[index]?.incomeSourceId || 'none'}
                                  onValueChange={(value) => handlePresetSelectionChange(index, 'incomeSourceId', value)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={tOverview('aiSearch.selectIncome')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">{tOverview('aiSearch.allIncome')}</SelectItem>
                                    {incomeSources.map((source) => (
                                      <SelectItem key={source.id} value={source.id}>
                                        {source.name} ({source.currency})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>

                          {/* Add Button */}
                          <div className="flex justify-end pt-2">
                            <Button
                              size="sm"
                              onClick={() => handleAddPresetAsTax(preset, index)}
                              disabled={addingPresets.has(index)}
                            >
                              {addingPresets.has(index) ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Plus className="h-4 w-4 mr-2" />
                              )}
                              {tOverview('aiSearch.addTax')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Disclaimer */}
                {presetsDisclaimer && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {presetsDisclaimer}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {/* Empty state */}
            {!isLoadingPresets && !presetsError && taxPresets.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{tOverview('aiSearch.noPresets')}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
