import { __CORRUPTION_TRACE_ENABLED__, __REALTIME_DOWN_FIX_ENABLED__ } from '@/integrations/supabase/config/env';
import { captureRealtimeSnapshot, getEffectiveRealtimeSocket } from '@/integrations/supabase/utils/snapshot';
import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';

export function installRealtimeInstrumentation(supabase: any) {
  if (typeof window === 'undefined' || !supabase?.realtime) return;
  const realtime: any = supabase.realtime;

  // Reference mutation tracking for realtime.socket and conn.transport
  try {
    if (realtime && !realtime.__REFERENCE_TRACKING_INSTALLED__) {
      let _socket = realtime.socket;
      Object.defineProperty(realtime, 'socket', {
        get() { return _socket; },
        set(value) {
          const before = captureRealtimeSnapshot();
          if (_socket && !value) {
            console.error('[RealtimeCorruptionTrace] 🎯 realtime.socket SET TO NULL!', { previousValue: _socket, newValue: value, stackTrace: new Error().stack, realtimeStateBefore: before, corruptionTimeline: [...__CORRUPTION_TIMELINE__], timestamp: Date.now() });
            addCorruptionEvent('SOCKET_SET_TO_NULL', { previousValue: _socket, newValue: value });
          } else if (!_socket && value) {
            console.log('[RealtimeCorruptionTrace] ✅ realtime.socket SET TO WEBSOCKET:', { newValue: value, readyState: (value as any)?.readyState, url: (value as any)?.url, realtimeStateBefore: before, timestamp: Date.now() });
            addCorruptionEvent('SOCKET_SET_TO_WEBSOCKET', { newValue: value });
          } else if (_socket !== value) {
            console.error('[RealtimeCorruptionTrace] 🔄 realtime.socket REPLACED:', { previousValue: _socket, newValue: value, stackTrace: new Error().stack, realtimeStateBefore: before, timestamp: Date.now() });
            addCorruptionEvent('SOCKET_REPLACED', { previousValue: _socket, newValue: value });
          }
          _socket = value as any;
        },
        configurable: true
      });

      if (realtime.conn) {
        let _transport = realtime.conn.transport;
        Object.defineProperty(realtime.conn, 'transport', {
          get() { return _transport; },
          set(value) {
            const before = captureRealtimeSnapshot();
            if (_transport && !value) {
              console.error('[RealtimeCorruptionTrace] 🎯 conn.transport SET TO NULL!', { previousValue: _transport, newValue: value, stackTrace: new Error().stack, realtimeStateBefore: before, corruptionTimeline: [...__CORRUPTION_TIMELINE__], timestamp: Date.now() });
              addCorruptionEvent('TRANSPORT_SET_TO_NULL', { previousValue: _transport, newValue: value });
            } else if (!_transport && value) {
              console.log('[RealtimeCorruptionTrace] ✅ conn.transport SET TO WEBSOCKET:', { newValue: value, readyState: (value as any)?.readyState, url: (value as any)?.url, realtimeStateBefore: before, timestamp: Date.now() });
              addCorruptionEvent('TRANSPORT_SET_TO_WEBSOCKET', { newValue: value });
            } else if (_transport !== value) {
              console.error('[RealtimeCorruptionTrace] 🔄 conn.transport REPLACED:', { previousValue: _transport, newValue: value, stackTrace: new Error().stack, realtimeStateBefore: before, timestamp: Date.now() });
              addCorruptionEvent('TRANSPORT_REPLACED', { previousValue: _transport, newValue: value });
            }
            _transport = value as any;
          },
          configurable: true
        });
      }
      realtime.__REFERENCE_TRACKING_INSTALLED__ = true;
    }
  } catch (error) {
    console.error('[ReferenceLoss] ❌ Failed to install reference tracking:', error);
  }

  // Heuristic for realtime=down to dispatch provider-led heal
  if (__REALTIME_DOWN_FIX_ENABLED__ && typeof window !== 'undefined') {
    if (!(console as any).__WARN_INTERCEPTED__) {
      (console as any).__WARN_INTERCEPTED__ = true;
      const originalConsoleWarn = console.warn;
      console.warn = function(...args: any[]) {
        const message = args.join(' ');
        if (message.includes('realtime=down') || message.includes('Polling boosted due to realtime=down')) {
          console.error('[RealtimeDownFix] 🎯 REALTIME=DOWN TRIGGER DETECTED:', { fullMessage: message, messageArgs: args, triggerSource: 'console.warn interception', timestamp: Date.now() });
          try {
            window.dispatchEvent(new CustomEvent('realtime:auth-heal'));
          } catch {}
        }
        return originalConsoleWarn.apply(this, args as any);
      } as any;
    }
  }
}


