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
      });
    
    // Also clear any React Query cache that might be stale
    // Force a hard refresh of the page to clear all caches
    if (keysToRemove.length > 0 || localStorage.getItem('timeline_cache_cleared') !== 'true') {
      localStorage.setItem('timeline_cache_cleared', 'true');
      
      // Dispatch a custom event to trigger cache invalidation
      window.dispatchEvent(new CustomEvent('timeline-cache-cleared'));
    } else {
      }
    
    return keysToRemove.length;
  } catch (error) {
    console.warn('[CacheCleanup] Failed to clear timeline cache:', error);
    return 0;
  }
};

// DISABLED: Auto-cleanup was causing timeline position resets
// The cache cleanup was triggering data reloads that override user drag positions
//
// // Auto-run on import to clean up legacy cache
// if (typeof window !== 'undefined') {
//   clearTimelineCache();
// }
