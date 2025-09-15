import type { ChannelRef } from './SupabaseRealtimeAdapter';
import { SupabaseRealtimeAdapter } from './SupabaseRealtimeAdapter';
import { DiagnosticsLogger, DiagnosticsStore } from './Diagnostics';
import type { QueryClient } from '@tanstack/react-query';
import { routeEvent } from '@/shared/lib/InvalidationRouter';

// CRITICAL: Verify this file is loaded
console.info('[ReconnectionIssue] 🔥 PROJECT CHANNEL MANAGER FILE LOADED AT:', new Date().toISOString());
// Removed ensureWebSocketReady import - it was causing infinite loops

export type ChannelState = 'closed' | 'joining' | 'joined' | 'leaving' | 'errored' | 'unknown';

export function buildTaskUpdatesTopic(projectId: string) {
  return `task-updates:${projectId}`;
}

export class ProjectChannelManager {
  private adapter: SupabaseRealtimeAdapter;
  private diagnostics: DiagnosticsStore;
  private logger: DiagnosticsLogger;
  private queryClient: QueryClient;
  private channel: ChannelRef | null = null;
  private projectId: string | null = null;
  private handlersAttached = false;
  private lastJoinRef: string | null = null;
  private lastEventReceivedAt: number = 0;
  private channelCreatedAt: number = 0;
  private eventSequence: number = 0;
  // Quick-win guards to prevent concurrent/thrashing joins
  private joinInProgress: boolean = false;
  private lastJoinAttemptAt: number = 0;
  private readonly joinThrottleMs: number = 1000;
  
  // Health window for determining if channel is healthy based on recent events
  private readonly HEALTHY_EVENT_WINDOW_MS = 30_000; // 30 seconds

  // COMPREHENSIVE HEALTH CHECK
  getDetailedHealthCheck(): any {
    const channel = this.channel as any;
    const now = Date.now();
    
    return {
      // Basic State
      channelExists: !!this.channel,
      channelState: channel?.state || 'no-channel',
      projectId: this.projectId,
      handlersAttached: this.handlersAttached,
      
      // Bindings Analysis: DISABLED - Was accessing bindings and causing corruption
      bindingsCount: 0,
      
      // Event Flow
      eventTracking: {
        lastEventAt: this.lastEventReceivedAt,
        timeSinceLastEvent: this.lastEventReceivedAt ? now - this.lastEventReceivedAt : 'never',
        eventSequence: this.eventSequence,
        channelAge: this.channelCreatedAt ? now - this.channelCreatedAt : 0
      },
      
      // Channel Details
      channelDetails: {
        topic: channel?.topic,
        joinRef: this.lastJoinRef,
        ref: channel?.ref,
        timeout: channel?.timeout,
        state: channel?.state,
        params: channel?.params
      },
      
      // Supabase Connection
      supabaseState: this.adapter.getGlobalRealtimeState?.() || {},
      
      // Internal Subscriptions
      internalState: {
        subscriptions: channel?.subscriptions ? Object.keys(channel.subscriptions).length : 0,
        subscriptionKeys: channel?.subscriptions ? Object.keys(channel.subscriptions).slice(0, 5) : [],
        subscriptionDetails: channel?.subscriptions ? Object.entries(channel.subscriptions).slice(0, 3).map(([key, sub]: [string, any]) => ({
          key,
          table: sub?.config?.table,
          event: sub?.config?.event,
          filter: sub?.config?.filter
        })) : [],
        push: !!channel?.push,
        leave: !!channel?.leave,
        subscribe: !!channel?.subscribe,
        unsubscribe: !!channel?.unsubscribe
      },
      
      timestamp: now
    };
  }

  // MANUAL HEALTH CHECK for debugging
  logHealthCheck(label: string = 'Manual Check') {
    const healthCheck = this.getDetailedHealthCheck();
    console.warn(`[ReconnectionIssue][HEALTH_CHECK_${label.toUpperCase().replace(/\s+/g, '_')}]`, healthCheck);
    
    // CRITICAL: Also log the key details separately for debugging
    console.warn('[ReconnectionIssue][HEALTH_DETAILS]', {
      subscriptions: healthCheck.internalState?.subscriptions || 0,
      subscriptionDetails: healthCheck.internalState?.subscriptionDetails || [],
      eventTracking: healthCheck.eventTracking || {},
      channelState: healthCheck.channelState,
      bindingsCount: healthCheck.bindingsCount,
      lastEventAt: healthCheck.eventTracking?.lastEventAt || 0
    });
    
    return healthCheck;
  }

  constructor(adapter: SupabaseRealtimeAdapter, diagnostics: DiagnosticsStore, logger: DiagnosticsLogger, queryClient: QueryClient) {
    this.adapter = adapter;
    this.diagnostics = diagnostics;
    this.logger = logger;
    this.queryClient = queryClient;
  }

  getChannelState(): ChannelState { return (this.channel as any)?.state || 'unknown'; }
  getBindingsCount(): number { 
    // DISABLED: Was accessing bindings and causing corruption
    return 0;
  }
  getLastEventReceivedAt(): number { return this.lastEventReceivedAt || 0; }

  async join(projectId: string, forceRejoin: boolean = false) {
    const now = Date.now();
    const topic = buildTaskUpdatesTopic(projectId);
    const sameProject = this.projectId === projectId;
    const state = (this.channel as any)?.state;
    const timeSinceLastEvent = this.lastEventReceivedAt ? now - this.lastEventReceivedAt : Number.POSITIVE_INFINITY;
    
    console.error('[JoinGuard] 🔍 JOIN ATTEMPT:', {
      projectId,
      forceRejoin,
      sameProject,
      currentState: state,
      timeSinceLastEvent,
      joinInProgress: this.joinInProgress,
      timestamp: now
    });
    
    if (!projectId) {
      this.logger.error('[JoinGuard] ❌ ABORTED - No projectId', { projectId });
      return;
    }
    
    // CRITICAL FIX: Early dedupe based on health (joined + recent events)
    if (sameProject && this.channel && state === 'joined' && timeSinceLastEvent < this.HEALTHY_EVENT_WINDOW_MS) {
      console.error('[JoinDedupe] ✅ HEALTHY CHANNEL - skipping rejoin', {
        reason: 'healthy',
        state,
        timeSinceLastEvent,
        healthyThreshold: this.HEALTHY_EVENT_WINDOW_MS,
        topic,
        timestamp: now
      });
      return;
    }
    
    // CRITICAL FIX: Skip if already joined/joining unless explicitly stale or forced
    if (!forceRejoin && sameProject && this.channel && (state === 'joined' || state === 'joining')) {
      console.error('[JoinDedupe] ⏭️ ALREADY JOINED/JOINING - skipping', {
        reason: 'already-active',
        state,
        timeSinceLastEvent,
        topic,
        timestamp: now
      });
      return;
    }
    
    // CRITICAL FIX: Check throttle and lock BEFORE setting any state
    const elapsedSinceLastJoin = now - this.lastJoinAttemptAt;
    if (!forceRejoin && (this.joinInProgress || elapsedSinceLastJoin < this.joinThrottleMs)) {
      console.error('[JoinGuard] ⏸️ THROTTLED OR IN PROGRESS - skipping', {
        reason: this.joinInProgress ? 'in-progress' : 'throttled',
        elapsedMs: elapsedSinceLastJoin,
        throttleMs: this.joinThrottleMs,
        joinInProgress: this.joinInProgress,
        timestamp: now
      });
      return;
    }
    
    // CRITICAL FIX: Only NOW acquire lock and set timestamp
    this.joinInProgress = true;
    this.lastJoinAttemptAt = now;
    
    console.error('[JoinGuard] 🔒 LOCK ACQUIRED - proceeding with join', {
      topic,
      forceRejoin,
      previousState: state,
      timestamp: now
    });
    
    try {
    
    // CRITICAL: Ensure WebSocket is ready before attempting channel operations
    this.logger.warn('[ReconnectionIssue][WEBSOCKET_READINESS_CHECK]', {
      projectId,
      reason: 'Ensuring WebSocket exists before channel subscription',
      timestamp: Date.now()
    });
    
    // CRITICAL: Don't wait for WebSocket - Supabase creates it lazily during subscription
    this.logger.warn('[ReconnectionIssue][WEBSOCKET_LAZY_CREATION]', {
      projectId,
      topic,
      reason: 'WebSocket will be created by Supabase during channel subscription',
      timestamp: Date.now()
    });
    
    // CRITICAL: Log the join context to understand initial vs reconnection
    const isReconnection = this.handlersAttached || this.projectId !== null;
    const existingChannelState = this.channel ? (this.channel as any)?.state : null;
    const existingBindings = this.channel ? this.getBindingsCount() : 0;
    
    this.logger.warn('[ReconnectionIssue][JOIN_CONTEXT]', {
      topic, 
      forceRejoin,
      isReconnection,
      previousProjectId: this.projectId,
      handlersAttached: this.handlersAttached,
      existingChannelState,
      existingBindings,
      isInitialConnection: !isReconnection,
      channelExists: !!this.channel,
      timestamp: Date.now()
    });
    
    // DIAGNOSTIC: Track the difference between initial and reconnection
    if (!isReconnection) {
      this.logger.warn('[ReconnectionIssue][INITIAL_CONNECTION_PATH]', {
        reason: 'This is the initial connection - should work',
        topic,
        forceRejoin,
        timestamp: Date.now()
      });
    } else {
      this.logger.warn('[ReconnectionIssue][RECONNECTION_PATH]', {
        reason: 'This is a reconnection - historically fails',
        topic,
        forceRejoin,
        existingChannelState,
        existingBindings,
        timestamp: Date.now()
      });
    }
    
    this.logger.info('[ReconnectionIssue][Initiation] join()', { topic, forceRejoin });
    
    // Don't kill channels that are already working or trying to work
    if (this.projectId === projectId && this.channel) {
      const existingTopic = String((this.channel as any).topic || '');
      const matches = existingTopic === topic || existingTopic.endsWith(`:${topic}`) || existingTopic.endsWith(topic);
      if (matches) {
        const state = (this.channel as any).state;
        const bindingsCount = this.getBindingsCount();
        
        // CRITICAL FIX: Use event freshness instead of bindings for health check
        const isJoined = state === 'joined';
        const hasRecentEvents = timeSinceLastEvent < this.HEALTHY_EVENT_WINDOW_MS;
        const isHealthy = isJoined && hasRecentEvents;
        
        console.error('[StalenessCheck] 🔍 CHANNEL HEALTH EVALUATION:', {
          state,
          timeSinceLastEvent,
          healthyThreshold: this.HEALTHY_EVENT_WINDOW_MS,
          isJoined,
          hasRecentEvents,
          isHealthy,
          forceRejoin,
          decision: isHealthy && !forceRejoin ? 'skip-recreation' : 'proceed-recreation',
          channelTopic: (this.channel as any)?.topic,
          timestamp: now
        });
        
        // Skip recreation if healthy and not forced
        if (isHealthy && !forceRejoin) {
          console.error('[JoinDedupe] ✅ CHANNEL HEALTHY - skipping recreation', {
            reason: 'healthy-with-recent-events',
            state,
            timeSinceLastEvent,
            hasRecentEvents,
            timestamp: now
          });
          return;
        }
        
        // Log why we're proceeding with recreation
        if (forceRejoin) {
          console.error('[JoinDedupe] 🔄 FORCE REJOIN - recreating channel', {
            reason: 'force-requested',
            state,
            timeSinceLastEvent,
            timestamp: now
          });
        } else if (!hasRecentEvents) {
          console.error('[JoinDedupe] 🔄 STALE CHANNEL - recreating', {
            reason: 'stale-events',
            state,
            timeSinceLastEvent,
            healthyThreshold: this.HEALTHY_EVENT_WINDOW_MS,
            timestamp: now
          });
        }
        
        if (!forceRejoin && (state === 'joined' || state === 'joining')) {
          this.logger.debug('Channel already joined/joining - not interrupting', { expected: topic, actual: existingTopic, state });
          return;
        }
      }
    }
    
    // Log why we're proceeding with join
    if (forceRejoin) {
      this.logger.warn('[ReconnectionIssue][Initiation] Force rejoin requested - will recreate channel', { 
        topic,
        reason: 'Channel was not healthy or forceRejoin=true',
        timestamp: Date.now()
      });
    } else {
      this.logger.warn('[ReconnectionIssue][Initiation] Normal join - creating new channel', { 
        topic,
        reason: 'No existing channel or normal join',
        timestamp: Date.now()
      });
    }

    await this.leave();

    // CRITICAL FIX: Reset handlers flag so they get reattached properly on force rejoin
    if (forceRejoin) {
      this.handlersAttached = false;
      this.logger.warn('[ReconnectionIssue][FORCE_REJOIN_RESET]', {
        topic,
        resetHandlersFlag: true,
        timestamp: Date.now()
      });
    }

    this.projectId = projectId;
    
    // CRITICAL: Log channel creation details
    this.logger.warn('[ReconnectionIssue][CHANNEL_CREATION]', {
      topic,
      adapterType: typeof this.adapter,
      timestamp: Date.now()
    });
    
    this.channel = await this.adapter.channel(topic);
    this.handlersAttached = false;
    this.channelCreatedAt = Date.now();
    this.eventSequence = 0;
    this.lastEventReceivedAt = 0;
    
    // CRITICAL FIX: Attach handlers IMMEDIATELY after channel creation (like recreateChannel does)
    if (forceRejoin) {
      this.logger.warn('[ReconnectionIssue][IMMEDIATE_HANDLER_ATTACH]', {
        topic,
        reason: 'Force rejoin - attaching handlers before subscribe',
        timestamp: Date.now()
      });
      this.attachHandlersOnce();
    }
    
    // IMMEDIATE post-creation inspection
    const immediateBindings = this.getBindingsCount();
    const channelProps = this.channel ? Object.keys(this.channel as any).slice(0, 10) : [];
    
    this.logger.warn('[ReconnectionIssue][CHANNEL_POST_CREATION]', {
      topic,
      immediateBindings,
      channelState: (this.channel as any)?.state,
      channelProps,
      handlersAlreadyAttached: this.handlersAttached,
      timestamp: Date.now()
    });
    
    // CRITICAL FIX: Subscribe without callback like the working recreateChannel method
    // CRITICAL: Log WebSocket state at top level
    const socketState = (this.channel as any)?.socket?.readyState;
    const socketUrl = (this.channel as any)?.socket?.url;
    const channelState = (this.channel as any)?.state;
    
    console.error('🚨 WEBSOCKET STATE CHECK:', {
      socketState,
      socketUrl,
      channelState,
      socketStateText: socketState === 0 ? 'CONNECTING' : socketState === 1 ? 'OPEN' : socketState === 2 ? 'CLOSING' : socketState === 3 ? 'CLOSED' : 'UNKNOWN',
      timestamp: Date.now()
    });
    
    this.logger.warn('[ReconnectionIssue][SUBSCRIPTION_ATTEMPT]', {
      topic: this.channel.topic,
      channelState,
      socketState,
      socketUrl,
      timestamp: Date.now()
    });
    
    // CRITICAL: Log WebSocket state before and after subscribe() call
    console.error('[ReconnectionIssue] 🔥 BEFORE SUBSCRIBE() - WEBSOCKET STATE:', {
      socketExists: !!(this.channel as any)?.socket,
      socketState: (this.channel as any)?.socket?.readyState,
      realtimeSocketExists: !!((window as any)?.supabase?.realtime?.socket),
      realtimeSocketState: (window as any)?.supabase?.realtime?.socket?.readyState,
      timestamp: Date.now()
    });
    
    // CRITICAL FIX: Attach handlers BEFORE subscribe() so they can be bound to server
    if (!this.handlersAttached) {
      console.error('[ReconnectionIssue] 🔥 ATTACHING HANDLERS BEFORE SUBSCRIBE');
      this.attachHandlersOnce();
    }
    
    // PHOENIX CHANNEL DIAGNOSTIC: Track state transitions to understand stuck channels
    const channelRef = this.channel as any;
    const originalState = channelRef.state;
    
    this.logger.warn('[PHOENIX_SUBSCRIBE_START]', {
      initialChannelState: originalState,
      socketState: channelRef.socket?.readyState,
      socketConnected: channelRef.socket?.isConnected?.(),
      channelTopic: channelRef.topic,
      channelRef: channelRef.ref,
      joinRef: channelRef.joinRef,
      pushBuffer: channelRef.pushBuffer?.length || 0,
      bindings: Object.keys(channelRef.bindings || {}).length,
      timestamp: Date.now()
    });

    // COMPREHENSIVE SESSION STATE INVESTIGATION
    this.logger.error('[AuthSessionDebug] 🔍 COMPLETE SESSION STATE:', {
      hasSupabase: !!(window as any).supabase,
      hasAuth: !!(window as any).supabase?.auth,
      hasSession: !!(window as any).supabase?.auth?.session,
      sessionObject: (window as any).supabase?.auth?.session,
      sessionKeys: (window as any).supabase?.auth?.session ? Object.keys((window as any).supabase?.auth?.session) : null,
      getSessionMethod: typeof (window as any).supabase?.auth?.getSession,
      timestamp: Date.now()
    });

    // Try multiple ways to get the token:
    const sessionViaProperty = (window as any).supabase?.auth?.session?.access_token;
    let sessionViaGetSession = null;
    let sessionToken = null;
    try {
      sessionViaGetSession = await (window as any).supabase?.auth?.getSession();
      sessionToken = sessionViaGetSession?.data?.session?.access_token;
    } catch (getSessionError) {
      this.logger.error('[AuthSessionDebug] ❌ ERROR CALLING getSession():', {
        error: getSessionError,
        errorMessage: getSessionError?.message
      });
    }

    this.logger.error('[AuthSessionDebug] 🔍 TOKEN RETRIEVAL ATTEMPTS:', {
      viaProperty: { 
        exists: !!sessionViaProperty, 
        type: typeof sessionViaProperty,
        length: sessionViaProperty?.length || 0,
        prefix: sessionViaProperty ? sessionViaProperty.slice(0, 20) + '...' : null
      },
      viaGetSession: { 
        exists: !!sessionToken, 
        type: typeof sessionToken,
        length: sessionToken?.length || 0,
        prefix: sessionToken ? sessionToken.slice(0, 20) + '...' : null
      },
      getSessionResult: sessionViaGetSession,
      timestamp: Date.now()
    });

    // SUPABASE CLIENT STATE INVESTIGATION
    this.logger.error('[SupabaseClientDebug] 🔍 CLIENT STATE:', {
      supabaseExists: !!(window as any).supabase,
      authExists: !!(window as any).supabase?.auth,
      realtimeExists: !!(window as any).supabase?.realtime,
      authMethods: (window as any).supabase?.auth ? Object.getOwnPropertyNames((window as any).supabase.auth).filter(name => typeof (window as any).supabase.auth[name] === 'function') : null,
      authUser: (window as any).supabase?.auth?.user,
      timestamp: Date.now()
    });

    // TIMING ISSUE DETECTION
    this.logger.error('[TimingDebug] 🕐 EXECUTION CONTEXT:', {
      documentReady: document.readyState,
      windowLoaded: window.performance?.timing ? (Date.now() - window.performance.timing.navigationStart) : null,
      tabVisibility: document.visibilityState,
      isTabResumeContext: !!(window as any).__TAB_JUST_RESUMED__,
      timestamp: Date.now()
    });

    // Use the best available token
    const authToken = sessionToken || sessionViaProperty;
    const realtimeToken = authToken; // Use the same token that was set via setAuth()
    
    this.logger.error('[TokenTypeDebug] 🔍 FINAL TOKEN SELECTION:', {
      selectedToken: authToken ? 'getSession' : (sessionViaProperty ? 'property' : 'none'),
      hasAuthToken: !!authToken,
      authTokenType: typeof authToken,
      authTokenLength: authToken?.length || 0,
      reason: 'Using best available token from session investigation',
      timestamp: Date.now()
    });
    
    this.logger.error('[SubscriptionTimeoutDebug] 🔍 PRE-SUBSCRIBE STATE:', {
      hasAuthToken: !!authToken,
      authTokenPrefix: authToken && typeof authToken === 'string' ? authToken.slice(0, 20) + '...' : String(authToken),
      hasRealtimeToken: !!realtimeToken,
      realtimeTokenPrefix: realtimeToken && typeof realtimeToken === 'string' ? realtimeToken.slice(0, 20) + '...' : String(realtimeToken),
      tokensMatch: authToken === realtimeToken,
      socketUrl: channelRef.socket?.url,
      socketReadyState: channelRef.socket?.readyState,
      socketBufferedAmount: channelRef.socket?.bufferedAmount,
      channelState: channelRef.state,
      isTabResumeContext: !!(window as any).__TAB_JUST_RESUMED__,
      timestamp: Date.now()
    });
    
    // Monitor Phoenix internal state changes during subscribe
    const subscribeStartedAt = Date.now();
    const stateMonitor = setInterval(() => {
      const currentState = channelRef.state;
      const phoenixSocket = channelRef.socket;
      const elapsed = Date.now() - subscribeStartedAt;
      
      this.logger.warn('[PHOENIX_STATE_MONITOR]', {
        elapsedMs: elapsed,
        channelState: currentState,
        stateChanged: currentState !== originalState,
        socketState: phoenixSocket?.readyState,
        socketConnected: phoenixSocket?.isConnected?.(),
        channelTopic: channelRef.topic,
        channelRef: channelRef.ref,
        joinRef: channelRef.joinRef,
        pushBuffer: channelRef.pushBuffer?.length || 0,
        bindings: Object.keys(channelRef.bindings || {}).length,
        subscriptions: Object.keys(channelRef.subscriptions || {}).length,
        timestamp: Date.now()
      });
      
      // Detect stuck states
      if (elapsed > 10000 && currentState === 'joining') {
        this.logger.error('[PHOENIX_STUCK_JOINING]', {
          elapsedMs: elapsed,
          channelState: currentState,
          socketState: phoenixSocket?.readyState,
          reason: 'Channel stuck in joining state for >10s',
          timestamp: Date.now()
        });
      }
      
      // Stop monitoring after successful join or timeout
      if (currentState === 'joined' || elapsed > 30000) {
        this.logger.warn('[PHOENIX_STATE_MONITOR_END]', {
          finalState: currentState,
          elapsedMs: elapsed,
          successful: currentState === 'joined',
          timestamp: Date.now()
        });
        clearInterval(stateMonitor);
      }
    }, 1500); // Check every 1.5s
    
    // Add Phoenix event monitoring to capture all channel events
    if (this.channel) {
      const phoenixChannel = this.channel as any;
      
        // Monitor ALL Phoenix events
        if (!phoenixChannel.__EVENT_MONITORING_INSTALLED__) {
          const originalOnMessage = phoenixChannel.onMessage;
          phoenixChannel.onMessage = function(event: string, payload: any, ref?: string) {
            console.log('[PhoenixEventStream] 📨 CHANNEL EVENT:', {
              event,
              payload,
              ref,
              channelState: this.state,
              socketState: this.socket?.readyState,
              timestamp: Date.now()
            });
            
            // SUBSCRIPTION TIMEOUT DEBUG: Track critical Phoenix messages
            if (event === 'phx_reply' || event === 'phx_error' || event === 'phx_close') {
              console.error('[SubscriptionTimeoutDebug] 🚨 CRITICAL PHOENIX MESSAGE:', {
                event,
                payload,
                ref,
                channelState: this.state,
                socketState: this.socket?.readyState,
                isJoinReply: ref === this.joinRef,
                joinRef: this.joinRef,
                channelRef: this.ref,
                timestamp: Date.now()
              });

              // CRITICAL: Enhanced join reply analysis
              if (event === 'phx_reply' && ref === this.joinRef) {
                console.error('[PhoenixJoinDiag] 🎯 JOIN REPLY RECEIVED:', {
                  payload,
                  payloadStatus: payload?.status,
                  payloadResponse: payload?.response,
                  isOk: payload?.status === 'ok',
                  isError: payload?.status === 'error',
                  errorReason: payload?.response?.reason || payload?.response,
                  channelState: this.state,
                  joinRef: this.joinRef,
                  timestamp: Date.now()
                });
              }
            }
            
            // Update realtime snapshot with latest activity
            try {
              const snap: any = (window as any).__REALTIME_SNAPSHOT__ || {};
              (window as any).__REALTIME_SNAPSHOT__ = {
                ...snap,
                lastPhoenixEventAt: Date.now(),
                lastPhoenixEvent: { event, payload, ref }
              };
            } catch {}
            
            return originalOnMessage.call(this, event, payload, ref);
          };

        // COMMENTED OUT: These phx_* event listeners cause "bind.callback is not a function" corruption
        // The phx_* events are internal Phoenix events that Supabase doesn't properly support
        // Attempting to bind to them creates invalid binding objects that crash the event system
        
        // phoenixChannel.on('phx_error', (payload: any) => {
        //   console.error('[PhoenixEventStream] 🚨 PHOENIX ERROR:', {
        //     payload,
        //     channelState: phoenixChannel.state,
        //     socketState: phoenixChannel.socket?.readyState,
        //     timestamp: Date.now()
        //   });
        // });

        // phoenixChannel.on('phx_close', (payload: any) => {
        //   console.error('[PhoenixEventStream] 🔌 PHOENIX CLOSE:', {
        //     payload,
        //     channelState: phoenixChannel.state,
        //     socketState: phoenixChannel.socket?.readyState,
        //     timestamp: Date.now()
        //   });
        // });

        // phoenixChannel.on('phx_reply', (payload: any) => {
        //   console.log('[PhoenixEventStream] 💬 PHOENIX REPLY:', {
        //     payload,
        //     channelState: phoenixChannel.state,
        //     socketState: phoenixChannel.socket?.readyState,
        //     timestamp: Date.now()
        //   });
        // });
        
        console.log('[PhoenixEventStream] 🛡️ Skipped phx_* event bindings to prevent corruption');

        phoenixChannel.__EVENT_MONITORING_INSTALLED__ = true;
        console.log('[PhoenixEventStream] 🔧 Phoenix event monitoring installed');
      }
    }

    // SUBSCRIPTION TIMEOUT DEBUG: Log the actual subscribe call
    this.logger.error('[SubscriptionTimeoutDebug] 📞 CALLING CHANNEL.SUBSCRIBE():', {
      channelState: channelRef.state,
      socketState: channelRef.socket?.readyState,
      socketConnected: channelRef.socket?.isConnected?.(),
      channelTopic: channelRef.topic,
      hasSocket: !!channelRef.socket,
      socketUrl: channelRef.socket?.url,
      pushBufferLength: channelRef.pushBuffer?.length || 0,
      timestamp: Date.now()
    });

    // CRITICAL: Log realtime connection details at subscribe time
    try {
      const realtime = (window as any).supabase?.realtime;
      this.logger.error('[PhoenixJoinDiag] 🔍 REALTIME CONNECTION DETAILS AT SUBSCRIBE:', {
        endPointURL: realtime?.conn?.endPointURL?.(),
        params: realtime?.params,
        connState: realtime?.conn?.connectionState,
        connTransport: !!realtime?.conn?.transport,
        connTransportType: typeof realtime?.conn?.transport,
        connIsConnecting: realtime?.conn?.isConnecting,
        connShouldReconnect: realtime?.conn?.shouldReconnect,
        timestamp: Date.now()
      });
    } catch (e) {
      this.logger.error('[PhoenixJoinDiag] ❌ Failed to log connection details:', e);
    }

    // CRITICAL: Intercept socket.send to capture join frame transmission
    try {
      const realtime = (window as any).supabase?.realtime;
      const socket = realtime?.conn?.transport;
      if (socket && !socket.__SEND_INTERCEPTED__) {
        socket.__SEND_INTERCEPTED__ = true;
        const originalSend = socket.send;
        let sendCount = 0;
        
        socket.send = function(data: any) {
          sendCount++;
          if (sendCount <= 5) {
            try {
              const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
              console.error('[PhoenixJoinDiag] 📤 SOCKET.SEND FRAME #' + sendCount + ':', {
                rawData: typeof data === 'string' ? data.slice(0, 200) + '...' : '[BINARY]',
                parsedData,
                event: parsedData?.event,
                topic: parsedData?.topic,
                ref: parsedData?.ref,
                payload: parsedData?.payload,
                isJoinFrame: parsedData?.event === 'phx_join',
                timestamp: Date.now()
              });
            } catch (parseError) {
              console.error('[PhoenixJoinDiag] 📤 SOCKET.SEND FRAME #' + sendCount + ' (unparseable):', {
                rawData: String(data).slice(0, 100),
                dataType: typeof data,
                timestamp: Date.now()
              });
            }
          }
          return originalSend.call(this, data);
        };
      }
    } catch (e) {
      this.logger.error('[PhoenixJoinDiag] ❌ Failed to intercept socket.send:', e);
    }

    // CRITICAL: Log pushBuffer state before subscribe call
    const pushBufferBefore = channelRef.pushBuffer?.length || 0;
    this.logger.error('[PhoenixJoinDiag] 📋 PUSH BUFFER STATE BEFORE SUBSCRIBE:', {
      pushBufferLength: pushBufferBefore,
      pushBufferItems: (channelRef.pushBuffer || []).slice(0, 3).map((item: any) => ({
        event: item?.event,
        payload: item?.payload,
        ref: item?.ref
      })),
      timestamp: Date.now()
    });

    const ref = await (this.channel as any).subscribe((status: any, response?: any) => {
      try {
        const elapsed = Date.now() - subscribeStartedAt;
        
        // SUBSCRIPTION TIMEOUT DEBUG: Log every callback invocation
        this.logger.error('[SubscriptionTimeoutDebug] 📞 SUBSCRIBE CALLBACK INVOKED:', {
          status,
          elapsed,
          response,
          channelState: (this.channel as any)?.state,
          socketState: (this.channel as any)?.socket?.readyState,
          timestamp: Date.now()
        });

        // CRITICAL: Log join ref and response details for timeouts/errors
        if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          const currentJoinRef = channelRef.joinRef;
          const currentRef = channelRef.ref;
          this.logger.error('[PhoenixJoinDiag] 🚨 JOIN FAILURE DETAILS:', {
            status,
            response,
            joinRef: currentJoinRef,
            channelRef: currentRef,
            subscribeRef: ref,
            pushBufferAfter: channelRef.pushBuffer?.length || 0,
            lastPushes: (channelRef.pushBuffer || []).slice(-3).map((item: any) => ({
              event: item?.event,
              ref: item?.ref,
              sent: item?.sent
            })),
            timestamp: Date.now()
          });
        }
        
        // CRITICAL: Log detailed subscribe result for diagnosis
        const subscribeResult = {
          status,
          elapsedMs: elapsed,
          channelState: (this.channel as any)?.state,
          subscriptionsAfter: Object.keys((this.channel as any)?.subscriptions || {}).length,
          bindingsAfter: Object.keys((this.channel as any)?.bindings || {}).length,
          socketState: (this.channel as any)?.socket?.readyState,
          responseSummary: response ? {
            ok: response?.status === 'ok' || response === 'ok',
            status: (response as any)?.status,
            type: (response as any)?.type,
            message: (response as any)?.message,
            error: (response as any)?.error
          } : null,
          timestamp: Date.now()
        };
        
        this.logger.warn('[ReconnectionIssue][SUBSCRIBE_CALLBACK]', subscribeResult);
        
        // CRITICAL: Flag potential issues immediately
        if (status !== 'SUBSCRIBED' && (this.channel as any)?.state !== 'joined') {
          console.error('[ReconnectionIssue][SUBSCRIBE_ISSUE] 🚨 Subscribe callback but not SUBSCRIBED/joined:', {
            status,
            channelState: (this.channel as any)?.state,
            elapsed,
            hasBindings: subscribeResult.bindingsAfter > 0,
            hasSubscriptions: subscribeResult.subscriptionsAfter > 0,
            socketOpen: subscribeResult.socketState === 1,
            analysis: 'This may explain why realtime appears down'
          });
        }
        
      } catch {}
    });
    
    console.error('[ReconnectionIssue] 🔥 AFTER SUBSCRIBE() - WEBSOCKET STATE:', {
      socketExists: !!(this.channel as any)?.socket,
      socketState: (this.channel as any)?.socket?.readyState,
      realtimeSocketExists: !!((window as any)?.supabase?.realtime?.socket),
      realtimeSocketState: (window as any)?.supabase?.realtime?.socket?.readyState,
      subscribeResult: ref,
      timestamp: Date.now()
    });
    
    // CRITICAL: Check subscription state immediately after subscribe
    const subscriptionsAfter = Object.keys((this.channel as any)?.subscriptions || {}).length;
    // CRITICAL: Log subscription result at top level
    const finalSocketState = (this.channel as any)?.socket?.readyState;
    const subscriptionKeys = Object.keys((this.channel as any)?.subscriptions || {});
    
    console.error('🚨 SUBSCRIPTION RESULT:', {
      subscriptionsCount: subscriptionsAfter,
      subscriptionKeys,
      socketState: finalSocketState,
      socketStateText: finalSocketState === 0 ? 'CONNECTING' : finalSocketState === 1 ? 'OPEN' : finalSocketState === 2 ? 'CLOSING' : finalSocketState === 3 ? 'CLOSED' : 'UNKNOWN',
      channelState: (this.channel as any)?.state,
      PROBLEM: subscriptionsAfter === 0 ? '❌ NO SUBSCRIPTIONS CREATED - WEBSOCKET IS DEAD!' : '✅ Subscriptions created successfully',
      timestamp: Date.now()
    });
    
    // CRITICAL: Top-level logs for everything
    console.error('🔥 CHANNEL WEBSOCKET EXISTS:', !!(this.channel as any)?.socket);
    console.error('🔥 CHANNEL WEBSOCKET STATE:', finalSocketState);
    console.error('🔥 CHANNEL WEBSOCKET STATE TEXT:', finalSocketState === 0 ? 'CONNECTING' : finalSocketState === 1 ? 'OPEN' : finalSocketState === 2 ? 'CLOSING' : finalSocketState === 3 ? 'CLOSED' : 'UNKNOWN');
    console.error('🔥 CHANNEL SUBSCRIPTIONS COUNT:', subscriptionsAfter);
    console.error('🔥 CHANNEL SUBSCRIPTIONS KEYS:', subscriptionKeys);
    console.error('🔥 CHANNEL STATE:', (this.channel as any)?.state);
    console.error('🔥 CHANNEL TOPIC:', (this.channel as any)?.topic);
    console.error('🔥 CHANNEL BINDINGS:', Object.keys((this.channel as any)?.bindings || {}).length);
    
    if (subscriptionsAfter === 0) {
      console.error('🔥 PROBLEM: NO SUBSCRIPTIONS CREATED - WEBSOCKET IS DEAD!');
    } else {
      console.error('🔥 SUCCESS: SUBSCRIPTIONS CREATED SUCCESSFULLY!');
    }
    
    if (finalSocketState === undefined) {
      console.error('🔥 ROOT CAUSE: WEBSOCKET DOES NOT EXIST AT ALL!');
    } else if (finalSocketState !== 1) {
      console.error('🔥 ROOT CAUSE: WEBSOCKET EXISTS BUT IS NOT OPEN! STATE:', finalSocketState);
    }
    
    this.logger.warn('[ReconnectionIssue][SUBSCRIPTION_RESULT]', {
      subscribeRef: ref,
      subscribeRefType: typeof ref,
      subscriptionsCount: subscriptionsAfter,
      subscriptionKeys,
      channelState: (this.channel as any)?.state,
      socketState: finalSocketState,
      timestamp: Date.now(),
      analysis: subscriptionsAfter === 0 ? 'CRITICAL: Subscribe succeeded but no subscriptions created - WebSocket likely dead!' : 'Subscriptions created successfully'
    });
    
    // Set up monitoring for status changes (but don't use as subscription callback)
    const monitorStatus = (status: any) => {
      try {
        const st = (this.channel as any).state;
        if (status === 'SUBSCRIBED' || st === 'joined') {
          this.diagnostics.update({ channelState: 'joined' });
          // CRITICAL: Inspect what bindings already exist
          const existingBindings = (this.channel as any)?.bindings;
          const bindingDetails = existingBindings ? Object.entries(existingBindings).map(([key, value]) => ({
            key,
            type: typeof value,
            isFunction: typeof value === 'function',
            toString: String(value).slice(0, 100)
          })) : [];

          // GLOBAL SUPABASE INSPECTION
          const globalRealtimeState = this.adapter.getGlobalRealtimeState?.() || {};
          
          this.logger.error('[ReconnectionIssue][SUBSCRIPTION_READY_WITH_EXISTING_BINDINGS]', {
            status,
            channelState: st,
            handlersAttached: this.handlersAttached,
            bindingsCount: this.getBindingsCount(),
            existingBindingDetails: bindingDetails.slice(0, 15), // Show more bindings
            globalRealtimeState,
            isInitialPageLoad: !(window as any).__REALTIME_EVER_CONNECTED__,
            sessionStorage: {
              hasRealtimeData: !!sessionStorage.getItem('supabase.realtime'),
              hasAuthData: !!sessionStorage.getItem('supabase.auth.token')
            },
            timestamp: Date.now()
          });
          
          // Mark that we've connected at least once
          try { (window as any).__REALTIME_EVER_CONNECTED__ = true; } catch {}
          
          // Handlers are already attached after subscription, just log the state
          this.logger.warn('[ReconnectionIssue][SUBSCRIPTION_CONFIRMED]', {
            topic: this.channel?.topic,
            handlersAttached: this.handlersAttached,
            bindingsCount: this.getBindingsCount(),
            channelState: st,
            timestamp: Date.now()
          });
        } else if (status === 'CLOSED' || st === 'closed') {
          this.diagnostics.update({ channelState: 'closed' });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || st === 'errored') {
          this.diagnostics.update({ channelState: 'errored' });
        } else {
          this.diagnostics.update({ channelState: st || 'unknown' });
        }
      } catch {}
    };
    
    // Call monitor once to set initial state
    monitorStatus('SUBSCRIBED');
    
    this.lastJoinRef = String(ref || '') || null;
    this.diagnostics.update({ lastJoinRef: this.lastJoinRef });
    this.logger.info('[ReconnectionIssue][Initiation] Channel subscribed', { topic, state: (this.channel as any).state, ref: this.lastJoinRef });

    const bindings = this.getBindingsCount();
    if (bindings <= 0) {
      this.diagnostics.increment('noBindingIncidents');
      this.logger.warn('[ReconnectionIssue][Initiation] No bindings after subscribe - will wait for events instead of immediate recreation', { topic });
      // Don't immediately recreate - let the provider watchdog handle this if no events arrive
    }
  } finally {
      // CRITICAL FIX: Always release the join lock
      this.joinInProgress = false;
      console.error('[JoinGuard] 🔓 LOCK RELEASED', {
        topic: buildTaskUpdatesTopic(projectId),
        timestamp: Date.now()
      });
    }
  }

  async leave() {
    if (this.channel) {
      try {
        // Log the stack trace for visibility but avoid double-removal; rely on unsubscribe
        const stack = new Error().stack?.split('\n').slice(1, 4).join(' -> ') || 'unknown';
        const bindingsBeforeLeave = this.getBindingsCount();
        
        this.logger.warn('[ReconnectionIssue][ConnectionKiller] Channel leaving (unsubscribe)', { 
          topic: (this.channel as any).topic, 
          state: (this.channel as any).state,
          bindingsBeforeLeave,
          killerStack: stack
        });
        
        await (this.channel as any).unsubscribe?.();
        
        // Check if bindings were actually cleared
        const bindingsAfterLeave = this.getBindingsCount();
        if (bindingsAfterLeave > 0) {
          this.logger.error('[ReconnectionIssue][BINDINGS_NOT_CLEANED]', {
            bindingsBeforeLeave,
            bindingsAfterLeave,
            topic: (this.channel as any).topic,
            timestamp: Date.now()
          });
        }
        
      } catch {}
      this.channel = null;
      this.handlersAttached = false;
      this.diagnostics.update({ channelState: 'closed' });
    }
    this.projectId = null;
    this.lastJoinRef = null;
  }

  private attachHandlersOnce() {
    if (!this.channel || this.handlersAttached) {
      this.logger.warn('[ReconnectionIssue][HANDLER_SKIP]', {
        hasChannel: !!this.channel,
        handlersAttached: this.handlersAttached,
        channelState: (this.channel as any)?.state,
        timestamp: Date.now()
      });
      return;
    }
    const projectId = this.projectId;
    if (!projectId) {
      this.logger.warn('[ReconnectionIssue][HANDLER_SKIP_NO_PROJECT]', { timestamp: Date.now() });
      return;
    }

    this.logger.warn('[ReconnectionIssue][HANDLER_ATTACH_START]', {
      topic: (this.channel as any)?.topic,
      channelState: (this.channel as any)?.state,
      projectId,
      bindingsBeforeAttach: this.getBindingsCount(),
      timestamp: Date.now()
    });

    // Log before adding first handler
    this.logger.warn('[ReconnectionIssue][BEFORE_HANDLERS]', {
      bindingsBeforeAny: this.getBindingsCount(),
      channelState: (this.channel as any)?.state,
      timestamp: Date.now()
    });

      (this.channel as any)
      .on('broadcast', { event: 'task-update' }, (payload: any) => {
        try {
          const now = Date.now();
          this.lastEventReceivedAt = now;
          this.diagnostics.update({ lastEventAt: this.lastEventReceivedAt });
          const message = payload?.payload || {};
          this.diagnostics.bumpEvent(String(message?.type || 'broadcast'));
          
          // CRITICAL: Log event receipt to diagnose event flow
          console.error('[ReconnectionIssue][EVENT_RECEIVED] ✅ Broadcast event received:', {
            eventType: message?.type,
            projectId,
            channelTopic: (this.channel as any)?.topic,
            channelState: (this.channel as any)?.state,
            socketState: (this.channel as any)?.socket?.readyState,
            timeSinceChannelCreated: this.channelCreatedAt ? now - this.channelCreatedAt : 'unknown',
            eventSequence: ++this.eventSequence,
            timestamp: now,
            analysis: 'Events flowing - realtime is healthy'
          });
          
          // CRITICAL FIX: Update global realtime snapshot so polling system knows events are flowing
          try {
            if (typeof window !== 'undefined') {
              const currentSnapshot = (window as any).__REALTIME_SNAPSHOT__ || {};
              (window as any).__REALTIME_SNAPSHOT__ = {
                ...currentSnapshot,
                lastEventAt: this.lastEventReceivedAt,
                channelState: 'joined', // Confirm channel is healthy when events flow
                ts: Date.now()
              };
              console.warn('[ReconnectionIssue][SNAPSHOT_UPDATE]', {
                reason: 'Broadcast event received - updating snapshot to prevent false realtime=down detection',
                lastEventAt: this.lastEventReceivedAt,
                eventType: message?.type,
                timestamp: Date.now()
              });
            }
          } catch {}
          
          this.logger.debug('[ReconnectionIssue][AppInteraction] Broadcast received', { type: message?.type });
          if (message?.type === 'TASK_CREATED' || message?.type === 'TASKS_STATUS_UPDATE' || message?.type === 'TASK_COMPLETED') {
            routeEvent(this.queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId } });
            if (message?.type === 'TASK_COMPLETED') {
              routeEvent(this.queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId } });
            }
          } else if (message?.type === 'GENERATIONS_UPDATED') {
            const { shotId } = message.payload || {};
            routeEvent(this.queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId, shotId } });
          }
        } catch (e) {
          this.logger.warn('Broadcast handler error', { error: (e as any)?.message });
        }
      });

    // Check bindings after broadcast handler
    this.logger.warn('[ReconnectionIssue][AFTER_BROADCAST]', {
      bindings: this.getBindingsCount(),
      timestamp: Date.now()
    });

    // Log before each postgres handler addition
    this.logger.warn('[ReconnectionIssue][ADDING_POSTGRES_UPDATE]', {
      bindingsBefore: this.getBindingsCount(),
      timestamp: Date.now()
    });

    // CRITICAL FIX: Listen for BROADCAST events, not postgres_changes (matches your database triggers)
    try {
      const updateHandlerResult = (this.channel as any)
        .on('broadcast', { event: 'task-update' }, (payload: any) => {
        try {
          const now = Date.now();
          const wasFirstEvent = this.lastEventReceivedAt === 0;
          const timeSinceChannelCreated = this.channelCreatedAt ? now - this.channelCreatedAt : 0;
          this.lastEventReceivedAt = now;
          this.diagnostics.update({ lastEventAt: this.lastEventReceivedAt });
          
          this.logger.info('[ReconnectionIssue][AppInteraction] Tasks BROADCAST received', {
            ...payload,
            wasFirstEvent,
            timeSinceChannelCreated,
            eventSequence: ++this.eventSequence,
            channelAge: timeSinceChannelCreated
          });
          
          // Extract data from broadcast payload structure
          const broadcastData = payload?.payload;
          if (broadcastData?.type === 'TASKS_STATUS_UPDATE') {
            const taskData = broadcastData.payload;
            routeEvent(this.queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId: taskData.projectId } });
            if (taskData.status === 'Complete') {
              routeEvent(this.queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId: taskData.projectId } });
            }
          }
        } catch (e) { this.logger.warn('Tasks broadcast handler error', { error: (e as any)?.message }); }
      });
      
      this.logger.warn('[ReconnectionIssue][HANDLER_RESULT_UPDATE]', {
      handlerResult: updateHandlerResult,
      handlerResultType: typeof updateHandlerResult,
      bindingsAfter: this.getBindingsCount(),
      handlerResultKeys: Object.keys(updateHandlerResult || {}),
      channelState: (this.channel as any)?.state,
      channelError: (this.channel as any)?.error,
      channelLastError: (this.channel as any)?.lastError,
      timestamp: Date.now()
    });
    } catch (e) {
      this.logger.error('[ReconnectionIssue][POSTGRES_UPDATE_HANDLER_FAILED]', {
        error: (e as any)?.message,
        stack: (e as any)?.stack?.split('\n').slice(0, 3),
        timestamp: Date.now()
      });
    }

    this.logger.warn('[ReconnectionIssue][ADDING_POSTGRES_INSERT_TASKS]', {
      bindingsBefore: this.getBindingsCount(),
      timestamp: Date.now()
    });

    (this.channel as any)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, (payload: any) => {
        const now = Date.now();
        const wasFirstEvent = this.lastEventReceivedAt === 0;
        const timeSinceChannelCreated = this.channelCreatedAt ? now - this.channelCreatedAt : 0;
        this.lastEventReceivedAt = now;
        this.diagnostics.update({ lastEventAt: this.lastEventReceivedAt });
        
        // CRITICAL FIX: Update global realtime snapshot for postgres_changes events too
        try {
          if (typeof window !== 'undefined') {
            const currentSnapshot = (window as any).__REALTIME_SNAPSHOT__ || {};
            (window as any).__REALTIME_SNAPSHOT__ = {
              ...currentSnapshot,
              lastEventAt: this.lastEventReceivedAt,
              channelState: 'joined',
              ts: Date.now()
            };
            console.warn('[ReconnectionIssue][SNAPSHOT_UPDATE]', {
              reason: 'postgres_changes event received - updating snapshot',
              eventType: 'Tasks INSERT',
              lastEventAt: this.lastEventReceivedAt,
              timestamp: Date.now()
            });
          }
        } catch {}
        
        this.logger.info('[ReconnectionIssue][AppInteraction] Tasks INSERT received', {
          ...payload,
          wasFirstEvent,
          timeSinceChannelCreated,
          eventSequence: ++this.eventSequence,
          channelAge: timeSinceChannelCreated
        });
        // FIXED: Use TASK_CREATED for INSERT events
        routeEvent(this.queryClient, { type: 'TASK_CREATED', payload: { projectId } });
      });

    this.logger.warn('[ReconnectionIssue][ADDING_POSTGRES_INSERT_GENERATIONS]', {
      bindingsBefore: this.getBindingsCount(),
      timestamp: Date.now()
    });

    (this.channel as any)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generations', filter: `project_id=eq.${projectId}` }, (payload: any) => {
        const now = Date.now();
        const wasFirstEvent = this.lastEventReceivedAt === 0;
        const timeSinceChannelCreated = this.channelCreatedAt ? now - this.channelCreatedAt : 0;
        this.lastEventReceivedAt = now;
        this.diagnostics.update({ lastEventAt: this.lastEventReceivedAt });
        
        this.logger.info('[ReconnectionIssue][AppInteraction] Generations INSERT received', {
          ...payload,
          wasFirstEvent,
          timeSinceChannelCreated,
          eventSequence: ++this.eventSequence,
          channelAge: timeSinceChannelCreated
        });
        const newRecord = payload?.new || {};
        const shotId = newRecord?.params?.shotId || newRecord?.params?.shot_id || newRecord?.metadata?.shotId || newRecord?.metadata?.shot_id;
        routeEvent(this.queryClient, { type: 'GENERATION_INSERT', payload: { projectId, shotId } });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shot_generations' }, (payload: any) => {
        this.lastEventReceivedAt = Date.now();
        this.diagnostics.update({ lastEventAt: this.lastEventReceivedAt });
        this.logger.debug('[ReconnectionIssue][AppInteraction] Shot generations change received');
        const record = payload?.new || payload?.old || {};
        const shotId = record?.shot_id;
        routeEvent(this.queryClient, { type: 'SHOT_GENERATION_CHANGE', payload: { projectId, shotId } });
      });

    // Check bindings after ALL postgres_changes handlers
    this.logger.warn('[ReconnectionIssue][AFTER_ALL_POSTGRES]', {
      bindings: this.getBindingsCount(),
      timestamp: Date.now()
    });

    // CRITICAL: Database sends BROADCAST events, not postgres_changes!
    // The postgres_changes subscriptions were creating bindings but no actual database subscriptions
    // Database triggers use: supabase_realtime.broadcast('task-updates:{projectId}', 'task-update', payload)
    // So we should ONLY listen to broadcast events, not postgres_changes
    this.logger.warn('[ReconnectionIssue][BROADCAST_ONLY_APPROACH]', {
      projectId: this.projectId,
      reason: 'Database sends broadcast events, not postgres_changes',
      bindingsCount: this.getBindingsCount(),
      timestamp: Date.now()
    });

    // CRITICAL TEST: Try a simple broadcast subscription to match your system
    try {
      this.logger.warn('[ReconnectionIssue][BROADCAST_TEST] Testing simple broadcast subscription');
      const testResult = (this.channel as any)
        .on('broadcast', { event: 'task-update' }, (payload: any) => {
          this.logger.error('[ReconnectionIssue][BROADCAST_TEST_EVENT] Received test broadcast!', payload);
        });
      
      this.logger.warn('[ReconnectionIssue][BROADCAST_TEST_RESULT]', {
        testResult: testResult,
        testResultType: typeof testResult,
        bindingsAfterTest: this.getBindingsCount(),
        timestamp: Date.now()
      });
    } catch (e) {
      this.logger.error('[ReconnectionIssue][BROADCAST_TEST_FAILED]', {
        error: (e as any)?.message,
        stack: (e as any)?.stack?.split('\n').slice(0, 3),
        timestamp: Date.now()
      });
    }

    // CRITICAL: Inspect channel internal state for postgres_changes subscriptions
    try {
      const channelInternal = this.channel as any;
      const subscriptions = channelInternal?.subscriptions || {};
      const bindings = channelInternal?.bindings || {};
      
      this.logger.warn('[ReconnectionIssue][CHANNEL_INTERNAL_STATE]', {
        subscriptionsCount: Object.keys(subscriptions).length,
        subscriptionKeys: Object.keys(subscriptions).slice(0, 5),
        subscriptionDetails: Object.entries(subscriptions).slice(0, 3).map(([key, sub]: [string, any]) => ({
          key,
          table: sub?.config?.table,
          event: sub?.config?.event,
          filter: sub?.config?.filter
        })),
        bindingsCount: Object.keys(bindings).length,
        bindingKeys: Object.keys(bindings).slice(0, 10),
        channelTopic: channelInternal?.topic,
        channelState: channelInternal?.state,
        channelJoinRef: channelInternal?.joinRef,
        timestamp: Date.now()
      });
    } catch (e) {
      this.logger.error('[ReconnectionIssue][CHANNEL_INTERNAL_INSPECTION_FAILED]', {
        error: (e as any)?.message,
        timestamp: Date.now()
      });
    }

    // CRITICAL: Add channel system monitoring to detect silent failures  
    (this.channel as any)
      .on('system', (payload: any) => {
        this.logger.warn('[ReconnectionIssue][CHANNEL_SYSTEM]', {
          payload,
          channelState: (this.channel as any)?.state,
          timestamp: Date.now()
        });
        
        // CRITICAL: Log ALL system messages to catch silent failures
        console.error('[ReconnectionIssue][SYSTEM_MESSAGE_ANALYSIS] 🔍', {
          payload,
          payloadStatus: payload?.status,
          payloadType: payload?.type,
          payloadMessage: payload?.message,
          payloadError: payload?.error,
          channelState: (this.channel as any)?.state,
          topic: (this.channel as any)?.topic,
          timestamp: Date.now(),
          analysis: 'Catching all system messages to find silent failure cause'
        });
        
        // CRITICAL: Log when channel should transition to joined but doesn't
        if (payload?.status === 'ok' && (this.channel as any)?.state === 'joining') {
          setTimeout(() => {
            const currentState = (this.channel as any)?.state;
            if (currentState !== 'joined') {
              console.error('[ReconnectionIssue][STUCK_IN_JOINING] ⚠️ CRITICAL', {
                reason: 'Channel received OK status but never transitioned to joined',
                expectedState: 'joined',
                actualState: currentState,
                payload,
                topic: (this.channel as any)?.topic,
                bindings: this.getBindingsCount(),
                timestamp: Date.now(),
                analysis: 'This is why events never flow - channel stuck in joining state'
              });
            } else {
              console.log('[ReconnectionIssue][SUCCESSFUL_TRANSITION]', {
                reason: 'Channel successfully transitioned to joined after system OK',
                finalState: currentState,
                timestamp: Date.now()
              });
            }
          }, 1000);
        }
        
        // CRITICAL: Also check for error status in system messages
        if (payload?.status === 'error' || payload?.type === 'error') {
          console.error('[ReconnectionIssue][SYSTEM_ERROR_DETECTED] ⚠️ FOUND IT', {
            reason: 'System message contains error - this is the silent failure',
            payload,
            channelState: (this.channel as any)?.state,
            timestamp: Date.now(),
            analysis: 'This system error is causing the channel to go to errored state'
          });
        }
      })
      .on('error', (payload: any) => {
        this.logger.error('[ReconnectionIssue][CHANNEL_ERROR] ⚠️ CRITICAL ERROR DETECTED', {
          payload,
          payloadType: typeof payload,
          payloadDetails: JSON.stringify(payload),
          channelState: (this.channel as any)?.state,
          channelTopic: (this.channel as any)?.topic,
          projectId: this.projectId,
          bindingsCount: this.getBindingsCount(),
          lastEventAt: this.lastEventReceivedAt,
          timestamp: Date.now(),
          errorAnalysis: {
            reason: 'Channel error causes errored state',
            impact: 'Breaks all data flow - buttons work but no updates',
            nextSteps: 'Channel needs recreation after error'
          }
        });
        
        // CRITICAL: Track error sequence to understand what triggers it
        console.error('[ReconnectionIssue][ERROR_SEQUENCE_ANALYSIS] 🔍 ROOT CAUSE DETECTED', {
          errorPayload: payload,
          errorType: payload?.type || 'unknown',
          errorMessage: payload?.message || payload?.error || 'no message',
          errorCode: payload?.code || payload?.status || 'no code',
          whenItHappened: 'DURING INITIAL CONNECTION - NOT TAB SWITCH',
          channelStateBefore: (this.channel as any)?.state,
          projectId: this.projectId,
          timestamp: Date.now(),
          criticalInsight: 'This error happens on initial connection, explaining why reconnection always fails'
        });
        
        // CRITICAL: Log full error object structure
        try {
          console.error('[ReconnectionIssue][ERROR_OBJECT_ANALYSIS]', {
            payloadKeys: Object.keys(payload || {}),
            payloadStringified: JSON.stringify(payload, null, 2),
            payloadType: typeof payload,
            isObject: typeof payload === 'object',
            hasMessage: 'message' in (payload || {}),
            hasError: 'error' in (payload || {}),
            hasCode: 'code' in (payload || {}),
            timestamp: Date.now()
          });
        } catch (e) {
          console.error('[ReconnectionIssue][ERROR_ANALYSIS_FAILED]', { error: e });
        }
      })
      .on('close', (payload: any) => {
        this.logger.error('[ReconnectionIssue][CHANNEL_CLOSE]', {
          payload,
          channelState: (this.channel as any)?.state,
          timestamp: Date.now()
        });
      });

    this.handlersAttached = true;
    
    // IMMEDIATE binding check after attachment
    const bindingsAfterAttach = this.getBindingsCount();
    this.logger.warn('[ReconnectionIssue][HANDLER_ATTACH_COMPLETE]', {
      topic: (this.channel as any)?.topic,
      channelState: (this.channel as any)?.state,
      bindingsAfterAttach,
      handlersAttached: this.handlersAttached,
      timestamp: Date.now()
    });
    
    // CRITICAL: Log channel subscription status after handlers are set up
    setTimeout(() => {
      const state = (this.channel as any)?.state;
      const bindings = this.getBindingsCount();
      this.logger.warn('[ReconnectionIssue][CHANNEL_STATUS_CHECK]', {
        topic: (this.channel as any)?.topic,
        state,
        bindings,
        handlersAttached: this.handlersAttached,
        timestamp: Date.now()
      });
      
      // If no events received within 10 seconds, log warning
      setTimeout(() => {
        const timeSinceLastEvent = Date.now() - this.lastEventReceivedAt;
        if (timeSinceLastEvent > 10000) {
          this.logger.error('[ReconnectionIssue][NO_EVENTS_WARNING]', {
            topic: (this.channel as any)?.topic,
            state: (this.channel as any)?.state,
            timeSinceLastEvent,
            lastEventAt: this.lastEventReceivedAt,
            timestamp: Date.now()
          });
        }
      }, 10000);
      
          // CRITICAL: Start continuous state monitoring to catch transitions
    const stateMonitor = setInterval(() => {
      const currentState = (this.channel as any)?.state;
      const lastKnownState = (this as any).lastKnownState || 'unknown';
      
      if (currentState !== lastKnownState) {
        console.error('[ReconnectionIssue][STATE_TRANSITION] ⚠️ CHANNEL STATE CHANGED', {
          from: lastKnownState,
          to: currentState,
          topic: (this.channel as any)?.topic,
          projectId: this.projectId,
          bindingsCount: this.getBindingsCount(),
          lastEventAt: this.lastEventReceivedAt,
          timestamp: Date.now(),
          critical: currentState === 'errored' ? 'CHANNEL ERRORED - DATA FLOW BROKEN!' : false
        });
        (this as any).lastKnownState = currentState;
        
        // CRITICAL: If channel goes to errored WITHOUT system messages, it's a WebSocket failure
        if (currentState === 'errored') {
          console.error('🔥 CHANNEL ENTERED ERRORED STATE!');
          console.error('🔥 ERRORED WEBSOCKET EXISTS:', !!(this.channel as any)?.socket);
          console.error('🔥 ERRORED WEBSOCKET STATE:', (this.channel as any)?.socket?.readyState);
          console.error('🔥 ERRORED WEBSOCKET URL:', (this.channel as any)?.socket?.url);
          console.error('🔥 ERRORED CHANNEL REF:', (this.channel as any)?.ref);
          console.error('🔥 ERRORED CHANNEL JOIN REF:', (this.channel as any)?.joinRef);
          console.error('🔥 ERRORED PROJECT ID:', this.projectId);
          
          if (!(this.channel as any)?.socket) {
            console.error('🔥 ERROR ROOT CAUSE: NO WEBSOCKET EXISTS!');
          } else if ((this.channel as any)?.socket?.readyState !== 1) {
            console.error('🔥 ERROR ROOT CAUSE: WEBSOCKET IS NOT OPEN!');
          } else {
            console.error('🔥 ERROR ROOT CAUSE: WEBSOCKET IS OPEN BUT CHANNEL FAILED!');
          }
          
          // CRITICAL: Log full channel object for debugging
          try {
            const channelDebug = {
              state: (this.channel as any)?.state,
              topic: (this.channel as any)?.topic,
              socket: {
                readyState: (this.channel as any)?.socket?.readyState,
                url: (this.channel as any)?.socket?.url,
                protocol: (this.channel as any)?.socket?.protocol
              },
              refs: {
                ref: (this.channel as any)?.ref,
                joinRef: (this.channel as any)?.joinRef,
                pushBuffer: (this.channel as any)?.pushBuffer?.length || 0
              },
              bindings: Object.keys((this.channel as any)?.bindings || {}).length
            };
            console.error('[ReconnectionIssue][CHANNEL_DEBUG_DUMP]', channelDebug);
          } catch (e) {
            console.error('[ReconnectionIssue][CHANNEL_DEBUG_FAILED]', { error: e });
          }
        }
        
        // If channel goes to joining, monitor if it gets stuck
        if (currentState === 'joining') {
          setTimeout(() => {
            const finalState = (this.channel as any)?.state;
            if (finalState === 'joining') {
              console.error('[ReconnectionIssue][JOINING_TIMEOUT] ⚠️ CRITICAL', {
                reason: 'Channel stuck in joining state for 5+ seconds',
                stuckState: finalState,
                topic: (this.channel as any)?.topic,
                bindings: this.getBindingsCount(),
                timestamp: Date.now(),
                analysis: 'This is the final failure point - channel never becomes joined'
              });
            }
          }, 5000);
        }
      }
    }, 500);
      
      // Store monitor for cleanup
      (this as any).stateMonitor = stateMonitor;
    }, 1000);
  }

  private async recreateChannel() {
    if (!this.projectId) return;
    const topic = buildTaskUpdatesTopic(this.projectId);
    try { if (this.channel) await (this.channel as any).unsubscribe?.(); } catch {}
    this.channel = await this.adapter.channel(topic);
    this.handlersAttached = false;
    this.attachHandlersOnce();
    this.diagnostics.increment('channelRecreatedCount');
    await (this.channel as any).subscribe((status: any) => status);
    this.diagnostics.update({ channelState: (this.channel as any).state || 'unknown' });
    this.logger.info('[ReconnectionIssue][Initiation] Channel recreated', { topic });
  }
}

 