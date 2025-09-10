import React, { useMemo, useEffect, useCallback } from "react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useToggleGenerationStar } from '@/shared/hooks/useGenerations';
import { useTaskFromUnifiedCache } from '@/shared/hooks/useUnifiedGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';
import { TooltipProvider } from "@/shared/components/ui/tooltip";
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
} from './utils';

// Import types that were originally defined here for re-export
import type { Shot, GenerationRow } from "@/types/shots";

// Define types here to avoid circular imports
export interface MetadataLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
}

export interface DisplayableMetadata extends Record<string, any> {
  prompt?: string;
  imagesPerPrompt?: number;
  seed?: number;
  width?: number;
  height?: number;
  content_type?: string;
  activeLoras?: MetadataLora[];
  depthStrength?: number;
  softEdgeStrength?: number;
  userProvidedImageUrl?: string | null;
  num_inference_steps?: number;
  guidance_scale?: number;
  scheduler?: string;
  tool_type?: string;
  original_image_filename?: string;
  original_frame_timestamp?: number;
  source_frames?: number;
  original_duration?: number;
}

export interface GeneratedImageWithMetadata {
  id: string;
  url: string;
  thumbUrl?: string;
  prompt?: string;
  seed?: number;
  metadata?: DisplayableMetadata;
  temp_local_path?: string;
  error?: string;
  file?: File;
  isVideo?: boolean;
  unsaved?: boolean;
  createdAt?: string;
  starred?: boolean;
  shot_id?: string;
  position?: number | null;
  all_shot_associations?: Array<{ shot_id: string; position: number | null }>;
}

export interface ImageGalleryProps {
  images: GeneratedImageWithMetadata[];
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  allShots: Shot[];
  lastShotId?: string;
  lastShotNameForTooltip?: string;
  onAddToLastShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToLastShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  currentToolType?: string;
  initialFilterState?: boolean;
  onImageSaved?: (imageId: string, newImageUrl: string) => void;
  currentViewingShotId?: string;
  offset?: number;
  totalCount?: number;
  whiteText?: boolean;
  columnsPerRow?: number;
  itemsPerPage?: number;
  initialMediaTypeFilter?: 'all' | 'image' | 'video';
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  serverPage?: number;
  showShotFilter?: boolean;
  initialShotFilter?: string;
  onShotFilterChange?: (shotId: string) => void;
  initialExcludePositioned?: boolean;
  onExcludePositionedChange?: (exclude: boolean) => void;
  showSearch?: boolean;
  initialSearchTerm?: string;
  onSearchChange?: (searchTerm: string) => void;
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  initialStarredFilter?: boolean;
  onStarredFilterChange?: (starredOnly: boolean) => void;
  onToolTypeFilterChange?: (enabled: boolean) => void;
  initialToolTypeFilter?: boolean;
  currentToolTypeName?: string;
  formAssociatedShotId?: string | null;
  onSwitchToAssociatedShot?: (shotId: string) => void;
  reducedSpacing?: boolean;
  hidePagination?: boolean;
  hideTopFilters?: boolean;
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  enableAdjacentPagePreloading?: boolean;
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
}

/**
 * Modularized ImageGallery Component
 * 
 * This component has been restructured following the Timeline.tsx pattern:
 * - Custom hooks for complex logic (state, filters, pagination, actions, mobile)
 * - Sub-components for UI sections (header, grid, lightbox, etc.)
 * - Utility functions for pure logic
 * - Main component for coordination and composition
 */
export const ImageGallery: React.FC<ImageGalleryProps> = (props) => {


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
    onImageSaved, 
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
    hidePagination = false,
    hideTopFilters = false,
    onPrefetchAdjacentPages,
    enableAdjacentPagePreloading = true,
    onCreateShot,
    lastShotNameForTooltip
  } = props;

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
  
  // Debug mobile detection (reduced frequency)
  React.useEffect(() => {
    console.log('[MobileDebug] Mobile detection changed:', {
      rawIsMobile,
      isMobile,
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 'undefined',
      isMobileType: typeof isMobile,
      timestamp: Date.now()
    });
  }, [isMobile]); // Only log when isMobile actually changes
  
  // Add global debug function for mobile testing
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugMobile = () => {
        const debugInfo = {
          isMobile,
          rawIsMobile,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          userAgent: navigator.userAgent,
          touchSupported: 'ontouchstart' in window,
          timestamp: Date.now()
        };
        console.log('[MobileDebug] Debug info:', debugInfo);
        alert(`Mobile Debug:\nisMobile: ${isMobile}\nrawIsMobile: ${rawIsMobile}\nWindow: ${window.innerWidth}x${window.innerHeight}\nTouch: ${'ontouchstart' in window}`);
        return debugInfo;
      };
    }
  }, [isMobile, rawIsMobile]);
  
  // Star functionality
  const toggleStarMutation = useToggleGenerationStar();
  const { navigateToShot } = useShotNavigation();

  const handleNavigateToShot = (shot: Shot) => {
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
  };

  // Use mobile-optimized defaults to improve initial render performance
  const defaultItemsPerPage = isMobile ? DEFAULT_ITEMS_PER_PAGE.MOBILE : DEFAULT_ITEMS_PER_PAGE.DESKTOP;
  const actualItemsPerPage = itemsPerPage ?? defaultItemsPerPage;
  
  const simplifiedShotOptions = React.useMemo(() => 
    [...allShots]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .map(s => ({ id: s.id, name: s.name })), 
    [allShots]
  );
  
  // Memoize grid column classes to prevent unnecessary recalculations
  const gridColumnClasses = React.useMemo(() => {
    return GRID_COLUMN_CLASSES[columnsPerRow as keyof typeof GRID_COLUMN_CLASSES] || GRID_COLUMN_CLASSES[5];
  }, [columnsPerRow]);

  // Core state management hook
  const stateHook = useImageGalleryState({
    images,
    currentShotId,
    lastShotId,
    simplifiedShotOptions,
  });

  // Filters hook
  const filtersHook = useImageGalleryFilters({
    images,
    optimisticDeletedIds: stateHook.optimisticDeletedIds,
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
    onImageSaved,
    activeLightboxMedia: stateHook.activeLightboxMedia,
    setActiveLightboxMedia: stateHook.setActiveLightboxMedia,
    markOptimisticDeleted: stateHook.markOptimisticDeleted,
    removeOptimisticDeleted: stateHook.removeOptimisticDeleted,
    setDownloadingImageId: stateHook.setDownloadingImageId,
    setShowTickForImageId: stateHook.setShowTickForImageId,
    setShowTickForSecondaryImageId: stateHook.setShowTickForSecondaryImageId,
    mainTickTimeoutRef: stateHook.mainTickTimeoutRef,
    secondaryTickTimeoutRef: stateHook.secondaryTickTimeoutRef,
  });

  // Mobile interactions hook
  const mobileHook = useMobileInteractions({
    isMobile,
    mobileActiveImageId: stateHook.mobileActiveImageId,
    setMobileActiveImageId: stateHook.setMobileActiveImageId,
    mobilePopoverOpenImageId: stateHook.mobilePopoverOpenImageId,
    setMobilePopoverOpenImageId: stateHook.setMobilePopoverOpenImageId,
    lastTouchTimeRef: stateHook.lastTouchTimeRef,
    doubleTapTimeoutRef: stateHook.doubleTapTimeoutRef,
    onOpenLightbox: actionsHook.handleOpenLightbox,
  });



  // Task details functionality
  const lightboxImageId = stateHook.activeLightboxMedia?.id || null;
  const { data: lightboxTaskMapping } = useTaskFromUnifiedCache(lightboxImageId || '');
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(lightboxTaskMapping?.taskId || '');
  
  // Derive input images from multiple possible locations within task params
  const inputImages: string[] = useMemo(() => deriveInputImages(task), [task]);

  // Calculate effective page for progressive loading
  const effectivePage = paginationHook.isServerPagination ? 0 : paginationHook.page;
  
  // Page state logging disabled for performance
  // console.log(`[GalleryDebug] 📊 Page state:`, {
  //   isServerPagination: paginationHook.isServerPagination,
  //   serverPage,
  //   clientPage: paginationHook.page,
  //   effectivePage,
  //   paginatedImagesLength: paginationHook.paginatedImages.length,
  //   isGalleryLoading: paginationHook.isGalleryLoading,
  //   loadingButton: paginationHook.loadingButton,
  //   enableAdjacentPagePreloading,
  //   timestamp: new Date().toISOString()
  // });

  // Sync selection when lastShotId changes
  useEffect(() => {
    if (!lastShotId) return;
    
    // If we're viewing a specific shot, don't override with lastShotId
    if (currentShotId && simplifiedShotOptions.find(shot => shot.id === currentShotId)) {
      console.log('[ShotSelectionDebug] Not syncing to lastShotId because currentShotId takes priority:', {
        currentShotId,
        lastShotId,
        selectedShotIdLocal: stateHook.selectedShotIdLocal
      });
      return;
    }

    const existsInShots = simplifiedShotOptions.some(s => s.id === lastShotId);
    if (existsInShots && lastShotId !== stateHook.selectedShotIdLocal) {
      console.log('[ShotSelectionDebug] Syncing selection to lastShotId change:', {
        previousSelection: stateHook.selectedShotIdLocal,
        nextSelection: lastShotId,
        shotsCount: simplifiedShotOptions.length,
        timestamp: Date.now()
      });
      stateHook.setSelectedShotIdLocal(lastShotId);
    }
  }, [lastShotId, simplifiedShotOptions, stateHook.selectedShotIdLocal, currentShotId, stateHook.setSelectedShotIdLocal]);

  // Handle opening lightbox after page navigation
  useEffect(() => {
    if (stateHook.pendingLightboxTarget && filtersHook.filteredImages.length > 0) {
      const targetIndex = stateHook.pendingLightboxTarget === 'first' ? 0 : filtersHook.filteredImages.length - 1;
      const targetImage = filtersHook.filteredImages[targetIndex];
      if (targetImage) {
        actionsHook.handleOpenLightbox(targetImage);
        stateHook.setPendingLightboxTarget(null);
      }
    }
  }, [filtersHook.filteredImages, stateHook.pendingLightboxTarget, actionsHook.handleOpenLightbox, stateHook.setPendingLightboxTarget]);

  // Lightbox navigation handlers
  const handleNextImage = useCallback(() => {
    if (!stateHook.activeLightboxMedia) return;
    const currentIndex = filtersHook.filteredImages.findIndex(img => img.id === stateHook.activeLightboxMedia!.id);
    
    if (paginationHook.isServerPagination) {
      // For server pagination, handle page boundaries
      if (currentIndex < filtersHook.filteredImages.length - 1) {
        // Move to next item on current page
        actionsHook.handleOpenLightbox(filtersHook.filteredImages[currentIndex + 1]);
      } else {
        // At the end of current page, go to next page if available
        const currentServerPage = serverPage || 1;
        if (currentServerPage < paginationHook.totalPages && onServerPageChange) {
          // Close lightbox and navigate to next page
          stateHook.setActiveLightboxMedia(null);
          stateHook.setPendingLightboxTarget('first'); // Open first item of next page
          onServerPageChange(currentServerPage + 1);
        }
      }
    } else {
      // For client pagination, use existing logic
      if (currentIndex < filtersHook.filteredImages.length - 1) {
        actionsHook.handleOpenLightbox(filtersHook.filteredImages[currentIndex + 1]);
      }
    }
  }, [stateHook.activeLightboxMedia, filtersHook.filteredImages, paginationHook.isServerPagination, serverPage, paginationHook.totalPages, onServerPageChange, actionsHook.handleOpenLightbox, stateHook.setActiveLightboxMedia, stateHook.setPendingLightboxTarget]);

  const handlePreviousImage = useCallback(() => {
    if (!stateHook.activeLightboxMedia) return;
    const currentIndex = filtersHook.filteredImages.findIndex(img => img.id === stateHook.activeLightboxMedia!.id);
    
    if (paginationHook.isServerPagination) {
      // For server pagination, handle page boundaries
      if (currentIndex > 0) {
        // Move to previous item on current page
        actionsHook.handleOpenLightbox(filtersHook.filteredImages[currentIndex - 1]);
      } else {
        // At the beginning of current page, go to previous page if available
        const currentServerPage = serverPage || 1;
        if (currentServerPage > 1 && onServerPageChange) {
          // Close lightbox and navigate to previous page
          stateHook.setActiveLightboxMedia(null);
          stateHook.setPendingLightboxTarget('last'); // Open last item of previous page
          onServerPageChange(currentServerPage - 1);
        }
      }
    } else {
      // For client pagination, use existing logic
      if (currentIndex > 0) {
        actionsHook.handleOpenLightbox(filtersHook.filteredImages[currentIndex - 1]);
      }
    }
  }, [stateHook.activeLightboxMedia, filtersHook.filteredImages, paginationHook.isServerPagination, serverPage, onServerPageChange, actionsHook.handleOpenLightbox, stateHook.setActiveLightboxMedia, stateHook.setPendingLightboxTarget]);

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
      activeLightboxMedia: stateHook.activeLightboxMedia?.id,
    });
    if (stateHook.activeLightboxMedia) {
      // Set up task details modal state first
      stateHook.setSelectedImageForDetails(stateHook.activeLightboxMedia);
      // Use setTimeout to ensure state update happens before opening modal
      setTimeout(() => {
        stateHook.setShowTaskDetailsModal(true);
        // Close lightbox after modal is set to open
        stateHook.setActiveLightboxMedia(null);
        console.log('[TaskToggle] ImageGallery: State updated for task details modal', {
          newSelectedImage: stateHook.activeLightboxMedia?.id,
          newShowModal: true,
          closedLightbox: true
        });
      }, 100);
    } else {
      console.error('[TaskToggle] ImageGallery: No active lightbox media found');
    }
  }, [stateHook.activeLightboxMedia, stateHook.setSelectedImageForDetails, stateHook.setShowTaskDetailsModal, stateHook.setActiveLightboxMedia]);

  return (
    <TooltipProvider>
      <div className={`${reducedSpacing ? 'space-y-3' : 'space-y-6'} ${reducedSpacing ? 'pb-2' : 'pb-8'}`}>
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
        <ShotNotifier
          formAssociatedShotId={formAssociatedShotId}
          shotFilter={filtersHook.shotFilter}
          showShotFilter={showShotFilter}
          allShots={simplifiedShotOptions}
          onSwitchToAssociatedShot={handleSwitchToAssociatedShot}
          onShowAllShots={handleShowAllShots}
        />

        {/* Main Gallery Grid */}
        <ImageGalleryGrid
          // Data props
          images={images}
          paginatedImages={paginationHook.paginatedImages}
          filteredImages={filtersHook.filteredImages}
          
          // Layout props
          reducedSpacing={reducedSpacing}
          whiteText={whiteText}
          gridColumnClasses={gridColumnClasses}
          projectAspectRatio={projectAspectRatio}
          
          // Loading props
          isGalleryLoading={paginationHook.isGalleryLoading}
          setIsGalleryLoading={paginationHook.setIsGalleryLoading}
          isServerPagination={paginationHook.isServerPagination}
          setLoadingButton={paginationHook.setLoadingButton}
          safetyTimeoutRef={stateHook.safetyTimeoutRef}
          
          // Progressive loading props
          effectivePage={effectivePage}
          isMobile={isMobile}
          
          // Lightbox state
          isLightboxOpen={!!stateHook.activeLightboxMedia}
          
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
          
          // ImageGalleryItem props
          isDeleting={isDeleting}
          onDelete={actionsHook.handleOptimisticDelete}
          onApplySettings={onApplySettings}
          onOpenLightbox={actionsHook.handleOpenLightbox}
          onAddToLastShot={onAddToLastShot}
          onAddToLastShotWithoutPosition={onAddToLastShotWithoutPosition}
          onDownloadImage={actionsHook.handleDownloadImage}
          onToggleStar={onToggleStar}
          selectedShotIdLocal={stateHook.selectedShotIdLocal}
          simplifiedShotOptions={simplifiedShotOptions}
          showTickForImageId={stateHook.showTickForImageId}
          onShowTick={actionsHook.handleShowTick}
          showTickForSecondaryImageId={stateHook.showTickForSecondaryImageId}
          onShowSecondaryTick={actionsHook.handleShowSecondaryTick}
          optimisticUnpositionedIds={stateHook.optimisticUnpositionedIds}
          optimisticPositionedIds={stateHook.optimisticPositionedIds}
          optimisticDeletedIds={stateHook.optimisticDeletedIds}
          onOptimisticUnpositioned={stateHook.markOptimisticUnpositioned}
          onOptimisticPositioned={stateHook.markOptimisticPositioned}
          addingToShotImageId={stateHook.addingToShotImageId}
          setAddingToShotImageId={stateHook.setAddingToShotImageId}
          addingToShotWithoutPositionImageId={stateHook.addingToShotWithoutPositionImageId}
          setAddingToShotWithoutPositionImageId={stateHook.setAddingToShotWithoutPositionImageId}
          downloadingImageId={stateHook.downloadingImageId}
          mobileActiveImageId={stateHook.mobileActiveImageId}
          mobilePopoverOpenImageId={stateHook.mobilePopoverOpenImageId}
          onMobileTap={mobileHook.handleMobileTap}
          setMobilePopoverOpenImageId={stateHook.setMobilePopoverOpenImageId}
          setSelectedShotIdLocal={stateHook.setSelectedShotIdLocal}
          setLastAffectedShotId={actionsHook.handleShotChange}
          toggleStarMutation={toggleStarMutation}
          onCreateShot={onCreateShot}
          currentViewingShotId={currentViewingShotId}
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
          hidePagination={hidePagination}
          onPageChange={paginationHook.handlePageChange}
          isBottom={true}
        />
      </div>
      
      {/* Lightbox and Task Details */}
      <ImageGalleryLightbox
        activeLightboxMedia={stateHook.activeLightboxMedia}
        onClose={actionsHook.handleCloseLightbox}
        filteredImages={filtersHook.filteredImages}
        isServerPagination={paginationHook.isServerPagination}
        serverPage={serverPage}
        totalPages={paginationHook.totalPages}
        onServerPageChange={onServerPageChange}
        onNext={handleNextImage}
        onPrevious={handlePreviousImage}
        onImageSaved={actionsHook.handleImageSaved}
        onDelete={actionsHook.handleOptimisticDelete}
        isDeleting={isDeleting}
        onApplySettings={onApplySettings}
        simplifiedShotOptions={simplifiedShotOptions}
        selectedShotIdLocal={stateHook.selectedShotIdLocal}
        onShotChange={actionsHook.handleShotChange}
        onAddToShot={onAddToLastShot}
        showTickForImageId={stateHook.showTickForImageId}
        setShowTickForImageId={stateHook.setShowTickForImageId}
        isMobile={isMobile}
        showTaskDetailsModal={stateHook.showTaskDetailsModal}
        setShowTaskDetailsModal={stateHook.setShowTaskDetailsModal}
        selectedImageForDetails={stateHook.selectedImageForDetails}
        setSelectedImageForDetails={stateHook.setSelectedImageForDetails}
        task={task}
        isLoadingTask={isLoadingTask}
        taskError={taskError}
        inputImages={inputImages}
        lightboxTaskMapping={lightboxTaskMapping}
        onShowTaskDetails={handleShowTaskDetails}
        onCreateShot={onCreateShot}
        onNavigateToShot={handleNavigateToShot}
      />
    </TooltipProvider>
  );
};

export default ImageGallery;
