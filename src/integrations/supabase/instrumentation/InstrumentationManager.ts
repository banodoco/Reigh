/**
 * InstrumentationManager - Single point of control for all instrumentation
 * 
 * Responsibilities:
 * - Ensures idempotent installation/uninstallation
 * - Controls log verbosity levels
 * - Manages dev-gating of instrumentation
 * - Provides unified diagnostics channel
 * - Prevents multiple installs and overlapping logs
 */

import { __IS_DEV_ENV__, __WS_INSTRUMENTATION_ENABLED__, __CORRUPTION_TRACE_ENABLED__, __REALTIME_DOWN_FIX_ENABLED__ } from '@/integrations/supabase/config/env';

// Log verbosity levels
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';

// Instrumentation types
export type InstrumentationType = 
  | 'window'
  | 'websocket' 
  | 'realtime'
  | 'localStorage'
  | 'fetch'
  | 'errorCapture'
  | 'tabResume'
  | 'webSocketFailure'
  | 'cacheValidation'
  | 'pollingDebug';

// Instrumentation configuration
export interface InstrumentationConfig {
  enabled: boolean;
  logLevel: LogLevel;
  tags: string[];
  devOnly?: boolean;
}

// Global instrumentation state
interface InstrumentationState {
  installed: Set<InstrumentationType>;
  configs: Map<InstrumentationType, InstrumentationConfig>;
  logLevel: LogLevel;
  diagnosticsChannel: DiagnosticsChannel;
  teardownCallbacks: Map<InstrumentationType, () => void>;
}

// Unified diagnostics channel
export class DiagnosticsChannel {
  private logLevel: LogLevel = 'error';
  private enabledTags: Set<string> = new Set();
  
  constructor(logLevel: LogLevel = 'error') {
    this.logLevel = logLevel;
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  enableTags(tags: string[]) {
    tags.forEach(tag => this.enabledTags.add(tag));
  }

  disableTags(tags: string[]) {
    tags.forEach(tag => this.enabledTags.delete(tag));
  }

  private shouldLog(level: LogLevel, tags: string[]): boolean {
    // Check log level hierarchy
    const levels: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug', 'verbose'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (currentLevelIndex === 0 || messageLevelIndex > currentLevelIndex) {
      return false;
    }

    // Check if any tag is enabled (if tags provided)
    if (tags.length > 0 && !tags.some(tag => this.enabledTags.has(tag))) {
      return false;
    }

    return true;
  }

  private formatMessage(source: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}][${source}]`;
    return data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
  }

  log(level: LogLevel, source: string, message: string, data?: any, tags: string[] = []) {
    if (!this.shouldLog(level, tags)) return;

    const formattedMessage = this.formatMessage(source, message, data);
    
    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'debug':
      case 'verbose':
        console.log(formattedMessage);
        break;
    }
  }

  error(source: string, message: string, data?: any, tags: string[] = []) {
    this.log('error', source, message, data, tags);
  }

  warn(source: string, message: string, data?: any, tags: string[] = []) {
    this.log('warn', source, message, data, tags);
  }

  info(source: string, message: string, data?: any, tags: string[] = []) {
    this.log('info', source, message, data, tags);
  }

  debug(source: string, message: string, data?: any, tags: string[] = []) {
    this.log('debug', source, message, data, tags);
  }

  verbose(source: string, message: string, data?: any, tags: string[] = []) {
    this.log('verbose', source, message, data, tags);
  }
}

class InstrumentationManagerImpl {
  private state: InstrumentationState;
  private initialized = false;

  constructor() {
    this.state = {
      installed: new Set(),
      configs: new Map(),
      logLevel: __IS_DEV_ENV__ ? 'debug' : 'error',
      diagnosticsChannel: new DiagnosticsChannel(__IS_DEV_ENV__ ? 'debug' : 'error'),
      teardownCallbacks: new Map()
    };

    // Set up default configurations
    this.setupDefaultConfigs();
  }

  private setupDefaultConfigs() {
    const defaultConfigs: Record<InstrumentationType, InstrumentationConfig> = {
      window: {
        enabled: __WS_INSTRUMENTATION_ENABLED__,
        logLevel: 'error',
        tags: ['WebSocketInstrumentation', 'ReconnectionIssue'],
        devOnly: false
      },
      websocket: {
        enabled: __WS_INSTRUMENTATION_ENABLED__,
        logLevel: 'error', 
        tags: ['WebSocketCreation', 'WebSocketStability', 'WebSocketDebug'],
        devOnly: false
      },
      realtime: {
        enabled: __CORRUPTION_TRACE_ENABLED__,
        logLevel: 'error',
        tags: ['RealtimeCorruptionTrace', 'ReferenceLoss'],
        devOnly: false
      },
      localStorage: {
        enabled: true,
        logLevel: 'error',
        tags: ['ProjectContext:FastResume'],
        devOnly: true
      },
      fetch: {
        enabled: true,
        logLevel: 'error',
        tags: ['ResumeTrace'],
        devOnly: true
      },
      errorCapture: {
        enabled: __CORRUPTION_TRACE_ENABLED__,
        logLevel: 'error',
        tags: ['RealtimeCorruptionTrace'],
        devOnly: false
      },
      tabResume: {
        enabled: __IS_DEV_ENV__,
        logLevel: 'error',
        tags: ['TabResumeDebug'],
        devOnly: true
      },
      webSocketFailure: {
        enabled: __IS_DEV_ENV__,
        logLevel: 'error',
        tags: ['WebSocketDebug'],
        devOnly: true
      },
      cacheValidation: {
        enabled: __IS_DEV_ENV__,
        logLevel: 'error',
        tags: ['DeadModeInvestigation', 'CacheValidation'],
        devOnly: true
      },
      pollingDebug: {
        enabled: __IS_DEV_ENV__,
        logLevel: 'debug',
        tags: ['PollingDebug'],
        devOnly: true
      }
    };

    // Apply dev-only filtering
    Object.entries(defaultConfigs).forEach(([type, config]) => {
      if (config.devOnly && !__IS_DEV_ENV__) {
        config.enabled = false;
      }
      this.state.configs.set(type as InstrumentationType, config);
    });
  }

  initialize(): void {
    if (this.initialized) {
      this.state.diagnosticsChannel.warn('InstrumentationManager', 'Already initialized, skipping');
      return;
    }

    if (typeof window === 'undefined') {
      this.state.diagnosticsChannel.info('InstrumentationManager', 'Not in browser environment, skipping initialization');
      return;
    }

    this.initialized = true;
    
    // Enable diagnostic tags based on configurations
    const allTags = Array.from(this.state.configs.values())
      .filter(config => config.enabled)
      .flatMap(config => config.tags);
    this.state.diagnosticsChannel.enableTags(allTags);

    this.state.diagnosticsChannel.info('InstrumentationManager', 'Initialized', {
      isDevEnv: __IS_DEV_ENV__,
      enabledInstrumentations: Array.from(this.state.configs.entries())
        .filter(([_, config]) => config.enabled)
        .map(([type, _]) => type),
      logLevel: this.state.logLevel
    });
  }

  isInstalled(type: InstrumentationType): boolean {
    return this.state.installed.has(type);
  }

  isEnabled(type: InstrumentationType): boolean {
    const config = this.state.configs.get(type);
    return config?.enabled ?? false;
  }

  install(type: InstrumentationType, force: boolean = false): boolean {
    if (!this.initialized) {
      this.initialize();
    }

    // Check if already installed (idempotence)
    if (this.isInstalled(type) && !force) {
      this.state.diagnosticsChannel.debug('InstrumentationManager', `${type} already installed, skipping`);
      return false;
    }

    // Check if enabled
    if (!this.isEnabled(type)) {
      this.state.diagnosticsChannel.debug('InstrumentationManager', `${type} disabled, skipping installation`);
      return false;
    }

    this.state.diagnosticsChannel.info('InstrumentationManager', `Installing ${type} instrumentation`);

    try {
      const teardown = this.installInstrumentation(type);
      if (teardown) {
        this.state.teardownCallbacks.set(type, teardown);
      }
      this.state.installed.add(type);
      
      this.state.diagnosticsChannel.info('InstrumentationManager', `Successfully installed ${type} instrumentation`);
      return true;
    } catch (error: any) {
      this.state.diagnosticsChannel.error('InstrumentationManager', `Failed to install ${type} instrumentation`, {
        error: error?.message,
        stack: error?.stack
      });
      return false;
    }
  }

  uninstall(type: InstrumentationType): boolean {
    if (!this.isInstalled(type)) {
      this.state.diagnosticsChannel.debug('InstrumentationManager', `${type} not installed, skipping uninstall`);
      return false;
    }

    this.state.diagnosticsChannel.info('InstrumentationManager', `Uninstalling ${type} instrumentation`);

    try {
      const teardown = this.state.teardownCallbacks.get(type);
      if (teardown) {
        teardown();
        this.state.teardownCallbacks.delete(type);
      }
      
      this.state.installed.delete(type);
      this.state.diagnosticsChannel.info('InstrumentationManager', `Successfully uninstalled ${type} instrumentation`);
      return true;
    } catch (error: any) {
      this.state.diagnosticsChannel.error('InstrumentationManager', `Failed to uninstall ${type} instrumentation`, {
        error: error?.message,
        stack: error?.stack
      });
      return false;
    }
  }

  installAll(): void {
    this.state.diagnosticsChannel.info('InstrumentationManager', 'Installing all enabled instrumentations');
    
    for (const type of this.state.configs.keys()) {
      this.install(type);
    }
  }

  uninstallAll(): void {
    this.state.diagnosticsChannel.info('InstrumentationManager', 'Uninstalling all instrumentations');
    
    for (const type of this.state.installed) {
      this.uninstall(type);
    }
  }

  getState() {
    return {
      initialized: this.initialized,
      installed: Array.from(this.state.installed),
      configs: Object.fromEntries(this.state.configs),
      logLevel: this.state.logLevel
    };
  }

  getDiagnosticsChannel(): DiagnosticsChannel {
    return this.state.diagnosticsChannel;
  }

  setLogLevel(level: LogLevel): void {
    this.state.logLevel = level;
    this.state.diagnosticsChannel.setLogLevel(level);
    this.state.diagnosticsChannel.info('InstrumentationManager', `Log level changed to ${level}`);
  }

  updateConfig(type: InstrumentationType, config: Partial<InstrumentationConfig>): void {
    const existingConfig = this.state.configs.get(type);
    if (!existingConfig) {
      this.state.diagnosticsChannel.warn('InstrumentationManager', `No config found for ${type}`);
      return;
    }

    const newConfig = { ...existingConfig, ...config };
    this.state.configs.set(type, newConfig);
    
    this.state.diagnosticsChannel.info('InstrumentationManager', `Updated config for ${type}`, newConfig);

    // Reinstall if currently installed and config changed
    if (this.isInstalled(type)) {
      this.uninstall(type);
      this.install(type);
    }
  }

  private installInstrumentation(type: InstrumentationType): (() => void) | void {
    // Import and install specific instrumentation based on type
    // This method will be implemented with the actual installation logic
    switch (type) {
      case 'window':
        return this.installWindowInstrumentation();
      case 'websocket':
        return this.installWebSocketInstrumentation();
      case 'realtime':
        return this.installRealtimeInstrumentation();
      case 'localStorage':
        return this.installLocalStorageInstrumentation();
      case 'fetch':
        return this.installFetchInstrumentation();
      case 'errorCapture':
        return this.installErrorCaptureInstrumentation();
      case 'tabResume':
        return this.installTabResumeInstrumentation();
      case 'webSocketFailure':
        return this.installWebSocketFailureInstrumentation();
      case 'cacheValidation':
        return this.installCacheValidationInstrumentation();
      case 'pollingDebug':
        return this.installPollingDebugInstrumentation();
      default:
        throw new Error(`Unknown instrumentation type: ${type}`);
    }
  }

  // Specific instrumentation implementations
  private installWindowInstrumentation(): (() => void) | void {
    if ((window as any).__WS_PROBE_INSTALLED__) {
      this.state.diagnosticsChannel.debug('InstrumentationManager', 'WebSocket instrumentation already installed');
      return;
    }

    (window as any).__WS_PROBE_INSTALLED__ = true;
    const OriginalWS = window.WebSocket;
    
    let wsCreationCount = 0;
    let wsDestroyedCount = 0;

    (window as any).WebSocket = function(url: string, protocols?: string | string[]) {
      wsCreationCount++;
      const wsId = wsCreationCount;

      const isSupabaseRealtime = url.includes('supabase.co/realtime');
      const isSupabaseWebSocket = url.includes('supabase.co') && url.includes('websocket');

      InstrumentationManager.getDiagnosticsChannel().debug('WebSocketCreation', 'WEBSOCKET CONSTRUCTOR CALLED!', {
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
        }
      }, ['WebSocketCreation']);

      let ws: WebSocket;
      try {
        ws = protocols ? new OriginalWS(url, protocols) : new OriginalWS(url);

        if (isSupabaseRealtime || isSupabaseWebSocket) {
          InstrumentationManager.getDiagnosticsChannel().info('WebSocketCreation', 'SUPABASE WEBSOCKET DETECTED', {
            wsId, url, protocols, timestamp: Date.now()
          }, ['WebSocketCreation']);
          
          (window as any).__SUPABASE_WEBSOCKET_INSTANCES__ = (window as any).__SUPABASE_WEBSOCKET_INSTANCES__ || [];
          (window as any).__SUPABASE_WEBSOCKET_INSTANCES__.push({
            wsId, url, protocols, createdAt: Date.now(), websocketRef: ws
          });
        }

        const createdAt = Date.now();
        let stability = { opens: 0, errors: 0, closes: 0, messages: 0 } as any;

        ws.addEventListener('open', () => {
          stability.opens++;
          InstrumentationManager.getDiagnosticsChannel().debug('WebSocketStability', 'WS OPENED', {
            wsId, url, openTime: Date.now() - createdAt, stability, timestamp: Date.now()
          }, ['WebSocketStability']);
        });

        ws.addEventListener('message', (event: MessageEvent) => {
          stability.messages++;
          if (isSupabaseRealtime || isSupabaseWebSocket) {
            try {
              const messageData = typeof event.data === 'string' ? event.data : '[BINARY_DATA]';
              const messagePreview = typeof messageData === 'string' ? messageData.slice(0, 100) : '[BINARY]';
              InstrumentationManager.getDiagnosticsChannel().verbose('SupabaseWebSocketDiag', 'WEBSOCKET MESSAGE RECEIVED', {
                url: ws.url, readyState: ws.readyState, timestamp: Date.now(), messagePreview,
                messageType: typeof event.data, messageLength: typeof event.data === 'string' ? (event.data as string).length : 'unknown'
              }, ['SupabaseWebSocketDiag']);
            } catch {}
          }
        });

        ws.addEventListener('error', (event) => {
          stability.errors++;
          InstrumentationManager.getDiagnosticsChannel().error('WebSocketStability', 'WS ERROR', {
            wsId, url, error: event, errorAfter: Date.now() - createdAt, stability, readyState: ws.readyState, timestamp: Date.now()
          }, ['WebSocketStability']);
        });

        ws.addEventListener('close', (event: CloseEvent) => {
          stability.closes++;
          wsDestroyedCount++;
          InstrumentationManager.getDiagnosticsChannel().debug('WebSocketStability', 'WS CLOSED', {
            wsId, url, code: event.code, reason: event.reason, wasClean: event.wasClean,
            lifespan: Date.now() - createdAt, stability, totalDestroyed: wsDestroyedCount,
            activeCount: wsCreationCount - wsDestroyedCount, timestamp: Date.now()
          }, ['WebSocketStability']);
        });

      } catch (error: any) {
        InstrumentationManager.getDiagnosticsChannel().error('WebSocketCreation', 'WEBSOCKET CREATION FAILED', {
          url, error: error?.message, errorType: typeof error, timestamp: Date.now()
        }, ['WebSocketCreation']);
        throw error;
      }

      return ws as any;
    } as any;

    return () => {
      if ((window as any).__WS_PROBE_INSTALLED__) {
        window.WebSocket = OriginalWS;
        delete (window as any).__WS_PROBE_INSTALLED__;
      }
    };
  }

  private installWebSocketInstrumentation(): (() => void) | void {
    // This is handled by installWindowInstrumentation
    return;
  }

  private installRealtimeInstrumentation(): (() => void) | void {
    // This requires the supabase client to be available, will be called from client.ts
    return;
  }

  // Special method for realtime instrumentation that takes supabase client
  installRealtimeWithClient(supabase: any): (() => void) | void {
    if (!supabase?.realtime) {
      this.state.diagnosticsChannel.warn('InstrumentationManager', 'No realtime client available for instrumentation');
      return;
    }

    const realtime: any = supabase.realtime;

    // Reference mutation tracking for realtime.socket and conn.transport
    try {
      if (realtime && !realtime.__REFERENCE_TRACKING_INSTALLED__) {
        let _socket = realtime.socket;
        Object.defineProperty(realtime, 'socket', {
          get() { return _socket; },
          set(value) {
            if (_socket && !value) {
              InstrumentationManager.getDiagnosticsChannel().error('RealtimeCorruptionTrace', 'realtime.socket SET TO NULL!', {
                previousValue: _socket, newValue: value, timestamp: Date.now()
              }, ['RealtimeCorruptionTrace']);
            } else if (!_socket && value) {
              InstrumentationManager.getDiagnosticsChannel().info('RealtimeCorruptionTrace', 'realtime.socket SET TO WEBSOCKET', {
                newValue: value, readyState: (value as any)?.readyState, url: (value as any)?.url, timestamp: Date.now()
              }, ['RealtimeCorruptionTrace']);
            } else if (_socket !== value) {
              InstrumentationManager.getDiagnosticsChannel().error('RealtimeCorruptionTrace', 'realtime.socket REPLACED', {
                previousValue: _socket, newValue: value, timestamp: Date.now()
              }, ['RealtimeCorruptionTrace']);
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
              if (_transport && !value) {
                InstrumentationManager.getDiagnosticsChannel().error('RealtimeCorruptionTrace', 'conn.transport SET TO NULL!', {
                  previousValue: _transport, newValue: value, timestamp: Date.now()
                }, ['RealtimeCorruptionTrace']);
              } else if (!_transport && value) {
                InstrumentationManager.getDiagnosticsChannel().info('RealtimeCorruptionTrace', 'conn.transport SET TO WEBSOCKET', {
                  newValue: value, readyState: (value as any)?.readyState, url: (value as any)?.url, timestamp: Date.now()
                }, ['RealtimeCorruptionTrace']);
              } else if (_transport !== value) {
                InstrumentationManager.getDiagnosticsChannel().error('RealtimeCorruptionTrace', 'conn.transport REPLACED', {
                  previousValue: _transport, newValue: value, timestamp: Date.now()
                }, ['RealtimeCorruptionTrace']);
              }
              _transport = value as any;
            },
            configurable: true
          });
        }
        realtime.__REFERENCE_TRACKING_INSTALLED__ = true;
      }
    } catch (error) {
      this.state.diagnosticsChannel.error('ReferenceLoss', 'Failed to install reference tracking', { error });
    }

    // Console warn interceptor for realtime=down detection
    if (__REALTIME_DOWN_FIX_ENABLED__ && !(console as any).__WARN_INTERCEPTED__) {
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
              InstrumentationManager.getDiagnosticsChannel().error('RealtimeDownFix', 'RECONNECT REQUEST FAILED', { error });
            }
          })();
        }
        return originalConsoleWarn.apply(this, args as any);
      } as any;
    }

    return () => {
      if (realtime.__REFERENCE_TRACKING_INSTALLED__) {
        // Cleanup reference tracking
        delete realtime.__REFERENCE_TRACKING_INSTALLED__;
      }
      if ((console as any).__WARN_INTERCEPTED__) {
        // Note: We don't restore console.warn to avoid conflicts with other interceptors
      }
    };
  }

  private installLocalStorageInstrumentation(): (() => void) | void {
    if ((window as any).__LS_MON_INSTALLED__) {
      this.state.diagnosticsChannel.debug('InstrumentationManager', 'localStorage monitoring already installed');
      return;
    }

    if (typeof localStorage === 'undefined') return;

    (window as any).__LS_MON_INSTALLED__ = true;
    const originalSetItem = localStorage.setItem;
    const originalRemoveItem = localStorage.removeItem;
    const originalClear = localStorage.clear;

    localStorage.setItem = function(key, value) {
      if (key === 'lastSelectedProjectId') {
        InstrumentationManager.getDiagnosticsChannel().debug('ProjectContext:FastResume', `localStorage.setItem('${key}', '${value}')`, {
          stack: new Error().stack?.split('\n').slice(1, 4)
        }, ['ProjectContext:FastResume']);
      }
      return originalSetItem.call(this, key, value);
    } as any;

    localStorage.removeItem = function(key) {
      if (key === 'lastSelectedProjectId') {
        InstrumentationManager.getDiagnosticsChannel().debug('ProjectContext:FastResume', `localStorage.removeItem('${key}')`, {
          stack: new Error().stack?.split('\n').slice(1, 4)
        }, ['ProjectContext:FastResume']);
      }
      return originalRemoveItem.call(this, key);
    } as any;

    localStorage.clear = function() {
      InstrumentationManager.getDiagnosticsChannel().warn('ProjectContext:FastResume', 'localStorage.clear() called!', {
        stack: new Error().stack?.split('\n').slice(1, 4)
      }, ['ProjectContext:FastResume']);
      return originalClear.call(this);
    } as any;

    return () => {
      if ((window as any).__LS_MON_INSTALLED__) {
        localStorage.setItem = originalSetItem;
        localStorage.removeItem = originalRemoveItem;
        localStorage.clear = originalClear;
        delete (window as any).__LS_MON_INSTALLED__;
      }
    };
  }

  private installFetchInstrumentation(): (() => void) | void {
    if ((window as any).__FETCH_INSTRUMENTED__) {
      this.state.diagnosticsChannel.debug('InstrumentationManager', 'Fetch instrumentation already installed');
      return;
    }

    const originalFetch = window.fetch.bind(window);
    (window as any).__FETCH_INSTRUMENTED__ = true;

    window.fetch = async (...args: any[]) => {
      const start = performance.now();
      const input = args[0];
      const url = typeof input === 'string' ? input : (input?.url || 'unknown');
      const isSupabase = typeof url === 'string' && url.includes('.supabase.co');
      const traceId = Math.random().toString(36).slice(2, 10);
      
      InstrumentationManager.getDiagnosticsChannel().debug('ResumeTrace', 'Fetch START', {
        traceId, url, isSupabase, timestamp: Date.now()
      }, ['ResumeTrace']);

      try {
        const res = await originalFetch(...(args as any));
        const ms = Math.round(performance.now() - start);
        InstrumentationManager.getDiagnosticsChannel().debug('ResumeTrace', 'Fetch END', {
          traceId, url, status: (res as any).status, ok: (res as any).ok, ms, timestamp: Date.now()
        }, ['ResumeTrace']);
        return res;
      } catch (e: any) {
        const ms = Math.round(performance.now() - start);
        InstrumentationManager.getDiagnosticsChannel().error('ResumeTrace', 'Fetch ERROR', {
          traceId, url, ms, error: e?.message, timestamp: Date.now()
        }, ['ResumeTrace']);
        throw e;
      }
    };

    return () => {
      if ((window as any).__FETCH_INSTRUMENTED__) {
        window.fetch = originalFetch;
        delete (window as any).__FETCH_INSTRUMENTED__;
      }
    };
  }

  private installErrorCaptureInstrumentation(): (() => void) | void {
    if ((window as any).__ERROR_CAPTURE_INSTALLED__) {
      this.state.diagnosticsChannel.debug('InstrumentationManager', 'Error capture already installed');
      return;
    }

    (window as any).__ERROR_CAPTURE_INSTALLED__ = true;
    const originalOnError = window.onerror;
    const originalOnUnhandledRejection = window.onunhandledrejection;

    window.onerror = function(message, source, lineno, colno, error) {
      const errorInfo = {
        message: String(message), source: String(source), lineno, colno,
        error: error ? { name: (error as any).name, message: (error as any).message, stack: (error as any).stack } : null,
        timestamp: Date.now(), userAgent: navigator.userAgent.slice(0, 100)
      };

      if (source && source.includes('supabase-js.js') && lineno === 2372) {
        InstrumentationManager.getDiagnosticsChannel().error('RealtimeCorruptionTrace', 'SUPABASE ERROR CAPTURED!', {
          ...errorInfo
        }, ['RealtimeCorruptionTrace']);
      } else if (message && (String(message).includes('supabase') || String(message).includes('realtime') || String(message).includes('websocket'))) {
        InstrumentationManager.getDiagnosticsChannel().error('RealtimeCorruptionTrace', 'RELATED ERROR', errorInfo, ['RealtimeCorruptionTrace']);
      }

      if (originalOnError) return originalOnError.call(this, message as any, source as any, lineno as any, colno as any, error as any);
      return false;
    };

    window.onunhandledrejection = function(event: PromiseRejectionEvent) {
      const rejectionInfo = {
        reason: (event as any).reason, promise: '[PROMISE_OBJECT]', timestamp: Date.now()
      };

      if ((event as any).reason && (String((event as any).reason).includes('supabase') || String((event as any).reason).includes('realtime'))) {
        InstrumentationManager.getDiagnosticsChannel().error('RealtimeCorruptionTrace', 'UNHANDLED REJECTION', rejectionInfo, ['RealtimeCorruptionTrace']);
      }

      if (originalOnUnhandledRejection) return originalOnUnhandledRejection.call(this, event);
    };

    return () => {
      if ((window as any).__ERROR_CAPTURE_INSTALLED__) {
        window.onerror = originalOnError;
        window.onunhandledrejection = originalOnUnhandledRejection;
        delete (window as any).__ERROR_CAPTURE_INSTALLED__;
      }
    };
  }

  private installTabResumeInstrumentation(): (() => void) | void {
    try {
      const { initTabResumeDebugger, cleanupTabResumeDebugger } = require('@/shared/lib/tabResumeDebugger');
      initTabResumeDebugger();
      return cleanupTabResumeDebugger;
    } catch (error: any) {
      this.state.diagnosticsChannel.error('InstrumentationManager', 'Failed to load tabResumeDebugger', { error: error?.message });
    }
  }

  private installWebSocketFailureInstrumentation(): (() => void) | void {
    try {
      const { getWebSocketFailureSummary } = require('@/shared/lib/webSocketFailureTracker');
      // WebSocket failure tracker initializes automatically
      this.state.diagnosticsChannel.info('InstrumentationManager', 'WebSocket failure tracker initialized');
      return () => {
        // No explicit cleanup needed - uses VisibilityManager subscriptions
      };
    } catch (error: any) {
      this.state.diagnosticsChannel.error('InstrumentationManager', 'Failed to load webSocketFailureTracker', { error: error?.message });
    }
  }

  private installCacheValidationInstrumentation(): (() => void) | void {
    try {
      const { cacheValidator } = require('@/shared/lib/cacheValidationDebugger');
      const teardown = cacheValidator.installAllDiagnostics();
      this.state.diagnosticsChannel.info('InstrumentationManager', 'Cache validation diagnostics installed');
      return teardown;
    } catch (error: any) {
      this.state.diagnosticsChannel.error('InstrumentationManager', 'Failed to load cacheValidationDebugger', { error: error?.message });
    }
  }

  private installPollingDebugInstrumentation(): (() => void) | void {
    try {
      // Polling debug helpers are initialized in App.tsx with QueryClient
      this.state.diagnosticsChannel.info('InstrumentationManager', 'Polling debug instrumentation noted (initialized elsewhere)');
      return () => {
        // No explicit cleanup needed
      };
    } catch (error: any) {
      this.state.diagnosticsChannel.error('InstrumentationManager', 'Failed to note pollingDebugHelpers', { error: error?.message });
    }
  }
}

// Singleton instance
export const InstrumentationManager = new InstrumentationManagerImpl();

// Global access for debugging
if (typeof window !== 'undefined') {
  (window as any).__InstrumentationManager__ = InstrumentationManager;
}
