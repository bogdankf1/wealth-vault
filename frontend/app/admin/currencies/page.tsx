/**
 * Currency management page - manage currencies and exchange rates
 */
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ModuleHeader } from '@/components/ui/module-header';
import { LoadingCards } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useGetCurrenciesQuery,
  useCreateCurrencyMutation,
  useUpdateCurrencyMutation,
  useDeleteCurrencyMutation,
  useRefreshExchangeRatesMutation,
} from '@/lib/api/currenciesApi';
import { Currency } from '@/types/currency';
import { Plus, Edit, Trash2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CurrenciesPage() {
  const { toast } = useToast();
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  const [isActive, setIsActive] = useState(true);

  const { data: currencies, isLoading } = useGetCurrenciesQuery({ active_only: false });
  const [createCurrency, { isLoading: isCreating }] = useCreateCurrencyMutation();
  const [updateCurrency, { isLoading: isUpdating }] = useUpdateCurrencyMutation();
  const [deleteCurrency, { isLoading: isDeleting }] = useDeleteCurrencyMutation();
  const [refreshRates, { isLoading: isRefreshing }] = useRefreshExchangeRatesMutation();

  const handleAddCurrency = () => {
    setCode('');
    setName('');
    setSymbol('');
    setDecimalPlaces(2);
    setIsActive(true);
    setAddDialogOpen(true);
  };

  const handleEditCurrency = (currency: Currency) => {
    setSelectedCurrency(currency);
    setCode(currency.code);
    setName(currency.name);
    setSymbol(currency.symbol);
    setDecimalPlaces(currency.decimal_places);
    setIsActive(currency.is_active);
    setEditDialogOpen(true);
  };

  const handleDeleteCurrency = (currency: Currency) => {
    setSelectedCurrency(currency);
    setDeleteDialogOpen(true);
  };

  const handleCreateCurrency = async () => {
    try {
      await createCurrency({
        code: code.toUpperCase(),
        name,
        symbol,
        decimal_places: decimalPlaces,
        is_active: isActive,
      }).unwrap();

      toast({
        title: 'Currency Created',
        description: `${code.toUpperCase()} has been added successfully.`,
      });

      setAddDialogOpen(false);
    } catch (error: unknown) {
      const err = error as { data?: { detail?: string } };
      toast({
        title: 'Error',
        description: err.data?.detail || 'Failed to create currency',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateCurrency = async () => {
    if (!selectedCurrency) return;

    try {
      await updateCurrency({
        code: selectedCurrency.code,
        data: {
          name,
          symbol,
          decimal_places: decimalPlaces,
          is_active: isActive,
        },
      }).unwrap();

      toast({
        title: 'Currency Updated',
        description: `${selectedCurrency.code} has been updated successfully.`,
      });

      setEditDialogOpen(false);
    } catch (error: unknown) {
      const err = error as { data?: { detail?: string } };
      toast({
        title: 'Error',
        description: err.data?.detail || 'Failed to update currency',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedCurrency) return;

    try {
      await deleteCurrency(selectedCurrency.code).unwrap();

      toast({
        title: 'Currency Deactivated',
        description: `${selectedCurrency.code} has been deactivated.`,
      });

      setDeleteDialogOpen(false);
    } catch (error: unknown) {
      const err = error as { data?: { detail?: string } };
      toast({
        title: 'Error',
        description: err.data?.detail || 'Failed to deactivate currency',
        variant: 'destructive',
      });
    }
  };

  const handleRefreshRates = async () => {
    try {
      const result = await refreshRates().unwrap();

      toast({
        title: 'Exchange Rates Refreshed',
        description: result.message,
      });
    } catch (error: unknown) {
      const err = error as { data?: { detail?: string } };
      toast({
        title: 'Error',
        description: err.data?.detail || 'Failed to refresh exchange rates',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <ModuleHeader
          title="Currency Management"
          description="Manage supported currencies and exchange rates"
        />
        <LoadingCards count={3} />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <ModuleHeader
        title="Currency Management"
        description="Manage supported currencies and exchange rates"
      />

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Manage currencies and refresh exchange rates
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button onClick={handleAddCurrency}>
            <Plus className="mr-2 h-4 w-4" />
            Add Currency
          </Button>
          <Button
            variant="outline"
            onClick={handleRefreshRates}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Exchange Rates
          </Button>
        </CardContent>
      </Card>

      {/* Currencies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Currencies</CardTitle>
          <CardDescription>
            {currencies?.length || 0} currencies configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Decimals</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currencies?.map((currency) => (
                <TableRow key={currency.code}>
                  <TableCell className="font-medium">{currency.code}</TableCell>
                  <TableCell>{currency.name}</TableCell>
                  <TableCell>
                    <span className="font-semibold text-lg">{currency.symbol}</span>
                  </TableCell>
                  <TableCell>{currency.decimal_places}</TableCell>
                  <TableCell>
                    {currency.is_active ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditCurrency(currency)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCurrency(currency)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Currency Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Currency</DialogTitle>
            <DialogDescription>
              Add a new currency to the system
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Currency Code (ISO 4217)</Label>
              <Input
                id="code"
                placeholder="USD"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Currency Name</Label>
              <Input
                id="name"
                placeholder="US Dollar"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="symbol">Currency Symbol</Label>
              <Input
                id="symbol"
                placeholder="$"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="decimal">Decimal Places</Label>
              <Input
                id="decimal"
                type="number"
                min="0"
                max="8"
                value={decimalPlaces}
                onChange={(e) => setDecimalPlaces(parseInt(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Active</Label>
              <Switch
                id="active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCurrency} disabled={isCreating || !code || !name || !symbol}>
              {isCreating ? 'Creating...' : 'Create Currency'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Currency Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Currency</DialogTitle>
            <DialogDescription>
              Update currency details (code cannot be changed)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Currency Code</Label>
              <Input value={code} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Currency Name</Label>
              <Input
                id="edit-name"
                placeholder="US Dollar"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-symbol">Currency Symbol</Label>
              <Input
                id="edit-symbol"
                placeholder="$"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-decimal">Decimal Places</Label>
              <Input
                id="edit-decimal"
                type="number"
                min="0"
                max="8"
                value={decimalPlaces}
                onChange={(e) => setDecimalPlaces(parseInt(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Active</Label>
              <Switch
                id="edit-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateCurrency} disabled={isUpdating || !name || !symbol}>
              {isUpdating ? 'Updating...' : 'Update Currency'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Currency?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {selectedCurrency?.code} ({selectedCurrency?.name}).
              Existing data will be preserved, but users will not be able to select this currency for new transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
