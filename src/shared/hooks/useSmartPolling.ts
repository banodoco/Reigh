import { useEffect, useReducer, useRef } from 'react';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

/**
 * Smart polling hook that integrates with DataFreshnessManager
 * 
 * This hook replaces the old useResurrectionPolling system with a simpler,
 * more reliable approach that works with our centralized freshness management.
 */

interface SmartPollingConfig {
  /**
   * The query key this polling config applies to
   */
  queryKey: string[];
  
  /**
   * Minimum polling interval when realtime is working (default: 5 minutes)
   * Set to false to disable polling entirely when realtime is healthy
   */
  minInterval?: number | false;
  
  /**
   * Maximum polling interval when realtime is broken (default: 5 seconds)
   */
  maxInterval?: number;
  
  /**
   * How fresh data needs to be to avoid aggressive polling (default: 30 seconds)
   */
  freshnessThreshold?: number;
  
  /**
   * Enable debug logging for this query
   */
  debug?: boolean;
}

interface SmartPollingResult {
  /**
   * React Query refetchInterval - use this in your useQuery config
   */
  refetchInterval: number | false;
  
  /**
   * React Query staleTime - use this in your useQuery config
   */
  staleTime: number;
  
  /**
   * Whether data is considered fresh based on realtime events
   */
  isDataFresh: boolean;
  
  /**
   * Current realtime connection status
   */
  realtimeStatus: 'connected' | 'disconnected' | 'error';
  
  /**
   * Debug information (only if debug: true)
   */
  debug?: {
    pollingReason: string;
    lastEventAge?: number;
    diagnostics: any;
  };
}

export function useSmartPolling(config: SmartPollingConfig): SmartPollingResult {
  const {
    queryKey,
    minInterval = 5 * 60 * 1000, // 5 minutes default
    // [MobileHeatDebug] Increased from 5s to 15s to reduce mobile CPU usage
    // Desktop can handle aggressive polling, but mobile overheats with 5s intervals
    maxInterval = 15000, // 15 seconds default (was 5s)
    freshnessThreshold = 30000, // 30 seconds default
    debug = false
  } = config;

  // [MobileHeatDebug] Detect mobile devices and increase polling intervals
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Force re-render when freshness manager state changes
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const lastIntervalRef = useRef<number | false | null>(null);

  // 🎯 FIX: Stabilize queryKey for dependency comparison
  // Arrays are compared by reference, so ['a', 'b'] !== ['a', 'b'] on every render
  // Use a ref to store current queryKey so callback always has latest without needing it in deps
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;
  const queryKeyString = JSON.stringify(queryKey);

  // 🎯 FIX: Throttle forceUpdate to prevent rapid re-renders
  // DataFreshnessManager can emit many notifications in quick succession
  const pendingUpdateRef = useRef(false);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Subscribe to freshness manager updates
    const unsubscribe = dataFreshnessManager.subscribe(() => {
      // 🎯 OPTIMIZATION: Only re-render if the calculated polling interval actually changes
      const currentInterval = dataFreshnessManager.getPollingInterval(queryKeyRef.current);
      if (lastIntervalRef.current !== currentInterval) {
        if (debug) {
          console.log(`[SmartPolling] 🔄 Polling interval changed for ${queryKeyString}: ${lastIntervalRef.current} -> ${currentInterval}`);
        }
        // 🎯 THROTTLE: Batch rapid updates into a single re-render
        if (!pendingUpdateRef.current) {
          pendingUpdateRef.current = true;
          // Use microtask to batch synchronous notifications
          queueMicrotask(() => {
            pendingUpdateRef.current = false;
            forceUpdate();
          });
        }
      }
    });

    return () => {
      unsubscribe();
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, [queryKeyString, debug]);

  // Get current state from freshness manager
  const pollingInterval = dataFreshnessManager.getPollingInterval(queryKey);
  lastIntervalRef.current = pollingInterval;
  const isDataFresh = dataFreshnessManager.isDataFresh(queryKey, freshnessThreshold);
  const diagnostics = debug ? dataFreshnessManager.getDiagnostics() : null;

  // Apply our min/max constraints
  let finalInterval: number | false;
  let pollingReason: string;
  
  // [MobileHeatDebug] On mobile, multiply all intervals by 2x to reduce CPU usage
  const mobileMultiplier = isMobile ? 2 : 1;
  const effectiveMaxInterval = maxInterval * mobileMultiplier;
  const effectiveMinInterval = minInterval === false ? false : minInterval * mobileMultiplier;

  if (pollingInterval === false) {
    // 🎯 NEW: Respect when freshness manager disables polling completely
    if (effectiveMinInterval === false) {
      finalInterval = false;
      pollingReason = 'Polling DISABLED - realtime is healthy and working';
    } else {
      finalInterval = effectiveMinInterval;
      pollingReason = isMobile 
        ? 'Freshness manager disabled polling, using minInterval fallback (2x for mobile)'
        : 'Freshness manager disabled polling, using minInterval fallback';
    }
  } else if (effectiveMinInterval !== false && pollingInterval > effectiveMinInterval && isDataFresh) {
    finalInterval = effectiveMinInterval;
    pollingReason = isMobile 
      ? 'Data is fresh, using minInterval (2x for mobile)'
      : 'Data is fresh, using minInterval';
  } else if (pollingInterval < effectiveMaxInterval) {
    finalInterval = effectiveMaxInterval;
    pollingReason = isMobile
      ? 'Clamping to maxInterval for aggressive polling (2x for mobile - 30s)'
      : 'Clamping to maxInterval for aggressive polling';
  } else {
    finalInterval = pollingInterval * mobileMultiplier;
    pollingReason = isMobile
      ? 'Using freshness manager interval (2x for mobile)'
      : 'Using freshness manager interval';
  }

  // Calculate stale time based on freshness
  const staleTime = isDataFresh ? freshnessThreshold : 0;

  const result: SmartPollingResult = {
    refetchInterval: finalInterval,
    staleTime,
    isDataFresh,
    realtimeStatus: diagnostics?.realtimeStatus || 'disconnected'
  };

  if (debug) {
    const queryAge = diagnostics?.queryAges?.find(q => 
      JSON.stringify(q.query) === JSON.stringify(queryKey)
    );

    result.debug = {
      pollingReason,
      lastEventAge: queryAge?.ageMs,
      diagnostics
    };

    console.log(`[SmartPolling] 📊 Config for query ${JSON.stringify(queryKey)}:`, {
      refetchInterval: finalInterval,
      staleTime,
      isDataFresh,
      realtimeStatus: result.realtimeStatus,
      pollingReason,
      lastEventAge: queryAge?.ageMs,
      freshnessManagerInterval: pollingInterval,
      // [MobileHeatDebug] Show mobile-specific info
      isMobile,
      mobileMultiplier
    });
  }
  
  // [MobileHeatDebug] Log aggressive polling on mobile for debugging
  if (isMobile && finalInterval !== false && finalInterval < 60000) {
    console.log(`[MobileHeatDebug] ⚠️ Active polling on mobile: ${finalInterval}ms for ${queryKey.join(':')}`, {
      pollingReason,
      realtimeStatus: result.realtimeStatus
    });
  }

  return result;
}

/**
 * Simplified version for common use cases
 * Just returns the config object to spread into useQuery
 * 
 * By default, minInterval is set to false to allow polling to be completely disabled
 * when realtime is working. Pass minInterval: number if you want a fallback interval.
 */
export function useSmartPollingConfig(queryKey: string[], debug = false) {
  // 🎯 NEW: Default to minInterval: false to allow full polling disable
  const { refetchInterval, staleTime } = useSmartPolling({ 
    queryKey, 
    debug,
    minInterval: false // Allow polling to be disabled when realtime is healthy
  });
  
  return {
    refetchInterval,
    staleTime
  };
}

/**
 * Hook for debugging - shows current freshness state
 */
export function useDataFreshnessDiagnostics() {
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    const unsubscribe = dataFreshnessManager.subscribe(forceUpdate);
    return unsubscribe;
  }, []);

  return dataFreshnessManager.getDiagnostics();
}
