'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { BOTTOM_NAV_TABS, getActiveTab } from '@/lib/constants/bottom-nav-config';
import { useLastVisitedSubPage } from '@/hooks/use-last-visited-sub-page';
import { NAVIGATION_FEATURES } from '@/lib/constants/feature-map';
import { useGetUserFeaturesQuery } from '@/lib/api/authApi';
import { useEffect } from 'react';

export function BottomNavBar() {
  const pathname = usePathname();
  const t = useTranslations('sidebar');
  const { setLastVisited, getLastVisited } = useLastVisitedSubPage();
  const { data: userFeatures } = useGetUserFeaturesQuery();

  const hasFeatureAccess = (href: string): boolean => {
    const requiredFeature = NAVIGATION_FEATURES[href];
    if (!requiredFeature) return true;
    if (!userFeatures) return true;
    return requiredFeature in userFeatures.features;
  };

  const activeTab = getActiveTab(pathname);

  // Track last visited sub-page
  useEffect(() => {
    if (activeTab && activeTab.subPages.length > 0) {
      const matchingSubPage = activeTab.subPages.find(sp => pathname.startsWith(sp.href));
      if (matchingSubPage) {
        setLastVisited(activeTab.key, matchingSubPage.href);
      }
    }
  }, [pathname, activeTab, setLastVisited]);

  return (
    <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14">
        {BOTTOM_NAV_TABS.map((tab) => {
          // Check if at least one sub-page is accessible
          const hasAccess = tab.subPages.length === 0
            || tab.subPages.some(sp => hasFeatureAccess(sp.href));

          if (!hasAccess) return null;

          const isActive = activeTab?.key === tab.key;
          const Icon = tab.icon;

          // Determine href: last visited or default (filtered by access)
          let href = tab.defaultHref;
          if (tab.subPages.length > 0) {
            const lastVisited = getLastVisited(tab.key);
            if (lastVisited && hasFeatureAccess(lastVisited)) {
              href = lastVisited;
            } else {
              // Fall back to first accessible sub-page
              const firstAccessible = tab.subPages.find(sp => hasFeatureAccess(sp.href));
              if (firstAccessible) {
                href = firstAccessible.href;
              }
            }
          }

          return (
            <Link
              key={tab.key}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors touch-manipulation',
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-300'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-tight">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
