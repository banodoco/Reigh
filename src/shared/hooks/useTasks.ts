import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskStatus, TASK_STATUS } from '@/types/tasks';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '../contexts/ProjectContext';
import { filterVisibleTasks, isTaskVisible } from '@/shared/lib/taskConfig';
// Removed invalidationRouter - DataFreshnessManager handles all invalidation logic
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';

const TASKS_QUERY_KEY = 'tasks';

// Pagination configuration constants
const PAGINATION_CONFIG = {
  // For Processing tasks that need custom sorting
  // Reduced multiplier to avoid slow 150+ task fetches
  PROCESSING_FETCH_MULTIPLIER: 2,
  PROCESSING_MAX_FETCH: 100,
  // Default limits
  DEFAULT_LIMIT: 50,
} as const;

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
  costCents: row.cost_cents ?? undefined,
  generationStartedAt: row.generation_started_at ?? undefined,
  generationProcessedAt: row.generation_processed_at ?? undefined,
  errorMessage: row.error_message ?? undefined,
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
    mutationKey: ['create-task'],
    mutationFn: async ({ functionName, payload }: { functionName: string, payload: object }) => {
      // Guard against indefinitely stuck mutations by enforcing a client-side timeout
      const timeoutMs = 20000; // 20s hard cap to keep UI responsive
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error(`[useCreateTask] Function ${functionName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const invokePromise = (async () => {
        const { data, error } = await supabase.functions.invoke(functionName, {
          body: payload,
        });
        if (error) {
          throw new Error(error.message || `An unknown error occurred with function: ${functionName}`);
        }
        return data as any;
      })();

      return await Promise.race([invokePromise, timeoutPromise]);
    },
    onSuccess: (data, variables) => {
      // Use InvalidationRouter for centralized, canonical invalidations
      if (selectedProjectId) {
        });
        
        // Task creation event is now handled by DataFreshnessManager via realtime events
        
        // Do NOT invalidate other pages - they'll update via realtime/polling
      } else {
        // Fallback: no manual invalidation needed - DataFreshnessManager handles it
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
    onSuccess: (data, variables) => {
      // Task status change event is now handled by DataFreshnessManager via realtime events
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
  
  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig([TASKS_QUERY_KEY, 'paginated', projectId]);
  
  // [TasksPaneCountMismatch] Debug unexpected limit values
  if (limit < 10) {
    console.warn('[TasksPaneCountMismatch]', {
      context: 'usePaginatedTasks:UNEXPECTED_SMALL_LIMIT',
      receivedParams: params,
      limit,
      offset,
      page,
      status,
      projectId,
      WARNING: 'Limit too small for processing view - check for cache collision',
      timestamp: Date.now()
    });
  }
  
  const effectiveProjectId = projectId ?? (typeof window !== 'undefined' ? (window as any).__PROJECT_CONTEXT__?.selectedProjectId : null);
  const query = useQuery<PaginatedTasksResponse, Error>({
    // CRITICAL: Use page-based cache keys like gallery
    queryKey: [TASKS_QUERY_KEY, 'paginated', effectiveProjectId, page, limit, status],
    queryFn: async (queryContext) => {
      const startTime = Date.now();
      const queryId = `query-${startTime}-${Math.random().toString(36).slice(2, 8)}`;
      
      // [TasksPaneCountMismatch] Log function entry params to catch limit corruption
      ,
        timestamp: Date.now()
      });
      
      ,
        queryContextMessage: 'EXECUTING DATABASE QUERY',
        cacheKey: [TASKS_QUERY_KEY, 'paginated', projectId, page, limit, status].join(':')
      });
      
      if (!effectiveProjectId) {
        return { tasks: [], total: 0, hasMore: false, totalPages: 0 }; 
      }
      
      // GALLERY PATTERN: Get count and data separately, efficiently
      // Always get accurate count - the approximation was causing 10x multiplication bug
      const shouldSkipCount = false;
      
      // 1. Get total count with lightweight query (skip if fast polling likely)
      let countQuery = supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', effectiveProjectId)
        .is('params->orchestrator_task_id_ref', null); // Only parent tasks

      if (status && status.length > 0) {
        countQuery = countQuery.in('status', status);
      }

      // 2. Get paginated data with proper database pagination
      // Strategy: Use database pagination for most cases, only fetch extra for Processing status that needs sorting
      const needsCustomSorting = status?.some(s => s === TASK_STATUS.QUEUED || s === TASK_STATUS.IN_PROGRESS);
      
      let dataQuery = supabase
        .from('tasks')
        .select('*')
        .eq('project_id', effectiveProjectId)
        .is('params->orchestrator_task_id_ref', null); // Only parent tasks

      // For Succeeded view, order by completion time (most recent first)
      const succeededOnly = status && status.length === 1 && status[0] === TASK_STATUS.COMPLETE;
      if (succeededOnly) {
        dataQuery = dataQuery
          .order('generation_processed_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }); // tie-breaker
      } else {
        // Default DB ordering; Processing will use client-side custom sort
        dataQuery = dataQuery.order('created_at', { ascending: false });
      }

      if (status && status.length > 0) {
        dataQuery = dataQuery.in('status', status);
      }

      if (needsCustomSorting) {
        // For Processing tasks: Use progressive loading strategy
        // Start with a reasonable chunk size, expand if needed for first page
        const effectiveBaseLimit = Math.max(limit, PAGINATION_CONFIG.DEFAULT_LIMIT);
        let fetchLimit;
        
        if (page === 1) {
          // First page: fetch more to get a good sample for sorting, but cap it reasonably
          fetchLimit = Math.min(effectiveBaseLimit * PAGINATION_CONFIG.PROCESSING_FETCH_MULTIPLIER, PAGINATION_CONFIG.PROCESSING_MAX_FETCH);
        } else {
          // Subsequent pages: use standard pagination since first page established sort order
          fetchLimit = effectiveBaseLimit;
        }
        
        if (effectiveBaseLimit !== limit) {
          console.warn('[TasksPaneCountMismatch]', {
            context: 'usePaginatedTasks:limit-override-for-processing',
            projectId,
            page,
            receivedLimit: limit,
            effectiveBaseLimit,
            fetchLimit,
            strategy: page === 1 ? 'first-page-expanded' : 'standard-pagination',
            reason: 'Processing view progressive loading',
            timestamp: Date.now()
          });
        }
        dataQuery = dataQuery.limit(fetchLimit);
      } else {
        // For Succeeded/Failed: use proper database pagination - no client sorting needed
        dataQuery = dataQuery.range(offset, offset + limit - 1);
      }

      // Execute queries (skip count for fast polling scenarios)
      });
      
      const [countResult, { data, error: dataError }] = await Promise.all([
        shouldSkipCount ? Promise.resolve({ count: null, error: null }) : countQuery,
        dataQuery
      ]);
      
      const { count, error: countError } = countResult;
      
      });
      
      if (countError) {
        console.error('[TaskPollingDebug] Count query failed:', {
          projectId,
          page,
          error: countError,
          timestamp: Date.now()
        });
        throw countError;
      }
      if (dataError) {
        console.error('[TaskPollingDebug] Data query failed:', {
          projectId,
          page,
          error: dataError,
          timestamp: Date.now()
        });
        throw dataError;
      }
      
      // Apply client-side filtering and sorting
      const allTasks = (data || []).map(mapDbTaskToTask);
      const visibleTasks = filterVisibleTasks(allTasks);
      // [TasksPaneCountMismatch] Visibility breakdown to detect mismatches between counts and list
      try {
        const hiddenTasks = allTasks.filter(t => !isTaskVisible(t.taskType));
        const processingVisible = visibleTasks.filter(t => t.status === TASK_STATUS.QUEUED || t.status === TASK_STATUS.IN_PROGRESS);
        const processingVisibleOrchestrators = processingVisible.filter(t => t.taskType.includes('orchestrator'));
        const processingVisibleNonOrchestrators = processingVisible.filter(t => !t.taskType.includes('orchestrator'));
        .map(t => ({ id: t.id, taskType: t.taskType, status: t.status })),
          processingVisibleCount: processingVisible.length,
          processingVisibleOrchestratorsCount: processingVisibleOrchestrators.length,
          processingVisibleNonOrchestratorsCount: processingVisibleNonOrchestrators.length,
          timestamp: Date.now()
        });
      } catch (e) {
        console.warn('[TasksPaneCountMismatch]', { context: 'usePaginatedTasks:visibility-breakdown:log-error', message: (e as Error)?.message });
      }
      
      let paginatedTasks: typeof allTasks;
      
      if (needsCustomSorting) {
        // In Progress first, then Queued; within each, oldest to newest by created_at
        const sortedTasks = visibleTasks.sort((a, b) => {
          const getStatusPriority = (status: string) => {
            switch (status) {
              case TASK_STATUS.IN_PROGRESS: return 1;
              case TASK_STATUS.QUEUED: return 2;
              default: return 3;
            }
          };
          const aPriority = getStatusPriority(a.status);
          const bPriority = getStatusPriority(b.status);
          if (aPriority !== bPriority) {
            return aPriority - bPriority; // lower is higher priority
          }
          const aDate = new Date(a.createdAt || 0);
          const bDate = new Date(b.createdAt || 0);
          return aDate.getTime() - bDate.getTime(); // oldest first
        });
        paginatedTasks = sortedTasks.slice(offset, offset + limit);
      } else {
        // For Succeeded/Failed: data is already paginated by database
        paginatedTasks = visibleTasks;
      }
      
      // CRITICAL DEBUGGING: Track pagination math issues
      / limit),
        fetchLimit: needsCustomSorting ? Math.min(limit * PAGINATION_CONFIG.PROCESSING_FETCH_MULTIPLIER, PAGINATION_CONFIG.PROCESSING_MAX_FETCH) : limit,
        FIXED_PAGINATION: !needsCustomSorting || (needsCustomSorting && offset < visibleTasks.length),
        timestamp: Date.now()
      });
      
      // Debug log to verify sorting is working (throttled to prevent spam)
      if (paginatedTasks.length > 0 && Math.random() < 0.1) { // Only log 10% of the time
        const statusCounts = paginatedTasks.reduce((acc, task) => {
          acc[task.status] = (acc[task.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        });
      }
      
      // Use approximation when count is skipped during fast polling
      // For Processing tasks, use a more reasonable approximation based on current page
      const total = count !== null ? count : Math.max(paginatedTasks.length, offset + paginatedTasks.length);
      const totalPages = Math.ceil(total / limit);
      const hasMore = count !== null ? offset + limit < total : paginatedTasks.length >= limit;

      const result = {
        tasks: paginatedTasks,
        total,
        hasMore,
        totalPages,
      };

      // [TasksPaneCountMismatch] Final payload summary for potential mismatch detection
      try {
        .length,
          processingReturnedTypesSample: result.tasks
            .filter(t => t.status === TASK_STATUS.QUEUED || t.status === TASK_STATUS.IN_PROGRESS)
            .slice(0, 5)
            .map(t => ({ id: t.id, taskType: t.taskType })),
          timestamp: Date.now()
        });
      } catch {}

      => {
          acc[task.status] = (acc[task.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        timestamp: Date.now()
      });

      return result;
    },
    enabled: !!effectiveProjectId,
    // CRITICAL: Gallery cache settings - prevent background refetches
    // Keep previous page's data visible during refetches to avoid UI blanks
    placeholderData: (previousData: PaginatedTasksResponse | undefined) => previousData,
    gcTime: 5 * 60 * 1000, // 5 minutes  
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true // Enable background polling
  });
  
  // [TasksPaneCountMismatch] CRITICAL DEBUG: Log the actual query state to catch cache/stale issues
  const queryDebugInfo = {
    context: 'usePaginatedTasks:query-state-debug',
    projectId,
    page,
    limit,
    status,
    queryEnabled: !!projectId,
    queryStatus: query.status,
    queryFetchStatus: query.fetchStatus,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isStale,
    isError: query.isError,
    hasData: !!query.data,
    dataTasksCount: query.data?.tasks ? query.data.tasks.length : 0,
    dataAge: query.dataUpdatedAt ? Math.round((Date.now() - query.dataUpdatedAt) / 1000) + 's' : 'never',
    errorMessage: query.error?.message,
    cacheKey: [TASKS_QUERY_KEY, 'paginated', projectId, page, limit, status].join(':'),
    timestamp: Date.now()
  };
  
  // NUCLEAR OPTION: Force refetch if query has data but no tasks for Processing view
  // SAFETY: Only trigger if data is genuinely stale (older than 30 seconds) to prevent infinite loops
  const isProcessingFilter = status && status.includes('Queued') && status.includes('In Progress');
  const hasStaleEmptyData = query.data && query.data.tasks && query.data.tasks.length === 0 && !query.isFetching;
  const dataAge = query.dataUpdatedAt ? Date.now() - query.dataUpdatedAt : Infinity;
  const isDataStale = dataAge > 30000; // 30 seconds
  
  // Use React ref to prevent rapid refetches
  const lastRefetchRef = React.useRef<number>(0);
  const timeSinceLastRefetch = Date.now() - lastRefetchRef.current;
  const canRefetch = timeSinceLastRefetch > 10000; // 10 seconds minimum between refetches
  
  // When backgrounded, dampen nuclear refetches to avoid thrash under timer clamping
  const isHidden = typeof document !== 'undefined' ? document.hidden : false;
  const minBackoffMs = isHidden ? 60000 : 10000;
  const hiddenStaleThresholdMs = isHidden ? 60000 : 30000;
  const meetsStaleThreshold = dataAge > hiddenStaleThresholdMs;

  if (isProcessingFilter && hasStaleEmptyData && query.status === 'success' && meetsStaleThreshold && timeSinceLastRefetch > minBackoffMs) {
    console.warn('[TasksPaneCountMismatch] NUCLEAR REFETCH: Processing query has empty data but is marked success!', {
      queryDebugInfo,
      forcingRefetch: true,
      reason: 'Processing filter with empty data should refetch',
      dataAge: Math.round(dataAge / 1000) + 's',
      timeSinceLastRefetch: Math.round(timeSinceLastRefetch / 1000) + 's',
      isHidden,
      thresholds: { minBackoffMs, hiddenStaleThresholdMs },
      timestamp: Date.now()
    });
    
    lastRefetchRef.current = Date.now();
    // Force immediate refetch
    query.refetch();
  }
  
  return query;
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
      }] [useCancelTask] Task cancelled, emitting domain event for projectId:`, projectId);
      // Task cancellation event is now handled by DataFreshnessManager via realtime events
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
      }] [useCancelPendingTasks] Tasks cancelled, emitting batch domain event for projectId:`, projectId);
      // Task batch cancellation event is now handled by DataFreshnessManager via realtime events
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
  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(['task-status-counts', projectId]);

  return useQuery({
    queryKey: ['task-status-counts', projectId],
    queryFn: async () => {
      // [TasksPaneCountMismatch] Note on counting rules for correlation with list visibility
      });
      ,
        queryContextMessage: 'EXECUTING DATABASE QUERY'
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
          .is('params->orchestrator_task_id_ref', null), // Only parent tasks; include orchestrators
          
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
      
      // [TasksPaneCountMismatch] Result snapshot to compare with list view
      });

      });
      
      return result;
    },
    enabled: !!projectId,
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Enable background polling like the gallery
  });
}; 