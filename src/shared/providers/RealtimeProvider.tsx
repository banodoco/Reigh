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
  const lastEventAtRef = React.useRef<number>(0);
  const isConnectingRef = React.useRef<boolean>(false);
  const connectBackoffRef = React.useRef<number>(500);
  const connectTimerRef = React.useRef<number | null>(null);

  const clearConnectTimer = () => {
    if (connectTimerRef.current) {
      try { clearTimeout(connectTimerRef.current); } catch {}
      connectTimerRef.current = null;
    }
  };

  // Attach low-level realtime lifecycle logs once
  React.useEffect(() => {
    try {
      const rt: any = (supabase as any)?.realtime;
      if (!rt) return;
      try { rt.onOpen?.(() => console.warn('[DeadModeInvestigation] Realtime onOpen')); } catch {}
      try { rt.onClose?.(() => console.warn('[DeadModeInvestigation] Realtime onClose')); } catch {}
      try { rt.onError?.((e: any) => console.warn('[DeadModeInvestigation] Realtime onError', { error: e?.message || String(e) })); } catch {}
      // Fallback to socket events if available
      const sock: any = rt.socket;
      if (sock?.conn) {
        try { sock.conn.onopen = () => console.warn('[DeadModeInvestigation] Socket conn.onopen'); } catch {}
        try { sock.conn.onclose = () => console.warn('[DeadModeInvestigation] Socket conn.onclose'); } catch {}
        try { sock.conn.onerror = () => console.warn('[DeadModeInvestigation] Socket conn.onerror'); } catch {}
      }
    } catch {}
  }, []);

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

      console.warn('[DeadModeInvestigation] Heal attempt starting', {
        wasConnected,
        wasState,
        visibility: document.visibilityState,
        selectedProjectId
      });

      // Force socket reset via public API: disconnect then reconnect to clear suspended state
      try {
        const { data: { session } } = await supabase.auth.getSession();
        (supabase as any)?.realtime?.setAuth?.(session?.access_token ?? null);
        try { (supabase as any)?.realtime?.disconnect?.(); } catch {}
        await new Promise(resolve => setTimeout(resolve, 120)); // Brief pause
        try { (supabase as any)?.realtime?.connect?.(); } catch {}
      } catch (e) {
        console.warn('[DeadModeInvestigation] Socket reset failed', { error: (e as any)?.message });
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
        console.warn('[DeadModeInvestigation] Recreating channel', { topic, oldState: channel?.state });
        // Clean up old channel
        try { if (channelRef.current) (supabase as any).removeChannel?.(channelRef.current); } catch {}
        channelRef.current = null;
        
        // Create a fresh channel with handlers and subscribe with status logging
        const fresh = supabase
          .channel(topic, { config: { broadcast: { self: false, ack: false } } })
          .on('broadcast', { event: 'task-update' }, (payload) => {
            try {
              lastEventAtRef.current = Date.now();
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
              lastEventAtRef.current = Date.now();
              const oldStatus = (payload.old as any)?.status;
              const newStatus = (payload.new as any)?.status;
              if (oldStatus !== newStatus) {
                routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId: selectedProjectId } });
                if (newStatus === 'Complete') routeEvent(queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId: selectedProjectId } });
              }
            } catch {}
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${selectedProjectId}` }, () => {
            lastEventAtRef.current = Date.now();
            routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId: selectedProjectId } });
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generations', filter: `project_id=eq.${selectedProjectId}` }, (payload) => {
            lastEventAtRef.current = Date.now();
            const newRecord = payload.new as any;
            const shotId = newRecord?.params?.shotId || newRecord?.params?.shot_id || newRecord?.metadata?.shotId || newRecord?.metadata?.shot_id;
            routeEvent(queryClient, { type: 'GENERATION_INSERT', payload: { projectId: selectedProjectId, shotId } });
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'shot_generations' }, (payload) => {
            lastEventAtRef.current = Date.now();
            const record = (payload.new || payload.old) as any;
            const shotId = record?.shot_id;
            routeEvent(queryClient, { type: 'SHOT_GENERATION_CHANGE', payload: { projectId: selectedProjectId, shotId } });
          });
        try {
          await fresh.subscribe((status: any) => {
            try {
              console.warn('[DeadModeInvestigation] Channel subscribe status', { topic, status });
            } catch {}
            return status;
          });
        } catch {}
        channelRef.current = fresh as any;
      } else if (channel?.state !== 'joined') {
        console.warn('[DeadModeInvestigation] Re-joining existing channel', { topic, state: channel?.state });
        try {
          await channel.subscribe((status: any) => {
            try { console.warn('[DeadModeInvestigation] Channel subscribe status', { topic, status }); } catch {}
            return status;
          });
        } catch {}
      }

      // Log final state
      const finalSocket: any = (supabase as any)?.realtime?.socket;
      const nowConnected = !!finalSocket?.isConnected?.();
      const nowState = finalSocket?.connectionState;
      
      console.warn('[DeadModeInvestigation] Heal attempt complete', {
        wasConnected,
        nowConnected,
        wasState,
        nowState,
        healed: !wasConnected && nowConnected,
        topic,
        channelState: (matches[0] || channelRef.current)?.state
      });

    } catch (e) {
      console.error('[DeadModeInvestigation] Heal failed', { error: (e as any)?.message });
    }
  }, [selectedProjectId]);

  // Coordinated connect sequence with exponential backoff
  const startConnectSequence = React.useCallback(() => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    connectBackoffRef.current = 500;
    clearConnectTimer();

    const step = async () => {
      try {
        const socket: any = (supabase as any)?.realtime?.socket;
        const connected = !!socket?.isConnected?.();
        if (connected) {
          console.warn('[DeadModeInvestigation] Connect sequence: already connected');
          isConnectingRef.current = false;
          // Ensure channel exists once connected
          await ensureRealtimeHealthy();
          return;
        }
        console.warn('[DeadModeInvestigation] Connect sequence attempt', { backoffMs: connectBackoffRef.current });
        // Use public API
        try { (supabase as any)?.realtime?.disconnect?.(); } catch {}
        await new Promise(r => setTimeout(r, 120));
        try { (supabase as any)?.realtime?.connect?.(); } catch {}
        await new Promise(r => setTimeout(r, 600));
        const nowConnected = !!((supabase as any)?.realtime?.socket?.isConnected?.());
        console.warn('[DeadModeInvestigation] Connect sequence result', { nowConnected });
        if (nowConnected) {
          isConnectingRef.current = false;
          connectBackoffRef.current = 500;
          await ensureRealtimeHealthy();
          return;
        }
      } catch {}
      // schedule next attempt
      const delay = Math.min(connectBackoffRef.current, 30000);
      connectBackoffRef.current = Math.min(connectBackoffRef.current * 2, 30000);
      clearConnectTimer();
      connectTimerRef.current = window.setTimeout(step, delay);
    };

    step();
  }, [ensureRealtimeHealthy]);

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
        try {
          (window as any).__RT_LAST_EVENT_AT__ = lastEventAtRef.current || 0;
          (window as any).__RT_CHANNELS__ = channels;
        } catch {}
        setState((prev) => (
          connectionState !== prev.connectionState || isConnected !== prev.isConnected
            ? { isConnected, connectionState, lastStateChangeAt: Date.now(), channels }
            : { ...prev, channels }
        ));
        // If visible and disconnected, try to heal the connection and channel
        try {
          if (document.visibilityState === 'visible' && !isConnected) {
            startConnectSequence();
          }
        } catch {}
        // Throttled realtime transition logs to correlate with dead-mode boosts
        try {
          const now = Date.now();
          const logKey = '__RT_SNAPSHOT__';
          const last = (window as any)[logKey] || 0;
          if (now - last > 15000) {
            const lastEventAgo = lastEventAtRef.current ? Math.round((now - lastEventAtRef.current) / 1000) : null;
            console.warn('[DeadModeInvestigation] Realtime snapshot', {
              connected: isConnected,
              connectionState,
              channelCount: channels.length,
              topicsSample: channels.slice(0, 5).map(c => c.topic),
              lastEventAgoSec: lastEventAgo
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
      if (document.visibilityState === 'visible') startConnectSequence();
    };
    const onRecover = () => startConnectSequence();
    const onAuthHeal = () => startConnectSequence();
    
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('realtime:visibility-recover', onRecover as any);
    window.addEventListener('realtime:auth-heal', onAuthHeal as any);
    
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('realtime:visibility-recover', onRecover as any);
      window.removeEventListener('realtime:auth-heal', onAuthHeal as any);
    };
  }, [startConnectSequence]);

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
          lastEventAtRef.current = Date.now();
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
          lastEventAtRef.current = Date.now();
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          if (oldStatus !== newStatus) {
            routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId: selectedProjectId } });
            if (newStatus === 'Complete') routeEvent(queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId: selectedProjectId } });
          }
        } catch {}
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${selectedProjectId}` }, () => {
        lastEventAtRef.current = Date.now();
        routeEvent(queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId: selectedProjectId } });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generations', filter: `project_id=eq.${selectedProjectId}` }, (payload) => {
        lastEventAtRef.current = Date.now();
        const newRecord = payload.new as any;
        const shotId = newRecord?.params?.shotId || newRecord?.params?.shot_id || newRecord?.metadata?.shotId || newRecord?.metadata?.shot_id;
        routeEvent(queryClient, { type: 'GENERATION_INSERT', payload: { projectId: selectedProjectId, shotId } });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shot_generations' }, (payload) => {
        lastEventAtRef.current = Date.now();
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


