/**
 * TaskPaneHandle Component
 *
 * Floating handle that appears on the right edge of the lightbox overlay.
 * Allows toggling and locking the tasks pane open/closed.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { LockIcon, UnlockIcon } from 'lucide-react';

export interface TaskPaneHandleProps {
  /** Whether the tasks pane is currently open */
  isOpen: boolean;
  /** Width of the tasks pane in pixels */
  paneWidth: number;
  /** Number of cancellable/active tasks */
  taskCount: number;
  /** Whether the tasks pane is locked open */
  isLocked: boolean;
  /** Callback to toggle pane open/closed */
  onToggle: () => void;
  /** Callback to toggle lock state */
  onToggleLock: () => void;
}

export const TaskPaneHandle: React.FC<TaskPaneHandleProps> = ({
  isOpen,
  paneWidth,
  taskCount,
  isLocked,
  onToggle,
  onToggleLock,
}) => {
  return (
    <div
      className="fixed top-1/2 -translate-y-1/2 flex flex-col items-center p-1 bg-zinc-800/90 backdrop-blur-sm border border-zinc-700 rounded-l-md gap-1 touch-none"
      style={{
        zIndex: 100001,
        pointerEvents: 'auto',
        right: isOpen ? `${paneWidth}px` : 0,
        transition: 'right 300ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
    >
      <TooltipProvider delayDuration={300}>
        {/* Task pane toggle - shows count, click to toggle open/close */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggle();
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
              aria-label={`${taskCount} tasks - click to ${isOpen ? 'close' : 'open'}`}
            >
              <span className="text-xs font-light">{taskCount}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            {`${taskCount} task${taskCount === 1 ? '' : 's'} - click to ${isOpen ? 'close' : 'open'}`}
          </TooltipContent>
        </Tooltip>

        {/* Lock/Unlock button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onPointerUp={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggleLock();
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700"
              aria-label={isLocked ? "Unlock tasks pane" : "Lock tasks pane open"}
            >
              {isLocked
                ? <UnlockIcon className="h-4 w-4" />
                : <LockIcon className="h-4 w-4" />
              }
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            {isLocked ? "Unlock tasks pane" : "Lock tasks pane open"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default TaskPaneHandle;
