// Simple, clean Supabase Realtime implementation following official documentation
import { supabase } from '@/integrations/supabase/client';
import { dataFreshnessManager } from './DataFreshnessManager';

export class SimpleRealtimeManager {
  private channel: any = null;
  private projectId: string | null = null;
  private isSubscribed = false;

  async joinProject(projectId: string): Promise<boolean> {
    console.log('[SimpleRealtime] 🚀 Joining project:', projectId);
    
    // Clean up existing subscription
    if (this.channel) {
      await this.leave();
    }

    this.projectId = projectId;
    const topic = `task-updates:${projectId}`;

    try {
      // Create channel following Supabase documentation pattern
      this.channel = supabase.channel(topic);

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
            this.updateGlobalSnapshot('joined');
            
            // Report successful connection to freshness manager
            dataFreshnessManager.onRealtimeStatusChange('connected', 'Supabase subscription successful');
            
            resolve(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[SimpleRealtime] ❌ Subscription failed:', status);
            this.isSubscribed = false;
            this.updateGlobalSnapshot('error');
            
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
    if (this.channel) {
      console.log('[SimpleRealtime] 👋 Leaving channel');
      await this.channel.unsubscribe();
      this.channel = null;
      this.isSubscribed = false;
      this.projectId = null;
      this.updateGlobalSnapshot('closed');
      
      // Report disconnection to freshness manager
      dataFreshnessManager.onRealtimeStatusChange('disconnected', 'Channel unsubscribed');
    }
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
      channelState: this.channel?.state || 'closed'
    };
  }
}

// Singleton instance
export const simpleRealtimeManager = new SimpleRealtimeManager();
