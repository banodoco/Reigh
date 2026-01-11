/**
 * TaskTypeConfigInitializer
 * 
 * A component that initializes the task type config cache on app load.
 * Should be placed inside QueryClientProvider but early in the component tree.
 * 
 * This ensures the global cache is populated before any components need to
 * check task visibility synchronously.
 */

import { useEffect } from 'react';
import { useAllTaskTypesConfig } from '@/shared/hooks/useTaskType';

export const TaskTypeConfigInitializer: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  // This hook fetches all task types and populates the global cache
  const { isLoading, isError, error } = useAllTaskTypesConfig();

  useEffect(() => {
    if (isError && error) {
      console.warn('[TaskTypeConfigInitializer] Failed to load task type config:', error);
    }
  }, [isError, error]);

  // Don't block rendering - the hardcoded fallback will work until cache loads
  return <>{children}</>;
};

export default TaskTypeConfigInitializer;

