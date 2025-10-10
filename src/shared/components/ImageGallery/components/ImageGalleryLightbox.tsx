import React, { useMemo } from "react";
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
