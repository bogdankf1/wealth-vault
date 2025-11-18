'use client';

import { LayoutGrid, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  useListLayoutsQuery,
  useActivateLayoutMutation,
  useGetActiveLayoutQuery,
} from '@/lib/api/dashboardLayoutsApi';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function QuickLayoutSwitcher() {
  const t = useTranslations('dashboard.widgets.layoutSwitcher');
  const { toast } = useToast();
  const { data: layoutsData, isLoading } = useListLayoutsQuery();
  const { data: activeLayout } = useGetActiveLayoutQuery();
  const [activateLayout] = useActivateLayoutMutation();

  const handleActivate = async (layoutId: string, layoutName: string) => {
    try {
      await activateLayout(layoutId).unwrap();
      toast({
        title: t('toast.switched'),
        description: t('toast.switchedDescription', { name: layoutName }),
      });
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('toast.errorDescription'),
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return <Skeleton className="h-9 w-40" />;
  }

  if (!layoutsData?.items || layoutsData.items.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline">
            {activeLayout?.name || t('selectLayout')}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {layoutsData.items.map((layout) => (
          <DropdownMenuItem
            key={layout.id}
            onClick={() => handleActivate(layout.id, layout.name)}
            className="cursor-pointer"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col">
                <span className="font-medium">{layout.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t('widgetsCount', { count: layout.configuration.widgets.filter((w) => w.visible).length })}
                </span>
              </div>
              {layout.is_active && (
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings/dashboard-layouts" className="cursor-pointer">
            <span className="text-sm">{t('manageLayouts')}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
