import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskStatus } from '@/types/tasks';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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

interface UpdateTaskStatusParams {
  taskId: string;
  status: TaskStatus;
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

// Hook to create a task
export const useCreateTask = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (task: Partial<Task>) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          project_id: task.projectId,
          task_type: task.taskType,
          params: task.params || {},
          status: task.status || 'Queued',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] });
      toast.success('Task created successfully');
    },
    onError: (error: Error) => {
      console.error('Error creating task:', error);
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
      return (data || []).map(mapDbTaskToTask);
    },
    enabled: !!projectId, // Only run the query if projectId is available
  });
};

// Types for API responses and request bodies for cancel operations
interface CancelTaskResponse extends Task { }

interface CancelAllPendingTasksResponse {
  message: string;
  cancelledCount: number;
}

// Hook to cancel a task
export const useCancelTask = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ 
          status: 'Cancelled',
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
      toast.success('Task cancelled successfully');
    },
    onError: (error: Error) => {
      console.error('Error cancelling task:', error);
      toast.error(`Failed to cancel task: ${error.message}`);
    },
  });
};

// Hook to cancel pending tasks
export const useCancelPendingTasks = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ 
          status: 'Cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('project_id', projectId)
        .in('status', ['Queued', 'In Progress'])
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId] });
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId, ['Queued']] });
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, projectId, ['Cancelled']] });
      toast.success('Pending tasks cancelled successfully');
    },
    onError: (error: Error) => {
      console.error('Error cancelling pending tasks:', error);
      toast.error(`Failed to cancel pending tasks: ${error.message}`);
    },
  });
};

// Export alias for backward compatibility
export const useCancelAllPendingTasks = useCancelPendingTasks; 