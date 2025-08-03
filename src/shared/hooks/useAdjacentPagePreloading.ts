import { useEffect, useRef, useCallback } from 'react';
import { getDisplayUrl } from '@/shared/lib/utils';

interface UseAdjacentPagePreloadingProps {
  enabled?: boolean;
  isServerPagination?: boolean;
  page: number;
  serverPage?: number;
  totalFilteredItems: number;
  itemsPerPage: number;
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  allImages?: any[]; // For client-side pagination
}

interface PreloadOperation {
  images: HTMLImageElement[];
  timeouts: NodeJS.Timeout[];
  currentPageId: string;
}

export const useAdjacentPagePreloading = ({
  enabled = true,
  isServerPagination = false,
  page,
  serverPage,
  totalFilteredItems,
  itemsPerPage,
  onPrefetchAdjacentPages,
  allImages = [],
}: UseAdjacentPagePreloadingProps) => {
  // Track ongoing preload operations for proper cancellation
  const preloadOperationsRef = useRef<PreloadOperation>({
    images: [],
    timeouts: [],
    currentPageId: '',
  });

  // Cancel all ongoing preload operations
  const cancelAllPreloads = useCallback(() => {
    const operations = preloadOperationsRef.current;
    
    // Cancel image loading
    operations.images.forEach(img => {
      img.onload = null;
      img.onerror = null;
      img.src = ''; // Cancel loading
    });
    
    // Clear timeouts
    operations.timeouts.forEach(timeout => clearTimeout(timeout));
    
    // Reset tracking
    preloadOperationsRef.current = {
      images: [],
      timeouts: [],
      currentPageId: '',
    };
  }, []);

  // Client-side adjacent page preloading
  const preloadClientSidePages = useCallback((
    prevPageImages: any[],
    nextPageImages: any[],
    pageId: string
  ) => {
    const operations = preloadOperationsRef.current;
    
    // Helper to preload images with prioritization and cancellation
    const preloadImagesWithPriority = (
      images: any[],
      priority: 'next' | 'prev',
      maxImages: number = 5
    ) => {
      const imagesToPreload = images.slice(0, maxImages);
      const baseDelay = priority === 'next' ? 50 : 200;
      
      imagesToPreload.forEach((image, idx) => {
        const timeout = setTimeout(() => {
          // Check if this preload is still valid
          if (operations.currentPageId !== pageId) return;
          
          const preloadImg = new Image();
          operations.images.push(preloadImg);
          
          preloadImg.onload = () => {
            const imgIndex = operations.images.indexOf(preloadImg);
            if (imgIndex > -1) {
              operations.images.splice(imgIndex, 1);
            }
          };
          
          preloadImg.onerror = () => {
            const imgIndex = operations.images.indexOf(preloadImg);
            if (imgIndex > -1) {
              operations.images.splice(imgIndex, 1);
            }
          };
          
          preloadImg.src = getDisplayUrl(image.url);
          
          // Priority: preload full image for first 2 images of next page
          if (priority === 'next' && idx < 2 && image.fullImageUrl) {
            const fullImg = new Image();
            operations.images.push(fullImg);
            
            fullImg.onload = () => {
              const fullImgIndex = operations.images.indexOf(fullImg);
              if (fullImgIndex > -1) {
                operations.images.splice(fullImgIndex, 1);
              }
            };
            
            fullImg.onerror = () => {
              const fullImgIndex = operations.images.indexOf(fullImg);
              if (fullImgIndex > -1) {
                operations.images.splice(fullImgIndex, 1);
              }
            };
            
            fullImg.src = getDisplayUrl(image.fullImageUrl);
          }
        }, baseDelay + (idx * 30));
        
        operations.timeouts.push(timeout);
      });
    };

    // Preload next page first (higher priority)
    if (nextPageImages.length > 0) {
      preloadImagesWithPriority(nextPageImages, 'next');
    }
    
    // Preload previous page second (lower priority)  
    if (prevPageImages.length > 0) {
      preloadImagesWithPriority(prevPageImages, 'prev');
    }
  }, []);

  // Main preloading effect
  useEffect(() => {
    if (!enabled) return;
    
    // Cancel any existing preloads immediately
    cancelAllPreloads();
    
    // Debounce preloading to avoid excessive operations on rapid page changes
    const preloadTimer = setTimeout(() => {
      const totalPages = Math.max(1, Math.ceil(totalFilteredItems / itemsPerPage));
      const currentPageForPreload = isServerPagination ? (serverPage! - 1) : page;
      
      // Calculate adjacent pages
      const prevPage = currentPageForPreload > 0 ? currentPageForPreload - 1 : null;
      const nextPage = currentPageForPreload < totalPages - 1 ? currentPageForPreload + 1 : null;
      
      // Create unique page ID for this preload session
      const pageId = `${currentPageForPreload}-${Date.now()}`;
      preloadOperationsRef.current.currentPageId = pageId;
      
      if (isServerPagination) {
        // For server-side pagination, call the callback to prefetch data
        if (onPrefetchAdjacentPages) {
          const serverPrevPage = prevPage !== null ? prevPage + 1 : null; // Convert back to 1-based
          const serverNextPage = nextPage !== null ? nextPage + 1 : null;
          onPrefetchAdjacentPages(serverPrevPage, serverNextPage);
        }
      } else {
        // For client-side pagination, preload adjacent page images directly
        if (allImages.length > 0) {
          const startIndex = currentPageForPreload * itemsPerPage;
          
          // Get images for adjacent pages
          const prevPageImages = prevPage !== null 
            ? allImages.slice(prevPage * itemsPerPage, startIndex)
            : [];
          const nextPageImages = nextPage !== null
            ? allImages.slice((currentPageForPreload + 1) * itemsPerPage, (currentPageForPreload + 2) * itemsPerPage)
            : [];
          
          preloadClientSidePages(prevPageImages, nextPageImages, pageId);
        }
      }
    }, 500); // 500ms debounce
    
    preloadOperationsRef.current.timeouts.push(preloadTimer);
    
    return () => {
      clearTimeout(preloadTimer);
    };
  }, [
    enabled,
    isServerPagination,
    page,
    serverPage,
    totalFilteredItems,
    itemsPerPage,
    onPrefetchAdjacentPages,
    allImages,
    cancelAllPreloads,
    preloadClientSidePages,
  ]);

  // Clean up all operations on unmount
  useEffect(() => {
    return () => {
      cancelAllPreloads();
    };
  }, [cancelAllPreloads]);

  return {
    cancelAllPreloads,
  };
}; 