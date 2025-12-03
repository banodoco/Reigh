import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { smartPreloadImages, initializePrefetchOperations, smartCleanupOldPages, triggerImageGarbageCollection } from '@/shared/hooks/useAdjacentPagePreloading';
import { useQueryClient } from '@tanstack/react-query';
import { fetchGenerations } from '@/shared/hooks/useGenerations';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, Square, ChevronLeft, ChevronRight, Star, Eye, Sparkles } from 'lucide-react';
import { ImageGenerationModal } from '@/shared/components/ImageGenerationModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { ShotFilter } from '@/shared/components/ShotFilter';
import { useGenerationsPageLogic } from '@/shared/hooks/useGenerationsPageLogic';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { performanceMonitoredTimeout, measureAsync } from '@/shared/lib/performanceUtils';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useProject } from '@/shared/contexts/ProjectContext';

import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { PANE_CONFIG } from '@/shared/config/panes';
const GENERATIONS_PER_PAGE = 18;

const GenerationsPaneComponent: React.FC = () => {
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
  
  // Check if we're on the generations page or image generation tool page
  const isOnGenerationsPage = location.pathname === '/generations';
  const isOnImageGenerationPage = location.pathname === '/tools/image-generation';
  const isOnVideoTravelPage = location.pathname === '/tools/travel-between-images';
  
  // Get current project's aspect ratio
  const { selectedProjectId, projects } = useProject();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  const shouldEnableDataLoading = isOnGenerationsPage || ((isOnImageGenerationPage || isOnVideoTravelPage) && isGenerationsPaneOpen);
  
  const isMobile = useIsMobile();
  const { currentShotId } = useCurrentShot();

  // Media type filter state
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('image');
  
  // Dropdown states to prevent unwanted opening
  const [shotFilterOpen, setShotFilterOpen] = useState(false);
  const [mediaTypeFilterOpen, setMediaTypeFilterOpen] = useState(false);
  
  // Image generation modal state
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);

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
    setSelectedShotFilter,
    setExcludePositioned,
    setStarredOnly,
    handleServerPageChange,
    handleDeleteGeneration,
    handleAddToShot,
    handleAddToShotWithoutPosition,
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

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave } = useSlidingPane({
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
    if ((isOnGenerationsPage || isOnImageGenerationPage) && (isOpen || isLocked)) {
      setIsGenerationsPaneLocked(false);
    }
  }, [isOnGenerationsPage, isOnImageGenerationPage, isOpen, isLocked, setIsGenerationsPaneLocked]);

  return (
    <>
      {/* Hide the control tab when on the generations page or image generation tool page */}
      {!isOnGenerationsPage && !isOnImageGenerationPage && (
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
              setIsGenerationsPaneLocked(false); // Unlock and close the pane immediately
              navigate('/tools/image-generation?formCollapsed=true'); // Navigate with collapsed form parameter
            },
            ariaLabel: "Open Image Generation Tool"
          }}
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
          <div className="p-2 border-b border-zinc-800">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-light text-zinc-200 ml-2">Generations</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsGenerationModalOpen(true)}
                    className="h-7 px-2 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-md shadow-sm"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    <span>Create</span>
                  </Button>
                </div>
                <div className="flex items-center space-x-4 mr-2">
                    {/* Star Filter */}
                    <div 
                      className={cn(
                        "flex items-center space-x-2 transition-all duration-200",
                        isInteractionDisabled && "pointer-events-none opacity-70"
                      )}
                    >
                      <Checkbox 
                        id="starred-filter-pane"
                        checked={starredOnly}
                        onCheckedChange={(checked) => setStarredOnly(!!checked)}
                        className="border-zinc-600 data-[state=checked]:bg-zinc-600"
                      />
                      <Label 
                        htmlFor="starred-filter-pane" 
                        className="text-xs text-zinc-400 cursor-pointer flex items-center space-x-1"
                      >
                        <Star className="h-3 w-3" />
                        <span>Starred</span>
                      </Label>
                    </div>

                    {/* Media Type Filter */}
                    <div 
                      className={cn(
                        "flex items-center space-x-2 transition-all duration-200",
                        isInteractionDisabled && "pointer-events-none opacity-70"
                      )}
                    >
                      <span className="text-xs text-zinc-400">Type:</span>
                      <Select 
                        value={mediaTypeFilter} 
                        onValueChange={(value: 'all' | 'image' | 'video') => setMediaTypeFilter(value)}
                        open={mediaTypeFilterOpen}
                        onOpenChange={(open) => {
                          // Prevent dropdown from staying open during interaction-disabled period
                          if (isInteractionDisabled && open) {
                            setMediaTypeFilterOpen(false);
                            return;
                          }
                          setMediaTypeFilterOpen(open);
                        }}
                      >
                        <SelectTrigger className="w-[80px] h-8 text-xs bg-zinc-800 border-zinc-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent ref={mediaTypeContentRef}>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="image">Images</SelectItem>
                          <SelectItem value="video">Videos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                </div>
            </div>
            
            {/* Shot filter + Pagination row */}
            <div className="mt-2 mx-2 flex items-start justify-between">
                <div 
                  className={cn(
                    "flex items-center gap-2",
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
                    triggerWidth="w-[110px] sm:w-[170px]"
                    isMobile={isMobile}
                    contentRef={shotFilterContentRef}
                    className="flex flex-col space-y-2"
                    open={shotFilterOpen}
                    onOpenChange={(open) => {
                      // Prevent dropdown from staying open during interaction-disabled period
                      if (isInteractionDisabled && open) {
                        setShotFilterOpen(false);
                        return;
                      }
                      setShotFilterOpen(open);
                    }}
                  />
                  
                  {/* Show CTA to toggle between current shot and all images */}
                  {currentShotId && (
                    selectedShotFilter === currentShotId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedShotFilter('all')}
                        className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 whitespace-nowrap"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        <span className="hidden sm:inline">See all images</span>
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedShotFilter(currentShotId)}
                        className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 whitespace-nowrap"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        <span className="hidden sm:inline">View my shot</span>
                      </Button>
                    )
                  )}
                </div>

                {totalCount > GENERATIONS_PER_PAGE && (
                  <div className="flex items-center space-x-1 mt-1">
                    <button
                      onClick={() => handleServerPageChange(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="p-1 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 text-zinc-400" />
                    </button>
                    <span className="text-xs text-zinc-400 min-w-[120px] text-center">
                      {((page - 1) * GENERATIONS_PER_PAGE) + 1}-{Math.min(page * GENERATIONS_PER_PAGE, totalCount)} (out of {totalCount})
                    </span>
                    <button
                      onClick={() => handleServerPageChange(page + 1)}
                      disabled={page * GENERATIONS_PER_PAGE >= totalCount}
                      className="p-1 rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="h-4 w-4 text-zinc-400" />
                    </button>
                  </div>
                )}
            </div>
        </div>
        <div className="flex-grow px-1 sm:px-3 pt-1 sm:pt-3 overflow-y-auto flex flex-col">
            {isLoading && (
                <SkeletonGallery 
                    count={12}
                    columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6, '2xl': 6 }}
                    whiteText={true}
                    showControls={false}
                    projectAspectRatio={projectAspectRatio}
                />
            )}
            {error && <p className="text-red-500 text-center">Error: {error.message}</p>}
            {paginatedData.items.length > 0 && (
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
                    columnsPerRow={6}
                    initialMediaTypeFilter={mediaTypeFilter}
                    onMediaTypeFilterChange={setMediaTypeFilter}
                    initialStarredFilter={starredOnly}
                    onStarredFilterChange={setStarredOnly}
                    reducedSpacing={true}
                    hidePagination={true}
                                    hideTopFilters={true}
                serverPage={page}
                onServerPageChange={handleServerPageChange}
                onPrefetchAdjacentPages={handlePrefetchAdjacentPages}
                currentViewingShotId={currentShotId || undefined}
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
      />
    </>
  );
};

// Memoize GenerationsPane - it has no props so a simple memo is sufficient
export const GenerationsPane = React.memo(GenerationsPaneComponent);

export default GenerationsPane;