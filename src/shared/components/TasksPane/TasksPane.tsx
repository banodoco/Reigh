import React from 'react';
import TaskList from './TaskList';
import { cn } from '@/shared/lib/utils'; // For conditional classnames
import { Button } from '@/shared/components/ui/button'; // For the lock button
import { LockIcon, UnlockIcon } from 'lucide-react'; // Example icons
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCancelAllPendingTasks, useListTasks } from '@/shared/hooks/useTasks';
import { useToast } from '@/shared/hooks/use-toast';
import { filterVisibleTasks } from '@/shared/lib/taskConfig';

export const TasksPane: React.FC = () => {
  const {
    isGenerationsPaneLocked,
    generationsPaneHeight,
    isTasksPaneLocked,
    setIsTasksPaneLocked,
    tasksPaneWidth,
  } = usePanes();

  // Project context & task helpers
  const { selectedProjectId } = useProject();
  const { data: cancellableTasks } = useListTasks({ projectId: selectedProjectId, status: ['Queued', 'In Progress'] });
  
  // Count only visible tasks (exclude travel_segment and travel_stitch) for display
  const visibleCancellableCount = filterVisibleTasks(cancellableTasks || []).length;

  const cancelAllPendingMutation = useCancelAllPendingTasks();
  const { toast } = useToast();

  const handleCancelAllPending = () => {
    if (!selectedProjectId) {
      toast({ title: 'Error', description: 'No project selected.', variant: 'destructive' });
      return;
    }

    cancelAllPendingMutation.mutate(selectedProjectId, {
      onSuccess: (data) => {
        toast({
          title: 'Tasks Cancellation Initiated',
          description: `Cancelled ${data?.length || 0} pending tasks.`,
          variant: 'default',
        });
      },
      onError: (error) => {
        console.error('Cancel-All failed:', error);
        toast({
          title: 'Cancellation Failed',
          description: (error as Error).message || 'Could not cancel all active tasks.',
          variant: 'destructive',
        });
      },
    });
  };

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave } = useSlidingPane({
    side: 'right',
    isLocked: isTasksPaneLocked,
    onToggleLock: () => setIsTasksPaneLocked(!isTasksPaneLocked),
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
        handlePaneEnter={handlePaneEnter}
        handlePaneLeave={handlePaneLeave}
      />
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: `${tasksPaneWidth}px`,
          zIndex: 60, // On top of header (z-50)
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
              <h2 className="text-xl font-semibold text-zinc-200 ml-2">Tasks</h2>
              {visibleCancellableCount > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelAllPending}
                  disabled={cancelAllPendingMutation.isPending}
                >
                  {cancelAllPendingMutation.isPending ? 'Cancelling All...' : `Cancel All (${visibleCancellableCount})`}
                </Button>
              )}
          </div>
          <div className="flex-grow overflow-y-auto">
            <TaskList />
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(TasksPane); 