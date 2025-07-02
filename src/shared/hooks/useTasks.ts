import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Task, TaskStatus } from '@/types/tasks'; // Assuming Task and TaskStatus types will be defined here or imported appropriately
import { useProject } from "@/shared/contexts/ProjectContext"; // To get selectedProjectId
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/api';
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

// Fetch tasks from the API
const fetchTasks = async ({ projectId, status }: ListTasksParams): Promise<Task[]> => {
  const params = new URLSearchParams();
  if (projectId) params.append('projectId', projectId);
  if (status?.length) {
    status.forEach(s => params.append('status[]', s));
  }
  
  const response = await fetchWithAuth(`/api/tasks?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  return response.json();
};

// Create a new task
const createTask = async ({ projectId, taskType, params }: CreateTaskParams): Promise<Task> => {
  const response = await fetchWithAuth('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, taskType, params }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create task');
  }
  
  return response.json();
};

// Cancel a task
const cancelTask = async (taskId: string): Promise<void> => {
  const response = await fetchWithAuth(`/api/tasks/${taskId}/cancel`, {
    method: 'PATCH',
  });
  
  if (!response.ok) {
    throw new Error('Failed to cancel task');
  }
};

// Update task status
const updateTaskStatus = async ({ taskId, status }: UpdateTaskStatusParams): Promise<void> => {
  const response = await fetchWithAuth(`/api/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update task status');
  }
};

// Cancel all pending tasks
const cancelAllPendingTasks = async (projectId: string): Promise<void> => {
  const response = await fetchWithAuth('/api/tasks/cancel-pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to cancel pending tasks');
  }
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
      
      const queryParams = new URLSearchParams();
      queryParams.append('projectId', projectId);
      if (status && status.length > 0) {
        status.forEach(s => queryParams.append('status[]', s));
      }
      
      // Edge Functions receive query params as part of the URL
      const { data, error } = await supabase.functions.invoke('tasks-list', {
        body: {
          projectId,
          status: status || []
        }
      });
      
      if (error) throw error;
      return data || [];
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
  
  return useMutation<void, Error, string>({
    mutationFn: async (taskId) => {
      await cancelTask(taskId);
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

// Hook to cancel all PENDING tasks for a project
// Note: The backend sets the status to "Failed" now.
export const useCancelAllPendingTasks = () => {
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProject(); // To invalidate queries for the current project

  return useMutation<CancelAllPendingTasksResponse, Error, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      if (!projectId) {
        throw new Error("Project ID is required to cancel all pending tasks.");
      }
      await cancelAllPendingTasks(projectId);
      return { message: 'All pending tasks cancelled', cancelledCount: 0 };
    },
    onSuccess: (data) => {
      // Invalidate and refetch tasks list for the current project to reflect the changes
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, selectedProjectId, ['Queued']] });
      queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, selectedProjectId, ['Cancelled']] });
    },
    onError: (error) => {
      console.error('Cancel-All error:', error);
    },
  });
}; 