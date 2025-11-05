// Simple, clean Supabase Realtime implementation following official documentation
import { supabase } from '@/integrations/supabase/client';
import { dataFreshnessManager } from './DataFreshnessManager';

export class SimpleRealtimeManager {
  private channel: any = null;
  private projectId: string | null = null;
  private isSubscribed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5; // Increased from 3 to handle transient issues
  private reconnectTimeout: NodeJS.Timeout | null = null;

  // Event batching to prevent cascading invalidations
  private eventBatchQueue: Map<string, any[]> = new Map();
  private batchTimeoutId: NodeJS.Timeout | null = null;
  private readonly BATCH_WINDOW_MS = 100; // Batch events within 100ms

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
    // If we have a project and are not currently connected, attempt to reconnect
    if (this.projectId && !this.isSubscribed && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnect();
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
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
    
    ');
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        const success = await this.joinProject(this.projectId!);
        if (success) {
          this.reconnectAttempts = 0; // Reset on success
        } else {
          this.attemptReconnect();
        }
      } catch (error) {
        console.error('[SimpleRealtime] ❌ Reconnect error:', error);
        this.attemptReconnect();
      }
    }, delay);
  }

  async joinProject(projectId: string): Promise<boolean> {
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
        supabase.realtime.setAuth(session.access_token);
      }
      
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
      
      ?.realtime,
        socketExists: !!(supabase as any)?.realtime?.socket,
        socketReadyState: (supabase as any)?.realtime?.socket?.readyState
      });

      // Add event handlers BEFORE subscribing
      this.channel
        .on('broadcast', { event: 'task-update' }, (payload: any) => {
          // Handle the task update
          this.handleTaskUpdate(payload);
        })
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, 
          (payload: any) => {
            this.handleNewTask(payload);
          }
        )
        .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, 
          (payload: any) => {
            this.handleTaskUpdate(payload);
          }
        )
        // Listen to shot_generations table for positioned image changes
        // This allows timeline to reload ONLY when relevant positioned images are added/updated
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'shot_generations' }, 
          (payload: any) => {
            this.handleShotGenerationChange(payload, 'INSERT');
          }
        )
        .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'shot_generations' }, 
          (payload: any) => {
            this.handleShotGenerationChange(payload, 'UPDATE');
          }
        )
        // Listen to generations table for upscale completion and other updates
        .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'generations', filter: `project_id=eq.${projectId}` }, 
          (payload: any) => {
            :', payload);
            this.handleGenerationUpdate(payload);
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
          if (status === 'SUBSCRIBED') {
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
    // Clear any pending reconnect timeout (unconditionally)
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Clear any pending batch timeout
    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
      this.batchTimeoutId = null;
    }
    
    // Clear the event queue
    if (this.eventBatchQueue.size > 0) {
      this.eventBatchQueue.clear();
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

  /**
   * Batch an event for processing. Events are grouped by type and processed together
   * within BATCH_WINDOW_MS to reduce invalidation cascades.
   */
  private batchEvent(eventType: string, payload: any) {
    const existing = this.eventBatchQueue.get(eventType) || [];
    existing.push(payload);
    this.eventBatchQueue.set(eventType, existing);

    });

    // Clear existing timeout if any
    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
    }

    // Set new timeout to process batch
    this.batchTimeoutId = setTimeout(() => {
      this.processBatchedEvents();
    }, this.BATCH_WINDOW_MS);
  }

  /**
   * Process all batched events together, dispatching a single consolidated event
   * for each event type.
   */
  private processBatchedEvents() {
    if (this.eventBatchQueue.size === 0) {
      return;
    }

    ),
      totalEvents: Array.from(this.eventBatchQueue.values()).reduce((sum, arr) => sum + arr.length, 0),
      breakdown: Array.from(this.eventBatchQueue.entries()).map(([type, events]) => ({
        type,
        count: events.length
      })),
      timestamp: Date.now()
    });

    // Process each event type
    this.eventBatchQueue.forEach((payloads, eventType) => {
      if (eventType === 'task-update') {
        this.dispatchBatchedTaskUpdates(payloads);
      } else if (eventType === 'task-new') {
        this.dispatchBatchedNewTasks(payloads);
      } else if (eventType === 'shot-generation-change') {
        this.dispatchBatchedShotGenerationChanges(payloads);
      } else if (eventType === 'generation-update') {
        this.dispatchBatchedGenerationUpdates(payloads);
      }
    });

    // Clear the queue
    this.eventBatchQueue.clear();
    this.batchTimeoutId = null;
  }

  /**
   * Dispatch batched task update events as a single consolidated event
   */
  private dispatchBatchedTaskUpdates(payloads: any[]) {
    // Update global snapshot with latest event time
    this.updateGlobalSnapshot('joined', Date.now());

    });

    // Report consolidated event to freshness manager
    dataFreshnessManager.onRealtimeEvent('task-update', [
      ['tasks'],
      ['task-status-counts'],
      ['unified-generations'],
      ['shot-generations'], // 🚀 Invalidate shot-specific generation queries (e.g., for upscale in Timeline)
      ['generations'], // 🚀 Invalidate all generation queries (including useGenerations)
      ['tasks', 'paginated', this.projectId].filter(Boolean)
    ]);

    // Emit single consolidated event with all payloads
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('realtime:task-update-batch', {
        detail: {
          payloads,
          count: payloads.length,
          timestamp: Date.now()
        }
      }));
    }
  }

  /**
   * Dispatch batched new task events as a single consolidated event
   */
  private dispatchBatchedNewTasks(payloads: any[]) {
    // Update global snapshot with latest event time
    this.updateGlobalSnapshot('joined', Date.now());

    });

    // Report consolidated event to freshness manager
    dataFreshnessManager.onRealtimeEvent('task-new', [
      ['tasks'],
      ['task-status-counts'],
      ['unified-generations'],
      ['tasks', 'paginated', this.projectId].filter(Boolean)
    ]);

    // Emit single consolidated event with all payloads
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('realtime:task-new-batch', {
        detail: {
          payloads,
          count: payloads.length,
          timestamp: Date.now()
        }
      }));
    }
  }

  /**
   * Dispatch batched shot generation change events as a single consolidated event
   */
  private dispatchBatchedShotGenerationChanges(payloads: any[]) {
    // Update global snapshot with latest event time
    this.updateGlobalSnapshot('joined', Date.now());

    });

    // Collect unique shot IDs affected by this batch
    const affectedShotIds = new Set<string>();
    payloads.forEach((p: any) => {
      if (p.shotId) {
        affectedShotIds.add(p.shotId);
      }
    });

    .map(id => id.substring(0, 8))
    });

    // Report consolidated event to freshness manager for all affected shots
    const queryKeys = Array.from(affectedShotIds).flatMap(shotId => [
      ['unified-generations', 'shot', shotId],
      ['shot-generations', shotId],
      ['unpositioned-count', shotId]
    ]);
    
    dataFreshnessManager.onRealtimeEvent('shot-generation-positioned', queryKeys);

    // Emit single consolidated event with all payloads
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('realtime:shot-generation-change-batch', {
        detail: {
          payloads,
          count: payloads.length,
          affectedShotIds: Array.from(affectedShotIds),
          timestamp: Date.now()
        }
      }));
    }
  }

  /**
   * Dispatch batched generation update events (e.g., upscale completion)
   */
  private dispatchBatchedGenerationUpdates(payloads: any[]) {
    // Update global snapshot with latest event time
    this.updateGlobalSnapshot('joined', Date.now());

    => p.upscaleCompleted).length,
      timestamp: Date.now()
    });

    // Invalidate all generation-related queries to pick up the upscaled_url
    const queryKeys = [
      ['unified-generations'],
      ['generations'],
      ['shot-generations']
    ];
    
    dataFreshnessManager.onRealtimeEvent('generation-update', queryKeys);

    // Emit single consolidated event with all payloads
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('realtime:generation-update-batch', {
        detail: {
          payloads,
          count: payloads.length,
          timestamp: Date.now()
        }
      }));
    }
  }

  private handleTaskUpdate(payload: any) {
    // Batch this event instead of dispatching immediately
    this.batchEvent('task-update', payload);
  }

  private handleNewTask(payload: any) {
    // Batch this event instead of dispatching immediately
    this.batchEvent('task-new', payload);
  }

  private handleShotGenerationChange(payload: any, eventType: 'INSERT' | 'UPDATE') {
    const newRecord = payload?.new;
    const oldRecord = payload?.old;
    const shotId = newRecord?.shot_id;
    const timelineFrame = newRecord?.timeline_frame;
    const oldTimelineFrame = oldRecord?.timeline_frame;
    
    // Only invalidate if this involves a positioned image (timeline_frame is NOT NULL)
    const isNowPositioned = timelineFrame !== null && timelineFrame !== undefined;
    const wasPositioned = oldTimelineFrame !== null && oldTimelineFrame !== undefined;
    const positionChanged = eventType === 'UPDATE' && timelineFrame !== oldTimelineFrame;
    
    // For INSERT: only care if it's positioned
    // For UPDATE: care if position changed (added, removed, or moved)
    const shouldInvalidate = eventType === 'INSERT' ? isNowPositioned : (isNowPositioned || wasPositioned || positionChanged);
    
    ,
      timelineFrame,
      oldTimelineFrame,
      isNowPositioned,
      wasPositioned,
      positionChanged,
      shouldInvalidate
    });
    
    if (!shouldInvalidate) {
      return;
    }
    
    if (!shotId) {
      console.warn('[SimpleRealtime] ⚠️  Shot generation change missing shot_id, cannot target invalidation');
      return;
    }
    
    // Batch this event to prevent conflicts with optimistic updates during drag operations
    );
    this.batchEvent('shot-generation-change', { ...payload, eventType, shotId, isPositioned: isNowPositioned });
  }

  private handleGenerationUpdate(payload: any) {
    const newRecord = payload?.new;
    const oldRecord = payload?.old;
    const generationId = newRecord?.id;
    const upscaledUrl = newRecord?.upscaled_url;
    const oldUpscaledUrl = oldRecord?.upscaled_url;
    
    // Check if upscaled_url was added
    const upscaleCompleted = !oldUpscaledUrl && upscaledUrl;
    
    ,
      upscaleCompleted,
      upscaledUrl: upscaledUrl ? 'present' : 'none',
      oldUpscaledUrl: oldUpscaledUrl ? 'present' : 'none'
    });
    
    if (!generationId) {
      console.warn('[SimpleRealtime] ⚠️  Generation update missing id, cannot invalidate');
      return;
    }
    
    // Invalidate queries to pick up the upscaled_url
    );
    this.batchEvent('generation-update', { ...payload, generationId, upscaleCompleted });
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
    this.reconnectAttempts = 0;
    
    // Clear any pending reconnect timeout (unconditionally)
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Clear any pending batch timeout
    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
      this.batchTimeoutId = null;
    }
    
    // Clear the event queue
    this.eventBatchQueue.clear();
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
    
    // Clear any pending batch timeout
    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
      this.batchTimeoutId = null;
    }
    
    // Clear the event queue
    this.eventBatchQueue.clear();
    
    // Leave any active channel
    this.leave();
  }
}

// Singleton instance
export const simpleRealtimeManager = new SimpleRealtimeManager();
