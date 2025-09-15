import { supabase } from '@/integrations/supabase/client';

// CRITICAL: Verify this file is loaded
console.error('[ReconnectionIssue] 🔥 SUPABASE ADAPTER FILE LOADED AT:', new Date().toISOString());

export type ChannelRef = ReturnType<typeof supabase.channel>;

export type SocketState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'cooldown' | 'error' | 'unknown';

export class SupabaseRealtimeAdapter {
  private logger?: any;
  private lastConnectAttemptAt: number = 0;
  private readonly connectCooldownMs: number = 2000; // 2 seconds cooldown between connect attempts

  constructor(logger?: any) {
    this.logger = logger;
  }

  private setupWebSocketCloseMonitoring() {
    try {
      const realtime = (supabase as any)?.realtime;
      const conn = realtime?.conn;
      
      console.error('[WebSocketCloseMonitor] 🔍 CURRENT CONNECTION STATE:', {
        hasRealtime: !!realtime,
        hasConn: !!conn,
        hasTransport: !!(conn?.transport),
        transportReadyState: conn?.transport?.readyState,
        transportUrl: conn?.transport?.url,
        transportType: typeof conn?.transport,
        transportConstructor: conn?.transport?.constructor?.name,
        transportIsWebSocket: conn?.transport === window.WebSocket,
        transportHasOnClose: typeof conn?.transport?.onclose,
        transportHasOnError: typeof conn?.transport?.onerror,
        isMonitored: !!(conn?.transport?.__CLOSE_MONITORED__),
        timestamp: Date.now()
      });
      
      if (conn && conn.transport && !conn.transport.__CLOSE_MONITORED__) {
        conn.transport.__CLOSE_MONITORED__ = true;
        
        // Monitor close events
        const originalOnClose = conn.transport.onclose;
        conn.transport.onclose = (event: any) => {
          console.error('[WebSocketCloseMonitor] 🚪 WEBSOCKET CLOSED:', {
            code: event?.code,
            reason: event?.reason,
            wasClean: event?.wasClean,
            timestamp: Date.now(),
            url: conn.transport?.url
          });
          
          // Call original handler
          if (originalOnClose) {
            originalOnClose.call(conn.transport, event);
          }
        };

        // Monitor error events
        const originalOnError = conn.transport.onerror;
        conn.transport.onerror = (event: any) => {
          console.error('[WebSocketCloseMonitor] ❌ WEBSOCKET ERROR:', {
            error: event,
            timestamp: Date.now(),
            url: conn.transport?.url
          });
          
          // Call original handler
          if (originalOnError) {
            originalOnError.call(conn.transport, event);
          }
        };

        console.error('[WebSocketCloseMonitor] 📡 WEBSOCKET MONITORING ENABLED:', {
          url: conn.transport?.url,
          readyState: conn.transport?.readyState,
          timestamp: Date.now()
        });
      } else {
        console.error('[WebSocketCloseMonitor] ⚠️ MONITORING NOT SET UP:', {
          hasConn: !!conn,
          hasTransport: !!(conn?.transport),
          alreadyMonitored: !!(conn?.transport?.__CLOSE_MONITORED__),
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.error('[WebSocketCloseMonitor] ❌ Failed to setup monitoring:', e);
    }
  }

  async connect(token?: string | null) {
    const now = Date.now();
    const elapsedSinceLastConnect = now - this.lastConnectAttemptAt;
    const isAlreadyConnected = !!(supabase as any)?.realtime?.isConnected?.();
    
    console.error('[SilentRejoinDebug] 🔌 ADAPTER.CONNECT() CALLED', {
      hasToken: !!token,
      tokenPrefix: (typeof token === 'string' ? token.slice(0, 20) + '...' : 'null'),
      isAlreadyConnected,
      elapsedSinceLastConnect,
      cooldownMs: this.connectCooldownMs,
      timestamp: now,
      callStack: new Error().stack?.split('\n').slice(1, 4)
    });
    
    // CRITICAL FIX: Skip connect if already connected or in cooldown
    if (isAlreadyConnected && elapsedSinceLastConnect < this.connectCooldownMs) {
      console.error('[ConnectGuard] ✅ SKIPPED - already connected and in cooldown', {
        reason: 'already-connected-cooldown',
        isAlreadyConnected,
        elapsedMs: elapsedSinceLastConnect,
        cooldownMs: this.connectCooldownMs,
        timestamp: now
      });
      return;
    }
    
    if (isAlreadyConnected) {
      console.error('[ConnectGuard] ✅ SKIPPED - already connected', {
        reason: 'already-connected',
        isAlreadyConnected,
        timestamp: now
      });
      return;
    }
    
    // Update last connect attempt timestamp
    this.lastConnectAttemptAt = now;
    
    console.error('[ConnectGuard] 🚀 PROCEEDING with connect', {
      reason: 'not-connected-or-past-cooldown',
      isAlreadyConnected,
      elapsedMs: elapsedSinceLastConnect,
      timestamp: now
    });

    // CRITICAL: Add WebSocket close event monitoring
    this.setupWebSocketCloseMonitoring();
    
    console.error('[ReconnectionIssue] 🚨🚨🚨 ADAPTER CONNECT CALLED - TRANSPORT FIX STARTING 🚨🚨🚨');
    console.error('[DeepDebug] 🔍 ADAPTER CONNECT ENTRY POINT:', {
      hasToken: !!token,
      tokenPrefix: (typeof token === 'string' ? token.slice(0, 20) + '...' : 'null'),
      hasSupabase: !!(supabase),
      supabaseType: typeof supabase,
      hasSupabaseRealtime: !!(supabase as any)?.realtime,
      realtimeType: typeof (supabase as any)?.realtime,
      realtimeConstructor: (supabase as any)?.realtime?.constructor?.name,
      hasRealtimeConnect: !!(supabase as any)?.realtime?.connect,
      socketExistsBefore: !!(supabase as any)?.realtime?.socket,
      socketStateBefore: (supabase as any)?.realtime?.socket?.readyState,
      connExistsBefore: !!(supabase as any)?.realtime?.conn,
      connStateBefore: (supabase as any)?.realtime?.conn?.connectionState,
      timestamp: Date.now(),
      stack: new Error().stack?.split('\n').slice(1, 4)
    });
    console.error('[ReconnectionIssue] 🔥 ADAPTER CONNECT CALLED:', {
      hasToken: !!token,
      socketExistsBefore: !!(supabase as any)?.realtime?.socket,
      socketStateBefore: (supabase as any)?.realtime?.socket?.readyState,
      timestamp: Date.now()
    });
    
    // Auth token debugging before setAuth
    try {
      let tokenExpiry = null;
      let secondsToExpiry = null;
      if (token) {
        try {
          const tokenPayload = JSON.parse(atob(token.split('.')[1]));
          tokenExpiry = tokenPayload.exp;
          secondsToExpiry = tokenExpiry ? tokenExpiry - Math.floor(Date.now() / 1000) : null;
        } catch (e) {
          console.error('[AuthTokenDebug] ❌ Failed to parse token:', e);
        }
      }
      
      console.error('[AuthTokenDebug] 🔍 TOKEN STATE BEFORE SETAUTH:', {
        hasToken: !!token,
        tokenPrefix: token ? token.slice(0, 20) + '...' : null,
        expUnix: tokenExpiry,
        now: Math.floor(Date.now() / 1000),
        secondsToExpiry,
        isExpired: secondsToExpiry ? secondsToExpiry <= 0 : null,
        expiresWithin5Min: secondsToExpiry ? secondsToExpiry <= 300 : null,
        timestamp: Date.now()
      });
      
      console.error('[DeepDebug] 🔍 CALLING REALTIME.SETAUTH');
      (supabase as any)?.realtime?.setAuth?.(token ?? null); 
      console.error('[DeepDebug] ✅ REALTIME.SETAUTH COMPLETED');
    } catch (e) {
      console.error('[DeepDebug] ❌ REALTIME.SETAUTH FAILED:', e);
    }
    
    try { 
      console.error('[DeepDebug] 🔍 CALLING REALTIME.CONNECT');
      
      // CRITICAL: Ensure transport is set before calling connect
      const realtime = (supabase as any)?.realtime;
      
      console.error('[TransportDebug] 🔍 TRANSPORT STATE BEFORE CONNECT:', {
        hasRealtime: !!realtime,
        hasTransport: !!realtime?.transport,
        transportType: typeof realtime?.transport,
        transportIsWebSocket: realtime?.transport === window.WebSocket,
        transportName: realtime?.transport?.transportName,
        transportConstructorName: realtime?.transport?.constructor?.name,
        timestamp: Date.now()
      });
      
      if (realtime && realtime.transport !== window.WebSocket) {
        console.error('[DeepDebug] 🔧 FIXING TRANSPORT BEFORE CONNECT CALL');
        
        // Create a proper Phoenix WebSocket transport factory
        const phoenixWebSocketTransport = function(endpoint: string) {
          console.error('[TransportFactory] 🏭 Creating WebSocket for endpoint:', endpoint);
          const createTime = Date.now();
          const ws = new window.WebSocket(endpoint);
          
          // Add instance-level WebSocket logging
          ws.addEventListener('open', () => {
            console.error('[WSInstance] ✅ OPEN:', {
              endpoint,
              timeSinceCreate: Date.now() - createTime,
              readyState: ws.readyState,
              timestamp: Date.now()
            });
          });
          
          ws.addEventListener('message', (event) => {
            try {
              const data = JSON.parse(event.data);
              
          // Enhanced logging for phx_reply messages
          if (data.event === 'phx_reply') {
            console.error('[WSInstance] 📨 PHX_REPLY:', {
              endpoint: endpoint.split('?')[0],
              topic: data.topic,
              ref: data.ref,
              payloadKeys: data.payload ? Object.keys(data.payload) : [],
              payloadStatus: data.payload?.status,
              payloadResponse: data.payload?.response,
              fullPayload: data.payload,
              rawMessage: event.data,
              timestamp: Date.now()
            });
            
            // CRITICAL FIX: Direct Supabase channel state manipulation
            // The Supabase wrapper is not properly correlating Phoenix replies
            // Manually set the channel state and trigger success callbacks
            if (data.payload?.status === 'ok' && data.topic && data.ref) {
              console.error('[SupabaseChannelFix] 🔧 DIRECT CHANNEL STATE MANIPULATION:', {
                topic: data.topic,
                ref: data.ref,
                attempting: 'direct channel state fix',
                timestamp: Date.now()
              });
              
              try {
                // Find all Supabase channels that match this topic
                const channels = (supabase as any)?.getChannels?.() || [];
                const matchingChannels = channels.filter((ch: any) => 
                  ch?.topic?.includes(data.topic.replace('realtime:', '')) || 
                  ch?.bindings?.topic?.includes(data.topic.replace('realtime:', ''))
                );
                
                console.error('[SupabaseChannelFix] 🔍 CHANNEL SEARCH:', {
                  totalChannels: channels.length,
                  matchingChannels: matchingChannels.length,
                  searchTopic: data.topic.replace('realtime:', ''),
                  channelTopics: channels.map((ch: any) => ch?.topic).filter(Boolean),
                  timestamp: Date.now()
                });
                
                matchingChannels.forEach((channel: any, index: number) => {
                  console.error('[SupabaseChannelFix] ✅ FOUND MATCHING CHANNEL:', {
                    index,
                    channelState: channel.state,
                    channelTopic: channel.topic,
                    hasCallbacks: !!(channel._callbacks || channel.callbacks),
                    timestamp: Date.now()
                  });
                  
                  // Force channel state to 'joined' if it's stuck in 'joining'
                  if (channel.state === 'joining' || channel.state === 'closed') {
                    console.error('[SupabaseChannelFix] 🚀 FORCING CHANNEL STATE TO JOINED');
                    
                    // Try multiple ways to set the state
                    if (channel._state !== undefined) {
                      channel._state = 'joined';
                    }
                    if (channel.state !== undefined) {
                      channel.state = 'joined';
                    }
                    
                    // Manually trigger success callbacks if they exist
                    const callbacks = channel._callbacks || channel.callbacks || {};
                    const joinCallbacks = callbacks['phx_reply'] || callbacks['join'] || [];
                    
                    if (Array.isArray(joinCallbacks)) {
                      joinCallbacks.forEach((callback: any) => {
                        try {
                          if (typeof callback === 'function') {
                            console.error('[SupabaseChannelFix] 📞 TRIGGERING SUCCESS CALLBACK');
                            callback(data.payload, data.ref);
                          }
                        } catch (callbackError) {
                          console.error('[SupabaseChannelFix] ❌ CALLBACK ERROR:', callbackError);
                        }
                      });
                    }
                  }
                });
              } catch (manipulationError) {
                console.error('[SupabaseChannelFix] 💥 MANIPULATION ERROR:', manipulationError);
              }
            }
              } else {
                console.error('[WSInstance] 📨 MESSAGE:', {
                  endpoint: endpoint.split('?')[0],
                  eventType: data.event || 'unknown',
                  topic: data.topic,
                  ref: data.ref,
                  payloadKeys: data.payload ? Object.keys(data.payload) : [],
                  firstBytes: event.data.slice(0, 100),
                  timestamp: Date.now()
                });
              }
            } catch (e) {
              console.error('[WSInstance] 📨 MESSAGE (raw):', {
                endpoint: endpoint.split('?')[0],
                firstBytes: event.data.slice(0, 100),
                timestamp: Date.now()
              });
            }
          });
          
          ws.addEventListener('close', (event) => {
            console.error('[WSInstance] 🚪 CLOSE:', {
              endpoint: endpoint.split('?')[0],
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
              timeAliveMs: Date.now() - createTime,
              timestamp: Date.now()
            });
          });
          
          ws.addEventListener('error', (event) => {
            console.error('[WSInstance] ❌ ERROR:', {
              endpoint: endpoint.split('?')[0],
              error: event,
              timeAliveMs: Date.now() - createTime,
              timestamp: Date.now()
            });
          });
          
          return ws;
        };
        
        // Set transport name for Phoenix compatibility
        phoenixWebSocketTransport.transportName = 'websocket';
        
        realtime.transport = phoenixWebSocketTransport;
        console.error('[DeepDebug] 🔧 SET PHOENIX TRANSPORT FACTORY');
      }
      
      (supabase as any)?.realtime?.connect?.(); 
      console.error('[DeepDebug] ✅ REALTIME.CONNECT COMPLETED');
      
      // VERIFY transport is still correct after connect
      if (realtime) {
        console.error('[DeepDebug] 🔍 POST-CONNECT TRANSPORT VERIFICATION:', {
          hasTransport: !!realtime.transport,
          transportIsWebSocket: realtime.transport === window.WebSocket,
          transportName: realtime.transport?.name,
          hasConn: !!realtime.conn,
          connHasTransport: !!realtime.conn?.transport,
          connTransportIsWebSocket: realtime.conn?.transport === window.WebSocket,
          timestamp: Date.now()
        });

        // CRITICAL FIX: Manually assign transport to Phoenix connection if missing
        if (realtime.conn && !realtime.conn.transport && realtime.transport) {
          console.error('[TransportFix] 🔧 MANUALLY ASSIGNING TRANSPORT TO PHOENIX CONNECTION');
          realtime.conn.transport = realtime.transport;
          console.error('[TransportFix] ✅ TRANSPORT ASSIGNED:', {
            connHasTransportNow: !!realtime.conn.transport,
            transportMatches: realtime.conn.transport === realtime.transport,
            transportIsFunction: typeof realtime.conn.transport === 'function',
            transportHasName: !!realtime.conn.transport?.transportName,
            timestamp: Date.now()
          });
        }
      }
      
      // Check state immediately after connect call
      // realtime already declared above - reusing the same variable
      console.error('[DeepDebug] 🔍 STATE IMMEDIATELY AFTER CONNECT:', {
        hasSocket: !!realtime?.socket,
        socketState: realtime?.socket?.readyState,
        hasConn: !!realtime?.conn,
        connState: realtime?.conn?.connectionState,
        hasTransport: !!realtime?.conn?.transport,
        transportState: realtime?.conn?.transport?.readyState,
        timestamp: Date.now()
      });
      
      // CRITICAL: Deep dive into WHY WebSocket isn't created - FIX SERIALIZATION
      const analysisData = {
        realtimeConnected: realtime?.isConnected?.(),
        realtimeState: realtime?.connectionState,
        phoenixSocketExists: !!realtime?.conn,
        phoenixSocketState: realtime?.conn?.connectionState,
        phoenixSocketReadyState: realtime?.conn?.readyState,
        phoenixSocketUrl: realtime?.conn?.endPointURL,
        phoenixTransportExists: !!realtime?.conn?.transport,
        phoenixTransportType: typeof realtime?.conn?.transport,
        phoenixTransportConstructor: realtime?.conn?.transport?.constructor?.name,
        shouldConnect: realtime?.conn?.shouldReconnect,
        isConnecting: realtime?.conn?.isConnecting,
        channels: realtime?.channels ? Object.keys(realtime.channels).length : 0,
        activeChannels: realtime?.channels ? Object.values(realtime.channels).filter((ch: any) => ch?.state === 'joined').length : 0,
        timestamp: Date.now()
      };
      console.error('[WebSocketCreation] 🔍 DEEP ANALYSIS - WHY NO WEBSOCKET?');
      console.error('[WebSocketCreation] 📊 ANALYSIS DATA:', JSON.stringify(analysisData, null, 2));
      
      // Check if Phoenix Socket has any methods that should create WebSocket
      if (realtime?.conn) {
        console.error('[WebSocketCreation] 🔍 PHOENIX SOCKET METHODS ANALYSIS:', {
          hasConnect: typeof realtime.conn.connect,
          hasDisconnect: typeof realtime.conn.disconnect,
          hasReconnect: typeof realtime.conn.reconnect,
          hasMakeRef: typeof realtime.conn.makeRef,
          hasOnOpen: typeof realtime.conn.onOpen,
          hasOnClose: typeof realtime.conn.onClose,
          hasOnError: typeof realtime.conn.onError,
          hasOnMessage: typeof realtime.conn.onMessage,
          hasSendHeartbeat: typeof realtime.conn.sendHeartbeat,
          hasFlushSendBuffer: typeof realtime.conn.flushSendBuffer,
          timestamp: Date.now()
        });
        
        // DIAGNOSTIC: Test each potential issue
        console.error('[WebSocketCreation] 🔬 TESTING POTENTIAL ISSUES:');
        
        // Test 1: Auth state blocking WebSocket creation
        const hasAuthToken = !!realtime?.accessToken || !!realtime?.accessTokenValue;
        console.error('[WebSocketCreation] 🔬 TEST 1 - AUTH STATE:', {
          hasAccessToken: hasAuthToken,
          accessTokenLength: realtime?.accessToken?.length || realtime?.accessTokenValue?.length || 0,
          authTokenPrefix: (() => {
            const authToken = realtime?.accessToken || realtime?.accessTokenValue;
            return typeof authToken === 'string' ? authToken.slice(0, 20) + '...' : 'none';
          })(),
          isAuthRequired: 'checking...'
        });
        
        // Test 2: Configuration flags blocking WebSocket
        console.error('[WebSocketCreation] 🔬 TEST 2 - CONFIGURATION FLAGS:', {
          realtimeEnabled: realtime?.enabled !== false,
          realtimeParams: realtime?.params ? JSON.stringify(realtime.params) : 'none',
          realtimeHeaders: realtime?.headers ? Object.keys(realtime.headers) : 'none',
          realtimeTimeout: realtime?.timeout,
          realtimeHeartbeat: realtime?.heartbeatIntervalMs
        });
        
        // Test 3: Phoenix Socket lazy initialization conditions
        console.error('[WebSocketCreation] 🔬 TEST 3 - LAZY INITIALIZATION CONDITIONS:', {
          phoenixConnState: realtime?.conn?.connectionState,
          phoenixShouldReconnect: realtime?.conn?.shouldReconnect,
          phoenixIsConnecting: realtime?.conn?.isConnecting,
          phoenixConnected: realtime?.conn?.connected,
          phoenixHasChannels: realtime?.channels ? Object.keys(realtime.channels).length > 0 : false,
          phoenixChannelStates: realtime?.channels ? Object.values(realtime.channels).map((ch: any) => ch?.state) : []
        });
        
        // Test 4: Try to manually trigger connection
        if (typeof realtime.conn.connect === 'function') {
          console.error('[WebSocketCreation] 🔥 TEST 4 - MANUALLY CALLING PHOENIX SOCKET CONNECT');
          try {
            const connectResult = realtime.conn.connect();
            console.error('[WebSocketCreation] ✅ PHOENIX SOCKET CONNECT CALLED - RESULT:', {
              returnValue: connectResult,
              returnType: typeof connectResult,
              newConnState: realtime?.conn?.connectionState,
              newTransportExists: !!realtime?.conn?.transport,
              timestamp: Date.now()
            });
          } catch (error) {
            console.error('[WebSocketCreation] ❌ PHOENIX SOCKET CONNECT FAILED:', {
              error: error?.message,
              errorType: typeof error,
              errorStack: error?.stack?.split('\n').slice(0, 3)
            });
          }
        }
        
        // Test 5: Check for missing WebSocket Transport class
        console.error('[WebSocketCreation] 🔬 TEST 5 - WEBSOCKET TRANSPORT CLASS:', {
          windowWebSocket: typeof window.WebSocket,
          realtimeTransportProperty: typeof realtime?.transport,
          realtimeTransportValue: realtime?.transport?.name || realtime?.transport?.constructor?.name || 'none',
          phoenixTransportProperty: typeof realtime?.conn?.transport,
          phoenixTransportValue: realtime?.conn?.transport?.constructor?.name || 'none'
        });
      }
    } catch (e) {
      console.error('[DeepDebug] ❌ REALTIME.CONNECT FAILED:', e);
    }
    
    // CRITICAL FIX: Fix Phoenix Socket transport configuration
    try {
      const realtime = (supabase as any)?.realtime;
      console.error('[ReconnectionIssue] 🔥 PHOENIX TRANSPORT DIAGNOSIS:', {
        realtimeExists: !!realtime,
        hasConn: !!realtime?.conn,
        transportName: realtime?.conn?.transport?.name || realtime?.conn?.transport?.constructor?.name,
        endPointURL: realtime?.conn?.endPointURL?.(),
        endPoint: realtime?.endPoint,
        timestamp: Date.now()
      });
      
      // DISABLED: Complex Phoenix transport fix was causing WebSocket to be broken
      // The transport fix was creating a raw WebSocket instead of proper Phoenix transport
      if (false && realtime?.conn && !realtime.conn.transport) {
        console.error('[ReconnectionIssue] 🔥 FIXING MISSING PHOENIX TRANSPORT');
        
        // Debug the actual Phoenix Socket structure
        console.error('[ReconnectionIssue] 🔥 PHOENIX CONN STRUCTURE:', {
          connKeys: Object.keys(realtime.conn),
          connType: realtime.conn.constructor?.name,
          transportProperty: 'transport' in realtime.conn,
          transportValue: realtime.conn.transport,
          connPrototype: Object.getPrototypeOf(realtime.conn).constructor?.name
        });
        
        // Create a WebSocket transport directly using native WebSocket
        console.error('[ReconnectionIssue] 🔥 CREATING NATIVE WEBSOCKET TRANSPORT');
        
        // Create a transport that mimics Phoenix's WebSocket transport
        const WebSocketTransport = function(endpoint: string) {
          console.error('[ReconnectionIssue] 🔥 TRANSPORT CREATING WEBSOCKET:', endpoint);
          return new WebSocket(endpoint);
        };
        
        // Set the transport name for debugging
        WebSocketTransport.transportName = 'websocket';
        WebSocketTransport.prototype.name = 'websocket';
        
        // Try multiple ways to set the transport
        console.error('[ReconnectionIssue] 🔥 ATTEMPTING TRANSPORT ASSIGNMENT...');
        
        try {
          // Method 1: Direct assignment
          realtime.conn.transport = WebSocketTransport;
          console.error('[ReconnectionIssue] 🔥 METHOD 1 - Direct assignment:', !!realtime.conn.transport);
        } catch (e) {
          console.error('[ReconnectionIssue] 🔥 METHOD 1 FAILED:', e);
        }
        
        try {
          // Method 2: Define property
          Object.defineProperty(realtime.conn, 'transport', {
            value: WebSocketTransport,
            writable: true,
            configurable: true
          });
          console.error('[ReconnectionIssue] 🔥 METHOD 2 - defineProperty:', !!realtime.conn.transport);
        } catch (e) {
          console.error('[ReconnectionIssue] 🔥 METHOD 2 FAILED:', e);
        }
        
        try {
          // Method 3: Try on realtime object directly
          realtime.transport = WebSocketTransport;
          console.error('[ReconnectionIssue] 🔥 METHOD 3 - realtime.transport:', !!realtime.transport);
        } catch (e) {
          console.error('[ReconnectionIssue] 🔥 METHOD 3 FAILED:', e);
        }
        
        console.error('[ReconnectionIssue] 🔥 PHOENIX TRANSPORT FIX RESULT:', {
          connTransportSet: !!realtime.conn.transport,
          realtimeTransportSet: !!realtime.transport,
          transportName: realtime.conn.transport?.name || realtime.conn.transport?.transportName,
          connAfterFix: Object.keys(realtime.conn)
        });
      }
      
      // CRITICAL FIX: Don't disconnect/reconnect - this creates the race condition!
      // Instead, just try to connect (Supabase handles connection state internally)
      if (realtime) {
        console.error('[ReconnectionIssue] 🔥 ATTEMPTING DIRECT CONNECTION (NO DISCONNECT)');
        try {
          // Don't call disconnect() - this destroys the WebSocket!
          // Just call connect() - Supabase will handle existing connections
          realtime.connect?.();
          console.error('[ReconnectionIssue] 🔥 DIRECT CONNECTION ATTEMPT COMPLETE');
        } catch (e) {
          console.error('[ReconnectionIssue] 🔥 DIRECT CONNECTION FAILED:', e);
        }
      }
      
      // COMPREHENSIVE WebSocket state logging
      console.error('[WebSocketDebug] 🔥 COMPREHENSIVE WEBSOCKET STATE CHECK:', {
        hasRealtime: !!realtime,
        hasConn: !!realtime?.conn,
        hasTransport: !!realtime?.conn?.transport,
        transportType: typeof realtime?.conn?.transport,
        connState: realtime?.conn?.connectionState,
        connStateText: realtime?.conn?.connectionState === 0 ? 'CONNECTING' : 
                       realtime?.conn?.connectionState === 1 ? 'OPEN' : 
                       realtime?.conn?.connectionState === 2 ? 'CLOSING' : 
                       realtime?.conn?.connectionState === 3 ? 'CLOSED' : 
                       `UNKNOWN(${realtime?.conn?.connectionState})`,
        isConnected: realtime?.isConnected?.(),
        channels: realtime?.channels ? Object.keys(realtime.channels).length : 0,
        activeChannels: realtime?.channels ? Object.values(realtime.channels).filter((ch: any) => ch?.state === 'joined').length : 0,
        transport: {
          exists: !!realtime?.conn?.transport,
          readyState: realtime?.conn?.transport?.readyState,
          readyStateText: realtime?.conn?.transport?.readyState === 0 ? 'CONNECTING' : 
                         realtime?.conn?.transport?.readyState === 1 ? 'OPEN' : 
                         realtime?.conn?.transport?.readyState === 2 ? 'CLOSING' : 
                         realtime?.conn?.transport?.readyState === 3 ? 'CLOSED' : 
                         `UNKNOWN(${realtime?.conn?.transport?.readyState})`,
          url: realtime?.conn?.transport?.url?.slice(0, 100),
          protocol: realtime?.conn?.transport?.protocol
        },
        timestamp: Date.now(),
        visibilityState: document.visibilityState,
        timeSincePageLoad: Date.now() - (window.performance?.timing?.navigationStart || Date.now())
      });
      
      // CRITICAL FIX: Browser tab suspension destroys WebSocket objects entirely
      // We must completely recreate the realtime client, not just reconnect
      if (!realtime?.conn?.transport || realtime?.conn?.connectionState === 3) {
        console.error('[WebSocketDebug] 🔥 WEBSOCKET DESTROYED BY BROWSER - FORCING COMPLETE REALTIME RESTART');
        try {
          // Step 1: Clean up dead connection state without calling disconnect()
          // CRITICAL: Don't call disconnect() - it destroys WebSocket objects!
          if (realtime?.conn) {
            // Just reset the connection state - let connect() handle the rest
            try {
              realtime.conn.connectionState = undefined;
              // CRITICAL FIX: DON'T reset transport to null - preserve our WebSocket assignment!
              // The transport fix in client.ts sets this to window.WebSocket, we must preserve it
              console.error('[WebSocketDebug] 🔥 RESET CONNECTION STATE WITHOUT DISCONNECT (preserving transport)');
            } catch (e) {
              console.error('[WebSocketDebug] ❌ CONNECTION STATE RESET FAILED:', e);
            }
          }
          
          // CRITICAL FIX: Don't create a new supabase client - that breaks all existing mutations!
          // Instead, force the existing realtime client to reconnect properly
          console.error('[WebSocketDebug] 🔥 FORCING EXISTING REALTIME CLIENT TO RECONNECT');
          
          // ENSURE TRANSPORT IS SET BEFORE RECONNECTION
          if (realtime && realtime.transport !== window.WebSocket) {
            console.error('[WebSocketDebug] 🔧 ENSURING TRANSPORT IS SET TO WEBSOCKET BEFORE RECONNECT');
            realtime.transport = window.WebSocket;
          }
          
          if ((window as any).supabase?.realtime) {
            const existingRealtime = (window as any).supabase.realtime;
            
            // Force a fresh connection without destroying existing state
            try {
              // CRITICAL FIX: Don't manipulate internal connection state!
              // Just call connect() - Supabase will handle state management
              existingRealtime.connect();
              
              console.error('[WebSocketDebug] ✅ EXISTING REALTIME CLIENT CONNECT CALLED');

              // EXTRA: Instrument Phoenix Socket lifecycle even if WebSocket is lazy
              try {
                const sock: any = existingRealtime?.conn;
                if (sock && !(sock as any).__PHX_INSTRUMENTED__) {
                  (sock as any).__PHX_INSTRUMENTED__ = true;
                  const safeLog = (ev: string, extra?: any) => {
                    try {
                      console.error('[ReconnectionIssue][PhoenixSocket]', ev, {
                        endPoint: sock?.endPointURL?.(),
                        state: sock?.connectionState,
                        transportExists: !!sock?.transport,
                        transportReadyState: sock?.transport?.readyState,
                        ...extra
                      });
                    } catch { console.error('[ReconnectionIssue][PhoenixSocket]', ev); }
                  };
                  try { sock.onOpen(() => safeLog('open')); } catch {}
                  try { sock.onClose(() => safeLog('close')); } catch {}
                  try { sock.onError((e: any) => safeLog('error', { message: e?.message })); } catch {}

                  // CRITICAL: Intercept WebSocket message reception
                  try {
                    const transport = sock?.transport;
                    if (transport && !transport.__MESSAGE_INTERCEPTED__) {
                      transport.__MESSAGE_INTERCEPTED__ = true;
                      const originalOnMessage = transport.onmessage;
                      let messageCount = 0;
                      
                      transport.onmessage = function(event: MessageEvent) {
                        messageCount++;
                        if (messageCount <= 10) {
                          try {
                            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                            console.error('[PhoenixJoinDiag] 📥 WEBSOCKET MESSAGE #' + messageCount + ':', {
                              rawData: typeof event.data === 'string' ? event.data.slice(0, 200) + '...' : '[BINARY]',
                              parsedData: data,
                              event: data?.event,
                              topic: data?.topic,
                              ref: data?.ref,
                              payload: data?.payload,
                              isJoinReply: data?.event === 'phx_reply',
                              timestamp: Date.now()
                            });
                          } catch (parseError) {
                            console.error('[PhoenixJoinDiag] 📥 WEBSOCKET MESSAGE #' + messageCount + ' (unparseable):', {
                              rawData: String(event.data).slice(0, 100),
                              timestamp: Date.now()
                            });
                          }
                        }
                        if (originalOnMessage) {
                          return originalOnMessage.call(this, event);
                        }
                      };
                    }
                  } catch (interceptError) {
                    console.error('[PhoenixJoinDiag] ❌ Failed to intercept WebSocket messages:', interceptError);
                  }
                }
              } catch {}
            } catch (reconnectError) {
              console.error('[WebSocketDebug] ❌ EXISTING REALTIME CLIENT RECONNECT FAILED:', reconnectError);
            }
          }
        } catch (e) {
          console.error('[WebSocketDebug] ❌ REALTIME CLIENT RECREATION FAILED:', e);
        }
      }
    } catch (e) {
      console.error('[ReconnectionIssue] 🔥 PHOENIX TRANSPORT FIX FAILED:', e);
    }
    
    // Check if WebSocket was created after connect()
    setTimeout(() => {
      console.error('[ReconnectionIssue] 🔥 ADAPTER CONNECT RESULT:', {
        socketExistsAfter: !!(supabase as any)?.realtime?.socket,
        socketStateAfter: (supabase as any)?.realtime?.socket?.readyState,
        timestamp: Date.now()
      });
    }, 100);
  }

  disconnect() {
    try { (supabase as any)?.realtime?.disconnect?.(); } catch {}
  }

  forceReconnect(token?: string | null) {
    try { (supabase as any)?.realtime?.setAuth?.(token ?? null); } catch {}
    try { (supabase as any)?.realtime?.disconnect?.(); } catch {}
    try { (supabase as any)?.realtime?.connect?.(); } catch {}
  }

  async forceRealtimeRecreation(): Promise<boolean> {
    console.error('[RealtimeRecreation] 🔄 FORCING COMPLETE REALTIME CLIENT RECREATION');
    
    try {
      // Step 1: Disconnect and cleanup existing client
      const existingRealtime = (supabase as any)?.realtime;
      if (existingRealtime) {
        console.error('[RealtimeRecreation] 🧹 CLEANING UP EXISTING CLIENT');
        try {
          await existingRealtime.disconnect?.();
        } catch (e) {
          console.error('[RealtimeRecreation] ❌ Disconnect error:', e);
        }
        
        // Clear all channels
        if (existingRealtime.channels) {
          existingRealtime.channels.forEach((channel: any) => {
            try {
              channel.unsubscribe?.();
            } catch {}
          });
          existingRealtime.channels = [];
        }
      }

      // Step 2: Force recreation by calling connect() which should recreate the client
      console.error('[RealtimeRecreation] 🏗️ RECREATING REALTIME CLIENT');
      
      // CRITICAL: Diagnose WebSocket connection issues
      const originalWebSocket = window.WebSocket;
      let wsConnectionAttempted = false;
      let wsConnectionResult = null;
      
      // Intercept WebSocket creation to see what's happening
      window.WebSocket = function(url: string, protocols?: string | string[]) {
        wsConnectionAttempted = true;
        console.error('[RealtimeRecreation] 🔍 WEBSOCKET CREATION INTERCEPTED:', {
          url,
          protocols,
          timestamp: Date.now()
        });
        
        const ws = new originalWebSocket(url, protocols);
        
        ws.addEventListener('open', () => {
          wsConnectionResult = 'opened';
          console.error('[RealtimeRecreation] ✅ WEBSOCKET OPENED:', { url });
        });
        
        ws.addEventListener('error', (error) => {
          wsConnectionResult = 'error';
          console.error('[RealtimeRecreation] ❌ WEBSOCKET ERROR:', { url, error });
        });
        
        ws.addEventListener('close', (event) => {
          wsConnectionResult = 'closed';
          console.error('[RealtimeRecreation] 🚪 WEBSOCKET CLOSED:', { url, code: event.code, reason: event.reason });
        });
        
        return ws;
      } as any;
      
      try {
        await this.connect();
      } finally {
        // Restore original WebSocket
        window.WebSocket = originalWebSocket;
        
        console.error('[RealtimeRecreation] 📊 WEBSOCKET DIAGNOSIS RESULT:', {
          wsConnectionAttempted,
          wsConnectionResult,
          timestamp: Date.now()
        });
      }

      // Step 3: Validate the new client
      await new Promise(resolve => setTimeout(resolve, 1000)); // Allow time for setup
      
      const newRealtime = (supabase as any)?.realtime;
      const newConn = newRealtime?.conn;
      
      const isValid = !!(
        newRealtime && 
        newConn && 
        newConn.transport && 
        typeof newConn.isConnected === 'function'
      );

      console.error('[RealtimeRecreation] 📊 RECREATION RESULT:', {
        hasRealtime: !!newRealtime,
        hasConn: !!newConn,
        hasTransport: !!newConn?.transport,
        hasIsConnected: typeof newConn?.isConnected,
        isConnected: newConn?.isConnected?.(),
        transportReadyState: newConn?.transport?.readyState,
        isValid,
        timestamp: Date.now()
      });

      return isValid;
    } catch (e) {
      console.error('[RealtimeRecreation] ❌ RECREATION FAILED:', e);
      return false;
    }
  }

  getGlobalRealtimeState() {
    try {
      const realtime = (supabase as any)?.realtime;
      const socket = realtime?.socket;
      const channels = realtime?.channels || [];
      
      return {
        socketConnected: !!socket?.isConnected?.(),
        socketState: socket?.connectionState,
        totalChannels: channels.length,
        channelTopics: channels.slice(0, 5).map((c: any) => ({
          topic: c.topic,
          state: c.state,
          bindings: c.bindings ? Object.keys(c.bindings).length : 0
        })),
        realtimeProps: Object.keys(realtime || {}).slice(0, 10)
      };
    } catch {
      return { error: 'Failed to inspect global state' };
    }
  }

  setAuth(token?: string | null) {
    try { (supabase as any)?.realtime?.setAuth?.(token ?? null); } catch {}
  }

  getChannels(): any[] { return ((supabase as any)?.getChannels?.() || []) as any[]; }
  removeChannel(ch: any) { 
    try {
      const stack = new Error().stack?.split('\n').slice(1, 4).join(' -> ') || 'unknown';
      console.warn('[ReconnectionIssue][ConnectionKiller] SupabaseAdapter.removeChannel called', {
        topic: ch?.topic,
        state: ch?.state,
        killerStack: stack
      });
      (supabase as any)?.removeChannel?.(ch);
    } catch {}
  }

  async channel(topic: string) {
    const now = Date.now();
    
    console.error('[WebSocketDiagnostic] 🚨 CHANNEL METHOD CALLED:', {
      topic,
      timestamp: now,
      hasSupabase: !!(supabase as any)?.realtime
    });
    
    // CRITICAL: Set up WebSocket monitoring before channel operations
    this.setupWebSocketCloseMonitoring();
    
    // CRITICAL FIX: Check for existing channel and reuse if healthy
    const existingChannels = (supabase as any)?.realtime?.channels || [];
    const existingChannel = existingChannels.find((c: any) => 
      c.topic === topic || c.topic === `realtime:${topic}` || c.topic.endsWith(`:${topic}`)
    );
    
    if (existingChannel) {
      const channelState = existingChannel.state;
      const isHealthyState = channelState === 'joined' || channelState === 'joining';
      
      console.error('[ChannelReuse] 🔍 EXISTING CHANNEL FOUND', {
        requestedTopic: topic,
        existingTopic: existingChannel.topic,
        channelState,
        isHealthyState,
        decision: isHealthyState ? 'reuse' : 'recreate',
        bindings: existingChannel.bindings ? Object.keys(existingChannel.bindings).length : 0,
        timestamp: now
      });
      
      if (isHealthyState) {
        console.error('[ChannelReuse] ♾️ REUSING HEALTHY CHANNEL', {
          reason: 'healthy-existing-channel',
          topic: existingChannel.topic,
          state: channelState,
          timestamp: now
        });
        return existingChannel;
      } else {
        console.error('[ChannelReuse] 🔄 RECREATING UNHEALTHY CHANNEL', {
          reason: 'unhealthy-existing-channel',
          topic: existingChannel.topic,
          state: channelState,
          timestamp: now
        });
        // Continue to create new channel
      }
    }
    
    console.warn('[ReconnectionIssue][CHANNEL_ADAPTER_CREATE]', {
      requestedTopic: topic,
      existingChannels: existingChannels.length,
      foundExistingChannel: !!existingChannel,
      existingChannelDetails: existingChannel ? {
        topic: existingChannel.topic,
        state: existingChannel.state,
        bindings: existingChannel.bindings ? Object.keys(existingChannel.bindings).length : 0
      } : null,
      willCreateNew: true,
      timestamp: now
    });
    
    console.error('[ReconnectionIssue] 🔥 BEFORE CHANNEL CREATION - WEBSOCKET STATE:', {
      socketExists: !!(supabase as any)?.realtime?.socket,
      socketState: (supabase as any)?.realtime?.socket?.readyState,
      realtimeConnected: !!(supabase as any)?.realtime?.isConnected?.(),
      timestamp: Date.now()
    });
    
    // DIAGNOSTIC: Hook into supabase.channel to see what happens during creation
    const realtime = (supabase as any)?.realtime;
    if (realtime && realtime.channel && !(realtime as any).__CHANNEL_CREATION_HOOKED__) {
      (realtime as any).__CHANNEL_CREATION_HOOKED__ = true;
      const originalChannel = realtime.channel.bind(realtime);
      
      realtime.channel = function(topic: string, params?: any) {
        console.error('[PhoenixDiagnostics] 🔍 SUPABASE.CHANNEL() CALLED:', {
          topic,
          params,
          hasConn: !!this.conn,
          connState: this.conn?.connectionState,
          hasTransport: !!this.conn?.transport,
          transportType: typeof this.conn?.transport,
          connectedState: this.isConnected?.(),
          timestamp: Date.now()
        });

        const channel = originalChannel.call(this, topic, params);
        
        console.error('[PhoenixDiagnostics] 🔍 SUPABASE.CHANNEL() RESULT:', {
          topic,
          channelCreated: !!channel,
          channelTopic: channel?.topic,
          channelState: (channel as any)?.state,
          hasSocket: !!(channel as any)?.socket,
          socketConnState: (channel as any)?.socket?.connectionState,
          hasTransport: !!(channel as any)?.socket?.transport,
          timestamp: Date.now()
        });

        // Hook into channel join push/reply for detailed diagnostics
        console.error('[JoinHookDebug] 🔍 ATTEMPTING TO HOOK CHANNEL:', {
          hasChannel: !!channel,
          channelType: typeof channel,
          hasPush: !!(channel as any)?.push,
          hasOn: !!(channel as any)?.on,
          alreadyHooked: !!(channel as any).__JOIN_HOOKED__,
          timestamp: Date.now()
        });
        
        if (channel && !(channel as any).__JOIN_HOOKED__) {
          (channel as any).__JOIN_HOOKED__ = true;
          console.error('[JoinHookDebug] ✅ HOOKING CHANNEL');
          
          // Hook join push - try multiple approaches
          if (typeof (channel as any).push === 'function') {
            const originalPush = (channel as any).push.bind(channel);
            (channel as any).push = function(event: string, payload: any, timeout?: number) {
              console.error('[ChannelJoinPush] 📤 PUSH CALLED:', {
                event,
                topic: this.topic,
                joinRef: this.joinRef,
                ref: this.ref,
                isJoinEvent: event === 'phx_join',
                payloadKeys: payload ? Object.keys(payload) : [],
                timeout,
                timestamp: Date.now()
              });
              
              if (event === 'phx_join') {
                console.error('[ChannelJoinPush] 📤 JOIN SENT:', {
                  topic: this.topic,
                  joinRef: this.joinRef,
                  ref: this.ref,
                  payloadKeys: payload ? Object.keys(payload) : [],
                  timeout,
                  timestamp: Date.now()
                });
              }
              
              return originalPush.call(this, event, payload, timeout);
            };
            console.error('[JoinHookDebug] ✅ PUSH HOOK INSTALLED');
          } else {
            console.error('[JoinHookDebug] ❌ NO PUSH METHOD FOUND');
          }
          
          // Hook join reply
          if (typeof (channel as any).on === 'function') {
            (channel as any).on('phx_reply', (payload: any, ref: any) => {
              if (ref === (channel as any).joinRef) {
                console.error('[ChannelJoinReply] 📥 RECEIVED:', {
                  topic: (channel as any).topic,
                  status: payload?.status,
                  joinRef: (channel as any).joinRef,
                  ref,
                  payloadKeys: payload ? Object.keys(payload) : [],
                  timestamp: Date.now()
                });
              }
            });
            console.error('[JoinHookDebug] ✅ REPLY HOOK INSTALLED');
          } else {
            console.error('[JoinHookDebug] ❌ NO ON METHOD FOUND');
          }
        } else {
          console.error('[JoinHookDebug] ⏸️ HOOK SKIPPED:', {
            reason: !channel ? 'no channel' : 'already hooked',
            timestamp: Date.now()
          });
        }

        // Add Phoenix channel state monitoring
        const monitorPhoenixChannel = () => {
          // Try multiple ways to access the underlying Phoenix channel
          const phoenixChannel = (channel as any)._channel || 
                                (channel as any).channel ||
                                (channel as any).socket?.channels?.find((ch: any) => ch.topic === topic);
          
          // Also check if we can access via the realtime socket
          const realtimeSocket = (realtime as any)?.socket || (realtime as any)?.conn;
          const socketChannels = realtimeSocket?.channels || [];
          const socketChannel = socketChannels.find((ch: any) => ch.topic === `realtime:${topic}`);
          
          if (phoenixChannel) {
            console.error('[PhoenixChannelDebug] 🔍 PHOENIX CHANNEL STATE:', {
              topic,
              phoenixState: phoenixChannel.state,
              phoenixJoinRef: phoenixChannel.joinRef,
              phoenixRef: phoenixChannel.ref,
              phoenixPushBuffer: phoenixChannel.pushBuffer?.length || 0,
              phoenixBindings: phoenixChannel.bindings ? Object.keys(phoenixChannel.bindings) : [],
              timestamp: Date.now()
            });
          } else {
            console.error('[PhoenixChannelDebug] ❌ NO PHOENIX CHANNEL:', {
              topic,
              channelType: typeof channel,
              channelKeys: Object.keys(channel),
              channelKeyDetails: Object.keys(channel).map(key => ({
                key,
                type: typeof (channel as any)[key],
                hasPhoenixProps: key.includes('phoenix') || key.includes('channel') || key.includes('socket')
              })),
              channelState: (channel as any).state,
              channelSocket: (channel as any).socket ? 'exists' : 'missing',
              socketChannelFound: !!socketChannel,
              socketChannelState: socketChannel?.state,
              socketChannelRef: socketChannel?.ref,
              realtimeSocketExists: !!realtimeSocket,
              socketChannelsCount: socketChannels.length,
              timestamp: Date.now()
            });
          }
        };
        
        // Monitor immediately and after delays
        monitorPhoenixChannel();
        setTimeout(monitorPhoenixChannel, 100);
        setTimeout(monitorPhoenixChannel, 1000);

        // Hook into channel.subscribe if it exists
        if (channel && channel.subscribe && !(channel as any).__SUBSCRIBE_HOOKED__) {
          (channel as any).__SUBSCRIBE_HOOKED__ = true;
          const originalSubscribe = channel.subscribe.bind(channel);
          
          channel.subscribe = function(callback?: any, timeout?: number) {
            console.error('[PhoenixDiagnostics] 🔍 CHANNEL.SUBSCRIBE() CALLED:', {
              topic: this.topic,
              state: this.state,
              hasSocket: !!this.socket,
              socketConnState: this.socket?.connectionState,
              hasTransport: !!this.socket?.transport,
              transportType: typeof this.socket?.transport,
              callback: !!callback,
              timeout,
              timestamp: Date.now()
            });

            const result = originalSubscribe.call(this, callback, timeout);
            
            console.error('[PhoenixDiagnostics] 🔍 CHANNEL.SUBSCRIBE() RESULT:', {
              topic: this.topic,
              state: this.state,
              result,
              resultType: typeof result,
              timestamp: Date.now()
            });

            // Add immediate post-subscribe diagnostics
            setTimeout(() => {
              console.error('[PhoenixDiagnostics] ⏰ POST-SUBSCRIBE STATE (100ms later):', {
                topic: this.topic,
                state: this.state,
                hasSocket: !!this.socket,
                socketReadyState: this.socket?.readyState,
                socketConnected: this.socket?.isConnected?.(),
                transportExists: !!this.socket?.transport,
                joinRef: this.joinRef,
                ref: this.ref,
                timestamp: Date.now()
              });
            }, 100);

            return result;
          };
        }

        return channel;
      };
    }

    // CRITICAL FIX: Ensure Phoenix socket is properly connected before creating channel
    // Note: realtime variable already declared above, reusing it
    const conn = realtime?.conn;
    const isPhoenixConnected = conn?.transport?.readyState === 1 && conn?.isConnected?.();
    
    if (!isPhoenixConnected) {
      console.error('[PhoenixConnectionFix] 🚨 PHOENIX SOCKET NOT CONNECTED - FORCING CONNECTION:', {
        connExists: !!conn,
        transportExists: !!conn?.transport,
        transportReadyState: conn?.transport?.readyState,
        isConnected: conn?.isConnected?.(),
        timestamp: Date.now()
      });

      // ENHANCED: Diagnose Phoenix connection object and attempt multiple connection methods
      console.error('[PhoenixConnectionFix] 🔍 PHOENIX CONNECTION OBJECT ANALYSIS:', {
        connExists: !!conn,
        connKeys: conn ? Object.keys(conn).slice(0, 10) : [],
        connPrototype: conn ? Object.getPrototypeOf(conn).constructor?.name : null,
        hasConnect: typeof conn?.connect,
        hasReconnect: typeof conn?.reconnect,
        hasOpen: typeof conn?.open,
        hasSocket: !!conn?.socket,
        transport: conn?.transport?.constructor?.name || typeof conn?.transport,
        endPoint: conn?.endPoint,
        timestamp: Date.now()
      });

      // Try multiple connection approaches
      let connectionAttempted = false;
      
      if (conn) {
        // Method 1: Direct connect()
        if (typeof conn.connect === 'function') {
          console.error('[PhoenixConnectionFix] 🔄 METHOD 1: CALLING CONN.CONNECT()');
          try {
            conn.connect();
            connectionAttempted = true;
          } catch (e) {
            console.error('[PhoenixConnectionFix] ❌ METHOD 1 FAILED:', e);
          }
        }
        
        // Method 2: Try reconnect() if connect() doesn't exist
        if (!connectionAttempted && typeof conn.reconnect === 'function') {
          console.error('[PhoenixConnectionFix] 🔄 METHOD 2: CALLING CONN.RECONNECT()');
          try {
            conn.reconnect();
            connectionAttempted = true;
          } catch (e) {
            console.error('[PhoenixConnectionFix] ❌ METHOD 2 FAILED:', e);
          }
        }
        
        // Method 3: Force realtime client reconnection at higher level
        if (!connectionAttempted && realtime) {
          console.error('[PhoenixConnectionFix] 🔄 METHOD 3: CALLING REALTIME.CONNECT()');
          try {
            if (typeof realtime.connect === 'function') {
              realtime.connect();
              connectionAttempted = true;
            }
          } catch (e) {
            console.error('[PhoenixConnectionFix] ❌ METHOD 3 FAILED:', e);
          }
        }
        
        if (connectionAttempted) {
          // Wait for connection with timeout
          const startTime = Date.now();
          await new Promise((resolve) => {
            const checkConnection = () => {
              const isNowConnected = conn?.transport?.readyState === 1 && conn?.isConnected?.();
              if (isNowConnected) {
                console.error('[PhoenixConnectionFix] ✅ PHOENIX SOCKET CONNECTED');
                resolve(true);
              } else if (Date.now() - startTime > 3000) {
                console.error('[PhoenixConnectionFix] ⏰ PHOENIX CONNECTION TIMEOUT');
                resolve(false);
              } else {
                setTimeout(checkConnection, 100);
              }
            };
            checkConnection();
          });
        } else {
          console.error('[PhoenixConnectionFix] ❌ NO CONNECTION METHODS AVAILABLE - FORCING RECREATION');
          // If no connection methods work, force complete recreation
          const recreationSuccess = await this.forceRealtimeRecreation();
          if (!recreationSuccess) {
            console.error('[PhoenixConnectionFix] ❌ RECREATION FAILED - WebSocket connection unstable');
            throw new Error('Unable to establish stable WebSocket connection');
          }
        }
      }
    }

    // DIAGNOSTIC: Log connection state after fix attempt  
    console.error('[PhoenixJoinDiag] 🔍 REALTIME CONNECTION DETAILS AT SUBSCRIBE:', {
      endPointURL: conn?.endPointURL?.(),
      params: conn?.params,
      connState: conn?.connectionState,
      connTransport: !!conn?.transport,
      connTransportType: typeof conn?.transport,
      connTransportReadyState: conn?.transport?.readyState,
      connIsConnected: conn?.isConnected?.(),
      phoenixSocketFixed: isPhoenixConnected ? 'was-already-connected' : 'attempted-fix',
      timestamp: Date.now()
    });

    // Enable ack to ensure server sends joined confirmation quickly and avoid client-side timeouts
    // CRITICAL: Ensure realtime connection exists before creating channel
    // Note: realtime variable already declared above at line 717, reusing it
    console.error('[ChannelCreationDebug] 🔍 CHANNEL CREATION TRANSPORT CHECK:', {
      hasRealtime: !!realtime,
      hasConn: !!realtime?.conn,
      hasTransport: !!realtime?.conn?.transport,
      transportType: typeof realtime?.conn?.transport,
      transportConstructorName: realtime?.conn?.transport?.constructor?.name,
      realtimeTransportType: typeof realtime?.transport,
      realtimeTransportName: realtime?.transport?.transportName,
      timestamp: Date.now()
    });
    
    if (!realtime?.conn?.transport) {
      console.error('[ChannelFix] 🚨 NO TRANSPORT - FORCING CONNECTION BEFORE CHANNEL CREATION');
      
      try {
        // Get current session for auth
        const { data: { session } } = await supabase.auth.getSession();
        console.error('[ChannelFix] 📞 Got session for connection:', { hasSession: !!session });
        
        // Set auth and ensure proper transport before connect
        realtime?.setAuth?.(session?.access_token ?? null);
        
        // Ensure Phoenix transport factory is set
        if (!realtime.transport || realtime.transport === window.WebSocket) {
          console.error('[ChannelFix] 🔧 SETTING PHOENIX TRANSPORT FACTORY');
          const phoenixWebSocketTransport = function(endpoint: string) {
            console.error('[ChannelTransportFactory] 🏭 Creating WebSocket for endpoint:', endpoint);
            return new window.WebSocket(endpoint);
          };
          phoenixWebSocketTransport.transportName = 'websocket';
          realtime.transport = phoenixWebSocketTransport;
        }
        
        realtime?.connect?.();
        
        // Wait a moment for connection to establish
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Apply transport fix if still missing
        if (realtime?.conn && !realtime.conn.transport && realtime.transport) {
          console.error('[ChannelFix] 🔧 APPLYING TRANSPORT FIX');
          realtime.conn.transport = realtime.transport;
        }
        
        // DIAGNOSTIC: Check what the transport actually is after connection
        console.error('[ChannelFix] 🔍 TRANSPORT ANALYSIS AFTER CONNECTION:', {
          realtimeHasTransport: !!realtime?.transport,
          realtimeTransportType: typeof realtime?.transport,
          realtimeTransportConstructor: realtime?.transport?.constructor?.name,
          connHasTransport: !!realtime?.conn?.transport,
          connTransportType: typeof realtime?.conn?.transport,
          connTransportConstructor: realtime?.conn?.transport?.constructor?.name,
          transportMatch: realtime?.transport === realtime?.conn?.transport,
          connTransportIsWebSocket: realtime?.conn?.transport === window.WebSocket,
          connTransportIsFunction: typeof realtime?.conn?.transport === 'function',
          timestamp: Date.now()
        });
        
        console.error('[ChannelFix] ✅ CONNECTION ESTABLISHED:', {
          hasTransport: !!realtime?.conn?.transport,
          transportType: typeof realtime?.conn?.transport,
          timestamp: Date.now()
        });
        
      } catch (e) {
        console.error('[ChannelFix] ❌ Failed to establish connection:', e);
      }
    }

    // CRITICAL: Set up WebSocket monitoring right before channel creation
    this.setupWebSocketCloseMonitoring();
    
    console.error('[ChannelCreationDebug] 🏭 CREATING SUPABASE CHANNEL:', {
      topic,
      config: { broadcast: { self: false, ack: true } },
      realtimeConnected: !!(supabase as any)?.realtime?.isConnected?.(),
      hasTransport: !!realtime?.conn?.transport,
      timestamp: Date.now()
    });
    
    const channel = supabase.channel(topic, { config: { broadcast: { self: false, ack: true } } });
    
    console.error('[ChannelCreationDebug] 🏭 CHANNEL CREATED - IMMEDIATE STATE:', {
      channelExists: !!channel,
      channelState: channel?.state,
      channelTopic: channel?.topic,
      channelBindings: channel?.bindings ? Object.keys(channel.bindings).length : 0,
      wasReused: false,
      timestamp: now
    });
    
    console.error('[ReconnectionIssue] 🔥 AFTER CHANNEL CREATION - WEBSOCKET STATE:', {
      socketExists: !!(supabase as any)?.realtime?.socket,
      socketState: (supabase as any)?.realtime?.socket?.readyState,
      realtimeConnected: !!(supabase as any)?.realtime?.isConnected?.(),
      channelCreated: !!channel,
      timestamp: Date.now()
    });
    
    // Log what we actually got back
    console.warn('[ReconnectionIssue][CHANNEL_ADAPTER_RESULT]', {
      requestedTopic: topic,
      resultTopic: channel?.topic,
      resultState: (channel as any)?.state,
      resultBindings: (channel as any)?.bindings ? Object.keys((channel as any).bindings).length : 0,
      isReused: false, // New channel created
      timestamp: now
    });
    
    return channel;
  }

  getSocketConnectionState(): { isConnected: boolean; connectionState?: string } {
    const socket: any = (supabase as any)?.realtime?.socket;
    return { isConnected: !!socket?.isConnected?.(), connectionState: socket?.connectionState };
  }
}


