import { getChannels, isSocketConnected } from './adapter';
import { ChannelStatus, RealtimeDiagnostics, WatchdogConfig } from './types';
import { createLogger } from './logger';

const log = createLogger('HealthMonitor');

export function snapshotChannel(topic: string | null | undefined): ChannelStatus | null {
  try {
    const channels = getChannels();
    if (!topic) return null;
    const target = channels.find((c: any) => {
      const t = typeof c.topic === 'string' ? c.topic : '';
      return t === topic || t === `realtime:${topic}` || t.endsWith(`:${topic}`);
    });
    if (!target) return null;
    return {
      topic: target.topic,
      state: target.state,
      bindingsCount: (target as any).bindings?.length || 0,
      joinRef: (target as any).joinRef,
    };
  } catch (e) {
    log.warn('snapshotChannel failed', e);
    return null;
  }
}

export function computeHealthy(topic: string | null | undefined, lastEventAt: number | null): boolean {
  try {
    // Priority: joined channel → socket connected → recent events
    const ch = snapshotChannel(topic);
    if (ch?.state === 'joined') return true;
    if (isSocketConnected()) return true;
    if (lastEventAt && Date.now() - lastEventAt < 15000) return true;
  } catch {}
  return false;
}

export function createDiagnosticsBase(): RealtimeDiagnostics {
  return {
    phase: 'idle',
    isSocketConnected: false,
    lastEventAt: null,
    lastStateChangeAt: null,
    projectTopic: null,
    channel: null,
    counters: {
      reconnectAttempts: 0,
      channelRecreated: 0,
      zeroBindingIncidents: 0,
      eventsReceived: 0,
    },
    lastError: null,
  };
}

export function shouldWatchdogTrigger(lastEventAt: number | null, cfg: WatchdogConfig): boolean {
  if (!cfg?.maxSilenceMs) return false;
  if (!lastEventAt) return true;
  return Date.now() - lastEventAt > cfg.maxSilenceMs;
}


