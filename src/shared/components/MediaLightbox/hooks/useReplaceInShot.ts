/**
 * useReplaceInShot Hook
 *
 * Handles swapping timeline position from a parent generation to the current image.
 * Used when user wants to replace a parent image in the timeline with a derived image.
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UseReplaceInShotProps {
  /** Callback to close the lightbox after successful replacement */
  onClose: () => void;
}

export interface UseReplaceInShotReturn {
  /**
   * Replace parent's timeline position with current image
   * @param parentGenerationId - ID of the parent generation to remove from timeline
   * @param currentMediaId - ID of the current media to place in timeline
   * @param parentTimelineFrame - Timeline frame position to use
   * @param shotId - Shot ID for the replacement
   */
  handleReplaceInShot: (
    parentGenerationId: string,
    currentMediaId: string,
    parentTimelineFrame: number,
    shotId: string
  ) => Promise<void>;
}

export function useReplaceInShot({
  onClose,
}: UseReplaceInShotProps): UseReplaceInShotReturn {
  const handleReplaceInShot = useCallback(async (
    parentGenerationId: string,
    currentMediaId: string,
    parentTimelineFrame: number,
    shotIdParam: string
  ) => {
    console.log('[ReplaceInShot] Handler started', {
      parentId: parentGenerationId.substring(0, 8),
      currentId: currentMediaId.substring(0, 8),
      frame: parentTimelineFrame,
      shotId: shotIdParam.substring(0, 8)
    });

    try {
      // 1. Remove timeline_frame from parent's shot_generation record
      const { error: removeError } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: null })
        .eq('generation_id', parentGenerationId)
        .eq('shot_id', shotIdParam);

      if (removeError) throw removeError;

      // 2. Update or create shot_generation for current image with the timeline_frame
      // First check if current image already has a shot_generation for this shot
      const { data: existingAssoc } = await supabase
        .from('shot_generations')
        .select('id')
        .eq('generation_id', currentMediaId)
        .eq('shot_id', shotIdParam)
        .single();

      if (existingAssoc) {
        // Update existing
        const { error: updateError } = await supabase
          .from('shot_generations')
          .update({
            timeline_frame: parentTimelineFrame,
            metadata: { user_positioned: true, drag_source: 'replace_parent' }
          })
          .eq('id', existingAssoc.id);

        if (updateError) throw updateError;
      } else {
        // Create new
        const { error: createError } = await supabase
          .from('shot_generations')
          .insert({
            shot_id: shotIdParam,
            generation_id: currentMediaId,
            timeline_frame: parentTimelineFrame,
            metadata: { user_positioned: true, drag_source: 'replace_parent' }
          });

        if (createError) throw createError;
      }

      console.log('[ReplaceInShot] Handler completed successfully');

      // Close lightbox to force refresh when reopened
      onClose();
    } catch (error) {
      console.error('[ReplaceInShot] Handler failed:', error);
      throw error;
    }
  }, [onClose]);

  return { handleReplaceInShot };
}
