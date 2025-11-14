import React, { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';

/**
 * Project-wide generation modes cache
 * Fetches all shot generation modes for a project in a single query
 */
class ProjectGenerationModesCache {
  private cache = new Map<string, Map<string, 'batch' | 'timeline'>>(); // projectId -> shotId -> generationMode
  
  getProjectModes(projectId: string): Map<string, 'batch' | 'timeline'> | null {
    return this.cache.get(projectId) || null;
  }
  
  getShotMode(projectId: string, shotId: string): 'batch' | 'timeline' | null {
    const projectModes = this.cache.get(projectId);
    if (!projectModes) return null;
    const value = projectModes.get(shotId);
    return value !== undefined ? value : null;
  }
  
  setProjectModes(projectId: string, modes: Map<string, 'batch' | 'timeline'>): void {
    this.cache.set(projectId, modes);
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
const globalProjectGenerationModesCache = new ProjectGenerationModesCache();

/**
 * Fetch all shot generation modes for a project
 */
async function fetchProjectGenerationModesFromDB(projectId: string): Promise<Map<string, 'batch' | 'timeline'>> {
  console.log('[ProjectGenerationModesCache] Fetching all shot generation modes for project:', projectId);
  
  const { data, error } = await supabase
    .from('shots')
    .select('id, settings')
    .eq('project_id', projectId);
  
  if (error) {
    console.error('[ProjectGenerationModesCache] Error fetching shot settings:', error);
    throw error;
  }
  
  const modes = new Map<string, 'batch' | 'timeline'>();
  data?.forEach(shot => {
    // Extract generation mode from settings JSON
    // Settings structure: { "travel-between-images": { "generationMode": "batch" | "timeline" } }
    const toolSettings = (shot.settings as any)?.['travel-between-images'];
    const generationMode = toolSettings?.generationMode as 'batch' | 'timeline' | 'by-pair' | undefined;
    
    // Default to batch if not set, and convert 'by-pair' to 'batch'
    const effectiveMode: 'batch' | 'timeline' = 
      generationMode === 'timeline' ? 'timeline' : 'batch';
    
    modes.set(shot.id, effectiveMode);
  });
  
  console.log('[ProjectGenerationModesCache] Fetched generation modes:', {
    projectId,
    shotCount: modes.size,
    batchCount: Array.from(modes.values()).filter(m => m === 'batch').length,
    timelineCount: Array.from(modes.values()).filter(m => m === 'timeline').length,
    modeBreakdown: Object.fromEntries(
      Array.from(modes.entries()).map(([shotId, mode]) => [shotId.substring(0, 8), mode])
    ),
    timestamp: Date.now()
  });
  
  return modes;
}

/**
 * Hook to fetch and cache all shot generation modes for a project
 * Provides instant access to any shot's generation mode within the project
 */
export function useProjectGenerationModesCache(projectId: string | null) {
  const cacheRef = useRef(globalProjectGenerationModesCache);
  
  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(['project-generation-modes', projectId]);
  
  // Query to fetch all shot generation modes for the project
  const { data: projectModes, isLoading, error, refetch } = useQuery<Map<string, 'batch' | 'timeline'>>({
    queryKey: ['project-generation-modes', projectId],
    queryFn: () => fetchProjectGenerationModesFromDB(projectId!),
    enabled: !!projectId,
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Keep showing previous data while refetching
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Enable background polling
  });
  
  // Update cache when data changes
  React.useEffect(() => {
    if (projectModes && projectId) {
      cacheRef.current.setProjectModes(projectId, projectModes);
    }
  }, [projectModes, projectId]);
  
  const getShotGenerationMode = useCallback((shotId: string | null, isMobile: boolean = false): 'batch' | 'timeline' | null => {
    // Mobile always uses batch mode
    if (isMobile) {
      return 'batch';
    }
    
    if (!projectId || !shotId) return null;
    
    // First try cache
    const cachedMode = cacheRef.current.getShotMode(projectId, shotId);
    if (cachedMode !== null) {
      return cachedMode;
    }
    
    // Then try current query data
    if (projectModes) {
      const value = projectModes.get(shotId);
      return value !== undefined ? value : null;
    }
    
    return null;
  }, [projectId, projectModes]);
  
  const getAllShotModes = useCallback((): Map<string, 'batch' | 'timeline'> | null => {
    if (!projectId) return null;
    
    // First try cache
    const cachedModes = cacheRef.current.getProjectModes(projectId);
    if (cachedModes) {
      return cachedModes;
    }
    
    // Then try current query data
    return projectModes || null;
  }, [projectId, projectModes]);
  
  const clearCache = useCallback((): void => {
    cacheRef.current.clear();
    console.log('[ProjectGenerationModesCache] Cleared all cached project generation modes');
  }, []);
  
  const deleteProjectCache = useCallback((projectId: string | null): void => {
    if (!projectId) return;
    cacheRef.current.deleteProject(projectId);
    console.log('[ProjectGenerationModesCache] Deleted cached modes for project:', projectId);
  }, []);
  
  // Debug function to log cache state
  const logCacheState = useCallback((): void => {
    console.log('[ProjectGenerationModesCache] Current cache state:', {
      size: cacheRef.current.size(),
      cachedProjectIds: cacheRef.current.getCachedProjectIds(),
      currentProjectModes: projectId ? getAllShotModes() : null,
      timestamp: Date.now()
    });
  }, [projectId, getAllShotModes]);
  
  // Optimistically update a single shot's mode in cache
  const updateShotMode = useCallback((shotId: string | null, mode: 'batch' | 'timeline') => {
    if (!projectId || !shotId) return;
    
    console.log('[ProjectGenerationModesCache] 🎯 Optimistically updating shot mode:', {
      shotId: shotId.substring(0, 8),
      newMode: mode,
      timestamp: Date.now()
    });
    
    // Update in-memory cache immediately
    const currentModes = cacheRef.current.getProjectModes(projectId);
    if (currentModes) {
      currentModes.set(shotId, mode);
      cacheRef.current.setProjectModes(projectId, currentModes);
    }
    
    // Also update React Query cache if it exists
    if (projectModes) {
      const updatedModes = new Map(projectModes);
      updatedModes.set(shotId, mode);
      // Note: We don't force a refetch here - let it happen naturally via polling
    }
  }, [projectId, projectModes]);
  
  // Invalidate cache when mode changes (for manual refresh if needed)
  const invalidateOnModeChange = useCallback(() => {
    if (projectId) {
      cacheRef.current.deleteProject(projectId);
      refetch();
      console.log('[ProjectGenerationModesCache] Invalidated cache due to mode change for project:', projectId);
    }
  }, [projectId, refetch]);

  return {
    getShotGenerationMode,
    getAllShotModes,
    updateShotMode,
    isLoading,
    error,
    refetch,
    clearCache,
    deleteProjectCache,
    invalidateOnModeChange,
    logCacheState
  };
}

