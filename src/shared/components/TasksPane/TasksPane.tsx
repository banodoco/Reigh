import React from 'react';
import TaskList from './TaskList';
import { cn } from '@/shared/lib/utils'; // For conditional classnames
import { Button } from '@/shared/components/ui/button'; // For the lock button
import { LockIcon, UnlockIcon } from 'lucide-react'; // Example icons
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';

interface TasksPaneProps {
  onLockStateChange?: (isLockedAndOpen: boolean, currentWidth: number) => void;
  paneWidth?: number;
}

const DEFAULT_PANE_WIDTH = 350;

const TasksPane: React.FC<TasksPaneProps> = ({ onLockStateChange, paneWidth = DEFAULT_PANE_WIDTH }) => {
  const { isLocked, isOpen, toggleLock, hotZoneProps, paneProps, transformClass } = useSlidingPane({
    side: 'right',
    onLockStateChange: (isLocked) => onLockStateChange?.(isLocked, paneWidth),
  });

  return (
    <>
      {!isLocked && (
        <div
          {...hotZoneProps}
          className="fixed top-0 right-0 h-full w-[24px] bg-transparent z-40 pointer-events-auto"
          style={{ opacity: 0 }} // Invisible but interactable
        />
      )}

      {/* Tasks Pane */}
      <div
        {...paneProps}
        style={{ width: `${paneWidth}px` }}
        className={cn(
          'fixed top-0 right-0 h-full bg-zinc-900/95 border-l border-zinc-600 shadow-xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col',
          transformClass
        )}
      >
        <div className="p-2 border-b border-zinc-800">
          <Button variant="ghost" size="sm" onClick={toggleLock} className="text-zinc-400 hover:text-zinc-100">
            {isLocked ? <LockIcon className="h-4 w-4 mr-1" /> : <UnlockIcon className="h-4 w-4 mr-1" />}
            {isLocked ? 'Unlock' : 'Lock'}
          </Button>
        </div>
        <div className="flex-grow overflow-y-auto">
          <TaskList />
        </div>
      </div>
    </>
  );
};

export default TasksPane; 