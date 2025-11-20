import { useInfiniteQuery, useQuery, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { GenerationRow, TimelineGenerationRow } from '@/types/shots';
import { isTimelineGeneration } from '@/shared/lib/typeGuards';
import React from 'react';

interface ShotGenerationsPage {
  items: GenerationRow[];
  nextCursor: number | null;
}

const PAGE_SIZE = 100; // Reasonable page size for UI performance

// Hook for paginated shot generations
export const useShotGenerations = (
  shotId: string | null
): UseInfiniteQueryResult<ShotGenerationsPage> => {
  return useInfiniteQuery({
    queryKey: ['unified-generations', 'shot', shotId],
    enabled: !!shotId,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: { pageParam: number; signal?: AbortSignal }) => {
      // Don't throw immediately on abort - let the fetch fail naturally

      const { data, error } = await supabase
        .from('shot_generations')
        .select(`
          *,
          generation:generations(*)
        `)
        .eq('shot_id', shotId!)
        .order('timeline_frame', { ascending: true })
        .range(pageParam, pageParam + PAGE_SIZE - 1)
        .abortSignal(signal);

      if (error) {
        // Handle 400 errors gracefully
        if ((error as any).code === 'PGRST116' || error.message?.includes('Invalid')) {
          console.warn('[useShotGenerations] Invalid shot ID or query parameters:', { shotId, error });
          return { items: [], nextCursor: null };
        }
        throw error;
      }

      // Transform to match GenerationRow interface
      const items: GenerationRow[] = (data || [])
        .filter(sg => sg.generation)
        .map(sg => {
          // [MagicEditTaskDebug] Log magic edit generations from database
          if (sg.generation?.type === 'image_edit' || sg.generation?.params?.tool_type === 'magic-edit') {
            console.log('[MagicEditTaskDebug] Magic edit generation from database:', {
              generation_id: sg.generation?.id?.substring(0, 8),
              shot_generation_id: sg.id.substring(0, 8),
              timeline_frame: sg.timeline_frame,
              type: sg.generation?.type,
              tool_type: sg.generation?.params?.tool_type,
              created_at: sg.generation?.created_at
            });
          }
          
          return {
            ...sg.generation,
            shotImageEntryId: sg.id,
            shot_generation_id: sg.id,
            position: Math.floor((sg.timeline_frame ?? 0) / 50),
            timeline_frame: sg.timeline_frame, // Include timeline_frame for filtering and ordering
            imageUrl: sg.generation?.location || sg.generation?.imageUrl,
            thumbUrl: sg.generation?.location || sg.generation?.thumbUrl,
          };
        });

      return {
        items,
        nextCursor: data?.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry cancelled requests or 400 errors
      if (error?.message?.includes('Request was cancelled') || 
          (error as any)?.code === 'PGRST116' || 
          error?.message?.includes('Invalid')) {
        return false;
      }
      // Retry up to 2 times for other errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 3000),
  });
};

// Hook for getting unpositioned count
export const useUnpositionedGenerationsCount = (
  shotId: string | null
): UseQueryResult<number> => {
  const smartPollingConfig = useSmartPollingConfig(['unpositioned-count', shotId]);
  return useQuery({
    queryKey: ['unpositioned-count', shotId],
    enabled: !!shotId,
    queryFn: async () => {
      // Try to use the database function first
      const { data, error } = await supabase
        .rpc('count_unpositioned_generations', { p_shot_id: shotId! });

      if (!error && data !== null) {
        return data as number;
      }

      // Fallback to manual count if function doesn't exist
      const { count, error: countError } = await supabase
        .from('shot_generations')
        .select('generation_id', { count: 'exact', head: true })
        .eq('shot_id', shotId!)
        .is('timeline_frame', null);

      if (countError) throw countError;

      // We need to filter out videos, so fetch the actual records
      const { data: unpositioned } = await supabase
        .from('shot_generations')
        .select('generation:generations(type)')
        .eq('shot_id', shotId!)
        .is('timeline_frame', null);

      const nonVideoCount = (unpositioned || []).filter(
        sg => !(sg.generation as any)?.type?.includes('video')
      ).length;

      return nonVideoCount;
    },
    // Smart polling: intelligent intervals based on realtime health
    ...smartPollingConfig,
  });
};

/**
 * Hook for loading ALL shot generations (non-paginated) with TWO-PHASE LOADING
 * 
 * **PERFORMANCE OPTIMIZATION:**
 * This hook uses a two-phase progressive loading strategy for maximum speed:
 * 
 * **Phase 1 (FAST):** Query generations table with shot_data JSONB filter
 * - No joins = instant results (~50-200ms even for large datasets)
 * - Uses GIN index on shot_data for fast filtering
 * - Returns images immediately for rendering
 * - Missing: shot_generations.id (needed for mutations), metadata (pair prompts)
 * 
 * **Phase 2 (REQUIRED):** Query shot_generations table for mutation data
 * - Fetches shotImageEntryId (required for reorder/delete/duplicate)
 * - Fetches metadata (pair prompts, enhanced prompts)
 * - Merges into Phase 1 data when complete
 * - For large datasets (2000+ items), uses batched queries to avoid PostgreSQL limits
 * - Retries on failure (exponential backoff)
 * - Mutations are blocked until Phase 2 completes
 * 
 * **Data Loaded:**
 * - All shot_generations for the shot (positioned + unpositioned)
 * - Full generation data (location, type, starred, etc.)
 * - Metadata (pair_prompt, enhanced_prompt, timeline positioning data)
 * 
 * **Use Cases:**
 * - Image galleries and lightboxes
 * - Timeline display (filter to positioned images)
 * - Shot image management
 * 
 * @param shotId - The shot ID to load generations for
 * @param options - Query options
 * @param options.disableRefetch - Prevents refetching during drag/persist operations
 * @returns Query result with GenerationRow[] data (progressively enhanced)
 * 
 * @example
 * ```typescript
 * // General use
 * const { data: allImages } = useAllShotGenerations(shotId);
 * 
 * // With refetch disabled during sensitive operations
 * const { data: images } = useAllShotGenerations(shotId, { disableRefetch: isDragging });
 * ```
 */
export const useAllShotGenerations = (
  shotId: string | null,
  options?: {
    // When true, prevents query from refetching during sensitive operations (drag, persist, etc.)
    disableRefetch?: boolean;
  }
): UseQueryResult<GenerationRow[]> => {
  // [VideoLoadSpeedIssue] AGGRESSIVE THROTTLING: Reduce excessive hook calls
  const stableShotId = React.useMemo(() => shotId, [shotId]);
  const isEnabled = React.useMemo(() => {
    // Disable query when explicitly requested (e.g., during drag/persist operations)
    if (options?.disableRefetch) {
      return false;
    }
    return !!stableShotId;
  }, [stableShotId, options?.disableRefetch]);
  
  // [VideoLoadSpeedIssue] Enhanced logging to track when hook is called
  const lastLogRef = React.useRef(0);
  const now = Date.now();
  if (now - lastLogRef.current > 500) { // Reduced to every 500ms to catch rapid calls
    console.log('[TwoPhaseLoad] useAllShotGenerations hook called:', { 
      shotId: stableShotId, 
      enabled: isEnabled,
      disableRefetch: options?.disableRefetch,
      timestamp: now 
    });
    lastLogRef.current = now;
  }

  // ============================================================================
  // PHASE 1: FAST - Query from generations table (no joins)
  // ============================================================================
  const phase1Query = useQuery({
    queryKey: ['shot-generations-fast', stableShotId],
    enabled: isEnabled,
    refetchOnMount: !options?.disableRefetch,
    refetchOnWindowFocus: !options?.disableRefetch,
    refetchOnReconnect: !options?.disableRefetch,
    placeholderData: (previousData) => previousData, // Keep previous data during refetch (for optimistic updates)
    queryFn: async ({ signal }) => {
      const startTime = Date.now();
      console.log('[TwoPhaseLoad] Phase 1 START - Fast query from generations table', { 
        shotId: stableShotId, 
        timestamp: startTime 
      });

      let data, error;
      try {
        const response = await supabase
          .from('generations')
          .select(`
            id,
            location,
            thumbnail_url,
            type,
            created_at,
            starred,
            upscaled_url,
            name,
            based_on,
            params,
            shot_data
          `)
          .not(`shot_data->${stableShotId}`, 'is', null) // GIN index filter on shot_data JSONB
          .order('created_at', { ascending: false })
          .abortSignal(signal);
        
        data = response.data;
        error = response.error;
        
        console.log('[TwoPhaseLoad] Phase 1 query response:', {
          shotId: stableShotId,
          hasData: !!data,
          dataCount: data?.length || 0,
          hasError: !!error,
          errorCode: error?.code,
          errorMessage: error?.message,
          errorDetails: error?.details,
          errorHint: error?.hint,
        });
      } catch (err) {
        console.error('[TwoPhaseLoad] Phase 1 EXCEPTION:', {
          shotId: stableShotId,
          error: err,
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
        });
        throw err;
      }

      if (error) {
        console.error('[TwoPhaseLoad] Phase 1 ERROR:', {
          shotId: stableShotId,
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        
        if (error.code === 'PGRST116' || error.message?.includes('Invalid')) {
          console.warn('[TwoPhaseLoad] Phase 1 - Invalid shot ID:', { shotId: stableShotId, error });
          return [];
        }
        throw error;
      }

      // Transform data - extract timeline_frame from shot_data JSONB
      const result = (data || []).map(gen => {
        const timelineFrame = gen.shot_data?.[stableShotId!];
        return {
          ...gen,
          timeline_frame: timelineFrame,
          position: timelineFrame != null ? Math.floor(timelineFrame / 50) : null,
          imageUrl: gen.location,
          thumbUrl: gen.thumbnail_url || gen.location,
          // These will be populated in Phase 2
          shotImageEntryId: null, 
          shot_generation_id: null,
          metadata: {}, // Default to empty object so isTimelineGeneration passes immediately
        };
      });

      // Sort by timeline_frame (nulls last)
      result.sort((a, b) => {
        if (a.timeline_frame == null && b.timeline_frame == null) return 0;
        if (a.timeline_frame == null) return 1;
        if (b.timeline_frame == null) return -1;
        return a.timeline_frame - b.timeline_frame;
      });

      const duration = Date.now() - startTime;
      console.log('[TwoPhaseLoad] Phase 1 COMPLETE - Fast query finished', { 
        shotId: stableShotId, 
        resultCount: result.length,
        duration: `${duration}ms`,
        timestamp: Date.now() 
      });
      
      console.log('[DataTrace] 📦 DB → Phase 1 complete:', {
        shotId: stableShotId?.substring(0, 8),
        total: result.length,
        positioned: result.filter(r => r.timeline_frame != null && r.timeline_frame >= 0).length,
        unpositioned: result.filter(r => r.timeline_frame == null).length,
      });

      return result;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (error?.message?.includes('Request was cancelled') || 
          (error as any)?.code === 'PGRST116' || 
          error?.message?.includes('Invalid')) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 3000),
  });

  // ============================================================================
  // PHASE 2: LAZY - Query from shot_generations table (metadata & IDs)
  // ============================================================================
  const generationIds = React.useMemo(() => 
    phase1Query.data?.map(gen => gen.id) || [], 
    [phase1Query.data]
  );

  const phase2Query = useQuery({
    queryKey: ['shot-generations-meta', stableShotId, generationIds.length],
    enabled: isEnabled && generationIds.length > 0,
    refetchOnMount: !options?.disableRefetch,
    refetchOnWindowFocus: !options?.disableRefetch,
    refetchOnReconnect: !options?.disableRefetch,
    placeholderData: (previousData) => previousData, // Keep previous data during refetch
    queryFn: async ({ signal }) => {
      const startTime = Date.now();
      const BATCH_SIZE = 500; // PostgreSQL .in() works well with ~500 items max
      
      console.log('[TwoPhaseLoad] Phase 2 START - Loading metadata (required for mutations)', { 
        shotId: stableShotId,
        generationCount: generationIds.length,
        needsBatching: generationIds.length > BATCH_SIZE,
        timestamp: startTime 
      });

      let allData: any[] = [];
      
      // If we have a large dataset, batch the queries
      if (generationIds.length > BATCH_SIZE) {
        console.log('[TwoPhaseLoad] Phase 2 - Large dataset detected, using batched queries', {
          totalItems: generationIds.length,
          batchSize: BATCH_SIZE,
          batchCount: Math.ceil(generationIds.length / BATCH_SIZE)
        });
        
        // Split IDs into batches
        const batches: string[][] = [];
        for (let i = 0; i < generationIds.length; i += BATCH_SIZE) {
          batches.push(generationIds.slice(i, i + BATCH_SIZE));
        }
        
        // Execute batches in parallel (max 4 concurrent to avoid overwhelming DB)
        const MAX_CONCURRENT = 4;
        for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
          const batchGroup = batches.slice(i, i + MAX_CONCURRENT);
          const batchPromises = batchGroup.map(async (batchIds, batchIndex) => {
            const actualBatchIndex = i + batchIndex;
            console.log(`[TwoPhaseLoad] Phase 2 - Fetching batch ${actualBatchIndex + 1}/${batches.length}`, {
              batchSize: batchIds.length
            });
            
            const response = await supabase
              .from('shot_generations')
              .select('id, generation_id, timeline_frame, metadata')
              .eq('shot_id', stableShotId!)
              .in('generation_id', batchIds)
              .abortSignal(signal);
            
            if (response.error) {
              console.error(`[TwoPhaseLoad] Phase 2 - Batch ${actualBatchIndex + 1} error:`, response.error);
              throw response.error;
            }
            
            return response.data || [];
          });
          
          const batchResults = await Promise.all(batchPromises);
          allData.push(...batchResults.flat());
        }
        
        console.log('[TwoPhaseLoad] Phase 2 - All batches complete', {
          totalBatches: batches.length,
          totalResults: allData.length
        });
      } else {
        // Small dataset, use single query
        const response = await supabase
          .from('shot_generations')
          .select('id, generation_id, timeline_frame, metadata')
          .eq('shot_id', stableShotId!)
          .in('generation_id', generationIds)
          .abortSignal(signal);
        
        if (response.error) {
          throw response.error;
        }
        
        allData = response.data || [];
      }
      
      console.log('[TwoPhaseLoad] Phase 2 query response:', {
        shotId: stableShotId,
        hasData: !!allData,
        dataCount: allData.length,
        requestedCount: generationIds.length,
        missingCount: generationIds.length - allData.length,
      });

      const duration = Date.now() - startTime;
      console.log('[TwoPhaseLoad] Phase 2 COMPLETE - Metadata loaded', { 
        shotId: stableShotId,
        metadataCount: allData.length,
        duration: `${duration}ms`,
        timestamp: Date.now() 
      });

      return allData;
    },
    staleTime: Infinity, // Don't refetch, it's supplementary data
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3, // Retry Phase 2 - it's required for mutations to work
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff: 1s, 2s, 4s
  });

  // ============================================================================
  // MERGE: Combine Phase 1 and Phase 2 data
  // ============================================================================
  
  // Keep track of last valid Phase 2 data to prevent flashing during key changes
  const lastPhase2DataRef = React.useRef<any[]>([]);
  React.useEffect(() => {
    if (phase2Query.data && phase2Query.data.length > 0) {
      lastPhase2DataRef.current = phase2Query.data;
    }
  }, [phase2Query.data]);

  const mergedData = React.useMemo(() => {
    if (!phase1Query.data) return undefined;
    
    // Determine which Phase 2 data to use
    let metaData = phase2Query.data;
    let usingCachedData = false;
    
    // If current Phase 2 is empty/loading but we have cached data, use cache
    // This handles the "key change" scenario where data momentarily disappears
    if ((!metaData || metaData.length === 0) && lastPhase2DataRef.current.length > 0) {
       // Check if we're in a loading state where we expect data but don't have it yet
       if (phase2Query.isLoading || phase2Query.isFetching) {
         console.log('[TwoPhaseLoad] Using cached Phase 2 data during transition');
         metaData = lastPhase2DataRef.current;
         usingCachedData = true;
       }
    }
    
    // If Phase 2 hasn't loaded yet (and no cache), return Phase 1 data
    // (user can see images immediately, mutations will work once Phase 2 loads)
    if (!metaData || metaData.length === 0) {
      console.log('[TwoPhaseLoad] Using Phase 1 data only (Phase 2 pending)', {
        shotId: stableShotId,
        imageCount: phase1Query.data.length,
        phase2Status: phase2Query.status
      });
      return phase1Query.data;
    }

    // Create lookup map for Phase 2 data
    const metadataMap = new Map(
      metaData.map((sg: any) => [sg.generation_id, sg])
    );

    // Merge Phase 2 data into Phase 1 data
    const merged = phase1Query.data.map(gen => {
      const shotGen = metadataMap.get(gen.id);
      if (shotGen) {
        return {
          ...gen,
          shotImageEntryId: shotGen.id,
          shot_generation_id: shotGen.id,
          metadata: shotGen.metadata,
          // Use Phase 2 timeline_frame if available (more authoritative)
          timeline_frame: shotGen.timeline_frame ?? gen.timeline_frame,
        };
      }
      return gen;
    });

    console.log('[TwoPhaseLoad] Merged Phase 1 + Phase 2 data', {
      shotId: stableShotId,
      totalImages: merged.length,
      withMetadata: merged.filter(g => g.metadata).length,
      withShotGenId: merged.filter(g => g.shotImageEntryId).length,
      usingCachedData
    });
    
    console.log('[DataTrace] 📦 DB → Phase 2 merged:', {
      shotId: stableShotId?.substring(0, 8),
      total: merged.length,
      withMutationIds: merged.filter(g => g.shotImageEntryId).length,
      withMetadata: merged.filter(g => g.metadata).length,
    });

    return merged;
  }, [phase1Query.data, phase2Query.data, phase2Query.isLoading, phase2Query.isFetching, stableShotId]);

  // ============================================================================
  // Return merged query result with phase status
  // ============================================================================
  const result = {
    ...phase1Query,
    data: mergedData,
    // Consider both phases for loading state (but prioritize Phase 1 for perceived speed)
    isLoading: phase1Query.isLoading,
    isFetching: phase1Query.isFetching || phase2Query.isFetching,
  } as UseQueryResult<GenerationRow[]>;

  // Add custom property to indicate if mutations are safe
  // Components can check this before enabling mutation buttons
  (result as any).isPhase2Complete = !!(
    phase2Query.data && 
    phase2Query.data.length > 0 && 
    !phase2Query.isLoading && 
    !phase2Query.isFetching &&
    !phase2Query.error
  );

  // Add custom property to check if any images are missing mutation IDs
  (result as any).hasMissingMutationIds = !!(
    mergedData && 
    mergedData.some(img => !img.shotImageEntryId)
  );
  
  // Expose Phase 2 loading and error states for UI feedback
  (result as any).isPhase2Loading = phase2Query.isLoading || phase2Query.isFetching;
  (result as any).phase2Error = phase2Query.error;

  console.log('[TwoPhaseLoad] Query result status:', {
    shotId: stableShotId,
    phase1Status: phase1Query.status,
    phase1FetchStatus: phase1Query.fetchStatus,
    phase1Complete: !!phase1Query.data,
    phase1Loading: phase1Query.isLoading,
    phase1Fetching: phase1Query.isFetching,
    phase1Error: phase1Query.error,
    phase2Status: phase2Query.status,
    phase2FetchStatus: phase2Query.fetchStatus,
    phase2Complete: (result as any).isPhase2Complete,
    phase2Loading: phase2Query.isLoading,
    phase2Fetching: phase2Query.isFetching,
    phase2Enabled: phase2Query.isEnabled,
    generationIdsCount: generationIds.length,
    hasMissingMutationIds: (result as any).hasMissingMutationIds,
    totalImages: mergedData?.length || 0,
    imagesWithIds: mergedData?.filter(img => img.shotImageEntryId).length || 0,
  });

  return result;
};

/**
 * Specialized hook for timeline-specific shot generations
 * Returns only positioned images with metadata (required for pair prompts)
 * 
 * This is a typed wrapper around useAllShotGenerations that:
 * 1. Filters to only positioned images (timeline_frame != null)
 * 2. Filters to only images with metadata (required for pair prompts)
 * 3. Returns TimelineGenerationRow type (guarantees metadata exists)
 * 
 * @param shotId - The shot ID to load generations for
 * @param options - Query options (disableRefetch, etc.)
 * @returns Query result with TimelineGenerationRow[] data
 * 
 * @example
 * ```typescript
 * const { data: timelineImages } = useTimelineShotGenerations(shotId);
 * // TypeScript knows timelineImages have metadata
 * timelineImages?.forEach(img => {
 *   console.log(img.metadata.pair_prompt); // No type error!
 * });
 * ```
 */
export const useTimelineShotGenerations = (
  shotId: string | null,
  options?: {
    disableRefetch?: boolean;
  }
): UseQueryResult<TimelineGenerationRow[]> => {
  const baseQuery = useAllShotGenerations(shotId, options);
  
  // Transform the data to filter and type-narrow
  const timelineData = React.useMemo(() => {
    if (!baseQuery.data) return undefined;
    
    // Filter to only timeline generations (positioned + has metadata)
    const filtered = baseQuery.data.filter(isTimelineGeneration);
    
    console.log('[useTimelineShotGenerations] Filtered timeline generations:', {
      shotId,
      totalGenerations: baseQuery.data.length,
      timelineGenerations: filtered.length,
      filteredOut: baseQuery.data.length - filtered.length
    });
    
    return filtered;
  }, [baseQuery.data, shotId]);
  
  return {
    ...baseQuery,
    data: timelineData
  };
}; 