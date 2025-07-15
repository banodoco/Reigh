import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskStatus } from '@/types/tasks';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '../contexts/ProjectContext';

const TASKS_QUERY_KEY = 'tasks';

// Types for API responses and request bodies
// Ensure these align with your server-side definitions and Task type in @/types/tasks.ts

interface ListTasksParams {
  projectId?: string | null;
  status?: TaskStatus[];
}

interface CreateTaskParams {
  projectId: string;
  taskType: string;
  params: any;
}

interface CancelAllPendingTasksResponse {
  cancelledCount: number;
  message: string;
}

// Helper to convert DB row (snake_case) to Task interface (camelCase)
const mapDbTaskToTask = (row: any): Task => ({
  id: row.id,
  taskType: row.task_type,
  params: row.params,
  status: row.status,
  dependantOn: row.dependant_on ?? undefined,
  outputLocation: row.output_location ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
  projectId: row.project_id,
});

/**
 * A generalized hook for creating any type of task via a Supabase Edge Function.
 * It handles loading states, toast notifications, and automatically invalidates
 * the tasks query to refresh the UI upon successful creation.
 */
export const useCreateTask = (options?: { showToast?: boolean }) => {
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject();
  // Allow callers to suppress per-task success toasts (useful for bulk operations)
  const { showToast = true } = options || {};

  return useMutation({
    mutationFn: async ({ functionName, payload }: { functionName: string, payload: object }) => {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload,
      });

      if (error) {
        // Throw an error that react-query will catch in onError
        throw new Error(error.message || `An unknown error occurred with function: ${functionName}`);
      }
      
      return data;
    },
    onSuccess: (data, variables) => {
      // Show per-task success toast only if not suppressed
      if (showToast) {
        toast.success(`Task created successfully!`);
      }
      
      // Invalidate the tasks query to trigger a refetch
      // This ensures the TasksPane updates automatically
      if (selectedProjectId) {
        queryClient.invalidateQueries({ queryKey: ['tasks', selectedProjectId] });
      } else {
        // If there's no project context, invalidate the generic 'tasks' query
        // which might be used in other parts of the app
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
    },
    onError: (error: Error, variables) => {
      // This will run if the mutationFn throws an error
      console.error(`[useCreateTask] Error creating task with function '${variables.functionName}':`, error);
      toast.error(`Failed to create task: ${error.message}`);
    },
  });
};

// Hook to update task status
export const useUpdateTaskStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] });
      toast.success('Task status updated successfully');
    },
    onError: (error: Error) => {
      console.error('Error updating task status:', error);
      toast.error(`Failed to update task status: ${error.message}`);
    },
  });
};

// Hook to get a single task by ID
export const useGetTask = (taskId: string) => {
  return useQuery<Task, Error>({
    queryKey: [TASKS_QUERY_KEY, 'single', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error) {
        throw new Error(`Task with ID ${taskId} not found: ${error.message}`);
      }

      return mapDbTaskToTask(data);
    },
    enabled: !!taskId,
  });
};

// Hook to list tasks
export const useListTasks = (params: ListTasksParams) => {
  const { projectId, status } = params;
  
  return useQuery<Task[], Error>({
    queryKey: [TASKS_QUERY_KEY, projectId, status],
    queryFn: async () => {
      if (!projectId) {
        return []; 
      }
      
      console.log(`[TaskList] Fetching tasks for project ${projectId} with statuses:`, status);

      // Build query
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      // Apply status filter if provided
      if (status && status.length > 0) {
        query = query.in('status', status);
      }

      const { data, error } = await query;
      
      console.log('[TaskList] Raw data from Supabase:', data);

      if (error) throw error;
      return (data || []).map(mapDbTaskToTask);
    },
    enabled: !!projectId, // Only run the query if projectId is available
  });
};

/**
 * Cancel a task using direct Supabase call
 */
async function cancelTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ 
      status: 'Cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId);

  if (error) {
    throw new Error(`Failed to cancel task: ${error.message}`);
  }
}

/**
 * Cancel all pending tasks for a project using direct Supabase call
 */
async function cancelPendingTasks(projectId: string): Promise<CancelAllPendingTasksResponse> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ 
      status: 'Cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('project_id', projectId)
    .eq('status', 'Queued')
    .select('id');

  if (error) {
    throw new Error(`Failed to cancel pending tasks: ${error.message}`);
  }

  const cancelledCount = data?.length || 0;
  
  return {
    cancelledCount,
    message: `${cancelledCount} pending tasks cancelled`,
  };
}

// Hook to cancel a task using Supabase
export const useCancelTask = (projectId: string | null) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: cancelTask,
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] });
      toast.success('Task cancelled successfully');
    },
    onError: (error: Error) => {
      console.error('Error cancelling task:', error);
      toast.error(`Failed to cancel task: ${error.message}`);
    },
  });
};

// Hook to cancel pending tasks using Supabase
export const useCancelPendingTasks = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: cancelPendingTasks,
    onSuccess: (data, projectId) => {
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId, ['Queued']] });
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId, ['Cancelled']] });
      toast.success(`${data.cancelledCount} pending tasks cancelled successfully`);
    },
    onError: (error: Error) => {
      console.error('Error cancelling pending tasks:', error);
      toast.error(`Failed to cancel pending tasks: ${error.message}`);
    },
  });
};

// Export alias for backward compatibility
export const useCancelAllPendingTasks = useCancelPendingTasks; 