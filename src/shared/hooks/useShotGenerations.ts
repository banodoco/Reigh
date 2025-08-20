import { useInfiniteQuery, useQuery, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GenerationRow } from '@/types/shots';
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
    queryKey: ['shot-generations', shotId],
    enabled: !!shotId,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: { pageParam: number; signal?: AbortSignal }) => {
      // Check if request was cancelled before starting
      if (signal?.aborted) {
        throw new Error('Request was cancelled');
      }

      const { data, error } = await supabase
        .from('shot_generations')
        .select(`
          *,
          generation:generations(*)
        `)
        .eq('shot_id', shotId!)
        .order('position', { ascending: true })
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
          position: sg.position,
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
        .is('position', null);

      if (countError) throw countError;

      // We need to filter out videos, so fetch the actual records
      const { data: unpositioned } = await supabase
        .from('shot_generations')
        .select('generation:generations(type)')
        .eq('shot_id', shotId!)
        .is('position', null);

      const nonVideoCount = (unpositioned || []).filter(
        sg => !(sg.generation as any)?.type?.includes('video')
      ).length;

      return nonVideoCount;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
};

// Hook for getting all generations for a shot (non-paginated, for backward compatibility)
export const useAllShotGenerations = (
  shotId: string | null
): UseQueryResult<GenerationRow[]> => {
  // Throttle logging to avoid infinite loop spam
  const lastLogRef = React.useRef(0);
  const now = Date.now();
  if (now - lastLogRef.current > 1000) { // Log max once per second
    console.log('[ADDTOSHOT] useAllShotGenerations called (throttled)', { shotId, timestamp: now });
    lastLogRef.current = now;
  }

  return useQuery({
    queryKey: ['all-shot-generations', shotId],
    enabled: !!shotId,
    queryFn: async ({ signal }) => {
      // Check if request was cancelled before starting
      if (signal?.aborted) {
        throw new Error('Request was cancelled');
      }
      console.log('[VideoLoadSpeedIssue][ADDTOSHOT] useAllShotGenerations queryFn executing', { shotId, timestamp: Date.now() });
      let allGenerations: any[] = [];
      let offset = 0;
      const INITIAL_LOAD = 200; // Fast initial load for first 200 items
      const BATCH_SIZE = 500; // Smaller batches for better responsiveness

      // First, load initial batch quickly with minimal fields for fast rendering
      const { data: initialData, error: initialError } = await supabase
        .from('shot_generations')
        .select(`
          id,
          position,
          generation:generations(
            id,
            location,
            type,
            created_at,
            params,
            metadata
          )
        `)
        .eq('shot_id', shotId!)
        .order('position', { ascending: true })
        .range(0, INITIAL_LOAD - 1)
        .abortSignal(signal);

      if (initialError) {
        // Better error handling for 400 errors
        if (initialError.code === 'PGRST116' || initialError.message?.includes('Invalid')) {
          console.warn('[useAllShotGenerations] Invalid shot ID or query parameters:', { shotId, error: initialError });
          return [];
        }
        throw initialError;
      }

      // Check again after first query
      if (signal?.aborted) {
        throw new Error('Request was cancelled');
      }

      if (initialData) {
        allGenerations = initialData;
        offset = initialData.length;
      }

      // If there might be more data, fetch the rest in background
      if (initialData && initialData.length === INITIAL_LOAD) {
        // Fetch remaining data in smaller batches
        while (true) {
          // Check for cancellation before each batch
          if (signal?.aborted) {
            throw new Error('Request was cancelled');
          }

          const { data, error } = await supabase
            .from('shot_generations')
            .select(`
              id,
              position,
              generation:generations(
                id,
                location,
                type,
                created_at,
                params,
                metadata
              )
            `)
            .eq('shot_id', shotId!)
            .order('position', { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1)
            .abortSignal(signal);

          if (error) {
            // Handle 400 errors gracefully during batch loading
            if ((error as any).code === 'PGRST116' || error.message?.includes('Invalid')) {
              console.warn('[useAllShotGenerations] Error during batch loading, stopping:', { shotId, offset, error });
              break;
            }
            throw error;
          }

          if (!data || data.length === 0) break;

          allGenerations = allGenerations.concat(data);
          
          if (data.length < BATCH_SIZE) break;
          
          offset += BATCH_SIZE;
          
          // Safety limit
          if (offset > 10000) break;
        }
      }

      // Transform to match GenerationRow interface
      const result = allGenerations
        .filter(sg => sg.generation)
        .map(sg => ({
          ...sg.generation,
          shotImageEntryId: sg.id,
          shot_generation_id: sg.id,
          position: sg.position,
          imageUrl: sg.generation?.location,
          thumbUrl: sg.generation?.location,
        }));

      console.log('[VideoLoadSpeedIssue][ADDTOSHOT] useAllShotGenerations queryFn completed', { 
        shotId, 
        resultCount: result.length,
        videoCount: result.filter(r => r.type === 'video').length,
        timestamp: Date.now() 
      });

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
    meta: {
      onInvalidate: () => {
        console.log('[VideoLoadSpeedIssue] useAllShotGenerations query invalidated for shotId:', shotId);
      }
    }
  });
}; 