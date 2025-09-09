// Corruption timeline ring buffer and helper
import { __CORRUPTION_TRACE_ENABLED__ } from '@/integrations/supabase/config/env';

export let __CORRUPTION_TIMELINE__: Array<{ event: string; timestamp: number; data: any; stack?: string }> = [];

export function addCorruptionEvent(event: string, data: any = {}) {
  if (!__CORRUPTION_TRACE_ENABLED__) return;
  __CORRUPTION_TIMELINE__.push({
    event,
    timestamp: Date.now(),
    data,
    stack: new Error().stack?.split('\n').slice(2, 5).join(' -> ')
  });
  if (__CORRUPTION_TIMELINE__.length > 100) __CORRUPTION_TIMELINE__.shift();
}


