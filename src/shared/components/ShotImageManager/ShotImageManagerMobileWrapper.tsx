import React, { useState, useEffect } from 'react';
import { ShotImageManagerProps } from './types';
import { ShotImageManagerMobile } from './ShotImageManagerMobile';
import MediaLightbox from '../MediaLightbox';
import { useTaskDetails } from './hooks/useTaskDetails';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';

interface ShotImageManagerMobileWrapperProps extends ShotImageManagerProps {
  selection: any;
  lightbox: any;
  batchOps: any;
  mobileGestures: any;
  optimistic: any;
  externalGens: any;
  lightboxSelectedShotId?: string;
  setLightboxSelectedShotId?: (shotId: string | undefined) => void;
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
  ...props
}) => {
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
  const currentLightboxImageId = lightbox.lightboxIndex !== null 
    ? lightbox.currentImages[lightbox.lightboxIndex]?.id 
    : null;
  const { taskDetailsData } = useTaskDetails({ generationId: currentLightboxImageId });
  
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
            onImageSaved={props.onImageSaved ? async (newImageUrl: string, createNew?: boolean) =>
              await props.onImageSaved!(lightbox.currentImages[lightbox.lightboxIndex].id, newImageUrl, createNew) : undefined}
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
          />
        );
      })()}
    </>
  );
};

