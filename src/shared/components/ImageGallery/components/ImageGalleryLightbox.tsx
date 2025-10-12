import React, { useMemo, useEffect } from "react";
import MediaLightbox from "@/shared/components/MediaLightbox";
import TaskDetailsModal from '@/tools/travel-between-images/components/TaskDetailsModal';
import { GenerationRow, Shot } from "@/types/shots";
import { GeneratedImageWithMetadata } from '../ImageGallery';

export interface ImageGalleryLightboxProps {
  // Lightbox state
  activeLightboxMedia: GenerationRow | null;
  onClose: () => void;
  
  // Navigation
  filteredImages: GeneratedImageWithMetadata[];
  isServerPagination: boolean;
  serverPage?: number;
  totalPages: number;
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
  
  // Actions
  onImageSaved: (newImageUrl: string, createNew?: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isDeleting?: string | null;
  onApplySettings?: (metadata: any) => void;
  
  // Shot management
  simplifiedShotOptions: { id: string; name: string }[];
  selectedShotIdLocal: string;
  onShotChange: (shotId: string) => void;
  onAddToShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  
  // UI state
  showTickForImageId: string | null;
  setShowTickForImageId: (id: string | null) => void;
  showTickForSecondaryImageId?: string | null;
  setShowTickForSecondaryImageId?: (id: string | null) => void;
  
  // Optimistic updates
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string) => void;

  // Task details
  isMobile: boolean;
  showTaskDetailsModal: boolean;
  setShowTaskDetailsModal: (show: boolean) => void;
  selectedImageForDetails: GenerationRow | null;
  setSelectedImageForDetails: (image: GenerationRow | null) => void;
  task?: any;
  isLoadingTask?: boolean;
  taskError?: any;
  inputImages?: string[];
  lightboxTaskMapping?: any;
  onShowTaskDetails?: () => void;
  
  // Shot creation
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  // Shot navigation
  onNavigateToShot?: (shot: Shot) => void;
  
  // Tool type override for magic edit
  toolTypeOverride?: string;
  
  // Generation lineage navigation
  setActiveLightboxIndex?: (index: number) => void;
}

export const ImageGalleryLightbox: React.FC<ImageGalleryLightboxProps> = ({
  activeLightboxMedia,
  onClose,
  filteredImages,
  isServerPagination,
  serverPage,
  totalPages,
  onServerPageChange,
  onNext,
  onPrevious,
  onImageSaved,
  onDelete,
  isDeleting,
  onApplySettings,
  simplifiedShotOptions,
  selectedShotIdLocal,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  showTickForImageId,
  setShowTickForImageId,
  showTickForSecondaryImageId,
  setShowTickForSecondaryImageId,
  // Optimistic updates
  optimisticPositionedIds,
  optimisticUnpositionedIds,
  onOptimisticPositioned,
  onOptimisticUnpositioned,
  isMobile,
  showTaskDetailsModal,
  setShowTaskDetailsModal,
  selectedImageForDetails,
  setSelectedImageForDetails,
  task,
  isLoadingTask,
  taskError,
  inputImages,
  lightboxTaskMapping,
  onShowTaskDetails,
  onCreateShot,
  onNavigateToShot,
  toolTypeOverride,
  setActiveLightboxIndex,
}) => {
  
  // [ShotNavDebug] confirm plumbing into Lightbox
  React.useEffect(() => {
    console.log('[ShotNavDebug] [ImageGalleryLightbox] props snapshot', {
      activeLightboxMediaId: activeLightboxMedia?.id,
      selectedShotIdLocal,
      hasOnAddToShot: !!onAddToShot,
      hasOnAddToShotWithoutPosition: !!onAddToShotWithoutPosition,
      showTickForImageId,
      showTickForSecondaryImageId,
      hasOptimisticPositioned: !!optimisticPositionedIds,
      hasOptimisticUnpositioned: !!optimisticUnpositionedIds,
      hasOnNavigateToShot: !!onNavigateToShot,
      timestamp: Date.now()
    });
  }, [activeLightboxMedia?.id, selectedShotIdLocal, onAddToShot, onAddToShotWithoutPosition, showTickForImageId, showTickForSecondaryImageId, optimisticPositionedIds, optimisticUnpositionedIds, onNavigateToShot]);
  
  // Log the callback we received
  React.useEffect(() => {
    console.log('[ImageFlipDebug] [ImageGalleryLightbox] onImageSaved prop', {
      hasCallback: !!onImageSaved,
      callbackType: typeof onImageSaved,
      callbackName: onImageSaved?.name,
      timestamp: Date.now()
    });
  }, [onImageSaved]);
  
  // Wrap onImageSaved to add logging
  const wrappedOnImageSaved = React.useCallback(async (newImageUrl: string, createNew?: boolean) => {
    console.log('[ImageFlipDebug] [ImageGalleryLightbox] wrappedOnImageSaved called', {
      newImageUrl,
      createNew,
      hasOriginalCallback: !!onImageSaved,
      timestamp: Date.now()
    });
    
    const result = await onImageSaved(newImageUrl, createNew);
    
    console.log('[ImageFlipDebug] [ImageGalleryLightbox] wrappedOnImageSaved completed', {
      result,
      timestamp: Date.now()
    });
    
    return result;
  }, [onImageSaved]);
  
  // Calculate navigation availability for MediaLightbox
  const { hasNext, hasPrevious } = useMemo(() => {
    if (!activeLightboxMedia) return { hasNext: false, hasPrevious: false };
    
    const currentIndex = filteredImages.findIndex(img => img.id === activeLightboxMedia.id);
    
    if (isServerPagination) {
      // For server pagination, consider page boundaries
      const currentServerPage = serverPage || 1;
      const isOnLastItemOfPage = currentIndex === filteredImages.length - 1;
      const isOnFirstItemOfPage = currentIndex === 0;
      const hasNextPage = currentServerPage < totalPages;
      const hasPrevPage = currentServerPage > 1;
      
      return {
        hasNext: !isOnLastItemOfPage || hasNextPage,
        hasPrevious: !isOnFirstItemOfPage || hasPrevPage
      };
    } else {
      // For client pagination, use existing logic
      return {
        hasNext: currentIndex < filteredImages.length - 1,
        hasPrevious: currentIndex > 0
      };
    }
  }, [activeLightboxMedia, filteredImages, isServerPagination, serverPage, totalPages]);

  const starredValue = useMemo(() => {
    const foundImage = filteredImages.find(img => img.id === activeLightboxMedia?.id);
    const starred = foundImage?.starred || false;
    console.log('[StarDebug:ImageGallery] MediaLightbox starred prop', {
      mediaId: activeLightboxMedia?.id,
      foundImage: !!foundImage,
      starredValue: starred,
      foundImageKeys: foundImage ? Object.keys(foundImage) : [],
      timestamp: Date.now()
    });
    return starred;
  }, [filteredImages, activeLightboxMedia?.id]);

  // Compute positioned/associated state from gallery source record (mirrors ImageGalleryItem logic)
  const sourceRecord = useMemo(() => {
    const found = filteredImages.find(img => img.id === activeLightboxMedia?.id);
    console.log('[ShotNavDebug] [ImageGalleryLightbox] sourceRecord lookup', {
      mediaId: activeLightboxMedia?.id,
      foundRecord: !!found,
      shot_id: found?.shot_id,
      position: found?.position,
      all_shot_associations: found?.all_shot_associations,
      filteredImagesCount: filteredImages.length,
      timestamp: Date.now()
    });
    return found;
  }, [filteredImages, activeLightboxMedia?.id]);
  
  const positionedInSelectedShot = useMemo(() => {
    if (!sourceRecord || !selectedShotIdLocal) {
      console.log('[ShotNavDebug] [ImageGalleryLightbox] positionedInSelectedShot: early return undefined', {
        hasSourceRecord: !!sourceRecord,
        selectedShotIdLocal,
        timestamp: Date.now()
      });
      return undefined;
    }
    
    let result: boolean;
    if (sourceRecord.shot_id === selectedShotIdLocal) {
      result = sourceRecord.position !== null && sourceRecord.position !== undefined;
      console.log('[ShotNavDebug] [ImageGalleryLightbox] positionedInSelectedShot: direct shot_id match', {
        shot_id: sourceRecord.shot_id,
        position: sourceRecord.position,
        result,
        timestamp: Date.now()
      });
      return result;
    }
    
    const a = sourceRecord.all_shot_associations;
    if (Array.isArray(a)) {
      const m = a.find(x => x.shot_id === selectedShotIdLocal);
      result = !!(m && m.position !== null && m.position !== undefined);
      console.log('[ShotNavDebug] [ImageGalleryLightbox] positionedInSelectedShot: all_shot_associations check', {
        associationsCount: a.length,
        foundMatch: !!m,
        matchPosition: m?.position,
        result,
        timestamp: Date.now()
      });
      return result;
    }
    
    console.log('[ShotNavDebug] [ImageGalleryLightbox] positionedInSelectedShot: fallback false', {
      timestamp: Date.now()
    });
    return false;
  }, [sourceRecord, selectedShotIdLocal]);
  
  const associatedWithoutPositionInSelectedShot = useMemo(() => {
    if (!sourceRecord || !selectedShotIdLocal) {
      console.log('[ShotNavDebug] [ImageGalleryLightbox] associatedWithoutPositionInSelectedShot: early return undefined', {
        hasSourceRecord: !!sourceRecord,
        selectedShotIdLocal,
        timestamp: Date.now()
      });
      return undefined;
    }
    
    let result: boolean;
    if (sourceRecord.shot_id === selectedShotIdLocal) {
      result = sourceRecord.position === null || sourceRecord.position === undefined;
      console.log('[ShotNavDebug] [ImageGalleryLightbox] associatedWithoutPositionInSelectedShot: direct shot_id match', {
        shot_id: sourceRecord.shot_id,
        position: sourceRecord.position,
        result,
        timestamp: Date.now()
      });
      return result;
    }
    
    const a = sourceRecord.all_shot_associations;
    if (Array.isArray(a)) {
      const m = a.find(x => x.shot_id === selectedShotIdLocal);
      result = !!(m && (m.position === null || m.position === undefined));
      console.log('[ShotNavDebug] [ImageGalleryLightbox] associatedWithoutPositionInSelectedShot: all_shot_associations check', {
        associationsCount: a.length,
        foundMatch: !!m,
        matchPosition: m?.position,
        result,
        timestamp: Date.now()
      });
      return result;
    }
    
    console.log('[ShotNavDebug] [ImageGalleryLightbox] associatedWithoutPositionInSelectedShot: fallback false', {
      timestamp: Date.now()
    });
    return false;
  }, [sourceRecord, selectedShotIdLocal]);

  // Log what's being passed to MediaLightbox
  useEffect(() => {
    if (activeLightboxMedia) {
      console.log('[ShotNavDebug] [ImageGalleryLightbox] Passing to MediaLightbox', {
        mediaId: activeLightboxMedia.id,
        selectedShotIdLocal,
        positionedInSelectedShot,
        associatedWithoutPositionInSelectedShot,
        optimisticPositionedCount: optimisticPositionedIds?.size || 0,
        optimisticUnpositionedCount: optimisticUnpositionedIds?.size || 0,
        timestamp: Date.now()
      });
    }
  }, [activeLightboxMedia?.id, selectedShotIdLocal, positionedInSelectedShot, associatedWithoutPositionInSelectedShot, optimisticPositionedIds, optimisticUnpositionedIds]);

  // Handle navigation to a specific generation by ID
  const handleNavigateToGeneration = React.useCallback((generationId: string) => {
    console.log('[BasedOnDebug] handleNavigateToGeneration called', { 
      generationId,
      hasSetActiveLightboxIndex: !!setActiveLightboxIndex,
      filteredImagesCount: filteredImages.length
    });
    
    // Find the generation in the filtered images
    const index = filteredImages.findIndex(img => img.id === generationId);
    
    if (index !== -1) {
      console.log('[BasedOnDebug] Found generation in filtered images', { index, generationId });
      
      if (setActiveLightboxIndex) {
        console.log('[BasedOnDebug] Calling setActiveLightboxIndex', { index });
        setActiveLightboxIndex(index);
        console.log('[BasedOnDebug] setActiveLightboxIndex called successfully');
      } else {
        console.error('[BasedOnDebug] setActiveLightboxIndex is not defined!');
      }
    } else {
      console.log('[BasedOnDebug] Generation not found in current filtered set', {
        generationId,
        filteredImagesCount: filteredImages.length,
        filteredImageIds: filteredImages.map(img => img.id).slice(0, 5)
      });
      // TODO: Could potentially fetch the generation and add it to the view
      // For now, just log that it's not available
    }
  }, [filteredImages, setActiveLightboxIndex]);

  return (
    <>
      {/* Main Lightbox Modal */}
      {activeLightboxMedia && (
        <MediaLightbox
          media={activeLightboxMedia}
          onClose={onClose}
          onNext={onNext}
          onPrevious={onPrevious}
          onImageSaved={wrappedOnImageSaved}
          showNavigation={true}
          showImageEditTools={!activeLightboxMedia.type.includes('video')}
          showDownload={true}
          showMagicEdit={true}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          allShots={simplifiedShotOptions}
          selectedShotId={selectedShotIdLocal}
          onShotChange={onShotChange}
          onAddToShot={onAddToShot}
          onAddToShotWithoutPosition={onAddToShotWithoutPosition}
          onDelete={onDelete}
          isDeleting={isDeleting}
          onApplySettings={onApplySettings}
          showTickForImageId={showTickForImageId}
          onShowTick={setShowTickForImageId}
          showTickForSecondaryImageId={showTickForSecondaryImageId}
          onShowSecondaryTick={setShowTickForSecondaryImageId}
          optimisticPositionedIds={optimisticPositionedIds}
          optimisticUnpositionedIds={optimisticUnpositionedIds}
          onOptimisticPositioned={onOptimisticPositioned}
          onOptimisticUnpositioned={onOptimisticUnpositioned}
          starred={starredValue}
          onMagicEdit={(imageUrl, prompt, numImages) => {
            // TODO: Implement magic edit generation
            console.log('Magic Edit:', { imageUrl, prompt, numImages });
          }}
          // Task details functionality - same pattern as VideoGallery
          showTaskDetails={!isMobile}
          taskDetailsData={{
            task,
            isLoading: isLoadingTask,
            error: taskError,
            inputImages,
            taskId: lightboxTaskMapping?.taskId || null,
            onApplyTaskSettings: onApplySettings,
            onClose: onClose
          }}
          onShowTaskDetails={isMobile ? onShowTaskDetails : undefined}
          onCreateShot={onCreateShot}
          onNavigateToShot={onNavigateToShot}
          toolTypeOverride={toolTypeOverride}
          positionedInSelectedShot={positionedInSelectedShot}
          associatedWithoutPositionInSelectedShot={associatedWithoutPositionInSelectedShot}
          onNavigateToGeneration={handleNavigateToGeneration}
        />
      )}

      {/* Mobile Task Details Modal */}
      {selectedImageForDetails && showTaskDetailsModal && (
        <TaskDetailsModal
          open={showTaskDetailsModal}
          onOpenChange={(open) => {
            if (!open) {
              setShowTaskDetailsModal(false);
              setSelectedImageForDetails(null);
            }
          }}
          generationId={selectedImageForDetails.id}
        />
      )}
    </>
  );
};
