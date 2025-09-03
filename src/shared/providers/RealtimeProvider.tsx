import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { runtimeConfig } from '@/shared/lib/config';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { routeEvent } from '@/shared/lib/InvalidationRouter';

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
  const channelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastReconnectAtRef = React.useRef<number>(0);

  // Helper: ensure realtime socket and project channel are alive
  const ensureRealtimeHealthy = React.useCallback(async () => {
    try {
      if (runtimeConfig.REALTIME_ENABLED === false) return;
      const now = Date.now();
      if (now - lastReconnectAtRef.current < 5000) return; // throttle to 5s
      lastReconnectAtRef.current = now;

      const socket: any = (supabase as any)?.realtime?.socket;
      const wasConnected = !!socket?.isConnected?.();
      const wasState = socket?.connectionState;

      console.log('[DeadModeInvestigation] Heal attempt starting', {
        wasConnected,
        wasState,
        visibility: document.visibilityState,
        selectedProjectId
      });

      // Force socket reset: disconnect then reconnect to clear suspended state
      try {
        const { data: { session } } = await supabase.auth.getSession();
        (supabase as any)?.realtime?.setAuth?.(session?.access_token ?? null);
        
        // Force disconnect then connect to reset socket state after tab suspension
        if (socket) {
          try { socket.disconnect?.(); } catch {}
          await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause
          try { socket.connect?.(); } catch {}
        }
      } catch (e) {
        console.warn('[DeadModeInvestigation] Socket reset failed:', e);
      }

      // Wait for connection to settle
      await new Promise(resolve => setTimeout(resolve, 500));

      // Ensure project channel exists and is properly joined
      const topic = selectedProjectId ? `task-updates:${selectedProjectId}` : null;
      if (!topic) return;

      const existing = (supabase as any)?.getChannels?.() || [];
      const matches = existing.filter((c: any) => c.topic?.endsWith(topic));

      // Remove duplicates beyond one
      if (matches.length > 1) {
        matches.slice(1).forEach((ch: any) => { try { (supabase as any).removeChannel?.(ch); } catch {} });
      }

      let channel = matches[0] || channelRef.current;
      const needsRecreate = !channel || channel?.state === 'closed' || channel?.state === 'errored';
      
      if (needsRecreate) {
        console.log('[DeadModeInvestigation] Recreating channel', { topic, oldState: channel?.state });
        // Clean up old channel
        try { if (channelRef.current) (supabase as any).removeChannel?.(channelRef.current); } catch {}
        channelRef.current = null;
        
        // Force the main effect to recreate by clearing and triggering dependency change
        // This ensures all handlers are properly attached
        setTimeout(() => {
          // Trigger effect re-run by temporarily clearing then restoring selectedProjectId in state
          setState(prev => ({ ...prev, lastStateChangeAt: Date.now() }));
        }, 100);
      } else if (channel?.state !== 'joined') {
        console.log('[DeadModeInvestigation] Re-joining existing channel', { topic, state: channel?.state });
        try { await channel.subscribe((status: any) => status); } catch {}
      }

      // Log final state
      const finalSocket: any = (supabase as any)?.realtime?.socket;
      const nowConnected = !!finalSocket?.isConnected?.();
      const nowState = finalSocket?.connectionState;
      
      console.log('[DeadModeInvestigation] Heal attempt complete', {
        wasConnected,
        nowConnected,
        wasState,
        nowState,
        healed: !wasConnected && nowConnected,
        topic,
        channelState: (matches[0] || channelRef.current)?.state
      });

    } catch (e) {
      console.error('[DeadModeInvestigation] Heal failed:', e);
    }
  }, [selectedProjectId]);

  React.useEffect(() => {
    if (runtimeConfig.REALTIME_ENABLED === false) {
      return;
    }
    const interval = setInterval(() => {
      try {
        const socket: any = (supabase as any)?.realtime?.socket;
        const isConnected = !!socket?.isConnected?.();
        const connectionState = socket?.connectionState;
        const channels = (supabase as any)?.getChannels?.()?.map((c: any) => ({ topic: c.topic, state: c.state })) || [];
        setState((prev) => (
          connectionState !== prev.connectionState || isConnected !== prev.isConnected
            ? { isConnected, connectionState, lastStateChangeAt: Date.now(), channels }
            : { ...prev, channels }
        ));
        // If visible and disconnected, try to heal the connection and channel
        try {
          if (document.visibilityState === 'visible' && !isConnected) {
            ensureRealtimeHealthy();
          }
        } catch {}
        // Throttled realtime transition logs to correlate with dead-mode boosts
        try {
          const now = Date.now();
          const logKey = '__RT_SNAPSHOT__';
          const last = (window as any)[logKey] || 0;
          if (now - last > 15000) {
            console.warn('[DeadModeInvestigation] Realtime snapshot', {
              connected: isConnected,
              connectionState,
              channelCount: channels.length,
              topicsSample: channels.slice(0, 5).map(c => c.topic)
            });
            (window as any)[logKey] = now;
          }
        } catch {}
      } catch {
        // ignore
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [ensureRealtimeHealthy]);

  // Heal on visibility recovery and custom events
  React.useEffect(() => {
    if (runtimeConfig.REALTIME_ENABLED === false) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') ensureRealtimeHealthy();
    };
    const onRecover = () => ensureRealtimeHealthy();
    const onAuthHeal = () => ensureRealtimeHealthy();
    
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('realtime:visibility-recover', onRecover as any);
    window.addEventListener('realtime:auth-heal', onAuthHeal as any);
    
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('realtime:visibility-recover', onRecover as any);
      window.removeEventListener('realtime:auth-heal', onAuthHeal as any);
    };
  }, [ensureRealtimeHealthy]);

  // Safety: ensure single ownership of the project channel even if legacy listeners are accidentally enabled
  React.useEffect(() => {
    if (runtimeConfig.REALTIME_ENABLED === false) return;
    // Remove any extra channels with same topic to avoid double-subscribe
    try {
      const topic = selectedProjectId ? `task-updates:${selectedProjectId}` : null;
      const channels = (supabase as any)?.getChannels?.() || [];
      if (topic) {
        const dups = channels.filter((c: any) => c.topic === topic);
        // Keep the first, remove the rest
        if (dups.length > 1) {
          dups.slice(1).forEach((ch: any) => {
            try { (supabase as any).removeChannel?.(ch); } catch {}
          });
        }
      }
    } catch {}
  }, [selectedProjectId]);

  // Manage project-scoped channel & event routing
  React.useEffect(() => {
    if (runtimeConfig.REALTIME_ENABLED === false) return;
    if (!selectedProjectId) {
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
      return;
    }

    // Clean up old
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }

    const topic = `task-updates:${selectedProjectId}`;
    const channel = supabase
      .channel(topic, { config: { broadcast: { self: false, ack: false } } })
      .on('broadcast', { event: 'task-update' }, (payload) => {
        try {
          const message = payload.payload || {};
          if (message?.type === 'TASK_CREATED' || message?.type === 'TASKS_STATUS_UPDATE' || message?.type === 'TASK_COMPLETED') {
            routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId: selectedProjectId } });
            if (message?.type === 'TASK_COMPLETED') {
              routeEvent(queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId: selectedProjectId } });
            }
          } else if (message?.type === 'GENERATIONS_UPDATED') {
            const { shotId } = message.payload || {};
            routeEvent(queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId: selectedProjectId, shotId } });
          }
        } catch {}
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${selectedProjectId}` }, (payload) => {
        try {
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          if (oldStatus !== newStatus) {
            routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId: selectedProjectId } });
            if (newStatus === 'Complete') routeEvent(queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId: selectedProjectId } });
          }
        } catch {}
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${selectedProjectId}` }, () => {
        routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId: selectedProjectId } });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generations', filter: `project_id=eq.${selectedProjectId}` }, (payload) => {
        const newRecord = payload.new as any;
        const shotId = newRecord?.params?.shotId || newRecord?.params?.shot_id || newRecord?.metadata?.shotId || newRecord?.metadata?.shot_id;
        routeEvent(queryClient, { type: 'GENERATION_INSERT', payload: { projectId: selectedProjectId, shotId } });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shot_generations' }, (payload) => {
        const record = (payload.new || payload.old) as any;
        const shotId = record?.shot_id;
        routeEvent(queryClient, { type: 'SHOT_GENERATION_CHANGE', payload: { projectId: selectedProjectId, shotId } });
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
    };
  }, [selectedProjectId, queryClient]);

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


