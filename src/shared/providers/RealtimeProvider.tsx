import React from 'react';
import { runtimeConfig } from '@/shared/lib/config';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, diagnoseSupabaseState } from '@/integrations/supabase/client';
import { createProjectChannelManager, buildTaskUpdatesTopic } from '@/shared/realtime/projectChannelManager';
import { computeHealthy, shouldWatchdogTrigger } from '@/shared/realtime/healthMonitor';
import { getChannels, getSocketState, isSocketConnected, setAuth } from '@/shared/realtime/adapter';

type RealtimeState = {
  isConnected: boolean;
  connectionState: string | undefined;
  lastStateChangeAt: number | null;
  channels: Array<{ topic: string; state: string }>;
  eventCounter: number;
  testChannelHealth: () => Promise<{ sent: boolean; acked: boolean; error?: string }> | null;
};

const RealtimeContext = React.createContext<RealtimeState | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  
  // Safe project access with error boundary protection
  let selectedProjectId: string | null = null;
  let projectProviderReady = false;
  
  try {
    const projectContext = useProject();
    selectedProjectId = projectContext?.selectedProjectId || null;
    projectProviderReady = true;
    console.log('[ReconnectionFunctionDebug] ✅ ProjectProvider accessible, selectedProjectId:', selectedProjectId);
  } catch (error) {
    console.error('[ReconnectionFunctionDebug] ❌ ProjectProvider not ready during RealtimeProvider init:', error);
    console.log('[ReconnectionFunctionDebug] 🔄 Returning children without realtime until ProjectProvider is ready');
    // Return children without realtime functionality until ProjectProvider is ready
    return <>{children}</>;
  }
  
  // Additional safety check
  if (!projectProviderReady) {
    console.warn('[ReconnectionFunctionDebug] ⚠️ ProjectProvider not ready, skipping realtime initialization');
    return <>{children}</>;
  }
  
  const prevSelectedProjectIdRef = React.useRef<string | null>(null);
  const lastEventAtRef = React.useRef<number>(0);

  // Channel Manager
  const channelMgrRef = React.useRef<ReturnType<typeof createProjectChannelManager> | null>(null);
  if (!channelMgrRef.current) {
    channelMgrRef.current = createProjectChannelManager(queryClient, () => {
          lastEventAtRef.current = Date.now();
    });
  }
  
  const [state, setState] = React.useState<RealtimeState>({
    isConnected: true,
    connectionState: undefined,
    lastStateChangeAt: null,
    channels: [],
    eventCounter: 0,
    testChannelHealth: null,
  });

  // Auth → direct realtime connection
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        (supabase as any)?.realtime?.setAuth?.(session?.access_token ?? null);
        (supabase as any)?.realtime?.connect?.();
            } catch {}
    })();
    const sub = supabase.auth.onAuthStateChange((_evt, sess) => {
      try {
        (supabase as any)?.realtime?.setAuth?.(sess?.access_token ?? null);
        (supabase as any)?.realtime?.connect?.();
            } catch {}
    });
    return () => {
      active = false;
      try { sub.data.subscription.unsubscribe(); } catch {}
    };
  }, []);

  // Project channel join/leave
  React.useEffect(() => {
    const prevProjectId = prevSelectedProjectIdRef.current;
    const currentProjectId = selectedProjectId;
    if (prevProjectId === currentProjectId) return;
    prevSelectedProjectIdRef.current = currentProjectId;

    if (!currentProjectId) {
      channelMgrRef.current?.leave();
          return;
        }
        
    // Force refresh on project switch
    queryClient.invalidateQueries({ queryKey: ['task-status-counts', currentProjectId], refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', currentProjectId], refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', currentProjectId], refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: ['unified-generations'], refetchType: 'active' });

    // Join channel
    (async () => {
      const status = await channelMgrRef.current?.join(currentProjectId);
      console.warn('[RealtimeRefactor] Project channel join result:', status);
    })();
  }, [selectedProjectId, queryClient]);

  // Visibility / pageshow signals → direct reconnection
  React.useEffect(() => {
    if (runtimeConfig.REALTIME_ENABLED === false) return;
    const onVisibilityRecover = async () => {
      if (document.visibilityState === 'visible' && selectedProjectId) {
        try { (window as any).__VIS_CHANGE_AT__ = Date.now(); } catch {}
        console.warn('[RealtimeRefactor] Tab resumed - forcing full reconnection');
        
        // 1. Refresh auth token and force disconnect/connect cycle
        try {
          const { data: { session } } = await supabase.auth.getSession();
          (supabase as any)?.realtime?.setAuth?.(session?.access_token ?? null);
          (supabase as any)?.realtime?.disconnect?.(); 
          await new Promise(r => setTimeout(r, 100));
          (supabase as any)?.realtime?.connect?.();
        } catch {}
        
        // 2. Force channel rejoin immediately
        setTimeout(async () => {
          const status = await channelMgrRef.current?.join(selectedProjectId);
          console.warn('[RealtimeRefactor] Channel rejoin result:', status);
          
          // 3. Force query refresh to sync any missed updates
          queryClient.invalidateQueries({ queryKey: ['task-status-counts', selectedProjectId], refetchType: 'active' });
          queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId], refetchType: 'active' });
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId], refetchType: 'active' });
          queryClient.invalidateQueries({ queryKey: ['unified-generations'], refetchType: 'active' });
          
          // 4. Run comprehensive diagnostics to detect any broken functionality
          setTimeout(async () => {
            try {
              await diagnoseSupabaseState();
            } catch (e) {
              console.error('[ReconnectionFunctionDebug] ❌ Diagnostics failed:', e);
            }
          }, 1000); // Delay to let reconnection settle
        }, 200);
      }
    };
    
    const onPageShow = () => onVisibilityRecover();
    
    document.addEventListener('visibilitychange', onVisibilityRecover);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityRecover);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [selectedProjectId, queryClient]);

  // Ensure only one channel per topic (safety)
  React.useEffect(() => {
    if (runtimeConfig.REALTIME_ENABLED === false) return;
    const topic = selectedProjectId ? buildTaskUpdatesTopic(selectedProjectId) : null;
    if (!topic) return;
    try {
      const channels = getChannels();
        const dups = channels.filter((c: any) => c.topic === topic);
        if (dups.length > 1) {
        channelMgrRef.current?.leave();
        channelMgrRef.current?.join(selectedProjectId!);
      }
    } catch {}
  }, [selectedProjectId]);

  // State snapshot for UI
  React.useEffect(() => {
    if (runtimeConfig.REALTIME_ENABLED === false) return;
    const interval = setInterval(() => {
      try {
        const rawChannels = getChannels() || [];
        const hasJoined = rawChannels.some((c: any) => c?.state === 'joined');
        const isConnected = hasJoined || isSocketConnected();
        const connectionState = hasJoined ? 'joined' : getSocketState();
        const channels = rawChannels.map((c: any) => ({ topic: c.topic, state: c.state }));
        
        const eventCounter = channelMgrRef.current?.getEventCounter() || 0;
        const testChannelHealth = channelMgrRef.current?.testChannelHealth || null;

        setState((prev) => (
          connectionState !== prev.connectionState || isConnected !== prev.isConnected || eventCounter !== prev.eventCounter
            ? { isConnected, connectionState, lastStateChangeAt: Date.now(), channels, eventCounter, testChannelHealth }
            : { ...prev, channels, eventCounter, testChannelHealth }
        ));
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Watchdog: healthy but no recent events → refresh queries
  React.useEffect(() => {
    if (runtimeConfig.REALTIME_ENABLED === false) return;
    const interval = setInterval(() => {
      if (!selectedProjectId) return;
      const topic = buildTaskUpdatesTopic(selectedProjectId);
      const healthy = computeHealthy(topic, lastEventAtRef.current);
      if (healthy && shouldWatchdogTrigger(lastEventAtRef.current, { maxSilenceMs: 60000 })) {
        queryClient.invalidateQueries({ queryKey: ['task-status-counts', selectedProjectId], refetchType: 'active' });
        queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId], refetchType: 'active' });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId], refetchType: 'active' });
        queryClient.invalidateQueries({ queryKey: ['unified-generations'], refetchType: 'active' });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedProjectId, queryClient]);

  return (
    <RealtimeContext.Provider value={state}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) return { 
    isConnected: runtimeConfig.REALTIME_ENABLED !== false, 
    connectionState: 'unknown', 
    lastStateChangeAt: null, 
    channels: [], 
    eventCounter: 0, 
    testChannelHealth: null 
  };
  return ctx;
}


