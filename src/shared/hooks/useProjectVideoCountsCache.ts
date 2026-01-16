import React, { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';

/** Counts stored per shot */
interface ShotCounts {
  videoCount: number;
  finalVideoCount: number;
}

/**
 * Project-wide video counts cache
 * Fetches all shot video counts for a project in a single query
 */
class ProjectVideoCountsCache {
  private cache = new Map<string, Map<string, ShotCounts>>(); // projectId -> shotId -> counts

  getProjectCounts(projectId: string): Map<string, ShotCounts> | null {
    return this.cache.get(projectId) || null;
  }

  getShotCounts(projectId: string, shotId: string): ShotCounts | null {
    const projectCounts = this.cache.get(projectId);
    if (!projectCounts) return null;
    return projectCounts.get(shotId) || null;
  }

  setProjectCounts(projectId: string, counts: Map<string, ShotCounts>): void {
    this.cache.set(projectId, counts);
  }

  clear(): void {
    this.cache.clear();
  }

  deleteProject(projectId: string): void {
    this.cache.delete(projectId);
  }

  // Get cache size for debugging
  size(): number {
    return this.cache.size;
  }

  // Get all cached project IDs for debugging
  getCachedProjectIds(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance that persists across component remounts
const globalProjectVideoCountsCache = new ProjectVideoCountsCache();

/**
 * Fetch all shot video counts for a project using shot_statistics view
 */
async function fetchProjectVideoCountsFromDB(projectId: string): Promise<Map<string, ShotCounts>> {
  const { data, error } = await supabase
    .from('shot_statistics')
    .select('shot_id, video_count, final_video_count')
    .eq('project_id', projectId);

  if (error) {
    console.error('[ProjectVideoCountsCache] Error fetching shot statistics:', error);
    throw error;
  }

  const counts = new Map<string, ShotCounts>();
  data?.forEach(row => {
    counts.set(row.shot_id, {
      videoCount: row.video_count || 0,
      finalVideoCount: row.final_video_count || 0,
    });
  });

  return counts;
}

/**
 * Hook to fetch and cache all shot video counts for a project
 * Provides instant access to any shot's video count within the project
 */
export function useProjectVideoCountsCache(projectId: string | null) {
  const cacheRef = useRef(globalProjectVideoCountsCache);

  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(['project-video-counts', projectId]);

  // Query to fetch all shot video counts for the project
  const { data: projectCounts, isLoading, error, refetch } = useQuery<Map<string, ShotCounts>>({
    queryKey: ['project-video-counts', projectId],
    queryFn: () => fetchProjectVideoCountsFromDB(projectId!),
    enabled: !!projectId,
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Keep showing previous data while refetching
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Enable background polling
  });

  // Update cache when data changes
  React.useEffect(() => {
    if (projectCounts && projectId) {
      cacheRef.current.setProjectCounts(projectId, projectCounts);
    }
  }, [projectCounts, projectId]);

  const getShotVideoCount = useCallback((shotId: string | null): number | null => {
    if (!projectId || !shotId) return null;

    // First try cache
    const cachedCounts = cacheRef.current.getShotCounts(projectId, shotId);
    if (cachedCounts !== null) {
      return cachedCounts.videoCount;
    }

    // Then try current query data
    if (projectCounts) {
      const counts = projectCounts.get(shotId);
      return counts !== undefined ? counts.videoCount : null;
    }

    return null;
  }, [projectId, projectCounts]);

  const getFinalVideoCount = useCallback((shotId: string | null): number | null => {
    if (!projectId || !shotId) return null;

    // First try cache
    const cachedCounts = cacheRef.current.getShotCounts(projectId, shotId);
    if (cachedCounts !== null) {
      return cachedCounts.finalVideoCount;
    }

    // Then try current query data
    if (projectCounts) {
      const counts = projectCounts.get(shotId);
      return counts !== undefined ? counts.finalVideoCount : null;
    }

    return null;
  }, [projectId, projectCounts]);

  const getAllShotCounts = useCallback((): Map<string, ShotCounts> | null => {
    if (!projectId) return null;

    // First try cache
    const cachedCounts = cacheRef.current.getProjectCounts(projectId);
    if (cachedCounts) {
      return cachedCounts;
    }

    // Then try current query data
    return projectCounts || null;
  }, [projectId, projectCounts]);
  
  const clearCache = useCallback((): void => {
    cacheRef.current.clear();
    console.log('[ProjectVideoCountsCache] Cleared all cached project video counts');
  }, []);
  
  const deleteProjectCache = useCallback((projectId: string | null): void => {
    if (!projectId) return;
    cacheRef.current.deleteProject(projectId);
    console.log('[ProjectVideoCountsCache] Deleted cached counts for project:', projectId);
  }, []);
  
  // Debug function to log cache state
  const logCacheState = useCallback((): void => {
    console.log('[ProjectVideoCountsCache] Current cache state:', {
      size: cacheRef.current.size(),
      cachedProjectIds: cacheRef.current.getCachedProjectIds(),
      currentProjectCounts: projectId ? getAllShotCounts() : null,
      timestamp: Date.now()
    });
  }, [projectId, getAllShotCounts]);
  
  // Invalidate cache when certain query keys change (video additions/deletions)
  const invalidateOnVideoChanges = useCallback(() => {
    if (projectId) {
      cacheRef.current.deleteProject(projectId);
      refetch();
      console.log('[ProjectVideoCountsCache] Invalidated cache due to video changes for project:', projectId);
    }
  }, [projectId, refetch]);

  return {
    getShotVideoCount,
    getFinalVideoCount,
    getAllShotCounts,
    isLoading,
    error,
    refetch,
    clearCache,
    deleteProjectCache,
    invalidateOnVideoChanges,
    logCacheState
  };
}
