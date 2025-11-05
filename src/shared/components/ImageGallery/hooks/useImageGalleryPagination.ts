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
  
  // Handle pagination with loading state
  const handlePageChange = useCallback((newPage: number, direction: 'prev' | 'next', fromBottom = false) => {
    // Generate unique navigation ID for tracking
    const navId = `nav-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    } pressed: ${isServerPagination ? serverPage : page} → ${newPage} (${isServerPagination ? 'server' : 'client'} mode)`);
    
    if (loadingButton) {
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
      `);
      setIsGalleryLoading(true); // Show loading state for distant pages or when preloading disabled
    } else {
      // For adjacent pages, set a shorter fallback timeout since images should be preloaded
      `);
      const fallbackTimeout = setTimeout(() => {
        `);
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
      setIsGalleryLoading(false);
      safetyTimeoutRef.current = null;
    }, 1500);
    
    if (isServerPagination && onServerPageChange) {
      // Server-side pagination: notify the parent, which will handle scrolling.
      onServerPageChange(newPage, fromBottom); 
      
      // For server pagination, clear button loading on a shorter timeout to prevent stuck states
      // The progressive loading will handle the gallery loading state separately
      const buttonTimeout = setTimeout(() => {
        console.warn(`[ReconnectionIssue][UI_LOADING_STATE] Clearing loadingButton via timeout - buttons will be re-enabled`, {
          navId,
          reason: 'Server pagination timeout (800ms)',
          timestamp: Date.now()
        });
        setLoadingButton(null);
      }, 800); // Shorter timeout for better UX
      
      } else {
      // Client-side pagination - show loading longer for bottom buttons
      const loadingDelay = fromBottom ? 300 : 100;
      setPage(newPage);
      setTimeout(() => {
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
          
          `);
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
