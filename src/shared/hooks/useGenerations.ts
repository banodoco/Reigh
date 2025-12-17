import React from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
// Removed useResurrectionPolling - replaced by useSmartPolling
// Removed invalidationRouter - DataFreshnessManager handles all invalidation logic
import { useSmartPollingConfig } from './useSmartPolling';
import { useQueryDebugLogging, QueryDebugConfigs } from './useQueryDebugLogging';
import { transformGeneration, type RawGeneration, type TransformOptions } from '@/shared/lib/generationTransformers';

/**
 * Fetch edit variants from generation_variants table for a project
 * Filters by tool_type in params (set by complete_task)
 * 
 * NOTE: Requires the project_id column on generation_variants (added via migration)
 * The column is auto-populated by a trigger from the parent generation
 */
async function fetchEditVariants(
  projectId: string,
  limit: number,
  offset: number,
  filters?: {
    toolType?: string;
    mediaType?: 'all' | 'image' | 'video';
    sort?: 'newest' | 'oldest';
    parentsOnly?: boolean; // Exclude child variants (those with parent_variant_id in params)
  }
): Promise<{
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
}> {
  const toolType = filters?.toolType; // Optional - if not provided, fetch all variants
  const sort = filters?.sort || 'newest';
  const mediaType = filters?.mediaType || 'all';
  const parentsOnly = filters?.parentsOnly ?? true; // Default to parents only
  console.log('[EditVariants] Fetching variants for project', { projectId: projectId.substring(0, 8), toolType: toolType || 'all', mediaType, parentsOnly, limit, offset });

  // Build count query
  let countQuery = supabase
    .from('generation_variants')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);
  
  // Only filter by toolType if specified
  if (toolType) {
    countQuery = countQuery.eq('params->>tool_type', toolType);
  }
  
  // Filter by media type - variants don't have a type column, so filter by URL extension
  if (mediaType === 'video') {
    countQuery = countQuery.or('location.ilike.%.mp4,location.ilike.%.webm,location.ilike.%.mov');
  } else if (mediaType === 'image') {
    countQuery = countQuery.not('location', 'ilike', '%.mp4').not('location', 'ilike', '%.webm').not('location', 'ilike', '%.mov');
  }
  
  // Exclude child variants (those created from another variant)
  if (parentsOnly) {
    countQuery = countQuery.is('params->>parent_variant_id', null);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error('[EditVariants] Count query error:', countError);
    throw countError;
  }

  const totalCount = count || 0;
  console.log('[EditVariants] Total variants count:', totalCount, 'mediaType:', mediaType);

  if (totalCount === 0) {
    return { items: [], total: 0, hasMore: false };
  }

  // Data query with pagination
  const ascending = sort === 'oldest';
  let dataQuery = supabase
    .from('generation_variants')
    .select(`
      id,
      generation_id,
      location,
      thumbnail_url,
      params,
      variant_type,
      name,
      created_at
    `)
    .eq('project_id', projectId);
  
  // Only filter by toolType if specified
  if (toolType) {
    dataQuery = dataQuery.eq('params->>tool_type', toolType);
  }
  
  // Filter by media type in data query too
  if (mediaType === 'video') {
    dataQuery = dataQuery.or('location.ilike.%.mp4,location.ilike.%.webm,location.ilike.%.mov');
  } else if (mediaType === 'image') {
    dataQuery = dataQuery.not('location', 'ilike', '%.mp4').not('location', 'ilike', '%.webm').not('location', 'ilike', '%.mov');
  }
  
  // Exclude child variants in data query too
  if (parentsOnly) {
    dataQuery = dataQuery.is('params->>parent_variant_id', null);
  }
  
  dataQuery = dataQuery
    .order('created_at', { ascending })
    .range(offset, offset + limit - 1);

  const { data, error } = await dataQuery;

  if (error) {
    console.error('[EditVariants] Data query error:', error);
    throw error;
  }

  console.log('[EditVariants] Fetched', data?.length || 0, 'variants');

  // Helper to detect if a variant is a video based on URL
  const isVideoUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  // Transform variants to GeneratedImageWithMetadata format
  const items: GeneratedImageWithMetadata[] = (data || []).map((variant: any) => {
    const isVideo = isVideoUrl(variant.location);
    // Extract content_type from params for proper download file extensions
    const storedContentType = variant.params?.content_type;
    let contentType: string | undefined;
    if (storedContentType === 'video' || isVideo) {
      contentType = 'video/mp4';
    } else if (storedContentType === 'image' || !isVideo) {
      contentType = 'image/png';
    }
    
    return {
      id: variant.id,
      url: variant.location,
      thumbUrl: variant.thumbnail_url || variant.location,
      isVideo,
      contentType, // For proper download file extensions
      createdAt: variant.created_at,
      starred: false, // Variants don't have starred flag
      metadata: {
        prompt: variant.params?.prompt,
        variant_type: variant.variant_type,
        name: variant.name,
        generation_id: variant.generation_id,
        tool_type: variant.params?.tool_type || toolType,
        created_from: variant.params?.created_from,
        source_task_id: variant.params?.source_task_id, // Task ID for fetching task details
        content_type: storedContentType, // Include in metadata too
      },
      shot_id: undefined,
      position: undefined,
      all_shot_associations: undefined,
    };
  });

  // Media type filtering is now done in the database query

  return {
    items,
    total: totalCount,
    hasMore: offset + items.length < totalCount,
  };
}

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
    includeChildren?: boolean;
    parentGenerationId?: string;
    sort?: 'newest' | 'oldest';
    editsOnly?: boolean; // Filter for images with based_on set (derived/edited images)
    parentsOnly?: boolean; // For variants: exclude child variants (those with parent_variant_id)
    variantsOnly?: boolean; // Fetch edit variants from generation_variants table
  }
): Promise<{
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
}> {

  if (!projectId) {
    return { items: [], total: 0, hasMore: false };
  }

  // Special path for variantsOnly - fetch from generation_variants table
  if (filters?.variantsOnly) {
    return fetchEditVariants(projectId, limit, offset, {
      toolType: filters.toolType,
      mediaType: filters.mediaType,
      sort: filters.sort,
      parentsOnly: filters.parentsOnly ?? true, // Default to parents only
    });
  }

  // Build count query
  let countQuery = supabase
    .from('generations')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);
  
  // Only include generations with valid output URLs - UNLESS fetching children of a specific parent
  // (children may still be processing and need to show as placeholders)
  if (!filters?.parentGenerationId) {
    countQuery = countQuery.not('location', 'is', null);
  }

  // Apply server-side filters to count query

  // Parent/Child filtering
  if (filters?.parentGenerationId) {
    // Fetch specific children of a parent
    countQuery = countQuery.eq('parent_generation_id', filters.parentGenerationId);
  } else if (!filters?.includeChildren) {
    // Default: Exclude child generations (show only parents/standalone)
    // is_child is boolean NOT NULL DEFAULT false, so we can just check for false
    countQuery = countQuery.eq('is_child', false);
  }

  // NOTE: Skip tool type filter when shot filter is active - shot filter takes precedence
  // Users want to see ALL generations in a shot, not just ones from the current tool
  if (filters?.toolType && !filters?.shotId) {
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

  // Apply edits only filter - show generations that are derived from another (based_on is set)
  if (filters?.editsOnly) {
    countQuery = countQuery.not('based_on', 'is', null);
  }

  // Apply search filter to count query
  if (filters?.searchTerm?.trim()) {
    // Search in the main prompt location first (most common)
    const searchPattern = `%${filters.searchTerm.trim()}%`;
    countQuery = countQuery.ilike('params->originalParams->orchestrator_details->>prompt', searchPattern);
  }

  // 🚀 NEW APPROACH: Use denormalized shot_id column for fast filtering
  // No more multi-step fetching from shot_generations!
  let totalCount = 0; // Total count of matching items

  // Apply shot filter if provided - using JSONB shot_data column
  if (filters?.shotId === 'no-shot') {
    // Special filter: only show generations that don't belong to ANY shot
    // shot_data will be null or empty {} for these generations
    countQuery = countQuery.or('shot_data.is.null,shot_data.eq.{}');
  } else if (filters?.shotId) {

    // Check if generation is in this shot (uses GIN index: idx_generations_shot_data_gin)
    // shot_data->'shot_id' checks if the key exists (returns the value or null if key missing)
    // We want: WHERE shot_data->'shot_id' IS NOT NULL (meaning key exists)
    countQuery = countQuery.not(`shot_data->${filters.shotId}`, 'is', null);

    // Add positioned filter if needed
    if (filters.excludePositioned) {
      // Filter to only unpositioned: shot_data->>'shot_id' IS NULL
      // ->> returns as text, and JSON null becomes SQL NULL
      countQuery = countQuery.is(`shot_data->>${filters.shotId}`, null);
    }
  }

  // 🚀 PERFORMANCE FIX: Skip expensive count query for small pages
  // DISABLED: Enable full count for accurate pagination
  const shouldSkipCount = false; // limit <= 100 && !filters?.searchTerm?.trim();

  if (!shouldSkipCount) {
    const { count, error: countError } = await countQuery;
    if (countError) {
      throw countError;
    }
    totalCount = count || 0;
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
      updated_at,
      params,
      starred,
      tasks,
      based_on,
      shot_data,
      name,
      is_child,
      parent_generation_id,
      child_order
    `)
    .eq('project_id', projectId);

  // Parent/Child filtering - apply BEFORE location filter since parentGenerationId affects whether we filter by location
  if (filters?.parentGenerationId) {
    dataQuery = dataQuery.eq('parent_generation_id', filters.parentGenerationId);
    // Order children by child_order
    dataQuery = dataQuery.order('child_order', { ascending: true });
    // Don't filter by location - we want to see ALL children including ones still processing
  } else {
    // Only include generations with valid output URLs (when NOT fetching specific parent's children)
    dataQuery = dataQuery.not('location', 'is', null);
    if (!filters?.includeChildren) {
      dataQuery = dataQuery.eq('is_child', false);
    }
  }


  // Apply same filters to data query
  // NOTE: Skip tool type filter when shot filter is active - shot filter takes precedence
  if (filters?.toolType && !filters?.shotId) {
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

  // Apply edits only filter to data query - show generations that are derived from another (based_on is set)
  if (filters?.editsOnly) {
    dataQuery = dataQuery.not('based_on', 'is', null);
  }

  // Apply search filter to data query
  if (filters?.searchTerm?.trim()) {
    // Search in the main prompt location first (most common)
    const searchPattern = `%${filters.searchTerm.trim()}%`;
    dataQuery = dataQuery.ilike('params->originalParams->orchestrator_details->>prompt', searchPattern);
  }

  // Apply shot filter to data query - using JSONB shot_data column
  if (filters?.shotId === 'no-shot') {
    // Special filter: only show generations that don't belong to ANY shot
    dataQuery = dataQuery.or('shot_data.is.null,shot_data.eq.{}');
  } else if (filters?.shotId) {
    // Check if generation is in this shot (uses GIN index: idx_generations_shot_data_gin)
    dataQuery = dataQuery.not(`shot_data->${filters.shotId}`, 'is', null);

    // Add positioned filter if needed
    if (filters.excludePositioned) {
      dataQuery = dataQuery.is(`shot_data->>${filters.shotId}`, null);
    }
  }

  // 🚀 PERFORMANCE FIX: Use limit+1 pattern for fast pagination when count is skipped
  const fetchLimit = shouldSkipCount ? limit + 1 : limit;

  // Determine sort order
  const sort = filters?.sort || 'newest';
  const ascending = sort === 'oldest';

  // Execute query with standard server-side pagination
  const { data, error } = await dataQuery
    .order('created_at', { ascending })
    .range(offset, offset + fetchLimit - 1);

  if (error) {
    throw error;
  }

  if (!data) {
    return { items: [], total: totalCount, hasMore: false };
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

  // Use shared transformer instead of inline transformation logic
  const items = finalData?.map((item: any) => {
    // Transform using shared function - handles all the complex logic
    return transformGeneration(item as RawGeneration, {
      shotId: filters?.shotId,
    });
  }) || [];

  return { items, total: totalCount, hasMore };
}

/**
 * Update generation location using direct Supabase call
 */
async function updateGenerationLocation(id: string, location: string, thumbUrl?: string): Promise<void> {
  const updateData: { location: string; thumbnail_url?: string } = { location };

  // If thumbUrl is provided, update it as well (important for flipped images)
  if (thumbUrl) {
    updateData.thumbnail_url = thumbUrl;
  }

  const { error } = await supabase
    .from('generations')
    .update(updateData)
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
  thumbnailUrl?: string;
}): Promise<any> {
  const { data, error } = await supabase
    .from('generations')
    .insert({
      location: params.imageUrl,
      thumbnail_url: params.thumbnailUrl || params.imageUrl, // Use thumbnail URL if provided, fallback to main image
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
  console.log('[StarPersist] 🚀 Starting database UPDATE', {
    id,
    starred,
    timestamp: Date.now()
  });

  const { data, error } = await supabase
    .from('generations')
    .update({ starred })
    .eq('id', id)
    .select('id, starred'); // Select to verify update

  console.log('[StarPersist] 📊 Database UPDATE response', {
    id,
    starred,
    responseData: data,
    hasData: !!data,
    dataLength: data?.length,
    error: error?.message,
    timestamp: Date.now()
  });

  if (error) {
    console.error('[StarPersist] ❌ Database UPDATE failed', { id, starred, error: error.message });
    throw new Error(`Failed to ${starred ? 'star' : 'unstar'} generation: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.error('[StarPersist] ⚠️ Database UPDATE returned no rows - possible RLS block', {
      id,
      starred,
      hint: 'Check Row Level Security policies on generations table'
    });
    throw new Error(`Failed to update generation: No rows updated (possible RLS policy issue)`);
  }

  console.log('[StarPersist] ✅ Database UPDATE successful', {
    id,
    starred,
    updatedData: data[0],
    timestamp: Date.now()
  });
}

/**
 * Update generation name using direct Supabase call
 */
async function updateGenerationName(id: string, name: string): Promise<void> {
  console.log('[GenerationUpdate] 🚀 Starting generation name UPDATE', {
    id,
    name,
    timestamp: Date.now()
  });

  // Update the 'name' column directly
  const { data, error } = await supabase
    .from('generations')
    .update({ name })
    .eq('id', id)
    .select('id, name');

  if (error) {
    console.error('[GenerationUpdate] ❌ Database UPDATE failed', { id, name, error: error.message });
    throw new Error(`Failed to update generation name: ${error.message}`);
  }

  console.log('[GenerationUpdate] ✅ Database UPDATE successful', {
    id,
    name,
    updatedData: data?.[0],
    timestamp: Date.now()
  });
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
    includeChildren?: boolean;
    parentGenerationId?: string;
    sort?: 'newest' | 'oldest';
    editsOnly?: boolean; // Filter for images with based_on set (derived/edited images)
    parentsOnly?: boolean; // For variants: exclude child variants (those with parent_variant_id)
    variantsOnly?: boolean; // Fetch edit variants from generation_variants table
  },
  options?: {
    disablePolling?: boolean; // Disable smart polling (useful for long-running tasks)
  }
) {
  const offset = (page - 1) * limit;
  const queryClient = useQueryClient();
  const effectiveProjectId = projectId ?? (typeof window !== 'undefined' ? (window as any).__PROJECT_CONTEXT__?.selectedProjectId : null);
  const queryKey = ['unified-generations', 'project', effectiveProjectId, page, limit, filters];


  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  // Can be disabled for tools with long-running tasks to prevent gallery flicker
  const smartPollingConfig = useSmartPollingConfig(['generations', projectId]);
  const pollingConfig = options?.disablePolling
    ? { refetchInterval: false, staleTime: Infinity }
    : smartPollingConfig;

  const result = useQuery<GenerationsPaginatedResponse, Error>({
    queryKey: queryKey,
    queryFn: () => fetchGenerations(effectiveProjectId, limit, offset, filters),
    enabled: !!effectiveProjectId && enabled,
    // Use `placeholderData` with `keepPreviousData` to prevent UI flashes on pagination/filter changes
    placeholderData: keepPreviousData,
    // Synchronously grab initial data from the cache on mount to prevent skeletons on revisit
    initialData: () => queryClient.getQueryData(queryKey),
    // Cache management to prevent memory leaks as pagination grows
    gcTime: 10 * 60 * 1000, // 10 minutes, slightly longer gcTime
    refetchOnWindowFocus: false, // Prevent double-fetches

    // 🎯 SMART POLLING: Intelligent polling based on realtime health (or disabled)
    ...pollingConfig,
    refetchIntervalInBackground: !options?.disablePolling, // Only poll in background if polling is enabled
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
      // Generation location update events are now handled by DataFreshnessManager via realtime events
    },
    onError: (error: Error) => {
      console.error('Error deleting generation:', error);
      toast.error(error.message || 'Failed to delete generation');
    },
  });
}

/**
 * Delete a variant from generation_variants table.
 * Use this for edit tools (edit-images, edit-video, character-animate) that create variants.
 */
export function useDeleteVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('generation_variants')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete variant: ${error.message}`);
      }
    },
    onSuccess: (data, variables) => {
      // Variant deletion events are handled by DataFreshnessManager via realtime events
    },
    onError: (error: Error) => {
      console.error('Error deleting variant:', error);
      toast.error(error.message || 'Failed to delete variant');
    },
  });
}

export function useUpdateGenerationLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, location, thumbUrl, projectId }: { id: string; location: string; thumbUrl?: string; projectId?: string }) => {
      return updateGenerationLocation(id, location, thumbUrl);
    },
    onSuccess: (data, variables) => {
      // Generation location update events are now handled by DataFreshnessManager via realtime events
    },
    onError: (error: Error) => {
      console.error('Error updating generation location:', error);
      toast.error(error.message || 'Failed to update generation');
    },
  });
}

export function useUpdateGenerationName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => {
      return updateGenerationName(id, name);
    },
    onMutate: async ({ id, name }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['unified-generations'] });

      // Snapshot previous values
      const previousGenerationsQueries = queryClient.getQueriesData({ queryKey: ['unified-generations'] });

      // Optimistically update
      queryClient.setQueriesData({ queryKey: ['unified-generations'] }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((item: any) =>
            item.id === id ? { ...item, name } : item
          )
        };
      });

      return { previousGenerationsQueries };
    },
    onError: (error: Error, variables, context) => {
      // Rollback on error
      if (context?.previousGenerationsQueries) {
        context.previousGenerationsQueries.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      console.error('Error updating generation name:', error);
      toast.error(error.message || 'Failed to update generation name');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
    }
  });
}

// NOTE: useGetTaskIdForGeneration moved to generationTaskBridge.ts for centralization

export function useCreateGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createGeneration,
    onSuccess: (data, variables) => {
      // Emit domain event for generation creation
      // Generation insertion events are now handled by DataFreshnessManager via realtime events
    },
    onError: (error: Error) => {
      console.error('Error creating generation:', error);
      toast.error(error.message || 'Failed to create generation');
    },
  });
}

/**
 * Fetch generations that are derived from a specific source generation (based_on tracking)
 */
export async function fetchDerivedGenerations(
  sourceGenerationId: string | null
): Promise<GeneratedImageWithMetadata[]> {
  console.log('[BasedOnDebug] fetchDerivedGenerations called', { sourceGenerationId });

  if (!sourceGenerationId) {
    console.log('[BasedOnDebug] fetchDerivedGenerations returning empty - no sourceGenerationId');
    return [];
  }

  const { data, error } = await supabase
    .from('generations')
    .select(`
      id,
      location,
      thumbnail_url,
      type,
      created_at,
      params,
      starred,
      tasks,
      based_on,
      shot_generations(shot_id, timeline_frame)
    `)
    .eq('based_on', sourceGenerationId)
    .order('starred', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[BasedOnDebug] fetchDerivedGenerations error', error);
    throw error;
  }

  console.log('[BasedOnDebug] fetchDerivedGenerations result', {
    sourceGenerationId,
    count: data?.length || 0,
    data: data?.map(d => ({ id: d.id, based_on: (d as any).based_on }))
  });

  // Fetch counts of generations based on each derived generation
  const derivedIds = data?.map(d => d.id) || [];
  let derivedCounts: Record<string, number> = {};

  if (derivedIds.length > 0) {
    const { data: countsData, error: countsError } = await supabase
      .from('generations')
      .select('based_on')
      .in('based_on', derivedIds);

    if (!countsError && countsData) {
      // Count how many times each ID appears as based_on
      derivedCounts = countsData.reduce((acc, item) => {
        const basedOnId = item.based_on;
        acc[basedOnId] = (acc[basedOnId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }
  }

  const items = data?.map((item: any) => {
    const mainUrl = item.location;
    const thumbnailUrl = item.thumbnail_url || mainUrl;
    const taskId = Array.isArray(item.tasks) && item.tasks.length > 0 ? item.tasks[0] : null;

    // Debug based_on field
    if (process.env.NODE_ENV === 'development') {
      console.log('[BasedOnDebug] 🔍 useGenerations mapping item:');
      console.log('  itemId:', item.id?.substring(0, 8));
      console.log('  hasBasedOnField:', !!item.based_on);
      console.log('  basedOnValue:', item.based_on);
      console.log('  hasBasedOnInParams:', !!(item.params?.based_on));
      console.log('  basedOnInParams:', item.params?.based_on);
      console.log('  allItemKeys:', Object.keys(item));
      console.log('  paramsKeys:', item.params ? Object.keys(item.params) : 'no params');
      console.log('  timestamp:', Date.now());
    }

    const baseItem: GeneratedImageWithMetadata = {
      id: item.id,
      url: mainUrl,
      thumbUrl: thumbnailUrl,
      prompt: item.params?.originalParams?.orchestrator_details?.prompt ||
        item.params?.prompt ||
        'No prompt',
      metadata: {
        ...(item.params || {}),
        taskId
      },
      createdAt: item.created_at,
      isVideo: item.type?.includes('video'),
      starred: item.starred || false,
      position: null,
      timeline_frame: null,
      derivedCount: derivedCounts[item.id] || 0,
      based_on: item.based_on || item.params?.based_on || null, // Include based_on from database or params
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('[BasedOnDebug] ✅ Created baseItem:');
      console.log('  baseItemId:', baseItem.id?.substring(0, 8));
      console.log('  baseItem.based_on:', baseItem.based_on);
      console.log('  baseItemKeys:', Object.keys(baseItem));
    }

    // Include shot association data
    const shotGenerations = item.shot_generations || [];
    const normalizePosition = (timelineFrame: number | null | undefined) => {
      if (timelineFrame === null || timelineFrame === undefined) return null;
      return Math.floor(timelineFrame / 50);
    };

    if (shotGenerations.length > 0) {
      if (shotGenerations.length === 1) {
        const singleShot = shotGenerations[0];
        return {
          ...baseItem,
          shot_id: singleShot.shot_id,
          position: normalizePosition(singleShot.timeline_frame),
          timeline_frame: singleShot.timeline_frame,
        };
      }

      const allAssociations = shotGenerations.map((sg: any) => ({
        shot_id: sg.shot_id,
        timeline_frame: sg.timeline_frame,
        position: normalizePosition(sg.timeline_frame),
      }));

      const primaryShot = shotGenerations[0];
      return {
        ...baseItem,
        shot_id: primaryShot.shot_id,
        position: normalizePosition(primaryShot.timeline_frame),
        timeline_frame: primaryShot.timeline_frame,
        all_shot_associations: allAssociations,
      };
    }

    return baseItem;
  }) || [];

  return items;
}

/**
 * Hook to fetch derived generations (generations based on a source generation)
 */
export function useDerivedGenerations(
  sourceGenerationId: string | null,
  enabled: boolean = true
) {
  // 🎯 SMART POLLING: Use intelligent polling for derived generations so new edits appear immediately
  const smartPollingConfig = useSmartPollingConfig(['derived-generations', sourceGenerationId]);

  return useQuery<GeneratedImageWithMetadata[], Error>({
    queryKey: ['derived-generations', sourceGenerationId],
    queryFn: () => fetchDerivedGenerations(sourceGenerationId),
    enabled: !!sourceGenerationId && enabled,
    gcTime: 5 * 60 * 1000, // 5 minutes

    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Continue polling when tab inactive
    refetchOnWindowFocus: false, // Prevent double-fetches
    refetchOnReconnect: false, // Prevent double-fetches
  });
}

// ===== UNIFIED DERIVED ITEMS (Generations + Variants) =====

/**
 * Variant types that represent edits (should appear in "Based on this")
 */
export const EDIT_VARIANT_TYPES = ['inpaint', 'magic_edit', 'annotated_edit', 'edit'] as const;

/**
 * A derived item can be either a generation (old mode) or a variant (new mode)
 */
export interface DerivedItem {
  id: string;
  thumbUrl: string;
  url: string;
  createdAt: string;
  derivedCount: number;
  starred?: boolean;
  prompt?: string;
  
  /** Discriminator: 'generation' for old based_on, 'variant' for new variant edits */
  itemType: 'generation' | 'variant';
  
  /** Variant-specific fields */
  variantType?: string;
  variantName?: string;
  
  /** Generation-specific fields */
  basedOn?: string;
  shot_id?: string;
  timeline_frame?: number | null;
  all_shot_associations?: Array<{ shot_id: string; timeline_frame: number | null; position: number | null }>;
}

/**
 * Fetch derived items: BOTH child generations (based_on) AND edit variants
 * This provides backwards compatibility while supporting the new variant model.
 */
export async function fetchDerivedItems(
  sourceGenerationId: string | null
): Promise<DerivedItem[]> {
  console.log('[DerivedItems] fetchDerivedItems called', { sourceGenerationId });

  if (!sourceGenerationId) {
    console.log('[DerivedItems] returning empty - no sourceGenerationId');
    return [];
  }

  // Fetch both in parallel
  const [generationsResult, variantsResult] = await Promise.all([
    // 1. Child generations (backwards compatible - generations with based_on = this)
    supabase
      .from('generations')
      .select(`
        id,
        location,
        thumbnail_url,
        type,
        created_at,
        params,
        starred,
        tasks,
        based_on,
        shot_generations(shot_id, timeline_frame)
      `)
      .eq('based_on', sourceGenerationId)
      .order('starred', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    
    // 2. Edit variants (new mode - variants with edit types, excluding primary/original)
    supabase
      .from('generation_variants')
      .select('id, location, thumbnail_url, created_at, variant_type, name, params, is_primary')
      .eq('generation_id', sourceGenerationId)
      .in('variant_type', EDIT_VARIANT_TYPES)
      .eq('is_primary', false) // Exclude primary - that's the "current" version
      .order('created_at', { ascending: false })
  ]);

  if (generationsResult.error) {
    console.error('[DerivedItems] Error fetching child generations:', generationsResult.error);
  }
  if (variantsResult.error) {
    console.error('[DerivedItems] Error fetching edit variants:', variantsResult.error);
  }

  const childGenerations = generationsResult.data || [];
  const editVariants = variantsResult.data || [];

  console.log('[DerivedItems] Fetched', {
    childGenerationsCount: childGenerations.length,
    editVariantsCount: editVariants.length,
    sourceGenerationId: sourceGenerationId.substring(0, 8)
  });

  // Fetch derived counts for child generations (how many generations are based on each)
  const generationIds = childGenerations.map(d => d.id);
  let derivedCounts: Record<string, number> = {};

  if (generationIds.length > 0) {
    const { data: countsData, error: countsError } = await supabase
      .from('generations')
      .select('based_on')
      .in('based_on', generationIds);

    if (!countsError && countsData) {
      derivedCounts = countsData.reduce((acc, item) => {
        const basedOnId = item.based_on;
        acc[basedOnId] = (acc[basedOnId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }
  }

  // Normalize generations to DerivedItem format
  const normalizePosition = (timelineFrame: number | null | undefined) => {
    if (timelineFrame === null || timelineFrame === undefined) return null;
    return Math.floor(timelineFrame / 50);
  };

  const generationItems: DerivedItem[] = childGenerations.map((item: any) => {
    const shotGenerations = item.shot_generations || [];
    const allAssociations = shotGenerations.length > 1
      ? shotGenerations.map((sg: any) => ({
          shot_id: sg.shot_id,
          timeline_frame: sg.timeline_frame,
          position: normalizePosition(sg.timeline_frame),
        }))
      : undefined;

    const primaryShot = shotGenerations[0];

    return {
      id: item.id,
      thumbUrl: item.thumbnail_url || item.location,
      url: item.location,
      createdAt: item.created_at,
      derivedCount: derivedCounts[item.id] || 0,
      starred: item.starred || false,
      prompt: item.params?.prompt || item.params?.originalParams?.orchestrator_details?.prompt,
      itemType: 'generation' as const,
      basedOn: item.based_on,
      shot_id: primaryShot?.shot_id,
      timeline_frame: primaryShot?.timeline_frame,
      all_shot_associations: allAssociations,
    };
  });

  // Normalize variants to DerivedItem format
  const variantItems: DerivedItem[] = editVariants.map((variant: any) => ({
    id: variant.id,
    thumbUrl: variant.thumbnail_url || variant.location,
    url: variant.location,
    createdAt: variant.created_at,
    derivedCount: 0, // Variants can't have children
    starred: false, // Variants don't have starred flag
    prompt: variant.params?.prompt,
    itemType: 'variant' as const,
    variantType: variant.variant_type,
    variantName: variant.name,
  }));

  // Merge and sort by created_at (newest first), with starred generations at top
  const allItems = [...generationItems, ...variantItems].sort((a, b) => {
    // Starred items first (only generations can be starred)
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    // Then by date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  console.log('[DerivedItems] Merged result', {
    totalCount: allItems.length,
    generations: generationItems.length,
    variants: variantItems.length,
  });

  return allItems;
}

/**
 * Hook to fetch derived items (generations + variants based on this generation)
 * Use this instead of useDerivedGenerations for the unified "Based on this" feature.
 */
export function useDerivedItems(
  sourceGenerationId: string | null,
  enabled: boolean = true
) {
  // 🎯 SMART POLLING: Use intelligent polling for derived items so new edits appear immediately
  const smartPollingConfig = useSmartPollingConfig(['derived-items', sourceGenerationId]);

  return useQuery<DerivedItem[], Error>({
    queryKey: ['derived-items', sourceGenerationId],
    queryFn: () => fetchDerivedItems(sourceGenerationId),
    enabled: !!sourceGenerationId && enabled,
    gcTime: 5 * 60 * 1000, // 5 minutes

    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Continue polling when tab inactive
    refetchOnWindowFocus: false, // Prevent double-fetches
    refetchOnReconnect: false, // Prevent double-fetches
  });
}

/**
 * Fetch a single source generation by ID (for "based on" display)
 */
export async function fetchSourceGeneration(
  sourceGenerationId: string | null
): Promise<GeneratedImageWithMetadata | null> {
  console.log('[BasedOnDebug] fetchSourceGeneration called', { sourceGenerationId });

  if (!sourceGenerationId) {
    console.log('[BasedOnDebug] fetchSourceGeneration returning null - no sourceGenerationId');
    return null;
  }

  const { data, error } = await supabase
    .from('generations')
    .select(`
      id,
      location,
      thumbnail_url,
      type,
      created_at,
      params,
      starred,
      tasks,
      based_on,
      shot_generations(shot_id, timeline_frame)
    `)
    .eq('id', sourceGenerationId)
    .single();

  if (error || !data) {
    console.error('[BasedOnDebug] fetchSourceGeneration error or no data', { error, hasData: !!data });
    return null;
  }

  console.log('[BasedOnDebug] fetchSourceGeneration found generation', {
    id: data.id,
    hasLocation: !!data.location,
    hasThumbnail: !!data.thumbnail_url
  });

  const item = data;
  const mainUrl = item.location;
  const thumbnailUrl = item.thumbnail_url || mainUrl;
  const taskId = Array.isArray(item.tasks) && item.tasks.length > 0 ? item.tasks[0] : null;

  const baseItem: GeneratedImageWithMetadata = {
    id: item.id,
    url: mainUrl,
    thumbUrl: thumbnailUrl,
    prompt: item.params?.originalParams?.orchestrator_details?.prompt ||
      item.params?.prompt ||
      'No prompt',
    metadata: {
      ...(item.params || {}),
      taskId
    },
    createdAt: item.created_at,
    isVideo: item.type?.includes('video'),
    starred: item.starred || false,
    position: null,
    timeline_frame: null,
  };

  // Include shot association data
  const shotGenerations = item.shot_generations || [];
  const normalizePosition = (timelineFrame: number | null | undefined) => {
    if (timelineFrame === null || timelineFrame === undefined) return null;
    return Math.floor(timelineFrame / 50);
  };

  if (shotGenerations.length > 0) {
    if (shotGenerations.length === 1) {
      const singleShot = shotGenerations[0];
      return {
        ...baseItem,
        shot_id: singleShot.shot_id,
        position: normalizePosition(singleShot.timeline_frame),
        timeline_frame: singleShot.timeline_frame,
      };
    }

    const allAssociations = shotGenerations.map((sg: any) => ({
      shot_id: sg.shot_id,
      timeline_frame: sg.timeline_frame,
      position: normalizePosition(sg.timeline_frame),
    }));

    const primaryShot = shotGenerations[0];
    return {
      ...baseItem,
      shot_id: primaryShot.shot_id,
      position: normalizePosition(primaryShot.timeline_frame),
      timeline_frame: primaryShot.timeline_frame,
      all_shot_associations: allAssociations,
    };
  }

  return baseItem;
}

/**
 * Hook to fetch the source generation (for "based on" display)
 */
export function useSourceGeneration(
  sourceGenerationId: string | null,
  enabled: boolean = true
) {
  return useQuery<GeneratedImageWithMetadata | null, Error>({
    queryKey: ['source-generation', sourceGenerationId],
    queryFn: () => fetchSourceGeneration(sourceGenerationId),
    enabled: !!sourceGenerationId && enabled,
    staleTime: 60 * 1000, // 1 minute (source doesn't change often)
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useToggleGenerationStar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, starred, shotId }: { id: string; starred: boolean; shotId?: string }) => {
      console.log('[StarPersist] 🔵 Mutation function called', { id, starred, shotId });
      return toggleGenerationStar(id, starred);
    },
    onMutate: async ({ id, starred, shotId }) => {
      console.log('[StarPersist] 🟡 onMutate: Optimistically updating caches', { id, starred, shotId });

      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['unified-generations'] }),
        queryClient.cancelQueries({ queryKey: ['shots'] }),
        queryClient.cancelQueries({ queryKey: ['all-shot-generations'] }),
      ]);

      // Snapshot previous values for rollback
      const previousGenerationsQueries = new Map();
      const previousShotsQueries = new Map();
      const previousAllShotGenerationsQueries = new Map();

      // 1) Optimistically update all generations-list caches
      const generationsQueries = queryClient.getQueriesData({ queryKey: ['unified-generations'] });
      console.log('[StarPersist] 📊 Found generations queries to update:', {
        queriesCount: generationsQueries.length,
        generationId: id,
        newStarred: starred,
        queryKeys: generationsQueries.map(([key]) => key)
      });

      generationsQueries.forEach(([queryKey, data]) => {
        if (data && typeof data === 'object' && 'items' in data) {
          previousGenerationsQueries.set(queryKey, data);

          const oldItem = (data as any).items.find((g: any) => g.id === id);
          const updated = {
            ...data,
            items: (data as any).items.map((g: any) => (g.id === id ? { ...g, starred } : g)),
          };

          console.log('[StarPersist] 🎨 Updating generations cache:', {
            queryKey,
            itemsCount: updated.items.length,
            foundItem: !!oldItem,
            oldStarred: oldItem?.starred,
            newStarred: starred,
            updatedItem: updated.items.find((g: any) => g.id === id)
          });

          queryClient.setQueryData(queryKey, updated);
        } else {
          console.log('[StarPersist] ⚠️ Skipping query (no items):', { queryKey, hasData: !!data, dataKeys: data ? Object.keys(data) : [] });
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

      // 3) Optimistically update the EXACT all-shot-generations cache for this shot (used by Timeline/ShotEditor)
      if (shotId) {
        const queryKey = ['all-shot-generations', shotId];
        const previousData = queryClient.getQueryData(queryKey);

        if (previousData && Array.isArray(previousData)) {
          console.log('[StarPersist] 🎯 Found EXACT all-shot-generations query:', { queryKey });
          previousAllShotGenerationsQueries.set(queryKey, previousData);

          const updatedGenerations = previousData.map((gen: any) => {
            if (gen.id === id) {
              console.log('[StarPersist] 🎨 Optimistically updating all-shot-generations cache', {
                queryKey,
                generationId: id,
                oldStarred: gen.starred,
                newStarred: starred
              });
              return { ...gen, starred };
            }
            return gen;
          });
          queryClient.setQueryData(queryKey, updatedGenerations);
        } else {
          console.log('[StarPersist] ⚠️ Could not find EXACT all-shot-generations query in cache for key:', { queryKey, hasPreviousData: !!previousData, isArray: Array.isArray(previousData) });
        }
      } else {
        console.log('[StarPersist] ⚠️ No shotId provided, skipping all-shot-generations cache update.');
      }

      console.log('[StarDebug:useToggleGenerationStar] onMutate complete', {
        generationsQueriesUpdated: previousGenerationsQueries.size,
        shotsQueriesUpdated: previousShotsQueries.size,
        allShotGenerationsQueriesUpdated: previousAllShotGenerationsQueries.size
      });

      return { previousGenerationsQueries, previousShotsQueries, previousAllShotGenerationsQueries };
    },
    onError: (error: Error, _variables, context) => {
      console.error('[StarPersist] ❌ onError: Mutation failed, rolling back', {
        error: error.message,
        variables: _variables
      });

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
      if (context?.previousAllShotGenerationsQueries) {
        context.previousAllShotGenerationsQueries.forEach((data, key) => {
          queryClient.setQueryData(key, data);
        });
      }

      console.error('Error toggling generation star:', error);
      toast.error(error.message || 'Failed to toggle star');
    },
    onSuccess: (data, variables) => {
      console.log('[StarPersist] ✅ onSuccess: Mutation completed successfully', {
        variables,
        data,
        willWaitForRealtime: true
      });
      // Emit domain event for generation star toggle
      // Generation star toggle events are now handled by DataFreshnessManager via realtime events

      // Emit custom event so Timeline knows to refetch star data
      if (variables.shotId) {
        console.log('[StarPersist] 📢 Emitting star-updated event for shot:', variables.shotId);
        window.dispatchEvent(new CustomEvent('generation-star-updated', {
          detail: { generationId: variables.id, shotId: variables.shotId, starred: variables.starred }
        }));
      }

      console.log('[StarPersist] ✨ Optimistic updates complete - all caches updated');
    },
    onSettled: () => {
      console.log('[StarPersist] 🏁 onSettled: Mutation lifecycle complete');
    },
  });
}
