import { useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface UseBackSwipeOptions {
  enabled?: boolean;
  edgeExclusionZone?: number;
  minDistance?: number;
  velocityThreshold?: number;
  desktopQuery?: string;
}

/**
 * Hook that adds a left-to-right swipe gesture to trigger router.back() on mobile/tablet.
 *
 * - Only activates on touches starting outside the left edge zone (sidebar territory)
 * - Direction lock: aborts if vertical movement exceeds horizontal on first move
 * - Triggers on sufficient distance OR fast flick velocity
 * - Disabled on desktop viewports and when `enabled` is false (e.g. sidebar open)
 */
export function useBackSwipe({
  enabled = true,
  edgeExclusionZone = 30,
  minDistance = 80,
  velocityThreshold = 0.4,
  desktopQuery = '(min-width: 1280px)',
}: UseBackSwipeOptions = {}) {
  const router = useRouter();

  const touchState = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    tracking: false,
    locked: false,
    direction: null as 'horizontal' | 'vertical' | null,
  });

  const isDesktop = useCallback(() => {
    return window.matchMedia(desktopQuery).matches;
  }, [desktopQuery]);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (isDesktop()) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];

      // Skip touches in the left edge zone (sidebar territory)
      if (touch.clientX < edgeExclusionZone) return;

      const state = touchState.current;
      state.startX = touch.clientX;
      state.startY = touch.clientY;
      state.startTime = Date.now();
      state.tracking = true;
      state.locked = false;
      state.direction = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDesktop()) return;

      const state = touchState.current;
      if (!state.tracking) return;
      if (e.touches.length !== 1) {
        state.tracking = false;
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      if (!state.locked) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Wait for minimum movement to determine direction
        if (absDx < 5 && absDy < 5) return;

        if (absDy > absDx) {
          // Vertical scroll — abort
          state.direction = 'vertical';
          state.locked = true;
          state.tracking = false;
          return;
        }

        // Only allow left-to-right swipes
        if (dx <= 0) {
          state.tracking = false;
          return;
        }

        state.direction = 'horizontal';
        state.locked = true;
      }

      if (state.direction !== 'horizontal') {
        state.tracking = false;
      }
    };

    const handleTouchEnd = () => {
      const state = touchState.current;

      if (!state.tracking || state.direction !== 'horizontal') {
        state.tracking = false;
        return;
      }

      // We don't have currentX from touchend (no touches remain),
      // but we can use the last known position via changedTouches
      state.tracking = false;
    };

    // Use a combined handler that checks the final position
    const handleTouchEndWithCheck = (e: TouchEvent) => {
      const state = touchState.current;

      if (!state.tracking || state.direction !== 'horizontal') {
        state.tracking = false;
        return;
      }

      const touch = e.changedTouches[0];
      if (!touch) {
        state.tracking = false;
        return;
      }

      const dx = touch.clientX - state.startX;
      const dt = Date.now() - state.startTime;
      const velocity = dt > 0 ? dx / dt : 0; // px/ms (positive = rightward)

      state.tracking = false;

      if (dx > minDistance || velocity > velocityThreshold) {
        router.back();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEndWithCheck);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEndWithCheck);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, edgeExclusionZone, minDistance, velocityThreshold, desktopQuery, isDesktop, router]);
}
