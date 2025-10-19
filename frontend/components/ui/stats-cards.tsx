/**
 * Stats Cards Component
 * Reusable statistics cards grid for module pages
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatCard {
  title: string;
  value: string | number | React.ReactNode;
  description?: string | React.ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
}

interface StatsCardsProps {
  stats: StatCard[];
  className?: string;
}

export function StatsCards({ stats, className }: StatsCardsProps) {
  return (
    <div className={cn('grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">{stat.title}</CardTitle>
              <Icon className={cn('h-4 w-4 flex-shrink-0 text-muted-foreground', stat.iconClassName)} />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold">{stat.value}</div>
              {stat.description && (
                <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{stat.description}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
