import React, { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Project-wide video counts cache
 * Fetches all shot video counts for a project in a single query
 */
class ProjectVideoCountsCache {
  private cache = new Map<string, Map<string, number>>(); // projectId -> shotId -> videoCount
  
  getProjectCounts(projectId: string): Map<string, number> | null {
    return this.cache.get(projectId) || null;
  }
  
  getShotCount(projectId: string, shotId: string): number | null {
    const projectCounts = this.cache.get(projectId);
    if (!projectCounts) return null;
    const value = projectCounts.get(shotId);
    return value !== undefined ? value : null;
  }
  
  setProjectCounts(projectId: string, counts: Map<string, number>): void {
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
async function fetchProjectVideoCountsFromDB(projectId: string): Promise<Map<string, number>> {
  console.log('[ProjectVideoCountsCache] Fetching all shot video counts for project:', projectId);
  
  const { data, error } = await supabase
    .from('shot_statistics')
    .select('shot_id, video_count')
    .eq('project_id', projectId);
  
  if (error) {
    console.error('[ProjectVideoCountsCache] Error fetching shot statistics:', error);
    throw error;
  }
  
  const counts = new Map<string, number>();
  data?.forEach(row => {
    counts.set(row.shot_id, row.video_count || 0);
  });
  
  console.log('[ProjectVideoCountsCache] Fetched video counts:', {
    projectId,
    shotCount: counts.size,
    totalVideos: Array.from(counts.values()).reduce((sum, count) => sum + count, 0),
    shotBreakdown: Object.fromEntries(counts),
    timestamp: Date.now()
  });
  
  return counts;
}

/**
 * Hook to fetch and cache all shot video counts for a project
 * Provides instant access to any shot's video count within the project
 */
export function useProjectVideoCountsCache(projectId: string | null) {
  const cacheRef = useRef(globalProjectVideoCountsCache);
  
  // Query to fetch all shot video counts for the project
  const { data: projectCounts, isLoading, error, refetch } = useQuery<Map<string, number>>({
    queryKey: ['project-video-counts', projectId],
    queryFn: () => fetchProjectVideoCountsFromDB(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes - very aggressive caching for instant loads
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 60 * 1000, // Check for updates every minute
    refetchIntervalInBackground: false, // Only when tab is active
    placeholderData: (previousData) => previousData, // Keep showing previous data while refetching
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
    const cachedCount = cacheRef.current.getShotCount(projectId, shotId);
    if (cachedCount !== null) {
      return cachedCount;
    }
    
    // Then try current query data
    if (projectCounts) {
      const value = projectCounts.get(shotId);
      return value !== undefined ? value : null;
    }
    
    return null;
  }, [projectId, projectCounts]);
  
  const getAllShotCounts = useCallback((): Map<string, number> | null => {
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
