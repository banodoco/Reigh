import { supabase } from '@/integrations/supabase/client';

export type ChannelRef = ReturnType<typeof supabase.channel>;

export type SocketState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'cooldown' | 'error' | 'unknown';

export class SupabaseRealtimeAdapter {
  connect(token?: string | null) {
    try { (supabase as any)?.realtime?.setAuth?.(token ?? null); } catch {}
    try { (supabase as any)?.realtime?.connect?.(); } catch {}
  }

  disconnect() {
    try { (supabase as any)?.realtime?.disconnect?.(); } catch {}
  }

  setAuth(token?: string | null) {
    try { (supabase as any)?.realtime?.setAuth?.(token ?? null); } catch {}
  }

  getChannels(): any[] { return ((supabase as any)?.getChannels?.() || []) as any[]; }
  removeChannel(ch: any) { try { (supabase as any)?.removeChannel?.(ch); } catch {} }

  channel(topic: string) {
    return supabase.channel(topic, { config: { broadcast: { self: false, ack: false } } });
  }

  getSocketConnectionState(): { isConnected: boolean; connectionState?: string } {
    const socket: any = (supabase as any)?.realtime?.socket;
    return { isConnected: !!socket?.isConnected?.(), connectionState: socket?.connectionState };
  }
}


