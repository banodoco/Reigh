/**
 * useMarkVariantViewed Hook
 *
 * Marks a variant as viewed in the database and invalidates all relevant queries.
 * Used when user views a variant in the lightbox to remove the NEW badge.
 *
 * Usage:
 *   const { markViewed } = useMarkVariantViewed();
 *   markViewed(variantId);
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useMarkVariantViewed() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (variantId: string) => {
      const { error } = await supabase
        .from('generation_variants')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', variantId)
        .is('viewed_at', null);

      if (error) {
        console.error('[useMarkVariantViewed] Error:', error);
        throw error;
      }

      return variantId;
    },
    onSuccess: (variantId) => {
      console.log('[useMarkVariantViewed] Marked as viewed:', variantId.substring(0, 8));

      // Invalidate variant-level queries (VariantSelector)
      queryClient.invalidateQueries({ queryKey: ['generation-variants'] });
      queryClient.invalidateQueries({ queryKey: ['derived-items'] });

      // Invalidate generation-level queries (gallery, timeline, batch)
      queryClient.invalidateQueries({ queryKey: ['all-shot-generations'] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      queryClient.invalidateQueries({ queryKey: ['shot-positions'] });
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
