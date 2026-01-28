/**
 * Hook to demote orphaned video variants when source images change.
 *
 * When timeline images are replaced, reordered, or deleted, existing videos
 * can become "orphaned" - they no longer match their source images. This hook
 * calls an RPC to detect and demote these variants (set is_primary: false).
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDemoteOrphanedVariants() {
  const queryClient = useQueryClient();

  const demoteOrphanedVariants = useCallback(async (shotId: string): Promise<number> => {
    if (!shotId) {
      console.warn('[DemoteOrphaned] No shot ID provided');
      return 0;
    }

    try {
      console.log('[DemoteOrphaned] Checking for orphaned variants in shot:', shotId.substring(0, 8));

      const { data, error } = await supabase
        .rpc('demote_orphaned_video_variants', { p_shot_id: shotId });

      if (error) {
        console.error('[DemoteOrphaned] RPC error:', error);
        return 0;
      }

      const demotedCount = data ?? 0;

      if (demotedCount > 0) {
        console.log(`[DemoteOrphaned] Demoted ${demotedCount} variant(s) for shot ${shotId.substring(0, 8)}`);

        // Invalidate relevant queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ['segment-child-generations'] });
        queryClient.invalidateQueries({ queryKey: ['all-shot-generations', shotId] });
        queryClient.invalidateQueries({ queryKey: ['segment-parent-generations', shotId] });
      } else {
        console.log('[DemoteOrphaned] No orphaned variants found');
      }

      return demotedCount;
    } catch (error) {
      console.error('[DemoteOrphaned] Unexpected error:', error);
      return 0;
    }
  }, [queryClient]);

  return { demoteOrphanedVariants };
}
