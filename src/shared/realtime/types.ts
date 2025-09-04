// Realtime refactor: shared types for diagnostics, FSM, and channel status

export type ConnectionPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'cooldown'
  | 'error';

export type ChannelState = 'closed' | 'errored' | 'joining' | 'joined' | 'leaving';

export type ChannelStatus = {
  topic: string;
  state: ChannelState | string | undefined;
  bindingsCount: number;
  joinRef?: string | number | null;
};

export type RealtimeDiagnostics = {
  phase: ConnectionPhase;
  isSocketConnected: boolean;
  socketState?: string;
  lastEventAt: number | null;
  lastStateChangeAt: number | null;
  projectTopic?: string | null;
  channel?: ChannelStatus | null;
  counters: {
    reconnectAttempts: number;
    channelRecreated: number;
    zeroBindingIncidents: number;
    eventsReceived: number;
  };
  lastError?: string | null;
};

export type SubscribeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | string;

export type WatchdogConfig = {
  maxSilenceMs: number;
};


