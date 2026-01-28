/**
 * useLineageChain Hook
 *
 * Fetches the full lineage chain for a variant by following the `source_variant_id` field in params.
 * Returns an array ordered from oldest ancestor to newest (the provided variant).
 *
 * Note: Lineage is tracked at the variant level via params.source_variant_id,
 * not at the generation level via based_on.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LineageItem {
  id: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  type: 'variant';
  variantType: string | null;
}

interface LineageChainResult {
  chain: LineageItem[];
  isLoading: boolean;
  hasLineage: boolean;
  error: Error | null;
}

/**
 * Recursively fetch the lineage chain for a variant.
 * Follows the `params.source_variant_id` field to find ancestors.
 */
async function fetchLineageChain(variantId: string): Promise<LineageItem[]> {
  const chain: LineageItem[] = [];
  const visited = new Set<string>();
  let currentId: string | null = variantId;

  // Follow the source_variant_id chain upward to find all ancestors
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const { data, error } = await supabase
      .from('generation_variants')
      .select('id, location, thumbnail_url, created_at, params, variant_type')
      .eq('id', currentId)
      .single();

    if (error || !data) {
      console.error('[useLineageChain] Error fetching variant:', error);
      break;
    }

    // Add to beginning of chain (we're going backwards in time)
    chain.unshift({
      id: data.id,
      imageUrl: data.location,
      thumbnailUrl: data.thumbnail_url,
      createdAt: data.created_at,
      type: 'variant',
      variantType: data.variant_type,
    });

    // Move to the parent variant via source_variant_id in params
    const params = data.params as Record<string, any> | null;
    currentId = params?.source_variant_id || null;
  }

  console.log('[useLineageChain] Fetched chain:', {
    startId: variantId.substring(0, 8),
    chainLength: chain.length,
    ids: chain.map(item => item.id.substring(0, 8)),
    types: chain.map(item => item.variantType),
  });

  return chain;
}

/**
 * Hook to fetch the full lineage chain for a variant.
 *
 * @param variantId - The variant ID to fetch lineage for
 * @returns Object with chain (oldest to newest), loading state, and whether there's lineage
 */
export function useLineageChain(variantId: string | null): LineageChainResult {
  const { data: chain = [], isLoading, error } = useQuery({
    queryKey: ['lineage-chain', variantId],
    queryFn: () => fetchLineageChain(variantId!),
    enabled: !!variantId,
    staleTime: 5 * 60 * 1000, // 5 minutes - lineage doesn't change
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    chain,
    isLoading,
    // Has lineage if chain has more than 1 item (the current variant + at least one ancestor)
    hasLineage: chain.length > 1,
    error: error as Error | null,
  };
}

/**
 * Count the lineage chain length for a variant.
 * Returns the number of ancestors (0 if no lineage, 1+ if has ancestors).
 * This fetches directly without caching - use sparingly for initial checks.
 */
export async function getLineageDepth(variantId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = variantId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const { data, error } = await supabase
      .from('generation_variants')
      .select('params')
      .eq('id', currentId)
      .single();

    if (error || !data) {
      break;
    }

    const params = data.params as Record<string, any> | null;
    currentId = params?.source_variant_id || null;

    if (currentId) {
      depth++;
    }
  }

  return depth;
}

/**
 * Check if a variant has lineage (has a source_variant_id in params).
 * @deprecated Use getLineageDepth instead for more control
 */
export async function checkHasLineage(variantId: string): Promise<boolean> {
  const depth = await getLineageDepth(variantId);
  return depth > 0;
}

export default useLineageChain;
