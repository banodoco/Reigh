import { useEffect, useRef, useCallback } from 'react';
import { getDisplayUrl } from '@/shared/lib/utils';
import { 
  isImageCached, 
  setImageCacheStatus, 
  clearCacheForImages,
  keepOnlyInCache,
  performMemoryAwareCleanup,
  clearCacheForProjectSwitch
} from '@/shared/lib/imageCacheManager';
import { performanceMonitoredTimeout } from '@/shared/lib/performanceUtils';

interface UseAdjacentPagePreloadingProps {
  enabled?: boolean;
  isServerPagination?: boolean;
  page: number;
  serverPage?: number;
  totalFilteredItems: number;
  itemsPerPage: number;
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  allImages?: any[]; // For client-side pagination
  projectId?: string | null; // For project-aware cache clearing
  isLightboxOpen?: boolean; // Pause preloading when lightbox is open
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
      debounceTime: 1000 // Increased from 800ms to reduce setTimeout violations
    };
  } else if (isMobile || hasLowMemory || hasLowEndCPU) {
    return {
      maxCachedPages: 5, // Current + 2 adjacent pages each side
      preloadStrategy: 'moderate', 
      maxConcurrentPreloads: 1, // Reduced from 2 to be safer on mobile
      thumbnailOnlyPreload: true,
      debounceTime: 800 // Increased from 600ms to reduce setTimeout violations
    };
  } else {
    return {
      maxCachedPages: 5, // Current + 2 adjacent pages each side
      preloadStrategy: 'moderate', // Default to moderate instead of aggressive
      maxConcurrentPreloads: 2, // Reduced from 3 to prevent overwhelming the queue
      thumbnailOnlyPreload: false,
      debounceTime: 600 // Increased from 400ms to reduce setTimeout violations
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
    abortController: AbortController;
  }> = [];
  private active = 0;
  private maxConcurrent: number;
  private activeRequests = new Set<AbortController>();

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  add(url: string, priority: number, onLoad: () => void, onError: () => void) {
    const abortController = new AbortController();
    this.queue.push({ url, priority, onLoad, onError, abortController });
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
    this.processQueue();
  }

  private processQueue() {
    // Time-slice queue processing to prevent blocking - process max 3 items per call
    let processed = 0;
    const MAX_ITEMS_PER_BATCH = 3;
    
    while (this.active < this.maxConcurrent && this.queue.length > 0 && processed < MAX_ITEMS_PER_BATCH) {
      const item = this.queue.shift()!;
      this.active++;
      this.activeRequests.add(item.abortController);
      processed++;
      
      // Check if this is a video file - handle differently
      const isVideo = item.url.match(/\.(mp4|webm|mov|avi)$/i);
      
      if (isVideo) {
        // For videos, preload first frame as image to check availability
        const frameUrl = item.url.replace(/\.(mp4|webm|mov|avi)$/i, '_frame.jpg');
        this.preloadImageWithFetch(frameUrl, item)
          .then(() => {
            performanceMonitor.recordPreloadTime(1); // Minimal time for videos
            item.onLoad();
          })
          .catch(() => {
            // Fallback: just mark as loaded without actual preloading
            performanceMonitor.recordPreloadTime(1);
            item.onLoad();
          })
          .finally(() => {
            this.active--;
            this.activeRequests.delete(item.abortController);
            
            // Use setTimeout(0) to yield control before processing more
            performanceMonitoredTimeout(() => this.processQueue(), 0, 'PreloadQueue video processing');
          });
      } else {
        this.preloadImageWithFetch(item.url, item)
          .then(() => {
            item.onLoad();
          })
          .catch(() => {
            item.onError();
          })
          .finally(() => {
            this.active--;
            this.activeRequests.delete(item.abortController);
            
            // Use setTimeout(0) to yield control before processing more
            performanceMonitoredTimeout(() => this.processQueue(), 0, 'PreloadQueue image processing');
          });
      }
    }
    
    // If we have more items but hit the batch limit, schedule next batch
    if (this.queue.length > 0 && this.active < this.maxConcurrent && processed >= MAX_ITEMS_PER_BATCH) {
      performanceMonitoredTimeout(() => this.processQueue(), 0, 'PreloadQueue batch continuation');
    }
  }

  private async preloadImageWithFetch(url: string, item: { abortController: AbortController }) {
    const startTime = Date.now();
    
    try {
      // Use fetch with abort controller for better cancellation support
      const response = await fetch(url, { 
        signal: item.abortController.signal,
        mode: 'cors',
        cache: 'force-cache' // Use browser cache if available
      });
      
      if (!response.ok) {
        // Handle missing storage files gracefully - don't spam console with 400/404 errors
        if (response.status === 400 || response.status === 404) {
          console.warn(`[AdjacentPagePreloading][StorageMissingFile] Missing storage file (${response.status}): ${url.split('/').pop()}`);
          return; // Fail silently for missing files
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      // For images, also preload into Image() for immediate display
      if (!url.includes('_frame.jpg')) {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = url;
          
          // Abort if controller is aborted
          item.abortController.signal.addEventListener('abort', () => {
            img.onload = null;
            img.onerror = null;
            reject(new Error('Aborted'));
          });
        });
      }
      
      performanceMonitor.recordPreloadTime(Date.now() - startTime);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Silently ignore aborted requests
        return;
      }
      
      // Handle common storage errors gracefully
      if (error instanceof Error) {
        if (error.message.includes('400') || error.message.includes('404')) {
          console.warn(`[AdjacentPagePreloading][StorageMissingFile] Storage file not accessible: ${url.split('/').pop()} - ${error.message}`);
          return; // Don't throw for missing storage files
        }
        if (error.message.includes('Image load failed')) {
          console.warn(`[AdjacentPagePreloading][StorageMissingFile] Image failed to load: ${url.split('/').pop()}`);
          return; // Don't throw for failed image loads
        }
      }
      
      throw error;
    }
  }

  clear() {
    // Cancel all active requests
    this.activeRequests.forEach(controller => controller.abort());
    this.activeRequests.clear();
    this.queue.forEach(item => item.abortController.abort());
    this.queue = [];
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

// Smart cleanup that adapts to device capabilities with time-slicing to prevent UI blocking
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
  
  // Time-slice the query filtering to prevent blocking the main thread
  const generationQueries: any[] = [];
  let queryIndex = 0;
  
  const processQueriesBatch = () => {
    const startTime = performance.now();
    const BATCH_SIZE = 10; // Process 10 queries at a time
    const MAX_BATCH_TIME = 8; // Max 8ms per batch to stay under 16ms frame budget
    
    while (queryIndex < allQueries.length && (performance.now() - startTime) < MAX_BATCH_TIME) {
      const query = allQueries[queryIndex];
      const queryKey = query.queryKey;
      if (queryKey?.[0] === baseQueryKey && 
          queryKey?.[1] === projectId && 
          typeof queryKey?.[2] === 'number') {
        generationQueries.push(query);
      }
      queryIndex++;
    }
    
    if (queryIndex < allQueries.length) {
      // More queries to process, yield control and continue
      performanceMonitoredTimeout(processQueriesBatch, 0, 'SmartCleanup query processing');
      return;
    }
    
    // All queries processed, continue with cleanup
    continueCleanup();
  };
  
  const continueCleanup = () => {
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

    // Time-slice the cache clearing operation to prevent UI blocking
    const performCacheClearing = () => {
      let removedCount = 0;
      let totalImagesCleared = 0;
      let currentIndex = 0;
      
      const clearBatch = () => {
        const startTime = performance.now();
        const MAX_BATCH_TIME = 8; // Max 8ms per batch
        
        while (currentIndex < queriesToRemove.length && (performance.now() - startTime) < MAX_BATCH_TIME) {
          const { query, page } = queriesToRemove[currentIndex];
          const queryData = query.state?.data;
          
          if (queryData?.items) {
            const imageCount = queryData.items.length;
            totalImagesCleared += imageCount;
            
            console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Clearing image cache flags for page ${page} (${imageCount} images)`);
            
            // Clear cache using centralized manager (this should be fast)
            clearCacheForImages(queryData.items);
          }
          
          // Remove query from cache
          console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Removing query cache for page ${page}:`, query.queryKey);
          queryClient.removeQueries({ queryKey: query.queryKey });
          
          removedCount++;
          currentIndex++;
        }
        
        if (currentIndex < queriesToRemove.length) {
          // More items to process, yield control
          performanceMonitoredTimeout(clearBatch, 0, 'SmartCleanup cache clearing');
          return;
        }
        
        // All items processed, complete cleanup
        finishCleanup(cleanupId, removedCount, totalImagesCleared, queriesWithDistance, keepRange, actualCurrentPage, config);
      };
      
      clearBatch();
    };
    
    if (queriesToRemove.length > 0) {
      performCacheClearing();
    } else {
      finishCleanup(cleanupId, 0, 0, queriesWithDistance, keepRange, actualCurrentPage, config);
    }
  };
  
  const finishCleanup = (
    cleanupId: string, 
    removedCount: number, 
    totalImagesCleared: number, 
    queriesWithDistance: any[], 
    keepRange: number, 
    actualCurrentPage: number, 
    config: any
  ) => {
    console.log(`[ImageLoadingDebug][CacheCleanup:${cleanupId}] Cleanup complete:`, {
      queriesRemoved: removedCount,
      imagesCleared: totalImagesCleared,
      queriesKept: generationQueries.length - removedCount,
      maxCachedPages: config.maxCachedPages
    });
    
    // Log user-friendly cache summary for easy validation
    const remainingPages = [...new Set(queriesWithDistance
      .filter(item => item.distance <= keepRange)
      .map(item => item.page))]
      .sort((a: number, b: number) => a - b);
      
    const removedPages = [...new Set(queriesWithDistance
      .filter(item => item.distance > keepRange)
      .map(item => item.page))]
      .sort((a: number, b: number) => a - b);
      
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
    
    // Perform memory-aware cache cleanup to prevent unlimited growth
    performMemoryAwareCleanup(300); // Keep max 300 cached images
  };
  
  // Start the time-sliced query processing
  processQueriesBatch();
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
    performanceMonitoredTimeout(() => {
      const temp = new Array(1000).fill(null);
      temp.length = 0;
    }, 100, 'Memory pressure technique');
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
  
  console.log(`🚀 [PAGELOADINGDEBUG] [PRELOAD:${preloadId}] ${priority} page: ${cachedData?.items?.length || 0} images`);
  
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
  
  // Progressive top-to-bottom preloading with delays
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
    
    // Progressive delay: first 3 images immediate, then 60ms delays for adjacent page preloading
    // Use slightly slower timing than current page (25ms) to avoid resource conflicts
    const progressiveDelay = idx < 3 ? 0 : (idx - 2) * 60;
    
    console.log(`[ImageLoadingDebug][SmartPreload:${preloadId}] Scheduling image ${idx} with ${progressiveDelay}ms delay:`, {
      imageId: img.id,
      url: imageUrl.substring(0, 80) + '...',
      thumbnailOnly: config.thumbnailOnlyPreload
    });
    
    // Use requestIdleCallback for non-critical preloads (idx >= 3), setTimeout for critical ones
    const schedulePreload = () => {
      const timeoutStartTime = performance.now();
      
      // Check if prefetch is still current before proceeding
      if (prefetchOperationsRef.current.currentPrefetchId !== currentPrefetchId) {
        return;
      }
      
      const itemPriority = priorityScore - idx; // Earlier images have higher priority
      
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
      
      // Monitor execution time
      const timeoutDuration = performance.now() - timeoutStartTime;
      if (timeoutDuration > 16) {
        console.warn(`[PerformanceMonitor] preload execution took ${timeoutDuration.toFixed(1)}ms (target: <16ms)`);
      }
    };

    if (idx < 3) {
      // Critical images - use setTimeout for immediate scheduling
      performanceMonitoredTimeout(schedulePreload, progressiveDelay, 'SmartPreloadImages critical loading');
    } else {
      // Non-critical images - use requestIdleCallback when browser is idle
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(schedulePreload, { timeout: 5000 }); // 5s timeout fallback
      } else {
        // Fallback for browsers without requestIdleCallback
        performanceMonitoredTimeout(schedulePreload, progressiveDelay + 100, 'SmartPreloadImages fallback loading');
      }
    }
    
    queuedCount++;
  });
  
  console.log(`📊 [PAGELOADINGDEBUG] [PRELOAD:${preloadId}] Complete: ${queuedCount} queued, ${alreadyCachedCount} cached, ${skippedCount} skipped`);
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
      
      // Progressive delay for client-side preloading too: first 3 immediate, then 60ms delays
      // Use slightly slower timing than current page (25ms) to avoid resource conflicts
      const progressiveDelay = idx < 3 ? 0 : (idx - 2) * 60;
      
      performanceMonitoredTimeout(() => {
        const timeoutStartTime = performance.now();
        
        // Double-check validity after delay
        if (operations.currentPageId !== pageId) return;
        
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
        
        // Monitor setTimeout execution time
        const timeoutDuration = performance.now() - timeoutStartTime;
        if (timeoutDuration > 16) {
          console.warn(`[PerformanceMonitor] setTimeout in preloadClientSidePages took ${timeoutDuration.toFixed(1)}ms (target: <16ms)`);
        }
      }, progressiveDelay, 'PreloadClientSidePages image loading');
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
  projectId = null,
  isLightboxOpen = false,
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
    if (!enabled || isLightboxOpen) {
      console.log('[AdjacentPreload] Disabled or lightbox open - skipping preload effect', {
        enabled,
        isLightboxOpen
      });
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
    const preloadTimer = performanceMonitoredTimeout(() => {
      const timeoutStartTime = performance.now();
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
      
      // Monitor setTimeout execution time
      const timeoutDuration = performance.now() - timeoutStartTime;
      if (timeoutDuration > 16) {
        console.warn(`[PerformanceMonitor] Main preload setTimeout took ${timeoutDuration.toFixed(1)}ms (target: <16ms)`);
      }
    }, debounceTime, 'AdjacentPagePreloading main preload');
    
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
    isLightboxOpen,
  ]);

  // Clear cache on project change
  useEffect(() => {
    if (projectId) {
      console.log(`[AdjacentPagePreloading] Project changed to ${projectId}, clearing image cache`);
      clearCacheForProjectSwitch('project switch in adjacent page preloading');
      
      // Also clear the global preload queue to start fresh
      globalPreloadQueue.clear();
    }
  }, [projectId]);

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