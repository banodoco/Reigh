/**
 * ImagePreloadManager
 *
 * Dedicated component for handling adjacent page preloading and cache cleanup.
 * Renders nothing - just manages preloading logic.
 */

import React from 'react';
import { useImagePreloading } from '@/shared/hooks/useImagePreloading';
import { useCacheCleanup } from '@/shared/hooks/useCacheCleanup';

interface ImagePreloadManagerProps {
  /** Whether preloading is enabled */
  enabled?: boolean;
  /** Whether using server-side pagination */
  isServerPagination?: boolean;
  /** Current page (0-indexed for client pagination) */
  page: number;
  /** Server page number (1-indexed) */
  serverPage?: number;
  /** Total items (for server pagination) */
  totalFilteredItems: number;
  /** Items per page */
  itemsPerPage: number;
  /** Callback to prefetch adjacent pages (for server pagination) */
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  /** All images (for client pagination) */
  allImages?: any[];
  /** Project ID (for cache cleanup) */
  projectId?: string | null;
  /** Pause preloading when lightbox is open */
  isLightboxOpen?: boolean;
}

/**
 * Manages adjacent page preloading and cache cleanup.
 * Doesn't render anything visible.
 */
export const ImagePreloadManager: React.FC<ImagePreloadManagerProps> = ({
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
}) => {
  // Preload adjacent pages
  useImagePreloading({
    images: allImages,
    currentPage: page,
    itemsPerPage,
    enabled,
    paused: isLightboxOpen,
    onPrefetchServerPages: onPrefetchAdjacentPages,
    isServerPagination,
    serverPage,
    totalItems: totalFilteredItems,
  });

  // Cleanup distant pages from cache
  useCacheCleanup({
    projectId,
    currentPage: isServerPagination ? (serverPage ?? 1) - 1 : page,
    maxCachedPages: 5,
    enabled,
  });

  return null;
};
