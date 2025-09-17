// Simple, clean Supabase Realtime implementation following official documentation
import { supabase } from '@/integrations/supabase/client';
import { dataFreshnessManager } from './DataFreshnessManager';

export class SimpleRealtimeManager {
  private channel: any = null;
  private projectId: string | null = null;
  private isSubscribed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  private boundAuthHealHandler: (event: CustomEvent) => void;

  constructor() {
    // Store bound handler for proper cleanup
    this.boundAuthHealHandler = this.handleAuthHeal.bind(this);
    
    // Listen for auth heal events from ReconnectScheduler
    if (typeof window !== 'undefined') {
      window.addEventListener('realtime:auth-heal', this.boundAuthHealHandler);
    }
  }

  private handleAuthHeal = (event: CustomEvent) => {
    console.log('[SimpleRealtime] 🔄 Auth heal event received:', event.detail);
    
    // If we have a project and are not currently connected, attempt to reconnect
    if (this.projectId && !this.isSubscribed && this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log('[SimpleRealtime] 🔄 Attempting reconnect due to auth heal');
      this.attemptReconnect();
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[SimpleRealtime] ⏸️ Skipping auth heal reconnect - max attempts reached');
    }
  };

  private async attemptReconnect() {
    if (!this.projectId) return;

    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Don't exceed max attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SimpleRealtime] ❌ Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
    
    console.log('[SimpleRealtime] ⏳ Reconnecting in', delay, 'ms (attempt', this.reconnectAttempts, '/', this.maxReconnectAttempts, ')');
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        const success = await this.joinProject(this.projectId!);
        if (success) {
          console.log('[SimpleRealtime] ✅ Reconnect successful');
          this.reconnectAttempts = 0; // Reset on success
        } else {
          console.log('[SimpleRealtime] ❌ Reconnect failed, will retry');
          this.attemptReconnect();
        }
      } catch (error) {
        console.error('[SimpleRealtime] ❌ Reconnect error:', error);
        this.attemptReconnect();
      }
    }, delay);
  }

  async joinProject(projectId: string): Promise<boolean> {
    console.log('[SimpleRealtime] 🚀 Joining project:', projectId);
    
    // Check authentication first (use getSession for local/cached check)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        console.error('[SimpleRealtime] ❌ No valid session, cannot join project:', {
          sessionError: sessionError?.message,
          hasSession: !!session,
          hasUser: !!session?.user,
          projectId
        });
        dataFreshnessManager.onRealtimeStatusChange('error', 'No valid session');
        return false;
      }
      
      // Explicitly set auth token for realtime before subscribing
      if (session.access_token) {
        console.log('[SimpleRealtime] 🔑 Setting realtime auth token');
        supabase.realtime.setAuth(session.access_token);
      }
      
      console.log('[SimpleRealtime] ✅ Authentication verified for user:', session.user.id);
    } catch (error) {
      console.error('[SimpleRealtime] ❌ Auth check failed:', error);
      dataFreshnessManager.onRealtimeStatusChange('error', 'Auth check failed');
      return false;
    }
    
    // Clean up existing subscription
    if (this.channel) {
      await this.leave();
    }

    this.projectId = projectId;
    this.reconnectAttempts = 0; // Reset reconnect attempts for new project
    const topic = `task-updates:${projectId}`;

    try {
      // Create channel following Supabase documentation pattern
      this.channel = supabase.channel(topic);
      
      console.log('[SimpleRealtime] 📡 Channel created:', {
        topic,
        channelExists: !!this.channel,
        realtimeExists: !!(supabase as any)?.realtime,
        socketExists: !!(supabase as any)?.realtime?.socket,
        socketReadyState: (supabase as any)?.realtime?.socket?.readyState
      });

      // Add event handlers BEFORE subscribing
      this.channel
        .on('broadcast', { event: 'task-update' }, (payload: any) => {
          console.log('[SimpleRealtime] 📨 Task update received:', payload);
          // Handle the task update
          this.handleTaskUpdate(payload);
        })
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, 
          (payload: any) => {
            console.log('[SimpleRealtime] 📨 New task:', payload);
            this.handleNewTask(payload);
          }
        )
        .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, 
          (payload: any) => {
            console.log('[SimpleRealtime] 📨 Task updated:', payload);
            this.handleTaskUpdate(payload);
          }
        );

      // Subscribe with status callback
      const subscribeResult = await new Promise<boolean>((resolve) => {
        const timeoutId = setTimeout(() => {
          console.error('[SimpleRealtime] ❌ Subscribe timeout');
          resolve(false);
        }, 10000);

        this.channel.subscribe((status: string) => {
          clearTimeout(timeoutId);
          console.log('[SimpleRealtime] 📞 Status:', status);
          
          if (status === 'SUBSCRIBED') {
            console.log('[SimpleRealtime] ✅ Successfully subscribed');
            this.isSubscribed = true;
            this.reconnectAttempts = 0; // Reset reconnect attempts on success
            this.updateGlobalSnapshot('joined');
            
            // Report successful connection to freshness manager
            dataFreshnessManager.onRealtimeStatusChange('connected', 'Supabase subscription successful');
            
            resolve(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[SimpleRealtime] ❌ Subscription failed:', status);
            this.isSubscribed = false;
            this.updateGlobalSnapshot('error');
            
            // Check authentication state for debugging
            supabase.auth.getUser().then(({ data: { user }, error }) => {
              console.error('[SimpleRealtime] 🔍 Auth check after channel error:', {
                hasUser: !!user,
                userId: user?.id,
                authError: error?.message,
                status,
                timestamp: Date.now()
              });
            }).catch(authErr => {
              console.error('[SimpleRealtime] ❌ Failed to check auth:', authErr);
            });
            
            // Report failure to freshness manager
            dataFreshnessManager.onRealtimeStatusChange('error', `Subscription failed: ${status}`);
            
            resolve(false);
          }
        });
      });

      return subscribeResult;

    } catch (error) {
      console.error('[SimpleRealtime] ❌ Join failed:', error);
      
      // Report connection failure to freshness manager
      dataFreshnessManager.onRealtimeStatusChange('error', `Join failed: ${error}`);
      
      return false;
    }
  }

  async leave(): Promise<void> {
    console.log('[SimpleRealtime] 👋 Leaving channel');
    
    // Clear any pending reconnect timeout (unconditionally)
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
      this.updateGlobalSnapshot('closed');
      
      // Report disconnection to freshness manager
      dataFreshnessManager.onRealtimeStatusChange('disconnected', 'Channel unsubscribed');
    }
    
    // Reset state regardless of channel existence
    this.isSubscribed = false;
    this.projectId = null;
    this.reconnectAttempts = 0;
  }

  private handleTaskUpdate(payload: any) {
    // Update global snapshot with latest event time
    this.updateGlobalSnapshot('joined', Date.now());
    
    // Report event to freshness manager - this is the key integration!
    dataFreshnessManager.onRealtimeEvent('task-update', [
      ['tasks'],
      ['task-status-counts'], 
      ['unified-generations'],
      ['tasks', 'paginated', this.projectId].filter(Boolean)
    ]);
    
    // Emit event for React components to listen to
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('realtime:task-update', { 
        detail: payload 
      }));
    }
  }

  private handleNewTask(payload: any) {
    // Update global snapshot with latest event time
    this.updateGlobalSnapshot('joined', Date.now());
    
    // Report event to freshness manager
    dataFreshnessManager.onRealtimeEvent('task-new', [
      ['tasks'],
      ['task-status-counts'], 
      ['unified-generations'],
      ['tasks', 'paginated', this.projectId].filter(Boolean)
    ]);
    
    // Emit event for React components to listen to
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('realtime:task-new', { 
        detail: payload 
      }));
    }
  }

  private updateGlobalSnapshot(channelState: string, lastEventAt?: number) {
    if (typeof window !== 'undefined') {
      const currentSnapshot = (window as any).__REALTIME_SNAPSHOT__ || {};
      (window as any).__REALTIME_SNAPSHOT__ = {
        ...currentSnapshot,
        channelState,
        lastEventAt: lastEventAt || currentSnapshot.lastEventAt,
        timestamp: Date.now()
      };
    }
  }

  getStatus() {
    return {
      isSubscribed: this.isSubscribed,
      projectId: this.projectId,
      channelState: this.channel?.state || 'closed',
      reconnectAttempts: this.reconnectAttempts
    };
  }

  reset() {
    console.log('[SimpleRealtime] 🔄 Resetting connection state');
    this.reconnectAttempts = 0;
    
    // Clear any pending reconnect timeout (unconditionally)
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  destroy() {
    // Clean up event listener with proper bound handler
    if (typeof window !== 'undefined') {
      window.removeEventListener('realtime:auth-heal', this.boundAuthHealHandler);
    }
    
    // Clear any pending reconnect timeout (unconditionally)
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Leave any active channel
    this.leave();
  }
}

// Singleton instance
export const simpleRealtimeManager = new SimpleRealtimeManager();
