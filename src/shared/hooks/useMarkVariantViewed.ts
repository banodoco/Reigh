/**
 * useMarkVariantViewed Hook
 *
 * Marks a variant as viewed in the database and invalidates all relevant queries.
 * Used when user views a variant in the lightbox to remove the NEW badge.
 *
 * Now includes optimistic update support - the badge count is decremented immediately
 * before the database update completes.
 *
 * Usage:
 *   const { markViewed } = useMarkVariantViewed();
 *   markViewed({ variantId, generationId }); // generationId enables optimistic update
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DerivedCountsResult } from '@/shared/lib/generationTransformers';

interface MarkViewedParams {
  variantId: string;
  generationId?: string; // Optional: enables optimistic badge update
}

export function useMarkVariantViewed() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ variantId, generationId }: MarkViewedParams) => {
      const { error } = await supabase
        .from('generation_variants')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', variantId)
        .is('viewed_at', null);

      if (error) {
        console.error('[useMarkVariantViewed] Error:', error);
        throw error;
      }

      return { variantId, generationId };
    },
    onMutate: async ({ generationId }) => {
      // Optimistic update: immediately decrement the unviewed count for this generation
      if (generationId) {
        // Find and update any variant-badges queries that include this generation
        queryClient.setQueriesData(
          { queryKey: ['variant-badges'], exact: false },
          (oldData: DerivedCountsResult | undefined) => {
            if (!oldData) return oldData;

            const currentCount = oldData.unviewedVariantCounts[generationId] || 0;
            const newCount = Math.max(0, currentCount - 1);

            return {
              ...oldData,
              hasUnviewedVariants: {
                ...oldData.hasUnviewedVariants,
                [generationId]: newCount > 0,
              },
              unviewedVariantCounts: {
                ...oldData.unviewedVariantCounts,
                [generationId]: newCount,
              },
            };
          }
        );
      }
    },
    onSuccess: ({ variantId }) => {
      console.log('[useMarkVariantViewed] Marked as viewed:', variantId.substring(0, 8));

      // Invalidate variant-level queries (VariantSelector)
      queryClient.invalidateQueries({ queryKey: ['generation-variants'] });
      queryClient.invalidateQueries({ queryKey: ['derived-items'] });

      // Invalidate generation-level queries (gallery, timeline, batch)
      queryClient.invalidateQueries({ queryKey: ['all-shot-generations'] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      queryClient.invalidateQueries({ queryKey: ['shot-positions'] });

      // Also invalidate variant-badges to refetch accurate counts
      queryClient.invalidateQueries({ queryKey: ['variant-badges'] });
    },
    onError: (error) => {
      console.error('[useMarkVariantViewed] Failed:', error);
    },
  });

  return {
    markViewed: mutation.mutate,
    isMarking: mutation.isPending,
  };
}

export default useMarkVariantViewed;
