import React, { useState, useEffect, useMemo } from 'react';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import ShotGroup from './ShotGroup';
import NewGroupDropZone from './NewGroupDropZone';
import { useListShots } from '@/shared/hooks/useShots';
import { useProject } from "@/shared/contexts/ProjectContext";
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { ArrowRightIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePanes } from '@/shared/contexts/PanesContext';
import CreateShotModal from '@/shared/components/CreateShotModal';
import { useCreateShot, useHandleExternalImageDrop } from '@/shared/hooks/useShots';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useIsMobile } from '@/shared/hooks/use-mobile';

export const ShotsPane: React.FC = () => {
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading, error } = useListShots(selectedProjectId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Pagination state
  const pageSize = 5;
  const [currentPage, setCurrentPage] = useState(1);

  useRenderLogger('ShotsPane', { shotsCount: shots?.length, currentPage });
  
  // Filter shots to only include images with positions (similar to ShotEditor.tsx approach)
  const filteredShots = useMemo(() => {
    if (!shots) return [];
    
    return shots.map(shot => ({
      ...shot,
      images: (shot.images || []).filter(img => 
        (img as any).position !== null && (img as any).position !== undefined
      )
    }));
  }, [shots]);
  
  // Adjust currentPage if shots length changes (e.g., after create/delete)
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((filteredShots?.length ?? 0) / pageSize));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredShots?.length]);
  
  const createShotMutation = useCreateShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const navigate = useNavigate();
  const { setCurrentShotId } = useCurrentShot();
  const isMobile = useIsMobile();

  const {
    isGenerationsPaneLocked,
    generationsPaneHeight,
    isShotsPaneLocked,
    setIsShotsPaneLocked,
    shotsPaneWidth,
  } = usePanes();

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave } = useSlidingPane({
    side: 'left',
    isLocked: isShotsPaneLocked,
    onToggleLock: () => setIsShotsPaneLocked(!isShotsPaneLocked),
  });

  const handleCreateShot = async (shotName: string, files: File[]) => {
    if (!selectedProjectId) {
      alert("Please select a project first.");
      return;
    }

    let createdShotId: string | null = null;

    if (files.length > 0) {
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: files,
        targetShotId: null,
        currentProjectQueryKey: selectedProjectId,
        currentShotCount: shots?.length ?? 0
      });
      createdShotId = result?.shotId || null;
    } else {
      const newShotResult = await createShotMutation.mutateAsync({ name: shotName, projectId: selectedProjectId });
      createdShotId = newShotResult?.shot?.id || null;
    }

    setIsCreateModalOpen(false);

    // If a shot was successfully created, we purposely *do not* auto-navigate or
    // switch the current shot here. This keeps the user in their current
    // context (e.g. continuing to work on another shot or different tool)
    // and simply lets the list refresh to show the new shot.
    //
    // NOTE: Users can still click the new shot manually or use the "See All"
    // button to jump to the full Travel Between Images editor when they
    // actually want to open it.
    //
    // setCurrentShotId(createdShotId);
    // navigate('/tools/travel-between-images', { state: { fromShotClick: true } });
  };

  const bottomOffset = isGenerationsPaneLocked ? generationsPaneHeight : 0;

  return (
    <>
      <PaneControlTab
        side="left"
        isLocked={isLocked}
        isOpen={isOpen}
        toggleLock={toggleLock}
        openPane={openPane}
        paneDimension={shotsPaneWidth}
        bottomOffset={isGenerationsPaneLocked ? generationsPaneHeight : 0}
        handlePaneEnter={handlePaneEnter}
        handlePaneLeave={handlePaneLeave}
        thirdButton={{
          onClick: () => {
            setIsShotsPaneLocked(false); // Unlock and close the pane immediately
            setCurrentShotId(null);
            navigate('/tools/travel-between-images'); // Then navigate to travel between images

            if (isMobile) {
              window.dispatchEvent(new CustomEvent('mobilePaneOpen', { detail: { side: null } }));
            }
          },
          ariaLabel: "Open Travel Between Images tool"
        }}
      />
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${shotsPaneWidth}px`,
          zIndex: 60,
        }}
      >
        <div
          {...paneProps}
          className={cn(
            `pointer-events-auto absolute top-0 left-0 h-full w-full border-2 border-r shadow-xl transform transition-transform duration-300 ease-smooth flex flex-col bg-zinc-900/95 border-zinc-700`,
            transformClass
          )}
        >
          <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
            <h2 className="text-xl font-semibold text-zinc-200 ml-2">Shots</h2>
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 active:bg-zinc-600/60"
                onClick={() => {
                  toggleLock(false);
                  setCurrentShotId(null);
                  navigate('/tools/travel-between-images');

                  if (isMobile) {
                    window.dispatchEvent(new CustomEvent('mobilePaneOpen', { detail: { side: null } }));
                  }
                }}
              >
                See All
                <ArrowRightIcon className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-4 px-3 py-4 flex-grow overflow-y-auto scrollbar-hide">
            <NewGroupDropZone onZoneClick={() => setIsCreateModalOpen(true)} />
            {isLoading && (
              Array.from({ length: pageSize }).map((_, idx) => (
                <Skeleton key={idx} className="h-24 rounded-lg bg-zinc-700/60" />
              ))
            )}
            {error && <p className="text-red-500">Error loading shots: {error.message}</p>}
            {filteredShots && filteredShots
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map(shot => <ShotGroup key={shot.id} shot={shot} />)}
          </div>
          {/* Pagination Controls */}
          {filteredShots && filteredShots.length > pageSize && (
            <div className="p-2 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 active:bg-zinc-600/60"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-zinc-400 text-sm">
                Page {currentPage} of {Math.ceil(filteredShots.length / pageSize)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 active:bg-zinc-600/60"
                disabled={currentPage === Math.ceil(filteredShots.length / pageSize)}
                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredShots.length / pageSize), p + 1))}
              >
                Next
              </Button>
            </div>
          )}
          <CreateShotModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSubmit={handleCreateShot}
            isLoading={createShotMutation.isPending || handleExternalImageDropMutation.isPending}
            defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
          />
        </div>
      </div>
    </>
  );
};

export default React.memo(ShotsPane); 