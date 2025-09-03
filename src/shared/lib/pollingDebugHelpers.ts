// ================================================================
// POLLING DEBUG HELPERS
// ================================================================
// This file provides debug utilities that can be called from the browser
// console to inspect the state of task and generation polling systems.

import { QueryClient } from '@tanstack/react-query';

// Expose global debug helpers
declare global {
  interface Window {
    debugPolling: {
      inspectTaskCache: (projectId: string) => void;
      inspectGenerationsCache: (projectId: string, shotId?: string) => void;
      inspectAllCaches: (projectId: string) => void;
      clearTaskCache: (projectId: string) => void;
      clearGenerationsCache: (projectId: string) => void;
      forceRefetchTasks: (projectId: string) => void;
      forceRefetchGenerations: (projectId: string, shotId?: string) => void;
      enableDebugLogs: () => void;
      disableDebugLogs: () => void;
      getQueryClientState: () => any;
      simulateTaskUpdate: (projectId: string, taskId: string, status: string) => void;
      simulateGenerationCreated: (projectId: string, generationId: string) => void;
    };
  }
}

let queryClientInstance: QueryClient | null = null;
let debugLogsEnabled = true; // Start with logs enabled

export function initPollingDebugHelpers(queryClient: QueryClient) {
  queryClientInstance = queryClient;
  
  // Only expose helpers in development or when explicitly enabled
  if (typeof window !== 'undefined') {
    window.debugPolling = {
      inspectTaskCache: (projectId: string) => {
        if (!queryClientInstance) {
          console.error('[PollingDebug] QueryClient not initialized');
          return;
        }
        
        console.group('[PollingDebug] Task Cache Inspection');
        
        // Get all task-related queries
        const allTaskQueries = queryClientInstance.getQueriesData({
          queryKey: ['tasks']
        });
        
        const paginatedQueries = allTaskQueries.filter(([key]) => 
          Array.isArray(key) && key[1] === 'paginated' && key[2] === projectId
        );
        
        const statusQueries = queryClientInstance.getQueriesData({
          queryKey: ['task-status-counts', projectId]
        });
        
        console.log('📊 Task Status Counts:', statusQueries);
        console.log('📄 Paginated Task Queries:', paginatedQueries.length);
        
        paginatedQueries.forEach(([key, data], index) => {
          console.log(`  Page ${index + 1}:`, {
            cacheKey: key,
            dataAge: Date.now() - (queryClientInstance!.getQueryState(key)?.dataUpdatedAt || 0),
            isStale: queryClientInstance!.getQueryState(key)?.isStale,
            taskCount: (data as any)?.tasks?.length || 0,
            activeTasks: (data as any)?.tasks?.filter((t: any) => t.status === 'Queued' || t.status === 'In Progress').length || 0
          });
        });
        
        // Check query states
        const queryStates = paginatedQueries.map(([key]) => ({
          key,
          state: queryClientInstance!.getQueryState(key)
        }));
        
        console.log('🔍 Query States:', queryStates);
        console.groupEnd();
      },
      
      inspectGenerationsCache: (projectId: string, shotId?: string) => {
        if (!queryClientInstance) {
          console.error('[PollingDebug] QueryClient not initialized');
          return;
        }
        
        console.group('[PollingDebug] Generations Cache Inspection');
        
        // Get project-wide generations
        const projectGenerations = queryClientInstance.getQueriesData({
          queryKey: ['unified-generations', 'project', projectId]
        });
        
        // Get unified project generations
        const unifiedProjectGenerations = queryClientInstance.getQueriesData({
          queryKey: ['unified-generations', 'project', projectId]
        });
        
        // Get shot-specific generations if shotId provided
        const shotGenerations = shotId ? queryClientInstance.getQueriesData({
          queryKey: ['unified-generations', 'shot', shotId]
        }) : [];
        
        const allShotGenerations = shotId ? queryClientInstance.getQueriesData({
          queryKey: ['unified-generations', 'shot', shotId]
        }) : [];
        
        console.log('🔄 Unified Project Generations:', unifiedProjectGenerations);
        
        if (shotId) {
          console.log('🎯 Shot-Specific Generations:', shotGenerations);
          console.log('📋 All Shot Generations:', allShotGenerations);
        }
        
        // Analyze data freshness
        const allQueries = [...projectGenerations, ...unifiedProjectGenerations, ...shotGenerations, ...allShotGenerations];
        allQueries.forEach(([key, data]) => {
          const state = queryClientInstance!.getQueryState(key);
          console.log(`⏰ Cache Status for ${key}:`, {
            cacheKey: key,
            dataAge: Date.now() - (state?.dataUpdatedAt || 0),
            isStale: state?.isStale,
            itemCount: Array.isArray(data) ? data.length : (data as any)?.items?.length || 0,
            isLoading: state?.isFetching
          });
        });
        
        console.groupEnd();
      },
      
      inspectAllCaches: (projectId: string) => {
        window.debugPolling.inspectTaskCache(projectId);
        window.debugPolling.inspectGenerationsCache(projectId);
      },
      
      clearTaskCache: (projectId: string) => {
        if (!queryClientInstance) return;
        
        console.log('[PollingDebug] Clearing task cache for project:', projectId);
        queryClientInstance.removeQueries({
          queryKey: ['tasks']
        });
        queryClientInstance.removeQueries({
          queryKey: ['task-status-counts', projectId]
        });
        console.log('✅ Task cache cleared');
      },
      
      clearGenerationsCache: (projectId: string) => {
        if (!queryClientInstance) return;
        
        console.log('[PollingDebug] Clearing generations cache for project:', projectId);
        queryClientInstance.removeQueries({
          queryKey: ['unified-generations', 'project', projectId]
        });
        queryClientInstance.removeQueries({
          queryKey: ['unified-generations']
        });
        console.log('✅ Generations cache cleared');
      },
      
      forceRefetchTasks: (projectId: string) => {
        if (!queryClientInstance) return;
        
        console.log('[PollingDebug] Force refetching tasks for project:', projectId);
        queryClientInstance.invalidateQueries({
          queryKey: ['tasks'],
          refetchType: 'active'
        });
        console.log('🔄 Tasks refetch triggered');
      },
      
      forceRefetchGenerations: (projectId: string, shotId?: string) => {
        if (!queryClientInstance) return;
        
        console.log('[PollingDebug] Force refetching generations for project:', projectId, shotId ? `and shot: ${shotId}` : '');
        queryClientInstance.invalidateQueries({
          queryKey: ['unified-generations'],
          refetchType: 'active'
        });
        console.log('🔄 Generations refetch triggered');
      },
      
      enableDebugLogs: () => {
        debugLogsEnabled = true;
        console.log('🔊 Debug logs ENABLED');
        console.log('Available tags: [TaskPollingDebug], [GenerationsPollingDebug], [RealtimeDebug], [CacheInvalidationDebug]');
      },
      
      disableDebugLogs: () => {
        debugLogsEnabled = false;
        console.log('🔇 Debug logs DISABLED');
      },
      
      getQueryClientState: () => {
        if (!queryClientInstance) return null;
        
        const state = {
          queryCount: queryClientInstance.getQueryCache().getAll().length,
          mutationCount: queryClientInstance.getMutationCache().getAll().length,
          isFetching: queryClientInstance.isFetching(),
          isMutating: queryClientInstance.isMutating(),
          queries: queryClientInstance.getQueryCache().getAll().map(query => ({
            key: query.queryKey,
            state: query.state.status,
            dataAge: Date.now() - (query.state.dataUpdatedAt || 0),
            isStale: query.isStale(),
            isFetching: query.state.isFetching
          }))
        };
        
        console.log('[PollingDebug] QueryClient State:', state);
        return state;
      },
      
      simulateTaskUpdate: (projectId: string, taskId: string, status: string) => {
        console.log('[PollingDebug] Simulating task update...', { projectId, taskId, status });
        
        // Simulate the realtime event that would come from Supabase
        const mockPayload = {
          new: {
            id: taskId,
            project_id: projectId,
            status: status,
            updated_at: new Date().toISOString()
          },
          old: {
            id: taskId,
            project_id: projectId,
            status: 'Queued',
            updated_at: new Date(Date.now() - 60000).toISOString()
          }
        };
        
        // This would normally come through the WebSocket
        console.log('📡 Simulated task update payload:', mockPayload);
        console.log('💡 In real app, this would trigger cache invalidation via useWebSocket');
      },
      
      simulateGenerationCreated: (projectId: string, generationId: string) => {
        console.log('[PollingDebug] Simulating generation creation...', { projectId, generationId });
        
        const mockPayload = {
          new: {
            id: generationId,
            project_id: projectId,
            type: 'video',
            location: 'https://example.com/video.mp4',
            created_at: new Date().toISOString()
          }
        };
        
        console.log('📡 Simulated generation creation payload:', mockPayload);
        console.log('💡 In real app, this would trigger cache invalidation via useWebSocket');
      }
    };
    
    // Auto-log helpful instructions
    console.log('🔧 Polling Debug Helpers Available!');
    console.log('Try: debugPolling.inspectAllCaches("your-project-id")');
    console.log('Or:  debugPolling.enableDebugLogs()');
  }
}

// Check if debug logs should be shown (can be controlled via console)
export function shouldShowDebugLogs(): boolean {
  return debugLogsEnabled;
}

// Enhanced console logging that respects the debug setting
export function debugLog(tag: string, message: string, data?: any) {
  if (shouldShowDebugLogs()) {
    console.log(`[${tag}] ${message}`, data);
  }
}
