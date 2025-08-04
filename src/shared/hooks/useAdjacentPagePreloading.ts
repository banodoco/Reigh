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

// Centralized function to mark images as cached
export const markImageAsCached = (image: any, isCached: boolean = true) => {
  (image as any).__memoryCached = isCached;
};

// Centralized function to check if image is cached
export const isImageCached = (image: any): boolean => {
  return (image as any).__memoryCached === true;
};

// Centralized function to clean up old pagination cache entries
export const cleanupOldPaginationCache = (
  queryClient: any,
  currentPage: number,
  projectId: string,
  maxCachedPages: number = 10,
  baseQueryKey: string = 'generations'
) => {
  // Get all generation queries from cache
  const allQueries = queryClient.getQueryCache().getAll();
  
  // Find generation queries with page numbers
  const generationQueries = allQueries.filter((query: any) => {
    const queryKey = query.queryKey;
    return queryKey?.[0] === baseQueryKey && 
           queryKey?.[1] === projectId && 
           typeof queryKey?.[2] === 'number'; // page number
  });

  // Sort by page distance from current page
  const queriesWithDistance = generationQueries.map((query: any) => ({
    query,
    page: query.queryKey[2],
    distance: Math.abs(query.queryKey[2] - currentPage)
  }));

  // Keep queries within reasonable distance, remove distant ones
  const queriesToRemove = queriesWithDistance
    .filter(item => item.distance > Math.floor(maxCachedPages / 2))
    .sort((a, b) => b.distance - a.distance) // Remove most distant first
    .slice(0, Math.max(0, generationQueries.length - maxCachedPages));

  // Clean up image cache for removed queries
  queriesToRemove.forEach(({ query }) => {
    const queryData = query.state?.data;
    if (queryData?.items) {
      // Clear memory cache flags from images
      queryData.items.forEach((image: any) => {
        delete (image as any).__memoryCached;
        delete (image as any).__fullImageCached;
      });
    }
  });

  // Remove distant queries from cache
  queriesToRemove.forEach(({ query }) => {
    console.log(`[CacheCleanup] Removing distant page cache:`, query.queryKey);
    queryClient.removeQueries({ queryKey: query.queryKey });
  });

  if (queriesToRemove.length > 0) {
    console.log(`[CacheCleanup] Cleaned up ${queriesToRemove.length} old pagination pages`);
  }
};

// Centralized function to trigger garbage collection for images (browser-level cleanup)
export const triggerImageGarbageCollection = () => {
  // Force browser to evaluate memory pressure and potentially clean up unused images
  if ('gc' in window && typeof (window as any).gc === 'function') {
    // Only available in Chrome with --js-flags="--expose-gc"
    try {
      (window as any).gc();
      console.log('[CacheCleanup] Manual garbage collection triggered');
    } catch (e) {
      // Ignore if not available
    }
  }
  
  // Alternative: Create memory pressure to encourage cleanup
  if (typeof window !== 'undefined') {
    // Small memory pressure technique
    setTimeout(() => {
      const temp = new Array(1000).fill(null);
      temp.length = 0;
    }, 100);
  }
};

// Centralized function to initialize prefetch operations
export const initializePrefetchOperations = (
  prefetchOperationsRef: React.MutableRefObject<{
    currentPrefetchId: string;
    images: HTMLImageElement[];
  }>,
  prefetchId: string
) => {
  prefetchOperationsRef.current = { images: [], currentPrefetchId: prefetchId };
};

// Centralized function for preloading images with cancellation checks
export const preloadImagesWithCancel = (
  cachedData: any,
  priority: 'next' | 'prev',
  currentPrefetchId: string,
  prefetchOperationsRef: React.MutableRefObject<{
    currentPrefetchId: string;
    images: HTMLImageElement[];
  }>
) => {
  if (!cachedData?.items) return;
  
  cachedData.items.forEach((img: any, idx: number) => {
    // Skip if this prefetch is no longer current
    if (prefetchOperationsRef.current.currentPrefetchId !== currentPrefetchId) return;
    
    // Priority-based delays: next page images load faster
    const baseDelay = priority === 'next' ? 50 : 200;
    const staggerDelay = idx * 30;
    
    setTimeout(() => {
      // Double-check this is still current before creating image
      if (prefetchOperationsRef.current.currentPrefetchId !== currentPrefetchId) return;
      
      const preloadImg = new Image();
      prefetchOperationsRef.current.images.push(preloadImg);
      
      preloadImg.onload = () => {
        // Use centralized cache marking function
        markImageAsCached(img, true);
        
        const imgIndex = prefetchOperationsRef.current.images.indexOf(preloadImg);
        if (imgIndex > -1) {
          prefetchOperationsRef.current.images.splice(imgIndex, 1);
        }
      };
      
      preloadImg.onerror = () => {
        const imgIndex = prefetchOperationsRef.current.images.indexOf(preloadImg);
        if (imgIndex > -1) {
          prefetchOperationsRef.current.images.splice(imgIndex, 1);
        }
      };
      
      preloadImg.src = getDisplayUrl(img.url);
      
      // Check if it was already cached (loads synchronously from memory)
      if (preloadImg.complete && preloadImg.naturalWidth > 0) {
        markImageAsCached(img, true);
      }
    }, baseDelay + staggerDelay);
  });
};

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
            // Use centralized cache marking function
            markImageAsCached(image, true);
            
            const imgIndex = operations.images.indexOf(preloadImg);
            if (imgIndex > -1) {
              operations.images.splice(imgIndex, 1);
            }
          };
          
          // Set the source to start loading
          preloadImg.src = getDisplayUrl(image.url);
          
          // Check if it was already cached (loads synchronously from memory)
          if (preloadImg.complete && preloadImg.naturalWidth > 0) {
            markImageAsCached(image, true);
          }
          
          preloadImg.onerror = () => {
            const imgIndex = operations.images.indexOf(preloadImg);
            if (imgIndex > -1) {
              operations.images.splice(imgIndex, 1);
            }
          };
          
          // Priority: preload full image for first 2 images of next page
          if (priority === 'next' && idx < 2 && image.fullImageUrl) {
            const fullImg = new Image();
            operations.images.push(fullImg);
            
            fullImg.onload = () => {
              // Mark full image as cached too (using a different flag)
              (image as any).__fullImageCached = true;
              
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
            
            // Check if full image was already cached
            if (fullImg.complete && fullImg.naturalWidth > 0) {
              (image as any).__fullImageCached = true;
            }
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