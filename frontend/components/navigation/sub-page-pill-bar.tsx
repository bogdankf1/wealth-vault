'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { BOTTOM_NAV_TABS, getActiveTab } from '@/lib/constants/bottom-nav-config';
import { NAVIGATION_FEATURES } from '@/lib/constants/feature-map';
import { useGetUserFeaturesQuery } from '@/lib/api/authApi';

export function SubPagePillBar() {
  const pathname = usePathname();
  const t = useTranslations('sidebar');
  const { data: userFeatures } = useGetUserFeaturesQuery();

  const hasFeatureAccess = (href: string): boolean => {
    const requiredFeature = NAVIGATION_FEATURES[href];
    if (!requiredFeature) return true;
    if (!userFeatures) return true;
    return requiredFeature in userFeatures.features;
  };

  const activeTab = getActiveTab(pathname);

  // Don't render if no active tab or tab has no sub-pages
  if (!activeTab || activeTab.subPages.length === 0) {
    return null;
  }

  const accessibleSubPages = activeTab.subPages.filter(sp => hasFeatureAccess(sp.href));

  // Don't render if only one sub-page is accessible
  if (accessibleSubPages.length <= 1) {
    return null;
  }

  return (
    <div className="xl:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {accessibleSubPages.map((subPage) => {
          const isActive = pathname.startsWith(subPage.href);

          return (
            <Link
              key={subPage.href}
              href={subPage.href}
              className={cn(
                'px-3.5 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors touch-manipulation',
                isActive
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 active:bg-gray-200 dark:active:bg-gray-600'
              )}
            >
              {t(subPage.labelKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
