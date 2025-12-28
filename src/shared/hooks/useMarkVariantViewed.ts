/**
 * useMarkVariantViewed Hook
 *
 * Marks a variant as viewed in the database.
 * Used when user views a variant in the lightbox to remove the NEW badge.
 *
 * Usage:
 *   const markVariantViewed = useMarkVariantViewed();
 *   markVariantViewed.mutate(variantId);
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useMarkVariantViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variantId: string) => {
      // Only update if not already viewed (viewed_at IS NULL)
      const { error } = await supabase
        .from('generation_variants')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', variantId)
        .is('viewed_at', null);

      if (error) {
        console.error('[useMarkVariantViewed] Error marking variant as viewed:', error);
        throw error;
      }

      return variantId;
    },
    onSuccess: (variantId) => {
      console.log('[useMarkVariantViewed] Marked variant as viewed:', variantId.substring(0, 8));

      // Invalidate queries so NEW badge updates
      queryClient.invalidateQueries({ queryKey: ['generation-variants'] });
      queryClient.invalidateQueries({ queryKey: ['derived-items'] });
    },
    onError: (error) => {
      // Silent fail - not critical if marking viewed fails
      console.error('[useMarkVariantViewed] Failed to mark variant as viewed:', error);
    },
  });
}

export default useMarkVariantViewed;
