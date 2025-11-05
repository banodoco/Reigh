/**
 * Centralized Image Cache Manager
 * 
 * Single source of truth for all image caching operations.
 * Replaces the scattered cache management across multiple files.
 */

// Global cache map to store cache status by image ID
const globalImageCache = new Map<string, boolean>();

// URL-based cache for progressive loading (stores by actual image URL)
const urlCache = new Map<string, { loadedAt: number; width?: number; height?: number }>();

// Debug logging configuration
const CACHE_DEBUG_LOG_RATE = 0.05; // 5% of cache checks will be logged

export interface CacheStats {
  totalCached: number;
  totalChecked: number;
  hitRate: number;
  memoryEstimate: number;
}

/**
 * Mark an image as cached or uncached
 */
export const setImageCacheStatus = (image: any, isCached: boolean = true): void => {
  const imageId = image.id;
  if (!imageId) {
    console.warn('[ImageCacheManager] Cannot cache image without ID:', image);
    return;
  }

  const prevState = globalImageCache.get(imageId);
  
  // Update global cache (primary storage)
  globalImageCache.set(imageId, isCached);
  
  // Update object cache for backwards compatibility (will be phased out)
  (image as any).__memoryCached = isCached;
  
  // Only log when state changes to reduce noise
  if (prevState !== isCached) {
    .toISOString()
    });
  }
};

/**
 * Check if an image is cached (legacy function - use the enhanced version below)
 */
const isImageCachedLegacy = (image: any): boolean => {
  const imageId = image.id;
  if (!imageId) {
    return false;
  }
  
  // Primary source: global cache
  const isCached = globalImageCache.get(imageId) === true;
  
  // Sync object cache if needed (backwards compatibility)
  if (isCached && (image as any).__memoryCached !== true) {
    (image as any).__memoryCached = true;
  }
  
  // Occasional debug logging (reduced noise)
  if (Math.random() < CACHE_DEBUG_LOG_RATE) {
    }
  
  return isCached;
};

/**
 * Batch check if multiple images are cached - more efficient than individual calls
 */
export const areImagesCached = (images: any[]): boolean[] => {
  return images.map(image => isImageCachedLegacy(image));
};

/**
 * Batch set cache status for multiple images - more efficient than individual calls
 */
export const setMultipleImageCacheStatus = (images: Array<{ image: any; isCached: boolean }>): void => {
  let changedCount = 0;
  
  images.forEach(({ image, isCached }) => {
    const imageId = image?.id;
    if (!imageId) return;
    
    const prevState = globalImageCache.get(imageId);
    
    // Update global cache (primary storage)
    globalImageCache.set(imageId, isCached);
    
    // Update object cache for backwards compatibility
    (image as any).__memoryCached = isCached;
    
    if (prevState !== isCached) {
      changedCount++;
    }
  });
  
  if (changedCount > 0) {
    .toISOString()
    });
  }
};

/**
 * Remove images from cache (for cleanup)
 */
export const removeCachedImages = (imageIds: string[]): number => {
  let removedCount = 0;
  
  imageIds.forEach(imageId => {
    if (globalImageCache.has(imageId)) {
      globalImageCache.delete(imageId);
      removedCount++;
    }
  });
  
  if (removedCount > 0) {
    }
  
  return removedCount;
};

/**
 * Clear images from cache by page/query data
 */
export const clearCacheForImages = (images: any[]): number => {
  const imageIds = images
    .map(img => img.id)
    .filter(id => id); // Only valid IDs
    
  return removeCachedImages(imageIds);
};

/**
 * Get cache statistics
 */
export const getCacheStats = (): CacheStats => {
  const totalCached = globalImageCache.size;
  
  // Rough memory estimate: assume each cached image reference takes ~100 bytes
  const memoryEstimate = totalCached * 100;
  
  return {
    totalCached,
    totalChecked: 0, // Could be tracked if needed
    hitRate: 0, // Could be calculated if tracking hits/misses
    memoryEstimate
  };
};

/**
 * Clear entire cache (for testing or memory pressure)
 */
export const clearAllCache = (): void => {
  const prevSize = globalImageCache.size;
  globalImageCache.clear();
  
  };

/**
 * Clear cache for project switch - removes all cached images to ensure fresh content
 */
export const clearCacheForProjectSwitch = (reason: string = 'project switch'): number => {
  const prevSize = globalImageCache.size;
  globalImageCache.clear();
  
  return prevSize;
};

/**
 * Memory-aware cache cleanup - removes oldest entries when cache gets too large
 */
export const performMemoryAwareCleanup = (maxEntries: number = 1000): number => {
  if (globalImageCache.size <= maxEntries) {
    return 0; // No cleanup needed
  }
  
  const entriesToRemove = globalImageCache.size - maxEntries;
  const entries = Array.from(globalImageCache.keys());
  
  // Remove oldest entries (Map maintains insertion order)
  let removedCount = 0;
  for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
    globalImageCache.delete(entries[i]);
    removedCount++;
  }
  
  if (removedCount > 0) {
    }
  
  return removedCount;
};

/**
 * Advanced: Keep only specific images in cache, remove all others
 */
export const keepOnlyInCache = (imagesToKeep: any[]): number => {
  const idsToKeep = new Set(
    imagesToKeep
      .map(img => img.id)
      .filter(id => id)
  );
  
  let removedCount = 0;
  const toRemove: string[] = [];
  
  // Find entries to remove
  globalImageCache.forEach((_, imageId) => {
    if (!idsToKeep.has(imageId)) {
      toRemove.push(imageId);
    }
  });
  
  // Remove them
  toRemove.forEach(imageId => {
    globalImageCache.delete(imageId);
    removedCount++;
  });
  
  if (removedCount > 0) {
    }
  
  return removedCount;
};

/**
 * URL-based cache functions for progressive loading
 */

/**
 * Check if a URL is cached
 */
export const isImageCached = (urlOrImage: string | any): boolean => {
  // Handle both URL strings and image objects
  if (typeof urlOrImage === 'string') {
    return urlCache.has(urlOrImage);
  }
  
  // Legacy image object handling
  const imageId = urlOrImage?.id;
  if (!imageId) {
    return false;
  }
  
  // Primary source: global cache
  const isCached = globalImageCache.get(imageId) === true;
  
  // Sync object cache if needed (backwards compatibility)
  if (isCached && (urlOrImage as any).__memoryCached !== true) {
    (urlOrImage as any).__memoryCached = true;
  }
  
  // Occasional debug logging (reduced noise)
  if (Math.random() < CACHE_DEBUG_LOG_RATE) {
    }
  
  return isCached;
};

/**
 * Mark a URL as cached
 */
export const markImageAsCached = (urlOrImage: string | any, metadata?: { width?: number; height?: number }): void => {
  // Handle both URL strings and image objects
  if (typeof urlOrImage === 'string') {
    urlCache.set(urlOrImage, {
      loadedAt: Date.now(),
      ...metadata
    });
    return;
  }
  
  // Legacy image object handling
  setImageCacheStatus(urlOrImage, true);
};

/**
 * Get URL cache metadata
 */
export const getUrlCacheMetadata = (url: string): { loadedAt: number; width?: number; height?: number } | null => {
  return urlCache.get(url) || null;
};

/**
 * Clear URL cache
 */
export const clearUrlCache = (): number => {
  const prevSize = urlCache.size;
  urlCache.clear();
  return prevSize;
};

/**
 * Remove old URL cache entries (older than maxAge milliseconds)
 */
export const cleanupUrlCache = (maxAge: number = 30 * 60 * 1000): number => {
  const now = Date.now();
  let removedCount = 0;
  
  urlCache.forEach((metadata, url) => {
    if (now - metadata.loadedAt > maxAge) {
      urlCache.delete(url);
      removedCount++;
    }
  });
  
  if (removedCount > 0) {
    }
  
  return removedCount;
};

// Legacy exports for backwards compatibility - removed duplicate export
