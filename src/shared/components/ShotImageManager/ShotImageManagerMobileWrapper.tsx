import React, { useState, useEffect, useMemo } from 'react';
import { ShotImageManagerProps } from './types';
import { ShotImageManagerMobile } from './ShotImageManagerMobile';
import MediaLightbox from '../MediaLightbox';
import type { AdjacentSegmentsData } from '../MediaLightbox/types';
import { useTaskDetails } from './hooks/useTaskDetails';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';
import { SegmentSlot } from '@/tools/travel-between-images/hooks/useSegmentOutputsForShot';
import { usePrefetchTaskData } from '@/shared/hooks/useUnifiedGenerations';
import { getDisplayUrl } from '@/shared/lib/utils';

interface ShotImageManagerMobileWrapperProps extends ShotImageManagerProps {
  selection: any;
  lightbox: any;
  batchOps: any;
  mobileGestures: any;
  optimistic: any;
  externalGens: any;
  lightboxSelectedShotId?: string;
  setLightboxSelectedShotId?: (shotId: string | undefined) => void;
  // Segment video output props
  segmentSlots?: SegmentSlot[];
  onSegmentClick?: (slotIndex: number) => void;
  /** Check if a pair_shot_generation_id has a pending task */
  hasPendingTask?: (pairShotGenerationId: string | null | undefined) => boolean;
  /** Request to open lightbox for specific image (from segment constituent navigation) */
  pendingImageToOpen?: string | null;
  /** Callback to clear the pending image request after handling */
  onClearPendingImageToOpen?: () => void;
  /** Callback to signal start of lightbox transition (keeps overlay visible during navigation) */
  onStartLightboxTransition?: () => void;
}

export const ShotImageManagerMobileWrapper: React.FC<ShotImageManagerMobileWrapperProps> = ({
  selection,
  lightbox,
  batchOps,
  mobileGestures,
  optimistic,
  externalGens,
  lightboxSelectedShotId,
  setLightboxSelectedShotId,
  segmentSlots,
  onSegmentClick,
  hasPendingTask,
  pendingImageToOpen,
  onClearPendingImageToOpen,
  onStartLightboxTransition,
  ...props
}) => {
  // State for showing success tick after adding to shot (positioned)
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);
  // State for showing success tick after adding to shot (without position)
  const [showTickForSecondaryImageId, setShowTickForSecondaryImageId] = useState<string | null>(null);
  
  // Clear ticks after 3 seconds
  useEffect(() => {
    if (showTickForImageId) {
      const timer = setTimeout(() => {
        setShowTickForImageId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showTickForImageId]);
  
  useEffect(() => {
    if (showTickForSecondaryImageId) {
      const timer = setTimeout(() => {
        setShowTickForSecondaryImageId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showTickForSecondaryImageId]);

  // Handle pendingImageToOpen - navigate from segment video back to constituent image
  useEffect(() => {
    if (!pendingImageToOpen) return;

    console.log('[ConstituentImageNav] Mobile: Looking for image to open:', pendingImageToOpen.substring(0, 8));

    // Find the image in current images by ID
    const imageIndex = lightbox.currentImages.findIndex(
      (img: any) => img.id === pendingImageToOpen || img.generation_id === pendingImageToOpen
    );

    if (imageIndex !== -1) {
      console.log('[ConstituentImageNav] Mobile: Found image at index', imageIndex);
      lightbox.setLightboxIndex(imageIndex);
    } else {
      console.log('[ConstituentImageNav] Mobile: Image not found in current images:', pendingImageToOpen.substring(0, 8));
    }

    // Clear the pending request
    onClearPendingImageToOpen?.();
  }, [pendingImageToOpen, lightbox.currentImages, lightbox.setLightboxIndex, onClearPendingImageToOpen]);

  // Build adjacent segments data for the current lightbox image
  // This enables navigation to videos that start/end with the current image
  const adjacentSegmentsData: AdjacentSegmentsData | undefined = useMemo(() => {
    // Only available when viewing images in batch mode with segment slots
    if (!segmentSlots || segmentSlots.length === 0 || !props.onPairClick || lightbox.lightboxIndex === null) {
      return undefined;
    }

    const currentImage = lightbox.currentImages[lightbox.lightboxIndex];
    if (!currentImage) return undefined;

    // Use position-based matching instead of ID-based matching
    // The image's position in the timeline is its index in the images array
    const imagePosition = lightbox.lightboxIndex;

    // Build prev segment info (ends with current image)
    let prev: AdjacentSegmentsData['prev'] = undefined;
    if (imagePosition > 0 && imagePosition - 1 < segmentSlots.length) {
      const prevSlot = segmentSlots[imagePosition - 1];
      if (prevSlot) {
        const startImage = lightbox.currentImages[imagePosition - 1];
        const endImage = currentImage;

        prev = {
          pairIndex: prevSlot.index,
          hasVideo: prevSlot.type === 'child' && !!prevSlot.child?.location,
          startImageUrl: getDisplayUrl((startImage as any)?.thumbUrl || (startImage as any)?.imageUrl),
          endImageUrl: getDisplayUrl((endImage as any)?.thumbUrl || (endImage as any)?.imageUrl),
        };
      }
    }

    // Build next segment info (starts with current image)
    let next: AdjacentSegmentsData['next'] = undefined;
    if (imagePosition < segmentSlots.length) {
      const nextSlot = segmentSlots[imagePosition];
      if (nextSlot) {
        const endImage = lightbox.currentImages[imagePosition + 1];

        next = {
          pairIndex: nextSlot.index,
          hasVideo: nextSlot.type === 'child' && !!nextSlot.child?.location,
          startImageUrl: getDisplayUrl((currentImage as any)?.thumbUrl || (currentImage as any)?.imageUrl),
          endImageUrl: endImage ? getDisplayUrl((endImage as any)?.thumbUrl || (endImage as any)?.imageUrl) : undefined,
        };
      }
    }

    console.log('[SegmentNavDebug] ShotImageManagerMobile position-based matching:', {
      imagePosition,
      totalImages: lightbox.currentImages.length,
      totalSegmentSlots: segmentSlots.length,
      hasPrev: !!prev,
      hasNext: !!next,
      prevHasVideo: prev?.hasVideo,
      nextHasVideo: next?.hasVideo,
    });

    if (!prev && !next) return undefined;

    return {
      prev,
      next,
      onNavigateToSegment: (pairIndex: number) => {
        console.log('[LightboxTransition] ShotImageManagerMobile onNavigateToSegment: Showing overlay');
        // Show overlay via parent callback (handles both ref and body class)
        onStartLightboxTransition?.();

        // Use double-rAF to ensure overlay is painted before state changes
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            console.log('[LightboxTransition] Mobile: Overlay painted, now triggering state changes');
            lightbox.setLightboxIndex(null);
            props.onPairClick!(pairIndex);
          });
        });
      },
    };
  }, [segmentSlots, props.onPairClick, lightbox.lightboxIndex, lightbox.currentImages, lightbox.setLightboxIndex, onStartLightboxTransition]);

  // Debug: Log props received
  console.log('[ShotSelectorDebug] ShotImageManagerMobileWrapper received props', {
    component: 'ShotImageManagerMobileWrapper',
    hasOnAddToShot: !!props.onAddToShot,
    hasOnAddToShotWithoutPosition: !!props.onAddToShotWithoutPosition,
    allShotsLength: props.allShots?.length || 0,
    selectedShotId: props.selectedShotId,
    hasOnShotChange: !!props.onShotChange,
    generationMode: props.generationMode
  });

  console.log('[PairIndicatorDebug] ShotImageManagerMobileWrapper received pair props', {
    component: 'ShotImageManagerMobileWrapper',
    hasOnPairClick: !!props.onPairClick,
    hasPairPrompts: !!props.pairPrompts,
    hasEnhancedPrompts: !!props.enhancedPrompts,
    hasDefaultPrompt: !!props.defaultPrompt,
    hasDefaultNegativePrompt: !!props.defaultNegativePrompt,
    pairPromptsKeys: props.pairPrompts ? Object.keys(props.pairPrompts) : [],
    enhancedPromptsKeys: props.enhancedPrompts ? Object.keys(props.enhancedPrompts) : [],
  });

  // Fetch task details for current lightbox image
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager, id is shot_generations.id but generation_id is the actual generation ID
  const currentLightboxImage = lightbox.lightboxIndex !== null
    ? lightbox.currentImages[lightbox.lightboxIndex]
    : null;
  const currentLightboxImageId = (currentLightboxImage as any)?.generation_id || currentLightboxImage?.id || null;
  const { taskDetailsData } = useTaskDetails({ generationId: currentLightboxImageId });

  // Prefetch task data for adjacent items when lightbox is open
  const prefetchTaskData = usePrefetchTaskData();

  useEffect(() => {
    if (lightbox.lightboxIndex === null) return;

    // Prefetch previous item
    if (lightbox.lightboxIndex > 0) {
      const prevItem = lightbox.currentImages[lightbox.lightboxIndex - 1];
      const prevGenerationId = (prevItem as any)?.generation_id || prevItem?.id;
      if (prevGenerationId) {
        prefetchTaskData(prevGenerationId);
      }
    }

    // Prefetch next item
    if (lightbox.lightboxIndex < lightbox.currentImages.length - 1) {
      const nextItem = lightbox.currentImages[lightbox.lightboxIndex + 1];
      const nextGenerationId = (nextItem as any)?.generation_id || nextItem?.id;
      if (nextGenerationId) {
        prefetchTaskData(nextGenerationId);
      }
    }

    // Prefetch current item too
    if (currentLightboxImageId) {
      prefetchTaskData(currentLightboxImageId);
    }
  }, [lightbox.lightboxIndex, lightbox.currentImages, currentLightboxImageId, prefetchTaskData]);

  // Detect tablet/iPad size for task details
  const { isTabletOrLarger } = useDeviceDetection();
  
  return (
    <>
      <ShotImageManagerMobile
        images={props.images}
        onImageDelete={props.onImageDelete}
        onBatchImageDelete={props.onBatchImageDelete}
        onImageDuplicate={props.onImageDuplicate}
        onImageReorder={props.onImageReorder}
        onOpenLightbox={props.onOpenLightbox || lightbox.setLightboxIndex}
        onInpaintClick={(index) => {
          lightbox.setShouldAutoEnterInpaint(true);
          lightbox.setLightboxIndex(index);
        }}
        columns={props.columns}
        duplicatingImageId={props.duplicatingImageId}
        duplicateSuccessImageId={props.duplicateSuccessImageId}
        projectAspectRatio={props.projectAspectRatio}
        batchVideoFrames={props.batchVideoFrames}
        onImageUpload={props.onImageUpload}
        readOnly={props.readOnly}
        isUploadingImage={props.isUploadingImage}
        onSelectionChange={props.onSelectionChange}
        onPairClick={props.onPairClick}
        pairPrompts={props.pairPrompts}
        enhancedPrompts={props.enhancedPrompts}
        defaultPrompt={props.defaultPrompt}
        defaultNegativePrompt={props.defaultNegativePrompt}
        onClearEnhancedPrompt={props.onClearEnhancedPrompt}
        segmentSlots={segmentSlots}
        onSegmentClick={onSegmentClick}
        hasPendingTask={hasPendingTask}
      />
      
      {lightbox.lightboxIndex !== null && lightbox.currentImages[lightbox.lightboxIndex] && (() => {
        const baseImagesCount = (optimistic.optimisticOrder && optimistic.optimisticOrder.length > 0) ? optimistic.optimisticOrder.length : (props.images || []).length;
        const isExternalGen = lightbox.lightboxIndex >= baseImagesCount;
        
        let hasNext: boolean;
        let hasPrevious: boolean;
        
        if (externalGens.derivedNavContext) {
          const currentId = lightbox.currentImages[lightbox.lightboxIndex]?.id;
          const currentDerivedIndex = externalGens.derivedNavContext.derivedGenerationIds.indexOf(currentId);
          hasNext = currentDerivedIndex !== -1 && currentDerivedIndex < externalGens.derivedNavContext.derivedGenerationIds.length - 1;
          hasPrevious = currentDerivedIndex !== -1 && currentDerivedIndex > 0;
        } else {
          hasNext = lightbox.lightboxIndex < lightbox.currentImages.length - 1;
          hasPrevious = lightbox.lightboxIndex > 0;
        }
        
        const currentImage = lightbox.currentImages[lightbox.lightboxIndex];
        
        // Determine if the current image is positioned in the selected shot
        // For non-external gens (images from the shot itself), check if they have a timeline_frame
        // Use lightboxSelectedShotId instead of props.selectedShotId so it updates when dropdown changes
        const effectiveSelectedShotId = lightboxSelectedShotId || props.selectedShotId;
        const isInSelectedShot = !isExternalGen && effectiveSelectedShotId && (
          props.shotId === effectiveSelectedShotId || 
          (currentImage as any).shot_id === effectiveSelectedShotId ||
          (Array.isArray((currentImage as any).all_shot_associations) && 
           (currentImage as any).all_shot_associations.some((assoc: any) => assoc.shot_id === effectiveSelectedShotId))
        );
        
        const positionedInSelectedShot = isInSelectedShot
          ? (currentImage as any).timeline_frame !== null && (currentImage as any).timeline_frame !== undefined
          : undefined;
        
        const associatedWithoutPositionInSelectedShot = isInSelectedShot
          ? (currentImage as any).timeline_frame === null || (currentImage as any).timeline_frame === undefined
          : undefined;

        console.log('[BasedOnNav] 📊 MediaLightbox props (Mobile):', {
          mediaId: lightbox.currentImages[lightbox.lightboxIndex]?.id.substring(0, 8),
          showTaskDetails: true,
          hasTaskDetailsData: !!taskDetailsData,
          taskDetailsData: taskDetailsData ? {
            hasTask: !!taskDetailsData.task,
            isLoading: taskDetailsData.isLoading,
            taskId: taskDetailsData.taskId,
            inputImagesCount: taskDetailsData.inputImages?.length
          } : null,
          lightboxIndex: lightbox.lightboxIndex,
          currentImagesLength: lightbox.currentImages.length,
          isExternalGen,
          isTempDerived: lightbox.lightboxIndex >= baseImagesCount + externalGens.externalGenerations.length,
          positionedInSelectedShot,
          associatedWithoutPositionInSelectedShot,
          currentImageTimelineFrame: (currentImage as any).timeline_frame
        });
        
        return (
          <MediaLightbox
            media={lightbox.currentImages[lightbox.lightboxIndex]}
            shotId={props.shotId}
            toolTypeOverride={props.toolTypeOverride}
            autoEnterInpaint={lightbox.shouldAutoEnterInpaint}
            onClose={() => {
              console.log('[BasedOnNav] 🚪 MediaLightbox onClose called (Mobile)', {
                lightboxIndex: lightbox.lightboxIndex,
                currentImagesLength: lightbox.currentImages.length,
                hasDerivedNavContext: !!externalGens.derivedNavContext,
                derivedNavContext: externalGens.derivedNavContext ? {
                  sourceId: externalGens.derivedNavContext.sourceGenerationId.substring(0, 8),
                  derivedCount: externalGens.derivedNavContext.derivedGenerationIds.length
                } : null,
                tempDerivedCount: externalGens.tempDerivedGenerations.length
              });
              lightbox.setLightboxIndex(null);
              lightbox.setShouldAutoEnterInpaint(false);
              externalGens.setDerivedNavContext(null);
              externalGens.setTempDerivedGenerations([]);
              if (isExternalGen) {
                externalGens.setExternalGenLightboxSelectedShot(props.selectedShotId);
              }
              // Reset dropdown to current shot when closing
              setLightboxSelectedShotId?.(props.selectedShotId);
            }}
            onNext={lightbox.handleNext}
            onPrevious={lightbox.handlePrevious}
            showNavigation={true}
            showImageEditTools={true}
            showDownload={true}
            showMagicEdit={true}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            starred={(lightbox.currentImages[lightbox.lightboxIndex] as any).starred || false}
            onMagicEdit={props.onMagicEdit}
            showTaskDetails={true}
            taskDetailsData={taskDetailsData}
            adjacentSegments={adjacentSegmentsData}
            onNavigateToGeneration={(generationId: string) => {
              console.log('[ShotImageManager:Mobile] 📍 Navigate to generation', {
                generationId: generationId.substring(0, 8),
                currentImagesCount: lightbox.currentImages.length,
                currentIndex: lightbox.lightboxIndex
              });
              const index = lightbox.currentImages.findIndex((img: any) => img.id === generationId);
              if (index !== -1) {
                console.log('[ShotImageManager:Mobile] ✅ Found generation at index', index);
                lightbox.setLightboxIndex(index);
              } else {
                console.error('[ShotImageManager:Mobile] ❌ Generation not found in current images', {
                  searchedId: generationId.substring(0, 8),
                  availableIds: lightbox.currentImages.map((img: any) => img.id.substring(0, 8))
                });
              }
            }}
            onOpenExternalGeneration={externalGens.handleOpenExternalGeneration}
            allShots={props.allShots}
            selectedShotId={isExternalGen ? externalGens.externalGenLightboxSelectedShot : (lightboxSelectedShotId || props.selectedShotId)}
            onShotChange={isExternalGen ? (shotId) => {
              console.log('[ShotImageManager:Mobile] External gen shot changed', { shotId: shotId?.substring(0, 8) });
              externalGens.setExternalGenLightboxSelectedShot(shotId);
            } : (shotId) => {
              console.log('[ShotImageManagerMobileWrapper] Shot selector changed to:', shotId);
              setLightboxSelectedShotId?.(shotId);
              props.onShotChange?.(shotId);
            }}
            onAddToShot={(() => {
              const result = isExternalGen ? externalGens.handleExternalGenAddToShot : props.onAddToShot;
              console.log('[ShotSelectorDebug] ShotImageManagerMobileWrapper -> MediaLightbox onAddToShot', {
                component: 'ShotImageManagerMobileWrapper',
                isExternalGen,
                propsOnAddToShot: !!props.onAddToShot,
                externalGensHandler: !!externalGens.handleExternalGenAddToShot,
                finalOnAddToShot: !!result,
                allShotsLength: props.allShots?.length || 0,
                selectedShotId: props.selectedShotId
              });
              return result;
            })()}
            onAddToShotWithoutPosition={isExternalGen ? externalGens.handleExternalGenAddToShotWithoutPosition : props.onAddToShotWithoutPosition}
            onCreateShot={props.onCreateShot}
            positionedInSelectedShot={positionedInSelectedShot}
            associatedWithoutPositionInSelectedShot={associatedWithoutPositionInSelectedShot}
            showTickForImageId={showTickForImageId}
            onShowTick={setShowTickForImageId}
            showTickForSecondaryImageId={showTickForSecondaryImageId}
            onShowSecondaryTick={setShowTickForSecondaryImageId}
          />
        );
      })()}
    </>
  );
};

