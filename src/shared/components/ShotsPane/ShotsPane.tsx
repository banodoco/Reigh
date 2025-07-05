import React, { useState, useEffect } from 'react';
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
import CreateShotModal from '@/tools/travel-between-images/components/CreateShotModal';
import { useCreateShot, useHandleExternalImageDrop } from '@/shared/hooks/useShots';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import PaneControlTab from '../PaneControlTab';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useIsMobile } from '@/shared/hooks/use-mobile';

const ShotsPane: React.FC = () => {
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading, error } = useListShots(selectedProjectId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);
  // Pagination state
  const pageSize = 5;
  const [currentPage, setCurrentPage] = useState(1);

  // Adjust currentPage if shots length changes (e.g., after create/delete)
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((shots?.length ?? 0) / pageSize));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [shots?.length]);
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
      
      // Trigger flash effect for successful image drop
      if (createdShotId) {
        setFlashEffect(true);
        setTimeout(() => setFlashEffect(false), 600); // Flash for 600ms
      }
    } else {
      const newShotResult = await createShotMutation.mutateAsync({ name: shotName, projectId: selectedProjectId });
      createdShotId = newShotResult?.shot?.id || null;
    }

    setIsCreateModalOpen(false);

    if (createdShotId) {
      setCurrentShotId(createdShotId);
      navigate('/tools/travel-between-images', { state: { fromShotClick: true } });
    }
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
            `pointer-events-auto absolute top-0 left-0 h-full w-full border-2 border-r shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col`,
            transformClass,
            flashEffect 
              ? "bg-green-400/20 border-green-400 shadow-green-400/50 animate-pulse" 
              : "bg-zinc-900/95 border-zinc-700"
          )}
        >
          <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
            <h2 className="text-xl font-semibold text-zinc-200 ml-2">Shots</h2>
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-zinc-400 hover:text-zinc-100"
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
            {shots && shots
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map(shot => <ShotGroup key={shot.id} shot={shot} />)}
          </div>
          {/* Pagination Controls */}
          {shots && shots.length > pageSize && (
            <div className="p-2 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-zinc-400 text-sm">
                Page {currentPage} of {Math.ceil(shots.length / pageSize)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === Math.ceil(shots.length / pageSize)}
                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(shots.length / pageSize), p + 1))}
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

export default ShotsPane; 