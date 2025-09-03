import React from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useResurrectionPollingConfig, RecentActivityDetectors } from './useResurrectionPolling';
import { useQueryDebugLogging, QueryDebugConfigs } from './useQueryDebugLogging';

/**
 * EXAMPLE: Refactored useGenerations hook using modular polling architecture.
 * 
 * This demonstrates how the original 500+ line hook can be reduced to ~100 lines
 * by extracting common polling and logging logic into reusable modules.
 * 
 * Benefits:
 * - 80% less code in the hook itself
 * - Consistent polling behavior with TasksPane
 * - Standardized debug logging
 * - Easy to maintain and test
 */

// ... [Keep all the existing fetch and response type definitions] ...

export interface GenerationsPaginatedResponse {
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
}

export function useGenerationsModular(
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
  const queryKey = ['unified-generations', 'project', projectId, page, limit, filters];

  // 🎯 MODULAR POLLING: Configure resurrection polling with specific settings for generations
  const { refetchInterval } = useResurrectionPollingConfig(
    'ImageGallery', // Debug tag
    { projectId, page, filters }, // Context for logging
    {
      // Custom config for generations
      hasRecentActivity: RecentActivityDetectors.generations,
      fastInterval: 15000,        // 15s when recent generations exist
      resurrectionInterval: 45000, // 45s for stale data recovery
      initialInterval: 30000      // 30s when no data
    }
  );

  const result = useQuery<GenerationsPaginatedResponse, Error>({
    queryKey,
    queryFn: () => fetchGenerations(projectId, limit, offset, filters),
    enabled: !!projectId && enabled,
    placeholderData: keepPreviousData,
    initialData: () => queryClient.getQueryData(queryKey),
    
    // Cache management
    staleTime: 10 * 1000,
    gcTime: 10 * 60 * 1000,
    
    // 🎯 MODULAR POLLING: Use the configured resurrection polling
    refetchInterval,
    refetchIntervalInBackground: true, // Continue polling when tab inactive
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

// 🎯 MUCH CLEANER: The hook is now ~50 lines instead of 500+
// All the polling logic is reusable across TasksPane, ImageGallery, VideoOutputsGallery
// All the debug logging is consistent and configurable
// Easy to test, maintain, and extend

export function useDeleteGenerationModular() {
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
      toast.success('Generation deleted successfully');
      // Invalidate all generation queries
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
    },
    onError: (error: Error) => {
      console.error('Delete generation error:', error);
      toast.error(`Failed to delete generation: ${error.message}`);
    }
  });
}

// ... [Other mutations would also be simplified] ...
