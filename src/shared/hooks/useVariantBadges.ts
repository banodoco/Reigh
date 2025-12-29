/**
 * useVariantBadges Hook
 *
 * Lazy-loads variant badge data (derivedCount, hasUnviewedVariants, unviewedVariantCount)
 * for a set of generation IDs. This allows galleries to show images immediately while
 * badge data loads in the background.
 *
 * Also provides optimistic update support - when a variant is viewed, the badge
 * is immediately hidden without waiting for a refetch.
 *
 * Usage:
 *   const { getBadgeData, markGenerationViewed } = useVariantBadges(generationIds);
 *   const badge = getBadgeData(generationId); // { derivedCount, hasUnviewedVariants, unviewedVariantCount }
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { calculateDerivedCounts, DerivedCountsResult } from '@/shared/lib/generationTransformers';

export interface VariantBadgeData {
  derivedCount: number;
  hasUnviewedVariants: boolean;
  unviewedVariantCount: number;
}

interface UseVariantBadgesResult {
  /** Get badge data for a specific generation */
  getBadgeData: (generationId: string) => VariantBadgeData;
  /** Mark a generation as having been viewed (optimistically removes NEW badge) */
  markGenerationViewed: (generationId: string) => void;
  /** Whether badge data is still loading */
  isLoading: boolean;
}

/**
 * Hook for lazy-loading variant badge data
 * @param generationIds - Array of generation IDs to fetch badge data for
 * @param enabled - Whether to fetch (default true)
 */
export function useVariantBadges(
  generationIds: string[],
  enabled: boolean = true
): UseVariantBadgesResult {
  const queryClient = useQueryClient();

  // Track generations that have been optimistically marked as viewed
  // This persists across refetches until the component unmounts
  const [viewedGenerations, setViewedGenerations] = useState<Set<string>>(new Set());

  // Stable query key based on sorted IDs
  const queryKey = useMemo(() => {
    const sortedIds = [...generationIds].sort();
    return ['variant-badges', sortedIds.join(',')];
  }, [generationIds]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<DerivedCountsResult> => {
      if (generationIds.length === 0) {
        return { derivedCounts: {}, hasUnviewedVariants: {}, unviewedVariantCounts: {} };
      }
      return calculateDerivedCounts(generationIds);
    },
    enabled: enabled && generationIds.length > 0,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
  });

  const getBadgeData = useCallback((generationId: string): VariantBadgeData => {
    const derivedCount = data?.derivedCounts[generationId] || 0;

    // If this generation was optimistically marked as viewed, don't show NEW
    const wasViewedOptimistically = viewedGenerations.has(generationId);
    const hasUnviewedVariants = wasViewedOptimistically
      ? false
      : (data?.hasUnviewedVariants[generationId] || false);
    const unviewedVariantCount = wasViewedOptimistically
      ? 0
      : (data?.unviewedVariantCounts[generationId] || 0);

    return {
      derivedCount,
      hasUnviewedVariants,
      unviewedVariantCount,
    };
  }, [data, viewedGenerations]);

  const markGenerationViewed = useCallback((generationId: string) => {
    // Optimistically mark as viewed
    setViewedGenerations(prev => new Set([...prev, generationId]));

    // Also update the query cache directly for immediate effect across components
    queryClient.setQueryData(queryKey, (oldData: DerivedCountsResult | undefined) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        hasUnviewedVariants: {
          ...oldData.hasUnviewedVariants,
          [generationId]: false,
        },
        unviewedVariantCounts: {
          ...oldData.unviewedVariantCounts,
          [generationId]: 0,
        },
      };
    });
  }, [queryClient, queryKey]);

  return {
    getBadgeData,
    markGenerationViewed,
    isLoading,
  };
}

export default useVariantBadges;
