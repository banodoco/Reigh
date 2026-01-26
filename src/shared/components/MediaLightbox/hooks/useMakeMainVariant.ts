/**
 * useMakeMainVariant Hook
 *
 * Handles making the current media the main variant of its parent generation.
 * Supports two cases:
 * 1. Viewing a child generation: creates a variant on the parent with child's content
 * 2. Viewing a non-primary variant: sets that variant as primary
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidateVariantChange } from '@/shared/hooks/useGenerationInvalidation';
import type { GenerationRow } from '@/types/shots';

export interface UseMakeMainVariantProps {
  /** Current media being viewed */
  media: GenerationRow;
  /** Parent generation data (if viewing a child) */
  sourceGenerationData: GenerationRow | null;
  /** Whether viewing a child that can be promoted */
  canMakeMainVariantFromChild: boolean;
  /** Whether viewing a non-primary variant */
  canMakeMainVariantFromVariant: boolean;
  /** Active variant being viewed */
  activeVariant: { id: string; location?: string | null } | null;
  /** Function to set a variant as primary */
  setPrimaryVariant: (variantId: string) => Promise<void>;
  /** Function to refetch variants list */
  refetchVariants: () => void;
  /** Current shot ID */
  shotId: string | null | undefined;
  /** Selected shot ID (from dropdown) */
  selectedShotId: string | null | undefined;
  /** Callback to close lightbox */
  onClose: () => void;
}

export interface UseMakeMainVariantReturn {
  /** Whether the make main variant operation is in progress */
  isMakingMainVariant: boolean;
  /** Handler to make current media the main variant */
  handleMakeMainVariant: () => Promise<void>;
}

export function useMakeMainVariant({
  media,
  sourceGenerationData,
  canMakeMainVariantFromChild,
  canMakeMainVariantFromVariant,
  activeVariant,
  setPrimaryVariant,
  refetchVariants,
  shotId,
  selectedShotId,
  onClose,
}: UseMakeMainVariantProps): UseMakeMainVariantReturn {
  const queryClient = useQueryClient();
  const [isMakingMainVariant, setIsMakingMainVariant] = useState(false);

  const handleMakeMainVariant = useCallback(async () => {
    console.log('[VariantClickDebug] handleMakeMainVariant called in MediaLightbox', {
      canMakeMainVariantFromChild,
      canMakeMainVariantFromVariant,
      activeVariantId: activeVariant?.id?.substring(0, 8),
    });

    setIsMakingMainVariant(true);
    try {
      // Case 2: We're viewing a non-primary variant - just set it as primary
      if (canMakeMainVariantFromVariant && activeVariant) {
        console.log('[VariantClickDebug] Setting existing variant as primary:', activeVariant.id.substring(0, 8));
        await setPrimaryVariant(activeVariant.id);
        console.log('[VariantClickDebug] Successfully set variant as primary');
        // Refetch variants to update UI
        refetchVariants();
        return;
      }

      // Case 1: We're viewing a child generation - create variant on parent
      if (!sourceGenerationData || !media.location) {
        console.log('[VariantClickDebug] handleMakeMainVariant bailing - missing data:', {
          hasSourceGenerationData: !!sourceGenerationData,
          hasMediaLocation: !!media.location,
        });
        return;
      }

      const parentGenId = sourceGenerationData.id;
      console.log('[VariantClickDebug] Creating variant on parent generation', {
        parentId: parentGenId.substring(0, 8),
        currentId: media.id.substring(0, 8),
        currentLocation: media.location.substring(0, 50)
      });
      // 1. Create a new variant on the parent generation with current media's location
      const { data: insertedVariant, error: insertError } = await supabase
        .from('generation_variants')
        .insert({
          generation_id: parentGenId,
          location: media.location,
          thumbnail_url: media.thumbUrl || (media as any).thumbnail_url || null,
          is_primary: true,
          variant_type: 'child_promoted',
          name: null,
          params: {
            source_generation_id: media.id,
            promoted_at: new Date().toISOString()
          }
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[VariantClickDebug] Failed to create variant:', insertError);
        throw insertError;
      }

      console.log('[VariantClickDebug] Created variant:', insertedVariant?.id?.substring(0, 8));

      // 2. Update the parent generation's location and thumbnail
      const { error: updateError } = await supabase
        .from('generations')
        .update({
          location: media.location,
          thumbnail_url: media.thumbUrl || (media as any).thumbnail_url
        })
        .eq('id', parentGenId);

      if (updateError) {
        console.warn('[VariantClickDebug] Failed to update parent generation:', updateError);
      }

      console.log('[VariantClickDebug] Successfully made current media the main variant');

      // Invalidate caches so all views update (timeline, shot editor, galleries, variants list).
      // Use selectedShotId if available (most likely current context), else fall back to shotId.
      await invalidateVariantChange(queryClient, {
        generationId: parentGenId,
        shotId: selectedShotId || shotId,
        reason: 'child-promoted-to-primary',
      });

      // Close the lightbox (UI will now reflect updated data without refresh)
      onClose();
    } catch (error) {
      console.error('[VariantClickDebug] handleMakeMainVariant failed:', error);
    } finally {
      setIsMakingMainVariant(false);
    }
  }, [
    sourceGenerationData,
    media,
    onClose,
    canMakeMainVariantFromChild,
    canMakeMainVariantFromVariant,
    activeVariant,
    setPrimaryVariant,
    refetchVariants,
    queryClient,
    selectedShotId,
    shotId,
  ]);

  return {
    isMakingMainVariant,
    handleMakeMainVariant,
  };
}
