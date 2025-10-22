import React, { useMemo, useEffect } from "react";
import MediaLightbox from "@/shared/components/MediaLightbox";
import TaskDetailsModal from '@/tools/travel-between-images/components/TaskDetailsModal';
import { GenerationRow, Shot } from "@/types/shots";
import { GeneratedImageWithMetadata } from '../index';
import { useQueryClient } from '@tanstack/react-query';

export interface ImageGalleryLightboxProps {
  // Lightbox state
  activeLightboxMedia: GenerationRow | null;
  autoEnterEditMode?: boolean;
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
  onAddToShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
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
  autoEnterEditMode = false,
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
  
  // Extract autoEnterEditMode from media metadata (more reliable than separate state)
  const effectiveAutoEnterEditMode = React.useMemo(() => {
    const fromMetadata = activeLightboxMedia?.metadata?.__autoEnterEditMode as boolean | undefined;
    const result = fromMetadata ?? autoEnterEditMode ?? false;
    
    console.log('[EditModeDebug] ImageGalleryLightbox computing effective autoEnterEditMode:', {
      fromProps: autoEnterEditMode,
      fromMetadata,
      effectiveValue: result,
      activeLightboxMediaId: activeLightboxMedia?.id,
      timestamp: Date.now()
    });
    
    return result;
  }, [activeLightboxMedia?.metadata?.__autoEnterEditMode, autoEnterEditMode, activeLightboxMedia?.id]);
  
  // Detect tablet/iPad size (768px+) for side-by-side task details layout
  const [isTabletOrLarger, setIsTabletOrLarger] = React.useState(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );
  
  React.useEffect(() => {
    const handleResize = () => {
      setIsTabletOrLarger(window.innerWidth >= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
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

  // Get query client for direct cache access
  const queryClient = useQueryClient();
  
  // Subscribe to cache updates to force re-render when starred changes
  const [cacheVersion, setCacheVersion] = React.useState(0);
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Only trigger on mutations that might affect starred state
      if (event.type === 'updated' && event.query.queryKey[0] === 'unified-generations') {
        console.log('[StarPersist] 📡 Cache updated, forcing enhancedMedia recompute');
        setCacheVersion(v => v + 1);
      }
    });
    return unsubscribe;
  }, [queryClient]);
  
  // Enhance media object with starred and upscaled_url fields - subscribe to React Query cache for real-time updates
  const enhancedMedia = useMemo(() => {
    if (!activeLightboxMedia) return null;
    
    // First, try to find in filteredImages (normal case)
    let foundImage = filteredImages.find(img => img.id === activeLightboxMedia.id);
    
    // If not found or starred/upscaled_url is undefined, check React Query cache directly
    // This ensures we get the latest optimistically-updated values
    if (!foundImage || foundImage.starred === undefined || !foundImage.upscaled_url) {
      const queries = queryClient.getQueriesData({ queryKey: ['unified-generations'] });
      for (const [, data] of queries) {
        if (data && typeof data === 'object' && 'items' in data) {
          const cacheItem = (data as any).items.find((g: any) => g.id === activeLightboxMedia.id);
          if (cacheItem) {
            foundImage = cacheItem;
            console.log('[StarPersist] 📦 Found values in React Query cache:', {
              mediaId: activeLightboxMedia.id,
              starred: cacheItem.starred,
              hasUpscaledUrl: !!cacheItem.upscaled_url,
              source: 'queryCache'
            });
            break;
          }
        }
      }
    }
    
    const starred = foundImage?.starred || false;
    const upscaled_url = foundImage?.upscaled_url || activeLightboxMedia.upscaled_url || null;
    
    console.log('[StarPersist] 🎨 Enhanced media created:', {
      mediaId: activeLightboxMedia.id,
      starred,
      hasUpscaledUrl: !!upscaled_url,
      foundInFilteredImages: !!filteredImages.find(img => img.id === activeLightboxMedia.id),
      source: foundImage ? 'found' : 'default',
      cacheVersion
    });
    
    // Clean up internal flags from metadata before passing to MediaLightbox
    const { __autoEnterEditMode, ...cleanMetadata } = activeLightboxMedia.metadata || {};
    
    return {
      ...activeLightboxMedia,
      starred,
      upscaled_url,
      metadata: cleanMetadata
    };
  }, [activeLightboxMedia, filteredImages, queryClient, cacheVersion]);

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
    console.log('[DerivedNav:Gallery] 📍 handleNavigateToGeneration called', { 
      generationId: generationId.substring(0, 8),
      fullGenerationId: generationId,
      hasSetActiveLightboxIndex: !!setActiveLightboxIndex,
      filteredImagesCount: filteredImages.length,
      currentMedia: activeLightboxMedia?.id.substring(0, 8),
      timestamp: Date.now()
    });
    
    // Find the generation in the filtered images
    const index = filteredImages.findIndex(img => img.id === generationId);
    
    console.log('[DerivedNav:Gallery] 🔍 Search result', {
      searchedId: generationId.substring(0, 8),
      foundIndex: index,
      wasFound: index !== -1,
      sampleImages: filteredImages.slice(0, 3).map(img => ({
        id: img.id.substring(0, 8),
        matches: img.id === generationId
      }))
    });
    
    if (index !== -1) {
      console.log('[DerivedNav:Gallery] ✅ Found generation in filtered images', { 
        index, 
        generationId: generationId.substring(0, 8),
        willSetIndex: true 
      });
      
      if (setActiveLightboxIndex) {
        console.log('[DerivedNav:Gallery] 🎯 Calling setActiveLightboxIndex', { 
          currentMedia: activeLightboxMedia?.id.substring(0, 8),
          toIndex: index 
        });
        setActiveLightboxIndex(index);
        console.log('[DerivedNav:Gallery] ✨ setActiveLightboxIndex completed');
      } else {
        console.error('[DerivedNav:Gallery] ❌ setActiveLightboxIndex is not available!');
      }
    } else {
      console.error('[DerivedNav:Gallery] ❌ Generation not found in current filtered set', {
        searchedId: generationId.substring(0, 8),
        fullGenerationId: generationId,
        filteredImagesCount: filteredImages.length,
        firstFiveIds: filteredImages.map(img => img.id.substring(0, 8)).slice(0, 5),
        allIds: filteredImages.map(img => img.id)
      });
      // TODO: Could potentially fetch the generation and add it to the view
      // For now, just log that it's not available
    }
  }, [filteredImages, setActiveLightboxIndex, activeLightboxMedia?.id]);

  // Debug: Log when navigation handler is created
  React.useEffect(() => {
    console.log('[DerivedNav:Gallery] 🔧 Navigation handler state', {
      hasHandleNavigateToGeneration: !!handleNavigateToGeneration,
      hasSetActiveLightboxIndex: !!setActiveLightboxIndex,
      filteredImagesCount: filteredImages.length,
      handlerType: typeof handleNavigateToGeneration,
      timestamp: Date.now()
    });
  }, [handleNavigateToGeneration, setActiveLightboxIndex, filteredImages.length]);

  return (
    <>
      {/* Main Lightbox Modal */}
      {enhancedMedia && (
        <MediaLightbox
          media={enhancedMedia}
          autoEnterInpaint={effectiveAutoEnterEditMode}
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
          shotId={selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined}
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
          // Task details functionality - show on tablet+ (768px+), hide on mobile
          showTaskDetails={isTabletOrLarger}
          taskDetailsData={{
            task,
            isLoading: isLoadingTask,
            error: taskError,
            inputImages,
            taskId: lightboxTaskMapping?.taskId || null,
            onApplySettingsFromTask: onApplySettings,
            onClose: onClose
          }}
          onShowTaskDetails={isMobile ? onShowTaskDetails : undefined}
          onCreateShot={onCreateShot}
          onNavigateToShot={onNavigateToShot}
          toolTypeOverride={toolTypeOverride}
          positionedInSelectedShot={positionedInSelectedShot}
          associatedWithoutPositionInSelectedShot={associatedWithoutPositionInSelectedShot}
          onNavigateToGeneration={(() => {
            console.log('[DerivedNav:Gallery] 📤 Passing onNavigateToGeneration to MediaLightbox', {
              hasHandler: !!handleNavigateToGeneration,
              handlerType: typeof handleNavigateToGeneration,
              mediaId: enhancedMedia?.id.substring(0, 8),
              timestamp: Date.now()
            });
            return handleNavigateToGeneration;
          })()}
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
