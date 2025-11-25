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
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
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

    // Composite key for optimistic check: mediaId:shotId
    const optimisticKey = `${media.id}:${selectedShotId}`;
    
    // Prefer override from gallery source
    if (typeof positionedInSelectedShot === 'boolean') {
      return positionedInSelectedShot || !!optimisticPositionedIds?.has(optimisticKey);
    }
    
    // Check optimistic state first (using composite key)
    if (optimisticPositionedIds?.has(optimisticKey)) return true;
    
    // Check if this media is positioned in the selected shot
    // First check single shot association
    if ((media as any).shot_id === selectedShotId) {
      return (media as any).position !== null && (media as any).position !== undefined;
    }
    
    // Check multiple shot associations
    const allShotAssociations = (media as any).all_shot_associations;
    if (allShotAssociations && Array.isArray(allShotAssociations)) {
      const matchingAssociation = allShotAssociations.find(
        (assoc: any) => assoc.shot_id === selectedShotId
      );
      return matchingAssociation && 
             matchingAssociation.position !== null && 
             matchingAssociation.position !== undefined;
    }
    
    return false;
  }, [selectedShotId, media, optimisticPositionedIds, positionedInSelectedShot]);

  // [ShotNavDebug] Log computed positioned state
  useEffect(() => {
    const optimisticKey = `${media?.id}:${selectedShotId}`;
    console.log('[ShotNavDebug] [MediaLightbox] isAlreadyPositionedInSelectedShot computed', {
      mediaId: media?.id,
      selectedShotId,
      value: isAlreadyPositionedInSelectedShot,
      mediaShotId: (media as any)?.shot_id,
      mediaPosition: (media as any)?.position,
      optimisticKey,
      optimisticHas: optimisticPositionedIds?.has(optimisticKey),
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
      onOptimisticPositioned?.(media.id, selectedShotId);
      console.log('[ShotNavDebug] [MediaLightbox] Positioned optimistic + tick applied', {
        mediaId: media?.id,
        shotId: selectedShotId,
        timestamp: Date.now()
      });
    }
  };

  // Check if image is already associated with the selected shot WITHOUT position
  const isAlreadyAssociatedWithoutPosition = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    // Composite key for optimistic check: mediaId:shotId
    const optimisticKey = `${media.id}:${selectedShotId}`;
    
    // Prefer override from gallery source
    if (typeof associatedWithoutPositionInSelectedShot === 'boolean') {
      return associatedWithoutPositionInSelectedShot || !!optimisticUnpositionedIds?.has(optimisticKey);
    }
    
    // Check optimistic state first (using composite key)
    if (optimisticUnpositionedIds?.has(optimisticKey)) return true;
    
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
    const optimisticKey = `${media?.id}:${selectedShotId}`;
    console.log('[ShotNavDebug] [MediaLightbox] isAlreadyAssociatedWithoutPosition computed', {
      mediaId: media?.id,
      selectedShotId,
      value: isAlreadyAssociatedWithoutPosition,
      mediaShotId: (media as any)?.shot_id,
      mediaPosition: (media as any)?.position,
      optimisticKey,
      optimisticHas: optimisticUnpositionedIds?.has(optimisticKey),
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
      onOptimisticUnpositioned?.(media.id, selectedShotId);
      console.log('[ShotNavDebug] [MediaLightbox] Unpositioned optimistic + tick applied', {
        mediaId: media?.id,
        shotId: selectedShotId,
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

