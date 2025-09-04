import { QueryClient } from '@tanstack/react-query';
import { connect, disconnect, getChannels, getSocketState, isSocketConnected, setAuth } from './adapter';
import { createLogger } from './logger';
import { createDiagnosticsBase } from './healthMonitor';
import { ConnectionPhase, RealtimeDiagnostics } from './types';

const log = createLogger('ConnectionFSM');

type Events =
  | { type: 'connect' }
  | { type: 'session'; token: string | null }
  | { type: 'visibilityRecover' }
  | { type: 'cooldownElapsed' }
  | { type: 'channelHealthy' }
  | { type: 'error'; error: any };

export function createConnectionFSM(queryClient: QueryClient) {
  let phase: ConnectionPhase = 'idle';
  let backoffMs = 500;
  let reconnectTimer: number | null = null;
  let diagnostics: RealtimeDiagnostics = createDiagnosticsBase();

  const setPhase = (p: ConnectionPhase) => {
    phase = p;
    diagnostics.phase = p;
    diagnostics.lastStateChangeAt = Date.now();
  };

  const clearTimer = () => {
    if (reconnectTimer) {
      try { clearTimeout(reconnectTimer); } catch {}
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    clearTimer();
    const delay = Math.min(backoffMs, 60000);
    backoffMs = Math.min(backoffMs * 2, 60000);
    setPhase('reconnecting');
    reconnectTimer = window.setTimeout(() => dispatch({ type: 'connect' }), delay);
  };

  const dispatch = (evt: Events) => {
    switch (evt.type) {
      case 'session': {
        setAuth(evt.token);
        if (phase === 'idle') dispatch({ type: 'connect' });
        break;
      }
      case 'connect': {
        try {
          setPhase('connecting');
          connect();
          diagnostics.isSocketConnected = isSocketConnected();
          diagnostics.socketState = getSocketState();
          if (diagnostics.isSocketConnected) {
            setPhase('connected');
            backoffMs = 500;
          } else {
            scheduleReconnect();
          }
        } catch (e) {
          diagnostics.lastError = (e as any)?.message || String(e);
          log.warn('connect error', e);
          scheduleReconnect();
        }
        break;
      }
      case 'visibilityRecover': {
        backoffMs = 500;
        // Always force reconnection on visibility recovery to handle stale connections
        log.debug('visibility recover - forcing disconnect/reconnect cycle');
        try {
          disconnect();
          setTimeout(() => dispatch({ type: 'connect' }), 100);
        } catch (e) {
          log.warn('visibility recover disconnect failed', e);
          dispatch({ type: 'connect' });
        }
        break;
      }
      case 'channelHealthy': {
        setPhase('connected');
        backoffMs = 500;
        break;
      }
      case 'error': {
        diagnostics.lastError = (evt.error as any)?.message || String(evt.error);
        scheduleReconnect();
        break;
      }
      case 'cooldownElapsed': {
        setPhase('idle');
        break;
      }
      default:
        break;
    }
  };

  const getDiagnostics = () => {
    diagnostics.isSocketConnected = isSocketConnected();
    diagnostics.socketState = getSocketState();
    diagnostics.channel = undefined as any; // will be set by provider composing diagnostics
    diagnostics.counters = diagnostics.counters || { reconnectAttempts: 0, channelRecreated: 0, zeroBindingIncidents: 0, eventsReceived: 0 };
    return diagnostics;
  };

  return { dispatch, getDiagnostics };
}


