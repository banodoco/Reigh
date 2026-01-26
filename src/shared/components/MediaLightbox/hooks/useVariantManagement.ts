import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { GenerationRow } from '@/types/shots';
import { useVariants, GenerationVariant } from '@/shared/hooks/useVariants';
import { useMarkVariantViewed } from '@/shared/hooks/useMarkVariantViewed';
import { usePromoteVariantToGeneration } from '@/shared/hooks/usePromoteVariantToGeneration';
import { useAddImageToShot } from '@/shared/hooks/useShots';

interface UseVariantManagementProps {
  /** The generation ID to fetch variants for (should prefer parent_generation_id for children) */
  variantFetchGenerationId: string;
  /** The actual generation ID for operations */
  actualGenerationId: string;
  /** The media object */
  media: GenerationRow;
  /** Selected project ID */
  selectedProjectId: string | null;
  /** Initial variant ID to select when opening */
  initialVariantId?: string;
  /** Whether to disable variant fetching (e.g., in form-only mode) */
  isFormOnlyMode?: boolean;
}

interface UseVariantManagementReturn {
  /** All variants for this generation */
  variants: GenerationVariant[] | undefined;
  /** The primary variant */
  primaryVariant: GenerationVariant | undefined;
  /** The currently active/selected variant */
  activeVariant: GenerationVariant | undefined;
  /** Whether variants are loading */
  isLoadingVariants: boolean;
  /** Set the active variant ID */
  setActiveVariantId: (variantId: string) => void;
  /** Refetch variants */
  refetchVariants: () => void;
  /** Set a variant as primary */
  setPrimaryVariant: (variantId: string) => Promise<void>;
  /** Delete a variant */
  deleteVariant: (variantId: string) => Promise<void>;
  /** Whether viewing a non-primary variant */
  isViewingNonPrimaryVariant: boolean;
  /** Mutation for promoting variant to generation */
  promoteVariantMutation: ReturnType<typeof usePromoteVariantToGeneration>;
  /** Whether promotion was successful (for UI feedback) */
  promoteSuccess: boolean;
  /** Handler to promote a variant to a standalone generation */
  handlePromoteToGeneration: (variantId: string) => Promise<void>;
  /** Handler to add variant as new generation to a shot */
  handleAddVariantAsNewGenerationToShot: (
    shotId: string,
    variantId: string,
    currentTimelineFrame?: number
  ) => Promise<boolean>;
  /** Whether currently making a variant the main */
  isMakingMainVariant: boolean;
  /** Set making main variant state */
  setIsMakingMainVariant: (value: boolean) => void;
  /** Ref for scrolling to variants section */
  variantsSectionRef: React.RefObject<HTMLDivElement>;
}

/**
 * Hook to manage variant state, selection, and operations.
 * Handles fetching variants, marking as viewed, promotion to generation, etc.
 */
export function useVariantManagement({
  variantFetchGenerationId,
  actualGenerationId,
  media,
  selectedProjectId,
  initialVariantId,
  isFormOnlyMode = false,
}: UseVariantManagementProps): UseVariantManagementReturn {
  const queryClient = useQueryClient();

  // Variants hook - fetch available variants for this generation
  const variantsHook = useVariants({
    generationId: variantFetchGenerationId,
    enabled: !isFormOnlyMode,
  });
  const {
    variants,
    primaryVariant,
    activeVariant,
    isLoading: isLoadingVariants,
    setActiveVariantId: rawSetActiveVariantId,
    refetch: refetchVariants,
    setPrimaryVariant,
    deleteVariant,
  } = variantsHook;

  // Hook to mark variants as viewed (removes NEW badge)
  const { markViewed } = useMarkVariantViewed();

  // Ref for scrolling to variants section
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  // State for making main variant
  const [isMakingMainVariant, setIsMakingMainVariant] = useState(false);

  // Wrap setActiveVariantId with logging and mark-as-viewed
  const setActiveVariantId = useCallback((variantId: string) => {
    console.log('[VariantClickDebug] setActiveVariantId called:', {
      variantId: variantId?.substring(0, 8),
      currentActiveVariant: activeVariant?.id?.substring(0, 8),
      variantsCount: variants?.length,
    });
    // Mark variant as viewed when selected (fire-and-forget)
    // Pass generationId for optimistic badge update
    if (variantId) {
      const generationId = (media as any).generation_id || media.id;
      markViewed({ variantId, generationId });
    }
    rawSetActiveVariantId(variantId);
  }, [rawSetActiveVariantId, activeVariant, variants, markViewed, media]);

  // Log when activeVariant changes
  useEffect(() => {
    console.log('[VariantClickDebug] activeVariant changed:', {
      activeVariantId: activeVariant?.id?.substring(0, 8),
      activeVariantType: activeVariant?.variant_type,
      activeVariantIsPrimary: activeVariant?.is_primary,
      activeVariantLocation: activeVariant?.location?.substring(0, 50),
    });
  }, [activeVariant]);

  // Set initial variant when variants load and initialVariantId is provided
  const handledInitialVariantRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialVariantId && variants && variants.length > 0) {
      if (handledInitialVariantRef.current !== initialVariantId) {
        const targetVariant = variants.find(v => v.id === initialVariantId);
        if (targetVariant) {
          console.log('[VariantClickDebug] Setting initial variant from prop:', initialVariantId.substring(0, 8));
          setActiveVariantId(initialVariantId);
          handledInitialVariantRef.current = initialVariantId;
        }
      }
    }
  }, [initialVariantId, variants, setActiveVariantId]);

  // Reset handled ref when media changes (new item opened)
  useEffect(() => {
    handledInitialVariantRef.current = null;
  }, [media?.id]);

  // Track which variant has been marked as viewed for this media to avoid duplicate marks
  const markedViewedVariantRef = useRef<string | null>(null);

  // Mark the initial/active variant as viewed when the lightbox opens
  useEffect(() => {
    if (!media) return;
    if (activeVariant && activeVariant.id && markedViewedVariantRef.current !== activeVariant.id) {
      const generationId = (media as any).generation_id || media.id;
      console.log('[VariantViewed] Marking initial variant as viewed:', {
        variantId: activeVariant.id.substring(0, 8),
        isPrimary: activeVariant.is_primary,
        generationId: generationId.substring(0, 8),
      });
      markViewed({ variantId: activeVariant.id, generationId });
      markedViewedVariantRef.current = activeVariant.id;
    }
  }, [activeVariant, media, markViewed]);

  // Reset marked-viewed ref when media changes (new item opened)
  useEffect(() => {
    markedViewedVariantRef.current = null;
  }, [media?.id]);

  // Compute isViewingNonPrimaryVariant early for edit hooks
  const isViewingNonPrimaryVariant = !!(activeVariant && !activeVariant.is_primary);

  // Log variant info for edit tracking
  useEffect(() => {
    console.log('[VariantRelationship] Edit mode variant info:');
    console.log('[VariantRelationship] - isViewingNonPrimaryVariant:', isViewingNonPrimaryVariant);
    console.log('[VariantRelationship] - activeVariantId:', activeVariant?.id);
    console.log('[VariantRelationship] - activeVariantType:', activeVariant?.variant_type);
    console.log('[VariantRelationship] - activeVariantIsPrimary:', activeVariant?.is_primary);
    console.log('[VariantRelationship] - willPassSourceVariantId:', isViewingNonPrimaryVariant ? activeVariant?.id : null);
  }, [activeVariant, isViewingNonPrimaryVariant]);

  // Variant promotion - create standalone generation from a variant
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
    } catch (error) {
      console.error('[PromoteVariant] Error promoting variant:', error);
    }
  }, [promoteVariantMutation, selectedProjectId, actualGenerationId]);

  // Handler for "Add as new image to shot" button in ShotSelectorControls
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
        const { data: shotItems } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('shot_id', shotId)
          .order('timeline_frame', { ascending: true });

        if (shotItems && shotItems.length > 0) {
          // Find the next item after current position
          const nextItem = shotItems.find(item =>
            item.timeline_frame !== null && item.timeline_frame > currentTimelineFrame
          );

          if (nextItem && nextItem.timeline_frame !== null) {
            // Position between current and next
            targetTimelineFrame = Math.floor((currentTimelineFrame + nextItem.timeline_frame) / 2);
          } else {
            // No next item, position after current
            targetTimelineFrame = currentTimelineFrame + 1000;
          }
        } else {
          // No items in shot, use current frame
          targetTimelineFrame = currentTimelineFrame;
        }
      }

      console.log('[VariantToShot] Calculated timeline frame:', {
        currentFrame: currentTimelineFrame,
        targetFrame: targetTimelineFrame,
      });

      // 3. Add the new generation to the target shot
      await addImageToShotMutation.mutateAsync({
        shotId,
        generationId: newGen.id,
        position: targetTimelineFrame,
      });

      console.log('[VariantToShot] Added to shot successfully');

      // 4. Invalidate shot queries to refresh the view
      queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
      queryClient.invalidateQueries({ queryKey: ['shots'] });

      return true;
    } catch (error) {
      console.error('[VariantToShot] Error:', error);
      toast.error('Failed to add variant to shot');
      return false;
    }
  }, [selectedProjectId, actualGenerationId, promoteVariantMutation, addImageToShotMutation, queryClient]);

  return {
    variants,
    primaryVariant,
    activeVariant,
    isLoadingVariants,
    setActiveVariantId,
    refetchVariants,
    setPrimaryVariant,
    deleteVariant,
    isViewingNonPrimaryVariant,
    promoteVariantMutation,
    promoteSuccess,
    handlePromoteToGeneration,
    handleAddVariantAsNewGenerationToShot,
    isMakingMainVariant,
    setIsMakingMainVariant,
    variantsSectionRef,
  };
}
