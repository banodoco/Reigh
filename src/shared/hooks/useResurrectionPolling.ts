import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { runtimeConfig, addJitter } from '@/shared/lib/config';

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
  hasRecentActivity?: (data: any) => boolean;
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
    const data = query.state.data;
    const dataUpdatedAt = query.state.dataUpdatedAt;
    const error = query.state.error;
    const fetchStatus = query.state.fetchStatus;
    const status = query.state.status;
    const now = Date.now();
    
    // Build base context but allow override for specific fields
    const baseLogContext = {
      fetchStatus,
      status,
      errorMessage: error?.message,
      timestamp: now,
      refetchIntervalTriggered: true,
      ...context // Context can override any of the above
    };

    if (!data) {
      // If no data yet, poll slowly to get initial data
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log(`[ReconnectionIssue][Polling:${debugTag}] No data yet, slow polling`, { intervalMs: initialInterval, ...baseLogContext });
      }
      return initialInterval;
    }
    
    const dataAge = now - dataUpdatedAt;
    
    // Extract data metrics for logging (different for each hook type)
    const dataMetrics = extractDataMetrics(data, debugTag);
    
    // Check for recent activity if function provided
    const recentActivity = hasRecentActivity ? hasRecentActivity(data) : false;
    
    // Log the polling decision process with data-specific metrics
    if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
      console.log(`[ReconnectionIssue][Polling:${debugTag}] Decision context`, {
        ...baseLogContext,
        ...dataMetrics,
        hasRecentActivity: recentActivity,
        dataAge: Math.round(dataAge / 1000) + 's',
        visibilityState: document.visibilityState
      });
    }
    
    if (recentActivity) {
      // Fast polling when we have recent activity (might be more coming)
      const fastLogContext = {
        ...baseLogContext,
        ...dataMetrics,
        pollIntervalMs: fastInterval,
        dataAge: Math.round(dataAge / 1000) + 's',
        dataUpdatedAt: new Date(dataUpdatedAt).toISOString()
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
        console.log(`[ReconnectionIssue][Polling:${debugTag}] FAST polling`, fastLogContext);
      }
      return fastInterval;
    } else if (dataAge > staleThreshold) {
      // RESURRECTION POLLING: If data is stale, poll occasionally
      // This catches new items created while WebSocket was disconnected
      const resurrectionLogContext = {
        ...baseLogContext,
        ...dataMetrics,
        dataAge: Math.round(dataAge / 1000) + 's',
        pollIntervalMs: resurrectionInterval,
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
        console.log(`[ReconnectionIssue][Polling:${debugTag}] RESURRECTION polling`, resurrectionLogContext);
      }
      return resurrectionInterval;
    } else {
      // Data is fresh and no recent activity - rely on WebSocket
      if (runtimeConfig.RECONNECTION_LOGS_ENABLED) {
        console.log(`[ReconnectionIssue][Polling:${debugTag}] Fresh; rely on realtime`, {
          ...baseLogContext,
          ...dataMetrics,
          dataAge: Math.round(dataAge / 1000) + 's'
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
    let cachedEventFlowing = true;
    // global rolling counters (window-scoped) to understand boost frequency per tag
    const boostCounters: any = (typeof window !== 'undefined') ? ((window as any).__RQ_BOOST_COUNTERS__ = (window as any).__RQ_BOOST_COUNTERS__ || { lastReset: Date.now() }) : {};
    
    return (query: any) => {
      try {
        const now = Date.now();
        // Throttle realtime checks to reduce overhead - only check every 5s
        if (now - lastRealtimeCheck > 5000) {
          const socket: any = (supabase as any)?.realtime?.socket;
          const socketConnected = !!socket?.isConnected?.();
          
          // Check if we're actually receiving events (not just connected)
          const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
          const hasJoinedChannels = channels.some((c: any) => c.state === 'joined');
          
          // Check event flow from diagnostics if available
          let eventsFlowing = false;
          try {
            // Access diagnostics from window if exposed
            const diagnostics = (window as any).__REALTIME_DIAGNOSTICS__;
            if (diagnostics) {
              const lastEventAt = diagnostics.lastEventAt || 0;
              eventsFlowing = (now - lastEventAt) < 30000; // Events in last 30s
            }
          } catch {}
          
          cachedRealtimeState = socketConnected && hasJoinedChannels;
          cachedEventFlowing = eventsFlowing;
          lastRealtimeCheck = now;
          
          if (runtimeConfig.RECONNECTION_LOGS_ENABLED && !cachedRealtimeState) {
            console.log(`[ReconnectionIssue][Polling:${debugTag}] Realtime health check`, {
              socketConnected,
              hasJoinedChannels,
              channelCount: channels.length,
              eventsFlowing,
              cachedRealtimeState
            });
          }
        }
        
        const realtimeEnabled = runtimeConfig.REALTIME_ENABLED !== false;
        const realtimeHealthy = cachedRealtimeState && (cachedEventFlowing || document.visibilityState === 'hidden');
        
        if (!realtimeHealthy || !realtimeEnabled) {
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
          const visible = document.visibilityState === 'visible';
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
              console.warn('[DeadModeInvestigation] Polling boosted due to realtime issues', {
                debugTag,
                visibility: document.visibilityState,
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
                realtime: {
                  ...snapshot,
                  healthy: cachedRealtimeState,
                  eventsFlowing: cachedEventFlowing
                },
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
