import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { SupabaseRealtimeAdapter } from '@/shared/realtime/SupabaseRealtimeAdapter';
import { runtimeConfig } from '@/shared/lib/config';
import { DiagnosticsLogger, DiagnosticsStore } from '@/shared/realtime/Diagnostics';
import { ProjectChannelManager } from '@/shared/realtime/projectChannelManager';

type RealtimeState = {
  isConnected: boolean;
  connectionState: string | undefined;
  lastStateChangeAt: number | null;
  channels: Array<{ topic: string; state: string }>;
};

const RealtimeContext = React.createContext<RealtimeState | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
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
  const recoveryInProgressRef = React.useRef<boolean>(false);
  const lastSuccessfulEventRef = React.useRef<number>(0);

  if (!adapterRef.current) adapterRef.current = new SupabaseRealtimeAdapter();
  if (!diagnosticsRef.current) diagnosticsRef.current = new DiagnosticsStore();
  if (!loggerRef.current) loggerRef.current = new DiagnosticsLogger('RealtimeCore', runtimeConfig.RECONNECTION_LOGS_ENABLED);
  if (!managerRef.current) managerRef.current = new ProjectChannelManager(adapterRef.current, diagnosticsRef.current, loggerRef.current, queryClient);

  // Reflect diagnostics to provider state
  React.useEffect(() => {
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
        adapter.connect(session?.access_token ?? null);
        if (!cancelled) {
          await manager.join(selectedProjectId);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  // Consolidated recovery coordinator
  const triggerRecovery = React.useCallback(async (reason: string) => {
    if (!selectedProjectId) return;
    if (recoveryInProgressRef.current) {
      loggerRef.current?.info('[ReconnectionIssue][Recovery] Recovery already in progress, skipping', { reason });
      return;
    }
    
    const now = Date.now();
    if (now - lastHealAtRef.current < 3000) {
      loggerRef.current?.info('[ReconnectionIssue][Recovery] Too soon since last recovery', { 
        reason, 
        timeSinceLastHeal: now - lastHealAtRef.current 
      });
      return;
    }
    
    const correlationId = `recovery-${now}-${Math.random().toString(36).substr(2, 9)}`;
    loggerRef.current?.info('[ReconnectionIssue][Recovery] Starting recovery', { reason, correlationId });
    
    recoveryInProgressRef.current = true;
    lastHealAtRef.current = now;
    
    try {
      // Step 1: Refresh auth
      const { data: { session } } = await supabase.auth.getSession();
      adapterRef.current?.setAuth(session?.access_token ?? null);
      
      // Step 2: Reconnect socket if needed
      const socketState = adapterRef.current?.getSocketConnectionState();
      if (!socketState?.isConnected) {
        loggerRef.current?.info('[ReconnectionIssue][Recovery] Reconnecting socket', { correlationId });
        adapterRef.current?.connect(session?.access_token ?? null);
        await new Promise(resolve => setTimeout(resolve, 500)); // Give socket time to connect
      }
      
      // Step 3: Rejoin channel
      await managerRef.current?.join(selectedProjectId);
      
      // Step 4: Verify recovery success
      const diagnostics = diagnosticsRef.current?.snapshot;
      const channelState = diagnostics?.channelState;
      
      if (channelState === 'joined') {
        loggerRef.current?.info('[ReconnectionIssue][Recovery] Recovery completed successfully', { 
          reason, 
          correlationId,
          channelState 
        });
      } else {
        loggerRef.current?.error('[ReconnectionIssue][Recovery] Recovery failed', { 
          reason, 
          correlationId,
          channelState 
        });
      }
    } catch (error) {
      loggerRef.current?.error('[ReconnectionIssue][Recovery] Recovery error', { 
        reason, 
        correlationId,
        error: (error as any)?.message 
      });
    } finally {
      recoveryInProgressRef.current = false;
    }
  }, [selectedProjectId]);

  // Visibility recovery
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      loggerRef.current?.info('[ReconnectionIssue][Visibility] Became visible');
      try { (window as any).__VIS_CHANGE_AT__ = Date.now(); } catch {}
      triggerRecovery('visibility-change');
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        loggerRef.current?.info('[ReconnectionIssue][Visibility] Became hidden');
        try { (window as any).__VIS_CHANGE_AT__ = Date.now(); } catch {}
      }
    };
    const onPageShow = () => { 
      loggerRef.current?.info('[ReconnectionIssue][Visibility] pageshow'); 
      try { (window as any).__VIS_CHANGE_AT__ = Date.now(); } catch {}
      triggerRecovery('pageshow');
    };
    const onPageHide = () => { 
      loggerRef.current?.info('[ReconnectionIssue][Visibility] pagehide'); 
      try { (window as any).__VIS_CHANGE_AT__ = Date.now(); } catch {} 
    };
    
    // Listen for auth-heal events from auth system
    const onAuthHeal = () => {
      loggerRef.current?.info('[ReconnectionIssue][Recovery] Auth heal event received');
      triggerRecovery('auth-heal');
    };
    
    // Listen for force recovery from debug tools
    const onForceRecovery = () => {
      loggerRef.current?.info('[ReconnectionIssue][Recovery] Force recovery requested');
      triggerRecovery('force-recovery');
    };
    
    // Listen for app visibility change events
    const onAppVisibility = (e: any) => {
      if (e.detail?.visible) {
        loggerRef.current?.info('[ReconnectionIssue][Recovery] App visibility event received');
        triggerRecovery('app-visibility');
      }
    };
    
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('realtime:auth-heal', onAuthHeal as any);
    window.addEventListener('realtime:force-recovery', onForceRecovery as any);
    window.addEventListener('app:visibility-change', onAppVisibility as any);
    
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('realtime:auth-heal', onAuthHeal as any);
      window.removeEventListener('realtime:force-recovery', onForceRecovery as any);
      window.removeEventListener('app:visibility-change', onAppVisibility as any);
    };
  }, [triggerRecovery]);

  // Enhanced watchdog with event flow verification
  React.useEffect(() => {
    const diagnostics = diagnosticsRef.current!;
    const tick = () => {
      if (!selectedProjectId) return;
      if (recoveryInProgressRef.current) return; // Don't interfere with ongoing recovery
      
      const snapshot = diagnostics.snapshot;
      const lastEventAt = snapshot.lastEventAt || 0;
      const channelState = snapshot.channelState;
      const now = Date.now();
      const timeSinceLastEvent = now - lastEventAt;
      const tooLong = timeSinceLastEvent > 20000; // Increased to 20s to reduce false positives
      
      // Track if we're receiving events
      if (lastEventAt > lastSuccessfulEventRef.current) {
        lastSuccessfulEventRef.current = lastEventAt;
        loggerRef.current?.debug('[ReconnectionIssue][Watchdog] Events flowing normally', { 
          timeSinceLastEvent: Math.round(timeSinceLastEvent / 1000) + 's' 
        });
      }
      
      // Check for problems
      if (channelState !== 'joined' || tooLong) {
        const manager = managerRef.current as any;
        const bindings = manager?.getBindingsCount?.() || 0;
        
        loggerRef.current?.warn('[ReconnectionIssue][Watchdog] Detected issue', { 
          channelState, 
          tooLong,
          timeSinceLastEvent: Math.round(timeSinceLastEvent / 1000) + 's',
          bindings,
          lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : 'never'
        });
        
        // Special handling for zero bindings
        if (channelState === 'joined' && bindings === 0) {
          loggerRef.current?.error('[ReconnectionIssue][Watchdog] CRITICAL: Channel joined but no handlers!');
        }
        
        triggerRecovery('watchdog-' + (tooLong ? 'timeout' : 'not-joined'));
      }
    };
    
    const id = window.setInterval(tick, 5000);
    tick(); // Run immediately
    return () => window.clearInterval(id);
  }, [selectedProjectId, triggerRecovery]);

  return (
    <RealtimeContext.Provider value={state}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) return { isConnected: runtimeConfig.REALTIME_ENABLED !== false, connectionState: 'unknown', lastStateChangeAt: null, channels: [] };
  return ctx;
}


