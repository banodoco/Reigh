import React, { createContext, useContext, useEffect, useState } from 'react';
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
      
      setState(prev => ({
        ...prev,
        lastTaskUpdate: { payload: event.detail, timestamp: Date.now() }
      }));
      
      // Invalidate React Query caches as documented in realtime_system.md
      console.log('[TasksPaneRealtimeDebug] 🔄 Invalidating React Query caches for task update', {
        context: 'realtime-invalidation-task-update',
        eventDetail: event.detail,
        queryKeysInvalidated: ['tasks', 'task-status-counts', 'unified-generations (all variants)', 'shots', 'unpositioned-count', 'project-video-counts'],
        timestamp: Date.now()
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
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });
      // Use predicate to invalidate all unified-generations queries (including shot-specific ones)
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'unified-generations'
      });
      queryClient.invalidateQueries({ queryKey: ['shots'] });
      queryClient.invalidateQueries({ queryKey: ['unpositioned-count'] });
      queryClient.invalidateQueries({ queryKey: ['project-video-counts'] });
    };

    window.addEventListener('realtime:task-update', handleTaskUpdate as EventListener);
    window.addEventListener('realtime:task-new', handleNewTask as EventListener);

    return () => {
      window.removeEventListener('realtime:task-update', handleTaskUpdate as EventListener);
      window.removeEventListener('realtime:task-new', handleNewTask as EventListener);
    };
  }, [queryClient]);

  return (
    <SimpleRealtimeContext.Provider value={state}>
      {children}
    </SimpleRealtimeContext.Provider>
  );
}
