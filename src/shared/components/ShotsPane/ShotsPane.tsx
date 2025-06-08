import React from 'react';
import ShotGroup from './ShotGroup';
import NewGroupDropZone from './NewGroupDropZone';
import { useListShots } from '@/shared/hooks/useShots';
import { useProject } from "@/shared/contexts/ProjectContext";
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { LockIcon, UnlockIcon, ArrowRightIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePanes } from '@/shared/contexts/PanesContext';

const ShotsPane: React.FC = () => {
  const { selectedProjectId } = useProject();
  const { data: shots, isLoading, error } = useListShots(selectedProjectId);

  const {
    isGenerationsPaneLocked,
    generationsPaneHeight,
    setIsShotsPaneLocked,
    shotsPaneWidth,
  } = usePanes();

  const { isLocked, isOpen, toggleLock, hotZoneProps, paneProps, transformClass } = useSlidingPane({
    side: 'left',
    onLockStateChange: setIsShotsPaneLocked,
  });

  const bottomOffset = isGenerationsPaneLocked ? generationsPaneHeight : 0;

  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: `${bottomOffset}px`,
        width: `${shotsPaneWidth}px`,
        zIndex: 60, // On top of header (z-50)
        transition: 'bottom 300ms ease-in-out',
      }}
    >
      {!isLocked && (
        <div
          {...hotZoneProps}
          className="absolute left-0 top-0 h-full w-[24px] bg-transparent pointer-events-auto"
        />
      )}

      <div
        {...paneProps}
        className={cn(
          `pointer-events-auto absolute top-0 left-0 h-full w-full bg-zinc-900/95 border-r border-zinc-700 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col`,
          transformClass
        )}
      >
        <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-zinc-200 ml-2">Shots</h2>
          <div className="flex items-center">
            <Button asChild variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100" onClick={() => {
                if (isLocked) {
                    toggleLock();
                }
            }}>
              <Link to="/shots">
                See All
                <ArrowRightIcon className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleLock} className="text-zinc-400 hover:text-zinc-100">
                {isLocked ? <LockIcon className="h-4 w-4 mr-1" /> : <UnlockIcon className="h-4 w-4 mr-1" />}
                {isLocked ? 'Unlock' : 'Lock'}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-4 px-3 py-4 flex-grow overflow-y-auto scrollbar-hide">
          <NewGroupDropZone />
          {isLoading && <p className="text-white">Loading shots...</p>}
          {error && <p className="text-red-500">Error loading shots: {error.message}</p>}
          {shots && shots.map(shot => <ShotGroup key={shot.id} shot={shot} />)}
        </div>
      </div>
    </div>
  );
};

export default ShotsPane; 