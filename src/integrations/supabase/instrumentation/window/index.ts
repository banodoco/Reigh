import { __WS_INSTRUMENTATION_ENABLED__, __CORRUPTION_TRACE_ENABLED__ } from '@/integrations/supabase/config/env';
import { captureRealtimeSnapshot } from '@/integrations/supabase/utils/snapshot';
import { __CORRUPTION_TIMELINE__, addCorruptionEvent } from '@/integrations/supabase/utils/timeline';
import { InstrumentationManager } from '../InstrumentationManager';

export function installWindowOnlyInstrumentation() {
  // Use InstrumentationManager for centralized control
  InstrumentationManager.install('window');
  InstrumentationManager.install('localStorage');
  InstrumentationManager.install('fetch');
  InstrumentationManager.install('errorCapture');
  return;
}

// Legacy function for backward compatibility - now delegates to InstrumentationManager
export function installWindowOnlyInstrumentationLegacy() {
  if (typeof window === 'undefined') return;

  // DEBUGGING: Monitor localStorage operations for lastSelectedProjectId
  try {
    if (!(window as any).__LS_MON_INSTALLED__ && typeof localStorage !== 'undefined') {
      (window as any).__LS_MON_INSTALLED__ = true;
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;
      const originalClear = localStorage.clear;
      localStorage.setItem = function(key, value) {
        if (key === 'lastSelectedProjectId') {
          console.error(`[ProjectContext:FastResume] 🔍 localStorage.setItem('${key}', '${value}')`, new Error().stack?.split('\n').slice(1, 4));
        }
        return originalSetItem.call(this, key, value);
      } as any;
      localStorage.removeItem = function(key) {
        if (key === 'lastSelectedProjectId') {
          console.error(`[ProjectContext:FastResume] 🔍 localStorage.removeItem('${key}')`, new Error().stack?.split('\n').slice(1, 4));
        }
        return originalRemoveItem.call(this, key);
      } as any;
      localStorage.clear = function() {
        console.error(`[ProjectContext:FastResume] 🚨 localStorage.clear() called!`, new Error().stack?.split('\n').slice(1, 4));
        return originalClear.call(this);
      } as any;
      console.error('[ProjectContext:FastResume] 🔍 localStorage monitoring installed');
    }
  } catch {}

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
        console.error('[RealtimeCorruptionTrace] 🔍 RELATED ERROR:', errorInfo);
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
        console.error('[RealtimeCorruptionTrace] 🔍 UNHANDLED REJECTION:', rejectionInfo);
        addCorruptionEvent('UNHANDLED_REJECTION', rejectionInfo);
      }

      if (originalOnUnhandledRejection) return originalOnUnhandledRejection.call(this, event);
    };

    console.error('[RealtimeCorruptionTrace] 🔧 Global error capture installed');
  }

  if (!__WS_INSTRUMENTATION_ENABLED__) {
    console.error('[ReconnectionIssue] ⚠️ Skipping WebSocket instrumentation (disabled by env)');
    return;
  }

  console.error('[ReconnectionIssue] 🚨 WEBSOCKET INSTRUMENTATION SETUP:', {
    windowExists: typeof window !== 'undefined',
    WebSocketExists: !!window.WebSocket,
    timestamp: Date.now()
  });

  const key = '__WS_PROBE_INSTALLED__';
  console.error('[WebSocketInstrumentation] 🔧 INSTRUMENTATION CHECK:', {
    alreadyInstalled: !!(window as any)[key],
    originalWebSocket: typeof window.WebSocket,
    webSocketToString: window.WebSocket?.toString?.(),
    timestamp: Date.now()
  });

  if ((window as any)[key]) return;

  (window as any)[key] = true;
  const OriginalWS = window.WebSocket;
  console.error('[ReconnectionIssue] 🚨 WEBSOCKET INSTRUMENTATION INSTALLED');

  try {
    const performanceEntries = performance.getEntriesByType('resource');
    const wsEntries = performanceEntries.filter(entry =>
      (entry as any).name.includes('websocket') || (entry as any).name.includes('wss://') || (entry as any).name.includes('ws://')
    );
    console.error('[WebSocketInstrumentation] 🔍 EXISTING WEBSOCKET CHECK:', {
      existingWebSocketResources: wsEntries.length,
      resources: wsEntries.map(e => ({ name: (e as any).name, startTime: (e as any).startTime })),
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('[WebSocketInstrumentation] ❌ EXISTING WEBSOCKET CHECK FAILED:', error?.message);
  }

  let wsCreationCount = 0;
  let wsDestroyedCount = 0;

  (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
    wsCreationCount++;
    const wsId = wsCreationCount;

    const isSupabaseRealtime = url.includes('supabase.co/realtime');
    const isSupabaseWebSocket = url.includes('supabase.co') && url.includes('websocket');

    console.error('[WebSocketCreation] 🚨 WEBSOCKET CONSTRUCTOR CALLED!', {
      wsId,
      url,
      protocols,
      totalCreated: wsCreationCount,
      totalDestroyed: wsDestroyedCount,
      activeCount: wsCreationCount - wsDestroyedCount,
      timestamp: Date.now(),
      urlMatches: {
        isSupabaseRealtime,
        isSupabaseWebSocket,
        isWebSocketProtocol: url.startsWith('wss://') || url.startsWith('ws://'),
        containsWebsocket: url.includes('websocket'),
        fullUrl: url
      },
      callerStack: new Error().stack?.split('\n').slice(1, 8),
      windowLocation: window.location.href,
      memoryUsage: (performance as any).memory ? {
        used: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024)
      } : 'unavailable'
    });

    let ws: WebSocket;
    try {
      ws = protocols ? new OriginalWS(url, protocols) : new OriginalWS(url);

      if (isSupabaseRealtime || isSupabaseWebSocket) {
        console.error('[WebSocketCreation] 🎯 SUPABASE WEBSOCKET DETECTED:', {
          wsId,
          url,
          protocols,
          timestamp: Date.now(),
          fullStack: new Error().stack
        });
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
      let stability = { opens: 0, errors: 0, closes: 0, messages: 0 } as any;

      console.error('[WebSocketCreation] ✅ WEBSOCKET INSTANCE CREATED SUCCESSFULLY', {
        wsId,
        url,
        readyState: ws.readyState,
        readyStateText: ws.readyState === 0 ? 'CONNECTING' : ws.readyState === 1 ? 'OPEN' : ws.readyState === 2 ? 'CLOSING' : ws.readyState === 3 ? 'CLOSED' : 'UNKNOWN',
        timestamp: Date.now()
      });

      const stabilityMonitor = setInterval(() => {
        if (ws.readyState === WebSocket.CLOSED) {
          clearInterval(stabilityMonitor);
          return;
        }
        console.error('[WebSocketStability] 📊 WS HEALTH CHECK:', {
          wsId,
          url,
          readyState: ws.readyState,
          readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState],
          aliveTime: Date.now() - createdAt,
          stability,
          activeCount: wsCreationCount - wsDestroyedCount,
          memoryUsage: (performance as any).memory ? { used: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) } : 'unavailable',
          timestamp: Date.now()
        });
      }, 5000);

      ws.addEventListener('open', () => {
        stability.opens++;
        console.error('[WebSocketStability] ✅ WS OPENED:', { wsId, url, openTime: Date.now() - createdAt, stability, timestamp: Date.now() });
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        stability.messages++;
        if (isSupabaseRealtime || isSupabaseWebSocket) {
          try {
            const messageData = typeof event.data === 'string' ? event.data : '[BINARY_DATA]';
            const messagePreview = typeof messageData === 'string' ? messageData.slice(0, 100) : '[BINARY]';
            console.error('[SupabaseWebSocketDiag] 📨 WEBSOCKET MESSAGE RECEIVED:', {
              url: ws.url,
              readyState: ws.readyState,
              timestamp: Date.now(),
              messagePreview,
              messageType: typeof event.data,
              messageLength: typeof event.data === 'string' ? (event.data as string).length : 'unknown'
            });
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

      ws.addEventListener('error', (event) => {
        stability.errors++;
        console.error('[WebSocketStability] 🚨 WS ERROR:', { wsId, url, error: event, errorAfter: Date.now() - createdAt, stability, readyState: ws.readyState, timestamp: Date.now() });
      });

      ws.addEventListener('close', (event: CloseEvent) => {
        stability.closes++;
        wsDestroyedCount++;
        console.error('[WebSocketStability] 🔚 WS CLOSED:', {
          wsId,
          url,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          lifespan: Date.now() - createdAt,
          stability,
          totalDestroyed: wsDestroyedCount,
          activeCount: wsCreationCount - wsDestroyedCount,
          timestamp: Date.now()
        });
        clearInterval(stabilityMonitor);
      });
    } catch (error: any) {
      console.error('[WebSocketCreation] ❌ WEBSOCKET CREATION FAILED', { url, error: error?.message, errorType: typeof error, errorStack: error?.stack?.split('\n').slice(0, 5), timestamp: Date.now() });
      throw error;
    }

    console.error('[WebSocketCreation] 🔍 WEBSOCKET CREATED - CALLER ANALYSIS:', {
      url: url.slice(0, 100),
      isSupabaseRealtime: url.includes('supabase.co/realtime'),
      isTestWebSocket: url.includes('echo.websocket.org'),
      callerStack: new Error().stack?.split('\n').slice(2, 8).map(line => {
        const match = (line as string).match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        return match ? { function: match[1], file: match[2].split('/').pop(), line: match[3] } : (line as string).trim();
      }),
      timestamp: Date.now()
    });

    (ws as any).addEventListener('open', () => console.error('[ReconnectionIssue] 🔥 [DeadModeInvestigation] WS open', { url, timestamp: Date.now() }));
    (ws as any).addEventListener('error', (e: any) => {
      console.error('[WebSocketDebug] 🔥 WS ERROR EVENT:', { url, error: e, readyState: (ws as any).readyState, timestamp: Date.now() });
      try {
        const { trackWebSocketFailure } = require('@/shared/lib/webSocketFailureTracker');
        trackWebSocketFailure(url, `WebSocket error event: ${e}`, (ws as any).readyState);
      } catch {}
    });
    (ws as any).addEventListener('close', (e: CloseEvent) => {
      console.error('[WebSocketDebug] 🔥 WS CLOSE EVENT:', { url, code: e?.code, reason: e?.reason, wasClean: e?.wasClean, readyState: (ws as any).readyState, timestamp: Date.now() });
      if ((e as any)?.code !== 1000) {
        try {
          const { trackWebSocketFailure } = require('@/shared/lib/webSocketFailureTracker');
          trackWebSocketFailure(url, `WebSocket closed abnormally: code=${(e as any)?.code}, reason=${(e as any)?.reason}`, (ws as any).readyState);
        } catch {}
      }
    });

    return ws as any;
  } as any;

  // Global fetch instrumentation
  try {
    const originalFetch = window.fetch.bind(window);
    if (!(window as any).__FETCH_INSTRUMENTED__) {
      (window as any).__FETCH_INSTRUMENTED__ = true;
      window.fetch = async (...args: any[]) => {
        const start = performance.now();
        const input = args[0];
        const url = typeof input === 'string' ? input : (input?.url || 'unknown');
        const isSupabase = typeof url === 'string' && url.includes('.supabase.co');
        const traceId = Math.random().toString(36).slice(2, 10);
        console.error('[ResumeTrace][Fetch] ▶️ START', { traceId, url, isSupabase, timestamp: Date.now() });
        try {
          const res = await originalFetch(...(args as any));
          const ms = Math.round(performance.now() - start);
          console.error('[ResumeTrace][Fetch] ✅ END', { traceId, url, status: (res as any).status, ok: (res as any).ok, ms, timestamp: Date.now() });
          return res;
        } catch (e: any) {
          const ms = Math.round(performance.now() - start);
          console.error('[ResumeTrace][Fetch] ❌ ERROR', { traceId, url, ms, error: e?.message, timestamp: Date.now() });
          throw e;
        }
      };
    }
  } catch {}
}


