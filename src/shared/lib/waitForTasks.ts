import { QueryClient } from '@tanstack/react-query';

interface WaitForTasksOptions {
  /** Maximum time to wait in ms (default: 5000) */
  timeout?: number;
  /** Polling interval in ms (default: 100) */
  pollInterval?: number;
  /** AbortSignal for cancellation (e.g., on component unmount) */
  signal?: AbortSignal;
}

/**
 * Wait for specific task IDs to appear in the react-query cache.
 * This is used to ensure the filler task doesn't disappear before real tasks show up.
 *
 * @param queryClient - The react-query client
 * @param projectId - The project ID to check tasks for
 * @param taskIds - Array of task IDs to wait for
 * @param options - Configuration options
 * @returns Promise that resolves to true when found, false on timeout/abort
 */
export async function waitForTasksInCache(
  queryClient: QueryClient,
  projectId: string,
  taskIds: string[],
  options: WaitForTasksOptions = {}
): Promise<boolean> {
  const { timeout = 5000, pollInterval = 100, signal } = options;

  if (taskIds.length === 0) {
    return true;
  }

  const taskIdSet = new Set(taskIds);
  const startTime = Date.now();

  return new Promise((resolve) => {
    const checkTasks = () => {
      // Check for abort
      if (signal?.aborted) {
        resolve(false);
        return;
      }

      // Check if any of the task IDs appear in any paginated task queries
      const queries = queryClient.getQueriesData<{ tasks?: Array<{ id: string }> }>({
        queryKey: ['tasks', 'paginated', projectId],
      });

      for (const [, data] of queries) {
        if (data?.tasks) {
          for (const task of data.tasks) {
            if (taskIdSet.has(task.id)) {
              console.log('[waitForTasks] Found task in cache:', task.id);
              resolve(true);
              return;
            }
          }
        }
      }

      // Check if we've exceeded the timeout
      if (Date.now() - startTime >= timeout) {
        console.log('[waitForTasks] Timeout waiting for tasks:', taskIds);
        resolve(false);
        return;
      }

      // Keep polling
      setTimeout(checkTasks, pollInterval);
    };

    checkTasks();
  });
}
