import { useMemo, useEffect } from 'react';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { GenerationRow, Shot } from '@/types/shots';

export interface ShotOption {
  id: string;
  name: string;
}

export interface UseShotPositioningProps {
  media: GenerationRow;
  selectedShotId: string | undefined;
  allShots: ShotOption[];
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onNavigateToShot?: (shot: Shot) => void;
  onClose: () => void;
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onShowTick?: (imageId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticPositioned?: (mediaId: string, shotId?: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId?: string) => void;
}

export interface UseShotPositioningReturn {
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  handleAddToShot: () => Promise<void>;
  handleAddToShotWithoutPosition: () => Promise<void>;
}

/**
 * Hook for managing shot positioning logic
 * Handles checking if media is positioned/associated with shots and navigation
 */
export const useShotPositioning = ({
  media,
  selectedShotId,
  allShots,
  positionedInSelectedShot,
  associatedWithoutPositionInSelectedShot,
  optimisticPositionedIds,
  optimisticUnpositionedIds,
  onNavigateToShot,
  onClose,
  onAddToShot,
  onAddToShotWithoutPosition,
  onShowTick,
  onShowSecondaryTick,
  onOptimisticPositioned,
  onOptimisticUnpositioned,
}: UseShotPositioningProps): UseShotPositioningReturn => {
  const { navigateToShot } = useShotNavigation();

  const isAlreadyPositionedInSelectedShot = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    const compositeKey = `${media.id}:${selectedShotId}`;
    const optimisticSetSize = optimisticPositionedIds?.size || 0;
    const optimisticKeys = optimisticPositionedIds ? Array.from(optimisticPositionedIds) : [];
    
    // Check optimistic state first (most up-to-date and shot-specific)
    const hasComposite = optimisticPositionedIds?.has(compositeKey);
    const hasSimple = optimisticPositionedIds?.has(media.id);
    
    // Optimistic state takes precedence - if we have a composite key match, trust it
    if (hasComposite) {
      return true;
    }
    
    // CRITICAL: Don't trust simple keys when we have a selectedShotId - simple keys are not shot-specific!
    // Simple keys mean "added to SOME shot" but we don't know which one, so they're ambiguous.
    // Only use simple keys as a last resort if we can't determine shot-specific state.
    
    // Only use override if optimistic state is empty (no recent changes)
    // BUT verify the override matches the selected shot by checking media's actual shot associations
    if (typeof positionedInSelectedShot === 'boolean') {
      // Verify media is actually associated with the selected shot
      const allShotAssociations = (media as any).all_shot_associations;
      let mediaIsInSelectedShot = false;
      if ((media as any).shot_id === selectedShotId) {
        mediaIsInSelectedShot = true;
      } else if (allShotAssociations && Array.isArray(allShotAssociations)) {
        mediaIsInSelectedShot = allShotAssociations.some(
          (assoc: any) => assoc.shot_id === selectedShotId
        );
      }
      
      // Only trust override if media is actually in the selected shot
      // If override says true but media isn't in selected shot, ignore it (override is stale/wrong)
      const shouldTrustOverride = positionedInSelectedShot && mediaIsInSelectedShot;
      return shouldTrustOverride ? positionedInSelectedShot : false;
    }
    
    // Check if this media is positioned in the selected shot
    // First check single shot association
    if ((media as any).shot_id === selectedShotId) {
      const result = (media as any).position !== null && (media as any).position !== undefined;
      return result;
    }
    
    // Check multiple shot associations
    const allShotAssociations = (media as any).all_shot_associations;
    if (allShotAssociations && Array.isArray(allShotAssociations)) {
      const matchingAssociation = allShotAssociations.find(
        (assoc: any) => assoc.shot_id === selectedShotId
      );
      const result = matchingAssociation && 
             matchingAssociation.position !== null && 
             matchingAssociation.position !== undefined;
      return result;
    }
    
    return false;
  }, [selectedShotId, media, optimisticPositionedIds, positionedInSelectedShot]);

  // [ShotNavDebug] Log computed positioned state
  useEffect(() => {
    console.log('[ShotNavDebug] [MediaLightbox] isAlreadyPositionedInSelectedShot computed', {
      mediaId: media?.id,
      selectedShotId,
      value: isAlreadyPositionedInSelectedShot,
      mediaShotId: (media as any)?.shot_id,
      mediaPosition: (media as any)?.position,
      optimisticHas: optimisticPositionedIds?.has(media?.id || ''),
      override: positionedInSelectedShot,
      timestamp: Date.now()
    });
  }, [isAlreadyPositionedInSelectedShot, media?.id, selectedShotId, optimisticPositionedIds, positionedInSelectedShot]);

  const handleAddToShot = async () => {
    if (!onAddToShot || !selectedShotId) return;
    
    console.log('[ShotNavDebug] [MediaLightbox] handleAddToShot click', {
      mediaId: media?.id,
      selectedShotId,
      isAlreadyPositionedInSelectedShot,
      hasOnNavigateToShot: !!onNavigateToShot,
      allShotsCount: allShots?.length,
      timestamp: Date.now()
    });

    // If already positioned in shot, navigate to the shot
    if (isAlreadyPositionedInSelectedShot) {
      const targetShotOption = allShots.find(s => s.id === selectedShotId);
      const minimalShot: Shot = {
        id: targetShotOption?.id || selectedShotId,
        name: targetShotOption?.name || 'Shot',
        images: [],
        position: 0,
      };
      console.log('[ShotNavDebug] [MediaLightbox] Navigating to shot (with position)', {
        minimalShot,
        usedFrom: targetShotOption ? 'fromList' : 'fallback',
        via: onNavigateToShot ? 'onNavigateToShot' : 'navigateToShot+onClose',
        timestamp: Date.now()
      });
      if (onNavigateToShot) {
        onNavigateToShot(minimalShot);
      } else {
        onClose();
        navigateToShot(minimalShot);
      }
      return;
    }
    
    console.log('[ShotNavDebug] [MediaLightbox] Calling onAddToShot', {
      mediaId: media?.id,
      imageUrl: (media?.imageUrl || '').slice(0, 120),
      thumbUrl: (media?.thumbUrl || '').slice(0, 120),
      timestamp: Date.now()
    });
    const success = await onAddToShot(media.id, media.imageUrl, media.thumbUrl);
    console.log('[ShotNavDebug] [MediaLightbox] onAddToShot result', { success, timestamp: Date.now() });
    if (success) {
      onShowTick?.(media.id);
      // Pass selectedShotId so optimistic state can use composite keys (mediaId:shotId)
      onOptimisticPositioned?.(media.id, selectedShotId);
      console.log('[ShotNavDebug] [MediaLightbox] Positioned optimistic + tick applied', {
        mediaId: media?.id,
        timestamp: Date.now()
      });
    }
  };

  // Check if image is already associated with the selected shot WITHOUT position
  const isAlreadyAssociatedWithoutPosition = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    // Prefer override from gallery source
    if (typeof associatedWithoutPositionInSelectedShot === 'boolean') {
      // Check for composite key (mediaId:shotId) first, then fallback to simple mediaId
      const compositeKey = `${media.id}:${selectedShotId}`;
      const hasComposite = optimisticUnpositionedIds?.has(compositeKey);
      const hasSimple = optimisticUnpositionedIds?.has(media.id);
      return associatedWithoutPositionInSelectedShot || !!hasComposite || !!hasSimple;
    }
    
    // Check optimistic state first - try composite key (mediaId:shotId), then fallback to simple mediaId
    const compositeKey = `${media.id}:${selectedShotId}`;
    if (optimisticUnpositionedIds?.has(compositeKey)) return true;
    if (optimisticUnpositionedIds?.has(media.id)) return true;
    
    // Check if this media is associated with the selected shot without position
    // First check single shot association
    if ((media as any).shot_id === selectedShotId) {
      return (media as any).position === null || (media as any).position === undefined;
    }
    
    // Check multiple shot associations
    const allShotAssociations = (media as any).all_shot_associations;
    if (allShotAssociations && Array.isArray(allShotAssociations)) {
      const matchingAssociation = allShotAssociations.find(
        (assoc: any) => assoc.shot_id === selectedShotId
      );
      return matchingAssociation && 
             (matchingAssociation.position === null || matchingAssociation.position === undefined);
    }
    
    return false;
  }, [selectedShotId, media, optimisticUnpositionedIds, associatedWithoutPositionInSelectedShot]);

  // [ShotNavDebug] Log computed unpositioned state
  useEffect(() => {
    console.log('[ShotNavDebug] [MediaLightbox] isAlreadyAssociatedWithoutPosition computed', {
      mediaId: media?.id,
      selectedShotId,
      value: isAlreadyAssociatedWithoutPosition,
      mediaShotId: (media as any)?.shot_id,
      mediaPosition: (media as any)?.position,
      optimisticHas: optimisticUnpositionedIds?.has(media?.id || ''),
      override: associatedWithoutPositionInSelectedShot,
      timestamp: Date.now()
    });
  }, [isAlreadyAssociatedWithoutPosition, media?.id, selectedShotId, optimisticUnpositionedIds, associatedWithoutPositionInSelectedShot]);

  const handleAddToShotWithoutPosition = async () => {
    if (!onAddToShotWithoutPosition || !selectedShotId) return;

    console.log('[ShotNavDebug] [MediaLightbox] handleAddToShotWithoutPosition click', {
      mediaId: media?.id,
      selectedShotId,
      isAlreadyAssociatedWithoutPosition,
      hasOnNavigateToShot: !!onNavigateToShot,
      allShotsCount: allShots?.length,
      timestamp: Date.now()
    });
    
    // If already associated without position, navigate to the shot
    if (isAlreadyAssociatedWithoutPosition) {
      const targetShotOption = allShots.find(s => s.id === selectedShotId);
      const minimalShot: Shot = {
        id: targetShotOption?.id || selectedShotId,
        name: targetShotOption?.name || 'Shot',
        images: [],
        position: 0,
      };
      console.log('[ShotNavDebug] [MediaLightbox] Navigating to shot (without position)', {
        minimalShot,
        usedFrom: targetShotOption ? 'fromList' : 'fallback',
        via: onNavigateToShot ? 'onNavigateToShot' : 'navigateToShot+onClose',
        timestamp: Date.now()
      });
      if (onNavigateToShot) {
        onNavigateToShot(minimalShot);
      } else {
        onClose();
        navigateToShot(minimalShot);
      }
      return;
    }
    
    console.log('[ShotNavDebug] [MediaLightbox] Calling onAddToShotWithoutPosition', {
      mediaId: media?.id,
      imageUrl: (media?.imageUrl || '').slice(0, 120),
      thumbUrl: (media?.thumbUrl || '').slice(0, 120),
      timestamp: Date.now()
    });
    const success = await onAddToShotWithoutPosition(media.id, media.imageUrl, media.thumbUrl);
    console.log('[ShotNavDebug] [MediaLightbox] onAddToShotWithoutPosition result', { success, timestamp: Date.now() });
    if (success) {
      onShowSecondaryTick?.(media.id);
      // Pass selectedShotId so optimistic state can use composite keys (mediaId:shotId)
      onOptimisticUnpositioned?.(media.id, selectedShotId);
      console.log('[ShotNavDebug] [MediaLightbox] Unpositioned optimistic + tick applied', {
        mediaId: media?.id,
        timestamp: Date.now()
      });
    }
  };

  return {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  };
};

