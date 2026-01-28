/**
 * Notifications Page
 * Displays all user notifications with filtering and actions
 */
'use client';

import React, { useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingCards } from '@/components/ui/loading-state';
import { ApiErrorState } from '@/components/ui/error-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useListNotificationsQuery,
  useGetNotificationStatsQuery,
  useMarkNotificationsReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteNotificationsMutation,
  type Notification,
  type NotificationType,
  type NotificationCategory,
} from '@/lib/api/notificationsApi';
import { toast } from 'sonner';

/**
 * Get badge color based on notification type
 */
function getTypeBadgeVariant(type: NotificationType): 'destructive' | 'default' | 'secondary' | 'outline' {
  switch (type) {
    case 'alert':
      return 'destructive';
    case 'warning':
      return 'default';
    case 'achievement':
      return 'default';
    case 'reminder':
      return 'secondary';
    case 'info':
    default:
      return 'outline';
  }
}

/**
 * Get category emoji
 */
function getCategoryEmoji(category: NotificationCategory): string {
  switch (category) {
    case 'budget':
      return '\ud83d\udcca';
    case 'goal':
      return '\ud83c\udfaf';
    case 'subscription':
      return '\ud83d\udd14';
    case 'installment':
      return '\ud83d\udcb3';
    case 'debt':
      return '\ud83d\udcb0';
    case 'savings':
      return '\ud83d\udc37';
    case 'portfolio':
      return '\ud83d\udcc8';
    case 'income':
      return '\ud83d\udcb5';
    case 'expense':
      return '\ud83d\udee0';
    case 'billing':
      return '\u2b50';
    case 'system':
    default:
      return '\u2699\ufe0f';
  }
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function NotificationsPage() {
  const t = useTranslations('notifications');

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory | 'all'>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Build query params
  const queryParams = {
    page,
    page_size: 20,
    ...(typeFilter !== 'all' && { notification_type: typeFilter }),
    ...(categoryFilter !== 'all' && { category: categoryFilter }),
    ...(readFilter !== 'all' && { is_read: readFilter === 'read' }),
  };

  // Fetch data
  const {
    data: notificationsData,
    isLoading,
    error,
    refetch,
  } = useListNotificationsQuery(queryParams);

  const { data: stats } = useGetNotificationStatsQuery();

  // Mutations
  const [markRead, { isLoading: isMarkingRead }] = useMarkNotificationsReadMutation();
  const [markAllRead, { isLoading: isMarkingAllRead }] = useMarkAllNotificationsReadMutation();
  const [deleteNotifications, { isLoading: isDeleting }] = useDeleteNotificationsMutation();

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (!notificationsData?.items) return;
    if (selectedIds.size === notificationsData.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notificationsData.items.map((n) => n.id)));
    }
  };

  const handleMarkSelectedRead = async () => {
    if (selectedIds.size === 0) return;
    try {
      await markRead({ notification_ids: Array.from(selectedIds) }).unwrap();
      toast.success(t('page.markReadSuccess', { count: selectedIds.size }));
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(t('page.markReadError'));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead().unwrap();
      toast.success(t('page.markAllReadSuccess'));
    } catch (error) {
      toast.error(t('page.markAllReadError'));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      await deleteNotifications({ notification_ids: Array.from(selectedIds) }).unwrap();
      toast.success(t('page.deleteSuccess', { count: selectedIds.size }));
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(t('page.deleteError'));
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      await markRead({ notification_ids: [id] }).unwrap();
    } catch (error) {
      toast.error(t('page.markReadError'));
    }
  };

  const notifications = notificationsData?.items || [];
  const totalPages = Math.ceil((notificationsData?.total || 0) / 20);

  return (
    <div className="container mx-auto space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Page Header */}
      <div>
        <h1 className="text-lg lg:text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        {stats && (
          <p className="text-xs lg:text-sm text-muted-foreground mt-1 md:mt-2">
            {t('page.subtitle', { total: stats.total, unread: stats.unread })}
          </p>
        )}
      </div>

      {/* Filters & Actions */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col gap-3">
            {/* Filters - grid on mobile for better layout */}
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as NotificationType | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[140px] text-xs md:text-sm h-8 md:h-9">
                <SelectValue placeholder={t('page.filterType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('page.allTypes')}</SelectItem>
                <SelectItem value="alert">{t('types.alert')}</SelectItem>
                <SelectItem value="warning">{t('types.warning')}</SelectItem>
                <SelectItem value="reminder">{t('types.reminder')}</SelectItem>
                <SelectItem value="achievement">{t('types.achievement')}</SelectItem>
                <SelectItem value="info">{t('types.info')}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v as NotificationCategory | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[140px] text-xs md:text-sm h-8 md:h-9">
                <SelectValue placeholder={t('page.filterCategory')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('page.allCategories')}</SelectItem>
                <SelectItem value="budget">{t('categories.budget')}</SelectItem>
                <SelectItem value="goal">{t('categories.goal')}</SelectItem>
                <SelectItem value="subscription">{t('categories.subscription')}</SelectItem>
                <SelectItem value="installment">{t('categories.installment')}</SelectItem>
                <SelectItem value="debt">{t('categories.debt')}</SelectItem>
                <SelectItem value="savings">{t('categories.savings')}</SelectItem>
                <SelectItem value="portfolio">{t('categories.portfolio')}</SelectItem>
                <SelectItem value="income">{t('categories.income')}</SelectItem>
                <SelectItem value="expense">{t('categories.expense')}</SelectItem>
                <SelectItem value="billing">{t('categories.billing')}</SelectItem>
                <SelectItem value="system">{t('categories.system')}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={readFilter}
              onValueChange={(v) => {
                setReadFilter(v as 'all' | 'unread' | 'read');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[140px] text-xs md:text-sm h-8 md:h-9">
                <SelectValue placeholder={t('page.filterStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('page.allStatus')}</SelectItem>
                <SelectItem value="unread">{t('page.unreadOnly')}</SelectItem>
                <SelectItem value="read">{t('page.readOnly')}</SelectItem>
              </SelectContent>
            </Select>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t pt-3 sm:border-0 sm:pt-0">
              {selectedIds.size > 0 ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMarkSelectedRead}
                    disabled={isMarkingRead}
                    className="flex-1 sm:flex-initial h-8"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {t('page.markSelectedRead', { count: selectedIds.size })}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                    className="flex-1 sm:flex-initial h-8"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('page.deleteSelected', { count: selectedIds.size })}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllRead}
                  disabled={isMarkingAllRead || (stats?.unread ?? 0) === 0}
                  className="w-full sm:w-auto h-8"
                >
                  <CheckCheck className="mr-2 h-4 w-4" />
                  {t('page.markAllRead')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      {isLoading ? (
        <LoadingCards count={5} />
      ) : error ? (
        <ApiErrorState error={error} onRetry={refetch} />
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Bell}
              title={t('page.empty')}
              description={t('page.emptyDescription')}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-3 md:p-4">
            {/* Select All */}
            <div className="flex items-center gap-2 pb-3 md:pb-4 border-b mb-3 md:mb-4">
              <Checkbox
                checked={selectedIds.size === notifications.length && notifications.length > 0}
                onCheckedChange={handleSelectAll}
                aria-label={t('page.selectAll')}
              />
              <span className="text-sm text-muted-foreground">
                {selectedIds.size === notifications.length
                  ? t('page.deselectAll')
                  : t('page.selectAll')}
              </span>
            </div>

            {/* Notification Items */}
            <div className="space-y-2 md:space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    'flex items-start gap-2 md:gap-3 p-2.5 md:p-4 rounded-lg border transition-colors',
                    !notification.is_read
                      ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                      : 'bg-background border-border'
                  )}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={selectedIds.has(notification.id)}
                    onCheckedChange={() => handleToggleSelect(notification.id)}
                    className="mt-0.5 md:mt-1"
                  />

                  {/* Category emoji - hidden on mobile */}
                  <div className="hidden md:flex flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 items-center justify-center text-lg">
                    {getCategoryEmoji(notification.category)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1 md:gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                          <h3
                            className={cn(
                              'text-xs md:text-sm',
                              notification.is_read
                                ? 'font-normal text-gray-700 dark:text-gray-300'
                                : 'font-semibold text-gray-900 dark:text-white'
                            )}
                          >
                            {notification.title}
                          </h3>
                          {notification.priority === 1 && (
                            <Badge variant="destructive" className="text-[10px] md:text-xs px-1 md:px-1.5">
                              {t('page.urgent')}
                            </Badge>
                          )}
                          <Badge variant={getTypeBadgeVariant(notification.notification_type)} className="text-[10px] md:text-xs px-1 md:px-1.5">
                            {t(`types.${notification.notification_type}`)}
                          </Badge>
                        </div>
                        <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5 md:mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 md:gap-3 mt-1 md:mt-2 text-[10px] md:text-xs text-gray-400 dark:text-gray-500">
                          <span>{formatDate(notification.created_at)}</span>
                          <span className="hidden sm:inline">{t(`categories.${notification.category}`)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkSingleRead(notification.id)}
                            className="h-6 w-6 md:h-8 md:w-8 p-0"
                            title={t('page.markAsRead')}
                          >
                            <Check className="h-3 w-3 md:h-4 md:w-4" />
                          </Button>
                        )}
                        {notification.action_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-6 w-6 md:h-8 md:w-8 p-0"
                            title={t('page.viewDetails')}
                          >
                            <Link href={notification.action_url}>
                              <ExternalLink className="h-3 w-3 md:h-4 md:w-4" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 md:mt-6 pt-3 md:pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  {t('page.previous')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('page.pageOf', { current: page, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  {t('page.next')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
