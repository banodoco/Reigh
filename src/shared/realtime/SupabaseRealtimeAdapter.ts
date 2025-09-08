import { supabase } from '@/integrations/supabase/client';

// CRITICAL: Verify this file is loaded
console.error('[ReconnectionIssue] 🔥 SUPABASE ADAPTER FILE LOADED AT:', new Date().toISOString());

export type ChannelRef = ReturnType<typeof supabase.channel>;

export type SocketState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'cooldown' | 'error' | 'unknown';

export class SupabaseRealtimeAdapter {
  async connect(token?: string | null) {
    console.error('[SilentRejoinDebug] 🔌 ADAPTER.CONNECT() CALLED', {
      hasToken: !!token,
      tokenPrefix: (typeof token === 'string' ? token.slice(0, 20) + '...' : 'null'),
      timestamp: Date.now(),
      callStack: new Error().stack?.split('\n').slice(1, 4)
    });
    
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
    
    try { 
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
      if (realtime && realtime.transport !== window.WebSocket) {
        console.error('[DeepDebug] 🔧 FIXING TRANSPORT BEFORE CONNECT CALL');
        realtime.transport = window.WebSocket;
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

  channel(topic: string) {
    // CRITICAL: Log channel creation to understand reuse
    const existingChannels = (supabase as any)?.realtime?.channels || [];
    const existingChannel = existingChannels.find((c: any) => 
      c.topic === topic || c.topic === `realtime:${topic}` || c.topic.endsWith(`:${topic}`)
    );
    
    console.warn('[ReconnectionIssue][CHANNEL_ADAPTER_CREATE]', {
      requestedTopic: topic,
      existingChannels: existingChannels.length,
      foundExistingChannel: !!existingChannel,
      existingChannelDetails: existingChannel ? {
        topic: existingChannel.topic,
        state: existingChannel.state,
        bindings: existingChannel.bindings ? Object.keys(existingChannel.bindings).length : 0
      } : null,
      timestamp: Date.now()
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

            return result;
          };
        }

        return channel;
      };
    }

    const channel = supabase.channel(topic, { config: { broadcast: { self: false, ack: false } } });
    
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
      isReused: existingChannel && channel === existingChannel,
      timestamp: Date.now()
    });
    
    return channel;
  }

  getSocketConnectionState(): { isConnected: boolean; connectionState?: string } {
    const socket: any = (supabase as any)?.realtime?.socket;
    return { isConnected: !!socket?.isConnected?.(), connectionState: socket?.connectionState };
  }
}


