import { __CORRUPTION_TRACE_ENABLED__, __REALTIME_DOWN_FIX_ENABLED__ } from '@/integrations/supabase/config/env';
import { captureRealtimeSnapshot, getEffectiveRealtimeSocket } from '@/integrations/supabase/utils/snapshot';
import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';
import { InstrumentationManager } from '../InstrumentationManager';

export function installRealtimeInstrumentation(supabase: any) {
  // Use InstrumentationManager for centralized control
  return InstrumentationManager.installRealtimeWithClient(supabase);
}

// Legacy function for backward compatibility - now delegates to InstrumentationManager
export function installRealtimeInstrumentationLegacy(supabase: any) {
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
          console.log('[RealtimeDownFix] 🔍 DETECTED realtime=down, attempting reconnect...', { 
            message: message.slice(0, 100) + '...',
            timestamp: Date.now()
          });
          
          // Use async IIFE to handle dynamic import
          (async () => {
            try {
              console.log('[RealtimeDownFix] 📦 Attempting to import ReconnectScheduler...');
              const module = await import('@/integrations/supabase/reconnect/ReconnectScheduler');
              const { getReconnectScheduler } = module;
              console.log('[RealtimeDownFix] ✅ ReconnectScheduler module loaded successfully');
              
              console.log('[RealtimeDownFix] 🏭 Getting scheduler instance...');
              const scheduler = getReconnectScheduler();
              console.log('[RealtimeDownFix] ✅ Scheduler instance obtained:', { 
                schedulerExists: !!scheduler,
                schedulerType: typeof scheduler,
                hasRequestReconnect: typeof scheduler?.requestReconnect
              });
              
              console.log('[RealtimeDownFix] 📞 Calling requestReconnect...');
              scheduler.requestReconnect({
                source: 'ConsoleWarnInterceptor',
                reason: 'realtime=down detected in console output',
                priority: 'medium'
              });
              console.log('[RealtimeDownFix] ✅ requestReconnect called successfully');
              
            } catch (error) {
              console.error('[RealtimeDownFix] ❌ DETAILED ERROR ANALYSIS:', {
                error,
                errorMessage: error?.message,
                errorStack: error?.stack,
                errorName: error?.name,
                errorConstructor: error?.constructor?.name,
                errorKeys: error ? Object.keys(error) : [],
                errorStringified: JSON.stringify(error, null, 2),
                timestamp: Date.now()
              });
            }
          })();
        }
        return originalConsoleWarn.apply(this, args as any);
      } as any;
    }
  }
}


