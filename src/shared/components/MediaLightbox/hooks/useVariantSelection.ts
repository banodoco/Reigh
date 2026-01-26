/**
 * useVariantSelection - Handles variant selection with mark-as-viewed behavior
 *
 * Wraps the raw setActiveVariantId to add logging and automatic mark-as-viewed,
 * handles initial variant setup from props, and tracks which variants have been
 * marked as viewed to avoid duplicate marks.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useMarkVariantViewed } from '@/shared/hooks/useMarkVariantViewed';
import type { GenerationRow } from '@/types/shots';

// Type for variant from useVariants hook
interface Variant {
  id: string;
  location: string;
  thumbnail_url?: string | null;
  variant_type: string;
  is_primary: boolean;
  // ... other fields
}

export interface UseVariantSelectionProps {
  /** Media being viewed (needed for generation_id) */
  media: GenerationRow;
  /** Raw setter from useVariants hook */
  rawSetActiveVariantId: (variantId: string) => void;
  /** Current active variant from useVariants hook */
  activeVariant: Variant | null | undefined;
  /** All variants from useVariants hook */
  variants: Variant[] | undefined;
  /** Initial variant ID to select (from prop) */
  initialVariantId?: string;
}

export interface UseVariantSelectionReturn {
  /** Wrapped setter that logs and marks viewed */
  setActiveVariantId: (variantId: string) => void;
  /** Whether viewing a non-primary variant */
  isViewingNonPrimaryVariant: boolean;
}

export function useVariantSelection({
  media,
  rawSetActiveVariantId,
  activeVariant,
  variants,
  initialVariantId,
}: UseVariantSelectionProps): UseVariantSelectionReturn {
  // Hook to mark variants as viewed (removes NEW badge)
  const { markViewed } = useMarkVariantViewed();

  // Track which initialVariantId we've already handled to avoid re-setting on every render
  const handledInitialVariantRef = useRef<string | null>(null);

  // Track which variant has been marked as viewed for this media to avoid duplicate marks
  const markedViewedVariantRef = useRef<string | null>(null);

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
      const generationId = media.generation_id || media.id;
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
  useEffect(() => {
    // Only process if we have a new initialVariantId different from what we've handled
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

  // Mark the initial/active variant as viewed when the lightbox opens
  // This handles the case where the primary variant is auto-selected without explicit setActiveVariantId call
  useEffect(() => {
    if (!media) return;
    if (activeVariant && activeVariant.id && markedViewedVariantRef.current !== activeVariant.id) {
      const generationId = media.generation_id || media.id;
      console.log('[VariantViewed] Marking initial variant as viewed:', {
        variantId: activeVariant.id.substring(0, 8),
        isPrimary: activeVariant.is_primary,
        generationId: generationId.substring(0, 8),
      });
      markViewed({ variantId: activeVariant.id, generationId });
      markedViewedVariantRef.current = activeVariant.id;
    }
  }, [activeVariant, media?.generation_id, media?.id, markViewed, media]);

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

  return {
    setActiveVariantId,
    isViewingNonPrimaryVariant,
  };
}
