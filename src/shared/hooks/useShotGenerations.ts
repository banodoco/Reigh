import { useInfiniteQuery, useQuery, useQueryClient, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { GenerationRow, TimelineGenerationRow, Shot } from '@/types/shots';
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
            // PRIMARY ID FIELDS:
            id: sg.id, // shot_generations.id - unique per entry
            generation_id: sg.generation?.id, // generations.id - the actual generation
            // DEPRECATED (kept for backwards compat during transition):
            shotImageEntryId: sg.id,
            shot_generation_id: sg.id,
            position: Math.floor((sg.timeline_frame ?? 0) / 50),
            timeline_frame: sg.timeline_frame, // Include timeline_frame for filtering and ordering
            imageUrl: sg.generation?.location,
            thumbUrl: sg.generation?.thumbnail_url || sg.generation?.location,
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
  
  // Logging throttle
  const lastLogRef = React.useRef(0);
  const now = Date.now();
  if (now - lastLogRef.current > 500) {
    console.log('[ShotGenerations] useAllShotGenerations hook called:', { 
      shotId: stableShotId, 
      enabled: isEnabled,
      disableRefetch: options?.disableRefetch,
      timestamp: now 
    });
    lastLogRef.current = now;
  }

  // Get queryClient for cache access in queryFn (for abort handling)
  const queryClient = useQueryClient();
  
  // ============================================================================
  // SINGLE QUERY: Fetch from shot_generations with join to generations
  // This replaces the previous two-phase approach for simpler, more reliable data
  // ============================================================================
  const mainQuery = useQuery<GenerationRow[], Error>({
    queryKey: ['all-shot-generations', stableShotId],
    enabled: isEnabled,
    refetchOnMount: !options?.disableRefetch,
    refetchOnWindowFocus: !options?.disableRefetch,
    refetchOnReconnect: !options?.disableRefetch,
    // Prevent rapid refetches - data is considered fresh for 500ms
    // This helps avoid abort errors when mutation + realtime both invalidate
    staleTime: 500,
    // Don't retry aborted/cancelled requests or invalid IDs - they'll be refetched anyway
    retry: (failureCount, error) => {
      // Don't retry aborts or cancelled requests
      if (error?.message?.includes('abort') || 
          error?.message?.includes('Request was cancelled') ||
          (error as any)?.code === 'PGRST116' ||
          error?.message?.includes('Invalid')) {
        return false;
      }
      // Otherwise retry up to 2 times
      return failureCount < 2;
    },
    // NOTE: Removed placeholderData: (previousData) => previousData
    // This was causing cross-shot data leakage - when navigating to a new shot,
    // the previous shot's images would briefly appear as "placeholder" data
    queryFn: async ({ signal }) => {
      const startTime = Date.now();
      console.log('[AddFlicker] 6️⃣ QUERY FETCH START - all-shot-generations refetching!', { 
        shotId: stableShotId?.substring(0, 8), 
        timestamp: startTime 
      });

      // Query shot_generations with embedded generations data
      const response = await supabase
        .from('shot_generations')
        .select(`
          id,
          generation_id,
          timeline_frame,
          metadata,
          generations (
            id,
            location,
            thumbnail_url,
            type,
            created_at,
            starred,
            upscaled_url,
            name,
            based_on,
            params
          )
        `)
        .eq('shot_id', stableShotId!)
        .order('timeline_frame', { ascending: true, nullsFirst: false })
        .abortSignal(signal);
      
      if (response.error) {
        // Abort errors are expected when the query is invalidated before completion
        // (e.g., rapid invalidations from mutation + realtime). 
        // IMPORTANT: Return the current cached data to prevent UI flicker.
        // This keeps the optimistic update visible while the next query runs.
        if (response.error.code === '20' || response.error.message?.includes('abort')) {
          console.log('[ShotGenerations] Query ABORTED - returning cached data to prevent flicker:', {
            shotId: stableShotId,
          });
          // Get the current cached data and return it
          // This prevents the UI from flickering between states
          const cachedData = queryClient.getQueryData<GenerationRow[]>(['all-shot-generations', stableShotId]);
          if (cachedData) {
            console.log('[ShotGenerations] Returning cached data:', { count: cachedData.length });
            return cachedData;
          }
          // If no cache (shouldn't happen), return empty to avoid error state
          return [];
        }
        
        console.error('[ShotGenerations] Query ERROR:', {
          shotId: stableShotId,
          error: response.error,
          code: response.error.code,
          message: response.error.message,
        });
        
        if (response.error.code === 'PGRST116' || response.error.message?.includes('Invalid')) {
          console.warn('[ShotGenerations] Invalid shot ID:', { shotId: stableShotId });
          return [];
        }
        throw response.error;
      }

      // Transform to GenerationRow format
      const result: GenerationRow[] = (response.data || []).map((sg: any) => {
        const gen = sg.generations;
        if (!gen) {
          console.warn('[ShotGenerations] shot_generation missing generations join:', sg.id);
          return null;
        }
        
        return {
          // PRIMARY ID FIELDS:
          id: sg.id, // shot_generations.id - unique per entry
          generation_id: gen.id, // generations.id - the actual generation
          // DEPRECATED (kept for backwards compat during transition):
          shotImageEntryId: sg.id,
          shot_generation_id: sg.id,
          // Generation data:
          location: gen.location,
          type: gen.type,
          created_at: gen.created_at,
          createdAt: gen.created_at,
          starred: gen.starred,
          upscaled_url: gen.upscaled_url,
          name: gen.name,
          based_on: gen.based_on,
          params: gen.params,
          // Computed fields
          imageUrl: gen.location,
          thumbUrl: gen.thumbnail_url || gen.location,
          // From shot_generations table
          timeline_frame: sg.timeline_frame,
          metadata: sg.metadata || {},
        };
      }).filter(Boolean) as GenerationRow[];

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
    gcTime: 5 * 60 * 1000, // 5 minutes
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 3000),
  });

  // Use the query data directly (no merging needed)
  const mergedData = mainQuery.data;

  // ============================================================================
  // CACHE SYNC: Update shots list cache when shot data changes
  // This ensures the shot list view shows the same images as the shot editor
  // ============================================================================
  React.useEffect(() => {
    if (!mergedData || !stableShotId || mergedData.length === 0) return;
    
    // Find all shots caches and update this shot's images array
    // This uses React Query's fuzzy matching - ['shots'] matches all shots queries
    const allQueries = queryClient.getQueriesData<Shot[]>({ queryKey: ['shots'] });
    
    if (allQueries.length === 0) return;
    
    let updatedCount = 0;
    
    allQueries.forEach(([queryKey, shotsData]) => {
      if (!shotsData || !Array.isArray(shotsData)) return;
      
      // Find this shot in the array
      const shotIndex = shotsData.findIndex(shot => shot.id === stableShotId);
      if (shotIndex === -1) return;
      
      // Update the shot's images with fresh data from useAllShotGenerations
      // IMPORTANT: Sort by timeline_frame to ensure correct display order
      const sortedData = [...mergedData].sort((a, b) => {
        const frameA = a.timeline_frame ?? 0;
        const frameB = b.timeline_frame ?? 0;
        return frameA - frameB;
      });
      
      const updatedShots = [...shotsData];
      updatedShots[shotIndex] = {
        ...updatedShots[shotIndex],
        images: sortedData.map(gen => ({
          // Primary IDs
          id: gen.id, // shot_generations.id (unique per entry)
          generation_id: gen.generation_id, // generations.id
          // Deprecated (kept for backwards compat)
          shotImageEntryId: gen.id,
          // Data fields
          imageUrl: gen.imageUrl || gen.location,
          thumbUrl: gen.thumbUrl || gen.location,
          location: gen.location,
          type: gen.type,
          createdAt: gen.createdAt,
          starred: gen.starred,
          upscaled_url: gen.upscaled_url,
          name: gen.name,
          based_on: gen.based_on,
          params: gen.params,
          timeline_frame: gen.timeline_frame,
          metadata: gen.metadata,
          shot_data: { [stableShotId]: gen.timeline_frame }
        }))
      };
      
      queryClient.setQueryData(queryKey, updatedShots);
      updatedCount++;
    });
    
    if (updatedCount > 0) {
      console.log('[CacheSync] Updated shots list cache with fresh shot data:', {
        shotId: stableShotId.substring(0, 8),
        imageCount: mergedData.length,
        cacheQueriesUpdated: updatedCount
      });
    }
  }, [mergedData, stableShotId, queryClient]);

  // ============================================================================
  // Return query result (simplified - single query, no phases)
  // ============================================================================
  console.log('[ShotGenerations] Query result status:', {
    shotId: stableShotId,
    status: mainQuery.status,
    fetchStatus: mainQuery.fetchStatus,
    isLoading: mainQuery.isLoading,
    isFetching: mainQuery.isFetching,
    dataCount: mergedData?.length || 0,
    error: mainQuery.error,
  });

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