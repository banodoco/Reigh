/**
 * Debug helpers for monitoring realtime connection health
 * These are exposed to the browser console for debugging
 */

export function initRealtimeDebugHelpers() {
  if (typeof window === 'undefined') return;

  const helpers = {
    /**
     * Check current realtime health status
     */
    checkHealth: () => {
      const supabase = (window as any).supabase;
      const diagnostics = (window as any).__REALTIME_DIAGNOSTICS__;
      const socket: any = supabase?.realtime?.socket;
      const channels = supabase?.getChannels ? supabase.getChannels() : [];
      
      const now = Date.now();
      const lastEventAt = diagnostics?.lastEventAt || 0;
      const timeSinceLastEvent = lastEventAt ? Math.round((now - lastEventAt) / 1000) : null;
      
      const health = {
        socket: {
          connected: !!socket?.isConnected?.(),
          state: socket?.connectionState || 'unknown',
        },
        channels: {
          count: channels.length,
          joined: channels.filter((c: any) => c.state === 'joined').length,
          details: channels.map((c: any) => ({
            topic: c.topic,
            state: c.state,
            bindings: c.bindings?.length || 0
          }))
        },
        diagnostics: {
          channelState: diagnostics?.channelState,
          lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : 'never',
          timeSinceLastEvent: timeSinceLastEvent !== null ? `${timeSinceLastEvent}s` : 'never',
          eventsFlowing: timeSinceLastEvent !== null && timeSinceLastEvent < 30,
          reconnectAttempts: diagnostics?.reconnectAttempts || 0,
          channelRecreatedCount: diagnostics?.channelRecreatedCount || 0,
          noBindingIncidents: diagnostics?.noBindingIncidents || 0,
          eventsReceivedByType: diagnostics?.eventsReceivedByType || {},
          lastError: diagnostics?.lastError
        },
        overall: 'unknown' as 'healthy' | 'degraded' | 'broken' | 'unknown'
      };
      
      // Determine overall health
      if (!socket?.isConnected?.()) {
        health.overall = 'broken';
      } else if (channels.length === 0 || channels.every((c: any) => c.state !== 'joined')) {
        health.overall = 'broken';
      } else if (channels.some((c: any) => c.state === 'joined' && c.bindings?.length === 0)) {
        health.overall = 'broken'; // Zero bindings is critical
      } else if (timeSinceLastEvent !== null && timeSinceLastEvent > 60) {
        health.overall = 'degraded';
      } else if (timeSinceLastEvent !== null && timeSinceLastEvent < 30) {
        health.overall = 'healthy';
      }
      
      // Color code the output
      const color = health.overall === 'healthy' ? 'color: green' : 
                   health.overall === 'degraded' ? 'color: orange' : 
                   'color: red';
      
      console.log('%c[Realtime Health Check]', color, health);
      return health;
    },
    
    /**
     * Force a recovery attempt
     */
    forceRecovery: () => {
      console.log('[Realtime Debug] Forcing recovery...');
      window.dispatchEvent(new CustomEvent('realtime:force-recovery'));
      return 'Recovery triggered';
    },
    
    /**
     * Monitor health continuously
     */
    startMonitoring: (intervalMs = 5000) => {
      if ((window as any).__realtimeMonitorInterval) {
        clearInterval((window as any).__realtimeMonitorInterval);
      }
      
      console.log(`[Realtime Debug] Starting health monitoring every ${intervalMs}ms`);
      (window as any).__realtimeMonitorInterval = setInterval(() => {
        const health = helpers.checkHealth();
        if (health.overall !== 'healthy') {
          console.warn('[Realtime Monitor] Issues detected:', health);
        }
      }, intervalMs);
      
      return 'Monitoring started';
    },
    
    /**
     * Stop monitoring
     */
    stopMonitoring: () => {
      if ((window as any).__realtimeMonitorInterval) {
        clearInterval((window as any).__realtimeMonitorInterval);
        (window as any).__realtimeMonitorInterval = null;
        console.log('[Realtime Debug] Monitoring stopped');
        return 'Monitoring stopped';
      }
      return 'No monitoring active';
    },
    
    /**
     * Get detailed channel info
     */
    inspectChannels: () => {
      const supabase = (window as any).supabase;
      const channels = supabase?.getChannels ? supabase.getChannels() : [];
      
      channels.forEach((channel: any) => {
        console.group(`Channel: ${channel.topic}`);
        console.log('State:', channel.state);
        console.log('Bindings:', channel.bindings?.length || 0);
        if (channel.bindings?.length > 0) {
          console.log('Handler types:', channel.bindings.map((b: any) => b.type));
        }
        console.log('Raw channel:', channel);
        console.groupEnd();
      });
      
      return `${channels.length} channels inspected`;
    },
    
    /**
     * Reset all realtime connections
     */
    hardReset: async () => {
      console.warn('[Realtime Debug] Performing hard reset...');
      const supabase = (window as any).supabase;
      
      try {
        // Disconnect socket
        supabase?.realtime?.disconnect?.();
        
        // Remove all channels
        const channels = supabase?.getChannels ? supabase.getChannels() : [];
        channels.forEach((c: any) => {
          try {
            c.unsubscribe();
            supabase.removeChannel(c);
          } catch {}
        });
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Reconnect
        supabase?.realtime?.connect?.();
        
        // Trigger recovery
        window.dispatchEvent(new CustomEvent('realtime:force-recovery'));
        
        console.log('[Realtime Debug] Hard reset complete');
        return 'Reset complete - recovery triggered';
      } catch (error) {
        console.error('[Realtime Debug] Reset failed:', error);
        return 'Reset failed';
      }
    }
  };
  
  // Expose to window
  (window as any).realtimeDebug = helpers;
  
  // Also add a quick status function
  (window as any).rt = () => helpers.checkHealth();
  
  console.log('%c[Realtime Debug] Helpers initialized. Use:', 'color: blue', {
    'realtimeDebug.checkHealth()': 'Check current health',
    'realtimeDebug.forceRecovery()': 'Force recovery',
    'realtimeDebug.startMonitoring()': 'Start monitoring',
    'realtimeDebug.inspectChannels()': 'Inspect channels',
    'realtimeDebug.hardReset()': 'Hard reset connections',
    'rt()': 'Quick health check'
  });
}
