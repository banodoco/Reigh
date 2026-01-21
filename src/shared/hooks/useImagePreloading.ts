/**
 * useImagePreloading
 *
 * Preloads adjacent pages (prev + next) when the current page changes.
 * Debounced to avoid excessive preloading during rapid navigation.
 *
 * This is a clean replacement for the old useAdjacentPagePreloading hook.
 */

import { useEffect, useRef, useMemo } from 'react';
import {
  PreloadQueue,
  getPreloadConfig,
  preloadImages,
  getPageImages,
  PreloadableImage,
  PreloadConfig,
  PRIORITY_VALUES,
} from '@/shared/lib/imagePreloading';

export interface UseImagePreloadingProps {
  /** All images (for client-side pagination) */
  images: PreloadableImage[];
  /** Current page (0-indexed for client, or use serverPage for server pagination) */
  currentPage: number;
  /** Items per page */
  itemsPerPage: number;
  /** Whether preloading is enabled */
  enabled?: boolean;
  /** Pause preloading (e.g., when lightbox is open) */
  paused?: boolean;
  /** For server pagination: callback to prefetch data for adjacent pages */
  onPrefetchServerPages?: (prevPage: number | null, nextPage: number | null) => void;
  /** Whether using server-side pagination */
  isServerPagination?: boolean;
  /** Server page number (1-indexed) */
  serverPage?: number;
  /** Total items (for server pagination) */
  totalItems?: number;
}

/**
 * Preloads adjacent pages when the current page changes.
 */
export function useImagePreloading({
  images,
  currentPage,
  itemsPerPage,
  enabled = true,
  paused = false,
  onPrefetchServerPages,
  isServerPagination = false,
  serverPage,
  totalItems,
}: UseImagePreloadingProps): void {
  // Get config once on mount (device capabilities don't change)
  const configRef = useRef<PreloadConfig | null>(null);
  if (!configRef.current) {
    configRef.current = getPreloadConfig();
  }
  const config = configRef.current;

  // Create queue once per hook instance
  const queueRef = useRef<PreloadQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new PreloadQueue(config.maxConcurrent);
  }
  const queue = queueRef.current;

  // Calculate effective page and total pages
  const effectivePage = isServerPagination ? (serverPage ?? 1) - 1 : currentPage;
  const totalPages = useMemo(() => {
    if (isServerPagination && totalItems !== undefined) {
      return Math.ceil(totalItems / itemsPerPage);
    }
    return Math.ceil(images.length / itemsPerPage);
  }, [isServerPagination, totalItems, images.length, itemsPerPage]);

  // Main preloading effect
  useEffect(() => {
    // Skip if disabled or paused
    if (!enabled || paused) {
      return;
    }

    // Skip if no images and not server pagination
    if (!isServerPagination && images.length === 0) {
      return;
    }

    // Clear any pending preloads from previous page
    queue.clear();

    // Debounce: wait for user to settle on a page
    const timer = setTimeout(() => {
      const hasPrevPage = effectivePage > 0;
      const hasNextPage = effectivePage < totalPages - 1;

      if (isServerPagination && onPrefetchServerPages) {
        // Server pagination: call the prefetch callback
        // Note: The callback expects 1-indexed server page numbers
        // effectivePage is 0-indexed, so effectivePage happens to equal prev page (1-indexed)
        // and effectivePage + 2 equals next page (1-indexed)
        const prevPage = hasPrevPage ? effectivePage : null;
        const nextPage = hasNextPage ? effectivePage + 2 : null;

        onPrefetchServerPages(prevPage, nextPage);
      } else {
        // Client pagination: preload images directly
        // Preload next page (higher priority)
        if (hasNextPage) {
          const nextImages = getPageImages(images, effectivePage + 1, itemsPerPage);
          preloadImages(nextImages, queue, config, PRIORITY_VALUES.high);
        }

        // Preload previous page (lower priority)
        if (hasPrevPage) {
          const prevImages = getPageImages(images, effectivePage - 1, itemsPerPage);
          preloadImages(prevImages, queue, config, PRIORITY_VALUES.normal);
        }
      }
    }, config.debounceMs);

    return () => {
      clearTimeout(timer);
      queue.clear();
    };
  }, [
    enabled,
    paused,
    effectivePage,
    totalPages,
    itemsPerPage,
    images,
    isServerPagination,
    onPrefetchServerPages,
    queue,
    config,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      queue.clear();
    };
  }, [queue]);
}
