import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  }
): Promise<{
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
}> {
  if (!projectId) return { items: [], total: 0, hasMore: false };
  
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
      countQuery = countQuery.or(`params->>tool_type.eq.${filters.toolType},metadata->>tool_type.eq.${filters.toolType},params->>tool_type.eq.${filters.toolType}-reconstructed-client,metadata->>tool_type.eq.${filters.toolType}-reconstructed-client`);
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

  // Get total count first  
  const { count, error: countError } = await countQuery;

  if (countError) throw countError;

  // Get paginated data with same filters
  let dataQuery = supabase
    .from('generations')
    .select('*')
    .eq('project_id', projectId);

  // Apply same filters to data query
  if (filters?.toolType) {
    if (filters.toolType === 'image-generation') {
      // Filter by tool_type in params for image-generation
      dataQuery = dataQuery.eq('params->>tool_type', 'image-generation');
    } else {
      dataQuery = dataQuery.or(`params->>tool_type.eq.${filters.toolType},metadata->>tool_type.eq.${filters.toolType},params->>tool_type.eq.${filters.toolType}-reconstructed-client,metadata->>tool_type.eq.${filters.toolType}-reconstructed-client`);
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

  // Apply shot filter to data query
  if (filters?.shotId) {
    // Use the same generation IDs from count query
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
      dataQuery = dataQuery.in('id', generationIds);
    }
  }

  const { data, error } = await dataQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) throw error;

  const items = data?.map((item: any) => ({
    id: item.id,
    url: item.location,
    thumbUrl: item.thumb_url,
    prompt: item.params?.originalParams?.orchestrator_details?.prompt || 
            item.params?.prompt || 
            item.metadata?.prompt || 
            'No prompt',
    metadata: item.params || item.metadata || {},
    createdAt: item.created_at,
    isVideo: item.type?.includes('video'),
    starred: item.starred || false,
  })) || [];

  const total = count || 0;
  const hasMore = offset + limit < total;

  return { items, total, hasMore };
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

/**
 * Get task ID for a generation using direct Supabase call
 */
async function getTaskIdForGeneration(generationId: string): Promise<{ taskId: string | null }> {
  const { data, error } = await supabase
    .from('generations')
    .select('tasks')
    .eq('id', generationId)
    .single();

  if (error) {
    throw new Error(`Generation not found or has no task: ${error.message}`);
  }

  const tasksArray = data?.tasks as string[] | null;
  const taskId = Array.isArray(tasksArray) && tasksArray.length > 0 ? tasksArray[0] : null;

  return { taskId };
}

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
  }
) {
  const offset = (page - 1) * limit;
  
  return useQuery<GenerationsPaginatedResponse, Error>({
    queryKey: ['generations', projectId, page, limit, filters],
    staleTime: 30 * 1000,
    queryFn: () => fetchGenerations(projectId, limit, offset, filters),
    enabled: !!projectId && enabled
  });
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
    onSuccess: () => {
      // Invalidate all generations queries to refetch
      queryClient.invalidateQueries({ queryKey: ['generations'] });      
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
    onSuccess: () => {
      // Invalidate all generations queries to refetch
      queryClient.invalidateQueries({ queryKey: ['generations'] });
    },
    onError: (error: Error) => {
      console.error('Error updating generation location:', error);
      toast.error(error.message || 'Failed to update generation');
    },
  });
}

export function useGetTaskIdForGeneration() {
  return useMutation({
    mutationFn: getTaskIdForGeneration,
    onError: (error: Error) => {
      console.error('Error getting task ID for generation:', error);
    },
  });
}

export function useCreateGeneration() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createGeneration,
        onSuccess: () => {
      // Invalidate all generations queries to refetch
            queryClient.invalidateQueries({ queryKey: ['generations'] });
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
        queryClient.cancelQueries({ queryKey: ['generations'] }),
        queryClient.cancelQueries({ queryKey: ['shots'] }),
      ]);

      // Snapshot previous values for rollback
      const previousGenerationsQueries = new Map();
      const previousShotsQueries = new Map();

      // 1) Optimistically update all generations-list caches
      const generationsQueries = queryClient.getQueriesData({ queryKey: ['generations'] });
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
    },
    onSettled: () => {
      console.log('[StarDebug:useToggleGenerationStar] onSettled called - invalidating caches');
      
      // Ensure both generations & shots caches are up-to-date after mutation
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['shots'] });
    },
  });
}