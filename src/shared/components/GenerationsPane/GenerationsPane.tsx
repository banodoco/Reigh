import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import { useProject } from "@/shared/contexts/ProjectContext";
import { useGenerations, useDeleteGeneration, GenerationsPaginatedResponse } from '@/shared/hooks/useGenerations';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ArrowUpIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { useListShots, useAddImageToShot, usePositionExistingGenerationInShot } from '@/shared/hooks/useShots';
import { toast } from 'sonner';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';

const DEFAULT_PANE_HEIGHT = 350;
const GENERATIONS_PER_PAGE = 45;

export const GenerationsPane: React.FC = () => {
  const { selectedProjectId } = useProject();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data: shotsData } = useListShots(selectedProjectId);
  const { currentShotId } = useCurrentShot();
  const [selectedShotFilter, setSelectedShotFilter] = useState<string>('all');
  const [excludePositioned, setExcludePositioned] = useState(true); // Default checked
  
  // Set shot filter to current shot when it changes
  useEffect(() => {
    if (currentShotId && shotsData?.some(shot => shot.id === currentShotId)) {
      setSelectedShotFilter(currentShotId);
    }
  }, [currentShotId, shotsData]);
  
  const { data: generationsResponse, isLoading, error } = useGenerations(
    selectedProjectId, 
    page, 
    GENERATIONS_PER_PAGE,
    true,
    {
      toolType: undefined, // No tool filtering in generations pane
      mediaType: 'image',   // Only show images in the pane
      shotId: selectedShotFilter === 'all' ? undefined : selectedShotFilter,
      excludePositioned: selectedShotFilter !== 'all' ? excludePositioned : undefined
    }
  );

  // Log every render with item count & page for loop detection
  useRenderLogger('GenerationsPane', { page, totalItems: generationsResponse?.total });

  const lastAffectedShotContext = useContext(LastAffectedShotContext);
  const { lastAffectedShotId = null, setLastAffectedShotId = () => {} } = lastAffectedShotContext || {};
  const addImageToShotMutation = useAddImageToShot();
  const positionExistingGenerationMutation = usePositionExistingGenerationInShot();
  const deleteGenerationMutation = useDeleteGeneration();

  // Server-side pagination - data is already paginated
  const paginatedData = useMemo(() => {
    if (!generationsResponse) return { items: [], totalPages: 0, currentPage: page };
    
    const totalPages = Math.ceil(generationsResponse.total / GENERATIONS_PER_PAGE);
    
    return { 
      items: generationsResponse.items, 
      totalPages, 
      currentPage: page 
    };
  }, [generationsResponse, page]);

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

  // Reset to page 1 when project, shot filter, or position filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedProjectId, selectedShotFilter, excludePositioned]);

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
    
    // Check if we're trying to add to the same shot that's currently filtered with excludePositioned enabled
    const shouldPositionExisting = selectedShotFilter !== 'all' && 
                                  selectedShotFilter === lastAffectedShotId && 
                                  excludePositioned;
    
    return new Promise<boolean>((resolve) => {
      if (shouldPositionExisting) {
        // Use the position existing function for items in the filtered list
        positionExistingGenerationMutation.mutate({
          shot_id: lastAffectedShotId,
          generation_id: generationId,
          project_id: selectedProjectId!,
        }, {
          onSuccess: () => {          
            resolve(true);
          },
          onError: (error) => {
            toast.error("Failed to position image in shot", {
              description: error.message,
            });
            resolve(false);
          }
        });
      } else {
        // Use the regular add function
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
      }
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
          `fixed bottom-0 bg-zinc-900/95 border-t border-zinc-700 shadow-xl z-[100] transform transition-all duration-300 ease-smooth flex flex-col`,
          transformClass
        )}
      >
        <div className="p-2 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <h2 className="text-xl font-semibold text-zinc-200 ml-2">Generations</h2>
                {/* Shot filter */}
                <Select value={selectedShotFilter} onValueChange={setSelectedShotFilter}>
                    <SelectTrigger className="w-[180px] h-8 text-xs bg-zinc-800 border-zinc-700 text-white">
                        <SelectValue placeholder="Filter by shot..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Shots</SelectItem>
                        {shotsData?.map(shot => (
                            <SelectItem key={shot.id} value={shot.id}>
                                {shot.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {/* Position filter checkbox - only show when a specific shot is selected */}
                {selectedShotFilter !== 'all' && (
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="exclude-positioned"
                            checked={excludePositioned}
                            onCheckedChange={(checked) => setExcludePositioned(!!checked)}
                            className="border-zinc-600 data-[state=checked]:bg-zinc-600"
                        />
                        <Label 
                            htmlFor="exclude-positioned" 
                            className="text-xs text-zinc-300 cursor-pointer"
                        >
                            Exclude items with a position
                        </Label>
                    </div>
                )}
            </div>
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
                <div className="grid grid-cols-2 c-sm:grid-cols-3 c-md:grid-cols-4 c-lg:grid-cols-5 c-xl:grid-cols-6 gap-4">
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
                    totalCount={generationsResponse?.total || paginatedData.items.length}
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