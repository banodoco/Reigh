// Snapshot utilities for realtime state inspection

// Helper: locate the effective Supabase WebSocket regardless of where it is stored
export function getEffectiveRealtimeSocket(): any {
  try {
    const rt: any = (window as any)?.supabase?.realtime;
    if (!rt) return null;
    const direct = rt?.socket;
    if (direct && typeof direct.readyState === 'number') return direct;
    const transport = rt?.conn?.transport;
    if (transport && typeof transport.readyState === 'number') return transport;
    const instances = (window as any).__SUPABASE_WEBSOCKET_INSTANCES__ || [];
    for (const inst of instances) {
      const ref = inst?.websocketRef;
      const url = inst?.url || ref?.url || '';
      if (ref && typeof ref.readyState === 'number' && typeof url === 'string' && url.includes('supabase.co/realtime')) {
        // Prefer an OPEN socket if available
        if (ref.readyState === 1) return ref;
      }
    }
    // Fallback: return any tracked supabase ws if present
    const anyInst = instances.find((i: any) => (i?.url || i?.websocketRef?.url || '').includes('supabase.co/realtime'));
    return anyInst?.websocketRef || null;
  } catch {
    return null;
  }
}

// Capture detailed realtime state as JSON (not "Object")
export function captureRealtimeSnapshot(): any {
  try {
    const rt = (window as any)?.supabase?.realtime;
    if (!rt) return { error: 'NO_REALTIME_CLIENT' };
    
    const channels = rt.channels || {};
    const channelDetails = Object.keys(channels).map(topic => {
      const ch = channels[topic];
      return {
        topic,
        state: ch?.state,
        joinRef: ch?.joinRef,
        ref: ch?.ref,
        bindings: [] // DISABLED: Was accessing bindings and causing corruption
      };
    });
    
    return {
      isConnected: rt.isConnected?.(),
      socket: rt.socket ? {
        readyState: rt.socket.readyState,
        url: rt.socket.url,
        protocol: rt.socket.protocol
      } : null,
      conn: rt.conn ? {
        transport: rt.conn.transport ? {
          readyState: rt.conn.transport.readyState,
          url: rt.conn.transport.url
        } : null,
        connectionState: rt.conn.connectionState
      } : null,
      channelCount: Object.keys(channels).length,
      channelDetails,
      effectiveSocket: getEffectiveRealtimeSocket() ? {
        readyState: getEffectiveRealtimeSocket().readyState,
        url: getEffectiveRealtimeSocket().url
      } : null,
      timestamp: Date.now()
    };
  } catch (error) {
    return { error: 'SNAPSHOT_FAILED', message: (error as any)?.message };
  }
}


