import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { runtimeConfig, addJitter } from '@/shared/lib/config';
import { VisibilityManager } from '@/shared/lib/VisibilityManager';

/**
 * Common resurrection polling logic that can be reused across different data types.
 * Based on the successful TasksPane pattern.
 */

export interface ResurrectionPollingConfig {
  /** Tag for debug logging (e.g., 'Tasks', 'ImageGallery', 'VideoGallery') */
  debugTag: string;
  /** Fast polling interval for recent activity (ms) */
  fastInterval?: number;
  /** Resurrection polling interval for stale data (ms) */
  resurrectionInterval?: number;
  /** Initial polling interval when no data (ms) */
  initialInterval?: number;
  /** Age threshold to consider data stale (ms) */
  staleThreshold?: number;
  /** Function to detect if there's recent activity in the data */
  hasRecentActivity?: (data: any, context?: Record<string, any>) => boolean;
  /** Additional context for logging */
  context?: Record<string, any>;
}

const DEFAULT_CONFIG: Required<Omit<ResurrectionPollingConfig, 'debugTag' | 'hasRecentActivity' | 'context'>> = {
  fastInterval: 15000,        // 15s for active periods
  resurrectionInterval: 45000, // 45s for stale data  
  initialInterval: 30000,     // 30s when no data
  staleThreshold: 60000,      // 1 minute = stale
};

/**
 * Generates a refetchInterval function for React Query that implements resurrection polling.
 * This is the core logic that was duplicated across TasksPane, ImageGallery, and VideoOutputsGallery.
 * 
 * IMPORTANT: This preserves all the specific logging contexts and behaviors from the original hooks.
 */
export function createResurrectionPollingFunction(config: ResurrectionPollingConfig) {
  const {
    debugTag,
    fastInterval = DEFAULT_CONFIG.fastInterval,
    resurrectionInterval = DEFAULT_CONFIG.resurrectionInterval,
    initialInterval = DEFAULT_CONFIG.initialInterval,
    staleThreshold = DEFAULT_CONFIG.staleThreshold,
    hasRecentActivity,
    context = {}
  } = config;

  return (query: any) => {
    // Get network-aware intervals from NetworkStatusManager
    let networkStatusManager, networkStatus, recommendedIntervals, isSlowConnection;
    try {
      const { getNetworkStatusManager } = require('@/shared/lib/NetworkStatusManager');
      networkStatusManager = getNetworkStatusManager();
      networkStatus = networkStatusManager.getStatus();
      recommendedIntervals = networkStatusManager.getRecommendedIntervals();
      isSlowConnection = networkStatusManager.isSlowConnection();
    } catch {
      // Fallback if NetworkStatusManager not available
      networkStatus = { isOnline: navigator.onLine, effectiveType: '4g' as const };
      recommendedIntervals = { fast: 10000, normal: 30000, slow: 60000 };
      isSlowConnection = false;
    }

    // Adjust intervals based on network status
    const networkAwareFastInterval = Math.max(fastInterval, recommendedIntervals.fast);
    const networkAwareResurrectionInterval = Math.max(resurrectionInterval, recommendedIntervals.normal);
    const networkAwareInitialInterval = Math.max(initialInterval, recommendedIntervals.normal);
    // Suppress polling during healing window to avoid racing observer restoration
    try {
      const healing = Date.now() < (((window as any).__REACTIVATION_HEALING_UNTIL__) || 0);
      if (healing) {
        if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
          console.warn(`[TabReactivation][Polling:${debugTag}] Suppressing polling during healing window`);
        }
        return false;
      }
    } catch {}

    const data = query.state.data;
    const dataUpdatedAt = query.state.dataUpdatedAt;
    const error = query.state.error;
    const fetchStatus = query.state.fetchStatus;
    const status = query.state.status;
    const now = Date.now();
    
    // Capture Supabase realtime snapshot for correlation
    const supabaseSnapshot = (() => {
      try {
        const socket: any = (supabase as any)?.realtime?.socket;
        const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
        const rtSnap = (typeof window !== 'undefined') ? ((window as any).__REALTIME_SNAPSHOT__ || null) : null;
        return {
          connected: !!socket?.isConnected?.(),
          connState: socket?.connectionState,
          channelCount: channels?.length || 0,
          channelTopics: (channels || []).slice(0, 5).map((c: any) => ({ topic: c.topic, state: c.state })),
          lastEventAt: rtSnap?.lastEventAt || null,
          channelState: rtSnap?.channelState || 'unknown'
        };
      } catch {
        return { connected: null, connState: undefined, channelCount: null, channelTopics: [], lastEventAt: null, channelState: 'unknown' };
      }
    })();

    // Build base context but allow override for specific fields
    const baseLogContext = {
      fetchStatus,
      status,
      errorMessage: error?.message,
      timestamp: now,
      refetchIntervalTriggered: true,
      supabase: supabaseSnapshot,
      networkStatus: {
        isOnline: networkStatus.isOnline,
        effectiveType: networkStatus.effectiveType,
        isSlowConnection,
        lastTransitionAt: networkStatus.lastTransitionAt
      },
      ...context // Context can override any of the above
    };

    // Handle offline scenarios - use very slow polling or disable entirely
    if (!networkStatus.isOnline) {
      // If offline, use very slow polling to detect when we come back online
      const offlineInterval = recommendedIntervals.slow;
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.warn(`[Polling:${debugTag}] OFFLINE: Using slow polling to detect network recovery`, {
          intervalMs: offlineInterval,
          ...baseLogContext
        });
      }
      return offlineInterval;
    }

    if (!data) {
      // If no data yet, use different intervals based on context
      // For Processing filter, use faster initial polling to avoid delays
      const processingFilterActive = context?.status && 
        Array.isArray(context.status) && 
        context.status.includes('Queued') && 
        context.status.includes('In Progress');
      
      const contextAwareInitialInterval = processingFilterActive ? 
        Math.max(5000, recommendedIntervals.fast) : // 5s for Processing filter
        networkAwareInitialInterval; // Normal initial interval for others
      
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log(`[Polling:${debugTag}] No data yet, context-aware initial polling`, { 
          intervalMs: contextAwareInitialInterval,
          originalInterval: initialInterval,
          networkAwareInterval: networkAwareInitialInterval,
          processingFilterActive,
          networkAdjusted: contextAwareInitialInterval !== initialInterval,
          ...baseLogContext 
        });
      }
      return contextAwareInitialInterval;
    }
    
    const dataAge = now - dataUpdatedAt;
    
    // Extract data metrics for logging (different for each hook type)
    const dataMetrics = extractDataMetrics(data, debugTag);
    
    // Check for recent activity if function provided (pass context for detectors that need it)
    const recentActivity = hasRecentActivity ? hasRecentActivity(data, context) : false;
    
      // Log the polling decision process with data-specific metrics
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        const visibilityState = VisibilityManager.getState();
        console.log(`[Polling:${debugTag}] Decision context`, {
        ...baseLogContext,
        ...dataMetrics,
        hasRecentActivity: recentActivity,
        dataAge: Math.round(dataAge / 1000) + 's',
        visibilityState: visibilityState.visibilityState
      });
    }
    
    if (recentActivity) {
      // 🔧 CIRCUIT BREAKER: Check if data is stuck despite recent activity
      const isDataStuck = recentActivity && dataAge > (staleThreshold * 2); // Data should update with recent activity
      let finalInterval = networkAwareFastInterval;
      
      if (isDataStuck) {
        // Escalate polling when data appears stuck, but respect network conditions
        const escalatedInterval = Math.min(networkAwareFastInterval * 0.5, 8000); // Max 8s when stuck
        finalInterval = Math.max(escalatedInterval, recommendedIntervals.fast); // Don't go below network recommendations
        
        if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
          console.warn(`[Polling:${debugTag}] CIRCUIT BREAKER: Data stuck despite activity, escalating polling`, {
            dataAge: Math.round(dataAge / 1000) + 's',
            staleThreshold: Math.round(staleThreshold / 1000) + 's',
            escalatedInterval: finalInterval,
            originalFastInterval: fastInterval,
            networkAwareFastInterval,
            networkRecommendation: recommendedIntervals.fast,
            recentActivity,
            timestamp: now
          });
        }
      }
      
      const fastLogContext = {
        ...baseLogContext,
        ...dataMetrics,
        pollIntervalMs: finalInterval,
        originalInterval: fastInterval,
        networkAdjusted: finalInterval !== fastInterval,
        dataAge: Math.round(dataAge / 1000) + 's',
        dataUpdatedAt: new Date(dataUpdatedAt).toISOString(),
        circuitBreakerActive: isDataStuck
      };
      
      // Add recent activity details if available
      if (hasRecentActivity && debugTag.includes('Generation')) {
        const recentItems = getRecentItems(data, debugTag);
        if (recentItems !== null) {
          (fastLogContext as any).recentGenerations = recentItems;
        }
      } else if (hasRecentActivity && debugTag === 'Tasks') {
        const activeTaskDetails = getActiveTaskDetails(data);
        if (activeTaskDetails) {
          Object.assign(fastLogContext, activeTaskDetails);
        }
      }
      
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log(`[Polling:${debugTag}] FAST network-aware polling`, { ...fastLogContext, supabase: supabaseSnapshot });
      }
      return finalInterval;
    } else if (dataAge > staleThreshold) {
      // RESURRECTION POLLING: If data is stale, poll occasionally
      // This catches new items created while WebSocket was disconnected
      const resurrectionLogContext = {
        ...baseLogContext,
        ...dataMetrics,
        dataAge: Math.round(dataAge / 1000) + 's',
        pollIntervalMs: networkAwareResurrectionInterval,
        originalInterval: resurrectionInterval,
        networkAdjusted: networkAwareResurrectionInterval !== resurrectionInterval,
        dataUpdatedAt: new Date(dataUpdatedAt).toISOString()
      };
      
      // Add recent task details for Tasks hook
      if (debugTag === 'Tasks') {
        const recentTaskDetails = getRecentTaskDetails(data);
        if (recentTaskDetails) {
          Object.assign(resurrectionLogContext, recentTaskDetails);
        }
      }
      
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log(`[Polling:${debugTag}] RESURRECTION network-aware polling`, { ...resurrectionLogContext, supabase: supabaseSnapshot });
      }
      return networkAwareResurrectionInterval;
    } else {
      // Data is fresh and no recent activity - rely on WebSocket,
      // unless realtime snapshot indicates potential degradation.
      try {
        const snap = (typeof window !== 'undefined') ? ((window as any).__REALTIME_SNAPSHOT__ || null) : null;
        const now = Date.now();
        const sinceLastEvent = snap?.lastEventAt ? (now - snap.lastEventAt) : null;
        const channelState = snap?.channelState;
        const degraded = channelState !== 'joined' || (sinceLastEvent != null && sinceLastEvent > 15000);
        
        // Enhanced degradation analysis
        const degradationReasons = [];
        if (channelState !== 'joined') {
          degradationReasons.push(`channel_not_joined:${channelState}`);
        }
        if (sinceLastEvent != null && sinceLastEvent > 15000) {
          degradationReasons.push(`no_events_for:${Math.round(sinceLastEvent/1000)}s`);
        }
        
        console.error('[RealtimePollingDebug] 🔍 DEGRADATION CHECK:', {
          debugTag,
          degraded,
          degradationReasons,
          channelState,
          sinceLastEventMs: sinceLastEvent,
          sinceLastEventSec: sinceLastEvent ? Math.round(sinceLastEvent/1000) : null,
          lastEventAt: snap?.lastEventAt,
          lastEventDate: snap?.lastEventAt ? new Date(snap.lastEventAt).toISOString() : null,
          snapshotKeys: snap ? Object.keys(snap) : null,
          fullSnapshot: snap,
          timestamp: now
        });
        
        if (degraded) {
          const interval = addJitter(8000, 1000);
          if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
            console.warn('[DeadModeInvestigation] Polling forced despite fresh data (realtime degraded)', {
              debugTag,
              intervalMs: interval,
              channelState,
              sinceLastEventMs: sinceLastEvent,
              degradationReasons,
              snapshot: snap,
            });
          }
          return interval;
        }
      } catch (snapshotError) {
        console.error('[RealtimePollingDebug] ❌ Error checking realtime snapshot:', {
          error: snapshotError,
          errorMessage: snapshotError?.message,
          debugTag,
          timestamp: Date.now()
        });
      }
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log(`[Polling:${debugTag}] Fresh; rely on realtime`, {
          ...baseLogContext,
          ...dataMetrics,
          dataAge: Math.round(dataAge / 1000) + 's',
          supabase: supabaseSnapshot
        });
      }
      return false; // No polling, rely on WebSocket
    }
  };
}

/**
 * Extract data metrics specific to each hook type for consistent logging
 */
function extractDataMetrics(data: any, debugTag: string): Record<string, any> {
  if (debugTag === 'Tasks') {
    return {
      taskCount: data.tasks?.length || 0,
      totalTasks: data.tasks?.length || 0,
      activeTaskCount: data.tasks?.filter((t: any) => t.status === 'Queued' || t.status === 'In Progress').length || 0
    };
  } else if (debugTag === 'ImageGallery') {
    return {
      itemCount: data.items?.length || 0,
      totalCount: data.total || 0
    };
  } else if (debugTag === 'UnifiedGenerations') {
    return {
      itemCount: (data.items as any[])?.length || 0
    };
  }
  return {};
}

/**
 * Get recent items count for generation hooks
 */
function getRecentItems(data: any, debugTag: string): number | null {
  const now = Date.now();
  if (debugTag === 'ImageGallery' && data.items) {
    return data.items.filter((item: any) => {
      const createdAt = new Date(item.createdAt || (item as any).created_at).getTime();
      const ageMs = now - createdAt;
      return ageMs < 5 * 60 * 1000;
    }).length;
  } else if (debugTag === 'UnifiedGenerations' && data.items) {
    return data.items.filter((item: any) => {
      const createdAt = new Date(item.createdAt || item.created_at).getTime();
      const ageMs = now - createdAt;
      return ageMs < 5 * 60 * 1000;
    }).length;
  }
  return null;
}

/**
 * Get active task details for Tasks hook  
 */
function getActiveTaskDetails(data: any): Record<string, any> | null {
  if (!data.tasks) return null;
  
  const activeTasks = data.tasks.filter((t: any) => t.status === 'Queued' || t.status === 'In Progress');
  return {
    activeTasksDetails: activeTasks.map((t: any) => ({
      id: t.id,
      status: t.status,
      taskType: t.taskType,
      createdAt: t.createdAt
    }))
  };
}

/**
 * Get recent task details for Tasks hook resurrection polling
 */
function getRecentTaskDetails(data: any): Record<string, any> | null {
  if (!data.tasks) return null;
  
  return {
    recentTasksDetails: data.tasks.slice(0, 3).map((t: any) => ({
      id: t.id,
      status: t.status,
      taskType: t.taskType,
      createdAt: t.createdAt
    }))
  };
}

/**
 * Hook to create consistent polling configuration with debug logging.
 * Reduces boilerplate in components that need resurrection polling.
 */
export function useResurrectionPollingConfig(
  debugTag: string,
  context: Record<string, any> = {},
  customConfig: Partial<ResurrectionPollingConfig> = {}
): {
  refetchInterval: (query: any) => number | false;
  debugConfig: ResurrectionPollingConfig;
} {
  const config = React.useMemo(() => ({
    debugTag,
    context,
    ...customConfig
  }), [debugTag, context, customConfig]);

  const refetchInterval = React.useMemo(() => {
    const baseFn = createResurrectionPollingFunction(config);
    let lastRealtimeCheck = 0;
    let cachedRealtimeState = true;
    // global rolling counters (window-scoped) to understand boost frequency per tag
    const boostCounters: any = (typeof window !== 'undefined') ? ((window as any).__RQ_BOOST_COUNTERS__ = (window as any).__RQ_BOOST_COUNTERS__ || { lastReset: Date.now() }) : {};
    
    return (query: any) => {
      try {
        const now = Date.now();
        // Throttle realtime checks to reduce overhead - only check every 5s
        if (now - lastRealtimeCheck > 5000) {
          const socket: any = (supabase as any)?.realtime?.socket;
          cachedRealtimeState = !!socket?.isConnected?.();
          lastRealtimeCheck = now;
        }
        
        const realtimeEnabled = runtimeConfig.REALTIME_ENABLED !== false;
        if (!cachedRealtimeState || !realtimeEnabled) {
          // Grace window after visibilitychange to allow healing
          try {
            const lastVis = (window as any).__VIS_CHANGE_AT__ || 0;
            const sinceVis = lastVis ? (now - lastVis) : Infinity;
            if (sinceVis < 4000) {
              // Suppress boost logs and return a short interval to keep UI responsive while healing
              return addJitter(6000, 800);
            }
          } catch {}
          // Boost polling when realtime is down
          const boosted = createResurrectionPollingFunction({
            ...config,
            fastInterval: Math.min(config.fastInterval ?? 15000, 10000),
            resurrectionInterval: Math.min(config.resurrectionInterval ?? 45000, 30000),
            initialInterval: Math.min(config.initialInterval ?? 30000, 15000)
          });
          
          // Decide interval with boost
          const decided = boosted(query);

          let decision: 'forced-min' | 'clamped';
          let finalInterval: number;
          const visibilityState = VisibilityManager.getState();
          const visible = visibilityState.isVisible;
          if (decided === false) {
            const base = runtimeConfig.DEADMODE_FORCE_POLLING_MS ?? 5000;
            const clamped = visible ? Math.min(base, 15000) : Math.max(15000, base);
            finalInterval = addJitter(clamped, 1000);
            decision = 'forced-min';
          } else {
            const numeric = typeof decided === 'number' ? decided : 5000;
            const clamped = visible ? Math.min(numeric, 12000) : Math.max(20000, numeric);
            finalInterval = addJitter(clamped, 1500);
            decision = 'clamped';
          }

          // increment counters per tag
          try {
            if (typeof window !== 'undefined') {
              const store = (window as any).__RQ_BOOST_COUNTERS__;
              if (store) {
                const since = now - (store.lastReset || 0);
                if (since > 60000) {
                  store.lastReset = now;
                  store.counts = {};
                }
                store.counts = store.counts || {};
                store.counts[debugTag] = (store.counts[debugTag] || 0) + 1;
              }
            }
          } catch {}

          // Throttled diagnostic log: include realtime snapshot and query context
          try {
            const logKey = `realtime-down-${debugTag}`;
            const lastLog = (window as any)[logKey] || 0;
            if (now - lastLog > 30000) {
              const socket: any = (supabase as any)?.realtime?.socket;
              const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
              const snapshot = {
                connected: !!socket?.isConnected?.(),
                connState: socket?.connectionState,
                channelCount: channels?.length || 0,
                channelTopics: (channels || []).slice(0, 5).map((c: any) => c.topic),
              };
              const state = query?.state || {};
              const dataAgeMs = state.dataUpdatedAt ? (now - state.dataUpdatedAt) : null;
              const lastVisChange = (window as any).__VIS_CHANGE_AT__ || null;
              const sinceVisChange = lastVisChange ? (now - lastVisChange) : null;
              const currentVisibility = VisibilityManager.getState();
              console.warn('[DeadModeInvestigation] Polling boosted due to realtime=down', {
                debugTag,
                visibility: {
                  state: currentVisibility.visibilityState,
                  isVisible: currentVisibility.isVisible,
                  changeCount: currentVisibility.changeCount,
                  timeSinceLastChange: currentVisibility.timeSinceLastChange
                },
                decision,
                finalIntervalMs: Math.round(finalInterval),
                queryKey: (query as any)?.queryKey || 'unknown',
                queryState: {
                  status: state.status,
                  fetchStatus: state.fetchStatus,
                  isStale: state.isStale,
                  isFetching: state.isFetching,
                  errorMessage: state.error?.message,
                  dataUpdatedAt: state.dataUpdatedAt,
                  dataAgeSec: dataAgeMs != null ? Math.round(dataAgeMs / 1000) : null,
                },
                realtime: snapshot,
                lastVisibilityChangeAt: lastVisChange,
                secondsSinceVisibilityChange: sinceVisChange != null ? Math.round(sinceVisChange / 1000) : null,
                context,
                counters: (typeof window !== 'undefined') ? ( (window as any).__RQ_BOOST_COUNTERS__?.counts || {} ) : {}
              });
              (window as any)[logKey] = now;
            }
          } catch {}

          return finalInterval;
        }
      } catch {}
      return baseFn(query);
    };
  }, [config, debugTag, context]);

  return { refetchInterval, debugConfig: config };
}

/**
 * Standardized polling wrapper that extends useResurrectionPolling for specific use cases.
 * This eliminates the need for custom polling logic in individual hooks.
 */
export function useStandardizedPolling(
  debugTag: string,
  context: Record<string, any> = {},
  customConfig: Partial<ResurrectionPollingConfig> & {
    /** Override for simple static intervals (e.g., cache refresh) */
    staticInterval?: number;
    /** Disable background polling when tab is hidden */
    disableBackgroundPolling?: boolean;
  } = {}
): {
  refetchInterval: (query: any) => number | false;
  refetchIntervalInBackground: boolean;
  debugConfig: ResurrectionPollingConfig;
} {
  const { staticInterval, disableBackgroundPolling, ...resurrectionConfig } = customConfig;
  
  // For simple static intervals (like cache refresh), use a simplified approach
  if (staticInterval) {
    const staticPollingFn = React.useMemo(() => (query: any) => {
      // Suppress during healing window
      try {
        const healing = Date.now() < (((window as any).__REACTIVATION_HEALING_UNTIL__) || 0);
        if (healing) {
          if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
            console.warn(`[TabReactivation][Polling:${debugTag}] Suppressing static polling during healing window`);
          }
          return false;
        }
      } catch {}

      // Get network-aware intervals
      let networkStatus, recommendedIntervals;
      try {
        const { getNetworkStatusManager } = require('@/shared/lib/NetworkStatusManager');
        const manager = getNetworkStatusManager();
        networkStatus = manager.getStatus();
        recommendedIntervals = manager.getRecommendedIntervals();
      } catch {
        // Fallback if NetworkStatusManager not available
        networkStatus = { isOnline: navigator.onLine, effectiveType: '4g' as const };
        recommendedIntervals = { fast: 10000, normal: 30000, slow: 60000 };
      }
      
      // Adjust static interval based on network conditions
      const networkAwareInterval = Math.max(staticInterval, recommendedIntervals.normal);
      const finalInterval = addJitter(networkAwareInterval, Math.min(networkAwareInterval * 0.1, 5000));
      
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED && Math.random() < 0.1) { // Throttled logging
        console.log(`[Polling:${debugTag}] Static network-aware polling`, {
          originalInterval: staticInterval,
          networkAwareInterval,
          finalInterval,
          networkStatus: {
            isOnline: networkStatus.isOnline,
            effectiveType: networkStatus.effectiveType
          },
          context,
          timestamp: Date.now()
        });
      }
      
      return finalInterval;
    }, [staticInterval, debugTag, context]);
    
    return {
      refetchInterval: staticPollingFn,
      refetchIntervalInBackground: !disableBackgroundPolling,
      debugConfig: { debugTag, ...resurrectionConfig } as ResurrectionPollingConfig
    };
  }
  
  // For complex resurrection polling, use the full system
  const { refetchInterval, debugConfig } = useResurrectionPollingConfig(debugTag, context, resurrectionConfig);
  
  return {
    refetchInterval,
    refetchIntervalInBackground: !disableBackgroundPolling,
    debugConfig
  };
}

/**
 * Common recent activity detectors that can be reused.
 * These match the exact logic from the original hook implementations.
 */
export const RecentActivityDetectors = {
/**
 * For task data - checks if there are active tasks (Queued/In Progress)
 * Matches the logic from usePaginatedTasks
 */
tasks: (data: any) => {
  return data?.tasks?.some((task: any) => 
    task.status === 'Queued' || task.status === 'In Progress'
  ) ?? false;
},

/**
 * Enhanced task activity detector with mismatch detection
 * This helps catch the "count vs list" mismatch issue
 */
tasksWithMismatchDetection: (data: any, context?: Record<string, any>) => {
  const hasActiveTasks = data?.tasks?.some((task: any) => 
    task.status === 'Queued' || task.status === 'In Progress'
  ) ?? false;
  
  // Check for potential mismatch if context includes status counts
  if (context && typeof window !== 'undefined') {
    try {
      const queryClient = (window as any).__REACT_QUERY_CLIENT__;
      if (queryClient && context.projectId) {
        const statusCountsData = queryClient.getQueryData(['task-status-counts', context.projectId]);
        const processingCount = statusCountsData?.processing || 0;
        const currentTasksCount = data?.tasks?.length || 0;
        
        // Detect mismatch: counts show processing tasks but current page has none
        const hasMismatch = processingCount > 0 && currentTasksCount === 0 && !hasActiveTasks;
        
        if (hasMismatch) {
          console.warn('[Polling:Tasks] MISMATCH DETECTED: Status counts vs page data', {
            processingCount,
            currentTasksCount,
            hasActiveTasks,
            context,
            timestamp: Date.now()
          });
          
          // Force invalidation to resolve mismatch
          queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', context.projectId] });
          
          // Return true to trigger fast polling until resolved
          return true;
        }
      }
    } catch (error) {
      console.warn('[Polling:Tasks] Mismatch detection error:', error);
    }
  }
  
  return hasActiveTasks;
},

/**
 * Enhanced task activity detector that considers processing filter state
 * Used for paginated tasks where the filter affects polling behavior
 */
paginatedTasks: (data: any, context?: Record<string, any>) => {
  const hasActiveTasks = data?.tasks?.some((task: any) => 
    task.status === 'Queued' || task.status === 'In Progress'
  ) ?? false;
  
  // When Processing filter is selected, always use fast polling regardless of current page contents
  const processingFilterActive = context?.status && 
    Array.isArray(context.status) && 
    context.status.includes('Queued') && 
    context.status.includes('In Progress');
  
  return processingFilterActive || hasActiveTasks;
},

  /**
   * For generation data - checks if any items were created in last 5 minutes
   * Matches the exact logic from useGenerations
   */
  generations: (data: any) => {
    const now = Date.now();
    return data?.items?.some((item: any) => {
      const createdAt = new Date(item.createdAt || (item as any).created_at).getTime();
      const ageMs = now - createdAt;
      return ageMs < 5 * 60 * 1000; // Created in last 5 minutes
    }) ?? false;
  },

  /**
   * For unified generation data - matches the exact logic from useUnifiedGenerations
   */
  unifiedGenerations: (data: any) => {
    const now = Date.now();
    return data?.items?.some((item: any) => {
      const createdAt = new Date(item.createdAt || item.created_at).getTime();
      const ageMs = now - createdAt;
      return ageMs < 5 * 60 * 1000; // Created in last 5 minutes
    }) ?? false;
  }
};
