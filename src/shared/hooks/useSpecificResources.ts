import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Resource } from './useResources';

/**
 * Fetch a single resource by ID
 * Used internally by useSpecificResources for individual caching
 */
const fetchResourceById = async (id: string): Promise<Resource | null> => {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // Resource not found - return null instead of throwing
      return null;
    }
    console.error('[SpecificResources] Error fetching resource:', id, error);
    throw error;
  }
  
  return data as Resource;
};

/**
 * Optimized hook to fetch only specific resources by their IDs
 * Each resource is cached individually so removing one resource from the list
 * doesn't cause other resources to be refetched.
 */
export const useSpecificResources = (resourceIds: string[]) => {
  // Deduplicate IDs and filter out empty strings
  const uniqueIds = useMemo(() => 
    [...new Set(resourceIds)].filter(Boolean),
    [resourceIds]
  );
  
  // Use individual queries per resource for normalized caching
  const queries = useQueries({
    queries: uniqueIds.map(id => ({
      queryKey: ['resource', id],
      queryFn: () => fetchResourceById(id),
      // Keep data fresh but cache for a while
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    })),
  });
  
  // Combine results
  const result = useMemo(() => {
    const isLoading = queries.some(q => q.isLoading);
    const data = queries
      .map(q => q.data)
      .filter((r): r is Resource => r !== null && r !== undefined);
    
    return { data, isLoading };
  }, [queries]);
  
  return result;
};

/**
 * Hook to invalidate cache for a specific resource
 * Call this when a resource is deleted to clean up its cache entry
 */
export const useInvalidateResource = () => {
  const queryClient = useQueryClient();
  
  return useCallback((resourceId: string) => {
    queryClient.removeQueries({ queryKey: ['resource', resourceId] });
  }, [queryClient]);
};


