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
      
      // GALLERY PATTERN: Only invalidate first page where new tasks appear
      if (selectedProjectId) {
        console.log('[PollingBreakageIssue] [useCreateTask] Using GALLERY PATTERN invalidation:', {
          projectId: selectedProjectId,
          timestamp: Date.now()
        });
        
        // Only invalidate the lightweight status counts
        queryClient.invalidateQueries({ queryKey: ['task-status-counts', selectedProjectId] });
        
        // GALLERY PATTERN: Only invalidate first page (where new tasks appear)
        queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId, 1, 50, undefined] });
        
        // Do NOT invalidate other pages - they'll update via realtime
      } else {
        // Fallback: invalidate generic queries (should rarely happen)
        console.log('[useCreateTask] Invalidating generic tasks query');
        queryClient.invalidateQueries({ queryKey: ['task-status-counts'] });
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

// DEPRECATED: Hook to list ALL tasks - DO NOT USE with large datasets
// Use usePaginatedTasks instead for better performance
export const useListTasks = (params: ListTasksParams) => {
  const { projectId, status } = params;
  
  // Add warning for large datasets
  console.warn('[PollingBreakageIssue] useListTasks is DEPRECATED for performance reasons. Use usePaginatedTasks instead.');
  
  return useQuery<Task[], Error>({
    queryKey: [TASKS_QUERY_KEY, projectId, status],
    queryFn: async () => {
      console.log('[PollingBreakageIssue] useListTasks query executing - DEPRECATED:', {
        projectId,
        status,
        timestamp: Date.now()
      });
      
      if (!projectId) {
        return []; 
      }
      
      // Build query with LIMIT to prevent massive queries
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100); // CRITICAL: Limit to prevent query storms

      // Apply status filter if provided
      if (status && status.length > 0) {
        query = query.in('status', status);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[PollingBreakageIssue] useListTasks query error:', {
          projectId,
          status,
          error,
          timestamp: Date.now()
        });
        throw error;
      }
      
      const tasks = (data || []).map(mapDbTaskToTask);
      
      console.log('[PollingBreakageIssue] useListTasks query completed - LIMITED to 100:', {
        projectId,
        status,
        taskCount: tasks.length,
        timestamp: Date.now()
      });
      
      return tasks;
    },
    enabled: !!projectId,
    // CRITICAL: Prevent excessive background refetches
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

// Hook to list tasks with pagination - GALLERY PATTERN
export const usePaginatedTasks = (params: PaginatedTasksParams) => {
  const { projectId, status, limit = 50, offset = 0 } = params;
  const page = Math.floor(offset / limit) + 1;
  
  return useQuery<PaginatedTasksResponse, Error>({
    // CRITICAL: Use page-based cache keys like gallery
    queryKey: [TASKS_QUERY_KEY, 'paginated', projectId, page, limit, status],
    queryFn: async () => {
      console.log('[PollingBreakageIssue] Paginated tasks query - GALLERY PATTERN:', {
        projectId,
        page,
        limit,
        status,
        visibilityState: document.visibilityState,
        isHidden: document.hidden,
        timestamp: Date.now()
      });
      
      if (!projectId) {
        return { tasks: [], total: 0, hasMore: false, totalPages: 0 }; 
      }
      
      // GALLERY PATTERN: Get count and data separately, efficiently
      
      // 1. Get total count with lightweight query
      let countQuery = supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .is('params->orchestrator_task_id_ref', null); // Only parent tasks

      if (status && status.length > 0) {
        countQuery = countQuery.in('status', status);
      }

      // 2. Get paginated data directly from database with proper status ordering
      // Since PostgREST doesn't support custom CASE statements in order(),
      // we'll fetch and sort on client-side, but limit the fetch size
      let dataQuery = supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .is('params->orchestrator_task_id_ref', null) // Only parent tasks
        .order('created_at', { ascending: false })
        .limit(Math.min(limit * 2, 100)); // Fetch 2x records (max 100) for sorting, prevent huge queries

      if (status && status.length > 0) {
        dataQuery = dataQuery.in('status', status);
      }

      // Execute both queries
      const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
        countQuery,
        dataQuery
      ]);
      
      if (countError) throw countError;
      if (dataError) throw dataError;
      
      // Apply client-side filtering and sorting
      const allTasks = (data || []).map(mapDbTaskToTask);
      const visibleTasks = filterVisibleTasks(allTasks);
      
      // FIXED: Client-side sorting to prioritize "In Progress" over "Queued"
      const sortedTasks = visibleTasks.sort((a, b) => {
        // Priority: In Progress (1), Queued (2), Others (3)
        const getStatusPriority = (status: string) => {
          switch (status) {
            case 'In Progress': return 1;
            case 'Queued': return 2;
            default: return 3;
          }
        };
        
        const aPriority = getStatusPriority(a.status);
        const bPriority = getStatusPriority(b.status);
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority; // Lower number = higher priority
        }
        
        // Within same status, sort by created_at descending (newest first)
        const aDate = new Date(a.createdAt || 0);
        const bDate = new Date(b.createdAt || 0);
        return bDate.getTime() - aDate.getTime();
      });
      
      // Apply pagination to sorted results
      const paginatedTasks = sortedTasks.slice(offset, offset + limit);
      
      // Debug log to verify sorting is working (throttled to prevent spam)
      if (paginatedTasks.length > 0 && Math.random() < 0.1) { // Only log 10% of the time
        const statusCounts = paginatedTasks.reduce((acc, task) => {
          acc[task.status] = (acc[task.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.log('[PollingBreakageIssue] Task sorting applied - status distribution:', {
          statusCounts,
          firstTaskStatus: paginatedTasks[0]?.status,
          totalTasks: paginatedTasks.length,
          timestamp: Date.now()
        });
      }
      
      const total = count || 0;
      const totalPages = Math.ceil(total / limit);
      const hasMore = offset + limit < total;

      return {
        tasks: paginatedTasks,
        total,
        hasMore,
        totalPages,
      };
    },
    enabled: !!projectId,
    // CRITICAL: Gallery cache settings - prevent background refetches
    placeholderData: (previousData) => previousData,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes  
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Add background polling for active tasks
    refetchInterval: (query) => {
      // Only poll if there are active tasks (Queued or In Progress)
      const data = query.state.data;
      if (!data) return false;
      const hasActiveTasks = data.tasks?.some(task => 
        task.status === 'Queued' || task.status === 'In Progress'
      ) ?? false;
      return hasActiveTasks ? 10000 : false; // Poll every 10 seconds if there are active tasks
    },
    refetchIntervalInBackground: true, // CRITICAL: Continue polling when tab is not visible
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
      console.log('[PollingBreakageIssue] useTaskStatusCounts query executing - backup polling active:', {
        projectId,
        visibilityState: document.visibilityState,
        isHidden: document.hidden,
        timestamp: Date.now()
      });
      
      if (!projectId) {
        return { processing: 0, recentSuccesses: 0, recentFailures: 0 };
      }

      // Get 1 hour ago timestamp
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Execute all queries in parallel with error resilience
      const [processingResult, successResult, failureResult] = await Promise.allSettled([
        // Query for processing tasks (any time)
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('status', ['Queued', 'In Progress'])
          .is('params->orchestrator_task_id_ref', null), // Only parent tasks
          
        // Query for recent successes (last hour)
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('status', 'Complete')
          .gte('updated_at', oneHourAgo)
          .is('params->orchestrator_task_id_ref', null), // Only parent tasks
          
        // Query for recent failures (last hour)
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('status', ['Failed', 'Cancelled'])
          .gte('updated_at', oneHourAgo)
          .is('params->orchestrator_task_id_ref', null) // Only parent tasks
      ]);

      // Handle processing count result
      let processingCount = 0;
      if (processingResult.status === 'fulfilled') {
        const { count, error } = processingResult.value;
        if (error) {
          console.error('[PollingBreakageIssue] useTaskStatusCounts query error (processing):', {
            projectId,
            error,
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            timestamp: Date.now()
          });
        } else {
          processingCount = count || 0;
        }
      } else {
        console.error('[PollingBreakageIssue] Processing query promise rejected:', {
          projectId,
          reason: processingResult.reason,
          timestamp: Date.now()
        });
      }

      // Handle success count result
      let successCount = 0;
      if (successResult.status === 'fulfilled') {
        const { count, error } = successResult.value;
        if (error) {
          console.error('[PollingBreakageIssue] useTaskStatusCounts query error (success):', {
            projectId,
            error,
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            timestamp: Date.now()
          });
        } else {
          successCount = count || 0;
        }
      } else {
        console.error('[PollingBreakageIssue] Success query promise rejected:', {
          projectId,
          reason: successResult.reason,
          timestamp: Date.now()
        });
      }

      // Handle failure count result
      let failureCount = 0;
      if (failureResult.status === 'fulfilled') {
        const { count, error } = failureResult.value;
        if (error) {
          console.error('[PollingBreakageIssue] useTaskStatusCounts query error (failure):', {
            projectId,
            error,
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            timestamp: Date.now()
          });
        } else {
          failureCount = count || 0;
        }
      } else {
        console.error('[PollingBreakageIssue] Failure query promise rejected:', {
          projectId,
          reason: failureResult.reason,
          timestamp: Date.now()
        });
      }

      const result = {
        processing: processingCount,
        recentSuccesses: successCount,
        recentFailures: failureCount,
      };
      
      console.log('[PollingBreakageIssue] useTaskStatusCounts query completed:', {
        projectId,
        result,
        processingStatus: processingResult.status,
        successStatus: successResult.status,
        failureStatus: failureResult.status,
        timestamp: Date.now()
      });
      
      return result;
    },
    enabled: !!projectId,
    refetchInterval: 5000, // Refresh every 5 seconds for live updates
    refetchIntervalInBackground: true, // CRITICAL: Continue polling when tab is not visible
  });
}; 