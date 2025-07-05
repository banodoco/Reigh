import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchToolSettings } from './useToolSettings';

// Central list of tool IDs we want to preload. Update when you add more tools.
const TOOL_IDS = [
  'image-generation',
  'travel-between-images',
  'edit-travel',
];

/**
 * Prefetch tool settings for a project (and optionally its shots) so that
 * individual pages can hydrate synchronously from React-Query cache.
 *
 * @param projectId selected project id
 * @param shotIds  array of shot ids belonging to the project (optional)
 */
export function usePrefetchToolSettings(projectId?: string | null, shotIds: string[] = []) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;

    // Prefetch project-level settings for each tool.
    TOOL_IDS.forEach((toolId) => {
      queryClient.prefetchQuery({
        queryKey: ['toolSettings', toolId, projectId, undefined],
        queryFn: () => fetchToolSettings(toolId, { projectId }),
        staleTime: 5 * 60 * 1000, // keep fresh for 5 min (same as useToolSettings)
      });
    });

    // Prefetch shot-level settings when shot IDs are provided.
    if (shotIds.length) {
      shotIds.forEach((shotId) => {
        TOOL_IDS.forEach((toolId) => {
          queryClient.prefetchQuery({
            queryKey: ['toolSettings', toolId, projectId, shotId],
            queryFn: () => fetchToolSettings(toolId, { projectId, shotId }),
            staleTime: 5 * 60 * 1000,
          });
        });
      });
    }
  }, [projectId, shotIds.join(','), queryClient]);
} 