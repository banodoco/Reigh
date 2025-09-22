// Utility to clear legacy timeline position cache and force React Query invalidation
// Run this once to clean up old localStorage entries

export const clearTimelineCache = () => {
  try {
    // Clear all localStorage entries that start with 'timelineFramePositions_'
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('timelineFramePositions_')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`[CacheCleanup] Removed legacy timeline cache: ${key}`);
    });
    
    // Also clear any React Query cache that might be stale
    // Force a hard refresh of the page to clear all caches
    if (keysToRemove.length > 0 || localStorage.getItem('timeline_cache_cleared') !== 'true') {
      console.log(`[CacheCleanup] Cleared ${keysToRemove.length} legacy timeline cache entries - forcing cache invalidation`);
      localStorage.setItem('timeline_cache_cleared', 'true');
      
      // Dispatch a custom event to trigger cache invalidation
      window.dispatchEvent(new CustomEvent('timeline-cache-cleared'));
    } else {
      console.log('[CacheCleanup] No legacy timeline cache entries found');
    }
    
    return keysToRemove.length;
  } catch (error) {
    console.warn('[CacheCleanup] Failed to clear timeline cache:', error);
    return 0;
  }
};

// Auto-run on import to clean up legacy cache
if (typeof window !== 'undefined') {
  clearTimelineCache();
}
