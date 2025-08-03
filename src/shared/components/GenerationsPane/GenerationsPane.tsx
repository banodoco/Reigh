import React, { useEffect, useState, useRef } from 'react';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, Square, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { ShotFilter } from '@/shared/components/ShotFilter';
import { useGenerationsPageLogic } from '@/shared/hooks/useGenerationsPageLogic';
import { useIsMobile } from '@/shared/hooks/use-mobile';
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

export const GenerationsPane: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we're on the generations page
  const isOnGenerationsPage = location.pathname === '/generations';
  
  const isMobile = useIsMobile();

  // Media type filter state
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('image');
  
  // Starred filter state
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  
  // Dropdown states to prevent unwanted opening
  const [shotFilterOpen, setShotFilterOpen] = useState(false);
  const [mediaTypeFilterOpen, setMediaTypeFilterOpen] = useState(false);

  // Use the generalized logic
  const {
    selectedProjectId,
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
    setSelectedShotFilter,
    setExcludePositioned,
    handleServerPageChange,
    handleDeleteGeneration,
    handleAddToShot,
  } = useGenerationsPageLogic({
    itemsPerPage: GENERATIONS_PER_PAGE,
    mediaType: mediaTypeFilter
  });

  // Log every render with item count & page for loop detection
  useRenderLogger('GenerationsPane', { page, totalItems: totalCount });



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

  const shotFilterContentRef = useRef<HTMLDivElement>(null);
  const mediaTypeContentRef = useRef<HTMLDivElement>(null);

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave } = useSlidingPane({
    side: 'bottom',
    isLocked: isGenerationsPaneLocked,
    onToggleLock: () => setIsGenerationsPaneLocked(!isGenerationsPaneLocked),
    additionalRefs: [shotFilterContentRef, mediaTypeContentRef],
  });

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

  // Close the pane when navigating to generations page
  useEffect(() => {
    if (isOnGenerationsPage && (isOpen || isLocked)) {
      setIsGenerationsPaneLocked(false);
    }
  }, [isOnGenerationsPage, isOpen, isLocked, setIsGenerationsPaneLocked]);

  return (
    <>
      {/* Hide the control tab when on the generations page */}
      {!isOnGenerationsPage && (
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
              navigate('/generations'); // Then navigate to generations page
            },
            ariaLabel: "Open Generations page"
          }}
        />
      )}
      <div
        {...paneProps}
        style={{
          height: `${generationsPaneHeight}px`,
          left: isShotsPaneLocked ? `${shotsPaneWidth}px` : 0,
          right: isTasksPaneLocked ? `${tasksPaneWidth}px` : 0,
        }}
        className={cn(
          `fixed bottom-0 bg-zinc-900/95 border-t border-zinc-700 shadow-xl z-[100] transform transition-all duration-300 ease-smooth flex flex-col`,
          transformClass
        )}
      >
        <div className="p-2 border-b border-zinc-800">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-200 ml-2">Generations</h2>
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
                        checked={showStarredOnly}
                        onCheckedChange={(checked) => setShowStarredOnly(!!checked)}
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
                    "transition-all duration-200",
                    isInteractionDisabled && "pointer-events-none opacity-70"
                  )}
                >
                  <ShotFilter
                    shots={shotsData || []}
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
                    columns={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
                    whiteText={true}
                    showControls={false}
                />
            )}
            {error && <p className="text-red-500 text-center">Error: {error.message}</p>}
            {paginatedData.items.length > 0 && (
                <ImageGallery
                    images={paginatedData.items}
                    onDelete={handleDeleteGeneration}
                    isDeleting={isDeleting}
                    allShots={shotsData || []}
                    lastShotId={lastAffectedShotId || undefined}
                    onAddToLastShot={handleAddToShot}
                    offset={(page - 1) * GENERATIONS_PER_PAGE}
                    totalCount={totalCount}
                    whiteText
                    columnsPerRow={isMobile ? 3 : 6}
                    initialMediaTypeFilter={mediaTypeFilter}
                    onMediaTypeFilterChange={setMediaTypeFilter}
                    initialStarredFilter={showStarredOnly}
                    onStarredFilterChange={setShowStarredOnly}
                    reducedSpacing={true}
                    hidePagination={true}
                    hideTopFilters={true}
                    serverPage={page}
                    onServerPageChange={handleServerPageChange}
                />
            )}
            {paginatedData.items.length === 0 && !isLoading && (
                <div className="flex-1 flex items-center justify-center text-zinc-500">
                    No generations found for this project.
                </div>
            )}
        </div>
      </div>
    </>
  );
};

export default React.memo(GenerationsPane); 