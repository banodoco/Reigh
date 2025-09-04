import { QueryClient } from '@tanstack/react-query';
import { channel as createChannel, removeChannel } from './adapter';
import { createLogger } from './logger';
import { routeGenerationInsert, routeShotGenerationChange, routeTaskInsert, routeTaskUpdate } from './eventRouter';
import { ChannelStatus } from './types';

const log = createLogger('RealtimeRefactor:ProjectChannelManager');

export type ProjectChannel = {
  join: (projectId: string) => Promise<ChannelStatus | null>;
  leave: () => void;
  getStatus: () => ChannelStatus | null;
  getTopic: () => string | null;
  getBindingsCount: () => number;
  getEventCounter: () => number;
  testChannelHealth: () => Promise<{ sent: boolean; acked: boolean; error?: string }>;
};

export function buildTaskUpdatesTopic(projectId: string) {
  return `task-updates:${projectId}`;
}

export function createProjectChannelManager(queryClient: QueryClient, onEvent?: () => void): ProjectChannel {
  let ch: any | null = null;
  let topic: string | null = null;
  let isJoining = false;
  let eventCounter = 0; // Track actual events received

  const getStatus = (): ChannelStatus | null => {
    if (!ch) return null;
    return {
      topic: ch.topic,
      state: ch.state,
      bindingsCount: getBindingsCount(),
      joinRef: (ch as any).joinRef,
    };
  };

  const getBindingsCount = () => {
    const bindings = (ch as any)?.bindings;
    if (!bindings) return 0;
    if (Array.isArray(bindings)) return bindings.length;
    if (typeof bindings === 'object') return Object.keys(bindings).length;
    return 0;
  };

  const attachHandlers = (projectId: string, channel: any) => {
    log.debug('[RealtimeRefactor] Attaching handlers (postgres_changes only)', { topic: channel?.topic, projectId });
    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, (payload: any) => {
        try {
          eventCounter++;
          if (onEvent) onEvent();
          log.debug('[RealtimeRefactor] on postgres UPDATE', { table: 'tasks', topic: channel?.topic, eventCounter });
          routeTaskUpdate(queryClient, projectId, (payload.old as any)?.status, (payload.new as any)?.status);
        } catch (e) {
          log.warn('tasks UPDATE handler failed', e);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, (_payload: any) => {
        try {
          eventCounter++;
          if (onEvent) onEvent();
          log.debug('[RealtimeRefactor] on postgres INSERT', { table: 'tasks', topic: channel?.topic, eventCounter });
          routeTaskInsert(queryClient, projectId);
        } catch (e) {
          log.warn('tasks INSERT handler failed', e);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generations', filter: `project_id=eq.${projectId}` }, (payload: any) => {
        try {
          eventCounter++;
          if (onEvent) onEvent();
          log.debug('[RealtimeRefactor] on postgres INSERT', { table: 'generations', topic: channel?.topic, eventCounter });
          const newRecord = payload.new as any;
          const shotId = newRecord?.params?.shotId || newRecord?.params?.shot_id || newRecord?.metadata?.shotId || newRecord?.metadata?.shot_id;
          routeGenerationInsert(queryClient, projectId, shotId);
        } catch (e) {
          log.warn('generations INSERT handler failed', e);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shot_generations' }, (payload: any) => {
        try {
          eventCounter++;
          if (onEvent) onEvent();
          log.debug('[RealtimeRefactor] on postgres *', { table: 'shot_generations', topic: channel?.topic, eventCounter, event: payload?.eventType });
          const record = (payload.new || payload.old) as any;
          const shotId = record?.shot_id;
          routeShotGenerationChange(queryClient, projectId, shotId);
        } catch (e) {
          log.warn('shot_generations * handler failed', e);
        }
      });
  };

  const join = async (projectId: string): Promise<ChannelStatus | null> => {
    try {
      if (isJoining) return getStatus();
      isJoining = true;
      const newTopic = buildTaskUpdatesTopic(projectId);
      const currentStatus = getStatus();
      // If already joined on same topic, do nothing
      if (topic === newTopic && ch && currentStatus?.state === 'joined') {
        isJoining = false;
        return currentStatus;
      }
      // Clean up old channel if topic changed or not joined
      if (ch && (topic !== newTopic || currentStatus?.state !== 'joined')) {
        try { removeChannel(ch); } catch {}
        ch = null;
      }
      topic = newTopic;
      const fresh = createChannel(topic, { config: { broadcast: { self: false, ack: false } } });
      
      ch = fresh;
      log.debug('Channel created, now subscribing...');
      
      const res = await new Promise<ChannelStatus | null>((resolve) => {
        const timeout = setTimeout(() => {
          log.error('Channel subscription timeout after 10s');
          isJoining = false;
          resolve(null);
        }, 10000);
        
        fresh.subscribe((status: any) => {
          log.debug('Channel subscription status:', status);
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            
            // NOW attach handlers after successful subscription
            log.debug('Channel subscribed, now attaching handlers...');
            attachHandlers(projectId, fresh);
            
            const bindings = (fresh as any).bindings;
            const bindingsCount = !bindings ? 0 : 
              Array.isArray(bindings) ? bindings.length : 
              typeof bindings === 'object' ? Object.keys(bindings).length : 0;
              
            const finalStatus = {
              topic: fresh.topic,
              state: fresh.state,
              bindingsCount,
              joinRef: (fresh as any).joinRef,
            };
            log.debug('Handlers attached, final status:', finalStatus);
            
            // Deep debug: check what bindings actually exist
            log.debug('[RealtimeRefactor] Deep bindings check:', {
              bindings: bindings,
              bindingsType: typeof bindings,
              bindingsIsArray: Array.isArray(bindings),
              bindingsLength: bindings?.length || 0,
              bindingsKeys: bindings ? Object.keys(bindings) : null,
              bindingsDetail: Array.isArray(bindings) ? bindings.map((b: any) => ({
                type: b.type,
                filter: b.filter,
                event: b.event,
                callback: typeof b.callback
              })) : typeof bindings === 'object' ? Object.entries(bindings).map(([key, value]) => ({
                key,
                value: typeof value === 'function' ? 'function' : value
              })) : 'Neither array nor object'
            });
            
            isJoining = false;
            resolve(finalStatus);
          }
          return status;
        });
      });
      return getStatus();
    } catch (e) {
      log.error('join failed', e);
      isJoining = false;
      return null;
    }
  };

  const leave = () => {
    try {
      if (ch) removeChannel(ch);
    } catch {}
    ch = null;
    topic = null;
  };

          const getTopic = () => topic;
        const getEventCounter = () => eventCounter;
        
        // Test broadcast with ack to verify channel health
        const testChannelHealth = async (): Promise<{ sent: boolean; acked: boolean; error?: string }> => {
          if (!ch || ch.state !== 'joined') {
            return { sent: false, acked: false, error: 'Channel not joined' };
          }
          
          try {
            const testPayload = { test: true, timestamp: Date.now() };
            log.debug('[RealtimeRefactor] Sending test broadcast with ack', { topic: ch.topic });
            
            const ackPromise = new Promise<boolean>((resolve) => {
              const timeout = setTimeout(() => resolve(false), 5000);
              ch.send({
                type: 'broadcast',
                event: 'test-health',
                payload: testPayload,
                ack: true
              }, (status: any) => {
                clearTimeout(timeout);
                log.debug('[RealtimeRefactor] Test broadcast ack received', { status });
                resolve(status === 'ok');
              });
            });
            
            const acked = await ackPromise;
            return { sent: true, acked, error: acked ? undefined : 'No ack received' };
          } catch (e: any) {
            log.warn('[RealtimeRefactor] Test broadcast failed', e);
            return { sent: false, acked: false, error: e.message };
          }
        };

        return { join, leave, getStatus, getBindingsCount, getTopic, getEventCounter, testChannelHealth }; 
}


