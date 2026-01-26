/**
 * useVariantPromotion - Handles promoting variants to standalone generations
 *
 * Manages variant promotion (creating standalone generation from a variant)
 * and adding variants as new generations to shots with timeline positioning.
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePromoteVariantToGeneration } from '@/shared/hooks/usePromoteVariantToGeneration';
import { useAddImageToShot } from '@/shared/hooks/useShots';

export interface UseVariantPromotionProps {
  selectedProjectId: string | null;
  actualGenerationId: string;
}

export interface UseVariantPromotionReturn {
  promoteSuccess: boolean;
  isPromoting: boolean;
  handlePromoteToGeneration: (variantId: string) => Promise<void>;
  handleAddVariantAsNewGenerationToShot: (
    shotId: string,
    variantId: string,
    currentTimelineFrame?: number
  ) => Promise<boolean>;
}

export function useVariantPromotion({
  selectedProjectId,
  actualGenerationId,
}: UseVariantPromotionProps): UseVariantPromotionReturn {
  const promoteVariantMutation = usePromoteVariantToGeneration();
  const addImageToShotMutation = useAddImageToShot();
  const [promoteSuccess, setPromoteSuccess] = useState(false);

  // Handler for "Make new image" button in VariantSelector
  const handlePromoteToGeneration = useCallback(async (variantId: string) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    console.log('[PromoteVariant] handlePromoteToGeneration called:', {
      variantId: variantId.substring(0, 8),
      projectId: selectedProjectId.substring(0, 8),
      sourceGenerationId: actualGenerationId.substring(0, 8),
    });

    setPromoteSuccess(false);

    try {
      const result = await promoteVariantMutation.mutateAsync({
        variantId,
        projectId: selectedProjectId,
        sourceGenerationId: actualGenerationId,
      });

      console.log('[PromoteVariant] Successfully created generation:', result.id.substring(0, 8));
      setPromoteSuccess(true);
      // Reset success state after delay
      setTimeout(() => setPromoteSuccess(false), 2000);
      // Stay on current item - don't navigate away
    } catch (error) {
      console.error('[PromoteVariant] Error promoting variant:', error);
      // Error toast is handled in the hook
    }
  }, [promoteVariantMutation, selectedProjectId, actualGenerationId]);

  // Handler for "Add as new image to shot" button in ShotSelectorControls
  // Positions new image between current and next item in the TARGET shot
  const handleAddVariantAsNewGenerationToShot = useCallback(async (
    shotId: string,
    variantId: string,
    currentTimelineFrame?: number
  ): Promise<boolean> => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return false;
    }

    console.log('[VariantToShot] Starting:', {
      shotId: shotId.substring(0, 8),
      variantId: variantId.substring(0, 8),
      projectId: selectedProjectId.substring(0, 8),
      sourceGenerationId: actualGenerationId.substring(0, 8),
      currentTimelineFrame,
    });

    try {
      // 1. Create the generation from the variant
      const newGen = await promoteVariantMutation.mutateAsync({
        variantId,
        projectId: selectedProjectId,
        sourceGenerationId: actualGenerationId,
      });

      console.log('[VariantToShot] Created generation:', newGen.id.substring(0, 8));

      // 2. Calculate target timeline frame by querying the TARGET shot's items
      let targetTimelineFrame: number | undefined;
      if (currentTimelineFrame !== undefined) {
        // Query the target shot to find the next item after current position
        const { data: shotItems } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('shot_id', shotId)
          .gt('timeline_frame', currentTimelineFrame)
          .order('timeline_frame', { ascending: true })
          .limit(1);

        const nextTimelineFrame = shotItems?.[0]?.timeline_frame ?? undefined;

        console.log('[VariantToShot] Frame calculation:', {
          currentTimelineFrame,
          nextTimelineFrame,
          hasNext: nextTimelineFrame !== undefined,
        });

        if (nextTimelineFrame !== undefined && nextTimelineFrame > currentTimelineFrame) {
          // Place in the middle between current and next
          targetTimelineFrame = Math.floor((currentTimelineFrame + nextTimelineFrame) / 2);
          console.log('[VariantToShot] Midpoint:', currentTimelineFrame, '+', nextTimelineFrame, '/ 2 =', targetTimelineFrame);
          // If middle would be same as current (consecutive frames), use current + 1
          if (targetTimelineFrame === currentTimelineFrame) {
            targetTimelineFrame = currentTimelineFrame + 1;
          }
        } else {
          // No next item in shot, place at current + 1
          targetTimelineFrame = currentTimelineFrame + 1;
          console.log('[VariantToShot] No next item, using current +1:', targetTimelineFrame);
        }
      }

      // 3. Add to shot
      await addImageToShotMutation.mutateAsync({
        shot_id: shotId,
        generation_id: newGen.id,
        project_id: selectedProjectId,
        imageUrl: newGen.location,
        thumbUrl: newGen.thumbnail_url || undefined,
        timelineFrame: targetTimelineFrame,
      });
      console.log('[VariantToShot] Added to shot at frame:', targetTimelineFrame);
      return true;
    } catch (error) {
      console.error('[VariantToShot] Error:', error);
      return false;
    }
  }, [promoteVariantMutation, addImageToShotMutation, selectedProjectId, actualGenerationId]);

  return {
    promoteSuccess,
    isPromoting: promoteVariantMutation.isPending,
    handlePromoteToGeneration,
    handleAddVariantAsNewGenerationToShot,
  };
}
