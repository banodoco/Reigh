/**
 * Centralized Image Cache Manager
 * 
 * Single source of truth for all image caching operations.
 * Replaces the scattered cache management across multiple files.
 */

// Global cache map to store cache status by image ID
const globalImageCache = new Map<string, boolean>();

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
    console.log(`[ImageCacheManager] Cache status changed:`, {
      imageId,
      from: prevState ?? 'unknown',
      to: isCached,
      cacheSize: globalImageCache.size,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Check if an image is cached
 */
export const isImageCached = (image: any): boolean => {
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
    console.log(`[ImageCacheManager] Cache check:`, {
      imageId,
      isCached,
      cacheSize: globalImageCache.size
    });
  }
  
  return isCached;
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
    console.log(`[ImageCacheManager] Removed ${removedCount} images from cache, new size: ${globalImageCache.size}`);
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
  
  console.log(`[ImageCacheManager] Cleared entire cache, removed ${prevSize} entries`);
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
    console.log(`[ImageCacheManager] Cleanup: kept ${idsToKeep.size}, removed ${removedCount}, new cache size: ${globalImageCache.size}`);
  }
  
  return removedCount;
};

// Legacy exports for backwards compatibility
export const markImageAsCached = setImageCacheStatus;
