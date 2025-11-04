'use client';

import { useState, useEffect } from 'react';
import { LayoutGrid, Plus, Trash2, Edit, GripVertical, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  useListLayoutsQuery,
  useCreateLayoutMutation,
  useUpdateLayoutMutation,
  useDeleteLayoutMutation,
  useActivateLayoutMutation,
  useInitializePresetsMutation,
  type DashboardLayout,
  type WidgetConfig,
} from '@/lib/api/dashboardLayoutsApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// All available widgets
const AVAILABLE_WIDGETS: { id: string; label: string; description: string }[] = [
  { id: 'quick-actions', label: 'Quick Actions', description: 'Quick access buttons' },
  { id: 'ai-insights', label: 'AI Insights', description: 'AI-powered financial insights' },
  { id: 'exchange-rates', label: 'Exchange Rates', description: 'Currency exchange rates' },
  { id: 'net-worth', label: 'Net Worth', description: 'Total net worth overview' },
  { id: 'income-vs-expenses', label: 'Income vs Expenses', description: 'Comparison chart' },
  { id: 'monthly-spending', label: 'Monthly Spending', description: 'Spending breakdown' },
  { id: 'recent-transactions', label: 'Recent Transactions', description: 'Latest transactions' },
  { id: 'upcoming-bills', label: 'Upcoming Bills', description: 'Bills & subscriptions' },
  { id: 'budget-overview', label: 'Budget Overview', description: 'Budget progress' },
  { id: 'goals-progress', label: 'Goals Progress', description: 'Financial goals' },
  { id: 'portfolio-summary', label: 'Portfolio Summary', description: 'Investment portfolio' },
  { id: 'subscriptions-by-category', label: 'Subscriptions by Category', description: 'Subscription breakdown' },
  { id: 'installments-by-category', label: 'Installments by Category', description: 'Installment breakdown' },
  { id: 'income-allocation', label: 'Income Allocation', description: 'Income distribution' },
  { id: 'net-worth-trend', label: 'Net Worth Trend', description: 'Historical net worth' },
  { id: 'taxes', label: 'Taxes', description: 'Tax summary' },
  { id: 'debts-owed', label: 'Debts Owed', description: 'Debt tracking' },
];

export function DashboardLayoutsSettings() {
  const { toast } = useToast();
  const { data: layoutsData, isLoading } = useListLayoutsQuery();
  const [activateLayout] = useActivateLayoutMutation();
  const [deleteLayout] = useDeleteLayoutMutation();
  const [initializePresets] = useInitializePresetsMutation();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState<DashboardLayout | null>(null);

  const handleActivate = async (layoutId: string) => {
    try {
      await activateLayout(layoutId).unwrap();
      toast({
        title: 'Layout activated',
        description: 'Dashboard layout has been activated successfully.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to activate layout.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (layoutId: string) => {
    if (!confirm('Are you sure you want to delete this layout?')) return;

    try {
      await deleteLayout(layoutId).unwrap();
      toast({
        title: 'Layout deleted',
        description: 'Dashboard layout has been deleted successfully.',
      });
    } catch (error: unknown) {
      const errorMessage = error && typeof error === 'object' && 'data' in error
        && typeof error.data === 'object' && error.data && 'detail' in error.data
        ? String(error.data.detail)
        : 'Failed to delete layout.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleInitializePresets = async () => {
    try {
      await initializePresets().unwrap();
      toast({
        title: 'Presets initialized',
        description: 'Default layout presets have been created.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to initialize presets.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (layout: DashboardLayout) => {
    setEditingLayout(layout);
    setIsEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingLayout(null);
    setIsEditorOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted mt-2" />
          </CardHeader>
          <CardContent>
            <div className="h-32 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5" />
                Dashboard Layouts
              </CardTitle>
              <CardDescription>
                Customize your dashboard by creating and managing different layouts
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!layoutsData?.items?.length && (
                <Button onClick={handleInitializePresets} variant="outline" size="sm">
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Initialize Presets
                </Button>
              )}
              <Button onClick={handleCreate} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Layout
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {layoutsData?.items && layoutsData.items.length > 0 ? (
            <div className="space-y-4">
              {layoutsData.items.map((layout) => (
                <div
                  key={layout.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{layout.name}</h4>
                      {layout.is_active && (
                        <Badge variant="default" className="text-xs">
                          Active
                        </Badge>
                      )}
                      {layout.is_preset && (
                        <Badge variant="secondary" className="text-xs">
                          Preset
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {layout.configuration.widgets.filter((w) => w.visible).length} of{' '}
                      {layout.configuration.widgets.length} widgets visible
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!layout.is_preset && (
                      <>
                        <Button onClick={() => handleEdit(layout)} variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleDelete(layout.id)}
                          variant="ghost"
                          size="sm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {!layout.is_active && (
                      <Button
                        onClick={() => handleActivate(layout.id)}
                        variant="ghost"
                        size="sm"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <LayoutGrid className="mx-auto h-12 w-12 mb-4" />
              <p className="mb-4">No layouts found. Create your first layout or initialize presets.</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={handleInitializePresets} variant="outline">
                  Initialize Presets
                </Button>
                <Button onClick={handleCreate}>Create Layout</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <LayoutEditorDialog
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingLayout(null);
        }}
        layout={editingLayout}
      />
    </>
  );
}

// Layout Editor Dialog Component
function LayoutEditorDialog({
  isOpen,
  onClose,
  layout,
}: {
  isOpen: boolean;
  onClose: () => void;
  layout: DashboardLayout | null;
}) {
  const { toast } = useToast();
  const [createLayout] = useCreateLayoutMutation();
  const [updateLayout] = useUpdateLayoutMutation();

  const [name, setName] = useState(layout?.name || '');
  const [widgets, setWidgets] = useState<WidgetConfig[]>(
    layout?.configuration.widgets ||
    AVAILABLE_WIDGETS.map((w, i) => ({ id: w.id, visible: true, order: i + 1 }))
  );

  // Sync form state when layout prop or dialog state changes
  useEffect(() => {
    if (layout) {
      setName(layout.name);
      setWidgets(layout.configuration.widgets);
    } else {
      setName('');
      setWidgets(AVAILABLE_WIDGETS.map((w, i) => ({ id: w.id, visible: true, order: i + 1 })));
    }
  }, [layout, isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a layout name.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const configuration = { widgets };

      if (layout) {
        await updateLayout({ id: layout.id, data: { name, configuration } }).unwrap();
        toast({
          title: 'Layout updated',
          description: 'Dashboard layout has been updated successfully.',
        });
      } else {
        await createLayout({ name, configuration }).unwrap();
        toast({
          title: 'Layout created',
          description: 'Dashboard layout has been created successfully.',
        });
      }

      onClose();
    } catch (error: unknown) {
      const errorMessage = error && typeof error === 'object' && 'data' in error
        && typeof error.data === 'object' && error.data && 'detail' in error.data
        ? String(error.data.detail)
        : 'Failed to save layout.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const toggleWidget = (widgetId: string) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, visible: !w.visible } : w))
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{layout ? 'Edit Layout' : 'Create Layout'}</DialogTitle>
          <DialogDescription>
            Configure which widgets to show and their visibility on your dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="layout-name">Layout Name</Label>
            <Input
              id="layout-name"
              placeholder="e.g., My Custom Layout"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Widgets</Label>
            <div className="border rounded-lg divide-y">
              {AVAILABLE_WIDGETS.map((widget) => {
                const widgetConfig = widgets.find((w) => w.id === widget.id);
                return (
                  <div
                    key={widget.id}
                    className="flex items-center justify-between p-3 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{widget.label}</p>
                        <p className="text-xs text-muted-foreground">{widget.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={widgetConfig?.visible ?? true}
                      onCheckedChange={() => toggleWidget(widget.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{layout ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
