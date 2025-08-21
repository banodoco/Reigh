import { useCallback, useRef } from 'react';

/**
 * Cache for video counts per shot to enable instant skeleton count display
 * Uses a simple in-memory cache that persists across component remounts
 */
class VideoCountCache {
  private cache = new Map<string, number>();
  
  get(shotId: string): number | null {
    return this.cache.get(shotId) || null;
  }
  
  set(shotId: string, count: number): void {
    this.cache.set(shotId, count);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  delete(shotId: string): void {
    this.cache.delete(shotId);
  }
  
  // Get cache size for debugging
  size(): number {
    return this.cache.size;
  }
  
  // Get all cached shot IDs for debugging
  getCachedShotIds(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance that persists across component remounts
const globalVideoCountCache = new VideoCountCache();

/**
 * Hook to manage video count caching for shots
 * Provides instant access to cached video counts to show accurate skeletons
 */
export function useVideoCountCache() {
  const cacheRef = useRef(globalVideoCountCache);
  
  const getCachedCount = useCallback((shotId: string | null): number | null => {
    if (!shotId) return null;
    return cacheRef.current.get(shotId);
  }, []);
  
  const setCachedCount = useCallback((shotId: string | null, count: number): void => {
    if (!shotId) return;
    cacheRef.current.set(shotId, count);
    console.log('[VideoCountCache] Cached video count for shot:', {
      shotId,
      count,
      totalCachedShots: cacheRef.current.size(),
      timestamp: Date.now()
    });
  }, []);
  
  const clearCache = useCallback((): void => {
    cacheRef.current.clear();
    console.log('[VideoCountCache] Cleared all cached video counts');
  }, []);
  
  const deleteCachedCount = useCallback((shotId: string | null): void => {
    if (!shotId) return;
    cacheRef.current.delete(shotId);
    console.log('[VideoCountCache] Deleted cached count for shot:', {
      shotId,
      remainingCachedShots: cacheRef.current.size()
    });
  }, []);
  
  // Debug function to log cache state
  const logCacheState = useCallback((): void => {
    console.log('[VideoCountCache] Current cache state:', {
      size: cacheRef.current.size(),
      cachedShotIds: cacheRef.current.getCachedShotIds(),
      timestamp: Date.now()
    });
  }, []);
  
  return {
    getCachedCount,
    setCachedCount,
    clearCache,
    deleteCachedCount,
    logCacheState
  };
}
