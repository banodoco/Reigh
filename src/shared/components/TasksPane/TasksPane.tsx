import React from 'react';
import TaskList from './TaskList';
import { cn } from '@/shared/lib/utils'; // For conditional classnames
import { Button } from '@/shared/components/ui/button'; // For the lock button
import { LockIcon, UnlockIcon } from 'lucide-react'; // Example icons
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';

const TasksPane: React.FC = () => {
  const {
    isGenerationsPaneLocked,
    generationsPaneHeight,
    setIsTasksPaneLocked,
    tasksPaneWidth,
  } = usePanes();

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass } = useSlidingPane({
    side: 'right',
    onLockStateChange: setIsTasksPaneLocked,
  });

  const bottomOffset = isGenerationsPaneLocked ? generationsPaneHeight : 0;

  return (
    <>
      <PaneControlTab
        side="right"
        isLocked={isLocked}
        isOpen={isOpen}
        toggleLock={toggleLock}
        openPane={openPane}
        paneDimension={tasksPaneWidth}
        bottomOffset={isGenerationsPaneLocked ? generationsPaneHeight : 0}
      />
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: `${bottomOffset}px`,
          width: `${tasksPaneWidth}px`,
          zIndex: 60, // On top of header (z-50)
          transition: 'bottom 300ms ease-in-out',
        }}
      >
        {/* Tasks Pane */}
        <div
          {...paneProps}
          className={cn(
            'pointer-events-auto absolute top-0 right-0 h-full w-full bg-zinc-900/95 border-l border-zinc-600 shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col',
            transformClass
          )}
        >
          <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold text-zinc-200 ml-2">Tasks</h2>
          </div>
          <div className="flex-grow overflow-y-auto">
            <TaskList />
          </div>
        </div>
      </div>
    </>
  );
};

export default TasksPane; 