import { __WS_INSTRUMENTATION_ENABLED__, __CORRUPTION_TRACE_ENABLED__ } from '@/integrations/supabase/config/env';
import { captureRealtimeSnapshot } from '@/integrations/supabase/utils/snapshot';
import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';

export function installWindowOnlyInstrumentation() {
  // InstrumentationManager removed - calling legacy function directly
  installWindowOnlyInstrumentationLegacy();
  return;
}

// Legacy function for backward compatibility - now delegates to InstrumentationManager
export function installWindowOnlyInstrumentationLegacy() {
  if (typeof window === 'undefined') return;

  // localStorage monitoring removed - not needed in production

  // Global error capture (Supabase realtime related)
  if (__CORRUPTION_TRACE_ENABLED__) {
    const originalOnError = window.onerror;
    const originalOnUnhandledRejection = window.onunhandledrejection;

    window.onerror = function(message, source, lineno, colno, error) {
      const errorInfo = {
        message: String(message),
        source: String(source),
        lineno,
        colno,
        error: error ? { name: (error as any).name, message: (error as any).message, stack: (error as any).stack } : null,
        timestamp: Date.now(),
        userAgent: navigator.userAgent.slice(0, 100)
      };

      if (source && source.includes('supabase-js.js') && lineno === 2372) {
        console.error('[RealtimeCorruptionTrace] 🎯 SUPABASE ERROR CAPTURED!', {
          ...errorInfo,
          realtimeSnapshot: captureRealtimeSnapshot(),
          corruptionTimeline: [...__CORRUPTION_TIMELINE__]
        });
        addCorruptionEvent('SUPABASE_ERROR_2372', errorInfo);
      } else if (message && (String(message).includes('supabase') || String(message).includes('realtime') || String(message).includes('websocket'))) {
        console.log('[RealtimeCorruptionTrace] 🔍 RELATED ERROR:', errorInfo);
        addCorruptionEvent('RELATED_ERROR', errorInfo);
      }

      if (originalOnError) return originalOnError.call(this, message as any, source as any, lineno as any, colno as any, error as any);
      return false;
    };

    window.onunhandledrejection = function(event: PromiseRejectionEvent) {
      const rejectionInfo = {
        reason: (event as any).reason,
        promise: '[PROMISE_OBJECT]',
        timestamp: Date.now()
      };

      if ((event as any).reason && (String((event as any).reason).includes('supabase') || String((event as any).reason).includes('realtime'))) {
        addCorruptionEvent('UNHANDLED_REJECTION', rejectionInfo);
      }

      if (originalOnUnhandledRejection) return originalOnUnhandledRejection.call(this, event);
    };
  }

  if (!__WS_INSTRUMENTATION_ENABLED__) {
    return;
  }

  const key = '__WS_PROBE_INSTALLED__';
  if ((window as any)[key]) return;

  (window as any)[key] = true;
  const OriginalWS = window.WebSocket;

  let wsCreationCount = 0;
  let wsDestroyedCount = 0;

  (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
    wsCreationCount++;
    const wsId = wsCreationCount;

    const isSupabaseRealtime = url.includes('supabase.co/realtime');
    const isSupabaseWebSocket = url.includes('supabase.co') && url.includes('websocket');

    let ws: WebSocket;
    try {
      ws = protocols ? new OriginalWS(url, protocols) : new OriginalWS(url);

      if (isSupabaseRealtime || isSupabaseWebSocket) {
        (window as any).__SUPABASE_WEBSOCKET_INSTANCES__ = (window as any).__SUPABASE_WEBSOCKET_INSTANCES__ || [];
        (window as any).__SUPABASE_WEBSOCKET_INSTANCES__.push({
          wsId,
          url,
          protocols,
          createdAt: Date.now(),
          websocketRef: ws
        });
      }

      const createdAt = Date.now();

      ws.addEventListener('message', (event: MessageEvent) => {
        if (isSupabaseRealtime || isSupabaseWebSocket) {
          try {
            const messageData = typeof event.data === 'string' ? event.data : '[BINARY_DATA]';
            if (typeof messageData === 'string') {
              try {
                const parsed = JSON.parse(messageData);
                if ((parsed as any).event) {
                  addCorruptionEvent('PHOENIX_MESSAGE', {
                    event: (parsed as any).event,
                    topic: (parsed as any).topic,
                    ref: (parsed as any).ref,
                    payload: (parsed as any).payload ? Object.keys((parsed as any).payload) : null
                  });
                }
              } catch {}
            }
            const snap: any = (window as any).__REALTIME_SNAPSHOT__ || {};
            (window as any).__REALTIME_SNAPSHOT__ = { ...snap, lastPhoenixMsgAt: Date.now() };
          } catch {}
        }
      });

      ws.addEventListener('close', () => {
        wsDestroyedCount++;
      });
    } catch (error: any) {
      throw error;
    }

    return ws as any;
  } as any;

  // Global fetch instrumentation removed - not needed in production
}


