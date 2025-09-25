import { QueryClient } from '@tanstack/react-query';

/**
 * Centralized query invalidation helper to prevent race conditions
 * and improve mobile performance by batching invalidations
 */
export class QueryInvalidationHelper {
  private queryClient: QueryClient;
  private pendingInvalidations = new Map<string, Set<string>>();
  private invalidationTimeouts = new Map<string, NodeJS.Timeout>();
  
  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  /**
   * Batch invalidations for a project to prevent race conditions
   * Debounces multiple calls within 50ms to reduce network requests
   */
  invalidateProjectQueries(
    projectId: string, 
    queries: Array<'shots' | 'generations' | 'unpositioned-count'>,
    shotId?: string,
    immediate = false
  ) {
    const key = `project-${projectId}`;
    
    // Add queries to pending set
    if (!this.pendingInvalidations.has(key)) {
      this.pendingInvalidations.set(key, new Set());
    }
    
    const pending = this.pendingInvalidations.get(key)!;
    queries.forEach(query => {
      if (query === 'shots') {
        pending.add(`shots:${projectId}`);
      } else if (query === 'generations') {
        pending.add(`unified-generations:project:${projectId}`);
      } else if (query === 'unpositioned-count' && shotId) {
        pending.add(`unpositioned-count:${shotId}`);
      }
    });

    // Clear existing timeout
    if (this.invalidationTimeouts.has(key)) {
      clearTimeout(this.invalidationTimeouts.get(key)!);
    }

    // Execute immediately or after debounce
    const executeInvalidations = async () => {
      const toInvalidate = Array.from(pending);
      pending.clear();
      this.invalidationTimeouts.delete(key);

      if (toInvalidate.length === 0) return;

      console.log('[RaceConditionFix] 🚀 Executing batched invalidations:', {
        projectId,
        queries: toInvalidate,
        count: toInvalidate.length,
        isMobile: typeof window !== 'undefined' && window.innerWidth <= 768,
        timestamp: Date.now()
      });

      // Execute all invalidations in parallel
      const invalidationPromises = toInvalidate.map(queryString => {
        const parts = queryString.split(':');
        if (parts[0] === 'shots') {
          return this.queryClient.invalidateQueries({ queryKey: ['shots', parts[1]] });
        } else if (parts[0] === 'unified-generations') {
          return this.queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', parts[2]] });
        } else if (parts[0] === 'unpositioned-count') {
          return this.queryClient.invalidateQueries({ queryKey: ['unpositioned-count', parts[1]] });
        }
        return Promise.resolve();
      });

      try {
        await Promise.all(invalidationPromises);
        console.log('[RaceConditionFix] ✅ Batched invalidations completed');
      } catch (error) {
        console.error('[RaceConditionFix] ❌ Batched invalidations failed:', error);
      }
    };

    if (immediate) {
      executeInvalidations();
    } else {
      // Debounce for 50ms to batch rapid successive calls
      this.invalidationTimeouts.set(key, setTimeout(executeInvalidations, 50));
    }
  }

  /**
   * Force immediate execution of all pending invalidations
   * Useful before navigation or critical operations
   */
  async flushAll() {
    console.log('[RaceConditionFix] 🏃‍♂️ Flushing all pending invalidations');
    
    // Clear all timeouts and execute immediately
    for (const [key, timeout] of this.invalidationTimeouts) {
      clearTimeout(timeout);
      const pending = this.pendingInvalidations.get(key);
      if (pending && pending.size > 0) {
        // Execute immediately
        this.invalidateProjectQueries(key.replace('project-', ''), [], undefined, true);
      }
    }
  }

  /**
   * Clear all pending invalidations without executing
   * Useful for cleanup or when component unmounts
   */
  clearAll() {
    console.log('[RaceConditionFix] 🧹 Clearing all pending invalidations');
    
    for (const timeout of this.invalidationTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    this.invalidationTimeouts.clear();
    this.pendingInvalidations.clear();
  }
}

// Global instance - will be initialized when first QueryClient is available
let globalInvalidationHelper: QueryInvalidationHelper | null = null;

export const getInvalidationHelper = (queryClient?: QueryClient): QueryInvalidationHelper => {
  if (!globalInvalidationHelper && queryClient) {
    globalInvalidationHelper = new QueryInvalidationHelper(queryClient);
  }
  
  if (!globalInvalidationHelper) {
    throw new Error('QueryInvalidationHelper not initialized. Pass QueryClient on first call.');
  }
  
  return globalInvalidationHelper;
};

/**
 * Hook to get the invalidation helper with automatic QueryClient injection
 */
export const useInvalidationHelper = () => {
  // This will be imported where QueryClient is available
  return {
    invalidateProjectQueries: (
      projectId: string, 
      queries: Array<'shots' | 'generations' | 'unpositioned-count'>,
      shotId?: string,
      immediate = false
    ) => {
      // This will be implemented in the hook files where queryClient is available
      console.warn('[RaceConditionFix] useInvalidationHelper called but not implemented in this context');
    }
  };
};
