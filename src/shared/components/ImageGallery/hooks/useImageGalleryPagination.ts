import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GeneratedImageWithMetadata } from '../ImageGallery';

/**
 * UNIFIED NAVIGATION STATE
 *
 * This replaces the previous dual-state approach (loadingButton + isGalleryLoading)
 * with a single state machine that's easier to reason about.
 *
 * States:
 * - idle: No navigation in progress
 * - navigating: User clicked prev/next, waiting for data & images to be ready
 *
 * The loading state is ALWAYS shown immediately when navigating starts,
 * and is ONLY cleared by onImagesReady (called by ProgressiveLoadingManager).
 */
export type NavigationStatus = 'idle' | 'navigating';

export interface NavigationState {
  status: NavigationStatus;
  direction: 'prev' | 'next' | null;  // null when idle
  targetPage: number | null;           // null when idle
  startedAt: number | null;            // timestamp for debugging/timeout
}

const INITIAL_NAVIGATION_STATE: NavigationState = {
  status: 'idle',
  direction: null,
  targetPage: null,
  startedAt: null,
};

export interface UseImageGalleryPaginationProps {
  filteredImages: GeneratedImageWithMetadata[];
  itemsPerPage: number;
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  serverPage?: number;
  offset?: number;
  totalCount?: number;
  enableAdjacentPagePreloading?: boolean;
  isMobile: boolean;
  galleryTopRef: React.RefObject<HTMLDivElement>;
}

export interface UseImageGalleryPaginationReturn {
  // Pagination state
  page: number;
  setPage: (page: number) => void;
  isServerPagination: boolean;

  // Unified navigation state (new)
  navigationState: NavigationState;

  // Backwards-compatible derived values (derived from navigationState)
  loadingButton: 'prev' | 'next' | null;
  setLoadingButton: (button: 'prev' | 'next' | null) => void;
  isGalleryLoading: boolean;
  setIsGalleryLoading: (loading: boolean) => void;

  // Clear navigation (the canonical way to end a navigation)
  clearNavigation: () => void;

  // Computed values
  paginatedImages: GeneratedImageWithMetadata[];
  totalFilteredItems: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;

  // Handlers
  handlePageChange: (newPage: number, direction: 'prev' | 'next', fromBottom?: boolean) => void;
}

export const useImageGalleryPagination = ({
  filteredImages,
  itemsPerPage,
  onServerPageChange,
  serverPage,
  offset = 0,
  totalCount,
  enableAdjacentPagePreloading = true,
  isMobile,
  galleryTopRef,
}: UseImageGalleryPaginationProps): UseImageGalleryPaginationReturn => {

  // Pagination state
  const [page, setPage] = useState(0);

  // Determine if we're in server-side pagination mode (available at init time)
  const isServerPagination = !!(onServerPageChange && serverPage);

  // UNIFIED NAVIGATION STATE
  // Start with navigating=true for server pagination to show loading on initial mount
  const [navigationState, setNavigationState] = useState<NavigationState>(
    isServerPagination
      ? { status: 'navigating', direction: null, targetPage: serverPage ?? 1, startedAt: Date.now() }
      : INITIAL_NAVIGATION_STATE
  );

  // Safety timeout ref for clearing stuck loading states
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track last applied server data signature so we can clear loading when new data arrives
  const lastServerDataSignatureRef = useRef<string>('');

  // CRITICAL: Track navigation state changes for debugging
  useEffect(() => {
    console.log(`[NAV_STATE] Navigation state changed:`, {
      status: navigationState.status,
      direction: navigationState.direction,
      targetPage: navigationState.targetPage,
      isServerPagination,
      currentPage: isServerPagination ? serverPage : page,
      elapsed: navigationState.startedAt ? Date.now() - navigationState.startedAt : null,
      timestamp: Date.now()
    });
  }, [navigationState, isServerPagination, serverPage, page]);

  // Derive backwards-compatible values from unified state
  const loadingButton = navigationState.status === 'navigating' ? navigationState.direction : null;
  const isGalleryLoading = navigationState.status === 'navigating';
  
  // When filters change, reset to first page (debounced to avoid rapid state changes)
  useEffect(() => {
    const timer = setTimeout(() => setPage(0), 10);
    return () => clearTimeout(timer);
  }, [filteredImages.length]); // Reset when filtered results change
  
  // Calculate pagination values
  const totalFilteredItems = isServerPagination ? (totalCount ?? (offset + filteredImages.length)) : filteredImages.length;
  const currentPageForCalc = isServerPagination ? (serverPage! - 1) : page;
  const totalPages = Math.max(1, Math.ceil(totalFilteredItems / itemsPerPage));
  
  const rangeStart = totalFilteredItems === 0 ? 0 : (isServerPagination ? offset : page * itemsPerPage) + 1;
  const rangeEnd = rangeStart + (isServerPagination ? filteredImages.length : Math.min(itemsPerPage, filteredImages.length - page * itemsPerPage)) - 1;
  
  // Get paginated images
  const paginatedImages = React.useMemo(() => {
    if (isServerPagination) {
      // In server pagination mode, don't slice - the server already sent us the right page
      return filteredImages;
    }
    return filteredImages.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
  }, [filteredImages, page, isServerPagination, itemsPerPage]);
  
  // Ensure current page is within bounds when totalPages changes (e.g., after filtering)
  useEffect(() => {
    if (page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, page]);

  // Canonical way to clear navigation state - called by onImagesReady
  const clearNavigation = useCallback(() => {
    console.log(`[NAV_STATE] clearNavigation called`, {
      previousStatus: navigationState.status,
      previousDirection: navigationState.direction,
      timestamp: Date.now()
    });

    setNavigationState(INITIAL_NAVIGATION_STATE);

    // Clear safety timeout since loading completed successfully
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, [navigationState.status, navigationState.direction]);

  // Backwards-compatible setters (for external callers)
  // These allow gradual migration - eventually these should be removed
  const setLoadingButton = useCallback((button: 'prev' | 'next' | null) => {
    if (button === null) {
      // Clearing loading - use the canonical method
      clearNavigation();
    } else {
      // Setting loading - this shouldn't happen via setter anymore
      // but support it for backwards compatibility
      console.warn(`[NAV_STATE] setLoadingButton called with "${button}" - prefer handlePageChange`);
      setNavigationState({
        status: 'navigating',
        direction: button,
        targetPage: null,
        startedAt: Date.now(),
      });
    }
  }, [clearNavigation]);

  const setIsGalleryLoading = useCallback((loading: boolean) => {
    if (!loading) {
      // Clearing loading - use the canonical method
      clearNavigation();
    } else {
      // Setting loading without direction - used by filter changes
      console.log(`[NAV_STATE] setIsGalleryLoading(true) - showing loading for filter change`);
      setNavigationState({
        status: 'navigating',
        direction: null, // No direction for filter changes
        targetPage: null,
        startedAt: Date.now(),
      });
    }
  }, [clearNavigation]);

  // Detect when new server data has been applied (includes mobile where prefetch is disabled)
  // IMPORTANT: Only clear loading when actual IMAGE DATA changes, not when serverPage changes.
  // The parent may update serverPage optimistically before data arrives.
  useEffect(() => {
    if (!isServerPagination) return;
    // Only proceed if we're actually in a loading state
    if (navigationState.status !== 'navigating') return;

    const firstId = filteredImages[0]?.id ?? 'none';
    const lastId = filteredImages[filteredImages.length - 1]?.id ?? 'none';
    // NOTE: Don't include serverPage in signature - it changes before data arrives.
    // Only use image data so we detect when actual new images are displayed.
    const signature = `${filteredImages.length}-${firstId}-${lastId}`;

    if (signature === lastServerDataSignatureRef.current) {
      return;
    }
    lastServerDataSignatureRef.current = signature;

    console.log(`[NAV_STATE] Server data changed, clearing navigation`, {
      serverPage,
      filteredCount: filteredImages.length,
      signature,
    });

    // Clear navigation - new page data has arrived
    clearNavigation();

  }, [filteredImages, isServerPagination, navigationState.status, serverPage, clearNavigation]);
  
  // Handle pagination with loading state
  const handlePageChange = useCallback((newPage: number, direction: 'prev' | 'next', fromBottom = false) => {
    // Generate unique navigation ID for tracking
    const navId = `nav-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[NAV_STATE] [${navId}] ${direction.toUpperCase()} pressed: ${isServerPagination ? serverPage : page} → ${newPage} (${isServerPagination ? 'server' : 'client'} mode)`);

    // Prevent multiple clicks while navigation is in progress
    if (navigationState.status === 'navigating') {
      console.log(`[NAV_STATE] [${navId}] BLOCKED - already navigating (${navigationState.direction})`);
      return;
    }

    // ALWAYS show loading state immediately
    // This is the single place where we start navigation
    setNavigationState({
      status: 'navigating',
      direction,
      targetPage: newPage,
      startedAt: Date.now(),
    });

    console.log(`[NAV_STATE] [${navId}] Navigation started - loading shown immediately`);

    // Clear any existing safety timeout
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }

    // Single safety timeout for the entire navigation
    // This is a FALLBACK only - normal completion is via onImagesReady
    safetyTimeoutRef.current = setTimeout(() => {
      console.warn(`[NAV_STATE] [${navId}] SAFETY TIMEOUT - navigation stuck after 5s, force clearing`);
      setNavigationState(INITIAL_NAVIGATION_STATE);
      safetyTimeoutRef.current = null;
    }, 5000); // Reduced from 8s - 5s is plenty for any network condition

    if (isServerPagination && onServerPageChange) {
      // Server-side pagination: notify the parent, which will handle scrolling
      console.log(`[NAV_STATE] [${navId}] Calling server pagination handler`);
      onServerPageChange(newPage, fromBottom);
      // Loading will be cleared by onImagesReady when new data renders
    } else {
      // Client-side pagination - update page state immediately
      console.log(`[NAV_STATE] [${navId}] Client pagination - updating local page state`);
      setPage(newPage);

      // Handle scroll for bottom button clicks
      // Note: This happens in a timeout to ensure the page state update has been processed
      if (fromBottom && galleryTopRef.current) {
        setTimeout(() => {
          const rect = galleryTopRef.current!.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetPosition = rect.top + scrollTop - (isMobile ? 80 : 20);

          console.log(`[NAV_STATE] [${navId}] Auto-scrolling to top (bottom button used)`);
          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth'
          });
        }, 50);
      }
      // Loading will be cleared by onImagesReady when images render
    }
  }, [navigationState.status, navigationState.direction, isServerPagination, onServerPageChange, setPage, isMobile, page, serverPage, galleryTopRef]);
  
  // Clean up safety timeout on unmount
  useEffect(() => {
    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    // Pagination state
    page,
    setPage,
    isServerPagination,

    // Unified navigation state (new)
    navigationState,

    // Backwards-compatible derived values
    loadingButton,
    setLoadingButton,
    isGalleryLoading,
    setIsGalleryLoading,

    // Clear navigation (canonical way to end navigation)
    clearNavigation,

    // Computed values
    paginatedImages,
    totalFilteredItems,
    totalPages,
    rangeStart,
    rangeEnd,

    // Handlers
    handlePageChange,
  };
};
