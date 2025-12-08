import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeneratedImageWithMetadata } from '../ImageGallery';

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
  loadingButton: 'prev' | 'next' | null;
  setLoadingButton: (button: 'prev' | 'next' | null) => void;
  isGalleryLoading: boolean;
  setIsGalleryLoading: (loading: boolean) => void;
  
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
  const [loadingButton, setLoadingButton] = useState<'prev' | 'next' | null>(null);
  // Determine if we're in server-side pagination mode (available at init time)
  const isServerPagination = !!(onServerPageChange && serverPage);
  // Start with loading when in server pagination to avoid initial empty flash
  const [isGalleryLoading, setIsGalleryLoading] = useState<boolean>(isServerPagination);
  
  // Safety timeout ref for clearing stuck loading states
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track last applied server data signature so we can clear loading when new data arrives
  const lastServerDataSignatureRef = useRef<string>('');

  // CRITICAL: Track loadingButton state changes to debug disabled buttons
  useEffect(() => {
    console.warn(`[ReconnectionIssue][UI_LOADING_STATE] loadingButton state changed`, {
      loadingButton,
      isServerPagination,
      buttonsDisabled: loadingButton !== null,
      currentPage: isServerPagination ? serverPage : page,
      timestamp: Date.now()
    });
  }, [loadingButton, isServerPagination, serverPage, page]);
  
  // isServerPagination already computed
  
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

  // Detect when new server data has been applied (includes mobile where prefetch is disabled)
  useEffect(() => {
    if (!isServerPagination || !serverPage) return;

    const firstId = filteredImages[0]?.id ?? 'none';
    const lastId = filteredImages[filteredImages.length - 1]?.id ?? 'none';
    const signature = `${serverPage}-${filteredImages.length}-${firstId}-${lastId}`;

    if (signature === lastServerDataSignatureRef.current) {
      return;
    }
    lastServerDataSignatureRef.current = signature;

    console.log(`[PAGELOADINGDEBUG] Server page data applied – clearing loading states`, {
      serverPage,
      filteredCount: filteredImages.length,
      signature,
    });

    if (loadingButton !== null) {
      console.warn(`[ReconnectionIssue][UI_LOADING_STATE] Clearing loadingButton after data sync`, {
        serverPage,
        signature,
        timestamp: Date.now(),
      });
      setLoadingButton(null);
    }

    if (isGalleryLoading) {
      setIsGalleryLoading(false);
    }

    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, [filteredImages, isServerPagination, serverPage, loadingButton, isGalleryLoading]);
  
  // Handle pagination with loading state
  const handlePageChange = useCallback((newPage: number, direction: 'prev' | 'next', fromBottom = false) => {
    // Generate unique navigation ID for tracking
    const navId = `nav-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🔄 [PAGELOADINGDEBUG] [NAV:${navId}] ${direction.toUpperCase()} pressed: ${isServerPagination ? serverPage : page} → ${newPage} (${isServerPagination ? 'server' : 'client'} mode)`);
    
    if (loadingButton) {
      console.log(`❌ [PAGELOADINGDEBUG] [NAV:${navId}] BLOCKED - ${loadingButton} button still loading`);
      return;
    } // Prevent multiple clicks while any button is loading
    
    setLoadingButton(direction);
    console.warn(`[ReconnectionIssue][UI_LOADING_STATE] Setting loadingButton to "${direction}" - buttons will be disabled`, {
      navId,
      direction,
      isServerPagination,
      currentPage: isServerPagination ? serverPage : page,
      targetPage: newPage,
      timestamp: Date.now()
    });
    
    // Smart loading state: only show gallery loading for non-adjacent pages or when preloading is disabled
    const currentPageNum = isServerPagination ? (serverPage || 1) - 1 : page;
    const isAdjacentPage = Math.abs(newPage - currentPageNum) === 1;
    const shouldShowGalleryLoading = !isAdjacentPage || !enableAdjacentPagePreloading;
    
    if (shouldShowGalleryLoading) {
      console.log(`⏳ [PAGELOADINGDEBUG] [NAV:${navId}] Loading state: ON (${isAdjacentPage ? 'preloading disabled' : 'distant page'})`);
      setIsGalleryLoading(true); // Show loading state for distant pages or when preloading disabled
    } else {
      // For adjacent pages, set a shorter fallback timeout since images should be preloaded
      console.log(`⚡ [PAGELOADINGDEBUG] [NAV:${navId}] Loading state: DELAYED (adjacent page, likely preloaded)`);
      const fallbackTimeout = setTimeout(() => {
        console.log(`⏰ [PAGELOADINGDEBUG] [NAV:${navId}] Fallback loading activated (50ms elapsed)`);
        setIsGalleryLoading(true);
      }, 50); // Reduced from 200ms - shorter timeout for preloaded pages
      
      // The progressive loading hook will clear the loading state once ready
      // Store timeout for potential cleanup (though it will likely complete before cleanup)
      setTimeout(() => {
        clearTimeout(fallbackTimeout);
      }, 1000);
    }
    
    // Separate safety timeouts for button and gallery loading states
    // This prevents the UI from getting stuck in loading state
    // Clear any existing safety timeout first
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }
    
    // Gallery loading safety timeout (longer since it depends on progressive loading)
    safetyTimeoutRef.current = setTimeout(() => {
      console.log(`🚨 [PAGELOADINGDEBUG] [NAV:${navId}] GALLERY SAFETY TIMEOUT - progressive loading failed after 1.5s`);
      setIsGalleryLoading(false);
      safetyTimeoutRef.current = null;
    }, 1500);
    
    if (isServerPagination && onServerPageChange) {
      // Server-side pagination: notify the parent, which will handle scrolling.
      console.log(`📡 [PAGELOADINGDEBUG] [NAV:${navId}] Calling server pagination handler`);
      onServerPageChange(newPage, fromBottom); 
      
      // NOTE: Don't use a short timeout to clear button loading state.
      // The effect watching filteredImages changes (see ~line 106) will clear loadingButton
      // when the new data actually arrives. Using a fixed timeout (like 800ms) causes the
      // spinner to finish before data is displayed.
      // Only keep a very long safety timeout as a true fallback for stuck states.
      const buttonSafetyTimeout = setTimeout(() => {
        console.log(`🚨 [PAGELOADINGDEBUG] [NAV:${navId}] Button SAFETY TIMEOUT - data never arrived after 8s`);
        console.warn(`[ReconnectionIssue][UI_LOADING_STATE] Clearing loadingButton via safety timeout - buttons will be re-enabled`, {
          navId,
          reason: 'Server pagination safety timeout (8000ms)',
          timestamp: Date.now()
        });
        setLoadingButton(null);
      }, 8000); // Safety timeout only - data-arrival effect should clear this first
      
      console.log(`⏳ [PAGELOADINGDEBUG] [NAV:${navId}] Server pagination initiated - waiting for data arrival to clear loading...`);
    } else {
      // Client-side pagination - show loading longer for bottom buttons
      const loadingDelay = fromBottom ? 300 : 100;
      console.log(`🖥️ [PAGELOADINGDEBUG] [NAV:${navId}] Client pagination - updating local page state`);
      setPage(newPage);
      setTimeout(() => {
        console.log(`✅ [PAGELOADINGDEBUG] [NAV:${navId}] Client pagination completed`);
        console.warn(`[ReconnectionIssue][UI_LOADING_STATE] Clearing loadingButton via timeout - buttons will be re-enabled`, {
          navId,
          reason: `Client pagination timeout (${loadingDelay}ms)`,
          timestamp: Date.now()
        });
        setLoadingButton(null);
        // Don't clear gallery safety timeout here - let progressive loading handle it
        // Scroll to top of gallery AFTER page loads (only for bottom buttons)
        if (fromBottom && galleryTopRef.current) {
          const rect = galleryTopRef.current.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetPosition = rect.top + scrollTop - (isMobile ? 80 : 20); // Account for mobile nav/header
          
          console.log(`📜 [PAGELOADINGDEBUG] [NAV:${navId}] Auto-scrolling to top (bottom button used)`);
          window.scrollTo({
            top: Math.max(0, targetPosition), // Ensure we don't scroll above page top
            behavior: 'smooth'
          });
        }
      }, loadingDelay);
    }
  }, [loadingButton, isServerPagination, onServerPageChange, setPage, isMobile, page, serverPage, enableAdjacentPagePreloading, galleryTopRef]);
  
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
    loadingButton,
    setLoadingButton,
    isGalleryLoading,
    setIsGalleryLoading,
    
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
