'use client';

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

interface BatchDeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  count: number;
  itemName?: string;
  isDeleting?: boolean;
  title?: string;
  description?: string;
  cancelLabel?: string;
  deleteLabel?: string;
  deletingLabel?: string;
}

export function BatchDeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  count,
  itemName = 'item',
  isDeleting = false,
  title,
  description,
  cancelLabel = 'Cancel',
  deleteLabel = 'Delete',
  deletingLabel = 'Deleting...',
}: BatchDeleteConfirmDialogProps) {
  const defaultTitle = `Delete ${count} ${itemName}${count > 1 ? 's' : ''}?`;
  const defaultDescription = `This action cannot be undone. This will permanently delete ${count} ${itemName}${count > 1 ? 's' : ''} from the system.`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title || defaultTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {description || defaultDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isDeleting} className="bg-destructive text-white hover:bg-destructive/90">
            {isDeleting ? deletingLabel : deleteLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
