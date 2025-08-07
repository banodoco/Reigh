// Full updated file
import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateTask, usePaginatedTasks } from './useTasks';
import { useQueuedFeedback } from './useQueuedFeedback';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TaskPayload {
  functionName: string;
  payload: object;
}

interface UseTaskQueueNotifierOptions {
  projectId: string | null;
  suppressPerTaskToast?: boolean;
}

export const useTaskQueueNotifier = ({
  projectId,
  suppressPerTaskToast = true,
}: UseTaskQueueNotifierOptions) => {
  const queryClient = useQueryClient();
  const { mutateAsync: createTaskAsync } = useCreateTask({ showToast: !suppressPerTaskToast });
  // Use paginated tasks count instead of loading all tasks
  const { data: tasksData } = usePaginatedTasks({ 
    projectId, 
    status: undefined, 
    page: 1, 
    limit: 1 // Only need count, not actual data
  });
  const currentTaskCount = tasksData?.total ?? 0;
  const { justQueued, triggerQueued } = useQueuedFeedback();

  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const [targetTotal, setTargetTotal] = useState<number | null>(null);

  // debug log removed

  /* Realtime helpers */
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingInsertTargetRef = useRef<number | null>(null);

  // Clean up realtime channel
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [projectId]);

  /* ------------------------------------------------------------ */
  /* Shared success handler                                       */
  /* ------------------------------------------------------------ */
  const handleSuccess = useCallback(async () => {
    // Refresh TasksPane queries before showing success
    console.log(`[${Date.now()}] [TaskQueueNotifier] Refreshing TasksPane queries`);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated'] }),
      queryClient.invalidateQueries({ queryKey: ['task-status-counts', projectId] }),
      queryClient.refetchQueries({ queryKey: ['tasks', 'paginated'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['task-status-counts', projectId], type: 'active' }),
    ]);

    triggerQueued();
    setIsEnqueuing(false);
    setTargetTotal(null);
    pendingInsertTargetRef.current = null;

    // Clean up realtime channel
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
  }, [projectId, queryClient, triggerQueued]);

  /* ------------------------------------------------------------ */
  /* 1️⃣  Public API – create tasks and start watching            */
  /* ------------------------------------------------------------ */
  const enqueueTasks = useCallback(
    async (payloads: TaskPayload[]): Promise<void> => {
      console.log(`[${Date.now()}] [TaskQueueNotifier] enqueueTasks called with:`, {
        projectId,
        payloadCount: payloads.length,
        payloads: payloads.map(p => ({ functionName: p.functionName })),
      });

      if (!projectId) {
        console.error(`[${Date.now()}] [TaskQueueNotifier] No project selected`);
        throw new Error('[useTaskQueueNotifier] No project selected – cannot create tasks.');
      }
      if (!payloads.length) {
        console.log(`[${Date.now()}] [TaskQueueNotifier] No payloads provided, returning early`);
        return;
      }

      const initialCount = currentTaskCount;
      console.log(`[${Date.now()}] [TaskQueueNotifier] Initial task count:`, initialCount);

      setIsEnqueuing(true);

      /* Create tasks in parallel */
      console.log(`[${Date.now()}] [TaskQueueNotifier] Creating tasks in parallel...`);
      const results = await Promise.allSettled(
        payloads.map(({ functionName, payload }) =>
          createTaskAsync({ functionName, payload })
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`[${Date.now()}] [TaskQueueNotifier] Task creation results:`, {
        total: results.length,
        successful,
        failed,
        results: results.map((r, i) => ({
          index: i,
          status: r.status,
          reason: r.status === 'rejected' ? r.reason : undefined,
        })),
      });

      if (successful === 0) {
        console.log(`[${Date.now()}] [TaskQueueNotifier] No tasks created successfully, stopping`);
        setIsEnqueuing(false);
        return;
      }

      /* Start realtime listener */
      pendingInsertTargetRef.current = successful;
      let insertedCount = 0;

      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      console.log(`[${Date.now()}] [TaskQueueNotifier] Subscribing to realtime inserts for tasks`);
      channelRef.current = supabase
        .channel(`task-inserts-${projectId}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'tasks',
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            insertedCount += 1;
            console.log(`[${Date.now()}] [TaskQueueNotifier] Realtime task INSERT received`, {
              insertedCount,
              target: pendingInsertTargetRef.current,
              payloadId: payload.new?.id,
            });
            if (
              pendingInsertTargetRef.current !== null &&
              insertedCount >= pendingInsertTargetRef.current
            ) {
              console.log(`[${Date.now()}] [TaskQueueNotifier] 🎉 All expected inserts observed via realtime`);
              handleSuccessWithCleanup();
            }
          }
        )
        .subscribe((status, error) => {
          console.log(`[${Date.now()}] [TaskQueueNotifier] Channel status change:`, status);
          if (error) {
            console.error(`[${Date.now()}] [TaskQueueNotifier] Channel error:`, error);
          }
        });

      // Fallback count-based logic
      const expectedTotal = initialCount + successful;
      setTargetTotal(expectedTotal);
      console.log(`[${Date.now()}] [TaskQueueNotifier] Fallback targetTotal set:`, expectedTotal);

      // Invalidate main query
      console.log(`[${Date.now()}] [TaskQueueNotifier] Invalidating tasks query for projectId:`, projectId);
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });

      // Force refetch
      setTimeout(() => {
        console.log(`[${Date.now()}] [TaskQueueNotifier] Force refetching tasks after delay`);
        queryClient.refetchQueries({ queryKey: ['tasks', projectId] });
      }, 500);

      // Start faster polling (immediate first check + every 750ms)
      console.log(`[${Date.now()}] [TaskQueueNotifier] Starting count polling`);
      const pollIntervalMs = 750;
      const pollImmediately = async () => {
        await checkCount();
      };
      pollImmediately(); // First check now

      const pollId = setInterval(checkCount, pollIntervalMs);

      async function checkCount() {
        if (!projectId || pendingInsertTargetRef.current === null) return;
        
        console.log('[PollingBreakageIssue] TaskQueueNotifier fallback polling executing:', {
          projectId,
          target: expectedTotal,
          timestamp: Date.now()
        });
        
        const { count, error } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', projectId);
          
        if (error) {
          console.error(`[${Date.now()}] [TaskQueueNotifier] Count polling error:`, error);
          console.error('[PollingBreakageIssue] TaskQueueNotifier fallback polling error:', {
            projectId,
            error,
            timestamp: Date.now()
          });
          return;
        }
        
        console.log(`[${Date.now()}] [TaskQueueNotifier] Count poll:`, { count, target: expectedTotal });
        console.log('[PollingBreakageIssue] TaskQueueNotifier fallback polling result:', {
          projectId,
          count,
          target: expectedTotal,
          timestamp: Date.now()
        });
        
        if (typeof count === 'number' && count >= expectedTotal) {
          console.log(`[${Date.now()}] [TaskQueueNotifier] 🎉 Target reached via COUNT polling`);
          console.log('[PollingBreakageIssue] TaskQueueNotifier fallback polling succeeded - target reached!', {
            projectId,
            count,
            target: expectedTotal,
            timestamp: Date.now()
          });
          handleSuccessWithCleanup();
        }
      }

      // Timeout after 30s
      const timeoutId = setTimeout(() => {
        console.error(`[${Date.now()}] [TaskQueueNotifier] Timeout: Tasks not detected after 30s`);
        toast.error('Task creation timeout - please check the Tasks pane');
        setIsEnqueuing(false);
        setTargetTotal(null);
        pendingInsertTargetRef.current = null;
        clearInterval(pollId);
        if (channelRef.current) channelRef.current.unsubscribe();
      }, 30000);

      // Handle success (with cleanup for this specific enqueueTasks call)
      async function handleSuccessWithCleanup() {
        await handleSuccess();
        clearTimeout(timeoutId);
        clearInterval(pollId);
      }
    },
    [projectId, createTaskAsync, currentTaskCount, queryClient, handleSuccess]
  );

  /* Watcher effect (fallback) */
  useEffect(() => {
    console.log(`[${Date.now()}] [TaskQueueNotifier] Watcher effect running:`, {
      isEnqueuing,
      targetTotal,
      currentTaskCount,
      tasksDataLoaded: !!tasksData,
    });

    if (!isEnqueuing || targetTotal === null) {
      console.log(`[${Date.now()}] [TaskQueueNotifier] Watcher: Not enqueuing or no target, skipping`);
      return;
    }
    if (!tasksData) {
      console.log(`[${Date.now()}] [TaskQueueNotifier] Watcher: Tasks still loading`);
      return;
    }

    console.log(`[${Date.now()}] [TaskQueueNotifier] Watcher: Checking if target reached:`, {
      current: currentTaskCount,
      target: targetTotal,
      reached: currentTaskCount >= targetTotal,
    });

    if (currentTaskCount >= targetTotal) {
      console.log(`[${Date.now()}] [TaskQueueNotifier] 🎉 Target reached via fallback watcher`);
      handleSuccess(); // Use same success handler
    }
  }, [tasksData, currentTaskCount, isEnqueuing, targetTotal, handleSuccess]);

  return { enqueueTasks, isEnqueuing, justQueued } as const;
};