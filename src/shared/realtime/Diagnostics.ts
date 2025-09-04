export type RealtimeDiagnostics = {
  socketState: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'cooldown' | 'error' | 'unknown';
  channelState: 'closed' | 'joining' | 'joined' | 'leaving' | 'errored' | 'unknown';
  lastEventAt: number | null;
  lastJoinRef: string | null;
  reconnectAttempts: number;
  channelRecreatedCount: number;
  noBindingIncidents: number;
  eventsReceivedByType: Record<string, number>;
  lastError: string | null;
};

export type LoggerLevel = 'debug' | 'info' | 'warn' | 'error';

export class DiagnosticsLogger {
  private tag: string;
  private enabled: boolean;

  constructor(tag: string, enabled: boolean) {
    this.tag = tag;
    this.enabled = enabled;
  }

  log(level: LoggerLevel, message: string, data?: unknown) {
    if (!this.enabled) return;
    const payload = { tag: this.tag, level, message, ts: Date.now(), ...(data ? { data } : {}) };
    // eslint-disable-next-line no-console
    (console as any)[level === 'debug' ? 'log' : level](`[RealtimeRefactor] ${message}`, data ?? {});
    try {
      (window as any).__REALTIME_DIAG_LAST__ = payload;
    } catch {}
  }

  debug(message: string, data?: unknown) { this.log('debug', message, data); }
  info(message: string, data?: unknown) { this.log('info', message, data); }
  warn(message: string, data?: unknown) { this.log('warn', message, data); }
  error(message: string, data?: unknown) { this.log('error', message, data); }
}

export class DiagnosticsStore {
  private data: RealtimeDiagnostics;
  private subscribers: Set<() => void> = new Set();

  constructor() {
    this.data = {
      socketState: 'unknown',
      channelState: 'unknown',
      lastEventAt: null,
      lastJoinRef: null,
      reconnectAttempts: 0,
      channelRecreatedCount: 0,
      noBindingIncidents: 0,
      eventsReceivedByType: {},
      lastError: null,
    };
    
    // Expose diagnostics globally for debugging and monitoring
    if (typeof window !== 'undefined') {
      (window as any).__REALTIME_DIAGNOSTICS__ = this.data;
    }
  }

  get snapshot(): RealtimeDiagnostics { return this.data; }

  update(partial: Partial<RealtimeDiagnostics>) {
    this.data = { ...this.data, ...partial };
    
    // Update global reference
    if (typeof window !== 'undefined') {
      (window as any).__REALTIME_DIAGNOSTICS__ = this.data;
    }
    
    this.emit();
  }

  increment(key: keyof Pick<RealtimeDiagnostics, 'reconnectAttempts' | 'channelRecreatedCount' | 'noBindingIncidents'>) {
    this.data = { ...this.data, [key]: (this.data as any)[key] + 1 } as RealtimeDiagnostics;
    this.emit();
  }

  bumpEvent(type: string) {
    this.data.eventsReceivedByType[type] = (this.data.eventsReceivedByType[type] || 0) + 1;
    this.data.lastEventAt = Date.now(); // Update last event timestamp
    
    // Update global reference
    if (typeof window !== 'undefined') {
      (window as any).__REALTIME_DIAGNOSTICS__ = this.data;
    }
    
    this.emit();
  }

  subscribe(cb: () => void) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private emit() { this.subscribers.forEach((cb) => cb()); }
}


