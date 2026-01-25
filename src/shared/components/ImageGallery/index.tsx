import React, { useMemo, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';
import { useBackgroundThumbnailGenerator } from '@/shared/hooks/useBackgroundThumbnailGenerator';
import { useVariantBadges } from '@/shared/hooks/useVariantBadges';
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import { ImageGalleryPagination } from "@/shared/components/ImageGalleryPagination";

// Import hooks
import {
  useImageGalleryState,
  useImageGalleryFilters,
  useImageGalleryPagination,
  useImageGalleryActions,
  useMobileInteractions,
} from './hooks';

// Import components
import {
  ImageGalleryHeader,
  ShotNotifier,
  ImageGalleryGrid,
  ImageGalleryLightbox,
} from './components';

// Import utils
import {
  deriveInputImages,
  DEFAULT_ITEMS_PER_PAGE,
  GRID_COLUMN_CLASSES,
  getLayoutForAspectRatio,
} from './utils';

// Import types
import type { Shot, GenerationRow } from "@/types/shots";
import type { 
  MetadataLora,
  DisplayableMetadata,
  GeneratedImageWithMetadata,
  ImageGalleryProps
} from './types';

// Re-export types for convenience
export type {
  MetadataLora,
  DisplayableMetadata,
  GeneratedImageWithMetadata,
  ImageGalleryProps
};

/**
 * ImageGallery Component with consolidated state management
 * 
 * Key optimizations:
 * - Consolidated state management using useReducer instead of multiple useState calls
 * - Selective re-rendering with React.memo and proper dependency arrays
 * - Memoized expensive computations and callbacks
 * - Reduced hook complexity and state updates
 */
const ImageGallery: React.FC<ImageGalleryProps> = React.memo((props) => {
  const {
    images, 
    onDelete, 
    isDeleting, 
    onApplySettings, 
    allShots, 
    lastShotId, 
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    currentToolType, 
    initialFilterState = true, 
    currentViewingShotId,
    offset = 0, 
    totalCount, 
    whiteText = false, 
    columnsPerRow = 5, 
    itemsPerPage, 
    initialMediaTypeFilter = 'all', 
    onServerPageChange, 
    serverPage, 
    showShotFilter = false, 
    initialShotFilter = 'all', 
    onShotFilterChange,
    initialExcludePositioned = true,
    onExcludePositionedChange,
    showSearch = false,
    initialSearchTerm = '',
    onSearchChange,
    onMediaTypeFilterChange,
    onToggleStar,
    onStarredFilterChange,
    onToolTypeFilterChange,
    initialStarredFilter = false,
    initialToolTypeFilter = true,
    currentToolTypeName,
    formAssociatedShotId,
    onSwitchToAssociatedShot,
    reducedSpacing = false,
    className,
    hidePagination = false,
    hideTopFilters = false,
    hideMediaTypeFilter = false,
    onPrefetchAdjacentPages,
    enableAdjacentPagePreloading = true,
    onCreateShot,
    lastShotNameForTooltip,
    onBackfillRequest,
    showDelete = true,
    showDownload = true,
    showShare = true,
    showEdit = true,
    showStar = true,
    showAddToShot = true,
    enableSingleClick = false,
    onImageClick,
    hideBottomPagination = false,
    videosAsThumbnails = false,
    hideShotNotifier = false,
  } = props;

  // [VideoSkeletonDebug] Mount/props summary for video gallery use
  // Optimized: only log on mount and significant changes, using ref to track
  const videoGalleryDebugRef = useRef({ lastImagesLength: 0 });
  React.useEffect(() => {
    const isVideoGallery = currentToolType === 'travel-between-images' && initialMediaTypeFilter === 'video';
    if (!isVideoGallery) return;
    // Only log when images length changes significantly
    const imagesLength = images?.length ?? 0;
    if (videoGalleryDebugRef.current.lastImagesLength !== imagesLength) {
      videoGalleryDebugRef.current.lastImagesLength = imagesLength;
      console.log('[VideoSkeletonDebug] ImageGallery props:', {
        imagesLength,
        totalCount,
        timestamp: Date.now()
      });
    }
  }, [images?.length, totalCount, currentToolType, initialMediaTypeFilter]);

  // Get project context for cache clearing and aspect ratio
  const { selectedProjectId, projects } = useProject();
  const { currentShotId } = useCurrentShot();
  
  // Get current project's aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  const rawIsMobile = useIsMobile();
  const { toast } = useToast();
  
  // Fallback mobile detection in case useIsMobile fails
  const isMobile = rawIsMobile ?? (typeof window !== 'undefined' && window.innerWidth < 768);
  
  // Debug mobile detection - only log on actual changes (mount-only in production)
  const prevMobileRef = useRef(isMobile);
  React.useEffect(() => {
    if (prevMobileRef.current !== isMobile) {
      prevMobileRef.current = isMobile;
      console.log('[MobileDebug] Mobile detection changed:', { isMobile });
    }
  }, [isMobile]);

  // Global debug function for mobile testing - reads fresh values when called
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugMobile = () => {
        const freshIsMobile = window.innerWidth < 768;
        const debugInfo = {
          isMobile: freshIsMobile,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          touchSupported: 'ontouchstart' in window,
        };
        console.log('[MobileDebug] Debug info:', debugInfo);
        return debugInfo;
      };
    }
  }, []); // Only setup once on mount - reads fresh values when called
  
  // Star functionality
  const toggleStarMutation = useToggleGenerationStar();
  const { navigateToShot } = useShotNavigation();

  // Compute aspect-ratio-aware layout (columns, itemsPerPage, skeletonColumns)
  // This adjusts columns based on image dimensions:
  // - Wide images (16:9) → fewer columns (6)
  // - Square images (1:1) → medium columns (7)
  // - Tall images (9:16) → more columns (9)
  const aspectRatioLayout = React.useMemo(() => {
    return getLayoutForAspectRatio(projectAspectRatio, isMobile);
  }, [projectAspectRatio, isMobile]);

  // Use aspect-ratio-aware defaults, but allow explicit override via props
  const effectiveColumnsPerRow = columnsPerRow !== 5 ? columnsPerRow : aspectRatioLayout.columns;
  const defaultItemsPerPage = aspectRatioLayout.itemsPerPage;
  const actualItemsPerPage = itemsPerPage ?? defaultItemsPerPage;

  // Memoize simplified shot options to prevent re-computation on every render
  const simplifiedShotOptions = React.useMemo(() =>
    [...allShots]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .map(s => ({
        id: s.id,
        name: s.name,
        settings: s.settings,
        created_at: s.created_at
      })),
    [allShots]
  );

  // Memoize grid column classes to prevent unnecessary recalculations
  const gridColumnClasses = React.useMemo(() => {
    return GRID_COLUMN_CLASSES[effectiveColumnsPerRow as keyof typeof GRID_COLUMN_CLASSES] || aspectRatioLayout.gridColumnClasses;
  }, [effectiveColumnsPerRow, aspectRatioLayout.gridColumnClasses]);

  // Core state management hook
  const stateHook = useImageGalleryState({
    images,
    currentShotId,
    lastShotId,
    simplifiedShotOptions,
    isServerPagination: !!(onServerPageChange && serverPage),
    serverPage,
  });

  // Filters hook
  const filtersHook = useImageGalleryFilters({
    images,
    optimisticDeletedIds: stateHook.state.optimisticDeletedIds,
    currentToolType,
    initialFilterState,
    initialMediaTypeFilter,
    initialShotFilter,
    initialExcludePositioned,
    initialSearchTerm,
    initialStarredFilter,
    initialToolTypeFilter,
    onServerPageChange,
    serverPage,
    onShotFilterChange,
    onExcludePositionedChange,
    onSearchChange,
    onMediaTypeFilterChange,
    onStarredFilterChange,
    onToolTypeFilterChange,
  });

  // Check if filters are active for empty state
  const hasFilters = filtersHook.filterByToolType || filtersHook.mediaTypeFilter !== 'all' || !!filtersHook.searchTerm.trim() || filtersHook.showStarredOnly || !filtersHook.toolTypeFilterEnabled;

  // Pagination hook
  const paginationHook = useImageGalleryPagination({
    filteredImages: filtersHook.filteredImages,
    itemsPerPage: actualItemsPerPage,
    onServerPageChange,
    serverPage,
    offset,
    totalCount,
    enableAdjacentPagePreloading,
    isMobile,
    galleryTopRef: stateHook.galleryTopRef,
  });

  // Actions hook
  const actionsHook = useImageGalleryActions({
    onDelete,
    onApplySettings,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    onToggleStar,
    activeLightboxMedia: stateHook.state.activeLightboxMedia,
    setActiveLightboxMedia: stateHook.setActiveLightboxMedia,
    setAutoEnterEditMode: stateHook.setAutoEnterEditMode,
    markOptimisticDeleted: stateHook.markOptimisticDeleted,
    removeOptimisticDeleted: stateHook.removeOptimisticDeleted,
    setDownloadingImageId: stateHook.setDownloadingImageId,
    setShowTickForImageId: stateHook.setShowTickForImageId,
    setShowTickForSecondaryImageId: stateHook.setShowTickForSecondaryImageId,
    mainTickTimeoutRef: stateHook.mainTickTimeoutRef,
    secondaryTickTimeoutRef: stateHook.secondaryTickTimeoutRef,
    onBackfillRequest,
    serverPage,
    itemsPerPage: actualItemsPerPage,
    isServerPagination: paginationHook.isServerPagination,
    setIsBackfillLoading: stateHook.setIsBackfillLoading,
    setBackfillSkeletonCount: stateHook.setBackfillSkeletonCount,
    filteredImages: filtersHook.filteredImages,
    setIsDownloadingStarred: stateHook.setIsDownloadingStarred,
    setSelectedShotIdLocal: stateHook.setSelectedShotIdLocal,
  });

  // Mobile interactions hook
  const mobileHook = useMobileInteractions({
    isMobile,
    mobileActiveImageId: stateHook.state.mobileActiveImageId,
    setMobileActiveImageId: stateHook.setMobileActiveImageId,
    mobilePopoverOpenImageId: stateHook.state.mobilePopoverOpenImageId,
    setMobilePopoverOpenImageId: stateHook.setMobilePopoverOpenImageId,
    lastTouchTimeRef: stateHook.lastTouchTimeRef,
    lastTappedImageIdRef: stateHook.lastTappedImageIdRef,
    doubleTapTimeoutRef: stateHook.doubleTapTimeoutRef,
    onOpenLightbox: actionsHook.handleOpenLightbox,
  });

  // Task details functionality
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager images, id is shot_generations.id but generation_id is the actual generation ID
  const lightboxImageId = (stateHook.state.activeLightboxMedia as any)?.generation_id 
    || stateHook.state.activeLightboxMedia?.id 
    || null;
  const { data: lightboxTaskMapping } = useTaskFromUnifiedCache(lightboxImageId || '');
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask((lightboxTaskMapping?.taskId as string) || '');
  
  // Derive input images from multiple possible locations within task params
  const inputImages: string[] = useMemo(() => deriveInputImages(task), [task]);

  // Background thumbnail generation for videos without thumbnails
  useBackgroundThumbnailGenerator({
    videos: paginationHook.paginatedImages || [],
    projectId: selectedProjectId,
    enabled: !!selectedProjectId && (paginationHook.paginatedImages?.length || 0) > 0,
  });

  // Lazy-load variant badge data (derivedCount, hasUnviewedVariants, unviewedVariantCount)
  // This allows images to display immediately while badge data loads in background
  const paginatedGenerationIds = useMemo(() =>
    (paginationHook.paginatedImages || []).map(img =>
      (img as any).generation_id || img.id
    ).filter(Boolean),
    [paginationHook.paginatedImages]
  );
  const { getBadgeData, isLoading: isBadgeDataLoading } = useVariantBadges(paginatedGenerationIds);

  // Merge badge data with paginated images (only when badge data is loaded)
  const paginatedImagesWithBadges = useMemo(() => {
    if (!paginationHook.paginatedImages) return [];
    return paginationHook.paginatedImages.map(img => {
      // Don't merge badge data while loading - prevents showing "0" badges
      // Strip out any existing derivedCount to prevent flash of "0"
      if (isBadgeDataLoading) {
        const { derivedCount, hasUnviewedVariants, unviewedVariantCount, ...imgWithoutBadges } = img as any;
        return imgWithoutBadges;
      }
      const generationId = (img as any).generation_id || img.id;
      const badgeData = getBadgeData(generationId);
      return {
        ...img,
        derivedCount: badgeData.derivedCount,
        hasUnviewedVariants: badgeData.hasUnviewedVariants,
        unviewedVariantCount: badgeData.unviewedVariantCount,
      };
    });
  }, [paginationHook.paginatedImages, getBadgeData, isBadgeDataLoading]);

  // Calculate effective page for progressive loading
  const effectivePage = paginationHook.isServerPagination
    ? Math.max(0, (serverPage ?? 1) - 1)
    : paginationHook.page;

  // Memoized navigation handler to prevent re-creation
  const handleNavigateToShot = useCallback((shot: Shot) => {
    console.log('[VisitShotDebug] 6. ImageGallery handleNavigateToShot called', {
      shot,
      hasNavigateToShot: !!navigateToShot,
      hasHandleCloseLightbox: !!actionsHook.handleCloseLightbox,
      timestamp: Date.now()
    });
    
    try {
      console.log('[VisitShotDebug] 7. ImageGallery calling navigateToShot');
      navigateToShot(shot);
      console.log('[VisitShotDebug] 8. ImageGallery navigateToShot completed, now closing lightbox');
      
      // Now we close the lightbox from the component that owns its state
      actionsHook.handleCloseLightbox();
      console.log('[VisitShotDebug] 9. ImageGallery handleCloseLightbox completed');
    } catch (error) {
      console.error('[VisitShotDebug] ERROR in ImageGallery handleNavigateToShot:', error);
    }
  }, [navigateToShot, actionsHook.handleCloseLightbox]);

  // Memoized visit shot handler
  const handleVisitShotFromNotifier = useCallback((shotId: string) => {
    console.log('[VisitShotDebug] 1. ImageGallery handleVisitShotFromNotifier called', {
      shotId,
      timestamp: Date.now()
    });
    
    // Find the shot object from the shot ID
    const shot = simplifiedShotOptions.find(s => s.id === shotId);
    if (!shot) {
      console.error('[VisitShotDebug] ERROR: Shot not found for ID:', shotId);
      return;
    }
    
    // Convert the simplified shot to a full Shot object
    const fullShot = allShots.find(s => s.id === shotId);
    if (!fullShot) {
      console.error('[VisitShotDebug] ERROR: Full shot not found for ID:', shotId);
      return;
    }
    
    console.log('[VisitShotDebug] 2. ImageGallery found shot, calling navigateToShot', {
      shot: fullShot,
      timestamp: Date.now()
    });
    
    try {
      navigateToShot(fullShot);
      console.log('[VisitShotDebug] 3. ImageGallery navigateToShot completed');
    } catch (error) {
      console.error('[VisitShotDebug] ERROR in ImageGallery handleVisitShotFromNotifier:', error);
    }
  }, [simplifiedShotOptions, allShots, navigateToShot]);

  // Handle opening lightbox after page navigation
  useEffect(() => {
    if (stateHook.state.pendingLightboxTarget && filtersHook.filteredImages.length > 0) {
      const targetIndex = stateHook.state.pendingLightboxTarget === 'first' ? 0 : filtersHook.filteredImages.length - 1;
      const targetImage = filtersHook.filteredImages[targetIndex];
      if (targetImage) {
        actionsHook.handleOpenLightbox(targetImage);
        stateHook.setPendingLightboxTarget(null);
      }
    }
  }, [filtersHook.filteredImages, stateHook.state.pendingLightboxTarget, actionsHook.handleOpenLightbox, stateHook.setPendingLightboxTarget]);

  // Listen for custom event to select a shot for adding images (from VideoShotDisplay)
  useEffect(() => {
    const handleSelectShotForAddition = (event: CustomEvent<{ shotId: string; shotName: string }>) => {
      const { shotId, shotName } = event.detail;
      console.log('[ImageGallery] Selecting shot for addition:', { shotId, shotName });
      // Use handleShotChange to update both selectedShotIdLocal AND lastAffectedShotId
      // This ensures handleAddToShot will use the correct target shot
      actionsHook.handleShotChange(shotId);
    };

    window.addEventListener('selectShotForAddition', handleSelectShotForAddition as EventListener);
    return () => window.removeEventListener('selectShotForAddition', handleSelectShotForAddition as EventListener);
  }, [actionsHook.handleShotChange]);

  // Create refs to store current values to avoid stale closures
  const navigationDataRef = useRef({
    activeLightboxMedia: stateHook.state.activeLightboxMedia,
    filteredImages: filtersHook.filteredImages,
    isServerPagination: paginationHook.isServerPagination,
    serverPage: serverPage,
    totalPages: paginationHook.totalPages,
  });

  // Update refs on each render
  navigationDataRef.current = {
    activeLightboxMedia: stateHook.state.activeLightboxMedia,
    filteredImages: filtersHook.filteredImages,
    isServerPagination: paginationHook.isServerPagination,
    serverPage: serverPage,
    totalPages: paginationHook.totalPages,
  };

  // Lightbox navigation handlers with stable dependencies
  const handleNextImage = useCallback(() => {
    const { activeLightboxMedia, filteredImages, isServerPagination, serverPage: currentServerPage, totalPages } = navigationDataRef.current;
    
    if (!activeLightboxMedia) return;
    const currentIndex = filteredImages.findIndex(img => img.id === activeLightboxMedia.id);
    
    if (isServerPagination) {
      // For server pagination, handle page boundaries
      if (currentIndex < filteredImages.length - 1) {
        // Move to next item on current page
        actionsHook.handleOpenLightbox(filteredImages[currentIndex + 1]);
      } else {
        // At the end of current page, go to next page if available
        const page = currentServerPage || 1;
        if (page < totalPages && onServerPageChange) {
          // Keep lightbox open showing current image, set pending target for new page
          // When new page data arrives, the pendingLightboxTarget effect will swap in the new image
          stateHook.setPendingLightboxTarget('first'); // Open first item of next page
          onServerPageChange(page + 1);
        }
      }
    } else {
      // For client pagination, use existing logic
      if (currentIndex < filteredImages.length - 1) {
        actionsHook.handleOpenLightbox(filteredImages[currentIndex + 1]);
      }
    }
  }, [actionsHook.handleOpenLightbox, stateHook.setActiveLightboxMedia, stateHook.setPendingLightboxTarget, onServerPageChange]);

  const handlePreviousImage = useCallback(() => {
    const { activeLightboxMedia, filteredImages, isServerPagination, serverPage: currentServerPage } = navigationDataRef.current;
    
    if (!activeLightboxMedia) return;
    const currentIndex = filteredImages.findIndex(img => img.id === activeLightboxMedia.id);
    
    if (isServerPagination) {
      // For server pagination, handle page boundaries
      if (currentIndex > 0) {
        // Move to previous item on current page
        actionsHook.handleOpenLightbox(filteredImages[currentIndex - 1]);
      } else {
        // At the beginning of current page, go to previous page if available
        const page = currentServerPage || 1;
        if (page > 1 && onServerPageChange) {
          // Keep lightbox open showing current image, set pending target for new page
          // When new page data arrives, the pendingLightboxTarget effect will swap in the new image
          stateHook.setPendingLightboxTarget('last'); // Open last item of previous page
          onServerPageChange(page - 1);
        }
      }
    } else {
      // For client pagination, use existing logic
      if (currentIndex > 0) {
        actionsHook.handleOpenLightbox(filteredImages[currentIndex - 1]);
      }
    }
  }, [actionsHook.handleOpenLightbox, stateHook.setActiveLightboxMedia, stateHook.setPendingLightboxTarget, onServerPageChange]);

  // Navigate to a specific image by index (for generation lineage navigation)
  const handleSetActiveLightboxIndex = useCallback((index: number) => {
    const { filteredImages } = navigationDataRef.current;
    
    console.log('[BasedOnDebug] handleSetActiveLightboxIndex called', { 
      index, 
      filteredImagesLength: filteredImages.length,
      targetImageId: filteredImages[index]?.id 
    });
    
    if (index >= 0 && index < filteredImages.length) {
      console.log('[BasedOnDebug] Opening lightbox for image at index', { 
        index, 
        imageId: filteredImages[index].id 
      });
      actionsHook.handleOpenLightbox(filteredImages[index]);
      console.log('[BasedOnDebug] handleOpenLightbox called');
    } else {
      console.warn('[BasedOnDebug] Invalid index for navigation', { index, filteredImagesLength: filteredImages.length });
    }
  }, [actionsHook.handleOpenLightbox]);

  // Wrapper functions to adapt 3-parameter onAddToLastShot to 4-parameter signature expected by ImageGalleryLightbox
  // The lightbox passes (targetShotId, generationId, imageUrl, thumbUrl) but parent provides (generationId, imageUrl, thumbUrl)
  // We ignore targetShotId because the parent's handler uses lastAffectedShotId (updated via onShotChange)
  const adaptedOnAddToShot = useMemo(() => {
    if (!onAddToLastShot) return undefined;
    return async (_targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
      return onAddToLastShot(generationId, imageUrl, thumbUrl);
    };
  }, [onAddToLastShot]);

  const adaptedOnAddToShotWithoutPosition = useMemo(() => {
    if (!onAddToLastShotWithoutPosition) return undefined;
    return async (_targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
      return onAddToLastShotWithoutPosition(generationId, imageUrl, thumbUrl);
    };
  }, [onAddToLastShotWithoutPosition]);

  // Additional action handlers
  const handleSwitchToAssociatedShot = useCallback(() => {
    if (formAssociatedShotId && onSwitchToAssociatedShot) {
      onSwitchToAssociatedShot(formAssociatedShotId);
    }
  }, [formAssociatedShotId, onSwitchToAssociatedShot]);

  const handleShowAllShots = useCallback(() => {
    filtersHook.setShotFilter('all');
    onShotFilterChange?.('all');
  }, [filtersHook.setShotFilter, onShotFilterChange]);

  // Task details handlers
  const handleShowTaskDetails = useCallback(() => {
    console.log('[TaskToggle] ImageGallery: handleShowTaskDetails called', { 
      activeLightboxMedia: stateHook.state.activeLightboxMedia?.id,
    });
    if (stateHook.state.activeLightboxMedia) {
      // Set up task details modal state first
      stateHook.setSelectedImageForDetails(stateHook.state.activeLightboxMedia);
      // Use setTimeout to ensure state update happens before opening modal
      setTimeout(() => {
        stateHook.setShowTaskDetailsModal(true);
        // Close lightbox after modal is set to open
        stateHook.setActiveLightboxMedia(null);
        console.log('[TaskToggle] ImageGallery: State updated for task details modal', {
          newSelectedImage: stateHook.state.activeLightboxMedia?.id,
          newShowModal: true,
          closedLightbox: true
        });
      }, 100);
    } else {
      console.error('[TaskToggle] ImageGallery: No active lightbox media found');
    }
  }, [stateHook.state.activeLightboxMedia, stateHook.setSelectedImageForDetails, stateHook.setShowTaskDetailsModal, stateHook.setActiveLightboxMedia]);

  return (
    <TooltipProvider>
      <div className={cn(
        reducedSpacing ? 'space-y-3' : 'space-y-6',
        reducedSpacing ? 'pb-0' : ((!hidePagination && !hideBottomPagination) ? 'pb-[62px]' : 'pb-0'),
        className
      )}>
        {/* Header section with pagination and filters */}
        <div ref={stateHook.galleryTopRef}>
          <ImageGalleryHeader
            // Pagination props
            totalPages={paginationHook.totalPages}
            page={paginationHook.page}
            isServerPagination={paginationHook.isServerPagination}
            serverPage={serverPage}
            rangeStart={paginationHook.rangeStart}
            rangeEnd={paginationHook.rangeEnd}
            totalFilteredItems={paginationHook.totalFilteredItems}
            loadingButton={paginationHook.loadingButton}
            whiteText={whiteText}
            reducedSpacing={reducedSpacing}
            hidePagination={hidePagination}
            onPageChange={paginationHook.handlePageChange}
            
            // Filter props
            hideTopFilters={hideTopFilters}
            hideMediaTypeFilter={hideMediaTypeFilter}
            showStarredOnly={filtersHook.showStarredOnly}
            onStarredFilterChange={(val) => {
              const next = Boolean(val);
              // Update local filter state immediately to keep UI responsive
              filtersHook.setShowStarredOnly(next);
              // If server pagination is enabled, show a brief loading state while new data arrives
              if (paginationHook.isServerPagination) {
                paginationHook.setIsGalleryLoading(true);
              }
              // Propagate to parent to trigger server-side refetch
              onStarredFilterChange?.(next);
            }}
            onDownloadStarred={actionsHook.handleDownloadStarred}
            isDownloadingStarred={stateHook.state.isDownloadingStarred}
            
            // Shot filter props
            showShotFilter={showShotFilter}
            allShots={simplifiedShotOptions}
            shotFilter={filtersHook.shotFilter}
            onShotFilterChange={(shotId) => {
              // Update local shot filter state immediately
              filtersHook.setShotFilter(shotId);
              // If server pagination is enabled, show a brief loading state while new data arrives
              if (paginationHook.isServerPagination) {
                paginationHook.setIsGalleryLoading(true);
              }
              // Propagate to parent to trigger server-side refetch
              onShotFilterChange?.(shotId);
            }}
            excludePositioned={filtersHook.excludePositioned}
            onExcludePositionedChange={(exclude) => {
              // Update local exclude positioned state immediately
              filtersHook.setExcludePositioned(exclude);
              // If server pagination is enabled, show a brief loading state while new data arrives
              if (paginationHook.isServerPagination) {
                paginationHook.setIsGalleryLoading(true);
              }
              // Propagate to parent to trigger server-side refetch
              onExcludePositionedChange?.(exclude);
            }}
            
            // Search props
            showSearch={showSearch}
            isSearchOpen={filtersHook.isSearchOpen}
            setIsSearchOpen={filtersHook.setIsSearchOpen}
            searchTerm={filtersHook.searchTerm}
            searchInputRef={filtersHook.searchInputRef}
            toggleSearch={filtersHook.toggleSearch}
            clearSearch={filtersHook.clearSearch}
            handleSearchChange={(value) => {
              // Update local search state immediately
              filtersHook.setSearchTerm(value);
              // If server pagination is enabled, show a brief loading state while new data arrives
              if (paginationHook.isServerPagination) {
                paginationHook.setIsGalleryLoading(true);
              }
              // Propagate to parent to trigger server-side refetch
              onSearchChange?.(value);
            }}
            
            // Media type filter props
            mediaTypeFilter={filtersHook.mediaTypeFilter}
            onMediaTypeFilterChange={(value) => {
              // Update local filter state immediately to keep UI responsive
              filtersHook.setMediaTypeFilter(value);
              // If server pagination is enabled, show a brief loading state while new data arrives
              if (paginationHook.isServerPagination) {
                paginationHook.setIsGalleryLoading(true);
              }
              // Propagate to parent to trigger server-side refetch
              onMediaTypeFilterChange?.(value);
            }}
            
            // Tool type filter props
            toolTypeFilterEnabled={filtersHook.toolTypeFilterEnabled}
            onToolTypeFilterChange={(enabled) => {
              // Update local filter state immediately to keep UI responsive
              filtersHook.setToolTypeFilterEnabled(enabled);
              // If server pagination is enabled, show a brief loading state while new data arrives
              if (paginationHook.isServerPagination) {
                paginationHook.setIsGalleryLoading(true);
              }
              // Propagate to parent to trigger server-side refetch
              onToolTypeFilterChange?.(enabled);
            }}
            currentToolTypeName={currentToolTypeName}
            isMobile={isMobile}
          />
        </div>

        {/* Shot Filter Notifier */}
        {!hideShotNotifier && (
          <ShotNotifier
            formAssociatedShotId={formAssociatedShotId}
            shotFilter={filtersHook.shotFilter}
            showShotFilter={showShotFilter}
            allShots={simplifiedShotOptions}
            onSwitchToAssociatedShot={handleSwitchToAssociatedShot}
            onShowAllShots={handleShowAllShots}
            onVisitShot={handleVisitShotFromNotifier}
          />
        )}

        {/* Main Gallery Grid */}
        <ImageGalleryGrid
          // Data props
          images={images}
          paginatedImages={paginatedImagesWithBadges}
          filteredImages={filtersHook.filteredImages}

          // Layout props
          reducedSpacing={reducedSpacing}
          whiteText={whiteText}
          gridColumnClasses={gridColumnClasses}
          columnsPerRow={effectiveColumnsPerRow}
          projectAspectRatio={projectAspectRatio}

          // Loading props
          isGalleryLoading={paginationHook.isGalleryLoading}
          isServerPagination={paginationHook.isServerPagination}

          // Navigation completion - the SINGLE way to clear loading state
          clearNavigation={paginationHook.clearNavigation}
          
          // Progressive loading props
          effectivePage={effectivePage}
          isMobile={isMobile}
          
          // Lightbox state
          isLightboxOpen={!!stateHook.state.activeLightboxMedia}
          
          // Preloading props
          enableAdjacentPagePreloading={enableAdjacentPagePreloading}
          page={paginationHook.page}
          serverPage={serverPage}
          totalFilteredItems={paginationHook.totalFilteredItems}
          itemsPerPage={actualItemsPerPage}
          onPrefetchAdjacentPages={onPrefetchAdjacentPages}
          selectedProjectId={selectedProjectId}
          
          // Filter state for empty states
          hasFilters={hasFilters}
          
          // Backfill state
          isBackfillLoading={stateHook.state.isBackfillLoading}
          backfillSkeletonCount={stateHook.state.backfillSkeletonCount}
          setIsBackfillLoading={stateHook.setIsBackfillLoading}
          setBackfillSkeletonCount={stateHook.setBackfillSkeletonCount}
          onSkeletonCleared={actionsHook.handleSkeletonCleared}
          
          // ImageGalleryItem props
          isDeleting={isDeleting}
          onDelete={actionsHook.handleOptimisticDelete}
          onApplySettings={onApplySettings}
          onOpenLightbox={actionsHook.handleOpenLightbox}
          onAddToLastShot={onAddToLastShot}
          onAddToLastShotWithoutPosition={onAddToLastShotWithoutPosition}
          onDownloadImage={actionsHook.handleDownloadImage}
          onToggleStar={onToggleStar}
          selectedShotIdLocal={stateHook.state.selectedShotIdLocal}
          simplifiedShotOptions={simplifiedShotOptions}
          showTickForImageId={stateHook.state.showTickForImageId}
          onShowTick={actionsHook.handleShowTick}
          showTickForSecondaryImageId={stateHook.state.showTickForSecondaryImageId}
          onShowSecondaryTick={actionsHook.handleShowSecondaryTick}
          optimisticUnpositionedIds={stateHook.state.optimisticUnpositionedIds}
          optimisticPositionedIds={stateHook.state.optimisticPositionedIds}
          optimisticDeletedIds={stateHook.state.optimisticDeletedIds}
          onOptimisticUnpositioned={stateHook.markOptimisticUnpositioned}
          onOptimisticPositioned={stateHook.markOptimisticPositioned}
          addingToShotImageId={stateHook.state.addingToShotImageId}
          setAddingToShotImageId={stateHook.setAddingToShotImageId}
          addingToShotWithoutPositionImageId={stateHook.state.addingToShotWithoutPositionImageId}
          setAddingToShotWithoutPositionImageId={stateHook.setAddingToShotWithoutPositionImageId}
          downloadingImageId={stateHook.state.downloadingImageId}
          mobileActiveImageId={stateHook.state.mobileActiveImageId}
          mobilePopoverOpenImageId={stateHook.state.mobilePopoverOpenImageId}
          onMobileTap={mobileHook.handleMobileTap}
          setMobilePopoverOpenImageId={stateHook.setMobilePopoverOpenImageId}
          setSelectedShotIdLocal={stateHook.setSelectedShotIdLocal}
          setLastAffectedShotId={actionsHook.handleShotChange}
          toggleStarMutation={toggleStarMutation}
          onCreateShot={onCreateShot}
          currentViewingShotId={currentViewingShotId}
          showDelete={showDelete}
          showDownload={showDownload}
          showShare={showShare}
          showEdit={showEdit}
          showStar={showStar}
          showAddToShot={showAddToShot}
          enableSingleClick={enableSingleClick}
          onImageClick={onImageClick}
          hideBottomPagination={hideBottomPagination}
          videosAsThumbnails={videosAsThumbnails}
        />
        
        {/* Bottom Pagination Controls */}
        <ImageGalleryPagination
          totalPages={paginationHook.totalPages}
          currentPage={paginationHook.page}
          isServerPagination={paginationHook.isServerPagination}
          serverPage={serverPage}
          rangeStart={paginationHook.rangeStart}
          rangeEnd={paginationHook.rangeEnd}
          totalFilteredItems={paginationHook.totalFilteredItems}
          loadingButton={paginationHook.loadingButton}
          whiteText={whiteText}
          reducedSpacing={reducedSpacing}
          hidePagination={hidePagination || hideBottomPagination}
          onPageChange={paginationHook.handlePageChange}
          isBottom={true}
        />
      </div>
      
      {/* Lightbox and Task Details */}
      <ImageGalleryLightbox
        activeLightboxMedia={stateHook.state.activeLightboxMedia}
        autoEnterEditMode={stateHook.state.autoEnterEditMode}
        onClose={actionsHook.handleCloseLightbox}
        filteredImages={filtersHook.filteredImages}
        isServerPagination={paginationHook.isServerPagination}
        serverPage={serverPage}
        totalPages={paginationHook.totalPages}
        onServerPageChange={onServerPageChange}
        onNext={handleNextImage}
        onPrevious={handlePreviousImage}
        onDelete={showDelete ? actionsHook.handleOptimisticDelete : undefined}
        isDeleting={isDeleting}
        onApplySettings={onApplySettings}
        simplifiedShotOptions={simplifiedShotOptions}
        selectedShotIdLocal={stateHook.state.selectedShotIdLocal}
        onShotChange={actionsHook.handleShotChange}
        onAddToShot={adaptedOnAddToShot}
        onAddToShotWithoutPosition={adaptedOnAddToShotWithoutPosition}
        showTickForImageId={stateHook.state.showTickForImageId}
        setShowTickForImageId={stateHook.setShowTickForImageId}
        showTickForSecondaryImageId={stateHook.state.showTickForSecondaryImageId}
        setShowTickForSecondaryImageId={stateHook.setShowTickForSecondaryImageId}
        optimisticPositionedIds={stateHook.state.optimisticPositionedIds}
        optimisticUnpositionedIds={stateHook.state.optimisticUnpositionedIds}
        onOptimisticPositioned={stateHook.markOptimisticPositioned}
        onOptimisticUnpositioned={stateHook.markOptimisticUnpositioned}
        isMobile={isMobile}
        showTaskDetailsModal={stateHook.state.showTaskDetailsModal}
        setShowTaskDetailsModal={stateHook.setShowTaskDetailsModal}
        selectedImageForDetails={stateHook.state.selectedImageForDetails}
        setSelectedImageForDetails={stateHook.setSelectedImageForDetails}
        task={task}
        isLoadingTask={isLoadingTask}
        taskError={taskError}
        inputImages={inputImages}
        lightboxTaskMapping={lightboxTaskMapping}
        onShowTaskDetails={handleShowTaskDetails}
        onCreateShot={onCreateShot}
        onNavigateToShot={handleNavigateToShot}
        toolTypeOverride={currentToolType}
        setActiveLightboxIndex={handleSetActiveLightboxIndex}
      />
    </TooltipProvider>
  );
});

// Add display name for debugging
ImageGallery.displayName = 'ImageGallery';

export { ImageGallery };
export default ImageGallery;

