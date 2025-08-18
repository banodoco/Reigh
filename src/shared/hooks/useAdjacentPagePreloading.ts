import { useEffect, useRef, useCallback } from 'react';
import { getDisplayUrl } from '@/shared/lib/utils';
import { 
  isImageCached, 
  setImageCacheStatus, 
  clearCacheForImages,
  keepOnlyInCache 
} from '@/shared/lib/imageCacheManager';

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

// Legacy exports for backwards compatibility
export const markImageAsCached = setImageCacheStatus;

// Device capability detection for smart preloading
interface PreloadConfig {
  maxCachedPages: number;
  preloadStrategy: 'aggressive' | 'moderate' | 'conservative' | 'disabled';
  maxConcurrentPreloads: number;
  thumbnailOnlyPreload: boolean;
  debounceTime: number;
}

const getPreloadConfig = (): PreloadConfig => {
  // Check if we're on mobile
  const isMobile = window.innerWidth <= 768;
  
  // Check memory (if available)
  const hasLowMemory = 'deviceMemory' in navigator && (navigator as any).deviceMemory <= 4;
  
  // Check CPU cores (if available) 
  const hasLowEndCPU = 'hardwareConcurrency' in navigator && navigator.hardwareConcurrency <= 2;
  
  // Check connection (if available)
  const hasSlowConnection = 'connection' in navigator && 
    ((navigator as any).connection?.effectiveType === '2g' || 
     (navigator as any).connection?.effectiveType === 'slow-2g');

  // Determine strategy based on device capabilities
  if (hasSlowConnection || (hasLowMemory && hasLowEndCPU)) {
    return {
      maxCachedPages: 3, // Current + 1 adjacent page each side
      preloadStrategy: 'conservative',
      maxConcurrentPreloads: 1,
      thumbnailOnlyPreload: true,
      debounceTime: 800
    };
  } else if (isMobile || hasLowMemory || hasLowEndCPU) {
    return {
      maxCachedPages: 5, // Current + 2 adjacent pages each side
      preloadStrategy: 'moderate', 
      maxConcurrentPreloads: 2,
      thumbnailOnlyPreload: true,
      debounceTime: 600
    };
  } else {
    return {
      maxCachedPages: 7, // Current + 3 adjacent pages each side
      preloadStrategy: 'aggressive',
      maxConcurrentPreloads: 3,
      thumbnailOnlyPreload: false,
      debounceTime: 400
    };
  }
};

// Performance monitoring for adaptive behavior
const performanceMonitor = {
  preloadTimes: [] as number[],
  memoryUsage: [] as number[],
  currentConfig: getPreloadConfig(),
  
  recordPreloadTime: (time: number) => {
    performanceMonitor.preloadTimes.push(time);
    if (performanceMonitor.preloadTimes.length > 10) {
      performanceMonitor.preloadTimes.shift(); // Keep only last 10 measurements
    }
  },
  
  recordMemoryUsage: () => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      performanceMonitor.memoryUsage.push(memory.usedJSHeapSize);
      if (performanceMonitor.memoryUsage.length > 5) {
        performanceMonitor.memoryUsage.shift();
      }
    }
  },
  
  adaptConfig: () => {
    const avgPreloadTime = performanceMonitor.preloadTimes.length > 0 
      ? performanceMonitor.preloadTimes.reduce((a, b) => a + b, 0) / performanceMonitor.preloadTimes.length 
      : 0;
    
    const memoryIncrease = performanceMonitor.memoryUsage.length > 1
      ? (performanceMonitor.memoryUsage[performanceMonitor.memoryUsage.length - 1] - performanceMonitor.memoryUsage[0]) / performanceMonitor.memoryUsage[0]
      : 0;
    
    // If performance is degrading, become more conservative
    if (avgPreloadTime > 2000 || memoryIncrease > 0.5) {
      const current = performanceMonitor.currentConfig;
      if (current.preloadStrategy !== 'conservative') {
        performanceMonitor.currentConfig = {
          ...current,
          maxCachedPages: Math.max(3, current.maxCachedPages - 2),
          maxConcurrentPreloads: Math.max(1, current.maxConcurrentPreloads - 1),
          thumbnailOnlyPreload: true,
          preloadStrategy: current.preloadStrategy === 'aggressive' ? 'moderate' : 'conservative'
        };
        console.log('[ImageLoadingDebug][SmartPreload] Adapted to more conservative strategy due to performance');
      }
    }
  }
};

// Priority-based preload queue to prevent browser overload
class PreloadQueue {
  private queue: Array<{
    url: string;
    priority: number;
    onLoad: () => void;
    onError: () => void;
  }> = [];
  private active = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  add(url: string, priority: number, onLoad: () => void, onError: () => void) {
    this.queue.push({ url, priority, onLoad, onError });
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
    this.processQueue();
  }

  private processQueue() {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.active++;
      
      // Check if this is a video file - handle differently
      const isVideo = item.url.match(/\.(mp4|webm|mov|avi)$/i);
      
      if (isVideo) {
        // For videos, just mark as "preloaded" without actually loading
        // since video preloading can be heavy and fail with Image()
        setTimeout(() => {
          this.active--;
          performanceMonitor.recordPreloadTime(1); // Minimal time for videos
          item.onLoad();
          this.processQueue();
        }, 1); // Immediate async completion
      } else {
        const img = new Image();
        const startTime = Date.now();
        
        img.onload = () => {
          this.active--;
          performanceMonitor.recordPreloadTime(Date.now() - startTime);
          item.onLoad();
          this.processQueue();
        };
        
        img.onerror = () => {
          this.active--;
          item.onError();
          this.processQueue();
        };
        
        img.src = item.url;
      }
    }
  }

  clear() {
    this.queue = [];
    // Note: we can't cancel active downloads, but we can clear the queue
  }

  updateConcurrency(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
    this.processQueue();
  }

  size(): number {
    return this.queue.length;
  }
}

const globalPreloadQueue = new PreloadQueue();

// Smart cleanup that adapts to device capabilities  
export const smartCleanupOldPages = (
  queryClient: any,
  currentPage: number,
  projectId: string,
  baseQueryKey: string = 'generations'
) => {
  // Auto-detect current page if passed page seems wrong by finding the most recently accessed query
  let actualCurrentPage = currentPage;
  
  // Get all generation queries and find the most recently accessed one
  const allQueries = queryClient.getQueryCache().getAll();
  const generationQueries = allQueries.filter((query: any) => {
    const queryKey = query.queryKey;
    return queryKey?.[0] === baseQueryKey && 
           queryKey?.[1] === projectId && 
           typeof queryKey?.[2] === 'number'; // page number
  });
  
  if (generationQueries.length > 0) {
    // Find the query with the most recent dataUpdatedAt
    const mostRecentQuery = generationQueries.reduce((latest, current) => 
      (current.state.dataUpdatedAt || 0) > (latest.state.dataUpdatedAt || 0) ? current : latest
    );
    
    const detectedPage = mostRecentQuery.queryKey[2];
    
    // If the detected page is very different from the passed page, use the detected one
    if (Math.abs(detectedPage - currentPage) > 1) {
      console.log(`[ImageLoadingDebug][CacheCleanup] Auto-correcting page: passed=${currentPage}, detected=${detectedPage} (using detected)`);
      actualCurrentPage = detectedPage;
    }
  }
  // Generate unique cleanup ID for tracking
  const cleanupId = `cleanup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Starting smart cleanup:`, {
    passedPage: currentPage,
    actualCurrentPage,
    projectId,
    baseQueryKey,
    timestamp: new Date().toISOString()
  });
  
  const config = performanceMonitor.currentConfig;
  const keepRange = Math.floor(config.maxCachedPages / 2);
  
  console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Cleanup configuration:`, {
    maxCachedPages: config.maxCachedPages,
    keepRange,
    strategy: config.preloadStrategy
  });
  
  console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Found cached queries:`, {
    totalQueries: allQueries.length,
    generationQueries: generationQueries.length,
    pages: generationQueries.map(q => q.queryKey[2]).sort((a, b) => a - b)
  });

  // Sort by page distance from current page
  const queriesWithDistance = generationQueries.map((query: any) => ({
    query,
    page: query.queryKey[2],
    distance: Math.abs(query.queryKey[2] - actualCurrentPage)
  }));

  // Keep queries within range (current ± keepRange), remove distant ones
  const queriesToRemove = queriesWithDistance
    .filter(item => item.distance > keepRange)
    .sort((a, b) => b.distance - a.distance); // Remove most distant first

  console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Cleanup analysis:`, {
    keepRange,
    pagesToKeep: queriesWithDistance.filter(item => item.distance <= keepRange).map(item => item.page),
    pagesToRemove: queriesToRemove.map(item => item.page),
    totalToRemove: queriesToRemove.length
  });

  // Clean up image cache flags for removed queries
  let totalImagesCleared = 0;
  queriesToRemove.forEach(({ query, page }) => {
    const queryData = query.state?.data;
    if (queryData?.items) {
      const imageCount = queryData.items.length;
      totalImagesCleared += imageCount;
      
              console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Clearing image cache flags for page ${page} (${imageCount} images)`);
        
        // Clear cache using centralized manager
        clearCacheForImages(queryData.items);
    }
  });

  // Remove distant queries from cache
  queriesToRemove.forEach(({ query, page }) => {
    console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Removing query cache for page ${page}:`, query.queryKey);
    queryClient.removeQueries({ queryKey: query.queryKey });
  });

  console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Cleanup complete:`, {
    queriesRemoved: queriesToRemove.length,
    imagesCleared: totalImagesCleared,
    queriesKept: generationQueries.length - queriesToRemove.length,
    maxCachedPages: config.maxCachedPages
  });
  
  // Log user-friendly cache summary for easy validation
  const remainingPages = [...new Set(queriesWithDistance
    .filter(item => item.distance <= keepRange)
    .map(item => item.page))]
    .sort((a: number, b: number) => a - b);
    
  const removedPages = [...new Set(queriesToRemove.map(q => q.page))].sort((a: number, b: number) => a - b);
    
  // Always log cache validation info (even when other logs are suppressed)
  const cacheLog = `🗂️ [CacheValidator] Current cache: pages [${remainingPages.join(', ')}] around page ${actualCurrentPage} (max: ${config.maxCachedPages})`;
  console.warn(cacheLog); // Use warn so it shows even with log suppression
  
  if (removedPages.length > 0) {
    const cleanupLog = `🧹 [CacheValidator] Cleaned up distant pages: [${removedPages.join(', ')}]`;
    console.warn(cleanupLog); // Use warn so it shows even with log suppression
  }

  // Record memory usage and adapt configuration
  performanceMonitor.recordMemoryUsage();
  performanceMonitor.adaptConfig();
  globalPreloadQueue.updateConcurrency(performanceMonitor.currentConfig.maxConcurrentPreloads);
};

// Centralized function to trigger garbage collection for images (browser-level cleanup)
export const triggerImageGarbageCollection = () => {
  // Force browser to evaluate memory pressure and potentially clean up unused images
  if ('gc' in window && typeof (window as any).gc === 'function') {
    // Only available in Chrome with --js-flags="--expose-gc"
    try {
      (window as any).gc();
      console.log('[ImageLoadingDebug][SmartCleanup] Manual garbage collection triggered');
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

// Smart preloading with device-aware limits
export const smartPreloadImages = (
  cachedData: any,
  priority: 'next' | 'prev',
  currentPrefetchId: string,
  prefetchOperationsRef: React.MutableRefObject<{
    currentPrefetchId: string;
    images: HTMLImageElement[];
  }>
) => {
  const preloadId = `smartpreload-${priority}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  
  console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Starting smart preload:`, {
    priority,
    currentPrefetchId,
    hasCachedData: !!cachedData?.items,
    totalItems: cachedData?.items?.length || 0
  });
  
  if (!cachedData?.items) {
    console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] No cached data available`);
    return;
  }
  
  const config = performanceMonitor.currentConfig;
  
  console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Performance config:`, {
    preloadStrategy: config.preloadStrategy,
    maxConcurrentPreloads: config.maxConcurrentPreloads,
    thumbnailOnlyPreload: config.thumbnailOnlyPreload
  });
  
  // Determine how many images to preload based on strategy
  const maxImages = (() => {
    switch (config.preloadStrategy) {
      case 'conservative': return Math.min(5, cachedData.items.length);
      case 'moderate': return Math.min(10, cachedData.items.length);
      case 'aggressive': return cachedData.items.length;
      default: return 0;
    }
  })();
  
  console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Strategy calculation:`, {
    strategy: config.preloadStrategy,
    availableItems: cachedData.items.length,
    maxImages,
    willProceed: maxImages > 0
  });
  
  if (maxImages === 0) {
    console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] No images to preload (maxImages = 0)`);
    return;
  }
  
  const imagesToPreload = cachedData.items.slice(0, maxImages);
  const priorityScore = priority === 'next' ? 100 : 50;
  
  console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Preload batch prepared:`, {
    imagesToPreload: imagesToPreload.length,
    priorityScore,
    imageIds: imagesToPreload.slice(0, 3).map((img: any) => img.id) // Show first 3 IDs
  });
  
  let queuedCount = 0;
  let skippedCount = 0;
  let alreadyCachedCount = 0;
  
  imagesToPreload.forEach((img: any, idx: number) => {
    // Skip if this prefetch is no longer current
    if (prefetchOperationsRef.current.currentPrefetchId !== currentPrefetchId) {
      console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Skipping image ${idx} - prefetch ID changed`);
      skippedCount++;
      return;
    }
    
    // Check if already cached
    const isCached = isImageCached(img);
    if (isCached) {
      console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Image ${idx} already cached:`, img.id);
      alreadyCachedCount++;
      return;
    }
    
    const imageUrl = config.thumbnailOnlyPreload ? 
      getDisplayUrl(img.thumbUrl || img.url) : 
      getDisplayUrl(img.url);
    
    const itemPriority = priorityScore - idx; // Earlier images have higher priority
    
    console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Queueing image ${idx}:`, {
      imageId: img.id,
      itemPriority,
      url: imageUrl.substring(0, 80) + '...',
      thumbnailOnly: config.thumbnailOnlyPreload
    });
    
    globalPreloadQueue.add(
      imageUrl,
      itemPriority,
      () => {
        // Success callback
        console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Successfully preloaded image:`, img.id);
        setImageCacheStatus(img, true);
      },
      () => {
        // Error callback - just log, don't retry
        console.warn(`[ImageLoadingDebug][SmartPreload:${preloadId}] Failed to preload image:`, {
          imageId: img.id,
          url: imageUrl
        });
      }
    );
    queuedCount++;
  });
  
  console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Preload batch summary:`, {
    totalImages: imagesToPreload.length,
    queuedCount,
    alreadyCachedCount,
    skippedCount,
    queueSize: globalPreloadQueue.size()
  });
};

interface PreloadOperation {
  images: HTMLImageElement[];
  timeouts: NodeJS.Timeout[];
  currentPageId: string;
}

// Client-side preloading with smart limits
export const preloadClientSidePages = (
  prevPageImages: any[],
  nextPageImages: any[],
  pageId: string,
  operations: PreloadOperation
) => {
  const config = performanceMonitor.currentConfig;
  
  // Helper to preload images with smart prioritization and device-aware limits
  const preloadImagesWithPriority = (
    images: any[],
    priority: 'next' | 'prev'
  ) => {
    const maxImages = (() => {
      switch (config.preloadStrategy) {
        case 'conservative': return Math.min(3, images.length);
        case 'moderate': return Math.min(6, images.length);
        case 'aggressive': return Math.min(10, images.length);
        default: return 0;
      }
    })();
    
    if (maxImages === 0) return;
    
    const imagesToPreload = images.slice(0, maxImages);
    const priorityScore = priority === 'next' ? 80 : 40;
    
    imagesToPreload.forEach((image, idx) => {
      // Check if this preload is still valid
      if (operations.currentPageId !== pageId) return;
      
      const imageUrl = config.thumbnailOnlyPreload ? 
        getDisplayUrl(image.thumbUrl || image.url) : 
        getDisplayUrl(image.url);
      
      const itemPriority = priorityScore - idx;
      
      globalPreloadQueue.add(
        imageUrl,
        itemPriority,
        () => {
          // Success callback
          setImageCacheStatus(image, true);
        },
        () => {
          // Error callback
          console.warn(`[ImageLoadingDebug][SmartPreload] Failed to preload client-side image:`, imageUrl);
        }
      );
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
};

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
    
    // Clear global preload queue
    globalPreloadQueue.clear();
    
    // Reset tracking
    preloadOperationsRef.current = {
      images: [],
      timeouts: [],
      currentPageId: '',
    };
  }, []);

  // Main preloading effect with smart configuration
  useEffect(() => {
    if (!enabled) {
      console.log('[AdjacentPreload] Disabled - skipping preload effect');
      return;
    }
    
    // Generate unique session ID for this preload session
    const preloadSessionId = `preload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Starting preload session:`, {
      page: isServerPagination ? serverPage : page,
      isServerPagination,
      totalFilteredItems,
      itemsPerPage,
      timestamp: new Date().toISOString()
    });
    
    // Cancel any existing preloads immediately
    cancelAllPreloads();
    
    // Update global queue concurrency based on current config
    const config = performanceMonitor.currentConfig;
    globalPreloadQueue.updateConcurrency(config.maxConcurrentPreloads);
    
    console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Device configuration:`, {
      strategy: config.preloadStrategy,
      maxCachedPages: config.maxCachedPages,
      maxConcurrentPreloads: config.maxConcurrentPreloads,
      thumbnailOnlyPreload: config.thumbnailOnlyPreload,
      debounceTime: config.debounceTime
    });
    
    // Smart debounce based on strategy
    const debounceTime = config.debounceTime;
    
    // Debounce preloading to avoid excessive operations on rapid page changes
    console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Starting debounced preload timer (${debounceTime}ms)`);
    const preloadTimer = setTimeout(() => {
      console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Debounce timer fired - calculating adjacent pages`);
      
      const totalPages = Math.max(1, Math.ceil(totalFilteredItems / itemsPerPage));
      const currentPageForPreload = isServerPagination ? (serverPage! - 1) : page;
      
      // Calculate adjacent pages based on strategy
      const shouldPreloadPrev = config.preloadStrategy !== 'disabled' && currentPageForPreload > 0;
      const shouldPreloadNext = config.preloadStrategy !== 'disabled' && currentPageForPreload < totalPages - 1;
      
      const prevPage = shouldPreloadPrev ? currentPageForPreload - 1 : null;
      const nextPage = shouldPreloadNext ? currentPageForPreload + 1 : null;
      
      console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Page calculation:`, {
        currentPageForPreload,
        totalPages,
        prevPage,
        nextPage,
        shouldPreloadPrev,
        shouldPreloadNext
      });
      
      // Create unique page ID for this preload session
      const pageId = `${currentPageForPreload}-${Date.now()}`;
      preloadOperationsRef.current.currentPageId = pageId;
      
      if (isServerPagination) {
        // For server-side pagination, call the callback to prefetch data
        if (onPrefetchAdjacentPages && (shouldPreloadPrev || shouldPreloadNext)) {
          const serverPrevPage = prevPage !== null ? prevPage + 1 : null; // Convert back to 1-based
          const serverNextPage = nextPage !== null ? nextPage + 1 : null;
          
          console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Server pagination - calling onPrefetchAdjacentPages:`, {
            serverPrevPage,
            serverNextPage
          });
          
          onPrefetchAdjacentPages(serverPrevPage, serverNextPage);
        } else {
          console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Server pagination - no adjacent pages to preload`);
        }
      } else {
        // For client-side pagination, preload adjacent page images directly
        if (allImages.length > 0 && (shouldPreloadPrev || shouldPreloadNext)) {
          const startIndex = currentPageForPreload * itemsPerPage;
          
          // Get images for adjacent pages
          const prevPageImages = prevPage !== null 
            ? allImages.slice(prevPage * itemsPerPage, startIndex)
            : [];
          const nextPageImages = nextPage !== null
            ? allImages.slice((currentPageForPreload + 1) * itemsPerPage, (currentPageForPreload + 2) * itemsPerPage)
            : [];
          
          console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Client pagination - preloading adjacent images:`, {
            prevPageImagesCount: prevPageImages.length,
            nextPageImagesCount: nextPageImages.length,
            allImagesTotal: allImages.length,
            pageId
          });
          
          preloadClientSidePages(prevPageImages, nextPageImages, pageId, preloadOperationsRef.current);
        } else {
          console.log(`[ImageLoadingDebug][AdjacentPreload:${preloadSessionId}] Client pagination - no images to preload:`, {
            allImagesLength: allImages.length,
            shouldPreloadPrev,
            shouldPreloadNext
          });
        }
      }
    }, debounceTime);
    
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

// Diagnostic function for debugging and monitoring
export const getPreloadDiagnostics = () => {
  const config = performanceMonitor.currentConfig;
  const avgPreloadTime = performanceMonitor.preloadTimes.length > 0 
    ? performanceMonitor.preloadTimes.reduce((a, b) => a + b, 0) / performanceMonitor.preloadTimes.length 
    : 0;
  
  return {
    config,
    performance: {
      averagePreloadTime: avgPreloadTime,
      preloadSamples: performanceMonitor.preloadTimes.length,
      memorySamples: performanceMonitor.memoryUsage.length
    },
    device: {
      isMobile: window.innerWidth <= 768,
      memory: 'deviceMemory' in navigator ? (navigator as any).deviceMemory : 'unknown',
      cores: 'hardwareConcurrency' in navigator ? navigator.hardwareConcurrency : 'unknown',
      connection: 'connection' in navigator ? (navigator as any).connection?.effectiveType : 'unknown'
    }
  };
}; 