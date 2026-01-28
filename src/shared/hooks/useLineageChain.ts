/**
 * useLineageChain Hook
 *
 * Fetches the full lineage chain for a generation by following the `based_on` field.
 * Returns an array ordered from oldest ancestor to newest (the provided generation).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LineageItem {
  id: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  type: 'generation';
}

interface LineageChainResult {
  chain: LineageItem[];
  isLoading: boolean;
  hasLineage: boolean;
  error: Error | null;
}

/**
 * Recursively fetch the lineage chain for a generation.
 * Follows the `based_on` field to find ancestors.
 */
async function fetchLineageChain(generationId: string): Promise<LineageItem[]> {
  const chain: LineageItem[] = [];
  const visited = new Set<string>();
  let currentId: string | null = generationId;

  // Follow the based_on chain upward to find all ancestors
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const { data, error } = await supabase
      .from('generations')
      .select('id, location, thumbnail_url, created_at, based_on')
      .eq('id', currentId)
      .single();

    if (error || !data) {
      console.error('[useLineageChain] Error fetching generation:', error);
      break;
    }

    // Add to beginning of chain (we're going backwards in time)
    chain.unshift({
      id: data.id,
      imageUrl: data.location,
      thumbnailUrl: data.thumbnail_url,
      createdAt: data.created_at,
      type: 'generation',
    });

    // Move to the parent generation
    currentId = data.based_on;
  }

  console.log('[useLineageChain] Fetched chain:', {
    startId: generationId.substring(0, 8),
    chainLength: chain.length,
    ids: chain.map(item => item.id.substring(0, 8)),
  });

  return chain;
}

/**
 * Hook to fetch the full lineage chain for a generation.
 *
 * @param generationId - The generation ID to fetch lineage for
 * @returns Object with chain (oldest to newest), loading state, and whether there's lineage
 */
export function useLineageChain(generationId: string | null): LineageChainResult {
  const { data: chain = [], isLoading, error } = useQuery({
    queryKey: ['lineage-chain', generationId],
    queryFn: () => fetchLineageChain(generationId!),
    enabled: !!generationId,
    staleTime: 5 * 60 * 1000, // 5 minutes - lineage doesn't change
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    chain,
    isLoading,
    // Has lineage if chain has more than 1 item (the current generation + at least one ancestor)
    hasLineage: chain.length > 1,
    error: error as Error | null,
  };
}

/**
 * Synchronous function to check if a generation has lineage.
 * This fetches directly without caching - use sparingly for initial checks.
 */
export async function checkHasLineage(generationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('generations')
    .select('based_on')
    .eq('id', generationId)
    .single();

  if (error || !data) {
    return false;
  }

  return !!data.based_on;
}

export default useLineageChain;
