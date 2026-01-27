import { useRef, useEffect, useState, useCallback } from 'react';

interface UseSidebarSwipeOptions {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  sidebarWidth?: number;
  desktopQuery?: string;
}

/**
 * Hook that adds touch swipe gestures to open/close a sidebar on mobile/tablet.
 *
 * - Swipe right from left edge (<25px) to open
 * - Swipe left on sidebar or backdrop to close
 * - Direction lock: aborts if vertical > horizontal on first move
 * - Interactive drag: sidebar follows the finger via refs (no re-renders)
 * - Snap threshold: 40% of sidebar width or fast flick (>0.5 px/ms)
 */
export function useSidebarSwipe({
  isOpen,
  setIsOpen,
  sidebarWidth = 256,
  desktopQuery = '(min-width: 1280px)',
}: UseSidebarSwipeOptions) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Mutable state that persists across touch events without causing re-renders
  const touchState = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    currentX: 0,
    locked: false, // direction lock resolved
    direction: null as 'horizontal' | 'vertical' | null,
    dragging: false,
    wasOpen: false,
  });

  const isDesktop = useCallback(() => {
    return window.matchMedia(desktopQuery).matches;
  }, [desktopQuery]);

  const clearInlineStyles = useCallback(() => {
    if (sidebarRef.current) {
      sidebarRef.current.style.transform = '';
      sidebarRef.current.style.transition = '';
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = '';
      backdropRef.current.style.transition = '';
    }
  }, []);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (isDesktop()) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const state = touchState.current;

      // Only start tracking if:
      // - sidebar is open (swipe to close from anywhere on sidebar/backdrop)
      // - OR touch starts near left edge (swipe to open)
      const nearLeftEdge = touch.clientX < 25;
      if (!isOpen && !nearLeftEdge) return;

      state.startX = touch.clientX;
      state.startY = touch.clientY;
      state.startTime = Date.now();
      state.currentX = touch.clientX;
      state.locked = false;
      state.direction = null;
      state.dragging = false;
      state.wasOpen = isOpen;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDesktop()) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const state = touchState.current;

      // If we haven't started tracking, skip
      if (state.startX === 0 && state.startY === 0 && !state.dragging) return;

      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      // Direction lock: decide on first significant move
      if (!state.locked) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Wait for a minimum movement to determine direction
        if (absDx < 5 && absDy < 5) return;

        if (absDy > absDx) {
          // Vertical scroll - abort gesture
          state.direction = 'vertical';
          state.locked = true;
          return;
        }

        state.direction = 'horizontal';
        state.locked = true;

        // Validate swipe direction
        if (!state.wasOpen && dx <= 0) {
          // Trying to swipe left from closed sidebar - abort
          state.direction = 'vertical'; // hack to skip future moves
          return;
        }
        if (state.wasOpen && dx >= 0) {
          // Trying to swipe right on open sidebar - abort
          state.direction = 'vertical';
          return;
        }

        // Start dragging
        state.dragging = true;
        setIsDragging(true);
      }

      if (state.direction !== 'horizontal' || !state.dragging) return;

      // Prevent scrolling during horizontal swipe
      e.preventDefault();

      state.currentX = touch.clientX;

      // Calculate sidebar position
      let offset: number;
      if (state.wasOpen) {
        // Closing: sidebar starts at 0, moves left
        offset = Math.min(0, Math.max(-sidebarWidth, dx));
      } else {
        // Opening: sidebar starts at -sidebarWidth, moves right
        offset = Math.min(0, -sidebarWidth + Math.max(0, dx));
      }

      // Apply transforms directly via refs
      if (sidebarRef.current) {
        sidebarRef.current.style.transition = 'none';
        sidebarRef.current.style.transform = `translateX(${offset}px)`;
      }

      if (backdropRef.current) {
        const progress = (sidebarWidth + offset) / sidebarWidth;
        backdropRef.current.style.transition = 'none';
        backdropRef.current.style.opacity = String(Math.max(0, Math.min(1, progress)) * 0.75);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const state = touchState.current;

      if (!state.dragging) {
        // Reset start values
        state.startX = 0;
        state.startY = 0;
        return;
      }

      const dx = state.currentX - state.startX;
      const dt = Date.now() - state.startTime;
      const velocity = Math.abs(dx) / dt; // px/ms

      const threshold = sidebarWidth * 0.4;
      const isFlick = velocity > 0.5;

      let shouldOpen: boolean;
      if (state.wasOpen) {
        // Was open, swiping to close
        shouldOpen = !(Math.abs(dx) > threshold || isFlick);
      } else {
        // Was closed, swiping to open
        shouldOpen = dx > threshold || isFlick;
      }

      // Clear inline styles so CSS classes take over
      clearInlineStyles();

      // Sync React state
      setIsOpen(shouldOpen);
      setIsDragging(false);

      // Reset
      state.startX = 0;
      state.startY = 0;
      state.dragging = false;
      state.locked = false;
      state.direction = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isOpen, setIsOpen, sidebarWidth, desktopQuery, isDesktop, clearInlineStyles]);

  // Clean up inline styles on desktop resize
  useEffect(() => {
    const mq = window.matchMedia(desktopQuery);
    const handleChange = () => {
      if (mq.matches) {
        clearInlineStyles();
        setIsDragging(false);
        touchState.current.dragging = false;
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [desktopQuery, clearInlineStyles]);

  return { sidebarRef, backdropRef, isDragging };
}
