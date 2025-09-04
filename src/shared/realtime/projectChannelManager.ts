import type { ChannelRef } from './SupabaseRealtimeAdapter';
import { SupabaseRealtimeAdapter } from './SupabaseRealtimeAdapter';
import { DiagnosticsLogger, DiagnosticsStore } from './Diagnostics';
import type { QueryClient } from '@tanstack/react-query';
import { routeEvent } from '@/shared/lib/InvalidationRouter';

export type ChannelState = 'closed' | 'joining' | 'joined' | 'leaving' | 'errored' | 'unknown';

export function buildTaskUpdatesTopic(projectId: string) {
  return `task-updates:${projectId}`;
}

export class ProjectChannelManager {
  private adapter: SupabaseRealtimeAdapter;
  private diagnostics: DiagnosticsStore;
  private logger: DiagnosticsLogger;
  private queryClient: QueryClient;
  private channel: ChannelRef | null = null;
  private projectId: string | null = null;
  private handlersAttached = false;
  private lastJoinRef: string | null = null;

  constructor(adapter: SupabaseRealtimeAdapter, diagnostics: DiagnosticsStore, logger: DiagnosticsLogger, queryClient: QueryClient) {
    this.adapter = adapter;
    this.diagnostics = diagnostics;
    this.logger = logger;
    this.queryClient = queryClient;
  }

  getChannelState(): ChannelState { return (this.channel as any)?.state || 'unknown'; }
  getBindingsCount(): number { return (this.channel as any)?.bindings?.length || 0; }

  async join(projectId: string) {
    if (!projectId) return;
    const topic = buildTaskUpdatesTopic(projectId);
    const correlationId = `join-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.logger.info('[ReconnectionIssue][Initiation] join()', { topic, correlationId });
    
    // Check if already properly joined with working handlers
    if (this.projectId === projectId && this.channel && (this.channel as any).topic === topic && (this.channel as any).state === 'joined') {
      const bindings = this.getBindingsCount();
      if (bindings > 0) {
        this.logger.debug('Channel already joined with handlers', { topic, bindings, correlationId });
        return;
      }
      this.logger.warn('Channel joined but no handlers, recreating', { topic, correlationId });
    }

    await this.leave();

    this.projectId = projectId;
    
    // CRITICAL FIX: Create channel and attach handlers in one chain
    this.handlersAttached = false;
    
    // Create channel with handlers attached via chaining
    this.channel = this.adapter.channel(topic);
    this.attachHandlersOnce();

    // Subscribe after handlers are attached
    const ref = await (this.channel as any).subscribe((status: any) => {
      this.logger.debug('[ReconnectionIssue][Initiation] Subscribe status', { status, topic });
      return status;
    });
    
    this.lastJoinRef = String(ref || '') || null;
    
    // Wait for channel to be joined before checking bindings
    let attempts = 0;
    while ((this.channel as any).state === 'joining' && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    this.diagnostics.update({ channelState: (this.channel as any).state || 'unknown', lastJoinRef: this.lastJoinRef });
    
    // Now verify handlers attached successfully
    const bindings = this.getBindingsCount();
    this.logger.info('[ReconnectionIssue][Initiation] Channel subscribed', { 
      topic, 
      state: (this.channel as any).state, 
      ref: this.lastJoinRef,
      bindings,
      handlersAttached: this.handlersAttached,
      correlationId 
    });

    if (bindings <= 0) {
      this.diagnostics.increment('noBindingIncidents');
      this.logger.warn('[ReconnectionIssue][Initiation] No bindings after subscribe, recreating channel', { topic, correlationId });
      await this.recreateChannel(correlationId);
      
      // Verify recovery succeeded
      const newBindings = this.getBindingsCount();
      if (newBindings <= 0) {
        this.logger.error('[ReconnectionIssue][Initiation] CRITICAL: Channel recreation failed to attach handlers', { 
          topic, 
          bindings: newBindings,
          correlationId 
        });
        this.diagnostics.update({ lastError: 'Failed to attach handlers after recreation' });
      } else {
        this.logger.info('[ReconnectionIssue][Initiation] Recovery successful', { 
          topic, 
          bindings: newBindings,
          correlationId 
        });
      }
    }
  }

  async leave() {
    if (this.channel) {
      const correlationId = `leave-${Date.now()}`;
      try {
        this.logger.debug('[ReconnectionIssue][AppInteraction] Leaving channel', { 
          topic: (this.channel as any).topic, 
          state: (this.channel as any).state,
          correlationId 
        });
        (this.channel as any).unsubscribe?.();
      } catch {}
      try { this.adapter.removeChannel(this.channel); } catch {}
      this.channel = null;
      // CRITICAL: Reset handler flag when leaving
      this.handlersAttached = false;
      this.diagnostics.update({ channelState: 'closed' });
    }
    this.projectId = null;
    this.lastJoinRef = null;
  }

  private attachHandlersOnce() {
    if (!this.channel) {
      this.logger.warn('[ReconnectionIssue][Initiation] Cannot attach handlers - no channel');
      return;
    }
    
    // Don't re-attach if already attached
    if (this.handlersAttached) {
      this.logger.debug('[ReconnectionIssue][Initiation] Handlers already marked as attached');
      return;
    }
    
    const projectId = this.projectId;
    if (!projectId) {
      this.logger.warn('[ReconnectionIssue][Initiation] Cannot attach handlers - no projectId');
      return;
    }
    
    this.logger.info('[ReconnectionIssue][Initiation] Attaching handlers', { 
      topic: (this.channel as any).topic,
      projectId,
      existingBindings: (this.channel as any).bindings?.length || 0
    });

    // Use the Supabase chaining pattern
    this.channel = (this.channel as any)
      .on('broadcast', { event: 'task-update' }, (payload: any) => {
        try {
          this.diagnostics.update({ lastEventAt: Date.now() });
          const message = payload?.payload || {};
          this.diagnostics.bumpEvent(String(message?.type || 'broadcast'));
          this.logger.debug('[ReconnectionIssue][AppInteraction] Broadcast received', { type: message?.type });
          if (message?.type === 'TASK_CREATED' || message?.type === 'TASKS_STATUS_UPDATE' || message?.type === 'TASK_COMPLETED') {
            routeEvent(this.queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId } });
            if (message?.type === 'TASK_COMPLETED') {
              routeEvent(this.queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId } });
            }
          } else if (message?.type === 'GENERATIONS_UPDATED') {
            const { shotId } = message.payload || {};
            routeEvent(this.queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId, shotId } });
          }
        } catch (e) {
          this.logger.warn('Broadcast handler error', { error: (e as any)?.message });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, (payload: any) => {
        try {
          this.diagnostics.update({ lastEventAt: Date.now() });
          this.logger.debug('[ReconnectionIssue][AppInteraction] Tasks UPDATE received');
          const oldStatus = payload?.old?.status;
          const newStatus = payload?.new?.status;
          if (oldStatus !== newStatus) {
            routeEvent(this.queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId } });
            if (newStatus === 'Complete') routeEvent(this.queryClient, { type: 'GENERATIONS_UPDATED', payload: { projectId } });
          }
        } catch (e) { this.logger.warn('Tasks update handler error', { error: (e as any)?.message }); }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, () => {
        this.diagnostics.update({ lastEventAt: Date.now() });
        this.logger.debug('[ReconnectionIssue][AppInteraction] Tasks INSERT received');
        routeEvent(this.queryClient, { type: 'TASK_STATUS_CHANGE', payload: { projectId } });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generations', filter: `project_id=eq.${projectId}` }, (payload: any) => {
        this.diagnostics.update({ lastEventAt: Date.now() });
        this.logger.debug('[ReconnectionIssue][AppInteraction] Generations INSERT received');
        const newRecord = payload?.new || {};
        const shotId = newRecord?.params?.shotId || newRecord?.params?.shot_id || newRecord?.metadata?.shotId || newRecord?.metadata?.shot_id;
        routeEvent(this.queryClient, { type: 'GENERATION_INSERT', payload: { projectId, shotId } });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shot_generations' }, (payload: any) => {
        this.diagnostics.update({ lastEventAt: Date.now() });
        this.logger.debug('[ReconnectionIssue][AppInteraction] Shot generations change received');
        const record = payload?.new || payload?.old || {};
        const shotId = record?.shot_id;
        routeEvent(this.queryClient, { type: 'SHOT_GENERATION_CHANGE', payload: { projectId, shotId } });
      });

    this.handlersAttached = true;
    
    const attachedBindings = (this.channel as any).bindings?.length || 0;
    this.logger.info('[ReconnectionIssue][Initiation] Handlers attached to channel', { 
      topic: (this.channel as any)?.topic,
      projectId,
      bindingsAfterAttach: attachedBindings
    });
    
    if (attachedBindings === 0) {
      this.logger.error('[ReconnectionIssue][Initiation] WARNING: No bindings after handler attachment!');
    }
  }

  private async recreateChannel(parentCorrelationId?: string) {
    if (!this.projectId) return;
    const topic = buildTaskUpdatesTopic(this.projectId);
    const correlationId = `recreate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.info('[ReconnectionIssue][Initiation] Recreating channel', { topic, correlationId, parentCorrelationId });
    
    // Clean up old channel completely
    try { 
      if (this.channel) {
        (this.channel as any).unsubscribe?.();
        this.adapter.removeChannel(this.channel);
        this.channel = null;
      }
    } catch (e) {
      this.logger.warn('[ReconnectionIssue][Initiation] Error cleaning up old channel', { error: (e as any)?.message });
    }
    
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create fresh channel
    this.channel = this.adapter.channel(topic);
    
    // Reset and reattach handlers
    this.handlersAttached = false;
    this.attachHandlersOnce();
    
    this.diagnostics.increment('channelRecreatedCount');
    
    // Subscribe after handlers are attached
    const ref = await (this.channel as any).subscribe((status: any) => {
      this.logger.debug('[ReconnectionIssue][Initiation] Recreation subscribe status', { status, topic });
      return status;
    });
    
    // Wait for channel to be joined
    let attempts = 0;
    while ((this.channel as any).state === 'joining' && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    this.diagnostics.update({ 
      channelState: (this.channel as any).state || 'unknown',
      lastJoinRef: String(ref || '') || null 
    });
    
    // Verify success
    const bindings = this.getBindingsCount();
    this.logger.info('[ReconnectionIssue][Initiation] Channel recreated', { 
      topic,
      state: (this.channel as any).state,
      bindings,
      handlersAttached: this.handlersAttached,
      correlationId,
      parentCorrelationId 
    });
    
    if (bindings <= 0) {
      this.logger.error('[ReconnectionIssue][Initiation] CRITICAL: Recreation failed - no handlers attached', { 
        topic,
        correlationId 
      });
    }
  }
}

 