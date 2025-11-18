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
import { useTranslations } from 'next-intl';

interface RestoreBackupState {
  id: string;
  moduleType: ModuleType;
}

export default function BackupsPage() {
  const tPage = useTranslations('backups.page');
  const tCreate = useTranslations('backups.create');
  const tList = useTranslations('backups.list');
  const tModules = useTranslations('backups.modules');
  const tInfo = useTranslations('backups.info');
  const tDialogs = useTranslations('backups.dialogs');
  const tMessages = useTranslations('backups.messages');

  const MODULE_OPTIONS: { value: ModuleType; label: string }[] = [
    { value: 'income', label: tModules('income') },
    { value: 'expenses', label: tModules('expenses') },
    { value: 'subscriptions', label: tModules('subscriptions') },
    { value: 'installments', label: tModules('installments') },
    { value: 'budgets', label: tModules('budgets') },
    { value: 'savings', label: tModules('savings') },
    { value: 'portfolio', label: tModules('portfolio') },
    { value: 'goals', label: tModules('goals') },
    { value: 'debts', label: tModules('debts') },
    { value: 'taxes', label: tModules('taxes') },
  ];

  /**
   * Extract error message from RTK Query error
   */
  const getErrorMessage = (error: FetchBaseQueryError | SerializedError): string => {
    if ('status' in error) {
      // FetchBaseQueryError
      if ('data' in error && typeof error.data === 'object' && error.data !== null) {
        const data = error.data as { detail?: string };
        return data.detail || tMessages('errorGeneric');
      }
      return tMessages('errorGeneric');
    }
    // SerializedError
    return error.message || tMessages('errorGeneric');
  };
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

      toast.success(tMessages('createSuccess'), {
        description: tMessages('createSuccessDescription', { count: result.item_count, module: selectedModule }),
      });
    } catch (error) {
      console.error('Create backup error:', error);
      toast.error(tMessages('createError'), {
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

      toast.success(tMessages('restoreSuccess'), {
        description: tMessages('restoreSuccessDescription', { count: result.restored_count }),
      });

      setRestoreBackup(null);
    } catch (error) {
      console.error('Restore backup error:', error);
      toast.error(tMessages('restoreError'), {
        description: getErrorMessage(error as FetchBaseQueryError | SerializedError),
      });
    }
  };

  const handleDeleteBackup = async () => {
    if (!deleteBackupId) return;

    try {
      await deleteBackup(deleteBackupId).unwrap();

      toast.success(tMessages('deleteSuccess'));
      setDeleteBackupId(null);
    } catch (error) {
      console.error('Delete backup error:', error);
      toast.error(tMessages('deleteError'), {
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
        <h1 className="text-3xl font-bold tracking-tight">{tPage('title')}</h1>
        <p className="text-muted-foreground mt-2">
          {tPage('description')}
        </p>
      </div>

      {/* Create Backup Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {tCreate('title')}
          </CardTitle>
          <CardDescription>
            {tCreate('description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Module Selector */}
            <div className="space-y-2">
              <Label htmlFor="module">{tCreate('label')}</Label>
              <Select
                value={selectedModule}
                onValueChange={(value) => setSelectedModule(value as ModuleType)}
              >
                <SelectTrigger id="module">
                  <SelectValue placeholder={tCreate('placeholder')} />
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
                {creating ? tCreate('creating') : tCreate('button')}
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
            {tList('title')}
          </CardTitle>
          <CardDescription>
            {tList('description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backupsLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {tList('loading')}
            </div>
          ) : !backups || backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {tList('empty')}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tList('table.date')}</TableHead>
                    <TableHead>{tList('table.module')}</TableHead>
                    <TableHead>{tList('table.items')}</TableHead>
                    <TableHead className="text-right">{tList('table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="font-medium">
                        {format(new Date(backup.created_at), 'PPpp')}
                      </TableCell>
                      <TableCell>{getModuleLabel(backup.module_type)}</TableCell>
                      <TableCell>{tList('itemCount', { count: backup.item_count })}</TableCell>
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
                            {tList('actions.restore')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteBackupId(backup.id)}
                            disabled={deleting}
                            className="gap-1 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                            {tList('actions.delete')}
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
            {tInfo('title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• {tInfo('point1')}</p>
          <p>• <strong>{tInfo('warning')}</strong> {tInfo('point2')}</p>
          <p>• {tInfo('point3')}</p>
          <p>• {tInfo('point4')}</p>
          <p>• {tInfo('point5')}</p>
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreBackup} onOpenChange={() => setRestoreBackup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tDialogs('restore.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tDialogs('restore.description', { module: restoreBackup ? getModuleLabel(restoreBackup.moduleType) : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tDialogs('restore.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreBackup} disabled={restoring}>
              {restoring ? tDialogs('restore.restoring') : tDialogs('restore.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteBackupId} onOpenChange={() => setDeleteBackupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tDialogs('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tDialogs('delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tDialogs('delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBackup}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? tDialogs('delete.deleting') : tDialogs('delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
