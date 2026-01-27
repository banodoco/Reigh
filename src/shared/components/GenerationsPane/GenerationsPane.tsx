import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import { useRenderCount } from '@/shared/components/debug/RefactorMetricsCollector';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { smartPreloadImages, initializePrefetchOperations, smartCleanupOldPages, triggerImageGarbageCollection } from '@/shared/hooks/useAdjacentPagePreloading';
import { useQueryClient } from '@tanstack/react-query';
import { fetchGenerations } from '@/shared/hooks/useGenerations';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { LockIcon, UnlockIcon, Square, ChevronLeft, ChevronRight, Star, Sparkles, ExternalLink, Search, X } from 'lucide-react';
import { ImageGenerationModal } from '@/shared/components/ImageGenerationModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { useContainerWidth } from '@/shared/components/ImageGallery/hooks';
import { getLayoutForAspectRatio } from '@/shared/components/ImageGallery/utils';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { ShotFilter } from '@/shared/components/ShotFilter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useGenerationsPageLogic } from '@/shared/hooks/useGenerationsPageLogic';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { performanceMonitoredTimeout, measureAsync } from '@/shared/lib/performanceUtils';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useShotCreation } from '@/shared/hooks/useShotCreation';
import { toast } from 'sonner';

import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { PANE_CONFIG } from '@/shared/config/panes';

// Fallback rows for pane (smaller than full page galleries)
const PANE_ROWS = 3;

const GenerationsPaneComponent: React.FC = () => {
  // [RefactorMetrics] Track render count for baseline measurements
  useRenderCount('GenerationsPane');
  
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    isGenerationsPaneLocked,
    setIsGenerationsPaneLocked,
    isGenerationsPaneOpen,
    setIsGenerationsPaneOpen,
    generationsPaneHeight,
    isShotsPaneLocked,
    shotsPaneWidth,
    isTasksPaneLocked,
    tasksPaneWidth,
  } = usePanes();
  
  // Check if we're on the image generation tool page
  const isOnImageGenerationPage = location.pathname === '/tools/image-generation';

  // Get current project's aspect ratio
  const { selectedProjectId, projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  const shouldEnableDataLoading = isGenerationsPaneOpen;

  const isMobile = useIsMobile();

  // Measure gallery container width for calculating correct items per page
  const [galleryContainerRef, containerWidth] = useContainerWidth();

  // Calculate items per page based on actual container width
  // Pane uses fewer rows (PANE_ROWS=3) than full galleries (9 rows)
  const paneLayout = useMemo(() => {
    const layout = getLayoutForAspectRatio(projectAspectRatio, isMobile, containerWidth);
    // Override rows for the pane (3 rows instead of 9)
    return {
      ...layout,
      itemsPerPage: layout.columns * PANE_ROWS
    };
  }, [projectAspectRatio, isMobile, containerWidth]);

  const GENERATIONS_PER_PAGE = paneLayout.itemsPerPage;
  const { currentShotId } = useCurrentShot();


  // Media type filter state
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('image');
  
  // Dropdown states to prevent unwanted opening
  const [shotFilterOpen, setShotFilterOpen] = useState(false);
  const [mediaTypeFilterOpen, setMediaTypeFilterOpen] = useState(false);
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Image generation modal state
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);

  // Listen for custom events from product tour to open/close modal
  useEffect(() => {
    const handleOpenModal = () => setIsGenerationModalOpen(true);
    const handleCloseModal = () => setIsGenerationModalOpen(false);
    window.addEventListener('openGenerationModal', handleOpenModal);
    window.addEventListener('closeGenerationModal', handleCloseModal);
    return () => {
      window.removeEventListener('openGenerationModal', handleOpenModal);
      window.removeEventListener('closeGenerationModal', handleCloseModal);
    };
  }, []);

  // Use the generalized logic - data loading now enabled on all pages
  const {
    shotsData,
    paginatedData,
    lastAffectedShotId,
    totalCount,
    selectedShotFilter,
    excludePositioned,
    page,
    isLoading,
    error,
    isDeleting,
    starredOnly,
    searchTerm,
    setSelectedShotFilter,
    setExcludePositioned,
    setStarredOnly,
    setSearchTerm,
    handleServerPageChange,
    handleDeleteGeneration,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    expectedItemCount, // Pre-computed count for instant skeleton display
  } = useGenerationsPageLogic({
    itemsPerPage: GENERATIONS_PER_PAGE,
    mediaType: mediaTypeFilter,
    enableDataLoading: shouldEnableDataLoading
  });

  // Fallback: use shots from shared context when local hook hasn't loaded yet
  const { shots: contextShots } = useShots();
  const shotsForFilter = (shotsData && shotsData.length > 0)
    ? shotsData
    : (contextShots || []);
  
  // Unified shot creation hook
  const { createShot } = useShotCreation();
  
  // Handle creating a new shot from lightbox
  const handleCreateShot = useCallback(async (shotName: string, files: File[]): Promise<void> => {
    // Use unified shot creation - handles inheritance, events, lastAffected automatically
    const result = await createShot({
      name: shotName,
      files: files.length > 0 ? files : undefined,
      // Disable skeleton events for empty shot creation from lightbox
      dispatchSkeletonEvents: files.length > 0,
      onSuccess: () => {
        // Invalidate and refetch shots to update the list
        queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      },
    });

    if (!result) {
      // Error already shown by useShotCreation
      return;
    }

    console.log('[GenerationsPane] Shot created:', {
      shotId: result.shotId.substring(0, 8),
      shotName: result.shotName,
    });
  }, [createShot, queryClient, selectedProjectId]);

  // Debug: Log the current filter state
  useEffect(() => {
    console.log('[PositionFix] GenerationsPane filter state:', {
      selectedShotFilter,
      excludePositioned,
      mediaTypeFilter,
      currentShotId,
      generationsCount: paginatedData.items.length,
      hasPositionedItems: paginatedData.items.filter(item => {
        // Check if any item has positioned associations with the selected shot
        if (selectedShotFilter === 'all') return false;
        if (item.shot_id === selectedShotFilter) {
          return item.position !== null && item.position !== undefined;
        }
        if (item.all_shot_associations) {
          return item.all_shot_associations.some(assoc => 
            assoc.shot_id === selectedShotFilter && 
            assoc.position !== null && 
            assoc.position !== undefined
          );
        }
        return false;
      }).length,
      shouldTriggerSpecialPositioning: selectedShotFilter === currentShotId && excludePositioned,
      targetShotForAdding: currentShotId || lastAffectedShotId,
      timestamp: Date.now()
    });
  }, [selectedShotFilter, excludePositioned, mediaTypeFilter, currentShotId, paginatedData.items, lastAffectedShotId]);

  // Log every render with item count & page for loop detection
  useRenderLogger('GenerationsPane', { page, totalItems: totalCount });

  // Ref to track ongoing server-side prefetch operations
  const prefetchOperationsRef = useRef<{
    images: HTMLImageElement[];
    currentPrefetchId: string;
  }>({ images: [], currentPrefetchId: '' });

  // Prefetch adjacent pages callback for ImageGallery with cancellation
  const handlePrefetchAdjacentPages = useCallback((prevPage: number | null, nextPage: number | null) => {
    const prefetchStartTime = performance.now();
    
    if (!selectedProjectId) return;

    // Cancel previous image preloads immediately
    const prevOps = prefetchOperationsRef.current;
    prevOps.images.forEach(img => {
      img.onload = null;
      img.onerror = null;
      img.src = ''; // Cancel loading
    });

    // Reset tracking with new prefetch ID
    const prefetchId = `${nextPage}-${prevPage}-${Date.now()}`;
    initializePrefetchOperations(prefetchOperationsRef, prefetchId);

    // Clean up old pagination cache to prevent memory leaks
    // Use nextPage-1 as approximation of current page for cleanup
    const currentPage = nextPage ? nextPage - 1 : (prevPage ? prevPage + 1 : 1);
    
    // Time-slice the cleanup operation to prevent UI blocking
    performanceMonitoredTimeout(() => {
      smartCleanupOldPages(queryClient, currentPage, selectedProjectId, 'unified-generations');
    }, 0, 'GenerationsPane cleanup');
    
    // Trigger image garbage collection periodically for pane to free browser memory
    if (currentPage % 8 === 0) {
      // Use requestIdleCallback if available for garbage collection (low priority)
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          triggerImageGarbageCollection();
        });
      } else {
        performanceMonitoredTimeout(() => {
          triggerImageGarbageCollection();
        }, 100, 'GenerationsPane garbage collection');
      }
    }

    const filters = { 
      mediaType: mediaTypeFilter,
      shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
      excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined,
      starredOnly
    };

    // Using centralized preload function from shared hooks - time-sliced for performance

    // Time-slice the prefetch operations to prevent UI blocking
    const performPrefetchOperations = () => {
      // Prefetch next page first (higher priority) 
      if (nextPage) {
        performanceMonitoredTimeout(async () => {
          await measureAsync(
            () => queryClient.prefetchQuery({
              queryKey: ['unified-generations', 'project', selectedProjectId, nextPage, GENERATIONS_PER_PAGE, filters],
              queryFn: () => fetchGenerations(selectedProjectId, GENERATIONS_PER_PAGE, (nextPage - 1) * GENERATIONS_PER_PAGE, filters),
              staleTime: 30 * 1000,
            }),
            'Next page query'
          ).then(() => {
            const cached = queryClient.getQueryData(['unified-generations', 'project', selectedProjectId, nextPage, GENERATIONS_PER_PAGE, filters]) as any;
            
            // Time-slice the image preloading
            performanceMonitoredTimeout(() => {
              smartPreloadImages(cached, 'next', prefetchId, prefetchOperationsRef);
            }, 0, 'GenerationsPane next page image preloading');
          });
        }, 5, 'GenerationsPane next page prefetch'); // Small delay to yield control
      }

      // Prefetch previous page second (lower priority) with additional delay
      if (prevPage) {
        performanceMonitoredTimeout(async () => {
          await measureAsync(
            () => queryClient.prefetchQuery({
              queryKey: ['unified-generations', 'project', selectedProjectId, prevPage, GENERATIONS_PER_PAGE, filters],
              queryFn: () => fetchGenerations(selectedProjectId, GENERATIONS_PER_PAGE, (prevPage - 1) * GENERATIONS_PER_PAGE, filters),
              staleTime: 30 * 1000,
            }),
            'Previous page query'
          ).then(() => {
            const cached = queryClient.getQueryData(['unified-generations', 'project', selectedProjectId, prevPage, GENERATIONS_PER_PAGE, filters]) as any;
            
            // Time-slice the image preloading
            performanceMonitoredTimeout(() => {
              smartPreloadImages(cached, 'prev', prefetchId, prefetchOperationsRef);
            }, 0, 'GenerationsPane previous page image preloading');
          });
        }, 15, 'GenerationsPane previous page prefetch'); // Larger delay for lower priority
      }
    };
    
    // Start the prefetch operations
    performPrefetchOperations();
    
    // Monitor total prefetch operation time
    performanceMonitoredTimeout(() => {
      const totalPrefetchDuration = performance.now() - prefetchStartTime;
      if (totalPrefetchDuration > 50) {
        console.warn(`[PerformanceMonitor] Total prefetch operation took ${totalPrefetchDuration.toFixed(1)}ms`);
      }
    }, 20, 'GenerationsPane total prefetch monitoring');
  }, [selectedProjectId, queryClient, mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly]);

  

  const shotFilterContentRef = useRef<HTMLDivElement>(null);
  const mediaTypeContentRef = useRef<HTMLDivElement>(null);

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave, showBackdrop, closePane } = useSlidingPane({
    side: 'bottom',
    isLocked: isGenerationsPaneLocked,
    onToggleLock: () => setIsGenerationsPaneLocked(!isGenerationsPaneLocked),
    additionalRefs: [shotFilterContentRef, mediaTypeContentRef],
  });

  // Delay pointer events until animation completes to prevent tap bleed-through on mobile
  const [isPointerEventsEnabled, setIsPointerEventsEnabled] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      // Delay enabling pointer events by 300ms (matching the transition duration)
      const timeoutId = setTimeout(() => {
        setIsPointerEventsEnabled(true);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      // Disable immediately when closing
      setIsPointerEventsEnabled(false);
    }
  }, [isOpen]);

  // Debug: Log GenerationsPane state when it opens/changes
  useEffect(() => {
    console.log('[GenerationsPane] State changed:', {
      isOpen,
      location: location.pathname,
      selectedShotFilter,
      excludePositioned,
      lastAffectedShotId,
      shotsDataLength: shotsData?.length,
      totalGenerations: totalCount,
      timestamp: Date.now()
    });
  }, [isOpen, location.pathname, selectedShotFilter, excludePositioned, lastAffectedShotId, shotsData, totalCount]);

  // Listen for custom event to open the pane (used on mobile from other components)
  useEffect(() => {
    const handleOpenGenerationsPane = () => {
      openPane();
    };

    window.addEventListener('openGenerationsPane', handleOpenGenerationsPane);
    return () => window.removeEventListener('openGenerationsPane', handleOpenGenerationsPane);
  }, [openPane]);


  // Prevent immediate interaction after pane opens (especially on mobile)
  const [isInteractionDisabled, setIsInteractionDisabled] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      setIsInteractionDisabled(true);
      setShotFilterOpen(false); // Ensure shot filter is closed when pane opens
      setMediaTypeFilterOpen(false); // Ensure media type filter is closed when pane opens
      const timer = setTimeout(() => setIsInteractionDisabled(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Sync open state with context so Layout can access it
  useEffect(() => {
    setIsGenerationsPaneOpen(isOpen);
  }, [isOpen, setIsGenerationsPaneOpen]);

  // Close the pane when navigating to generations page or image generation tool page
  useEffect(() => {
    if ((isOnImageGenerationPage) && (isOpen || isLocked)) {
      setIsGenerationsPaneLocked(false);
    }
  }, [isOnImageGenerationPage, isOpen, isLocked, setIsGenerationsPaneLocked]);

  return (
    <>
      {/* Backdrop overlay to capture taps outside the pane on mobile (only when open but NOT locked) */}
      {/* When locked, GenerationsPane allows interaction with outside content */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-[99] touch-none"
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          aria-hidden="true"
        />
      )}
      {/* Hide the control tab when on the generations page or image generation tool page */}
      {!isOnImageGenerationPage && (
        <PaneControlTab
          side="bottom"
          isLocked={isLocked}
          isOpen={isOpen}
          toggleLock={toggleLock}
          openPane={openPane}
          paneDimension={generationsPaneHeight}
          /* Centre within visible width taking into account any locked side panes */
          horizontalOffset={
            (isShotsPaneLocked ? shotsPaneWidth : 0) - (isTasksPaneLocked ? tasksPaneWidth : 0)
          }
          handlePaneEnter={handlePaneEnter}
          handlePaneLeave={handlePaneLeave}
          thirdButton={{
            onClick: () => {
              setIsGenerationsPaneLocked(false);
              navigate('/tools/image-generation');
            },
            ariaLabel: "Go to Image Generation tool",
            tooltip: "Go to Image Generation tool",
            content: <ExternalLink className="h-4 w-4" />
          }}
          fourthButton={{
            onClick: () => setIsGenerationModalOpen(true),
            ariaLabel: "Generate new image",
            tooltip: "Generate new image",
            content: <Sparkles className="h-4 w-4" />
          }}
          customIcon={<Sparkles className="h-4 w-4" />}
          paneTooltip="Generate new image"
          allowMobileLock={true}
          customOpenAction={() => setIsGenerationModalOpen(true)}
          dataTour="generations-pane-tab"
          dataTourLock="generations-lock"
          dataTourFourthButton="generations-sparkles"
        />
      )}
      <div
        {...paneProps}
        data-testid="generations-pane"
        style={{
          height: `${generationsPaneHeight}px`,
          left: isShotsPaneLocked ? `${shotsPaneWidth}px` : 0,
          right: isTasksPaneLocked ? `${tasksPaneWidth}px` : 0,
        }}
        className={cn(
          `fixed bottom-0 bg-zinc-900/95 border-t border-zinc-700 shadow-xl z-[100] transform transition-all duration-300 ease-smooth flex flex-col pointer-events-auto`,
          transformClass
        )}
      >
        {/* Inner wrapper with delayed pointer events to prevent tap bleed-through */}
        <div 
          className={cn(
            'flex flex-col h-full',
            isPointerEventsEnabled ? 'pointer-events-auto' : 'pointer-events-none'
          )}
        >
          <div className="px-2 pt-3 pb-2 space-y-2">
            {/* Row 1: Pagination (left) + Media type filter (right) */}
            <div className="flex items-center justify-between min-w-0 mx-2">
                {/* Left side: Pagination */}
                <div className="flex items-center gap-2">
                  {totalCount > GENERATIONS_PER_PAGE ? (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleServerPageChange(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="p-1 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4 text-zinc-400" />
                      </button>

                      {/* Page selector */}
                      <div className="flex items-center gap-1">
                        <Select
                          value={page.toString()}
                          onValueChange={(value) => handleServerPageChange(parseInt(value))}
                        >
                          <SelectTrigger variant="retro-dark" colorScheme="zinc" size="sm" className="h-6 w-9 text-xs px-1 !justify-center [&>span]:!text-center" hideIcon>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent variant="zinc" className="!min-w-0 w-11">
                            {Array.from({ length: Math.ceil(totalCount / GENERATIONS_PER_PAGE) }, (_, i) => (
                              <SelectItem variant="zinc" key={i + 1} value={(i + 1).toString()} className="text-xs !px-0 !justify-center [&>span]:!text-center [&>span]:!w-full">
                                {i + 1}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-zinc-400">
                          <span className="hidden sm:inline">of {Math.ceil(totalCount / GENERATIONS_PER_PAGE)} ({totalCount})</span>
                          <span className="sm:hidden">/ {Math.ceil(totalCount / GENERATIONS_PER_PAGE)}</span>
                        </span>
                      </div>

                      <button
                        onClick={() => handleServerPageChange(page + 1)}
                        disabled={page * GENERATIONS_PER_PAGE >= totalCount}
                        className="p-1 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="h-4 w-4 text-zinc-400" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">
                      {totalCount > 0 ? `${totalCount} item${totalCount !== 1 ? 's' : ''}` : 'No items'}
                    </span>
                  )}
                </div>

                {/* Right side: Media type filter */}
                <div
                  className={cn(
                    "flex items-center transition-all duration-200",
                    isInteractionDisabled && "pointer-events-none opacity-70"
                  )}
                >
                  <Select
                    value={mediaTypeFilter}
                    onValueChange={(value: 'all' | 'image' | 'video') => setMediaTypeFilter(value)}
                    open={mediaTypeFilterOpen}
                    onOpenChange={(open) => {
                      if (isInteractionDisabled && open) {
                        setMediaTypeFilterOpen(false);
                        return;
                      }
                      setMediaTypeFilterOpen(open);
                    }}
                  >
                    <SelectTrigger variant="retro-dark" size="sm" colorScheme="zinc" className="w-[80px] h-8 text-xs" hideIcon>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent variant="zinc" ref={mediaTypeContentRef}>
                      <SelectItem variant="zinc" value="all">All</SelectItem>
                      <SelectItem variant="zinc" value="image">Images</SelectItem>
                      <SelectItem variant="zinc" value="video">Videos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            </div>

            {/* Row 2: Shot filter + Search + CTA (left) + Star filter (right) */}
            <div className="flex items-center justify-between min-w-0 gap-2 mx-2">
                {/* Left side: Shot filter, search, CTA */}
                <div
                  className={cn(
                    "flex items-center gap-2 min-w-0 flex-shrink",
                    "transition-all duration-200",
                    isInteractionDisabled && "pointer-events-none opacity-70"
                  )}
                >
                  <ShotFilter
                    shots={shotsForFilter}
                    selectedShotId={selectedShotFilter}
                    onShotChange={setSelectedShotFilter}
                    excludePositioned={excludePositioned}
                    onExcludePositionedChange={setExcludePositioned}
                    size="sm"
                    whiteText={true}
                    checkboxId="exclude-positioned-generations-pane"
                    triggerWidth="w-[100px] sm:w-[140px] flex-shrink-0 !text-xs"
                    isMobile={isMobile}
                    contentRef={shotFilterContentRef}
                    showPositionFilter={false}
                    open={shotFilterOpen}
                    onOpenChange={(open) => {
                      if (isInteractionDisabled && open) {
                        setShotFilterOpen(false);
                        return;
                      }
                      setShotFilterOpen(open);
                    }}
                  />

                  {/* CTA buttons - only show when on a shot page */}
                  {currentShotId && (
                    selectedShotFilter === currentShotId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedShotFilter('all')}
                        className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 whitespace-nowrap hidden sm:flex"
                      >
                        <ChevronLeft className="h-3 w-3 -mr-0.5" />
                        All
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedShotFilter(currentShotId)}
                        className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 whitespace-nowrap hidden sm:flex"
                      >
                        <ChevronLeft className="h-3 w-3 -mr-0.5" />
                        This shot
                      </Button>
                    )
                  )}

                  {/* Search */}
                  <div className="flex items-center">
                    {!isSearchOpen ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsSearchOpen(true);
                          setTimeout(() => searchInputRef.current?.focus(), 0);
                        }}
                        className="h-7 w-7 p-0 text-zinc-400 hover:text-white hover:bg-zinc-700"
                        aria-label="Search prompts"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="flex items-center space-x-1 border rounded-md px-2 py-1 h-7 bg-zinc-800 border-zinc-600">
                        <Search className="h-3.5 w-3.5 text-zinc-400" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="Search..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="bg-transparent border-none outline-none text-base lg:text-xs w-20 sm:w-28 text-white placeholder-zinc-400 preserve-case"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (searchTerm) {
                              setSearchTerm('');
                              searchInputRef.current?.focus();
                            } else {
                              setIsSearchOpen(false);
                            }
                          }}
                          className="h-auto p-0.5 text-zinc-400 hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: Star filter */}
                <div
                  className={cn(
                    "flex items-center transition-all duration-200 flex-shrink-0",
                    isInteractionDisabled && "pointer-events-none opacity-70"
                  )}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1 h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                    onClick={() => setStarredOnly(!starredOnly)}
                    aria-label={starredOnly ? "Show all items" : "Show only starred items"}
                  >
                    <Star
                      className="h-5 w-5"
                      fill={starredOnly ? 'currentColor' : 'none'}
                    />
                  </Button>
                </div>
            </div>

            {/* Row 3: Exclude positioned checkbox - only when a specific shot is selected */}
            {selectedShotFilter !== 'all' && selectedShotFilter !== 'no-shot' && (
              <div className="flex items-center space-x-2 mx-2">
                <Checkbox
                  id="exclude-positioned-generations-pane"
                  checked={excludePositioned}
                  onCheckedChange={(checked) => setExcludePositioned(!!checked)}
                  className="border-zinc-600 data-[state=checked]:bg-zinc-600"
                />
                <Label
                  htmlFor="exclude-positioned-generations-pane"
                  className="text-xs cursor-pointer text-zinc-300"
                >
                  Exclude items with a position
                </Label>
              </div>
            )}
        </div>
        <div
          ref={galleryContainerRef}
          className="flex-grow px-1 sm:px-3 overflow-y-auto overscroll-contain flex flex-col"
          style={{ WebkitOverflowScrolling: 'touch' }}
          data-tour="gallery-section"
        >
            {isLoading && (
                <SkeletonGallery
                    count={expectedItemCount ?? paneLayout.itemsPerPage}
                    fixedColumns={paneLayout.columns}
                    gapClasses="gap-2 sm:gap-4"
                    whiteText={true}
                    showControls={false}
                    projectAspectRatio={projectAspectRatio}
                    className="space-y-0 pb-4 pt-2"
                />
            )}
            {error && <p className="text-red-500 text-center">Error: {error.message}</p>}
            {!isLoading && paginatedData.items.length > 0 && (
                <>
                  {console.log('[GenerationsPane] Rendering ImageGallery with:', {
                    selectedShotFilter,
                    currentShotId,
                    itemsCount: paginatedData.items.length,
                    timestamp: Date.now()
                  })}
                  <ImageGallery
                    images={paginatedData.items}
                    onDelete={handleDeleteGeneration}
                    isDeleting={isDeleting}
                    allShots={shotsData || []}
                    lastShotId={lastAffectedShotId || undefined}
                    initialShotFilter={selectedShotFilter}
                    onShotFilterChange={setSelectedShotFilter}
                    columnsPerRow={paneLayout.columns}
                    onAddToLastShot={(generationId, imageUrl, thumbUrl) => {
                      console.log('[GenerationsPane] ImageGallery onAddToLastShot called', {
                        generationId,
                        imageUrl: imageUrl?.substring(0, 50) + '...',
                        thumbUrl: thumbUrl?.substring(0, 50) + '...',
                        lastAffectedShotId,
                        selectedShotFilter,
                        excludePositioned,
                        shotsAvailable: shotsData?.map(s => ({ id: s.id, name: s.name })),
                        timestamp: Date.now()
                      });
                      return handleAddToShot(generationId, imageUrl, thumbUrl);
                    }}
                    onAddToLastShotWithoutPosition={(generationId, imageUrl, thumbUrl) => {
                      console.log('[GenerationsPane] ImageGallery onAddToLastShotWithoutPosition called', {
                        generationId,
                        imageUrl: imageUrl?.substring(0, 50) + '...',
                        thumbUrl: thumbUrl?.substring(0, 50) + '...',
                        lastAffectedShotId,
                        selectedShotFilter,
                        excludePositioned,
                        shotsAvailable: shotsData?.map(s => ({ id: s.id, name: s.name })),
                        timestamp: Date.now()
                      });
                      return handleAddToShotWithoutPosition(generationId, imageUrl, thumbUrl);
                    }}
                    offset={(page - 1) * GENERATIONS_PER_PAGE}
                    totalCount={totalCount}
                    whiteText
                    itemsPerPage={GENERATIONS_PER_PAGE}
                    initialMediaTypeFilter={mediaTypeFilter}
                    onMediaTypeFilterChange={setMediaTypeFilter}
                    initialStarredFilter={starredOnly}
                    onStarredFilterChange={setStarredOnly}
                    reducedSpacing={true}
                    className="space-y-0 pb-8"
                    hidePagination={true}
                    hideTopFilters={true}
                    showShare={false}
                    serverPage={page}
                    onServerPageChange={handleServerPageChange}
                    onPrefetchAdjacentPages={handlePrefetchAdjacentPages}
                    currentViewingShotId={currentShotId || undefined}
                    onCreateShot={handleCreateShot}
                />
                </>
            )}
            {paginatedData.items.length === 0 && !isLoading && (
                <div className="flex-1 flex items-center justify-center text-zinc-500">
                    No generations found for this project.
                </div>
            )}
        </div>
        </div> {/* Close inner wrapper with delayed pointer events */}
      </div>
      
      {/* Image Generation Modal */}
      <ImageGenerationModal
        isOpen={isGenerationModalOpen}
        onClose={() => setIsGenerationModalOpen(false)}
        initialShotId={currentShotId}
      />
    </>
  );
};

// Memoize GenerationsPane - it has no props so a simple memo is sufficient
export const GenerationsPane = React.memo(GenerationsPaneComponent);

export default GenerationsPane;