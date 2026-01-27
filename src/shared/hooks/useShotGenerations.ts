import { useInfiniteQuery, useQuery, useQueryClient, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { GenerationRow, TimelineGenerationRow, Shot } from '@/types/shots';
import { isTimelineGeneration } from '@/shared/lib/typeGuards';
import { QUERY_PRESETS, STANDARD_RETRY, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import React from 'react';

import { mapShotGenerationToRow } from '@/shared/hooks/useShots';

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

      // Fetch with primary variant for correct display URLs
      const { data, error } = await supabase
        .from('shot_generations')
        .select(`
          *,
          generation:generations!shot_generations_generation_id_generations_id_fk(
            *,
            primary_variant:generation_variants!generations_primary_variant_id_fkey (
              location,
              thumbnail_url
            )
          )
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

      // Transform using shared mapper to ensure consistency
      const items: GenerationRow[] = (data || [])
        .map(mapShotGenerationToRow)
        .filter(Boolean) as GenerationRow[];

      return {
        items,
        nextCursor: data?.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Use realtimeBacked preset - data freshness from realtime + mutations
    ...QUERY_PRESETS.realtimeBacked,
    staleTime: 0, // CRITICAL: Always refetch from DB when opening shot, even if primed
    retryDelay: STANDARD_RETRY_DELAY,
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
        .select('generation:generations!shot_generations_generation_id_generations_id_fk(type)')
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
 * Hook for loading ALL shot generations (non-paginated)
 * 
 * **ARCHITECTURE:**
 * Single query to shot_generations with join to generations table.
 * Returns complete data in one request for simplicity and reliability.
 * 
 * **Data Loaded:**
 * - All shot_generations for the shot (positioned + unpositioned)
 * - Full generation data (location, type, starred, etc.)
 * - Metadata (pair_prompt, enhanced_prompt, timeline positioning data)
 * - shotImageEntryId (required for mutations)
 * 
 * **Cache Sync:**
 * When data is loaded, automatically updates the shots list cache
 * to keep shot list views in sync with editor views.
 * 
 * **Use Cases:**
 * - Image galleries and lightboxes
 * - Timeline display (filter to positioned images)
 * - Shot image management
 * 
 * @param shotId - The shot ID to load generations for
 * @param options - Query options
 * @param options.disableRefetch - Prevents refetching during drag/persist operations
 * @returns Query result with GenerationRow[] data
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
  const stableShotId = React.useMemo(() => shotId, [shotId]);
  const isEnabled = React.useMemo(() => {
    if (options?.disableRefetch) {
      return false;
    }
    return !!stableShotId;
  }, [stableShotId, options?.disableRefetch]);
  
  // Get queryClient for cache access in queryFn (for abort handling)
  const queryClient = useQueryClient();
  
  // ============================================================================
  // SINGLE QUERY: Fetch from shot_generations with join to generations
  // This replaces the previous two-phase approach for simpler, more reliable data
  // ============================================================================
  const mainQuery = useQuery<GenerationRow[], Error>({
    queryKey: ['all-shot-generations', stableShotId],
    enabled: isEnabled,
    // Use realtimeBacked preset - data freshness from realtime + mutations
    // (invalidated by SimpleRealtimeProvider + useGenerationInvalidation)
    ...QUERY_PRESETS.realtimeBacked,
    staleTime: 0, // CRITICAL: Always refetch from DB when opening shot, even if primed
    retry: STANDARD_RETRY,
    // NOTE: Removed placeholderData: (previousData) => previousData
    // This was causing cross-shot data leakage - when navigating to a new shot,
    // the previous shot's images would briefly appear as "placeholder" data
    queryFn: async ({ signal }) => {
      const startTime = Date.now();
      console.log('[DataTrace] 🔍 NETWORK FETCH START - all-shot-generations:', {
        shotId: stableShotId?.substring(0, 8),
        timestamp: startTime
      });

      // Query shot_generations with embedded generations data + primary variant
      // NOTE: Must specify FK explicitly to avoid ambiguous relationship error (PGRST201)
      // since there are two FKs between shot_generations and generations
      // We also fetch the primary_variant using the generations.primary_variant_id FK
      // to get the correct display URL (primary variant may differ from generation.location)
      const response = await supabase
        .from('shot_generations')
        .select(`
          id,
          generation_id,
          timeline_frame,
          metadata,
          generation:generations!shot_generations_generation_id_generations_id_fk (
            id,
            location,
            thumbnail_url,
            type,
            created_at,
            starred,
            name,
            based_on,
            params,
            primary_variant_id,
            primary_variant:generation_variants!generations_primary_variant_id_fkey (
              location,
              thumbnail_url
            )
          )
        `)
        .eq('shot_id', stableShotId!)
        .order('timeline_frame', { ascending: true, nullsFirst: false })
        .abortSignal(signal);
      
      if (response.error) {
        // Abort errors are expected during rapid invalidations - silently return cached data
        if (response.error.code === '20' || response.error.message?.includes('abort')) {
          const cachedData = queryClient.getQueryData<GenerationRow[]>(['all-shot-generations', stableShotId]);
          return cachedData || [];
        }
        console.error('[DataTrace] ❌ NETWORK FETCH ERROR:', response.error);
        throw response.error;
      }

      console.log('[DataTrace] 📦 NETWORK FETCH SUCCESS:', {
        shotId: stableShotId?.substring(0, 8),
        rowCount: response.data?.length ?? 0,
        firstRowId: response.data?.[0]?.id?.substring(0, 8),
        firstRowFrame: response.data?.[0]?.timeline_frame,
        allFrames: response.data?.map(r => r.timeline_frame),
        timestamp: Date.now()
      });

      // Transform to standardized GenerationRow format using shared mapper
      const baseResult: GenerationRow[] = (response.data || [])
        .map(mapShotGenerationToRow)
        .filter(Boolean) as GenerationRow[];

      // Badge data (derivedCount, hasUnviewedVariants, unviewedVariantCount) is now loaded
      // lazily via useVariantBadges hook to avoid blocking gallery display
      const result = baseResult;

      const duration = Date.now() - startTime;
      
      // [DuplicateGenDebug] Check for duplicate generation_ids (same gen appearing multiple times)
      const genIdCounts = new Map<string, number>();
      result.forEach(r => {
        if (r.generation_id) {
          const count = genIdCounts.get(r.generation_id) || 0;
          genIdCounts.set(r.generation_id, count + 1);
        }
      });
      const duplicateGenIds = Array.from(genIdCounts.entries()).filter(([_, count]) => count > 1);
      
      console.log('[AddFlicker] 6️⃣ QUERY FETCH COMPLETE - all-shot-generations returned', { 
        shotId: stableShotId?.substring(0, 8), 
        resultCount: result.length,
        duration: `${duration}ms`,
        hasOptimistic: result.some((r: any) => r._optimistic),
        // Show last 3 items for debugging
        lastItems: result.slice(-3).map(r => ({
          id: r.id?.substring(0, 8),
          generation_id: r.generation_id?.substring(0, 8),
          timeline_frame: r.timeline_frame,
          _optimistic: (r as any)._optimistic
        })),
      });

      return result;
    },
    retryDelay: STANDARD_RETRY_DELAY,
  });

  // Use the query data directly (no merging needed)
  const mergedData = mainQuery.data;

  // ============================================================================
  // Return query result (simplified - single query, no phases)
  // ============================================================================
  return mainQuery as UseQueryResult<GenerationRow[]>;
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
    
    // Filter to only timeline generations (positioned + has metadata) AND not videos
    // Timeline should only display image frames
    const filtered = baseQuery.data
      .filter(isTimelineGeneration)
      .filter(gen => !gen.type?.includes('video'));
    
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
  } as UseQueryResult<TimelineGenerationRow[]>;
};

// ============================================================================
// SELECTOR HOOKS - Centralized filtering for different views
// These provide stable, memoized views of shot data. When mutations update
// the cache with optimistic data, all selectors automatically see the change.
// ============================================================================

/**
 * Selector: Timeline images (positioned, non-video, with valid location)
 *
 * Returns images that should appear on the timeline:
 * - Has valid timeline_frame (not null, >= 0)
 * - Is not a video generation
 * - Has valid location (not null, not placeholder)
 * - Sorted by timeline_frame ascending
 *
 * CRITICAL: Location filtering ensures UI counts match task creation counts
 * (see generateVideoService.ts for the same filtering logic)
 *
 * @param shotId - The shot ID to get timeline images for
 * @returns Query result with filtered GenerationRow[] data
 */
export const useTimelineImages = (
  shotId: string | null
): UseQueryResult<GenerationRow[]> => {
  const baseQuery = useAllShotGenerations(shotId);

  const filtered = React.useMemo(() => {
    if (!baseQuery.data) return undefined;

    const result = baseQuery.data
      .filter(g => {
        const location = g.imageUrl || g.location;
        const hasValidLocation = location && location !== '/placeholder.svg';
        return g.timeline_frame != null &&
               g.timeline_frame >= 0 &&
               !g.type?.includes('video') &&
               hasValidLocation;
      })
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    // [SelectorDebug] THE GOD LOG - See exactly what's inside the data
    if (baseQuery.data.length > 0) {
      console.log('[SelectorDebug] RAW DATA SAMPLE (First Item):', {
        raw: baseQuery.data[0],
        id: baseQuery.data[0]?.id,
        timeline_frame: baseQuery.data[0]?.timeline_frame,
        type: baseQuery.data[0]?.type,
        location: baseQuery.data[0]?.imageUrl || baseQuery.data[0]?.location,
        keys: Object.keys(baseQuery.data[0]),
        isFilteredOut: result.length === 0 || !result.some(r => r.id === baseQuery.data[0].id)
      });
    }

    // [SelectorDebug] Log filtering results with WHY items were filtered
    const filteredOut = baseQuery.data.filter(g => {
      const location = g.imageUrl || g.location;
      const hasValidLocation = location && location !== '/placeholder.svg';
      return g.timeline_frame == null || g.timeline_frame < 0 || g.type?.includes('video') || !hasValidLocation;
    });
    console.log('[SelectorDebug] useTimelineImages filtered:', {
      shotId: shotId?.substring(0, 8),
      inputCount: baseQuery.data.length,
      outputCount: result.length,
      outputIds: result.slice(0, 5).map(r => r.id?.substring(0, 8)),
      frames: result.slice(0, 5).map(r => r.timeline_frame),
      // Show WHY items were filtered out
      filteredOutCount: filteredOut.length,
      filteredOutReasons: filteredOut.slice(0, 5).map(g => ({
        id: g.id?.substring(0, 8),
        timeline_frame: g.timeline_frame,
        isNull: g.timeline_frame == null,
        isNegative: g.timeline_frame != null && g.timeline_frame < 0,
        isVideo: g.type?.includes('video'),
        hasNoLocation: !(g.imageUrl || g.location) || (g.imageUrl || g.location) === '/placeholder.svg',
      })),
    });

    return result;
  }, [baseQuery.data, shotId]);

  return { ...baseQuery, data: filtered } as UseQueryResult<GenerationRow[]>;
};

/**
 * Selector: Unpositioned images (no timeline_frame, non-video, with valid location)
 *
 * Returns images that are in the shot but not positioned on timeline:
 * - Has null timeline_frame
 * - Is not a video generation
 * - Has valid location (not null, not placeholder)
 *
 * @param shotId - The shot ID to get unpositioned images for
 * @returns Query result with filtered GenerationRow[] data
 */
export const useUnpositionedImages = (
  shotId: string | null
): UseQueryResult<GenerationRow[]> => {
  const baseQuery = useAllShotGenerations(shotId);

  const filtered = React.useMemo(() => {
    if (!baseQuery.data) return undefined;

    return baseQuery.data.filter(g => {
      const location = g.imageUrl || g.location;
      const hasValidLocation = location && location !== '/placeholder.svg';
      return g.timeline_frame == null &&
             !g.type?.includes('video') &&
             hasValidLocation;
    });
  }, [baseQuery.data]);

  return { ...baseQuery, data: filtered } as UseQueryResult<GenerationRow[]>;
};

/**
 * Selector: Video outputs
 * 
 * Returns video generations in the shot.
 * 
 * @param shotId - The shot ID to get video outputs for
 * @returns Query result with filtered GenerationRow[] data
 */
export const useVideoOutputs = (
  shotId: string | null
): UseQueryResult<GenerationRow[]> => {
  const baseQuery = useAllShotGenerations(shotId);
  
  const filtered = React.useMemo(() => {
    if (!baseQuery.data) return undefined;
    
    return baseQuery.data.filter(g => g.type?.includes('video'));
  }, [baseQuery.data]);
  
  return { ...baseQuery, data: filtered } as UseQueryResult<GenerationRow[]>;
};

// ============================================================================
// CACHE PRIMING - Enable instant selector data during shot navigation
// ============================================================================

/**
 * Primes the all-shot-generations cache with data from ShotsContext.
 * 
 * Call at the top-level component (VideoTravelToolPage) to enable instant selector data.
 * When a shot is selected, this seeds the cache so selectors immediately have data
 * to display, eliminating the need for dual-source fallback logic in components.
 * 
 * NOTE: Primed data from ShotsContext does NOT include `metadata` (pair prompts).
 * This is fine because selectors filter on `timeline_frame` and `type` which are present.
 * Full metadata arrives when the useAllShotGenerations query completes (~300ms).
 * 
 * @param shotId - The shot ID to prime cache for
 * @param contextImages - Images from ShotsContext (selectedShot.images)
 */
export const usePrimeShotGenerationsCache = (
  shotId: string | null,
  contextImages: GenerationRow[] | undefined
) => {
  const queryClient = useQueryClient();
  
  React.useEffect(() => {
    // [SelectorDebug] Log every priming attempt
    const existingData = queryClient.getQueryData<GenerationRow[]>(['all-shot-generations', shotId]);
    
    const willPrime = shotId && 
                      contextImages && 
                      contextImages.length > 0 && 
                      (!existingData || existingData.length === 0);

    console.log('[SelectorDebug] usePrimeShotGenerationsCache check:', {
      shotId: shotId?.substring(0, 8),
      contextImagesCount: contextImages?.length ?? 0,
      existingCacheCount: existingData?.length ?? 0,
      willPrime,
      contextImageIds: contextImages?.slice(0, 3).map(i => i.id?.substring(0, 8)),
      contextImageFrames: contextImages?.slice(0, 5).map(i => i.timeline_frame),
      existingCacheIds: existingData?.slice(0, 3).map(i => i.id?.substring(0, 8)),
      existingCacheFrames: existingData?.slice(0, 5).map(i => i.timeline_frame),
    });
    
    if (!willPrime) {
      if (shotId && !existingData) {
        console.log('[SelectorDebug] ⏳ Cache NOT primed - contextImages is empty or missing, waiting for real query');
      } else if (shotId) {
        console.log('[SelectorDebug] ⏩ Cache NOT primed - already has data or invalid conditions:', {
          shotId: shotId.substring(0, 8),
          existingCount: existingData?.length,
        });
      }
      return;
    }
    
    // Prime the cache with context data
    queryClient.setQueryData(['all-shot-generations', shotId], contextImages);
    
    console.log('[SelectorDebug] ✅ Cache PRIMED from context:', {
      shotId: shotId.substring(0, 8),
      imageCount: contextImages.length,
      imageIds: contextImages.slice(0, 5).map(i => i.id?.substring(0, 8)),
    });
  }, [shotId, contextImages, queryClient]);
};