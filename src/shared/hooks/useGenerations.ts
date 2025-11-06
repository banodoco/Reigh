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
  
  console.error('[ShotFilterPagination] 🚀 fetchGenerations called:', {
    projectId: projectId?.substring(0, 8),
    limit,
    offset,
    filters,
    timestamp: Date.now()
  });
  
  if (!projectId) {
    console.error('[ShotFilterPagination] ❌ No projectId, returning empty');
    return { items: [], total: 0, hasMore: false };
  }
  
  // Build count query
  let countQuery = supabase
    .from('generations')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  // Apply server-side filters to count query
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

  // Apply search filter to count query
  if (filters?.searchTerm?.trim()) {
    // Search in the main prompt location first (most common)
    const searchPattern = `%${filters.searchTerm.trim()}%`;
    countQuery = countQuery.ilike('params->originalParams->orchestrator_details->>prompt', searchPattern);
  }

  // Store shot filter IDs for later use in data query
  let shotFilterGenerationIds: string[] | null = null;
  let usedChunkedCounting = false;
  
  console.error('[ShotFilterPagination] 🔍 Shot filter check for COUNT');
  console.error('[ShotFilterPagination] Has shotId?:', !!filters?.shotId);
  console.error('[ShotFilterPagination] shotId value:', filters?.shotId);
  
  // Apply shot filter if provided
  if (filters?.shotId) {
    console.error('[ShotFilterPagination] ✅ Applying shot filter to COUNT query');
    console.error('[ShotFilterPagination] Shot ID:', filters.shotId.substring(0, 8));
    console.error('[ShotFilterPagination] Exclude positioned:', filters.excludePositioned);
    
    // Get generation IDs associated with this shot
    const { data: shotGenerations, error: sgError } = await supabase
      .from('shot_generations')
      .select('generation_id, timeline_frame')
      .eq('shot_id', filters.shotId);
    
    console.error('[ShotFilterPagination] 📊 Shot generations lookup completed');
    console.error('[ShotFilterPagination] Has error:', !!sgError);
    console.error('[ShotFilterPagination] Result count:', shotGenerations?.length || 0);
    
    if (sgError) {
      console.error('[ShotFilterPagination] ❌ Shot generations lookup failed:', sgError);
      throw sgError;
    }
    
    let generationIds = shotGenerations?.map(sg => sg.generation_id) || [];
    
    // Filter by timeline_frame if excludePositioned is true
    if (filters.excludePositioned) {
      const unpositionedIds = shotGenerations
        ?.filter(sg => sg.timeline_frame === null || sg.timeline_frame === undefined)
        .map(sg => sg.generation_id) || [];
      
      console.error('[ShotFilterPagination] 🎯 Filtering to unpositioned only');
      console.error('[ShotFilterPagination] Before filter:', generationIds.length);
      console.error('[ShotFilterPagination] After filter:', unpositionedIds.length);
      
      generationIds = unpositionedIds;
    }
    
    console.error('[ShotFilterPagination] ✅ Final generation IDs');
    console.error('[ShotFilterPagination] ID count:', generationIds.length);
    console.error('[ShotFilterPagination] Sample IDs:', generationIds.slice(0, 5).map(id => id.substring(0, 8)));
    
    if (generationIds.length === 0) {
      console.error('[ShotFilterPagination] ⚠️ No generations found for shot filter, returning empty');
      return { items: [], total: 0, hasMore: false };
    }
    
    // Store for use in data query
    shotFilterGenerationIds = generationIds;
    console.error('[ShotFilterPagination] 📌 Stored shotFilterGenerationIds for data query:', generationIds.length, 'IDs');
    
    // 🔧 FIX: Chunk large ID arrays to avoid Postgres IN clause limits
    // Postgres has a limit on the number of parameters in an IN clause (~1000)
    const CHUNK_SIZE = 500; // Use 500 to be safe
    
    if (generationIds.length > CHUNK_SIZE) {
      console.error('[ShotFilterPagination] 🔄 Large ID set detected, using chunked count');
      console.error('[ShotFilterPagination] Total IDs:', generationIds.length);
      console.error('[ShotFilterPagination] Chunk size:', CHUNK_SIZE);
      
      usedChunkedCounting = true;
      
      // For large ID sets, count by summing chunks
      let chunkCount = 0;
      const chunks = Math.ceil(generationIds.length / CHUNK_SIZE);
      console.error('[ShotFilterPagination] Number of chunks:', chunks);
      
      for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min((i + 1) * CHUNK_SIZE, generationIds.length);
        const chunk = generationIds.slice(start, end);
        
        console.error(`[ShotFilterPagination] Processing chunk ${i + 1}/${chunks} (${chunk.length} IDs)`);
        
        // Create a fresh query for each chunk
        let chunkQuery = supabase
          .from('generations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('id', chunk);
        
        const { count: chunkCountResult, error: chunkError } = await chunkQuery;
        
        if (chunkError) {
          console.error(`[ShotFilterPagination] ❌ Chunk ${i + 1} error:`, chunkError);
          throw chunkError;
        }
        
        chunkCount += chunkCountResult || 0;
        console.error(`[ShotFilterPagination] Chunk ${i + 1} count:`, chunkCountResult);
      }
      
      console.error('[ShotFilterPagination] 📊 Total count from chunks:', chunkCount);
      totalCount = chunkCount;
    } else {
      // Small ID set, use normal IN clause
      console.error('[ShotFilterPagination] Using standard IN clause (<= 500 IDs)');
      countQuery = countQuery.in('id', generationIds);
    }
  }

  // 🚀 PERFORMANCE FIX: Skip expensive count query for small pages
  // DISABLED: Enable full count for accurate pagination
  // Also skip if we already counted via chunking
  const shouldSkipCount = usedChunkedCounting; // || (limit <= 100 && !filters?.searchTerm?.trim());
  
  if (!shouldSkipCount) {
    const { count, error: countError } = await countQuery;
    console.error('[ShotFilterPagination] 🔢 Count query completed');
    console.error('[ShotFilterPagination] Count:', count);
    console.error('[ShotFilterPagination] Has Error:', !!countError);
    console.error('[ShotFilterPagination] About to check if error exists...');
    if (countError) {
      console.error('[ShotFilterPagination] ❌ COUNT QUERY ERROR DETECTED');
      console.error('[ShotFilterPagination] Error message:', countError?.message);
      console.error('[ShotFilterPagination] Error details:', countError?.details);
      console.error('[ShotFilterPagination] Error hint:', countError?.hint);
      console.error('[ShotFilterPagination] Error code:', countError?.code);
      console.error('[ShotFilterPagination] Full error object:', countError);
      console.error('[ShotFilterPagination] Error JSON:', JSON.stringify(countError));
      console.error('[ShotFilterPagination] Applied filters:', filters);
      throw countError;
    }
    console.error('[ShotFilterPagination] No error, continuing...');
    totalCount = count || 0;
    console.error('[ShotFilterPagination] Total count set to:', totalCount);
  } else {
    console.error('[ShotFilterPagination] ⚡ Skipped count query (using limit+1 pattern)');
  }
  
  console.error('[ShotFilterPagination] ✅ Count phase complete, starting data query setup');

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
      tasks,
      based_on,
      upscaled_url,
      shot_generations(shot_id, timeline_frame)
    `)
    .eq('project_id', projectId);

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

  // Apply search filter to data query
  if (filters?.searchTerm?.trim()) {
    // Search in the main prompt location first (most common)
    const searchPattern = `%${filters.searchTerm.trim()}%`;
    dataQuery = dataQuery.ilike('params->originalParams->orchestrator_details->>prompt', searchPattern);
  }

  // Apply shot filter to data query - use IDs we already fetched
  console.error('[ShotFilterPagination] 🔍 DATA query shot filter check');
  console.error('[ShotFilterPagination] Has shotId filter?:', !!filters?.shotId);
  console.error('[ShotFilterPagination] shotId value:', filters?.shotId?.substring(0, 8));
  console.error('[ShotFilterPagination] shotFilterGenerationIds set?:', !!shotFilterGenerationIds);
  console.error('[ShotFilterPagination] shotFilterGenerationIds count:', shotFilterGenerationIds?.length);
  
  if (filters?.shotId && shotFilterGenerationIds) {
    const generationIds = shotFilterGenerationIds;
    const CHUNK_SIZE = 500;
    
    console.error('[ShotFilterPagination] ✅ Applying shot filter to DATA query');
    console.error('[ShotFilterPagination] ID count:', generationIds.length);
    console.error('[ShotFilterPagination] Offset:', offset);
    console.error('[ShotFilterPagination] Limit:', limit);
    
    // 🔧 FIX: For large ID sets, we need to use chunked querying
    // Cannot use .in() with 1000+ IDs due to Postgres parameter limits
    if (generationIds.length > CHUNK_SIZE) {
      console.error('[ShotFilterPagination] 🔄 Large ID set for DATA query, using optimized chunked fetch');
      console.error('[ShotFilterPagination] Total IDs:', generationIds.length);
      
      // OPTIMIZED Strategy: 
      // 1. Fetch ONLY id + created_at for all matching records (lightweight)
      // 2. Sort by created_at client-side
      // 3. Get IDs for the specific page needed
      // 4. Fetch full data for ONLY those page IDs (small query)
      
      console.error('[ShotFilterPagination] Step 1: Fetching lightweight id+timestamp data');
      let allIdTimestamps: Array<{ id: string; created_at: string }> = [];
      const chunks = Math.ceil(generationIds.length / CHUNK_SIZE);
      
      for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min((i + 1) * CHUNK_SIZE, generationIds.length);
        const chunk = generationIds.slice(start, end);
        
        console.error(`[ShotFilterPagination] Fetching timestamps chunk ${i + 1}/${chunks} (${chunk.length} IDs)`);
        
        // Fetch ONLY id and created_at (very lightweight)
        let chunkQuery = supabase
          .from('generations')
          .select('id, created_at')
          .eq('user_id', userId)
          .in('id', chunk);
        
        const { data: chunkData, error: chunkError } = await chunkQuery;
        
        if (chunkError) {
          console.error(`[ShotFilterPagination] ❌ Timestamp chunk ${i + 1} error:`, chunkError);
          throw chunkError;
        }
        
        if (chunkData) {
          allIdTimestamps = allIdTimestamps.concat(chunkData);
          console.error(`[ShotFilterPagination] Timestamp chunk ${i + 1} fetched:`, chunkData.length, 'records');
        }
      }
      
      console.error('[ShotFilterPagination] Step 2: Sorting by created_at');
      console.error('[ShotFilterPagination] Total records:', allIdTimestamps.length);
      
      // Sort by created_at descending (same as ORDER BY in query)
      allIdTimestamps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // Get IDs for the specific page
      const pageIdTimestamps = allIdTimestamps.slice(offset, offset + limit);
      const pageIds = pageIdTimestamps.map(item => item.id);
      
      console.error('[ShotFilterPagination] Step 3: Identified page IDs');
      console.error('[ShotFilterPagination] Page IDs count:', pageIds.length);
      console.error('[ShotFilterPagination] Sample page IDs:', pageIds.slice(0, 5).map(id => id.substring(0, 8)));
      
      if (pageIds.length === 0) {
        console.error('[ShotFilterPagination] No items for this page');
        return {
          items: [],
          total: totalCount,
          hasMore: false
        };
      }
      
      // Fetch full data for ONLY the page IDs (small query, no chunking needed)
      console.error('[ShotFilterPagination] Step 4: Fetching full data for page IDs');
      const { data: pageItems, error: pageError } = await supabase
        .from('generations')
        .select(`
          id,
          type,
          params,
          status,
          created_at,
          output,
          error,
          user_id,
          starred
        `)
        .in('id', pageIds);
      
      if (pageError) {
        console.error('[ShotFilterPagination] ❌ Page data fetch error:', pageError);
        throw pageError;
      }
      
      console.error('[ShotFilterPagination] Page data fetched:', pageItems?.length || 0, 'items');
      
      // Sort page items to match the order from our sorted timestamps
      const sortedPageItems = pageIds
        .map(id => pageItems?.find(item => item.id === id))
        .filter(Boolean);
      
      const hasMore = allIdTimestamps.length > offset + limit;
      
      console.error('[ShotFilterPagination] ✅ Optimized pagination complete');
      console.error('[ShotFilterPagination] Returned items:', sortedPageItems.length);
      console.error('[ShotFilterPagination] Has more pages:', hasMore);
      
      return {
        items: sortedPageItems,
        total: totalCount,
        hasMore
      };
    } else {
      // Small ID set, use normal IN clause
      console.error('[ShotFilterPagination] Using standard IN clause for DATA query (<= 500 IDs)');
      dataQuery = dataQuery.in('id', generationIds);
    }
  }

  // 🚀 PERFORMANCE FIX: Use limit+1 pattern for fast pagination when count is skipped
  const fetchLimit = shouldSkipCount ? limit + 1 : limit;
  
  // Execute query with standard server-side pagination
  // The ORDER BY ensures consistent ordering even when using .in() filter
  console.error('[ShotFilterPagination] 🚀 About to execute main query');
  console.error('[ShotFilterPagination] Offset:', offset);
  console.error('[ShotFilterPagination] Fetch limit:', fetchLimit);
  console.error('[ShotFilterPagination] Range:', `${offset}-${offset + fetchLimit - 1}`);
  console.error('[ShotFilterPagination] Has filters?:', !!filters);
  console.error('[ShotFilterPagination] Has shot filter?:', !!filters?.shotId);
  console.error('[ShotFilterPagination] Note: This should NOT execute if large shot filter returned early');
  
  const queryStartTime = Date.now();
  const { data, error } = await dataQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + fetchLimit - 1);
  
  const queryDuration = Date.now() - queryStartTime;
  
  console.error('[ShotFilterPagination] 📦 Main query completed:', {
    duration: `${queryDuration}ms`,
    itemsReturned: data?.length || 0,
    hasError: !!error,
    errorMessage: error?.message,
    errorDetails: error,
    offset,
    fetchLimit,
    range: `${offset}-${offset + fetchLimit - 1}`,
    firstItemId: data?.[0]?.id?.substring(0, 8),
    lastItemId: data?.[data.length - 1]?.id?.substring(0, 8),
    allReturnedIds: data?.map(d => d.id?.substring(0, 8)).join(', '),
    WARNING: data?.length === 0 ? '⚠️ EMPTY RESULT SET - This page will show as empty!' : null
  });
  
  if (error) {
    console.error('[ShotFilterPagination] ❌ Main query FAILED:', {
      error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      queryParams: {
        offset,
        limit: fetchLimit,
        filters
      }
    });
    throw error;
  }
  
  if (!data) {
    console.error('[ShotFilterPagination] ❌ Main query returned null/undefined');
    return { items: [], total: totalCount, hasMore: false };
  }

  // [UpscaleDebug] ALWAYS log to confirm function is running
  console.log('[UpscaleDebug] ===== fetchGenerations called =====', {
    projectId,
    totalItems: data?.length || 0,
    itemsWithUpscaledUrl: data?.filter((item: any) => item.upscaled_url).length || 0,
    allItemIds: data?.slice(0, 3).map((item: any) => ({
      id: item.id?.substring(0, 8),
      hasUpscaledUrl: !!item.upscaled_url,
      upscaledUrl: item.upscaled_url ? item.upscaled_url.substring(0, 60) + '...' : 'NONE',
      location: item.location ? item.location.substring(0, 60) + '...' : 'NONE'
    }))
  });

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
    // [UpscaleDebug] Preserve existing debug logging
    if (item.upscaled_url) {
      console.log('[UpscaleDebug] Processing item with upscaled_url:', {
        id: item.id?.substring(0, 8),
        upscaled_url: item.upscaled_url?.substring(0, 60)
      });
    }
    
    // Transform using shared function - handles all the complex logic
    return transformGeneration(item as RawGeneration, {
      shotId: filters?.shotId,
      verbose: !!item.upscaled_url, // Enable verbose logging for upscaled items
    });
  }) || [];

  console.error('[ShotFilterPagination] 🎉 fetchGenerations returning:', {
    itemsCount: items.length,
    totalCount,
    hasMore,
    offset,
    limit,
    filters: {
      shotId: filters?.shotId?.substring(0, 8),
      excludePositioned: filters?.excludePositioned,
      toolType: filters?.toolType,
      mediaType: filters?.mediaType
    },
    firstItemId: items[0]?.id?.substring(0, 8),
    lastItemId: items[items.length - 1]?.id?.substring(0, 8),
    allItemIds: items.map(i => i.id?.substring(0, 8)).join(', '),
    expectedRange: `${offset}-${offset + limit - 1}`,
    WARNING: items.length === 0 ? '⚠️⚠️⚠️ RETURNING EMPTY ARRAY - UI WILL SHOW NO ITEMS!' : null,
    timestamp: Date.now()
  });

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

// NOTE: useGetTaskIdForGeneration moved to generationTaskBridge.ts for centralization
// Import from: import { useGetTaskIdForGeneration } from '@/shared/lib/generationTaskBridge';

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
    console.log('[BasedOnDebug] 🔍 useGenerations mapping item:');
    console.log('  itemId:', item.id?.substring(0, 8));
    console.log('  hasBasedOnField:', !!item.based_on);
    console.log('  basedOnValue:', item.based_on);
    console.log('  hasBasedOnInParams:', !!(item.params?.based_on));
    console.log('  basedOnInParams:', item.params?.based_on);
    console.log('  allItemKeys:', Object.keys(item));
    console.log('  paramsKeys:', item.params ? Object.keys(item.params) : 'no params');
    console.log('  timestamp:', Date.now());
    
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
    
    console.log('[BasedOnDebug] ✅ Created baseItem:');
    console.log('  baseItemId:', baseItem.id?.substring(0, 8));
    console.log('  baseItem.based_on:', baseItem.based_on);
    console.log('  baseItemKeys:', Object.keys(baseItem));
    
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