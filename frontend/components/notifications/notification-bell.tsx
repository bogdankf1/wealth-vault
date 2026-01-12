'use client';

import { Bell, Check, CheckCheck, ExternalLink, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  useGetUnreadCountQuery,
  useListNotificationsQuery,
  useMarkNotificationsReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteNotificationMutation,
  type Notification,
  type NotificationType,
  type NotificationCategory,
} from '@/lib/api/notificationsApi';

/**
 * Get icon background color based on notification type
 */
function getNotificationTypeColor(type: NotificationType): string {
  switch (type) {
    case 'alert':
      return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
    case 'warning':
      return 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'achievement':
      return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
    case 'reminder':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
    case 'info':
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  }
}

/**
 * Get category icon/emoji
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
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}

function NotificationItem({ notification, onMarkRead, onDelete }: NotificationItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        'relative px-4 py-3 border-b last:border-b-0 dark:border-gray-700 transition-colors',
        notification.is_read
          ? 'bg-white dark:bg-gray-800'
          : 'bg-blue-50/50 dark:bg-blue-900/10'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3">
        {/* Category emoji/icon */}
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm',
            getNotificationTypeColor(notification.notification_type)
          )}
        >
          {getCategoryEmoji(notification.category)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={cn(
              'text-sm truncate',
              notification.is_read
                ? 'font-normal text-gray-700 dark:text-gray-300'
                : 'font-semibold text-gray-900 dark:text-white'
            )}>
              {notification.title}
            </h4>
            {notification.priority === 1 && (
              <span className="flex-shrink-0 w-2 h-2 bg-red-500 rounded-full" title="Urgent" />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
            {notification.message}
          </p>
          <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 block">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>

        {/* Action buttons (show on hover) */}
        <div className={cn(
          'flex-shrink-0 flex items-center gap-1 transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}>
          {!notification.is_read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(notification.id);
              }}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              title="Mark as read"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          {notification.action_url && (
            <Link
              href={notification.action_url}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              title="View details"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(notification.id);
            }}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const t = useTranslations('notifications');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch unread count (polls every 60 seconds)
  const { data: unreadData } = useGetUnreadCountQuery(undefined, {
    pollingInterval: 60000,
  });

  // Fetch recent notifications
  const { data: notificationsData, isLoading } = useListNotificationsQuery(
    { page_size: 10 },
    { skip: !isOpen }
  );

  // Mutations
  const [markRead] = useMarkNotificationsReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();
  const [deleteNotification] = useDeleteNotificationMutation();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkRead = async (id: string) => {
    try {
      await markRead({ notification_ids: [id] }).unwrap();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead().unwrap();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id).unwrap();
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const unreadCount = unreadData?.unread_count ?? 0;
  const hasUrgent = unreadData?.has_urgent ?? false;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-full transition-colors',
          'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
          'dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700',
          isOpen && 'bg-gray-100 dark:bg-gray-700'
        )}
        aria-label={t('bell.label')}
      >
        <Bell className="w-5 h-5" />

        {/* Badge */}
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-xs font-bold rounded-full flex items-center justify-center',
              hasUrgent
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-blue-500 text-white'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {t('dropdown.title')}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {t('dropdown.markAllRead')}
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              </div>
            ) : notificationsData?.items.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('dropdown.empty')}
                </p>
              </div>
            ) : (
              notificationsData?.items.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notificationsData && notificationsData.total > 10 && (
            <div className="px-4 py-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <Link
                href="/dashboard/notifications"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                onClick={() => setIsOpen(false)}
              >
                {t('dropdown.viewAll', { count: notificationsData.total })}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
