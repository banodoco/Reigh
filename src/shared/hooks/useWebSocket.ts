import React from 'react';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useWebSocket(projectId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const authListenerRef = useRef<{ subscription: { unsubscribe: () => void } } | null>(null);

  useEffect(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up existing channel before creating new one
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    const setupChannel = () => {
      // Create a Supabase Realtime channel for task updates
      channelRef.current = supabase
        .channel('task-updates', {
          config: {
            broadcast: {
              self: false, // Don't receive own messages
              ack: false,  // Don't require acknowledgment
            },
          },
        })
        .on('broadcast', { event: 'task-update' }, (payload) => {
          try {
            const message = payload.payload;
            
            switch (message.type) {
              case 'TASK_CREATED': {
                const { projectId } = message.payload;
                console.log(`[WebSocket] Task created for project ${projectId}, invalidating task queries.`);
                queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
                break;
              }
              case 'TASK_COMPLETED': {
                const { projectId } = message.payload;
                console.log(`[WebSocket] Task completed for project ${projectId}. Invalidating task & generation queries.`);
                queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
                queryClient.invalidateQueries({ queryKey: ['tasks'] }); // General task list
                queryClient.invalidateQueries({ queryKey: ['generations', projectId] });
                break;
              }
              case 'TASKS_STATUS_UPDATE': {
                const { projectId } = message.payload;
                // console.log(`[WebSocket] Invalidating task queries for project ${projectId} due to status update.`);
                queryClient.invalidateQueries({ queryKey: ['tasks', { projectId }] });
                break;
              }
              case 'GENERATIONS_UPDATED': {
                const { projectId, shotId } = message.payload;
                console.log(`[WebSocket] Invalidating generation/shot queries for project: ${projectId}, shot: ${shotId}`);
                queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
                queryClient.invalidateQueries({ queryKey: ['generations', projectId] });
                if (shotId) {
                  queryClient.invalidateQueries({ queryKey: ['shots', shotId] });
                }
                break;
              }
              default:
                console.warn('[WebSocket] Received unknown message type:', message.type);
                break;
            }
          } catch (error) {
            console.error('[WebSocket] Error parsing message or handling event:', error);
          }
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('[WebSocket] Connected to Supabase Realtime');
            reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[WebSocket] Supabase Realtime channel error:', err);
            
            // Implement exponential backoff for reconnection
            const attemptReconnect = () => {
              if (reconnectAttemptsRef.current < 5) { // Max 5 reconnect attempts
                reconnectAttemptsRef.current++;
                const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // Max 30s delay
                
                console.log(`[WebSocket] Attempting reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
                
                reconnectTimeoutRef.current = setTimeout(() => {
                  if (channelRef.current) {
                    channelRef.current.unsubscribe();
                    channelRef.current = null;
                  }
                  setupChannel();
                }, delay);
              } else {
                console.error('[WebSocket] Max reconnection attempts reached. Please refresh the page.');
              }
            };
            
            attemptReconnect();
          } else if (status === 'TIMED_OUT') {
            console.error('[WebSocket] Supabase Realtime connection timed out');
            // Also attempt reconnect on timeout
            if (reconnectAttemptsRef.current < 5) {
              reconnectAttemptsRef.current++;
              reconnectTimeoutRef.current = setTimeout(setupChannel, 5000);
            }
          } else if (status === 'CLOSED') {
            console.log('[WebSocket] Disconnected from Supabase Realtime');
          }
        });
    };

    // Track authentication state
    let isAuthenticated = false;

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const wasAuthenticated = isAuthenticated;
      isAuthenticated = !!session;

      console.log(`[WebSocket] Auth state changed: ${event}, authenticated: ${isAuthenticated}`);

      // Clean up channel on sign out or token refresh
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (channelRef.current) {
          channelRef.current.unsubscribe();
          channelRef.current = null;
        }
        reconnectAttemptsRef.current = 0;
      }

      // Create channel when needed (only once)
      if (isAuthenticated && !channelRef.current) {
        const shouldCreateChannel = 
          event === 'SIGNED_IN' || 
          event === 'TOKEN_REFRESHED' || 
          (event === 'INITIAL_SESSION' && !wasAuthenticated);

        if (shouldCreateChannel) {
          console.log(`[WebSocket] Creating channel for auth event: ${event}`);
          setupChannel();
        }
      }
    });
    
    authListenerRef.current = authListener;

    // Trigger initial session check (will fire INITIAL_SESSION event)
    supabase.auth.getSession();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (authListenerRef.current) {
        authListenerRef.current.subscription.unsubscribe();
        authListenerRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
  }, [queryClient, projectId]);
} 