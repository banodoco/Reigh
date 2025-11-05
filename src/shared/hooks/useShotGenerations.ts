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
        .map(sg => ({
          ...sg.generation,
          shotImageEntryId: sg.id,
          shot_generation_id: sg.id,
          position: Math.floor((sg.timeline_frame ?? 0) / 50),
          timeline_frame: sg.timeline_frame, // Include timeline_frame for filtering and ordering
          imageUrl: sg.generation?.location || sg.generation?.imageUrl,
          thumbUrl: sg.generation?.location || sg.generation?.thumbUrl,
        }));

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
 * This is the primary data source for shot images throughout the app.
 * It loads positioned and unpositioned images with full metadata including pair prompts.
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
 * **For Timeline-Specific Use:**
 * Consider using `useTimelineShotGenerations` instead, which filters to only
 * positioned images with metadata and provides stronger type guarantees.
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
  // [VideoLoadSpeedIssue] AGGRESSIVE THROTTLING: Reduce excessive hook calls
  const stableShotId = React.useMemo(() => shotId, [shotId]);
  const isEnabled = React.useMemo(() => {
    // Disable query when explicitly requested (e.g., during drag/persist operations)
    if (options?.disableRefetch) {
      return false;
    }
    return !!stableShotId;
  }, [stableShotId, options?.disableRefetch]);
  
  return useQuery({
    queryKey: ['unified-generations', 'shot', stableShotId],
    enabled: isEnabled,
    // Prevent automatic refetches during sensitive operations (drag, persist, etc.)
    // This is in addition to `enabled` flag - provides belt-and-suspenders protection
    refetchOnMount: !options?.disableRefetch,
    refetchOnWindowFocus: !options?.disableRefetch,
    refetchOnReconnect: !options?.disableRefetch,
    queryFn: async ({ signal }) => {
      // Don't throw immediately on abort - let the fetch fail naturally
      // This prevents the "signal is aborted without reason" error from being thrown manually
      let allGenerations: any[] = [];
      let offset = 0;
      const INITIAL_LOAD = 200; // Fast initial load for first 200 items
      const BATCH_SIZE = 500; // Smaller batches for better responsiveness

      // PERFORMANCE BOOST: Load initial batch with only essential fields for instant rendering
      const { data: initialData, error: initialError } = await supabase
        .from('shot_generations')
        .select(`
          id,
          timeline_frame,
          metadata,
          generation:generations(
            id,
            location,
            type,
            created_at,
            starred
          )
        `)
        .eq('shot_id', shotId!)
        .order('timeline_frame', { ascending: true })
        .range(0, INITIAL_LOAD - 1)
        .abortSignal(signal);

      if (initialError) {
        // Better error handling for 400 errors
        if (initialError.code === 'PGRST116' || initialError.message?.includes('Invalid')) {
          console.warn('[useAllShotGenerations] Invalid shot ID or query parameters:', { shotId, error: initialError });
          return [];
        }
        // Let abort errors fail naturally so retry logic can handle them
        throw initialError;
      }

      // Don't manually check for abort - let the natural error flow handle it

      if (initialData) {
        allGenerations = initialData;
        offset = initialData.length;
      }

      // [StarPersist] Log raw data structure from Supabase
      // Transform to match GenerationRow interface
      const result = allGenerations
        .filter(sg => sg.generation)
        .map(sg => ({
          ...sg.generation,
          shotImageEntryId: sg.id,
          shot_generation_id: sg.id,
          position: Math.floor((sg.timeline_frame ?? 0) / 50),
          timeline_frame: sg.timeline_frame, // Include timeline_frame for filtering and ordering
          metadata: sg.metadata, // Include metadata for pair prompts
          imageUrl: sg.generation?.location,
          thumbUrl: sg.generation?.location,
        }));

      return result;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
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
    meta: {}
  });
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
    return baseQuery.data.filter(isTimelineGeneration);
  }, [baseQuery.data, shotId]);
  
  return {
    ...baseQuery,
    data: timelineData
  };
}; 