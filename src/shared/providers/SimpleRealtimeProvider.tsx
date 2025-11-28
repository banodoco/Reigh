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
            // 🎯 Check all possible shot_id locations (matches complete_task extraction logic)
            return newItem?.metadata?.shot_id || 
                   newItem?.metadata?.shotId || 
                   newItem?.params?.shot_id || 
                   newItem?.params?.orchestrator_details?.shot_id ||
                   // Additional paths for travel-between-images tasks
                   newItem?.params?.originalParams?.orchestrator_details?.shot_id ||
                   newItem?.params?.full_orchestrator_payload?.shot_id;
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
        // Invalidate derived generations (edits based on source images)
        queryClient.invalidateQueries({ queryKey: ['derived-generations'] });
        
        // 🎯 ALWAYS invalidate project-level unified-generations queries
        // This ensures ChildGenerationsView and other project-wide queries update immediately
        // Child generations may have shotId but still need project-level invalidation
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'unified-generations' && query.queryKey[1] === 'project'
        });
        
        // Invalidate shot-specific queries for completed shots
        if (completedShotIds.size > 0) {
          completedShotIds.forEach((shotId) => {
            queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
            queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] }); // 🚀 For useEnhancedShotPositions (Timeline)
            queryClient.invalidateQueries({ queryKey: ['all-shot-generations', shotId] }); // 🚀 For useAllShotGenerations (single query)
          });
        } else {
          // No shot IDs found - invalidate all shot-related queries as fallback
          // 🔧 FIX: Also invalidate unified-generations shot queries so VideoGallery updates
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'unified-generations' && query.queryKey[1] === 'shot'
          });
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'shot-generations'
          });
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'all-shot-generations'
          });
        }
      }
    };

    // OLD: Handle individual task updates (legacy, will be replaced by batching)
    const handleTaskUpdate = (event: CustomEvent) => {
      console.log('[SimpleRealtimeProvider] 📨 Task update received (legacy - should be batched):', event.detail);
      
      const payload = event.detail;
      const isComplete = payload?.new?.status === 'Complete';
      const newItem = payload?.new;
      // 🎯 Check all possible shot_id locations (matches complete_task extraction logic)
      const shotId = newItem?.metadata?.shot_id || 
                     newItem?.metadata?.shotId ||
                     newItem?.params?.shot_id ||
                     newItem?.params?.orchestrator_details?.shot_id ||
                     newItem?.params?.originalParams?.orchestrator_details?.shot_id ||
                     newItem?.params?.full_orchestrator_payload?.shot_id;
      
      // Reduced invalidation scope
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });
      
      if (isComplete) {
          // Always invalidate project-level queries for ChildGenerationsView
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'unified-generations' && query.queryKey[1] === 'project'
          });
          
          if (shotId) {
            queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
          }
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

      // Check if any payloads are INSERT events (which are handled by optimistic updates)
      // We skip all-shot-generations invalidation for pure INSERT batches to prevent flicker
      // Also checking for 'insert' just in case case-sensitivity varies
      const eventTypes = payloads?.map((p: any) => p.eventType) || [];
      const hasOnlyInserts = payloads?.length > 0 && payloads?.every((p: any) => p.eventType === 'INSERT' || p.eventType === 'insert');
      
      console.log('[AddFlicker] 4️⃣ REALTIME shot-generation-change-batch received:', {
        payloadCount: payloads?.length,
        eventTypes,
        hasOnlyInserts,
        affectedShotIds: affectedShotIds?.map((id: string) => id.substring(0, 8)),
        timestamp: Date.now()
      });
      
      // Invalidate queries for all affected shots in batch
      // This prevents multiple invalidations during rapid timeline drag operations
      if (affectedShotIds && affectedShotIds.length > 0) {
        affectedShotIds.forEach((shotId: string) => {
          console.log('[AddFlicker] 4️⃣ Invalidating for shot:', shotId.substring(0, 8), {
            willInvalidateAllShotGens: !hasOnlyInserts,
            reason: hasOnlyInserts ? 'SKIPPED - INSERT handled by optimistic' : 'INVALIDATING'
          });
          
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
          queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
          // Skip all-shot-generations for INSERT-only batches - optimistic updates handle these
          // This prevents the flicker when adding images via GenerationsPane
          if (!hasOnlyInserts) {
            console.log('[AddFlicker] 4️⃣ ❌ INVALIDATING all-shot-generations!', shotId.substring(0, 8));
            queryClient.invalidateQueries({ queryKey: ['all-shot-generations', shotId] });
          }
          queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] });
        });
      }
    };

    // OLD: Handle individual shot generation changes (legacy - should be batched)
    const handleShotGenerationChange = (event: CustomEvent) => {
      const { shotId, isPositioned, eventType } = event.detail;
      
      console.log('[AddFlicker] ⚠️ LEGACY shot-generation-change received (should be batched):', {
        shotId: shotId?.substring(0, 8),
        isPositioned,
        eventType,
        timestamp: Date.now()
      });
      
      // Simplified invalidation for legacy events
      if (shotId) {
        console.log('[AddFlicker] ⚠️ LEGACY ❌ INVALIDATING all-shot-generations!', shotId.substring(0, 8));
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
        queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
        queryClient.invalidateQueries({ queryKey: ['all-shot-generations', shotId] });
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] });
      }
    };

    // NEW: Handle batched generation updates (upscale, location changes, etc.)
    const handleGenerationUpdateBatch = (event: CustomEvent) => {
      const { count, payloads } = event.detail;
      console.log('[AddFlicker] 5️⃣ REALTIME generation-update-batch received:', {
        count,
        payloads: payloads?.map((p: any) => ({
          generationId: p.generationId?.substring(0, 8),
          upscaleCompleted: p.upscaleCompleted,
          locationChanged: p.locationChanged,
          thumbnailChanged: p.thumbnailChanged
        })),
        timestamp: Date.now()
      });

      console.log('[AddFlicker] 5️⃣ ❌ INVALIDATING all-shot-generations (broad)!');
      
      // Invalidate generation queries to show new URLs/locations
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation'] }); // For single generation queries (e.g. parent generation in ChildGenerationsView)
      // Also invalidate shot-generations as they contain generation data
      queryClient.invalidateQueries({ queryKey: ['shot-generations'] });
      queryClient.invalidateQueries({ queryKey: ['all-shot-generations'] });
      // Invalidate shots as they might contain generation data (thumbnails etc)
      queryClient.invalidateQueries({ queryKey: ['shots'] });
    };

    // NEW: Handle batched generation inserts (new child generations/segments)
    const handleGenerationInsertBatch = (event: CustomEvent) => {
      const { count, payloads, childGenerations, parentGenerations } = event.detail;
      console.log('[SimpleRealtime] 🆕 REALTIME generation-insert-batch received:', {
        count,
        childGenerations,
        parentGenerations,
        payloads: payloads?.slice(0, 3).map((p: any) => ({
          generationId: p.generationId?.substring(0, 8),
          isChild: p.isChild,
          parentGenerationId: p.parentGenerationId?.substring(0, 8),
          hasLocation: p.hasLocation
        })),
        timestamp: Date.now()
      });

      // Invalidate generation queries to show new generations
      // This is especially important for ChildGenerationsView which queries by parentGenerationId
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation'] }); // For single generation queries
      // Also invalidate shot-generations as they may contain generation data
      queryClient.invalidateQueries({ queryKey: ['shot-generations'] });
      queryClient.invalidateQueries({ queryKey: ['all-shot-generations'] });
    };

    // Listen for BATCHED events (new, efficient)
    window.addEventListener('realtime:task-update-batch', handleTaskUpdateBatch as EventListener);
    window.addEventListener('realtime:task-new-batch', handleNewTaskBatch as EventListener);
    window.addEventListener('realtime:shot-generation-change-batch', handleShotGenerationChangeBatch as EventListener);
    window.addEventListener('realtime:generation-update-batch', handleGenerationUpdateBatch as EventListener);
    window.addEventListener('realtime:generation-insert-batch', handleGenerationInsertBatch as EventListener);
    
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
      window.removeEventListener('realtime:generation-insert-batch', handleGenerationInsertBatch as EventListener);
      
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
