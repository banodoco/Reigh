/**
 * @deprecated This file is deprecated. Use the new preloading system instead:
 * - `useImagePreloading` hook for React components
 * - `@/shared/lib/imagePreloading` for utilities
 *
 * This file is kept for backwards compatibility with pages that use the old API.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getDisplayUrl } from '@/shared/lib/utils';
import {
  isImageCached,
  setImageCacheStatus,
  clearCacheForImages,
  clearCacheForProjectSwitch,
} from '@/shared/lib/imageCacheManager';
import {
  PreloadQueue,
  getPreloadConfig,
  preloadImages,
  PreloadableImage,
} from '@/shared/lib/imagePreloading';

// Re-export for backwards compatibility
export { setImageCacheStatus as markImageAsCached };

// Global queue for legacy functions
let legacyQueue: PreloadQueue | null = null;
function getLegacyQueue(): PreloadQueue {
  if (!legacyQueue) {
    const config = getPreloadConfig();
    legacyQueue = new PreloadQueue(config.maxConcurrent);
  }
  return legacyQueue;
}

/**
 * @deprecated Use the new preloading system
 */
export const initializePrefetchOperations = (
  prefetchOperationsRef: React.MutableRefObject<{
    currentPrefetchId: string;
    images: HTMLImageElement[];
  }>,
  prefetchId: string
) => {
  prefetchOperationsRef.current = { images: [], currentPrefetchId: prefetchId };
};

/**
 * @deprecated Use useCacheCleanup hook instead
 */
export const smartCleanupOldPages = (
  queryClient: any,
  currentPage: number,
  projectId: string,
  baseQueryKey: string = 'generations'
) => {
  const keepRange = 2; // Keep ±2 pages
  const allQueries = queryClient.getQueryCache().getAll();

  allQueries.forEach((query: any) => {
    const key = query.queryKey as any[];
    if (!Array.isArray(key)) return;

    let page: number | undefined;

    // Match ['generations', projectId, page]
    if (key[0] === 'generations' && key[1] === projectId) {
      page = key[2];
    }
    // Match ['unified-generations', 'project', projectId, page, ...]
    else if (key[0] === 'unified-generations' && key[1] === 'project' && key[2] === projectId) {
      page = key[3];
    }

    if (typeof page === 'number' && Math.abs(page - currentPage) > keepRange) {
      const data = query.state?.data;
      if (data?.items) {
        clearCacheForImages(data.items);
      }
      queryClient.removeQueries({ queryKey: query.queryKey });
    }
  });
};

/**
 * @deprecated This function does nothing useful. Remove calls to it.
 */
export const triggerImageGarbageCollection = () => {
  // No-op - browser handles GC automatically
};

/**
 * @deprecated Use preloadImages from @/shared/lib/imagePreloading instead
 */
export const smartPreloadImages = (
  cachedData: any,
  priority: 'next' | 'prev',
  currentPrefetchId: string,
  prefetchOperationsRef: React.MutableRefObject<{
    currentPrefetchId: string;
    images: HTMLImageElement[];
  }>
) => {
  if (!cachedData?.items) {
    return;
  }

  // Check if this prefetch is still current
  if (prefetchOperationsRef.current.currentPrefetchId !== currentPrefetchId) {
    return;
  }

  const queue = getLegacyQueue();
  const config = getPreloadConfig();
  const priorityScore = priority === 'next' ? 100 : 50;

  // Preload using the new system
  const images: PreloadableImage[] = cachedData.items;
  preloadImages(images, queue, config, priorityScore);
};

/**
 * @deprecated Use preloadImages from @/shared/lib/imagePreloading instead
 */
export const preloadClientSidePages = (
  prevPageImages: any[],
  nextPageImages: any[],
  pageId: string,
  operations: { currentPageId: string }
) => {
  if (operations.currentPageId !== pageId) return;

  const queue = getLegacyQueue();
  const config = getPreloadConfig();

  // Preload next page (higher priority)
  if (nextPageImages.length > 0) {
    preloadImages(nextPageImages, queue, config, 100);
  }

  // Preload previous page (lower priority)
  if (prevPageImages.length > 0) {
    preloadImages(prevPageImages, queue, config, 50);
  }
};

/**
 * @deprecated Use useImagePreloading hook instead
 */
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
}: {
  enabled?: boolean;
  isServerPagination?: boolean;
  page: number;
  serverPage?: number;
  totalFilteredItems: number;
  itemsPerPage: number;
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  allImages?: any[];
  projectId?: string | null;
  isLightboxOpen?: boolean;
}) => {
  const queueRef = useRef<PreloadQueue | null>(null);

  // Initialize queue once
  if (!queueRef.current) {
    const config = getPreloadConfig();
    queueRef.current = new PreloadQueue(config.maxConcurrent);
  }

  const cancelAllPreloads = useCallback(() => {
    queueRef.current?.clear();
  }, []);

  useEffect(() => {
    if (!enabled || isLightboxOpen) {
      return;
    }

    const queue = queueRef.current!;
    const config = getPreloadConfig();

    queue.clear();

    const timer = setTimeout(() => {
      const totalPages = Math.max(1, Math.ceil(totalFilteredItems / itemsPerPage));
      const currentPageForPreload = isServerPagination ? (serverPage! - 1) : page;

      const hasPrev = currentPageForPreload > 0;
      const hasNext = currentPageForPreload < totalPages - 1;

      if (isServerPagination && onPrefetchAdjacentPages) {
        const prevPage = hasPrev ? currentPageForPreload : null;
        const nextPage = hasNext ? currentPageForPreload + 2 : null;
        onPrefetchAdjacentPages(prevPage, nextPage);
      } else if (allImages.length > 0) {
        // Client-side pagination
        if (hasNext) {
          const start = (currentPageForPreload + 1) * itemsPerPage;
          const nextImages = allImages.slice(start, start + itemsPerPage);
          preloadImages(nextImages, queue, config, 100);
        }
        if (hasPrev) {
          const start = (currentPageForPreload - 1) * itemsPerPage;
          const prevImages = allImages.slice(start, start + itemsPerPage);
          preloadImages(prevImages, queue, config, 50);
        }
      }
    }, config.debounceMs);

    return () => {
      clearTimeout(timer);
      queue.clear();
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
    isLightboxOpen,
  ]);

  // Clear cache on project change
  useEffect(() => {
    if (projectId) {
      clearCacheForProjectSwitch('project switch');
      queueRef.current?.clear();
    }
  }, [projectId]);

  useEffect(() => {
    return () => {
      cancelAllPreloads();
    };
  }, [cancelAllPreloads]);

  return { cancelAllPreloads };
};

/**
 * @deprecated No longer needed
 */
export const getPreloadDiagnostics = () => ({
  config: getPreloadConfig(),
  performance: { averagePreloadTime: 0, preloadSamples: 0, memorySamples: 0 },
  device: {
    isMobile: typeof window !== 'undefined' && window.innerWidth <= 768,
    memory: 'unknown',
    cores: 'unknown',
    connection: 'unknown',
  },
});
