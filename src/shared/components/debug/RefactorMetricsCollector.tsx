/**
 * RefactorMetricsCollector - Temporary component for baseline measurement
 * 
 * Enable by setting localStorage.setItem('DEBUG_REFACTOR_METRICS', 'true')
 * 
 * This component:
 * 1. Tracks React Query fetch events
 * 2. Tracks invalidation events  
 * 3. Provides a global API for exporting metrics
 * 
 * Remove after refactor is complete.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface QueryFetchEvent {
  timestamp: number;
  queryKey: string;
  status: string;
}

interface InvalidationEvent {
  timestamp: number;
  queryKey: string;
  reason?: string;
}

interface MetricsStore {
  queryFetches: QueryFetchEvent[];
  invalidations: InvalidationEvent[];
  sessionStart: number;
}

// Check if metrics collection is enabled
const isEnabled = () => 
  typeof window !== 'undefined' && 
  localStorage.getItem('DEBUG_REFACTOR_METRICS') === 'true';

// Global metrics store (survives re-renders)
const metricsStore: MetricsStore = {
  queryFetches: [],
  invalidations: [],
  sessionStart: Date.now(),
};

// Expose API on window for console access
if (typeof window !== 'undefined') {
  (window as any).__REFACTOR_METRICS = {
    // Get raw metrics
    get: () => ({ ...metricsStore }),
    
    // Clear metrics (call before each test scenario)
    clear: () => {
      metricsStore.queryFetches = [];
      metricsStore.invalidations = [];
      metricsStore.sessionStart = Date.now();
      console.log('[RefactorMetrics] Cleared');
    },
    
    // Export summary for a scenario
    export: () => {
      const duration = Date.now() - metricsStore.sessionStart;
      
      // Group fetches by query key
      const fetchesByKey: Record<string, number> = {};
      metricsStore.queryFetches.forEach(f => {
        fetchesByKey[f.queryKey] = (fetchesByKey[f.queryKey] || 0) + 1;
      });
      
      // Group invalidations by key
      const invalidationsByKey: Record<string, number> = {};
      metricsStore.invalidations.forEach(i => {
        invalidationsByKey[i.queryKey] = (invalidationsByKey[i.queryKey] || 0) + 1;
      });
      
      const summary = {
        durationMs: duration,
        totalFetches: metricsStore.queryFetches.length,
        totalInvalidations: metricsStore.invalidations.length,
        fetchesByKey,
        invalidationsByKey,
      };
      
      console.log('[RefactorMetrics] Summary:', summary);
      console.table(Object.entries(fetchesByKey).map(([key, count]) => ({ queryKey: key, fetches: count })));
      console.table(Object.entries(invalidationsByKey).map(([key, count]) => ({ queryKey: key, invalidations: count })));
      
      return summary;
    },
    
    // Enable/disable
    enable: () => {
      localStorage.setItem('DEBUG_REFACTOR_METRICS', 'true');
      console.log('[RefactorMetrics] Enabled - reload page to activate');
    },
    disable: () => {
      localStorage.removeItem('DEBUG_REFACTOR_METRICS');
      console.log('[RefactorMetrics] Disabled - reload page to deactivate');
    },
  };
}

export function RefactorMetricsCollector() {
  const queryClient = useQueryClient();
  const enabled = isEnabled();
  
  // Track query fetches
  useEffect(() => {
    if (!enabled) return;
    
    console.log('[RefactorMetrics] 📊 Metrics collection ENABLED');
    console.log('[RefactorMetrics] Use window.__REFACTOR_METRICS.clear() before each test');
    console.log('[RefactorMetrics] Use window.__REFACTOR_METRICS.export() to see summary');
    
    const cache = queryClient.getQueryCache();
    
    const unsubscribe = cache.subscribe((event) => {
      // Track fetch starts
      if (event.type === 'updated' && event.action?.type === 'fetch') {
        const queryKey = JSON.stringify(event.query.queryKey);
        
        metricsStore.queryFetches.push({
          timestamp: Date.now(),
          queryKey,
          status: event.query.state.status,
        });
        
        console.log('[RefactorMetrics:Fetch]', queryKey);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [queryClient, enabled]);
  
  // Patch invalidateQueries to track invalidations
  useEffect(() => {
    if (!enabled) return;
    
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    
    queryClient.invalidateQueries = ((...args: Parameters<typeof originalInvalidate>) => {
      const filters = args[0];
      const queryKey = filters?.queryKey ? JSON.stringify(filters.queryKey) : 'predicate';
      
      metricsStore.invalidations.push({
        timestamp: Date.now(),
        queryKey,
      });
      
      console.log('[RefactorMetrics:Invalidate]', queryKey);
      
      return originalInvalidate(...args);
    }) as typeof originalInvalidate;
    
    return () => {
      // Restore original (best effort - may not work perfectly if other code also patches)
      queryClient.invalidateQueries = originalInvalidate;
    };
  }, [queryClient, enabled]);
  
  // Don't render anything
  return null;
}

/**
 * Hook for tracking component render counts
 * 
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   useRenderCount('MyComponent');
 *   // ...
 * }
 * ```
 */
export function useRenderCount(componentName: string) {
  const renderCount = useRef(0);
  const enabled = isEnabled();
  
  useEffect(() => {
    if (!enabled) return;
    
    renderCount.current++;
    console.log(`[RefactorMetrics:Render] ${componentName}: ${renderCount.current}`);
  });
}

export default RefactorMetricsCollector;
