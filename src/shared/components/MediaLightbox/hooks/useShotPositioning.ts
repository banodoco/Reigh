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
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
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
  
  // [OptimisticDebug] Log what callbacks we received
  useEffect(() => {
    console.log('[OptimisticDebug] [Lightbox] useShotPositioning received callbacks:', {
      hasOnOptimisticPositioned: !!onOptimisticPositioned,
      callbackType: typeof onOptimisticPositioned,
      hasOnOptimisticUnpositioned: !!onOptimisticUnpositioned,
      optimisticPositionedIdsSize: optimisticPositionedIds?.size || 0,
      timestamp: Date.now()
    });
  }, [onOptimisticPositioned, onOptimisticUnpositioned, optimisticPositionedIds]);
  
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
  const actualGenerationId = (media as any).generation_id || media.id;

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
    
    // Trust the override from parent component (ShotImageManagerDesktop)
    // The parent already verified the media is in the selected shot using props.shotId comparison
    // Don't re-verify using media.shot_id since the image objects may not have shot_id populated
    if (typeof positionedInSelectedShot === 'boolean') {
      console.log('[AddToShotDebug] useShotPositioning using positionedInSelectedShot override:', positionedInSelectedShot);
      return positionedInSelectedShot;
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
    
    // FIX: Use fallback chain for image URL since data structure varies
    // The media object may have 'url', 'location', or 'imageUrl' depending on source
    const imageUrl = (media as any).url || media.location || media.imageUrl;
    const thumbUrl = (media as any).thumbnail_url || media.thumbUrl || imageUrl;
    
    console.log('[ShotNavDebug] [MediaLightbox] Calling onAddToShot', {
      targetShotId: selectedShotId,
      mediaId: media?.id,
      imageUrl: (imageUrl || '').slice(0, 120),
      thumbUrl: (thumbUrl || '').slice(0, 120),
      originalFields: {
        hasUrl: !!(media as any).url,
        hasLocation: !!media.location,
        hasImageUrl: !!media.imageUrl,
        hasThumbnailUrl: !!(media as any).thumbnail_url,
        hasThumbUrl: !!media.thumbUrl
      },
      timestamp: Date.now()
    });
    // CRITICAL: Pass selectedShotId (the dropdown value) as targetShotId
    // Use actualGenerationId (generations.id) not media.id (which might be shot_generations.id)
    const success = await onAddToShot(selectedShotId, actualGenerationId, imageUrl, thumbUrl);
    console.log('[ShotNavDebug] [MediaLightbox] onAddToShot result', { success, targetShotId: selectedShotId, timestamp: Date.now() });
    if (success) {
      onShowTick?.(actualGenerationId);
      // Pass selectedShotId so optimistic state can use composite keys (mediaId:shotId)
      onOptimisticPositioned?.(actualGenerationId, selectedShotId);
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
    
    // FIX: Use fallback chain for image URL since data structure varies
    const imageUrl = (media as any).url || media.location || media.imageUrl;
    const thumbUrl = (media as any).thumbnail_url || media.thumbUrl || imageUrl;
    
    console.log('[ShotNavDebug] [MediaLightbox] Calling onAddToShotWithoutPosition', {
      targetShotId: selectedShotId,
      mediaId: media?.id,
      imageUrl: (imageUrl || '').slice(0, 120),
      thumbUrl: (thumbUrl || '').slice(0, 120),
      timestamp: Date.now()
    });
    // CRITICAL: Pass selectedShotId (the dropdown value) as targetShotId
    // Use actualGenerationId (generations.id) not media.id (which might be shot_generations.id)
    const success = await onAddToShotWithoutPosition(selectedShotId, actualGenerationId, imageUrl, thumbUrl);
    console.log('[ShotNavDebug] [MediaLightbox] onAddToShotWithoutPosition result', { success, targetShotId: selectedShotId, timestamp: Date.now() });
    if (success) {
      onShowSecondaryTick?.(actualGenerationId);
      // Pass selectedShotId so optimistic state can use composite keys (mediaId:shotId)
      onOptimisticUnpositioned?.(actualGenerationId, selectedShotId);
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

