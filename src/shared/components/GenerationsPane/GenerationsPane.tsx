import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useProject } from "@/shared/contexts/ProjectContext";
import { useGenerations, useDeleteGeneration } from '@/shared/hooks/useGenerations';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ArrowUpIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { useListShots, useAddImageToShot } from '@/shared/hooks/useShots';
import { toast } from 'sonner';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';

const DEFAULT_PANE_HEIGHT = 350;
const GENERATIONS_PER_PAGE = 45;

export const GenerationsPane: React.FC = () => {
  const { selectedProjectId } = useProject();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data: allGenerations, isLoading, error } = useGenerations(selectedProjectId);
  const { data: shotsData } = useListShots(selectedProjectId);
  const lastAffectedShotContext = useContext(LastAffectedShotContext);
  const { lastAffectedShotId = null, setLastAffectedShotId = () => {} } = lastAffectedShotContext || {};
  const addImageToShotMutation = useAddImageToShot();
  const deleteGenerationMutation = useDeleteGeneration();

  // Client-side pagination
  const paginatedData = useMemo(() => {
    if (!allGenerations) return { items: [], totalPages: 0, currentPage: page };
    
    const startIndex = (page - 1) * GENERATIONS_PER_PAGE;
    const endIndex = startIndex + GENERATIONS_PER_PAGE;
    const items = allGenerations.slice(startIndex, endIndex);
    const totalPages = Math.ceil(allGenerations.length / GENERATIONS_PER_PAGE);
    
    return { items, totalPages, currentPage: page };
  }, [allGenerations, page]);

  const {
    isGenerationsPaneLocked,
    setIsGenerationsPaneLocked,
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

  useEffect(() => {
    // If there is no "last affected shot" but there are shots available,
    // default to the first shot in the list (which is the most recent).
    if (!lastAffectedShotId && shotsData && shotsData.length > 0) {
      setLastAffectedShotId(shotsData[0].id);
    }
  }, [lastAffectedShotId, shotsData, setLastAffectedShotId]);

  // Reset to page 1 when project changes
  useEffect(() => {
    setPage(1);
  }, [selectedProjectId]);

  const handleNextPage = () => {
    if (page < paginatedData.totalPages) {
      setPage(page + 1);
    }
  };

  const handlePrevPage = () => {
    setPage(prev => Math.max(1, prev - 1));
  };

  const handleDeleteGeneration = (id: string) => {
    deleteGenerationMutation.mutate(id);
  };

  const handleAddToShot = (generationId: string, imageUrl?: string) => {
    if (!lastAffectedShotId) {
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      addImageToShotMutation.mutate({
        shot_id: lastAffectedShotId,
        generation_id: generationId,
        project_id: selectedProjectId!,
      }, {
        onSuccess: () => {          
          resolve(true);
        },
        onError: (error) => {
          toast.error("Failed to add image to shot", {
            description: error.message,
          });
          resolve(false);
        }
      });
    });
  };

  return (
    <>
      <PaneControlTab
        side="bottom"
        isLocked={isLocked}
        isOpen={isOpen}
        toggleLock={toggleLock}
        openPane={openPane}
        paneDimension={generationsPaneHeight}
        handlePaneEnter={handlePaneEnter}
        handlePaneLeave={handlePaneLeave}
      />
      <div
        {...paneProps}
        style={{
          height: `${generationsPaneHeight}px`,
          left: isShotsPaneLocked ? `${shotsPaneWidth}px` : 0,
          right: isTasksPaneLocked ? `${tasksPaneWidth}px` : 0,
        }}
        className={cn(
          `fixed bottom-0 bg-zinc-900/95 border-t border-zinc-700 shadow-xl z-[100] transform transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] flex flex-col`,
          transformClass
        )}
      >
        <div className="p-2 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-200 ml-2">Generations</h2>
            <div className="flex items-center space-x-2">
                {/* Pagination */}
                <span className="text-sm text-white">
                    Page {paginatedData.currentPage} of {paginatedData.totalPages || 1}
                </span>
                <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={page === 1 || isLoading}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleNextPage} disabled={page >= paginatedData.totalPages || isLoading}>
                    <ChevronRight className="h-4 w-4" />
                </Button>

                {/* Actions */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-white hover:text-white/80"
                  onClick={() => {
                    toggleLock(false); // Unlock the pane
                    navigate('/tools/image-generation?scrollToGallery=true'); // Navigate to image generation tool page and scroll to gallery
                  }}
                >
                  View All
                  <ArrowUpIcon className="h-4 w-4 ml-1" />
                </Button>
            </div>
        </div>
        <div className="flex-grow p-3 overflow-y-auto">
            {isLoading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {Array.from({ length: 12 }).map((_, idx) => (
                        <Skeleton key={idx} className="w-full aspect-square rounded-lg bg-zinc-700/60" />
                    ))}
                </div>
            )}
            {error && <p className="text-red-500 text-center">Error: {error.message}</p>}
            {paginatedData.items.length > 0 && (
                <ImageGallery
                    images={paginatedData.items}
                    onDelete={handleDeleteGeneration}
                    isDeleting={deleteGenerationMutation.isPending ? deleteGenerationMutation.variables as string : null}
                    allShots={shotsData || []}
                    lastShotId={lastAffectedShotId || undefined}
                    onAddToLastShot={handleAddToShot}
                    offset={(page - 1) * GENERATIONS_PER_PAGE}
                    totalCount={allGenerations?.length || paginatedData.items.length}
                    whiteText
                    columnsPerRow={6}
                    initialMediaTypeFilter="image"
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