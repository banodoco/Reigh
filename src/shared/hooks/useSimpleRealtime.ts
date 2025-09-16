import { useEffect, useState } from 'react';
import { simpleRealtimeManager } from '@/shared/realtime/SimpleRealtimeManager';

export function useSimpleRealtime(projectId: string | null) {
  const [status, setStatus] = useState({
    isSubscribed: false,
    isConnecting: false,
    error: null as string | null
  });

  useEffect(() => {
    if (!projectId) {
      setStatus({ isSubscribed: false, isConnecting: false, error: null });
      return;
    }

    let mounted = true;

    const connect = async () => {
      if (!mounted) return;
      
      setStatus({ isSubscribed: false, isConnecting: true, error: null });
      
      try {
        const success = await simpleRealtimeManager.joinProject(projectId);
        
        if (!mounted) return;
        
        if (success) {
          setStatus({ isSubscribed: true, isConnecting: false, error: null });
        } else {
          setStatus({ isSubscribed: false, isConnecting: false, error: 'Failed to subscribe' });
        }
      } catch (error) {
        if (!mounted) return;
        setStatus({ 
          isSubscribed: false, 
          isConnecting: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    };

    connect();

    // Cleanup on unmount or projectId change
    return () => {
      mounted = false;
      simpleRealtimeManager.leave();
    };
  }, [projectId]);

  return status;
}

// Hook for listening to realtime events
export function useRealtimeEvents() {
  const [lastTaskUpdate, setLastTaskUpdate] = useState<any>(null);
  const [lastNewTask, setLastNewTask] = useState<any>(null);

  useEffect(() => {
    const handleTaskUpdate = (event: CustomEvent) => {
      setLastTaskUpdate({ payload: event.detail, timestamp: Date.now() });
    };

    const handleNewTask = (event: CustomEvent) => {
      setLastNewTask({ payload: event.detail, timestamp: Date.now() });
    };

    window.addEventListener('realtime:task-update', handleTaskUpdate as EventListener);
    window.addEventListener('realtime:task-new', handleNewTask as EventListener);

    return () => {
      window.removeEventListener('realtime:task-update', handleTaskUpdate as EventListener);
      window.removeEventListener('realtime:task-new', handleNewTask as EventListener);
    };
  }, []);

  return { lastTaskUpdate, lastNewTask };
}
