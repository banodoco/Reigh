import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TaskWithCost {
  id: string;
  taskType: string;
  status: string;
  createdAt: string;
  generationStartedAt?: string;
  generationProcessedAt?: string;
  projectId: string;
  cost?: number; // from credits_ledger
  duration?: number; // calculated from start/end times
  projectName?: string; // from projects table
}

interface TaskLogResponse {
  tasks: TaskWithCost[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
    currentPage: number;
  };
  availableFilters: {
    taskTypes: string[];
    projects: { id: string; name: string }[];
    statuses: string[];
  };
}

interface TaskLogFilters {
  costFilter?: 'all' | 'free' | 'paid';
  status?: string[];
  taskTypes?: string[];
  projectIds?: string[];
}

export function useTaskLog(
  limit: number = 20, 
  page: number = 1, 
  filters: TaskLogFilters = {}
) {
  const offset = (page - 1) * limit;
  
  return useQuery<TaskLogResponse, Error>({
    queryKey: ['task-log', limit, page, filters],
    placeholderData: (previousData) => previousData, // Prevents table from disappearing during filter changes
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Authentication required');
      }

      // First get user's projects to filter tasks
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', user.id);

      if (!projects || projects.length === 0) {
        return {
          tasks: [],
          pagination: { 
            limit, 
            offset, 
            total: 0, 
            hasMore: false, 
            totalPages: 0,
            currentPage: page 
          },
          availableFilters: {
            taskTypes: [],
            projects: [],
            statuses: []
          }
        };
      }

      const projectIds = projects.map(p => p.id);
      const projectLookup = Object.fromEntries(projects.map(p => [p.id, p.name]));

      // Build query with filters
      let query = supabase
        .from('tasks')
        .select('*', { count: 'exact' })
        .in('project_id', projectIds)
        // Only show parent orchestrator tasks, not sub-tasks
        .is('params->orchestrator_task_id_ref', null);

      // Apply status filter
      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      // Apply task type filter
      if (filters.taskTypes && filters.taskTypes.length > 0) {
        query = query.in('task_type', filters.taskTypes);
      }

      // Apply project filter
      if (filters.projectIds && filters.projectIds.length > 0) {
        query = query.in('project_id', filters.projectIds);
      }

      const { data: tasksData, error: tasksError, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (tasksError) {
        throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
      }

      // Get cost information for these tasks
      const taskIds = tasksData?.map(task => task.id) || [];
      let costsData: any[] = [];
      
      if (taskIds.length > 0) {
        const { data: costs } = await supabase
          .from('credits_ledger')
          .select('task_id, amount, created_at')
          .in('task_id', taskIds)
          .eq('type', 'spend');

        costsData = costs || [];
      }

      // Combine tasks with cost information
      let tasks: TaskWithCost[] = (tasksData || []).map(task => {
        const costEntry = costsData.find(cost => cost.task_id === task.id);
        let duration: number | undefined;
        
        // Calculate duration if both timestamps exist
        if (task.generation_started_at && task.generation_processed_at) {
          const start = new Date(task.generation_started_at);
          const end = new Date(task.generation_processed_at);
          duration = Math.ceil((end.getTime() - start.getTime()) / 1000); // in seconds
        }

        return {
          id: task.id,
          taskType: task.task_type,
          status: task.status,
          createdAt: task.created_at,
          generationStartedAt: task.generation_started_at,
          generationProcessedAt: task.generation_processed_at,
          projectId: task.project_id,
          projectName: projectLookup[task.project_id] || 'Unknown Project',
          cost: costEntry ? Math.abs(costEntry.amount) : undefined,
          duration,
        };
      });

      // Apply cost filter (client-side since it depends on joined data)
      if (filters.costFilter === 'free') {
        tasks = tasks.filter(task => !task.cost || task.cost === 0);
      } else if (filters.costFilter === 'paid') {
        tasks = tasks.filter(task => task.cost && task.cost > 0);
      }

      // Get available filter options (for all user tasks, not just current page)
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('task_type, status, project_id')
        .in('project_id', projectIds);

      const availableFilters = {
        taskTypes: [...new Set((allTasks || []).map(t => t.task_type))].sort(),
        projects: projects,
        statuses: [...new Set((allTasks || []).map(t => t.status))].sort()
      };

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);
      const hasMore = page < totalPages;

      return {
        tasks,
        pagination: {
          limit,
          offset,
          total,
          hasMore,
          totalPages,
          currentPage: page,
        },
        availableFilters
      };
    },
  });
} 