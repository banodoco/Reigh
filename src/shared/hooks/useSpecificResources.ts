import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Resource } from './useResources';

/**
 * Optimized hook to fetch only specific resources by their IDs
 * Much faster than fetching all resources when we only need a few specific ones
 */
export const useSpecificResources = (resourceIds: string[]) => {
  // Deduplicate IDs and filter out empty strings
  const uniqueIds = [...new Set(resourceIds)].filter(Boolean);
  const sortedIds = uniqueIds.sort(); // Sort for stable query key
  
  return useQuery<Resource[], Error>({
    // Include IDs in query key so it updates when IDs change
    queryKey: ['specific-resources', sortedIds.join(',')],
    queryFn: async () => {
      if (uniqueIds.length === 0) return [];
      
      console.log('[SpecificResources] 🚀 Fetching', uniqueIds.length, 'specific resources');
      
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .in('id', uniqueIds);
      
      if (error) {
        console.error('[SpecificResources] Error fetching resources:', error);
        throw error;
      }
      
      return data as Resource[];
    },
    // Only run if we have IDs to fetch
    enabled: uniqueIds.length > 0,
    // Keep data fresh but cache for a while
    staleTime: 5 * 60 * 1000, 
    gcTime: 30 * 60 * 1000,
  });
};


