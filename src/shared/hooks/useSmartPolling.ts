import { useEffect, useReducer } from 'react';
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
    maxInterval = 5000, // 5 seconds default
    freshnessThreshold = 30000, // 30 seconds default
    debug = false
  } = config;

  // Force re-render when freshness manager state changes
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    // Subscribe to freshness manager updates
    const unsubscribe = dataFreshnessManager.subscribe(() => {
      if (debug) {
        console.log(`[SmartPolling] 🔄 Freshness update for query:`, queryKey);
      }
      forceUpdate();
    });

    return unsubscribe;
  }, [queryKey, debug]);

  // Get current state from freshness manager
  const pollingInterval = dataFreshnessManager.getPollingInterval(queryKey);
  const isDataFresh = dataFreshnessManager.isDataFresh(queryKey, freshnessThreshold);
  const diagnostics = debug ? dataFreshnessManager.getDiagnostics() : null;

  // Apply our min/max constraints
  let finalInterval: number | false;
  let pollingReason: string;

  if (pollingInterval === false) {
    finalInterval = minInterval;
    pollingReason = 'Freshness manager disabled polling, using minInterval';
  } else if (minInterval !== false && pollingInterval > minInterval && isDataFresh) {
    finalInterval = minInterval;
    pollingReason = 'Data is fresh, using minInterval';
  } else if (pollingInterval < maxInterval) {
    finalInterval = maxInterval;
    pollingReason = 'Clamping to maxInterval for aggressive polling';
  } else {
    finalInterval = pollingInterval;
    pollingReason = 'Using freshness manager interval';
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
      freshnessManagerInterval: pollingInterval
    });
  }

  return result;
}

/**
 * Simplified version for common use cases
 * Just returns the config object to spread into useQuery
 */
export function useSmartPollingConfig(queryKey: string[], debug = false) {
  const { refetchInterval, staleTime } = useSmartPolling({ queryKey, debug });
  
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
