import React, { useState, useEffect } from 'react';
import { useProject } from "@/shared/contexts/ProjectContext";
import { useListGenerations } from '@/tools/image-generation/hooks/useGenerations';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ArrowUpIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ImageGallery from '@/shared/components/ImageGallery';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { useListShots, useAddImageToShot } from '@/shared/hooks/useShots';
import { toast } from 'sonner';
import { usePanes } from '@/shared/contexts/PanesContext';

const DEFAULT_PANE_HEIGHT = 350;
const GENERATIONS_PER_PAGE = 24;

const GenerationsPane: React.FC = () => {
  const { selectedProjectId } = useProject();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useListGenerations(selectedProjectId, page, GENERATIONS_PER_PAGE);
  const { data: shotsData } = useListShots(selectedProjectId);
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const addImageToShotMutation = useAddImageToShot();

  const {
    isGenerationsPaneLocked,
    setIsGenerationsPaneLocked,
    generationsPaneHeight,
  } = usePanes();

  const { isLocked, toggleLock, hotZoneProps, paneProps, transformClass } = useSlidingPane({
    side: 'bottom',
    onLockStateChange: setIsGenerationsPaneLocked,
  });

  useEffect(() => {
    // If there is no "last affected shot" but there are shots available,
    // default to the first shot in the list (which is the most recent).
    if (!lastAffectedShotId && shotsData && shotsData.length > 0) {
      setLastAffectedShotId(shotsData[0].id);
    }
  }, [lastAffectedShotId, shotsData, setLastAffectedShotId]);

  const handleNextPage = () => {
    if (data && page < data.totalPages) {
      setPage(page + 1);
    }
  };

  const handlePrevPage = () => {
    setPage(prev => Math.max(1, prev - 1));
  };

  const handleDeleteGeneration = (id: string) => {
    console.log(`TODO: Implement delete for generation ${id}`);
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
          toast.success("Image added to shot");
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

  const constructImageUrl = (url: string | undefined | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    // Use environment variable for the base URL, default to empty string if not set
    const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';
    return `${baseUrl}${url}`;
  };

  return (
    <>
      {!isLocked && (
        <div
          {...hotZoneProps}
          className="fixed bottom-0 left-0 w-full h-[24px] bg-transparent z-[101]"
        />
      )}

      <div
        {...paneProps}
        style={{ height: `${generationsPaneHeight}px` }}
        className={cn(
          `fixed bottom-0 left-0 w-full bg-zinc-900/95 border-t border-zinc-700 shadow-xl z-[100] transform transition-transform duration-300 ease-in-out flex flex-col`,
          transformClass
        )}
      >
        <div className="p-2 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-200 ml-2">Generations</h2>
            <div className="flex items-center space-x-2">
                {/* Pagination */}
                <span className="text-sm text-zinc-400">
                    Page {data?.page || 1} of {data?.totalPages || 1}
                </span>
                <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={page === 1 || isLoading}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!data || page >= data.totalPages || isLoading}>
                    <ChevronRight className="h-4 w-4" />
                </Button>

                {/* Actions */}
                <Button asChild variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100" onClick={() => {
                    if (isLocked) {
                        toggleLock();
                    }
                }}>
                    <Link to="/generations">
                        View All
                        <ArrowUpIcon className="h-4 w-4 ml-1" />
                    </Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={toggleLock} className="text-zinc-400 hover:text-zinc-100">
                    {isLocked ? <UnlockIcon className="h-4 w-4 mr-1" /> : <LockIcon className="h-4 w-4 mr-1" />}
                    {isLocked ? 'Unlock' : 'Lock'}
                </Button>
            </div>
        </div>
        <div className="flex-grow p-3 overflow-y-auto">
            {isLoading && <p className="text-white text-center">Loading generations...</p>}
            {error && <p className="text-red-500 text-center">Error: {error.message}</p>}
            {data && data.items.length > 0 && (
                <ImageGallery
                    images={data.items.map(gen => ({ 
                        ...gen, 
                        url: constructImageUrl(gen.location), 
                        isVideo: gen.type?.includes('video') 
                    }))}
                    onDelete={handleDeleteGeneration}
                    allShots={shotsData || []}
                    lastShotId={lastAffectedShotId || undefined}
                    onAddToLastShot={handleAddToShot}
                />
            )}
            {data && data.items.length === 0 && !isLoading && (
                <div className="flex items-center justify-center h-full text-zinc-500">
                    No generations found for this project.
                </div>
            )}
        </div>
      </div>
    </>
  );
};

export default GenerationsPane; 