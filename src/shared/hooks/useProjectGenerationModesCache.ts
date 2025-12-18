import React, { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { 
  resolveGenerationMode, 
  extractToolSettings,
  type GenerationModeNormalized 
} from '@/shared/lib/settingsResolution';

/**
 * Project-wide generation modes cache
 * Fetches all shot generation modes for a project in a single query
 */
class ProjectGenerationModesCache {
  private cache = new Map<string, Map<string, GenerationModeNormalized>>(); // projectId -> shotId -> generationMode
  
  getProjectModes(projectId: string): Map<string, GenerationModeNormalized> | null {
    return this.cache.get(projectId) || null;
  }
  
  getShotMode(projectId: string, shotId: string): GenerationModeNormalized | null {
    const projectModes = this.cache.get(projectId);
    if (!projectModes) return null;
    const value = projectModes.get(shotId);
    return value !== undefined ? value : null;
  }
  
  setProjectModes(projectId: string, modes: Map<string, GenerationModeNormalized>): void {
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
async function fetchProjectGenerationModesFromDB(projectId: string): Promise<Map<string, GenerationModeNormalized>> {
  console.log('[ProjectGenerationModesCache] Fetching all shot generation modes for project:', projectId);
  
  // IMPORTANT:
  // This cache must match the effective settings resolution used by `useToolSettings`:
  // defaults → user → project → shot.
  //
  // If we only look at shots.settings, we will be wrong for shots that inherit
  // generationMode from user/project defaults.
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id ?? null;

  const [userResult, projectResult, shotsResult] = await Promise.all([
    userId
      ? supabase.from('users').select('settings').eq('id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    supabase.from('projects').select('settings').eq('id', projectId).maybeSingle(),
    supabase.from('shots').select('id, settings').eq('project_id', projectId),
  ]);

  if (userResult.error && !userResult.error.message?.includes('No rows found')) {
    console.warn('[ProjectGenerationModesCache] Error fetching user settings:', userResult.error);
  }
  if (projectResult.error && !projectResult.error.message?.includes('No rows found')) {
    console.warn('[ProjectGenerationModesCache] Error fetching project settings:', projectResult.error);
  }
  if (shotsResult.error) {
    console.error('[ProjectGenerationModesCache] Error fetching shot settings:', shotsResult.error);
    throw shotsResult.error;
  }

  const toolId = 'travel-between-images';
  const userToolSettings = extractToolSettings(userResult.data?.settings, toolId);
  const projectToolSettings = extractToolSettings(projectResult.data?.settings, toolId);

  const modes = new Map<string, GenerationModeNormalized>();
  (shotsResult.data || []).forEach((shot: any) => {
    const shotToolSettings = extractToolSettings(shot.settings, toolId);

    // Use shared resolution logic (priority: shot → project → user → defaults)
    // defaults to 'timeline' via normalizeGenerationMode
    const effectiveMode = resolveGenerationMode({
      shot: shotToolSettings,
      project: projectToolSettings,
      user: userToolSettings,
      // defaults not needed - normalizeGenerationMode handles undefined → 'timeline'
    });
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
  const queryClient = useQueryClient();
  
  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(['project-generation-modes', projectId]);
  
  // Query to fetch all shot generation modes for the project
  const { data: projectModes, isLoading, error, refetch } = useQuery<Map<string, GenerationModeNormalized>>({
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
  
  const getShotGenerationMode = useCallback((shotId: string | null, isMobile: boolean = false): GenerationModeNormalized | null => {
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
  
  const getAllShotModes = useCallback((): Map<string, GenerationModeNormalized> | null => {
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
  const updateShotMode = useCallback((shotId: string | null, mode: GenerationModeNormalized) => {
    if (!projectId || !shotId) return;
    
    console.log('[ProjectGenerationModesCache] 🎯 Optimistically updating shot mode:',
      'shotId:', shotId.substring(0, 8),
      '| newMode:', mode);
    
    // Update in-memory cache immediately
    const currentModes = cacheRef.current.getProjectModes(projectId);
    if (currentModes) {
      currentModes.set(shotId, mode);
      cacheRef.current.setProjectModes(projectId, currentModes);
    }
    
    // CRITICAL: Also update React Query cache so it persists across re-renders
    // The previous code created updatedModes but never saved it!
    queryClient.setQueryData<Map<string, GenerationModeNormalized>>(
      ['project-generation-modes', projectId],
      (oldData) => {
        if (!oldData) return oldData;
        const newData = new Map(oldData);
        newData.set(shotId, mode);
        return newData;
      }
    );
  }, [projectId, queryClient]);
  
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

