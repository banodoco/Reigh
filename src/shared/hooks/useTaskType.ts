import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TaskTypeInfo {
  id: string;
  name: string;
  content_type: string | null;
  tool_type: string | null;
  display_name: string;
  category: string;
}

/**
 * Hook to fetch task type information including content_type
 * @param taskType - The task type name to look up
 * @returns Query result with task type information
 */
export const useTaskType = (taskType: string) => {
  return useQuery({
    queryKey: ['task-type', taskType],
    queryFn: async (): Promise<TaskTypeInfo | null> => {
      const { data, error } = await supabase
        .from('task_types')
        .select('id, name, content_type, tool_type, display_name, category')
        .eq('name', taskType)
        .maybeSingle();

      if (error) {
        console.warn(`Failed to fetch task type info for ${taskType}:`, error);
        return null;
      }

      return data;
    },
    enabled: !!taskType,
    staleTime: 5 * 60 * 1000, // 5 minutes - task types don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Hook to fetch multiple task types at once for better performance
 * @param taskTypes - Array of task type names to look up
 * @returns Query result with task type information map
 */
export const useTaskTypes = (taskTypes: string[]) => {
  return useQuery({
    queryKey: ['task-types', taskTypes.sort()], // Sort for consistent cache key
    queryFn: async (): Promise<Record<string, TaskTypeInfo>> => {
      if (taskTypes.length === 0) return {};

      const { data, error } = await supabase
        .from('task_types')
        .select('id, name, content_type, tool_type, display_name, category')
        .in('name', taskTypes);

      if (error) {
        console.warn('Failed to fetch task types info:', error);
        return {};
      }

      // Convert array to map for easy lookup
      return data.reduce((acc, taskType) => {
        acc[taskType.name] = taskType;
        return acc;
      }, {} as Record<string, TaskTypeInfo>);
    },
    enabled: taskTypes.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
