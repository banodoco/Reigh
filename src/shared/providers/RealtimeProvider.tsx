import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient, focusManager } from '@tanstack/react-query';
import { SupabaseRealtimeAdapter } from '@/shared/realtime/SupabaseRealtimeAdapter';
import { runtimeConfig } from '@/shared/lib/config';
import { DiagnosticsLogger, DiagnosticsStore } from '@/shared/realtime/Diagnostics';
import { ProjectChannelManager } from '@/shared/realtime/projectChannelManager';
import { TaskInvalidationSubscriber } from '@/shared/providers/TaskInvalidationSubscriber';
import { VisibilityManager, type VisibilitySignals, type VisibilityEventType } from '@/shared/lib/VisibilityManager';
import { invalidationRouter } from '@/shared/lib/InvalidationRouter';

// Critical query families that need observer restoration
const CRITICAL_QUERY_FAMILIES = [
  { name: 'unified-generations-project', prefixes: [['unified-generations', 'project']], needsProjectId: true },
  { name: 'unified-generations-shot', prefixes: [['unified-generations', 'shot']], needsProjectId: false },
  { name: 'task-status-counts', prefixes: [['task-status-counts']], needsProjectId: true },
  { name: 'tasks-paginated', prefixes: [['tasks', 'paginated']], needsProjectId: true },
  { name: 'shots', prefixes: [['shots']], needsProjectId: true },
] as const;

function matchesPrefix(queryKey: readonly unknown[], prefix: readonly string[]): boolean {
  return prefix.every((segment, index) => queryKey[index] === segment);
}

// 💣 NUCLEAR OBSERVER RESTORATION - Scorched earth approach - TIMESTAMP: 2025-01-06-16:20:30
async function forceObserverReconnection(queryClient: any, selectedProjectId: string | null) {
  if (!selectedProjectId) return;

  console.warn('[TabReactivation] 💣💣💣 NUCLEAR BOMB VERSION 3.0 - ABSOLUTE DESTRUCTION 💣💣💣', { 
    timestamp: Date.now(), 
    version: '3.0-FORCE-RELOAD',
    selectedProjectId 
  });
  
  // STEP 1: CAPTURE ALL DATA BEFORE NUCLEAR CLEAR
  const allQueries = queryClient.getQueryCache().getAll();
  const criticalData = new Map();
  
  CRITICAL_QUERY_FAMILIES.forEach(family => {
    const matchingQueries = allQueries.filter(query => 
      family.prefixes.some(prefix => matchesPrefix(query.queryKey, prefix))
    );
    
    matchingQueries.forEach(query => {
      if (query.state.data) {
        criticalData.set(JSON.stringify(query.queryKey), {
          queryKey: query.queryKey,
          data: query.state.data,
          dataUpdatedAt: query.state.dataUpdatedAt
        });
      }
    });
  });

  console.error('[TabReactivation] 💣 Captured critical data before nuclear clear', {
    capturedQueries: criticalData.size,
    timestamp: Date.now()
  });

  // STEP 2: NUCLEAR CLEAR - DESTROY EVERYTHING
  console.error('[TabReactivation] 💣 EXECUTING NUCLEAR CLEAR');
  queryClient.clear();
  
  // STEP 3: FORCE GARBAGE COLLECTION
  if (typeof window !== 'undefined') {
    try {
      if ('gc' in window && typeof (window as any).gc === 'function') {
        (window as any).gc();
        console.error('[TabReactivation] 💣 Manual GC triggered');
      }
    } catch {}
  }

  // STEP 4: RESTORE CRITICAL DATA
  console.error('[TabReactivation] 💣 Restoring critical data');
  for (const [keyStr, queryData] of criticalData) {
    queryClient.setQueryData(queryData.queryKey, queryData.data, {
      updatedAt: queryData.dataUpdatedAt
    });
  }

  // STEP 5: FORCE IMMEDIATE REFETCH OF ALL CRITICAL QUERIES
  console.error('[TabReactivation] 💣 FORCING IMMEDIATE REFETCH OF ALL CRITICAL QUERIES');
  
  CRITICAL_QUERY_FAMILIES.forEach(family => {
    if (family.needsProjectId && selectedProjectId) {
      family.prefixes.forEach(prefix => {
        const queryKey = [...prefix, selectedProjectId];
        console.warn(`[TabReactivation] 💣 NUCLEAR REFETCH: ${JSON.stringify(queryKey)}`);
        
        // Triple-force refetch
        queryClient.invalidateQueries({ queryKey });
        queryClient.refetchQueries({ queryKey, type: 'all' });
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey, type: 'active' });
        }, 100);
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey, type: 'all' });
        }, 200);
      });
    }
  });

  // Step 4: EXTENDED verification - check multiple times to catch InvalidationRouter interference
  const verifyObservers = (attempt: number) => {
    const postRestoreAnalysis = CRITICAL_QUERY_FAMILIES.map(family => {
      const matchingQueries = queryClient.getQueryCache().getAll().filter(query => 
        family.prefixes.some(prefix => matchesPrefix(query.queryKey, prefix))
      );
      
      return {
        name: family.name,
        totalQueries: matchingQueries.length,
        totalObservers: matchingQueries.reduce((sum, q) => sum + q.getObserversCount(), 0),
        queries: matchingQueries
      };
    });

    const totalObservers = postRestoreAnalysis.reduce((sum, f) => sum + f.totalObservers, 0);
    const allRestored = postRestoreAnalysis.every(f => f.totalQueries === 0 || f.totalObservers > 0);

    console.error(`[TabReactivation] 🔍 OBSERVER VERIFICATION #${attempt}`, {
      families: postRestoreAnalysis.map(f => ({
        name: f.name,
        queries: f.totalQueries,
        observers: f.totalObservers,
        status: f.totalQueries === 0 || f.totalObservers > 0 ? '✅ HEALTHY' : '❌ STILL BROKEN'
      })),
      totalObservers,
      allRestored,
      timestamp: Date.now()
    });

    // If still broken after attempt 1, try again more aggressively
    if (!allRestored && attempt === 1) {
      console.error('[TabReactivation] 🚨 OBSERVERS STILL BROKEN - RETRYING WITH MORE FORCE');
      
      // More aggressive restoration
      postRestoreAnalysis.forEach(family => {
        if (family.totalQueries > 0 && family.totalObservers === 0) {
          family.queries.forEach(query => {
            console.warn(`[TabReactivation] FORCE RE-INVALIDATING: ${JSON.stringify(query.queryKey.slice(0, 4))}`);
            
            // Double invalidation
            queryClient.invalidateQueries({ queryKey: query.queryKey });
            queryClient.refetchQueries({ queryKey: query.queryKey, type: 'active' });
            
            // Force a state update
            setTimeout(() => {
              queryClient.refetchQueries({ queryKey: query.queryKey, type: 'all' });
            }, 100);
          });
        }
      });
      
      // Check again after more aggressive fix
      setTimeout(() => verifyObservers(2), 800);
    }
  };

  // Initial verification
  setTimeout(() => verifyObservers(1), 500);
}

type RealtimeState = {
  isConnected: boolean;
  connectionState: string | undefined;
  lastStateChangeAt: number | null;
  channels: Array<{ topic: string; state: string }>;
};

const RealtimeContext = React.createContext<RealtimeState | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  console.debug('[SilentRejoinDebug] 🚀 REALTIME PROVIDER CONSTRUCTOR', {
    timestamp: Date.now(),
    location: 'RealtimeProvider function start'
  });
  
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  
  console.debug('[SilentRejoinDebug] 🎯 HOOKS CALLED', {
    hasQueryClient: !!queryClient,
    selectedProjectId,
    timestamp: Date.now()
  });
  
  // CRITICAL FIX: Prevent multiple RealtimeProvider instances with singleton pattern
  React.useEffect(() => {
    const now = Date.now();
    const globalManager = (window as any).__GLOBAL_REALTIME_MANAGER__;
    
    if (globalManager && globalManager.timestamp > now - 5000) {
      console.error('[RealtimeProvider] ⚠️ EXISTING MANAGER DETECTED - REUSING:', {
        existingManagerAge: now - globalManager.timestamp,
        timestamp: now
      });
      managerRef.current = globalManager.instance;
      return;
    }
    
    // Mark this as the active provider
    (window as any).__GLOBAL_REALTIME_MANAGER__ = {
      timestamp: now,
      instance: null // Will be set when manager is created
    };
    
    return () => {
      // Only cleanup if this is the current global manager
      const current = (window as any).__GLOBAL_REALTIME_MANAGER__;
      if (current && current.timestamp === now) {
        console.error('[RealtimeProvider] 🧹 CLEANING UP GLOBAL MANAGER');
        (window as any).__GLOBAL_REALTIME_MANAGER__ = null;
      }
    };
  }, []);
  
  const [state, setState] = React.useState<RealtimeState>({
    isConnected: true,
    connectionState: undefined,
    lastStateChangeAt: null,
    channels: [],
  });

  const adapterRef = React.useRef<SupabaseRealtimeAdapter | null>(null);
  const diagnosticsRef = React.useRef<DiagnosticsStore | null>(null);
  const loggerRef = React.useRef<DiagnosticsLogger | null>(null);
  const managerRef = React.useRef<ProjectChannelManager | null>(null);
  const lastHealAtRef = React.useRef<number>(0);
  const mountTimeRef = React.useRef<number>(Date.now());
  
  console.debug('[SilentRejoinDebug] 🔧 REFS CREATED', {
    hasAdapterRef: !!adapterRef,
    hasManagerRef: !!managerRef,
    hasDiagnosticsRef: !!diagnosticsRef,
    hasLoggerRef: !!loggerRef,
    timestamp: Date.now()
  });
  

  console.debug('[SilentRejoinDebug] 🏭 INITIALIZING COMPONENTS', {
    hasAdapterCurrent: !!adapterRef.current,
    hasDiagnosticsCurrent: !!diagnosticsRef.current,
    hasLoggerCurrent: !!loggerRef.current,
    hasManagerCurrent: !!managerRef.current,
    timestamp: Date.now()
  });
  
  try {
    if (!adapterRef.current) {
      console.debug('[SilentRejoinDebug] 🔌 CREATING ADAPTER');
      adapterRef.current = new SupabaseRealtimeAdapter(loggerRef.current);
      console.debug('[SilentRejoinDebug] ✅ ADAPTER CREATED', { adapter: !!adapterRef.current });
    }
    
    if (!diagnosticsRef.current) {
      console.debug('[SilentRejoinDebug] 📊 CREATING DIAGNOSTICS');
      diagnosticsRef.current = new DiagnosticsStore();
      console.debug('[SilentRejoinDebug] ✅ DIAGNOSTICS CREATED', { diagnostics: !!diagnosticsRef.current });
    }
    
    if (!loggerRef.current) {
      console.debug('[SilentRejoinDebug] 📝 CREATING LOGGER');
      loggerRef.current = new DiagnosticsLogger('RealtimeCore', runtimeConfig.RECONNECTION_LOGS_ENABLED);
      console.debug('[SilentRejoinDebug] ✅ LOGGER CREATED', { logger: !!loggerRef.current });
    }
    
    if (!managerRef.current) {
      // Check if we can reuse existing global manager
      const globalManager = (window as any).__GLOBAL_REALTIME_MANAGER__;
      if (globalManager?.instance) {
        console.error('[RealtimeProvider] ♻️ REUSING EXISTING GLOBAL MANAGER');
        managerRef.current = globalManager.instance;
        return;
      }
      
      console.error('[RealtimeProvider] 🎛️ CREATING NEW MANAGER');
      managerRef.current = new ProjectChannelManager(adapterRef.current, diagnosticsRef.current, loggerRef.current, queryClient);
      
      // Store in global singleton
      if (globalManager) {
        globalManager.instance = managerRef.current;
      }
      
      console.error('[RealtimeProvider] ✅ MANAGER CREATED AND STORED GLOBALLY');
    }
    
    console.debug('[SilentRejoinDebug] 🎉 ALL COMPONENTS INITIALIZED', {
      adapter: !!adapterRef.current,
      diagnostics: !!diagnosticsRef.current,
      logger: !!loggerRef.current,
      manager: !!managerRef.current,
      timestamp: Date.now()
    });
    
  } catch (initError) {
    console.error('[SilentRejoinDebug] 💥 COMPONENT INITIALIZATION FAILED', {
      error: initError,
      errorMessage: initError?.message,
      errorStack: initError?.stack,
      timestamp: Date.now()
    });
  }

  // REMOVED: Healing window helpers - no longer needed without query client wrapping

  // REMOVED: Query client instrumentation that was delaying invalidations
  // This was causing 800ms delays on all invalidateQueries calls during healing window
  
  // DEBUGGING: Add global health check function
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__REALTIME_HEALTH_CHECK__ = () => {
        return managerRef.current?.logHealthCheck('Manual Debug') || {};
      };
      
      // CRITICAL: Also add a simple debug function
      (window as any).__REALTIME_DEBUG__ = () => {
        const manager = managerRef.current;
        if (!manager) {
          console.warn('[ReconnectionIssue][DEBUG] No manager available');
          return { error: 'No manager' };
        }
        
        const channel = (manager as any).channel;
        if (!channel) {
          console.warn('[ReconnectionIssue][DEBUG] No channel available');
          return { error: 'No channel' };
        }
        
        const result = {
          channelTopic: channel.topic,
          channelState: channel.state,
          subscriptions: Object.keys(channel.subscriptions || {}).length,
          subscriptionKeys: Object.keys(channel.subscriptions || {}),
          bindings: Object.keys(channel.bindings || {}).length,
          bindingKeys: Object.keys(channel.bindings || {}),
          lastEventAt: (manager as any).lastEventReceivedAt || 0
        };
        
        console.warn('[ReconnectionIssue][SIMPLE_DEBUG]', result);
        return result;
      };
      
      // CRITICAL: Add React Query state debugging
      (window as any).__REACT_QUERY_DEBUG__ = () => {
        const cache = queryClient.getQueryCache();
        const queries = cache.getAll();
        const queryStates = queries.map(query => ({
          queryKey: query.queryKey,
          state: query.state.status,
          fetchStatus: query.state.fetchStatus,
          dataUpdatedAt: query.state.dataUpdatedAt,
          errorUpdatedAt: query.state.errorUpdatedAt,
          isFetching: query.state.fetchStatus === 'fetching',
          isStale: query.isStale(),
          hasData: !!query.state.data,
          observersCount: query.getObserversCount()
        }));
        
        console.warn('[ReconnectionIssue][REACT_QUERY_DEBUG]', {
          totalQueries: queries.length,
          queryStates: queryStates.slice(0, 10), // Show first 10
          timestamp: Date.now()
        });
        
        return { totalQueries: queries.length, queryStates };
      };
    }
  }, []);
  // Unified join routine: mirrors initial join (setAuth -> connect -> join)
  const rejoinLikeInitial = React.useCallback(async (forceRejoin: boolean = false) => {
    console.warn('[SilentRejoinDebug] 🚀 REJOIN ATTEMPT STARTED', {
      selectedProjectId,
      forceRejoin,
      timestamp: Date.now(),
      callStack: new Error().stack?.split('\n').slice(1, 4)
    });
    
    if (!selectedProjectId) {
      console.warn('[SilentRejoinDebug] ❌ REJOIN ABORTED - No selectedProjectId', { selectedProjectId });
      return;
    }
    
    // COMPREHENSIVE STATE SNAPSHOT before rejoin
    try {
      const socket: any = (supabase as any)?.realtime?.socket;
      const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
      const rtSnap = (typeof window !== 'undefined') ? ((window as any).__REALTIME_SNAPSHOT__ || null) : null;
      console.warn('[ReconnectionIssue][RESURRECTION] Pre-rejoin state snapshot', {
        selectedProjectId,
        socket: {
          connected: !!socket?.isConnected?.(),
          connState: socket?.connectionState,
          exists: !!socket
        },
        channels: {
          count: channels?.length || 0,
          details: (channels || []).map((c: any) => ({ topic: c.topic, state: c.state }))
        },
        diagnostics: {
          channelState: diagnosticsRef.current?.snapshot?.channelState,
          lastEventAt: diagnosticsRef.current?.snapshot?.lastEventAt,
          noBindingIncidents: diagnosticsRef.current?.snapshot?.noBindingIncidents,
          channelRecreatedCount: diagnosticsRef.current?.snapshot?.channelRecreatedCount
        },
        rtSnapshot: rtSnap,
        visibility: document.visibilityState,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[SilentRejoinDebug] ❌ ERROR in pre-rejoin snapshot', { error, timestamp: Date.now() });
    }
    
    try {
      console.warn('[SilentRejoinDebug] 📞 STEP 1: Getting session...', { timestamp: Date.now() });
      const { data: { session } } = await supabase.auth.getSession();
      console.warn('[SilentRejoinDebug] ✅ STEP 1 COMPLETE: Got session', { 
        hasSession: !!session, 
        hasToken: !!session?.access_token,
        timestamp: Date.now() 
      });
      
      console.warn('[SilentRejoinDebug] 📞 STEP 2: Setting auth...', { timestamp: Date.now() });
      
      // AUTH FLOW DEBUG: Log the token being set
      console.error('[AuthFlowDebug] 📞 SETTING AUTH TOKEN:', {
        hasToken: !!session?.access_token,
        tokenLength: session?.access_token?.length,
        tokenPrefix: session?.access_token ? session.access_token.slice(0, 20) + '...' : null,
        sessionExists: !!session,
        sessionKeys: session ? Object.keys(session) : null,
        timestamp: Date.now()
      });
      
      adapterRef.current?.setAuth(session?.access_token ?? null);
      console.warn('[SilentRejoinDebug] ✅ STEP 2 COMPLETE: Auth set', { timestamp: Date.now() });
      
      console.warn('[SilentRejoinDebug] 📞 STEP 3: Connecting adapter...', { timestamp: Date.now() });
      adapterRef.current?.connect(session?.access_token ?? null);
      console.warn('[SilentRejoinDebug] ✅ STEP 3 COMPLETE: Adapter connected', { timestamp: Date.now() });
      
      // CRITICAL FIX: Only force rejoin if channel is actually stale or unhealthy
      const currentChannelState = managerRef.current?.getChannelState?.() || 'unknown';
      const lastEventAt = managerRef.current?.getLastEventReceivedAt?.() || 0;
      const timeSinceLastEvent = lastEventAt ? Date.now() - lastEventAt : Number.POSITIVE_INFINITY;
      const isChannelStale = timeSinceLastEvent > 30000 || currentChannelState !== 'joined';
      const shouldForceRejoin = forceRejoin || isChannelStale;
      
      console.warn('[SilentRejoinDebug] 📞 STEP 4: Joining channel...', { 
        selectedProjectId, 
        currentChannelState,
        timeSinceLastEvent,
        isChannelStale,
        shouldForceRejoin,
        requestedForce: forceRejoin,
        timestamp: Date.now() 
      });
      
      await managerRef.current?.join(selectedProjectId, shouldForceRejoin);
      console.warn('[SilentRejoinDebug] ✅ STEP 4 COMPLETE: Channel joined', { 
        forcedRejoin: shouldForceRejoin,
        timestamp: Date.now() 
      });
      
      // Clear healing-in-progress flag on successful completion
      if (typeof window !== 'undefined') {
        (window as any).__HEALING_IN_PROGRESS__ = false;
        (window as any).__HEALING_START_TIME__ = 0;
        console.error('[RealtimeCorruptionTrace] ✅ HEALING COMPLETED SUCCESSFULLY');
      }
      
      console.warn('[SilentRejoinDebug] 📞 STEP 5: Taking post-rejoin snapshot...', { timestamp: Date.now() });
      // POST-REJOIN STATE SNAPSHOT
      try {
        const socket: any = (supabase as any)?.realtime?.socket;
        const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
        const channelHealthCheck = managerRef.current?.getDetailedHealthCheck?.() || {};
        
        console.warn('[ReconnectionIssue][RESURRECTION] 🔍 COMPREHENSIVE STATE SNAPSHOT - POST RESUME', {
          selectedProjectId,
          socket: {
            connected: !!socket?.isConnected?.(),
            connState: socket?.connectionState,
            exists: !!socket
          },
          channels: {
            count: channels?.length || 0,
            details: (channels || []).map((c: any) => ({ topic: c.topic, state: c.state }))
          },
          diagnostics: {
            channelState: diagnosticsRef.current?.snapshot?.channelState,
            lastEventAt: diagnosticsRef.current?.snapshot?.lastEventAt
          },
          channelHealthCheck,
          visibility: document.visibilityState,
          timestamp: Date.now()
        });
        console.warn('[SilentRejoinDebug] ✅ STEP 5 COMPLETE: Post-rejoin snapshot taken', { timestamp: Date.now() });
      } catch (snapshotError) {
        console.error('[SilentRejoinDebug] ❌ ERROR in post-rejoin snapshot', { 
          error: snapshotError, 
          timestamp: Date.now() 
        });
      }
      
      console.warn('[SilentRejoinDebug] 🎉 REJOIN COMPLETED SUCCESSFULLY', { 
        selectedProjectId,
        timestamp: Date.now() 
      });
      
    } catch (rejoinError) {
      console.error('[SilentRejoinDebug] 💥 CRITICAL ERROR in rejoin process', { 
        error: rejoinError,
        errorMessage: rejoinError?.message,
        errorStack: rejoinError?.stack,
        selectedProjectId,
        timestamp: Date.now()
      });
    }
  }, [selectedProjectId]);

  // Reflect diagnostics to provider state
  React.useEffect(() => {
    console.debug('[SilentRejoinDebug] 🏗️ REALTIME PROVIDER MOUNTING', {
      selectedProjectId,
      hasAdapter: !!adapterRef.current,
      hasManager: !!managerRef.current,
      hasDiagnostics: !!diagnosticsRef.current,
      timestamp: Date.now()
    });
    
    loggerRef.current?.info('[ReconnectionIssue][Initiation] Provider mount');
    const diagnostics = diagnosticsRef.current!;
    const adapter = adapterRef.current!;
    const sync = () => {
      const channels = (adapter.getChannels() || []).map((c: any) => ({ topic: c.topic, state: c.state }));
      const channelState = diagnostics.snapshot.channelState;
      setState((prev) => ({
        isConnected: channelState === 'joined',
        connectionState: channelState,
        lastStateChangeAt: prev.connectionState !== channelState ? Date.now() : prev.lastStateChangeAt,
        channels,
      }));
      // Expose minimal realtime snapshot for polling heuristics
      try {
        (window as any).__REALTIME_SNAPSHOT__ = {
          channelState: diagnostics.snapshot.channelState,
          lastEventAt: diagnostics.snapshot.lastEventAt,
          channelRecreatedCount: diagnostics.snapshot.channelRecreatedCount,
          noBindingIncidents: diagnostics.snapshot.noBindingIncidents,
          channels,
          ts: Date.now(),
        };
      } catch {}
    };
    sync();
    const unsub = diagnostics.subscribe(sync);
    const interval = window.setInterval(sync, 5000);
    return () => { unsub(); window.clearInterval(interval); };
  }, []);

  // Join/leave on project changes
  React.useEffect(() => {
    const adapter = adapterRef.current!;
    const manager = managerRef.current!;
    let cancelled = false;
    (async () => {
      try {
        if (!selectedProjectId) {
          loggerRef.current?.info('[ReconnectionIssue][AppInteraction] Leaving channel due to null project');
          await manager.leave();
          return;
        }
        loggerRef.current?.info('[ReconnectionIssue][AppInteraction] Joining project channel', { selectedProjectId });
        const { data: { session } } = await supabase.auth.getSession();
        adapter.setAuth(session?.access_token ?? null);
        await adapter.connect(session?.access_token ?? null);
        if (!cancelled) {
          await manager.join(selectedProjectId);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  // Observer monitoring during background state
  React.useEffect(() => {
    let observerMonitor: number;
    
    const monitorObservers = () => {
      const visibilityState = VisibilityManager.getState();
      if (!visibilityState.isVisible) {
        const queries = queryClient.getQueryCache().getAll().slice(0, 3);
        const observerStates = queries.map(q => ({
          key: q.queryKey.slice(0, 2),
          observers: q.getObserversCount()
        }));
        
        // Only log if we detect observer loss during background
        const hasObservers = observerStates.some(q => q.observers > 0);
        if (!hasObservers && observerStates.length > 0) {
          console.error('[ReconnectionIssue][OBSERVER_LOSS_DETECTED]', {
            reason: 'All observers lost during tab background state - likely GC occurred',
            queryStates: observerStates,
            visibilityState: visibilityState.visibilityState,
            timestamp: Date.now()
          });
        }
      }
    };
    
    // Monitor every 2 seconds during background (will be throttled by browser)
    observerMonitor = setInterval(() => {
      const startTime = performance.now();
      monitorObservers();
      const endTime = performance.now();
      
      // Log if execution is severely delayed (indicating browser throttling)
      if (endTime - startTime > 100) {
        const visibilityState = VisibilityManager.getState();
        console.error('[ReconnectionIssue][BROWSER_THROTTLING]', {
          reason: 'Background execution severely throttled - may indicate aggressive resource management',
          executionTime: endTime - startTime,
          visibilityState: visibilityState.visibilityState,
          timestamp: Date.now()
        });
      }
    }, 2000) as any;
    
    return () => {
      if (observerMonitor) clearInterval(observerMonitor);
    };
  }, [queryClient]);

  // Visibility & auth-heal recovery using VisibilityManager
  React.useEffect(() => {
    const handleVisibilityEvents = async (signals: VisibilitySignals, eventType: VisibilityEventType, event: Event) => {
      const now = Date.now();

      if (eventType === 'visibilitychange') {
        if (signals.justBecameVisible) {
          // IMMEDIATE DIAGNOSTIC - This should always show up
          console.error('🚨🚨🚨 [TabReactivation] TAB BECOMING VISIBLE - STARTING DIAGNOSTICS 🚨🚨🚨');
          
          // CRITICAL: Log WebSocket state after tab resume
          const socketState = (window as any).supabase?.realtime?.socket?.readyState;
          const socketUrl = (window as any).supabase?.realtime?.socket?.url;
          console.error('[WebSocketDebug] 🔍 COMPLETE WEBSOCKET STATE AFTER TAB RESUME:', {
            timestamp: now,
            visibilityState: signals.visibilityState,
            socket: {
              exists: !!(window as any).supabase?.realtime?.socket,
              readyState: socketState,
              readyStateText: socketState === 0 ? 'CONNECTING' : socketState === 1 ? 'OPEN' : socketState === 2 ? 'CLOSING' : socketState === 3 ? 'CLOSED' : `UNKNOWN(${socketState})`,
              url: socketUrl?.slice(0, 100),
              binaryType: (window as any).supabase?.realtime?.socket?.binaryType,
              protocol: (window as any).supabase?.realtime?.socket?.protocol,
              bufferedAmount: (window as any).supabase?.realtime?.socket?.bufferedAmount
            },
            connection: {
              isConnected: (window as any).supabase?.realtime?.isConnected?.(),
              channels: (window as any).supabase?.realtime?.channels ? Object.keys((window as any).supabase.realtime.channels).length : 0,
              activeChannels: (window as any).supabase?.realtime?.channels ? Object.values((window as any).supabase.realtime.channels).filter((ch: any) => ch?.state === 'joined').length : 0
            },
            browser: {
              onLine: navigator.onLine,
              connectionType: (navigator as any).connection?.effectiveType,
              userAgent: navigator.userAgent.slice(0, 50)
            },
            networkStatusManager: (() => {
              try {
                const { getNetworkStatusManager } = require('@/shared/lib/NetworkStatusManager');
                const manager = getNetworkStatusManager();
                const status = manager.getStatus();
                return {
                  isOnline: status.isOnline,
                  effectiveType: status.connection.effectiveType,
                  connectionQuality: manager.getConnectionQuality(),
                  lastTransitionAt: status.lastTransitionAt
                };
              } catch {
                return { error: 'NetworkStatusManager not available' };
              }
            })()
          });
          
          // CRITICAL: Add browser memory pressure detection
          if (typeof window !== 'undefined' && 'performance' in window) {
            const memoryInfo = (performance as any).memory;
            if (memoryInfo) {
              console.error('[ReconnectionIssue][MEMORY_PRESSURE]', {
                reason: 'Checking if browser memory pressure caused observer GC',
                usedJSHeapSize: memoryInfo.usedJSHeapSize,
                totalJSHeapSize: memoryInfo.totalJSHeapSize,
                jsHeapSizeLimit: memoryInfo.jsHeapSizeLimit,
                memoryPressure: memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit > 0.8,
                timestamp: now
              });
            }
          }
          
          if (!selectedProjectId) return;
          if (now - lastHealAtRef.current < 3000) return; // minimal debounce
          lastHealAtRef.current = now;
          
          // CRITICAL: Signal React components that tab is becoming visible
          console.warn('[ReconnectionIssue][REACT_STATE_DEBUG]', {
            event: 'TAB_VISIBLE',
            reason: 'Tab becoming visible - React components may have stale state',
            selectedProjectId,
            timestamp: now
          });
          
          // CRITICAL DEBUG: Capture React Query observer state IMMEDIATELY after tab resume
          const immediateQueryState = queryClient.getQueryCache().getAll().slice(0, 5).map(q => ({
            key: q.queryKey.slice(0, 3),
            observers: q.getObserversCount(),
            status: q.state.status,
            lastUpdated: q.state.dataUpdatedAt
          }));
          console.error('[TabReactivation] Observer state immediately after tab resume', {
            reason: 'Observer state captured immediately after tab resume - before any processing',
            queryStates: immediateQueryState,
            timestamp: now
          });
          
          // Dispatch event for components to listen to
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('debug:tab-visible', { 
              detail: { timestamp: now, selectedProjectId } 
            }));
          }
          
          // Only rejoin if channel is not already healthy
          const currentChannelState = managerRef.current?.getChannelState?.() || 'unknown';
          const shouldRejoin = currentChannelState !== 'joined';
          
          console.warn('[TabReactivation] 🔍 VISIBILITY RECOVERY DECISION:', {
            currentChannelState,
            shouldRejoin,
            reason: shouldRejoin ? 'channel not joined' : 'channel already healthy',
            timestamp: Date.now()
          });
          
          if (shouldRejoin) {
            console.warn('[TabReactivation] 🚀 TRIGGERING REJOIN - Channel needs healing');
            // Pass true to force rejoin on visibility recovery (tab resume scenario)
            await rejoinLikeInitial(true);
          } else {
            console.warn('[TabReactivation] ✅ SKIPPING REJOIN - Channel already healthy');
          }
          
          // CRITICAL FIX: Force refetch instead of just invalidate to ensure UI updates after tab resume
          if (selectedProjectId) {
            console.warn('[TabReactivation] 🔄 FORCE REFETCH key queries for guaranteed UI updates', {
              selectedProjectId,
              timestamp: Date.now()
            });
            
            // FORCE REFETCH (not just invalidate) to guarantee UI updates
            queryClient.refetchQueries({ queryKey: ['unified-generations', 'project', selectedProjectId], type: 'active' });
            queryClient.refetchQueries({ queryKey: ['task-status-counts', selectedProjectId], type: 'active' });
            queryClient.refetchQueries({ queryKey: ['tasks', 'paginated', selectedProjectId], type: 'active' });
            
            // Also invalidate for good measure
            queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId] });
            queryClient.invalidateQueries({ queryKey: ['task-status-counts', selectedProjectId] });
            queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
            
            console.warn('[TabReactivation] ✅ Forced refetch completed - UI should update now', {
              selectedProjectId,
              timestamp: Date.now()
            });
          }

          console.warn('[TabReactivation] 🟢 Tab resume complete - normal operations active', {
            timestamp: Date.now()
          });
        } else if (signals.justHidden) {
          // IMMEDIATE DIAGNOSTIC - This should always show up
          console.error('🚨🚨🚨 [TabReactivation] TAB BECOMING HIDDEN - CAPTURING BASELINE 🚨🚨🚨');
          // CRITICAL: Log WebSocket state before tab hide
          const socketState = (window as any).supabase?.realtime?.socket?.readyState;
          const socketUrl = (window as any).supabase?.realtime?.socket?.url;
          console.error('[ReconnectionIssue] 🔍 WEBSOCKET STATE BEFORE TAB HIDE:', {
            socketExists: !!(window as any).supabase?.realtime?.socket,
            socketState,
            socketStateText: socketState === 0 ? 'CONNECTING' : socketState === 1 ? 'OPEN' : socketState === 2 ? 'CLOSING' : socketState === 3 ? 'CLOSED' : 'UNKNOWN',
            socketUrl,
            timestamp: now
          });
          
          // CRITICAL DEBUG: Capture React Query observer state BEFORE tab hide
          const preHideQueryState = queryClient.getQueryCache().getAll().slice(0, 5).map(q => ({
            key: q.queryKey.slice(0, 3),
            observers: q.getObserversCount(),
            status: q.state.status,
            lastUpdated: q.state.dataUpdatedAt
          }));
          console.error('[TabReactivation] Observer state before tab hide', {
            reason: 'Observer state captured immediately before tab hide - baseline for comparison',
            queryStates: preHideQueryState,
            timestamp: now
          });
          // COMPREHENSIVE STATE SNAPSHOT on tab hide
          try {
            const socket: any = (supabase as any)?.realtime?.socket;
            const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
            const rtSnap = (typeof window !== 'undefined') ? ((window as any).__REALTIME_SNAPSHOT__ || null) : null;
            const channelHealthCheck = managerRef.current?.getDetailedHealthCheck?.() || {};
            
            console.warn('[ReconnectionIssue][TAB_HIDE] 🔍 COMPREHENSIVE STATE SNAPSHOT - PRE HIDE', {
              selectedProjectId,
              socket: {
                connected: !!socket?.isConnected?.(),
                connState: socket?.connectionState,
                exists: !!socket
              },
              channels: {
                count: channels?.length || 0,
                details: (channels || []).map((c: any) => ({ topic: c.topic, state: c.state }))
              },
              diagnostics: {
                channelState: diagnosticsRef.current?.snapshot?.channelState,
                lastEventAt: diagnosticsRef.current?.snapshot?.lastEventAt
              },
              rtSnapshot: rtSnap,
              channelHealthCheck,
              visibility: signals.visibilityState,
              timestamp: now
            });
            
            // CRITICAL: Signal to React components that tab is being hidden
            console.warn('[ReconnectionIssue][REACT_STATE_DEBUG]', {
              event: 'TAB_HIDE',
              reason: 'Tab being hidden - React components should prepare for state sync issues',
              timestamp: now
            });
            
            // Dispatch event for components to listen to
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('debug:tab-hide', { 
                detail: { timestamp: now, selectedProjectId } 
              }));
            }
          } catch {}
        }
      } else if (eventType === 'pageshow') {
        // COMPREHENSIVE STATE SNAPSHOT on pageshow
        try {
          const socket: any = (supabase as any)?.realtime?.socket;
          const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
          console.warn('[ReconnectionIssue][PAGE_SHOW] State snapshot on pageshow', {
            selectedProjectId,
            socket: {
              connected: !!socket?.isConnected?.(),
              connState: socket?.connectionState,
              exists: !!socket
            },
            channels: {
              count: channels?.length || 0,
              details: (channels || []).map((c: any) => ({ topic: c.topic, state: c.state }))
            },
            diagnostics: {
              channelState: diagnosticsRef.current?.snapshot?.channelState,
              lastEventAt: diagnosticsRef.current?.snapshot?.lastEventAt
            },
            visibility: signals.visibilityState,
            timestamp: now
          });
        } catch {}
        try { loggerRef.current?.info('[ReconnectionIssue][Visibility] pageshow'); } catch {}
      } else if (eventType === 'pagehide') {
        // COMPREHENSIVE STATE SNAPSHOT on pagehide
        try {
          const socket: any = (supabase as any)?.realtime?.socket;
          const channels = (supabase as any)?.getChannels ? (supabase as any).getChannels() : [];
          console.warn('[ReconnectionIssue][PAGE_HIDE] State snapshot on pagehide', {
            selectedProjectId,
            socket: {
              connected: !!socket?.isConnected?.(),
              connState: socket?.connectionState,
              exists: !!socket
            },
            channels: {
              count: channels?.length || 0,
              details: (channels || []).map((c: any) => ({ topic: c.topic, state: c.state }))
            },
            diagnostics: {
              channelState: diagnosticsRef.current?.snapshot?.channelState,
              lastEventAt: diagnosticsRef.current?.snapshot?.lastEventAt
            },
            visibility: signals.visibilityState,
            timestamp: now
          });
        } catch {}
        try { loggerRef.current?.info('[ReconnectionIssue][Visibility] pagehide'); } catch {}
      }
    };

    const onAuthHeal = async () => {
      try { loggerRef.current?.info('[ReconnectionIssue][Auth] auth-heal event received'); } catch {}
      const now = Date.now();
      if (now - lastHealAtRef.current < 3000) return; // minimal debounce
      lastHealAtRef.current = now;
      await rejoinLikeInitial(false);
    };

    // Subscribe to VisibilityManager for unified event handling
    const subscriptionId = VisibilityManager.subscribe(handleVisibilityEvents, {
      id: 'realtime-provider',
      eventTypes: ['visibilitychange', 'pageshow', 'pagehide']
    });

    // Keep auth-heal listener as it's not a visibility event
    window.addEventListener('realtime:auth-heal', onAuthHeal as any);
    
    return () => {
      VisibilityManager.unsubscribe(subscriptionId);
      window.removeEventListener('realtime:auth-heal', onAuthHeal as any);
    };
  }, [selectedProjectId, rejoinLikeInitial, queryClient]);

  // Watchdog: if not joined, perform the same join routine
  React.useEffect(() => {
    const diagnostics = diagnosticsRef.current!;
    const tick = async () => {
      const diag = diagnostics.snapshot;
      const channelState = diag.channelState;
      const now = Date.now();
      
      console.warn('[SilentRejoinDebug] 🔍 WATCHDOG TICK', {
        selectedProjectId: !!selectedProjectId,
        channelState,
        lastHealAt: lastHealAtRef.current,
        timeSinceLastHeal: now - lastHealAtRef.current,
        timestamp: now
      });
      
      if (!selectedProjectId) {
        console.warn('[SilentRejoinDebug] ⏭️ WATCHDOG SKIP - No selectedProjectId');
        return;
      }
      
      if (channelState === 'joining') {
        console.warn('[SilentRejoinDebug] ⏭️ WATCHDOG SKIP - Channel joining, letting it settle');
        return; // let it settle
      }
      
      if (channelState !== 'joined') {
        const since = now - lastHealAtRef.current;
        
        // Prevent healing during initial connection phase (first 10 seconds)
        const timeSinceMount = now - (mountTimeRef.current || now);
        const isInitialConnectionPhase = timeSinceMount < 10000;
        
        console.warn('[SilentRejoinDebug] 🚨 WATCHDOG DETECTED NOT JOINED', {
          channelState,
          timeSinceLastHeal: since,
          timeSinceMount,
          isInitialConnectionPhase,
          willTriggerRejoin: since > 3000 && !isInitialConnectionPhase,
          timestamp: now
        });
        
        if (since > 3000 && !isInitialConnectionPhase) {
          lastHealAtRef.current = now;
          try { 
            loggerRef.current?.warn('[ReconnectionIssue][Watchdog] Not joined → rejoining (simplified)'); 
          } catch {}
          
          console.warn('[SilentRejoinDebug] 🚀 WATCHDOG TRIGGERING REJOIN', { timestamp: now });
          try {
            // Watchdog rejoin - let the manager decide if force is needed based on staleness
            await rejoinLikeInitial(false);
            console.warn('[SilentRejoinDebug] ✅ WATCHDOG REJOIN COMPLETED', { timestamp: Date.now() });
          } catch (watchdogError) {
            console.error('[SilentRejoinDebug] 💥 WATCHDOG REJOIN FAILED', { 
              error: watchdogError,
              errorMessage: watchdogError?.message,
              timestamp: Date.now() 
            });
          }
        }
      } else {
        console.warn('[SilentRejoinDebug] ✅ WATCHDOG OK - Channel joined', { channelState, timestamp: now });
      }
    };
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [selectedProjectId, rejoinLikeInitial]);

  return (
    <RealtimeContext.Provider value={state}>
      <TaskInvalidationSubscriber>
        {children}
      </TaskInvalidationSubscriber>
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) return { isConnected: runtimeConfig.REALTIME_ENABLED !== false, connectionState: 'unknown', lastStateChangeAt: null, channels: [] };
  return ctx;
}


