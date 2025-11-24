import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/shared/contexts/ProjectContext';
import { simpleRealtimeManager } from '@/shared/realtime/SimpleRealtimeManager';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

interface SimpleRealtimeContextType {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

const SimpleRealtimeContext = createContext<SimpleRealtimeContextType>({
  isConnected: false,
  isConnecting: false,
  error: null
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
    error: null
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
    // NEW: Handle batched task updates more efficiently
    const handleTaskUpdateBatch = (event: CustomEvent) => {
      const { payloads, count } = event.detail;

      // Analyze batch to determine what needs invalidation
      const hasCompleteTask = payloads.some((p: any) => p?.new?.status === 'Complete');
      const completedShotIds = new Set(
        payloads
          .filter((p: any) => p?.new?.status === 'Complete')
          .map((p: any) => {
            const newItem = p?.new;
            return newItem?.metadata?.shot_id || 
                   newItem?.metadata?.shotId || 
                   newItem?.params?.shot_id || 
                   newItem?.params?.orchestrator_details?.shot_id;
          })
          .filter(Boolean)
      );

      // ALWAYS invalidate list queries
      queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });

      // 🎯 TARGETED INVALIDATION: Invalidate only specific tasks that changed
      payloads.forEach((p: any) => {
        const taskId = p.new?.id || p.old?.id;
        if (taskId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'single', taskId] });
        }
      });

      // ONLY invalidate generation data if tasks completed
      if (hasCompleteTask) {
        // Invalidate project-level generation queries (e.g., for upscale in main gallery)
        queryClient.invalidateQueries({ queryKey: ['generations'] });
        
        // Invalidate derived generations (edits based on source images)
        queryClient.invalidateQueries({ queryKey: ['derived-generations'] });
        
        // Invalidate only the specific shots that completed
        if (completedShotIds.size > 0) {
          completedShotIds.forEach((shotId) => {
            queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
            queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] }); // 🚀 For useEnhancedShotPositions (Timeline)
          });
        } else {
          // Only if we have completed tasks but no shot IDs, invalidate project-level
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'unified-generations' && query.queryKey[1] === 'project'
          });
          // Also invalidate all shot-generations (e.g., for upscale tasks that don't have shotId in metadata)
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'shot-generations'
          });
        }
      }
    };

    // OLD: Handle individual task updates (legacy, will be replaced by batching)
    const handleTaskUpdate = (event: CustomEvent) => {
      console.log('[SimpleRealtimeProvider] 📨 Task update received (legacy - should be batched):', event.detail);
      
      const payload = event.detail;
      const isComplete = payload?.new?.status === 'Complete';
      const shotId = payload?.new?.metadata?.shot_id || payload?.new?.metadata?.shotId;
      
      // Removed state update for lastTaskUpdate
      
      // Reduced invalidation scope
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });
      
      if (isComplete && shotId) {
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
      }
    };

    // NEW: Handle batched new tasks more efficiently
    const handleNewTaskBatch = (event: CustomEvent) => {
      const { payloads, count } = event.detail;
      console.log('[SimpleRealtimeProvider:Batching] 📦 Batched new tasks received:', {
        count,
        timestamp: Date.now()
      });
      
      // Removed state update for lastNewTask
      
      const activeQueries = queryClient.getQueryCache().getAll().length;
      
      console.log('[TasksPaneRealtimeDebug:Batching] 🔄 Targeted invalidation for batched new tasks', {
        context: 'realtime-invalidation-new-task-batch',
        batchSize: count,
        activeQueriesBeforeInvalidation: activeQueries,
        keysToInvalidate: 2, // Reduced from 6+
        timestamp: Date.now()
      });
      
      // ONLY invalidate task queries (most new tasks are just queued, not complete)
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });
      
      // Note: We don't invalidate generation queries here because new tasks
      // haven't completed yet. They'll be invalidated when tasks complete.
      
      console.log('[TasksPaneRealtimeDebug:Batching] ✅ Batched invalidation complete:', {
        duration: '<5ms',
        batchSize: count,
        activeQueriesAfterInvalidation: queryClient.getQueryCache().getAll().length,
        timestamp: Date.now()
      });
    };

    // OLD: Handle individual new tasks (legacy - should not be called with batching)
    const handleNewTask = (event: CustomEvent) => {
      console.log('[SimpleRealtimeProvider] 📨 New task received (legacy - should be batched):', event.detail);
      
      // Removed state update for lastNewTask
      
      // Simplified invalidation - just tasks
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });
    };

    // NEW: Handle batched shot generation changes more efficiently
    const handleShotGenerationChangeBatch = (event: CustomEvent) => {
      const { payloads, count, affectedShotIds } = event.detail;
      
      console.log('[SimpleRealtimeProvider:Batching] 📦 Batched shot generation changes received:', {
        count,
        affectedShots: affectedShotIds?.length || 0,
        timestamp: Date.now()
      });

      // Invalidate queries for all affected shots in batch
      // This prevents multiple invalidations during rapid timeline drag operations
      if (affectedShotIds && affectedShotIds.length > 0) {
        console.log('[SimpleRealtimeProvider:Batching] 🎯 Batch invalidating', affectedShotIds.length, 'shots:', 
          affectedShotIds.map((id: string) => id.substring(0, 8)).join(', '));
        
        affectedShotIds.forEach((shotId: string) => {
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
          queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
          queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] });
        });
      }
    };

    // OLD: Handle individual shot generation changes (legacy - should be batched)
    const handleShotGenerationChange = (event: CustomEvent) => {
      const { shotId, isPositioned, eventType } = event.detail;
      
      console.log('[SimpleRealtimeProvider] 🎯 Shot generation change received (legacy - should be batched):', {
        shotId: shotId?.substring(0, 8),
        isPositioned,
        eventType,
        timestamp: Date.now()
      });
      
      // Simplified invalidation for legacy events
      if (shotId) {
        console.log('[SimpleRealtimeProvider] 🎯 Targeted shot invalidation for positioned image:', { shotId: shotId.substring(0, 8) });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
        queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] });
      }
    };

    // NEW: Handle batched generation updates (upscale, location changes, etc.)
    const handleGenerationUpdateBatch = (event: CustomEvent) => {
      const { count } = event.detail;
      console.log('[SimpleRealtimeProvider:Batching] 📦 Batched generation updates received:', {
        count,
        timestamp: Date.now()
      });

      // Invalidate generation queries to show new URLs/locations
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation'] }); // For single generation queries (e.g. parent generation in ChildGenerationsView)
      // Also invalidate shot-generations as they contain generation data
      queryClient.invalidateQueries({ queryKey: ['shot-generations'] });
      // Invalidate shots as they might contain generation data (thumbnails etc)
      queryClient.invalidateQueries({ queryKey: ['shots'] });
    };

    // Listen for BATCHED events (new, efficient)
    window.addEventListener('realtime:task-update-batch', handleTaskUpdateBatch as EventListener);
    window.addEventListener('realtime:task-new-batch', handleNewTaskBatch as EventListener);
    window.addEventListener('realtime:shot-generation-change-batch', handleShotGenerationChangeBatch as EventListener);
    window.addEventListener('realtime:generation-update-batch', handleGenerationUpdateBatch as EventListener);
    
    // Keep legacy event listeners for backward compatibility
    window.addEventListener('realtime:task-update', handleTaskUpdate as EventListener);
    window.addEventListener('realtime:task-new', handleNewTask as EventListener);
    window.addEventListener('realtime:shot-generation-change', handleShotGenerationChange as EventListener);

    return () => {
      // Remove batched event listeners
      window.removeEventListener('realtime:task-update-batch', handleTaskUpdateBatch as EventListener);
      window.removeEventListener('realtime:task-new-batch', handleNewTaskBatch as EventListener);
      window.removeEventListener('realtime:shot-generation-change-batch', handleShotGenerationChangeBatch as EventListener);
      window.removeEventListener('realtime:generation-update-batch', handleGenerationUpdateBatch as EventListener);
      
      // Remove legacy event listeners
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
