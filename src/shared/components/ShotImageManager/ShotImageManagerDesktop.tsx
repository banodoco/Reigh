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
import { AddImagesCard } from './components/AddImagesCard';
import { SelectionActionBar } from './components/SelectionActionBar';
import { DeleteConfirmationDialog } from './components/DeleteConfirmationDialog';
import { MultiImagePreview, SingleImagePreview } from '../ImageDragPreview';
import BatchDropZone from '../BatchDropZone';
import MediaLightbox from '../MediaLightbox';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useState, useEffect } from 'react';

interface ShotImageManagerDesktopProps extends ShotImageManagerProps {
  selection: any;
  dragAndDrop: any;
  lightbox: any;
  batchOps: any;
  optimistic: any;
  externalGens: any;
  getFramePosition: (index: number) => number | undefined;
}

export const ShotImageManagerDesktop: React.FC<ShotImageManagerDesktopProps> = ({
  selection,
  dragAndDrop,
  lightbox,
  batchOps,
  optimistic,
  externalGens,
  getFramePosition,
  ...props
}) => {
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
          items={lightbox.currentImages.map((img: any) => img.shotImageEntryId)}
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
          />
          
          {props.onImageUpload && !props.readOnly && (
            <AddImagesCard
              projectAspectRatio={props.projectAspectRatio}
              onImageUpload={props.onImageUpload}
              isUploadingImage={props.isUploadingImage}
            />
          )}
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
          
          return (
            <MediaLightbox
              media={lightbox.currentImages[lightbox.lightboxIndex]}
              shotId={props.shotId}
              toolTypeOverride={props.toolTypeOverride}
              autoEnterInpaint={lightbox.shouldAutoEnterInpaint}
              onClose={() => {
                lightbox.setLightboxIndex(null);
                lightbox.setShouldAutoEnterInpaint(false);
                externalGens.setDerivedNavContext(null);
                externalGens.setTempDerivedGenerations([]);
                if (isExternalGen) {
                  externalGens.setExternalGenLightboxSelectedShot(props.selectedShotId);
                }
              }}
              onNext={lightbox.handleNext}
              onPrevious={lightbox.handlePrevious}
              onDelete={!props.readOnly ? (mediaId: string) => {
                const currentImage = lightbox.currentImages[lightbox.lightboxIndex];
                props.onImageDelete(currentImage.shotImageEntryId);
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
              showTaskDetails={isTabletOrLarger}
              onNavigateToGeneration={(generationId: string) => {
                const index = lightbox.currentImages.findIndex((img: any) => img.id === generationId);
                if (index !== -1) {
                  lightbox.setLightboxIndex(index);
                }
              }}
              onOpenExternalGeneration={externalGens.handleOpenExternalGeneration}
              allShots={props.allShots}
              selectedShotId={isExternalGen ? externalGens.externalGenLightboxSelectedShot : props.selectedShotId}
              onShotChange={isExternalGen ? (shotId) => {
                externalGens.setExternalGenLightboxSelectedShot(shotId);
              } : props.onShotChange}
              onAddToShot={isExternalGen ? externalGens.handleExternalGenAddToShot : props.onAddToShot}
              onAddToShotWithoutPosition={isExternalGen ? externalGens.handleExternalGenAddToShotWithoutPosition : props.onAddToShotWithoutPosition}
              onCreateShot={props.onCreateShot}
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

