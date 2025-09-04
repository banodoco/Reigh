import { supabase } from '@/integrations/supabase/client';
import { createLogger } from './logger';

const log = createLogger('RealtimeAdapter');

export type ChannelType = ReturnType<typeof supabase.channel>;

export function setAuth(token: string | null | undefined) {
  try {
    (supabase as any)?.realtime?.setAuth?.(token ?? null);
    log.debug('setAuth called');
  } catch (e) {
    log.warn('setAuth failed', e);
  }
}

export function connect() {
  try {
    (supabase as any)?.realtime?.connect?.();
    log.debug('connect called');
  } catch (e) {
    log.warn('connect failed', e);
  }
}

export function disconnect() {
  try {
    (supabase as any)?.realtime?.disconnect?.();
    log.debug('disconnect called');
  } catch (e) {
    log.warn('disconnect failed', e);
  }
}

export function channel(topic: string, config?: any) {
  return supabase.channel(topic, config);
}

export function removeChannel(ch: any) {
  try {
    (supabase as any).removeChannel?.(ch);
  } catch (e) {
    log.warn('removeChannel failed', e);
  }
}

export function getChannels(): any[] {
  try {
    return ((supabase as any)?.getChannels?.() as any[]) || [];
  } catch {
    return [];
  }
}

export function isSocketConnected(): boolean {
  try {
    const rt: any = (supabase as any)?.realtime;
    const sock: any = rt?.socket || rt?.conn;
    return !!sock?.isConnected?.();
  } catch {
    return false;
  }
}

export function getSocketState(): string | undefined {
  try {
    const rt: any = (supabase as any)?.realtime;
    const sock: any = rt?.socket || rt?.conn;
    return sock?.connectionState;
  } catch {
    return undefined;
  }
}


