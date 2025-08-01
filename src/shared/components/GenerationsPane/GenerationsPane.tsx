import React, { useEffect } from 'react';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, Square, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { ShotFilter } from '@/shared/components/ShotFilter';
import { useGenerationsPageLogic } from '@/shared/hooks/useGenerationsPageLogic';
import { useIsMobile } from '@/shared/hooks/use-mobile';

const DEFAULT_PANE_HEIGHT = 350;
const GENERATIONS_PER_PAGE = 18;

export const GenerationsPane: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we're on the generations page
  const isOnGenerationsPage = location.pathname === '/generations';
  
  const isMobile = useIsMobile();

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
    mediaType: 'image'
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

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave } = useSlidingPane({
    side: 'bottom',
    isLocked: isGenerationsPaneLocked,
    onToggleLock: () => setIsGenerationsPaneLocked(!isGenerationsPaneLocked),
  });

  // Listen for custom event to open the pane (used on mobile from other components)
  useEffect(() => {
    const handleOpenGenerationsPane = () => {
      openPane();
    };

    window.addEventListener('openGenerationsPane', handleOpenGenerationsPane);
    return () => window.removeEventListener('openGenerationsPane', handleOpenGenerationsPane);
  }, [openPane]);

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

  const handleNextPage = () => {
    if (page < paginatedData.totalPages) {
      handleServerPageChange(page + 1);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      handleServerPageChange(page - 1);
    }
  };

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
        <div className="p-2 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <h2 className="text-xl font-semibold text-zinc-200 ml-2">Generations</h2>
                
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
                />
            </div>
            <div className="flex items-center space-x-2">
                {/* Actions - hide when on generations page */}
                {!isOnGenerationsPage && (
                  <>
                    <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={page === 1 || isLoading}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleNextPage} disabled={page >= paginatedData.totalPages || isLoading}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
            </div>
        </div>
        <div className="flex-grow px-3 pt-3 overflow-y-auto">
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
                    columnsPerRow={6}
                    initialMediaTypeFilter="image"
                    initialStarredFilter={false}
                    reducedSpacing={true}
                />
            )}
            {paginatedData.items.length === 0 && !isLoading && (
                <div className="flex items-center justify-center h-full text-zinc-500">
                    No generations found for this project.
                </div>
            )}
        </div>
      </div>
    </>
  );
};

export default React.memo(GenerationsPane); 