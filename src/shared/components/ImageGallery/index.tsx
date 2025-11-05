import React, { useMemo, useEffect, useCallback, useRef } from "react";
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
  timeline_frame?: number | null;
  name?: string; // Variant name for the generation
  all_shot_associations?: Array<{ shot_id: string; position: number | null; timeline_frame?: number | null }>;
  based_on?: string | null; // ID of source generation for lineage tracking (magic edits, variations)
  upscaled_url?: string | null; // URL of upscaled version if available
  derivedCount?: number; // Number of generations based on this one
}

export interface ImageGalleryProps {
  images: GeneratedImageWithMetadata[];
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  allShots: Shot[];
  lastShotId?: string;
  lastShotNameForTooltip?: string;
  onAddToLastShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
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
  onBackfillRequest?: (deletedCount: number, currentPage: number, itemsPerPage: number) => Promise<GeneratedImageWithMetadata[]>;
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
    lastShotNameForTooltip,
    onBackfillRequest
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
        alert(`Mobile Debug:\nisMobile: ${isMobile}\nrawIsMobile: ${rawIsMobile}\nWindow: ${window.innerWidth}x${window.innerHeight}\nTouch: ${'ontouchstart' in window}`);
        return debugInfo;
      };
    }
  }, [isMobile, rawIsMobile]);
  
  // Star functionality
  const toggleStarMutation = useToggleGenerationStar();
  const { navigateToShot } = useShotNavigation();

  const handleNavigateToShot = (shot: Shot) => {
    });
    
    try {
      navigateToShot(shot);
      // Now we close the lightbox from the component that owns its state
      actionsHook.handleCloseLightbox();
      } catch (error) {
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

  const handleVisitShotFromNotifier = useCallback((shotId: string) => {
    });
    
    // Find the shot object from the shot ID
    const shot = simplifiedShotOptions.find(s => s.id === shotId);
    if (!shot) {
      return;
    }
    
    // Convert the simplified shot to a full Shot object
    const fullShot = allShots.find(s => s.id === shotId);
    if (!fullShot) {
      return;
    }
    
    });
    
    try {
      navigateToShot(fullShot);
      } catch (error) {
    }
  }, [simplifiedShotOptions, allShots, navigateToShot]);
  
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
    isServerPagination: !!(onServerPageChange && serverPage),
    serverPage,
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
    mobileActiveImageId: stateHook.mobileActiveImageId,
    setMobileActiveImageId: stateHook.setMobileActiveImageId,
    mobilePopoverOpenImageId: stateHook.mobilePopoverOpenImageId,
    setMobilePopoverOpenImageId: stateHook.setMobilePopoverOpenImageId,
    lastTouchTimeRef: stateHook.lastTouchTimeRef,
    lastTappedImageIdRef: stateHook.lastTappedImageIdRef,
    doubleTapTimeoutRef: stateHook.doubleTapTimeoutRef,
    onOpenLightbox: actionsHook.handleOpenLightbox,
  });



  // Task details functionality
  const lightboxImageId = stateHook.activeLightboxMedia?.id || null;
  const { data: lightboxTaskMapping } = useTaskFromUnifiedCache(lightboxImageId || '');
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask((lightboxTaskMapping?.taskId as string) || '');
  
  // Debug task details loading
  React.useEffect(() => {
    if (lightboxImageId) {
      : [],
      });
    }
  }, [lightboxImageId, lightboxTaskMapping, task, isLoadingTask, taskError]);
  
  // Derive input images from multiple possible locations within task params
  const inputImages: string[] = useMemo(() => deriveInputImages(task), [task]);

  // Calculate effective page for progressive loading
  const effectivePage = paginationHook.isServerPagination ? 0 : paginationHook.page;
  
  // Page state logging disabled for performance
  // .toISOString()
  // });

  // Sync external initialShotFilter prop to internal selectedShotIdLocal state
  // This allows external components (like GenerationsPane) to control the filter
  const prevInitialShotFilterRef = useRef(initialShotFilter);
  useEffect(() => {
    // Only sync when initialShotFilter actually changes (not on every render)
    if (initialShotFilter && initialShotFilter !== prevInitialShotFilterRef.current) {
      });
      stateHook.setSelectedShotIdLocal(initialShotFilter);
      prevInitialShotFilterRef.current = initialShotFilter;
    }
  }, [initialShotFilter, stateHook.selectedShotIdLocal, stateHook.setSelectedShotIdLocal]);

  // Sync selection when lastShotId changes (only for fixing invalid selections)
  // NOTE: Do NOT auto-sync to currentShotId to allow external filter control (e.g., GenerationsPane)
  useEffect(() => {
    if (!lastShotId) return;
    
    // Only sync if the current selection is invalid and lastShotId exists in shots
    const isCurrentSelectionValid = stateHook.selectedShotIdLocal && 
      simplifiedShotOptions.some(s => s.id === stateHook.selectedShotIdLocal);
    
    if (isCurrentSelectionValid) {
      // Current selection is valid, don't override it
      return;
    }

    const existsInShots = simplifiedShotOptions.some(s => s.id === lastShotId);
    if (existsInShots && lastShotId !== stateHook.selectedShotIdLocal) {
      });
      stateHook.setSelectedShotIdLocal(lastShotId);
    }
  }, [lastShotId, simplifiedShotOptions, stateHook.selectedShotIdLocal, stateHook.setSelectedShotIdLocal]);

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

  // Create refs to store current values to avoid stale closures
  const navigationDataRef = useRef({
    activeLightboxMedia: stateHook.activeLightboxMedia,
    filteredImages: filtersHook.filteredImages,
    isServerPagination: paginationHook.isServerPagination,
    serverPage: serverPage,
    totalPages: paginationHook.totalPages,
  });

  // Update refs on each render
  navigationDataRef.current = {
    activeLightboxMedia: stateHook.activeLightboxMedia,
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
          // Close lightbox and navigate to next page
          stateHook.setActiveLightboxMedia(null);
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
          // Close lightbox and navigate to previous page
          stateHook.setActiveLightboxMedia(null);
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
    
    if (index >= 0 && index < filteredImages.length) {
      actionsHook.handleOpenLightbox(filteredImages[index]);
      } else {
    }
  }, [actionsHook.handleOpenLightbox]);

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
    if (stateHook.activeLightboxMedia) {
      // Set up task details modal state first
      stateHook.setSelectedImageForDetails(stateHook.activeLightboxMedia);
      // Use setTimeout to ensure state update happens before opening modal
      setTimeout(() => {
        stateHook.setShowTaskDetailsModal(true);
        // Close lightbox after modal is set to open
        stateHook.setActiveLightboxMedia(null);
        }, 100);
    } else {
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
            onDownloadStarred={actionsHook.handleDownloadStarred}
            isDownloadingStarred={stateHook.isDownloadingStarred}
            
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
          onVisitShot={handleVisitShotFromNotifier}
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
          
          // Backfill state
          isBackfillLoading={stateHook.isBackfillLoading}
          backfillSkeletonCount={stateHook.backfillSkeletonCount}
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
        autoEnterEditMode={stateHook.autoEnterEditMode}
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
        onAddToShotWithoutPosition={onAddToLastShotWithoutPosition}
        showTickForImageId={stateHook.showTickForImageId}
        setShowTickForImageId={stateHook.setShowTickForImageId}
        showTickForSecondaryImageId={stateHook.showTickForSecondaryImageId}
        setShowTickForSecondaryImageId={stateHook.setShowTickForSecondaryImageId}
        optimisticPositionedIds={stateHook.optimisticPositionedIds}
        optimisticUnpositionedIds={stateHook.optimisticUnpositionedIds}
        onOptimisticPositioned={stateHook.markOptimisticPositioned}
        onOptimisticUnpositioned={stateHook.markOptimisticUnpositioned}
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
        toolTypeOverride={currentToolType}
        setActiveLightboxIndex={handleSetActiveLightboxIndex}
      />
    </TooltipProvider>
  );
};

// Export optimized version
export { ImageGalleryOptimized } from './ImageGalleryOptimized';

export default ImageGallery;
