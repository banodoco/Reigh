import React from 'react';
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { ShotImageManagerProps } from './types';
import { GRID_COLS_CLASSES } from './constants';
import { ImageGrid } from './components/ImageGrid';
import { SelectionActionBar } from './components/SelectionActionBar';
import { DeleteConfirmationDialog } from './components/DeleteConfirmationDialog';
import { MultiImagePreview, SingleImagePreview } from '../ImageDragPreview';
import BatchDropZone from '../BatchDropZone';
import MediaLightbox from '../MediaLightbox';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useState, useEffect } from 'react';
import { useTaskDetails } from './hooks/useTaskDetails';

interface ShotImageManagerDesktopProps extends ShotImageManagerProps {
  selection: any;
  dragAndDrop: any;
  lightbox: any;
  batchOps: any;
  optimistic: any;
  externalGens: any;
  getFramePosition: (index: number) => number | undefined;
  lightboxSelectedShotId?: string;
  setLightboxSelectedShotId?: (shotId: string | undefined) => void;
}

export const ShotImageManagerDesktop: React.FC<ShotImageManagerDesktopProps> = ({
  selection,
  dragAndDrop,
  lightbox,
  batchOps,
  optimistic,
  externalGens,
  getFramePosition,
  lightboxSelectedShotId,
  setLightboxSelectedShotId,
  ...props
}) => {
  // Debug: Log props received
  console.log('[ShotSelectorDebug] ShotImageManagerDesktop received props', {
    component: 'ShotImageManagerDesktop',
    hasOnAddToShot: !!props.onAddToShot,
    hasOnAddToShotWithoutPosition: !!props.onAddToShotWithoutPosition,
    allShotsLength: props.allShots?.length || 0,
    selectedShotId: props.selectedShotId,
    hasOnShotChange: !!props.onShotChange,
    generationMode: props.generationMode
  });

  console.log('[PairIndicatorDebug] ShotImageManagerDesktop received pair props', {
    component: 'ShotImageManagerDesktop',
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
  const gridColsClass = GRID_COLS_CLASSES[props.columns || 4] || 'grid-cols-4';
  const isMobile = useIsMobile();
  
  // Detect tablet/iPad size for task details
  const [isTabletOrLarger, setIsTabletOrLarger] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );
  
  useEffect(() => {
    const handleResize = () => {
      setIsTabletOrLarger(window.innerWidth >= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return (
    <BatchDropZone
      onImageDrop={props.onFileDrop}
      onGenerationDrop={props.onGenerationDrop}
      columns={props.columns || 4}
      itemCount={lightbox.currentImages.length}
      disabled={props.readOnly || !props.onFileDrop}
      getFramePositionForIndex={getFramePosition}
    >
      <DndContext
        sensors={dragAndDrop.sensors}
        collisionDetection={closestCenter}
        onDragStart={dragAndDrop.handleDragStart}
        onDragEnd={dragAndDrop.handleDragEnd}
      >
        <SortableContext
          items={lightbox.currentImages.map((img: any) => img.shotImageEntryId ?? img.id)}
          strategy={rectSortingStrategy}
        >
          <ImageGrid
            images={lightbox.currentImages}
            selectedIds={selection.selectedIds}
            gridColsClass={gridColsClass}
            onItemClick={selection.handleItemClick}
            onItemDoubleClick={(idx) => lightbox.setLightboxIndex(idx)}
            onInpaintClick={(idx) => {
              lightbox.setShouldAutoEnterInpaint(true);
              lightbox.setLightboxIndex(idx);
            }}
            onDelete={batchOps.handleIndividualDelete}
            onDuplicate={props.onImageDuplicate}
            isMobile={isMobile}
            imageDeletionSettings={batchOps.imageDeletionSettings}
            updateImageDeletionSettings={batchOps.updateImageDeletionSettings}
            duplicatingImageId={props.duplicatingImageId}
            duplicateSuccessImageId={props.duplicateSuccessImageId}
            projectAspectRatio={props.projectAspectRatio}
            batchVideoFrames={props.batchVideoFrames}
            onGridDoubleClick={() => {
              selection.setSelectedIds([]);
              selection.setLastSelectedIndex(null);
            }}
            onImageUpload={props.onImageUpload}
            isUploadingImage={props.isUploadingImage}
            readOnly={props.readOnly}
            onPairClick={props.onPairClick}
            pairPrompts={props.pairPrompts}
            enhancedPrompts={props.enhancedPrompts}
            defaultPrompt={props.defaultPrompt}
            defaultNegativePrompt={props.defaultNegativePrompt}
          />
        </SortableContext>
        
        <DragOverlay>
          {dragAndDrop.activeImage && (
            selection.selectedIds.length > 1 && selection.selectedIds.includes(dragAndDrop.activeId) ? (
              <MultiImagePreview count={selection.selectedIds.length} image={dragAndDrop.activeImage} />
            ) : (
              <SingleImagePreview image={dragAndDrop.activeImage} />
            )
          )}
        </DragOverlay>
        
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

          console.log('[BasedOnNav] 📊 MediaLightbox props (Desktop):', {
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
                console.log('[BasedOnNav] 🚪 MediaLightbox onClose called (Desktop)', {
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
              onDelete={!props.readOnly ? (mediaId: string) => {
                const currentImage = lightbox.currentImages[lightbox.lightboxIndex];
                const shotImageEntryId = currentImage.shotImageEntryId || currentImage.id;
                props.onImageDelete(shotImageEntryId);
              } : undefined}
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
              readOnly={props.readOnly}
              showTaskDetails={true}
              taskDetailsData={taskDetailsData}
              onNavigateToGeneration={(generationId: string) => {
                const index = lightbox.currentImages.findIndex((img: any) => img.id === generationId);
                if (index !== -1) {
                  lightbox.setLightboxIndex(index);
                }
              }}
              onOpenExternalGeneration={externalGens.handleOpenExternalGeneration}
              allShots={props.allShots}
              selectedShotId={isExternalGen ? externalGens.externalGenLightboxSelectedShot : (lightboxSelectedShotId || props.selectedShotId)}
              onShotChange={isExternalGen ? (shotId) => {
                externalGens.setExternalGenLightboxSelectedShot(shotId);
              } : (shotId) => {
                console.log('[ShotImageManagerDesktop] Shot selector changed to:', shotId);
                setLightboxSelectedShotId?.(shotId);
                props.onShotChange?.(shotId);
              }}
              onAddToShot={(() => {
                const result = isExternalGen ? externalGens.handleExternalGenAddToShot : props.onAddToShot;
                console.log('[ShotSelectorDebug] ShotImageManagerDesktop -> MediaLightbox onAddToShot', {
                  component: 'ShotImageManagerDesktop',
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
        
        {selection.showSelectionBar && selection.selectedIds.length >= 1 && (
          <SelectionActionBar
            selectedCount={selection.selectedIds.length}
            onDeselect={selection.clearSelection}
            onDelete={() => batchOps.handleBatchDelete(selection.selectedIds)}
          />
        )}
        
        <DeleteConfirmationDialog
          open={batchOps.confirmOpen}
          onOpenChange={batchOps.setConfirmOpen}
          pendingDeleteIds={batchOps.pendingDeleteIds}
          onConfirm={batchOps.performBatchDelete}
        />
      </DndContext>
    </BatchDropZone>
  );
};

