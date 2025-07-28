import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskStatus } from '@/types/tasks';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '../contexts/ProjectContext';
import { filterVisibleTasks } from '@/shared/lib/taskConfig';

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

interface PaginatedTasksParams {
  projectId?: string | null;
  status?: TaskStatus[];
  limit?: number;
  offset?: number;
}

export interface PaginatedTasksResponse {
  tasks: Task[];
  total: number;
  hasMore: boolean;
  totalPages: number;
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
      console.log('[useCreateTask] Task created successfully:', {
        functionName: variables.functionName,
        data,
        selectedProjectId,
      });
      
      // Show per-task success toast only if not suppressed
      if (showToast) {
  
      }
      
      // Invalidate the tasks query to trigger a refetch
      // This ensures the TasksPane updates automatically
      if (selectedProjectId) {
        console.log('[useCreateTask] Invalidating tasks query for projectId:', selectedProjectId);
        queryClient.invalidateQueries({ queryKey: ['tasks', selectedProjectId] });
      } else {
        // If there's no project context, invalidate the generic 'tasks' query
        // which might be used in other parts of the app
        console.log('[useCreateTask] Invalidating generic tasks query');
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

      if (error) throw error;
      const tasks = (data || []).map(mapDbTaskToTask);
      return tasks;
    },
    enabled: !!projectId, // Only run the query if projectId is available
  });
};

// Hook to list tasks with pagination
export const usePaginatedTasks = (params: PaginatedTasksParams) => {
  const { projectId, status, limit = 50, offset = 0 } = params;
  
  return useQuery<PaginatedTasksResponse, Error>({
    queryKey: [TASKS_QUERY_KEY, 'paginated', projectId, status, limit, offset],
    queryFn: async () => {
      if (!projectId) {
        return { tasks: [], total: 0, hasMore: false, totalPages: 0 }; 
      }
      
      // First, get ALL visible tasks for this filter to get accurate count
      let allTasksQuery = supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .is('params->orchestrator_task_id_ref', null) // Only parent tasks
        .order('created_at', { ascending: false });

      // Apply status filter if provided
      if (status && status.length > 0) {
        allTasksQuery = allTasksQuery.in('status', status);
      }

      const { data: allTasksData, error: allTasksError } = await allTasksQuery;
      
      if (allTasksError) throw allTasksError;
      
      // Convert and filter to only visible tasks
      const allTasks = (allTasksData || []).map(mapDbTaskToTask);
      const allVisibleTasks = filterVisibleTasks(allTasks);
      
      // Get the paginated slice
      const paginatedTasks = allVisibleTasks.slice(offset, offset + limit);
      
      const total = allVisibleTasks.length;
      const totalPages = Math.ceil(total / limit);
      const hasMore = offset + limit < total;

      return {
        tasks: paginatedTasks,
        total,
        hasMore,
        totalPages,
      };
    },
    enabled: !!projectId, // Only run the query if projectId is available
  });
};

/**
 * Cancel a task using direct Supabase call
 * For travel_orchestrator tasks, also cancels all subtasks
 */
async function cancelTask(taskId: string): Promise<void> {
  // First, get the task to check if it's an orchestrator
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch task: ${fetchError.message}`);
  }

  // Cancel the main task
  const { error: cancelError } = await supabase
    .from('tasks')
    .update({ 
      status: 'Cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId);

  if (cancelError) {
    throw new Error(`Failed to cancel task: ${cancelError.message}`);
  }

  // If it's a travel_orchestrator, cancel all subtasks
  if (task && task.task_type === 'travel_orchestrator') {
    // Find all subtasks that reference this orchestrator
    const { data: subtasks, error: subtaskFetchError } = await supabase
      .from('tasks')
      .select('id, params')
      .eq('project_id', task.project_id)
      .in('status', ['Queued', 'In Progress']);

    if (!subtaskFetchError && subtasks) {
      const subtaskIds = subtasks.filter(subtask => {
        const params = subtask.params as any;
        return params?.orchestrator_task_id_ref === taskId || 
               params?.orchestrator_task_id === taskId;
      }).map(subtask => subtask.id);

      if (subtaskIds.length > 0) {
        // Cancel all subtasks
        const { error: subtaskCancelError } = await supabase
          .from('tasks')
          .update({ 
            status: 'Cancelled',
            updated_at: new Date().toISOString()
          })
          .in('id', subtaskIds);

        if (subtaskCancelError) {
          console.error('Failed to cancel subtasks:', subtaskCancelError);
        }
      }
    }
  }
}

/**
 * Cancel all pending tasks for a project using direct Supabase call
 * For travel_orchestrator tasks, also cancels their subtasks
 */
async function cancelPendingTasks(projectId: string): Promise<CancelAllPendingTasksResponse> {
  // First, get all pending tasks to check for orchestrators
  const { data: pendingTasks, error: fetchError } = await supabase
    .from('tasks')
    .select('id, task_type')
    .eq('project_id', projectId)
    .in('status', ['Queued', 'In Progress']);

  if (fetchError) {
    throw new Error(`Failed to fetch pending tasks: ${fetchError.message}`);
  }

  // Collect all task IDs to cancel (including subtasks)
  const tasksToCancel = new Set<string>();
  
  // Add all pending tasks
  pendingTasks?.forEach(task => tasksToCancel.add(task.id));

  // Find orchestrator tasks
  const orchestratorIds = pendingTasks
    ?.filter(task => task.task_type === 'travel_orchestrator')
    .map(task => task.id) || [];

  // If there are orchestrators, find their subtasks
  if (orchestratorIds.length > 0) {
    const { data: allProjectTasks, error: allTasksError } = await supabase
      .from('tasks')
      .select('id, params')
      .eq('project_id', projectId)
      .in('status', ['Queued', 'In Progress']);

    if (!allTasksError && allProjectTasks) {
      allProjectTasks.forEach(task => {
        const params = task.params as any;
        const orchestratorRef = params?.orchestrator_task_id_ref || params?.orchestrator_task_id;
        
        if (orchestratorRef && orchestratorIds.includes(orchestratorRef)) {
          tasksToCancel.add(task.id);
        }
      });
    }
  }

  // Cancel all collected tasks
  const taskIdsArray = Array.from(tasksToCancel);
  
  if (taskIdsArray.length > 0) {
    const { error: cancelError } = await supabase
      .from('tasks')
      .update({ 
        status: 'Cancelled',
        updated_at: new Date().toISOString()
      })
      .in('id', taskIdsArray);

    if (cancelError) {
      throw new Error(`Failed to cancel tasks: ${cancelError.message}`);
    }
  }

  return {
    cancelledCount: taskIdsArray.length,
    message: `${taskIdsArray.length} tasks cancelled (including subtasks)`,
  };
}

// Hook to cancel a task using Supabase
export const useCancelTask = (projectId: string | null) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: cancelTask,
    onSuccess: (_, taskId) => {
      console.log(`[${Date.now()}] [useCancelTask] Task cancelled, invalidating queries for projectId:`, projectId);
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] });
      // Also invalidate status counts since cancelling changes the processing count
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['task-status-counts', projectId] });
      }
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
      console.log(`[${Date.now()}] [useCancelPendingTasks] Tasks cancelled, invalidating queries for projectId:`, projectId);
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId, ['Queued']] });
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId, ['Cancelled']] });
      // Also invalidate status counts since cancelling changes the processing count  
      queryClient.invalidateQueries({ queryKey: ['task-status-counts', projectId] });
    },
    onError: (error: Error) => {
      console.error('Error cancelling pending tasks:', error);
      toast.error(`Failed to cancel pending tasks: ${error.message}`);
    },
  });
};

// Export alias for backward compatibility
export const useCancelAllPendingTasks = useCancelPendingTasks; 

// Hook to get status counts for indicators
export const useTaskStatusCounts = (projectId: string | null) => {
  return useQuery({
    queryKey: ['task-status-counts', projectId],
    queryFn: async () => {
      if (!projectId) {
        return { processing: 0, recentSuccesses: 0, recentFailures: 0 };
      }

      // Get 1 hour ago timestamp
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Query for processing tasks (any time)
      const { count: processingCount, error: processingError } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['Queued', 'In Progress'])
        .is('params->orchestrator_task_id_ref', null); // Only parent tasks

      if (processingError) throw processingError;

      // Query for recent successes (last hour)
      const { count: successCount, error: successError } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'Complete')
        .gte('updated_at', oneHourAgo)
        .is('params->orchestrator_task_id_ref', null); // Only parent tasks

      if (successError) throw successError;

      // Query for recent failures (last hour)
      const { count: failureCount, error: failureError } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['Failed', 'Cancelled'])
        .gte('updated_at', oneHourAgo)
        .is('params->orchestrator_task_id_ref', null); // Only parent tasks

      if (failureError) throw failureError;

      const result = {
        processing: processingCount || 0,
        recentSuccesses: successCount || 0,
        recentFailures: failureCount || 0,
      };
      
      return result;
    },
    enabled: !!projectId,
    refetchInterval: 5000, // Refresh every 5 seconds for live updates
  });
}; 