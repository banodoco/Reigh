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
  onOptimisticPositioned?: (mediaId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string) => void;
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

    // Prefer override from gallery source
    if (typeof positionedInSelectedShot === 'boolean') {
      return positionedInSelectedShot || !!optimisticPositionedIds?.has(media.id);
    }
    
    // Check optimistic state first
    if (optimisticPositionedIds?.has(media.id)) return true;
    
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
    ?.shot_id,
      mediaPosition: (media as any)?.position,
      optimisticHas: optimisticPositionedIds?.has(media?.id || ''),
      override: positionedInSelectedShot,
      timestamp: Date.now()
    });
  }, [isAlreadyPositionedInSelectedShot, media?.id, selectedShotId, optimisticPositionedIds, positionedInSelectedShot]);

  const handleAddToShot = async () => {
    if (!onAddToShot || !selectedShotId) return;
    
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
      ', {
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
    
    .slice(0, 120),
      thumbUrl: (media?.thumbUrl || '').slice(0, 120),
      timestamp: Date.now()
    });
    const success = await onAddToShot(media.id, media.imageUrl, media.thumbUrl);
    });
    if (success) {
      onShowTick?.(media.id);
      onOptimisticPositioned?.(media.id);
      });
    }
  };

  // Check if image is already associated with the selected shot WITHOUT position
  const isAlreadyAssociatedWithoutPosition = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    // Prefer override from gallery source
    if (typeof associatedWithoutPositionInSelectedShot === 'boolean') {
      return associatedWithoutPositionInSelectedShot || !!optimisticUnpositionedIds?.has(media.id);
    }
    
    // Check optimistic state first
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
    ?.shot_id,
      mediaPosition: (media as any)?.position,
      optimisticHas: optimisticUnpositionedIds?.has(media?.id || ''),
      override: associatedWithoutPositionInSelectedShot,
      timestamp: Date.now()
    });
  }, [isAlreadyAssociatedWithoutPosition, media?.id, selectedShotId, optimisticUnpositionedIds, associatedWithoutPositionInSelectedShot]);

  const handleAddToShotWithoutPosition = async () => {
    if (!onAddToShotWithoutPosition || !selectedShotId) return;

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
      ', {
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
    
    .slice(0, 120),
      thumbUrl: (media?.thumbUrl || '').slice(0, 120),
      timestamp: Date.now()
    });
    const success = await onAddToShotWithoutPosition(media.id, media.imageUrl, media.thumbUrl);
    });
    if (success) {
      onShowSecondaryTick?.(media.id);
      onOptimisticUnpositioned?.(media.id);
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

