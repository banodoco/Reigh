import { useState, useEffect, useCallback } from 'react';

interface UseStickyHeaderProps {
  headerRef: React.RefObject<HTMLDivElement>;
  isMobile: boolean;
  isEditingName?: boolean;
  enabled?: boolean;
}

interface UseStickyHeaderReturn {
  isSticky: boolean;
  headerBounds: { left: number; width: number };
  stableBounds: { left: number; width: number };
  updateHeaderBounds: () => void;
}

/**
 * Hook to manage sticky header visibility based on scroll position
 * Uses RAF-based scroll detection for smooth performance
 */
export const useStickyHeader = ({
  headerRef,
  isMobile,
  isEditingName = false,
  enabled = true
}: UseStickyHeaderProps): UseStickyHeaderReturn => {
  const [isSticky, setIsSticky] = useState(false);
  const [headerBounds, setHeaderBounds] = useState({ left: 0, width: 0 });
  const [stableBounds, setStableBounds] = useState({ left: 0, width: 0 });

  const updateHeaderBounds = useCallback(() => {
    const containerEl = headerRef.current;
    if (!containerEl) return;

    const rect = containerEl.getBoundingClientRect();
    const newBounds = { left: rect.left, width: rect.width };
    setHeaderBounds(newBounds);
    setStableBounds(newBounds);
  }, [headerRef]);

  // RAF-based scroll detection for sticky header
  useEffect(() => {
    if (!enabled) return;

    const containerEl = headerRef.current;
    if (!containerEl) return;

    const stickyThresholdY = { current: 0 } as { current: number };
    const isStickyRef = { current: isSticky } as { current: boolean };
    let rafId = 0 as number | 0;

    const computeThreshold = () => {
      const rect = containerEl.getBoundingClientRect();
      const docTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      const containerDocTop = rect.top + docTop;

      const globalHeaderHeight = isMobile ? 60 : 96;
      const buffer = isMobile ? 5 : 10;

      // Trigger when shot name would be hidden by global header
      stickyThresholdY.current = containerDocTop - globalHeaderHeight - buffer;
    };

    const checkSticky = () => {
      rafId = 0 as number | 0;
      const currentScroll = (window.pageYOffset || document.documentElement.scrollTop || 0);
      const shouldBeSticky = currentScroll > stickyThresholdY.current;

      if (shouldBeSticky !== isStickyRef.current) {
        isStickyRef.current = shouldBeSticky;
        setIsSticky(shouldBeSticky);
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(checkSticky) as unknown as number;
    };

    const onResize = () => {
      computeThreshold();
      if (rafId) cancelAnimationFrame(rafId as unknown as number);
      rafId = requestAnimationFrame(checkSticky) as unknown as number;
    };

    computeThreshold();
    // Avoid immediate sticky check while editing to prevent instant blur
    if (!isEditingName) {
      checkSticky();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    const ro = new ResizeObserver(() => onResize());
    ro.observe(containerEl);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafId) cancelAnimationFrame(rafId as unknown as number);
      ro.disconnect();
    };
  }, [isMobile, isEditingName, isSticky, enabled]);

  // Update header bounds during scroll and resize
  useEffect(() => {
    if (!enabled) return;

    const containerEl = headerRef.current;
    if (!containerEl) return;

    let rafId: number | null = null;
    let lastUpdateTime = 0;
    const THROTTLE_MS = 16; // ~60fps

    const updateBounds = () => {
      const now = performance.now();
      // Only update if enough time has passed (throttle) or if sticky is not visible
      if (now - lastUpdateTime >= THROTTLE_MS || !isSticky) {
        updateHeaderBounds();
        lastUpdateTime = now;
      }
      rafId = null;
    };

    const scheduleUpdate = () => {
      // When sticky header is visible, throttle updates more aggressively
      if (isSticky) {
        // Only update on resize when sticky, not on scroll
        return;
      }
      if (rafId) return;
      rafId = requestAnimationFrame(updateBounds);
    };

    const handleScroll = () => scheduleUpdate();
    const handleResize = () => {
      updateHeaderBounds();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [updateHeaderBounds, isSticky, enabled]);

  // Initial bounds calculation
  useEffect(() => {
    if (enabled) {
      updateHeaderBounds();
    }
  }, [updateHeaderBounds, enabled]);

  // Capture stable bounds when sticky header becomes visible
  useEffect(() => {
    if (isSticky && headerBounds.width > 0) {
      setStableBounds(headerBounds);
    }
  }, [isSticky, headerBounds]);

  return {
    isSticky,
    headerBounds,
    stableBounds,
    updateHeaderBounds
  };
};
