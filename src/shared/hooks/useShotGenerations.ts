import { useInfiniteQuery, useQuery, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
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
    queryKey: ['unified-generations', 'shot', shotId],
    enabled: !!shotId,
    initialPageParam: 0,
    // Add retry logic for aborted requests (same as useAllShotGenerations)
    retry: (failureCount, error) => {
      if (error instanceof Error && (error.message.includes('aborted') || error.message.includes('cancelled'))) {
        return failureCount < 3;
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(100 * Math.pow(2, attemptIndex), 1000),
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

// Hook for getting all generations for a shot (non-paginated, for backward compatibility)
export const useAllShotGenerations = (
  shotId: string | null
): UseQueryResult<GenerationRow[]> => {
  // [VideoLoadSpeedIssue] AGGRESSIVE THROTTLING: Reduce excessive hook calls
  const stableShotId = React.useMemo(() => shotId, [shotId]);
  const isEnabled = React.useMemo(() => !!stableShotId, [stableShotId]);
  
  // [VideoLoadSpeedIssue] Enhanced logging to track when hook is called
  const lastLogRef = React.useRef(0);
  const now = Date.now();
  if (now - lastLogRef.current > 500) { // Reduced to every 500ms to catch rapid calls
    console.log('[VideoLoadSpeedIssue] useAllShotGenerations hook called:', { 
      shotId: stableShotId, 
      enabled: isEnabled,
      timestamp: now 
    });
    lastLogRef.current = now;
  }
  
  // Throttle logging to avoid infinite loop spam
  const lastLogRef2 = React.useRef(0);
  if (now - lastLogRef2.current > 1000) { // Log max once per second
    console.log('[ADDTOSHOT] useAllShotGenerations called (throttled)', { shotId: stableShotId, timestamp: now });
    lastLogRef2.current = now;
  }

  return useQuery({
    queryKey: ['unified-generations', 'shot', stableShotId],
    enabled: isEnabled,
    // CRITICAL: Add retry logic for aborted requests to prevent "signal is aborted without reason" errors
    // When mutations invalidate queries, in-flight requests get cancelled. Retry ensures we eventually get the data.
    retry: (failureCount, error) => {
      // Retry aborted requests up to 3 times
      if (error instanceof Error && (error.message.includes('aborted') || error.message.includes('cancelled'))) {
        return failureCount < 3;
      }
      // Don't retry other errors
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(100 * Math.pow(2, attemptIndex), 1000), // Exponential backoff: 100ms, 200ms, 400ms
    queryFn: async ({ signal }) => {
      // Don't throw immediately on abort - let the fetch fail naturally
      // This prevents the "signal is aborted without reason" error from being thrown manually
      console.log('[VideoLoadSpeedIssue][ADDTOSHOT] useAllShotGenerations queryFn executing', { shotId, timestamp: Date.now() });
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
          generation:generations(
            id,
            location,
            type,
            created_at
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

      // PERFORMANCE OPTIMIZATION: For large shots, only load first 200 items initially
      // This provides instant loading for shots with 100+ images
      // Background loading removed to prevent 8+ second delays
      console.log('[PERF] Large shot optimization - using initial batch only for faster rendering:', {
        shotId,
        initialDataLength: initialData?.length || 0,
        skippingBackgroundLoad: true
      });

      // Transform to match GenerationRow interface
      const result = allGenerations
        .filter(sg => sg.generation)
        .map(sg => ({
          ...sg.generation,
          shotImageEntryId: sg.id,
          shot_generation_id: sg.id,
          position: Math.floor((sg.timeline_frame ?? 0) / 50),
          timeline_frame: sg.timeline_frame, // Include timeline_frame for filtering and ordering
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