'use client';

import { useState } from 'react';
import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { Database, RefreshCcw, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { toast } from 'sonner';
import {
  useCreateBackupMutation,
  useGetBackupsQuery,
  useRestoreBackupMutation,
  useDeleteBackupMutation,
  type ModuleType,
} from '@/lib/api/backupsApi';
import { format } from 'date-fns';

const MODULE_OPTIONS: { value: ModuleType; label: string }[] = [
  { value: 'income', label: 'Income' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'installments', label: 'Installments' },
  { value: 'budgets', label: 'Budgets' },
  { value: 'savings', label: 'Savings' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'goals', label: 'Goals' },
  { value: 'debts', label: 'Debts' },
  { value: 'taxes', label: 'Taxes' },
];

interface RestoreBackupState {
  id: string;
  moduleType: ModuleType;
}

/**
 * Extract error message from RTK Query error
 */
function getErrorMessage(error: FetchBaseQueryError | SerializedError): string {
  if ('status' in error) {
    // FetchBaseQueryError
    if ('data' in error && typeof error.data === 'object' && error.data !== null) {
      const data = error.data as { detail?: string };
      return data.detail || 'An error occurred';
    }
    return 'An error occurred';
  }
  // SerializedError
  return error.message || 'An error occurred';
}

export default function BackupsPage() {
  const [selectedModule, setSelectedModule] = useState<ModuleType>('income');
  const [restoreBackup, setRestoreBackup] = useState<RestoreBackupState | null>(null);
  const [deleteBackupId, setDeleteBackupId] = useState<string | null>(null);

  const { data: backups, isLoading: backupsLoading } = useGetBackupsQuery();
  const [createBackup, { isLoading: creating }] = useCreateBackupMutation();
  const [restoreBackupMutation, { isLoading: restoring }] = useRestoreBackupMutation();
  const [deleteBackup, { isLoading: deleting }] = useDeleteBackupMutation();

  const handleCreateBackup = async () => {
    try {
      const result = await createBackup({
        module_type: selectedModule,
      }).unwrap();

      toast.success('Backup created successfully', {
        description: `Backed up ${result.item_count} ${selectedModule} item(s)`,
      });
    } catch (error) {
      console.error('Create backup error:', error);
      toast.error('Failed to create backup', {
        description: getErrorMessage(error as FetchBaseQueryError | SerializedError),
      });
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreBackup) return;

    try {
      const result = await restoreBackupMutation({
        backupId: restoreBackup.id,
        moduleType: restoreBackup.moduleType,
      }).unwrap();

      toast.success('Backup restored successfully', {
        description: `Restored ${result.restored_count} item(s). All existing items were replaced.`,
      });

      setRestoreBackup(null);
    } catch (error) {
      console.error('Restore backup error:', error);
      toast.error('Failed to restore backup', {
        description: getErrorMessage(error as FetchBaseQueryError | SerializedError),
      });
    }
  };

  const handleDeleteBackup = async () => {
    if (!deleteBackupId) return;

    try {
      await deleteBackup(deleteBackupId).unwrap();

      toast.success('Backup deleted successfully');
      setDeleteBackupId(null);
    } catch (error) {
      console.error('Delete backup error:', error);
      toast.error('Failed to delete backup', {
        description: getErrorMessage(error as FetchBaseQueryError | SerializedError),
      });
    }
  };

  const getModuleLabel = (moduleType: ModuleType): string => {
    return MODULE_OPTIONS.find((m) => m.value === moduleType)?.label || moduleType;
  };

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Backups</h1>
        <p className="text-muted-foreground mt-2">
          Create and restore snapshots of your financial data
        </p>
      </div>

      {/* Create Backup Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Backup
          </CardTitle>
          <CardDescription>
            Select a module and create a backup of all its data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Module Selector */}
            <div className="space-y-2">
              <Label htmlFor="module">Module to Backup</Label>
              <Select
                value={selectedModule}
                onValueChange={(value) => setSelectedModule(value as ModuleType)}
              >
                <SelectTrigger id="module">
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((module) => (
                    <SelectItem key={module.value} value={module.value}>
                      {module.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Create Button */}
            <div className="flex items-end">
              <Button
                onClick={handleCreateBackup}
                disabled={creating}
                className="w-full gap-2"
              >
                <Database className="h-4 w-4" />
                {creating ? 'Creating...' : 'Create Backup'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backups List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Your Backups
          </CardTitle>
          <CardDescription>
            View and restore your backed up data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backupsLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading backups...
            </div>
          ) : !backups || backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No backups yet. Create your first backup above.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="font-medium">
                        {format(new Date(backup.created_at), 'PPpp')}
                      </TableCell>
                      <TableCell>{getModuleLabel(backup.module_type)}</TableCell>
                      <TableCell>{backup.item_count} item(s)</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRestoreBackup({ id: backup.id, moduleType: backup.module_type })}
                            disabled={restoring}
                            className="gap-1"
                          >
                            <RefreshCcw className="h-3 w-3" />
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteBackupId(backup.id)}
                            disabled={deleting}
                            className="gap-1 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Important Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Backups create a snapshot of all data in the selected module at the time of creation</p>
          <p>• <strong>Warning:</strong> Restoring a backup will DELETE all current data and REPLACE it with the backed up data</p>
          <p>• Each backup stores the complete state of your data, including all fields and settings</p>
          <p>• Backups are exclusive to Wealth tier subscribers</p>
          <p>• You can create multiple backups for the same module to track changes over time</p>
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreBackup} onOpenChange={() => setRestoreBackup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will REPLACE all your current {restoreBackup ? getModuleLabel(restoreBackup.moduleType) : ''} data with the backed up data.
              All existing items will be deleted and replaced. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreBackup} disabled={restoring}>
              {restoring ? 'Restoring...' : 'Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteBackupId} onOpenChange={() => setDeleteBackupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this backup. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBackup}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
