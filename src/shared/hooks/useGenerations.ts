import React from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useResurrectionPollingConfig, RecentActivityDetectors } from './useResurrectionPolling';
import { invalidationRouter } from '@/shared/lib/InvalidationRouter';
import { useQueryDebugLogging, QueryDebugConfigs } from './useQueryDebugLogging';

/**
 * Fetch generations using direct Supabase call with pagination support
 */
export async function fetchGenerations(
  projectId: string | null, 
  limit: number = 100, 
  offset: number = 0,
  filters?: {
    toolType?: string;
    mediaType?: 'all' | 'image' | 'video';
    shotId?: string;
    excludePositioned?: boolean;
    starredOnly?: boolean;
    searchTerm?: string;
  }
): Promise<{
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
}> {
  
  if (!projectId) {
    return { items: [], total: 0, hasMore: false };
  }
  
  // Build count query
  let countQuery = supabase
    .from('generations')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  // Apply server-side filters to count query
  if (filters?.toolType) {
    // Filter by tool type in metadata
    if (filters.toolType === 'image-generation') {
      // Filter by tool_type in params for image-generation
      countQuery = countQuery.eq('params->>tool_type', 'image-generation');
    } else {
      countQuery = countQuery.or(`params->>tool_type.eq.${filters.toolType},params->>tool_type.eq.${filters.toolType}-reconstructed-client`);
    }
  }

  if (filters?.mediaType && filters.mediaType !== 'all') {
    if (filters.mediaType === 'video') {
      countQuery = countQuery.like('type', '%video%');
    } else if (filters.mediaType === 'image') {
      countQuery = countQuery.not('type', 'like', '%video%');
    }
  }

  // Apply starred filter if provided
  if (filters?.starredOnly) {
    countQuery = countQuery.eq('starred', true);
  }

  // Apply search filter to count query
  if (filters?.searchTerm?.trim()) {
    // Search in the main prompt location first (most common)
    const searchPattern = `%${filters.searchTerm.trim()}%`;
    countQuery = countQuery.ilike('params->originalParams->orchestrator_details->>prompt', searchPattern);
  }

  // Apply shot filter if provided
  if (filters?.shotId) {
    // Get generation IDs associated with this shot
    const { data: shotGenerations, error: sgError } = await supabase
      .from('shot_generations')
      .select('generation_id, position')
      .eq('shot_id', filters.shotId);
    
    if (sgError) throw sgError;
    
    let generationIds = shotGenerations?.map(sg => sg.generation_id) || [];
    
    // Filter by position if excludePositioned is true
    if (filters.excludePositioned) {
      const unpositionedIds = shotGenerations
        ?.filter(sg => sg.position === null || sg.position === undefined)
        .map(sg => sg.generation_id) || [];
      generationIds = unpositionedIds;
    }
    
    if (generationIds.length > 0) {
      countQuery = countQuery.in('id', generationIds);
    } else {
      // No generations for this shot
      return { items: [], total: 0, hasMore: false };
    }
  }

  // 🚀 PERFORMANCE FIX: Skip expensive count query for small pages
  // DISABLED: Enable full count for accurate pagination
  const shouldSkipCount = false; // limit <= 100 && !filters?.searchTerm?.trim();
  
  let totalCount = 0;
  if (!shouldSkipCount) {
    const { count, error: countError } = await countQuery;
    if (countError) {
      throw countError;
    }
    totalCount = count || 0;
  } else {
  }

  // 🚀 PERFORMANCE FIX: Optimize query - select only needed fields
  let dataQuery = supabase
    .from('generations')
    .select(`
      id,
      location,
      thumbnail_url,
      type,
      created_at,
      params,
      starred,
      shot_generations(shot_id, position)
    `)
    .eq('project_id', projectId);

  // Apply same filters to data query
  if (filters?.toolType) {
    if (filters.toolType === 'image-generation') {
      // Filter by tool_type in params for image-generation
      dataQuery = dataQuery.eq('params->>tool_type', 'image-generation');
    } else {
      dataQuery = dataQuery.or(`params->>tool_type.eq.${filters.toolType},params->>tool_type.eq.${filters.toolType}-reconstructed-client`);
    }
  }

  if (filters?.mediaType && filters.mediaType !== 'all') {
    if (filters.mediaType === 'video') {
      dataQuery = dataQuery.like('type', '%video%');
    } else if (filters.mediaType === 'image') {
      dataQuery = dataQuery.not('type', 'like', '%video%');
    }
  }

  // Apply starred filter to data query
  if (filters?.starredOnly) {
    dataQuery = dataQuery.eq('starred', true);
  }

  // Apply search filter to data query
  if (filters?.searchTerm?.trim()) {
    // Search in the main prompt location first (most common)
    const searchPattern = `%${filters.searchTerm.trim()}%`;
    dataQuery = dataQuery.ilike('params->originalParams->orchestrator_details->>prompt', searchPattern);
  }

  // Apply shot filter to data query
  if (filters?.shotId) {
    // Get shot associations for filtering
    const { data: shotGenerations, error: sgError } = await supabase
      .from('shot_generations')
      .select('generation_id, position')
      .eq('shot_id', filters.shotId);
    
    if (sgError) throw sgError;
    
    let generationIds = shotGenerations?.map(sg => sg.generation_id) || [];
    
    // Filter by position if excludePositioned is true
    if (filters.excludePositioned) {
      const unpositionedIds = shotGenerations
        ?.filter(sg => sg.position === null || sg.position === undefined)
        .map(sg => sg.generation_id) || [];
      
      // Debug logging for excludePositioned filtering
      console.log('[ExcludePositionedDebug] Filtering shot generations:', {
        shotId: filters.shotId,
        excludePositioned: filters.excludePositioned,
        totalShotGenerations: shotGenerations?.length || 0,
        positionedCount: shotGenerations?.filter(sg => sg.position !== null && sg.position !== undefined).length || 0,
        unpositionedCount: unpositionedIds.length,
        unpositionedSample: unpositionedIds.slice(0, 3),
        allPositions: shotGenerations?.map(sg => ({ id: sg.generation_id, position: sg.position })).slice(0, 5)
      });
      
      generationIds = unpositionedIds;
    }
    
    if (generationIds.length > 0) {
      dataQuery = dataQuery.in('id', generationIds);
    } else {
      // No generations for this shot/filter combination
      return { items: [], total: 0, hasMore: false };
    }
  }

  // 🚀 PERFORMANCE FIX: Use limit+1 pattern for fast pagination when count is skipped
  const fetchLimit = shouldSkipCount ? limit + 1 : limit;
  
  const { data, error } = await dataQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + fetchLimit - 1);
  
  if (error) {
    throw error;
  }

  // Calculate hasMore and process results based on count strategy
  let finalData = data || [];
  let hasMore = false;
  
  if (shouldSkipCount) {
    // Fast pagination: detect hasMore by checking if we got limit+1 items
    hasMore = finalData.length > limit;
    if (hasMore) {
      finalData = finalData.slice(0, limit); // Remove the extra item
    }
    totalCount = offset + finalData.length + (hasMore ? 1 : 0); // Approximate total
  } else {
    hasMore = (offset + limit) < totalCount;
  }

  const items = finalData?.map((item: any) => {
    const baseItem = {
      id: item.id,
      url: item.location,
      thumbUrl: item.thumbnail_url || item.location, // Use thumbnail_url if available, fallback to main location
      prompt: item.params?.originalParams?.orchestrator_details?.prompt || 
              item.params?.prompt || 
              'No prompt',
      metadata: item.params || {},
      createdAt: item.created_at,
      isVideo: item.type?.includes('video'),
      starred: item.starred || false,
    };
    
    // Include shot association data from LEFT JOIN
    const shotGenerations = item.shot_generations || [];
    
    if (shotGenerations.length > 0) {
      // Optimize: Only create full associations array if there are multiple shots
      // For single shot, use simpler structure
      if (shotGenerations.length === 1) {
        const singleShot = shotGenerations[0];
        return {
          ...baseItem,
          shot_id: singleShot.shot_id,
          position: singleShot.position,
        };
      }
      
      // Multiple shots: include all associations for positioning checks
      const allAssociations = shotGenerations.map(sg => ({
        shot_id: sg.shot_id,
        position: sg.position
      }));
      
      // When filtering by specific shot, use that shot as primary
      let primaryShot = shotGenerations[0];
      if (filters?.shotId) {
        const matchingShot = shotGenerations.find(sg => sg.shot_id === filters.shotId);
        if (matchingShot) {
          primaryShot = matchingShot;
        }
      }
      
      return {
        ...baseItem,
        shot_id: primaryShot.shot_id,
        position: primaryShot.position,
        all_shot_associations: allAssociations,
      };
    }
    
    return baseItem;
  }) || [];


  return { items, total: totalCount, hasMore };
}

/**
 * Update generation location using direct Supabase call
 */
async function updateGenerationLocation(id: string, location: string): Promise<void> {
  const { error } = await supabase
    .from('generations')
    .update({ location })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update generation: ${error.message}`);
  }
}

// NOTE: getTaskIdForGeneration moved to generationTaskBridge.ts for centralization

/**
 * Create a new generation using direct Supabase call
 */
async function createGeneration(params: {
  imageUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  projectId: string;
  prompt: string;
}): Promise<any> {
  const { data, error } = await supabase
    .from('generations')
    .insert({
      location: params.imageUrl,
      type: params.fileType || 'image',
      project_id: params.projectId,
      params: {
        prompt: params.prompt,
        source: 'external_upload',
        original_filename: params.fileName,
        file_type: params.fileType,
        file_size: params.fileSize,
      },
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create generation: ${error?.message || 'Unknown error'}`);
  }

  return data;
}

/**
 * Star/unstar a generation using direct Supabase call
 */
async function toggleGenerationStar(id: string, starred: boolean): Promise<void> {
  const { error } = await supabase
    .from('generations')
    .update({ starred })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to ${starred ? 'star' : 'unstar'} generation: ${error.message}`);
  }
}

export type GenerationsPaginatedResponse = {
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
};

export function useGenerations(
  projectId: string | null, 
  page: number = 1, 
  limit: number = 100, 
  enabled: boolean = true,
  filters?: {
    toolType?: string;
    mediaType?: 'all' | 'image' | 'video';
    shotId?: string;
    excludePositioned?: boolean;
    starredOnly?: boolean;
    searchTerm?: string;
  }
) {
  const offset = (page - 1) * limit;
  const queryClient = useQueryClient();
  const effectiveProjectId = projectId ?? (typeof window !== 'undefined' ? (window as any).__PROJECT_CONTEXT__?.selectedProjectId : null);
  const queryKey = ['unified-generations', 'project', effectiveProjectId, page, limit, filters];


  // 🎯 MODULAR POLLING: Configure resurrection polling with ImageGallery-specific settings
  const { refetchInterval } = useResurrectionPollingConfig(
    'ImageGallery', // Debug tag matches original logs
    { projectId, page, filters }, // Context for logging
    {
      hasRecentActivity: RecentActivityDetectors.generations,
      fastInterval: 15000,        // 15s when recent generations exist
      resurrectionInterval: 45000, // 45s for stale data recovery  
      initialInterval: 30000,     // 30s when no data
      staleThreshold: 60000       // 1 minute = stale
    }
  );

  const result = useQuery<GenerationsPaginatedResponse, Error>({
    queryKey: queryKey,
    queryFn: () => fetchGenerations(effectiveProjectId, limit, offset, filters),
    enabled: !!effectiveProjectId && enabled,
    // Use `placeholderData` with `keepPreviousData` to prevent UI flashes on pagination/filter changes
    placeholderData: keepPreviousData,
    // Synchronously grab initial data from the cache on mount to prevent skeletons on revisit
    initialData: () => queryClient.getQueryData(queryKey),
    // Cache management to prevent memory leaks as pagination grows
    staleTime: 10 * 1000, // 10 seconds - match task polling for consistency
    gcTime: 10 * 60 * 1000, // 10 minutes, slightly longer gcTime
    
    // 🎯 MODULAR POLLING: Use the configured resurrection polling function
    refetchInterval,
    refetchIntervalInBackground: true, // CRITICAL: Continue polling when tab is not visible
    refetchOnWindowFocus: false, // Prevent double-fetches
    refetchOnReconnect: false, // Prevent double-fetches
  });

  // 🎯 MODULAR LOGGING: Standardized debug logging with data signature tracking
  useQueryDebugLogging(result, QueryDebugConfigs.generations({
    projectId,
    page,
    limit,
    enabled,
    filters,
    offset,
    queryKey: queryKey.join(':')
  }));

  return result;
}

export function useDeleteGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
  const { error } = await supabase
    .from('generations')
    .delete()
        .eq('id', id);
  
      if (error) {
        throw new Error(`Failed to delete generation: ${error.message}`);
      }
    },
    onSuccess: (data, variables) => {
      // Emit domain event for generation location update
      invalidationRouter.emit({
        type: 'GENERATION_LOCATION_UPDATE',
        payload: { 
          projectId: data?.project_id,
          generationId: variables.id 
        }
      });
    },
    onError: (error: Error) => {
      console.error('Error deleting generation:', error);
      toast.error(error.message || 'Failed to delete generation');
    },
  });
}

export function useUpdateGenerationLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, location }: { id: string; location: string }) => {
      return updateGenerationLocation(id, location);
    },
    onSuccess: (data, variables) => {
      // Emit domain event for generation location update
      invalidationRouter.emit({
        type: 'GENERATION_LOCATION_UPDATE',
        payload: {
          projectId: data?.project_id,
          generationId: variables.id
        }
      });
    },
    onError: (error: Error) => {
      console.error('Error updating generation location:', error);
      toast.error(error.message || 'Failed to update generation');
    },
  });
}

// NOTE: useGetTaskIdForGeneration moved to generationTaskBridge.ts for centralization
// Import from: import { useGetTaskIdForGeneration } from '@/shared/lib/generationTaskBridge';

export function useCreateGeneration() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createGeneration,
        onSuccess: (data, variables) => {
      // Emit domain event for generation creation
            invalidationRouter.generationInserted({
              projectId: variables.projectId,
              generationId: data?.id
            });
        },
        onError: (error: Error) => {
      console.error('Error creating generation:', error);
      toast.error(error.message || 'Failed to create generation');
    },
            });
        }

export function useToggleGenerationStar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => {
      console.log('[StarDebug:useToggleGenerationStar] Starting mutation', { id, starred });
      return toggleGenerationStar(id, starred);
    },
    onMutate: async ({ id, starred }) => {
      console.log('[StarDebug:useToggleGenerationStar] onMutate called', { id, starred });
      
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['unified-generations'] }),
        queryClient.cancelQueries({ queryKey: ['shots'] }),
      ]);

      // Snapshot previous values for rollback
      const previousGenerationsQueries = new Map();
      const previousShotsQueries = new Map();

      // 1) Optimistically update all generations-list caches
      const generationsQueries = queryClient.getQueriesData({ queryKey: ['unified-generations'] });
      console.log('[StarDebug:useToggleGenerationStar] Found generations queries:', generationsQueries.length);
      
      generationsQueries.forEach(([queryKey, data]) => {
        if (data && typeof data === 'object' && 'items' in data) {
          previousGenerationsQueries.set(queryKey, data);

          const updated = {
            ...data,
            items: (data as any).items.map((g: any) => (g.id === id ? { ...g, starred } : g)),
          };
          console.log('[StarDebug:useToggleGenerationStar] Updating generations cache', { queryKey, itemsCount: updated.items.length });
          queryClient.setQueryData(queryKey, updated);
        }
      });

      // 2) Optimistically update all shots caches so star reflects in Shot views / timelines
      const shotsQueries = queryClient.getQueriesData({ queryKey: ['shots'] });
      console.log('[StarDebug:useToggleGenerationStar] Found shots queries:', shotsQueries.length);
      
      shotsQueries.forEach(([queryKey, data]) => {
        if (Array.isArray(data)) {
          previousShotsQueries.set(queryKey, data);

          const updatedShots = (data as any).map((shot: any) => {
            if (!shot.images) return shot;
            const updatedImages = shot.images.map((img: any) => (img.id === id ? { ...img, starred } : img));
            const hasUpdates = updatedImages.some((img: any, idx: number) => img.starred !== shot.images[idx].starred);
            if (hasUpdates) {
              console.log('[StarDebug:useToggleGenerationStar] Updating shot images for shot', shot.id, { updatedCount: updatedImages.filter((img: any) => img.starred).length });
            }
            return {
              ...shot,
              images: updatedImages,
            };
          });
          queryClient.setQueryData(queryKey, updatedShots);
        }
      });

      console.log('[StarDebug:useToggleGenerationStar] onMutate complete', { 
        generationsQueriesUpdated: previousGenerationsQueries.size,
        shotsQueriesUpdated: previousShotsQueries.size 
      });

      return { previousGenerationsQueries, previousShotsQueries };
    },
    onError: (error: Error, _variables, context) => {
      console.log('[StarDebug:useToggleGenerationStar] onError called', { error: error.message });
      
      // Rollback optimistic updates
      if (context?.previousGenerationsQueries) {
        context.previousGenerationsQueries.forEach((data, key) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousShotsQueries) {
        context.previousShotsQueries.forEach((data, key) => {
          queryClient.setQueryData(key, data);
        });
      }

      console.error('Error toggling generation star:', error);
      toast.error(error.message || 'Failed to toggle star');
    },
    onSuccess: (data, variables) => {
      console.log('[StarDebug:useToggleGenerationStar] onSuccess called', { variables, data });
      // Emit domain event for generation star toggle
      invalidationRouter.emit({
        type: 'GENERATION_STAR_TOGGLE',
        payload: {
          projectId: data?.project_id,
          generationId: variables.id
        }
      });
    },
    onSettled: () => {
      console.log('[StarDebug:useToggleGenerationStar] onSettled called - invalidating caches');
      
      // No need for manual invalidations - optimistic updates handle this
    },
  });
}