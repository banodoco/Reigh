import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/shared/contexts/ProjectContext';
import { simpleRealtimeManager } from '@/shared/realtime/SimpleRealtimeManager';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

interface SimpleRealtimeContextType {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastTaskUpdate: any;
  lastNewTask: any;
}

const SimpleRealtimeContext = createContext<SimpleRealtimeContextType>({
  isConnected: false,
  isConnecting: false,
  error: null,
  lastTaskUpdate: null,
  lastNewTask: null
});

export const useSimpleRealtime = () => useContext(SimpleRealtimeContext);

interface SimpleRealtimeProviderProps {
  children: React.ReactNode;
}

export function SimpleRealtimeProvider({ children }: SimpleRealtimeProviderProps) {
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();
  
  // Debounce invalidations to prevent query cancellation storms
  const invalidationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingEventsRef = useRef<number>(0);
  
  const [state, setState] = useState<SimpleRealtimeContextType>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastTaskUpdate: null,
    lastNewTask: null
  });

  // Connect to realtime when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setState(prev => ({ 
        ...prev, 
        isConnected: false, 
        isConnecting: false, 
        error: null 
      }));
      
      // Reset freshness manager when no project selected
      dataFreshnessManager.reset();
      return;
    }

    let mounted = true;

    const connect = async () => {
      if (!mounted) return;
      
      setState(prev => ({ ...prev, isConnecting: true, error: null }));
      
      try {
        const success = await simpleRealtimeManager.joinProject(selectedProjectId);
        
        if (!mounted) return;
        
        if (success) {
          setState(prev => ({ 
            ...prev, 
            isConnected: true, 
            isConnecting: false, 
            error: null 
          }));
          console.log('[SimpleRealtimeProvider] ✅ Connected to project:', selectedProjectId);
        } else {
          setState(prev => ({ 
            ...prev, 
            isConnected: false, 
            isConnecting: false, 
            error: 'Failed to connect to realtime' 
          }));
          console.error('[SimpleRealtimeProvider] ❌ Failed to connect to project:', selectedProjectId);
        }
      } catch (error) {
        if (!mounted) return;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState(prev => ({ 
          ...prev, 
          isConnected: false, 
          isConnecting: false, 
          error: errorMessage 
        }));
        console.error('[SimpleRealtimeProvider] ❌ Connection error:', error);
      }
    };

    connect();

    return () => {
      mounted = false;
      simpleRealtimeManager.leave();
    };
  }, [selectedProjectId]);

  // No more complex invalidation logic needed!
  // The DataFreshnessManager + useSmartPolling handles all polling decisions.
  // React Query will automatically refetch based on the smart polling intervals.

  // Listen to realtime events and invalidate React Query cache
  useEffect(() => {
    const handleTaskUpdate = (event: CustomEvent) => {
      console.log('[SimpleRealtimeProvider] 📨 Task update received:', event.detail);
      
      const payload = event.detail;
      const isComplete = payload?.new?.status === 'Complete';
      const shotId = payload?.new?.metadata?.shot_id || payload?.new?.metadata?.shotId;
      
      setState(prev => ({
        ...prev,
        lastTaskUpdate: { payload: event.detail, timestamp: Date.now() }
      }));
      
      // Invalidate React Query caches as documented in realtime_system.md
      console.log('[TasksPaneRealtimeDebug] 🔄 Invalidating React Query caches for task update', {
        context: 'realtime-invalidation-task-update',
        eventDetail: event.detail,
        isComplete,
        shotId: shotId ? shotId.substring(0, 8) : null,
        queryKeysInvalidated: isComplete 
          ? ['tasks', 'task-status-counts', 'unified-generations (selective)', 'shots', 'unpositioned-count', 'project-video-counts']
          : ['tasks', 'task-status-counts'],
        timestamp: Date.now()
      });
      
      // Always invalidate task-related queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });
      
      // Only invalidate generation data when task actually completes (creates new generations)
      if (isComplete) {
        // Invalidate project-level generation queries (for galleries, unpositioned pane)
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0] === 'unified-generations' && query.queryKey[1] === 'project'
        });
        
        // Only invalidate shot-specific query if we know which shot it's for
        if (shotId) {
          console.log('[TasksPaneRealtimeDebug] 🎯 Targeted shot invalidation:', { shotId: shotId.substring(0, 8) });
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
          queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] });
        } else {
          // Fallback: invalidate all shot queries if we don't know the specific shot
          // This is less ideal but ensures data consistency
          console.log('[TasksPaneRealtimeDebug] ⚠️ Fallback: invalidating all shot queries (no shotId in metadata)');
          queryClient.invalidateQueries({ 
            predicate: (query) => query.queryKey[0] === 'unified-generations' && query.queryKey[1] === 'shot'
          });
          queryClient.invalidateQueries({ queryKey: ['unpositioned-count'] });
        }
        
        queryClient.invalidateQueries({ queryKey: ['shots'] });
        queryClient.invalidateQueries({ queryKey: ['project-video-counts'] });
      }
    };

    const handleNewTask = (event: CustomEvent) => {
      console.log('[SimpleRealtimeProvider] 📨 New task received:', event.detail);
      
      setState(prev => ({
        ...prev,
        lastNewTask: { payload: event.detail, timestamp: Date.now() }
      }));
      
      // Invalidate React Query caches for new tasks
      console.log('[TasksPaneRealtimeDebug] 🔄 Invalidating React Query caches for new task', {
        context: 'realtime-invalidation-new-task',
        eventDetail: event.detail,
        queryKeysInvalidated: ['tasks', 'task-status-counts', 'unified-generations (all variants)', 'shots', 'unpositioned-count', 'project-video-counts'],
        timestamp: Date.now()
      });
      
      // [InvalidationDiag] Count events and use shorter timeout with forced execution
      pendingEventsRef.current += 1;
      const eventCount = pendingEventsRef.current;
      
      console.log('[InvalidationDiag] 📨 NEW TASK EVENT:', {
        eventCount,
        eventDetail: event.detail,
        timestamp: Date.now()
      });

      // Clear any existing timeout
      if (invalidationTimeoutRef.current) {
        clearTimeout(invalidationTimeoutRef.current);
      }

      // Use shorter timeout and force execution after 16 events (matching task count)
      const shouldForceExecute = eventCount >= 16;
      const timeoutMs = shouldForceExecute ? 50 : 200; // Very short timeout if we hit expected count
      
      if (shouldForceExecute) {
        console.log('[InvalidationDiag] 🚀 FORCING IMMEDIATE EXECUTION - received expected number of events');
      }

      invalidationTimeoutRef.current = setTimeout(() => {
        try {
          const invalidationStart = Date.now();
          const activeQueries = queryClient.getQueryCache().getAll().length;
          
          console.log('[InvalidationDiag] 🔄 EXECUTING DEBOUNCED INVALIDATIONS:', {
            trigger: shouldForceExecute ? 'forced-after-16-events' : 'debounced',
            eventsProcessed: pendingEventsRef.current,
            activeQueriesBeforeInvalidation: activeQueries,
            timestamp: invalidationStart
          });

          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });
          // Use predicate to invalidate all unified-generations queries (including shot-specific ones)
          queryClient.invalidateQueries({ 
            predicate: (query) => query.queryKey[0] === 'unified-generations'
          });
          queryClient.invalidateQueries({ queryKey: ['shots'] });
          queryClient.invalidateQueries({ queryKey: ['unpositioned-count'] });
          queryClient.invalidateQueries({ queryKey: ['project-video-counts'] });
          
          const invalidationEnd = Date.now();
          console.log('[InvalidationDiag] ✅ DEBOUNCED INVALIDATIONS COMPLETE:', {
            duration: `${invalidationEnd - invalidationStart}ms`,
            eventsProcessed: pendingEventsRef.current,
            activeQueriesAfterInvalidation: queryClient.getQueryCache().getAll().length,
            timestamp: invalidationEnd
          });
          
          // Reset counter
          pendingEventsRef.current = 0;
        } catch (error) {
          console.error('[InvalidationDiag] ❌ DEBOUNCED INVALIDATION ERROR:', error);
          pendingEventsRef.current = 0;
        } finally {
          invalidationTimeoutRef.current = null;
        }
      }, timeoutMs);
    };

    const handleShotGenerationChange = (event: CustomEvent) => {
      const { shotId, isPositioned, eventType } = event.detail;
      
      console.log('[SimpleRealtimeProvider] 🎯 Shot generation change received:', {
        shotId: shotId?.substring(0, 8),
        isPositioned,
        eventType,
        timestamp: Date.now()
      });
      
      // Only invalidate the specific shot's queries - timeline will reload efficiently
      // This is NOT debounced because positioned image changes are rare and precise
      if (shotId) {
        console.log('[SimpleRealtimeProvider] 🎯 Targeted shot invalidation for positioned image:', { shotId: shotId.substring(0, 8) });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
        queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] });
      }
    };

    window.addEventListener('realtime:task-update', handleTaskUpdate as EventListener);
    window.addEventListener('realtime:task-new', handleNewTask as EventListener);
    window.addEventListener('realtime:shot-generation-change', handleShotGenerationChange as EventListener);

    return () => {
      window.removeEventListener('realtime:task-update', handleTaskUpdate as EventListener);
      window.removeEventListener('realtime:task-new', handleNewTask as EventListener);
      window.removeEventListener('realtime:shot-generation-change', handleShotGenerationChange as EventListener);
      
      // Clean up any pending invalidation timeout
      if (invalidationTimeoutRef.current) {
        clearTimeout(invalidationTimeoutRef.current);
        invalidationTimeoutRef.current = null;
      }
    };
  }, [queryClient]);

  return (
    <SimpleRealtimeContext.Provider value={state}>
      {children}
    </SimpleRealtimeContext.Provider>
  );
}
