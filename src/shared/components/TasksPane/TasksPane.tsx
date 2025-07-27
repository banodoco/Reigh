import React, { useState, useEffect } from 'react';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import TaskList from './TaskList';
import { cn } from '@/shared/lib/utils'; // For conditional classnames
import { Button } from '@/shared/components/ui/button'; // For the lock button
import { LockIcon, UnlockIcon, ChevronLeft, ChevronRight } from 'lucide-react'; // Example icons
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCancelAllPendingTasks, useListTasks, useTaskStatusCounts, usePaginatedTasks, type PaginatedTasksResponse } from '@/shared/hooks/useTasks';
import { useToast } from '@/shared/hooks/use-toast';
import { filterVisibleTasks } from '@/shared/lib/taskConfig';
import { TasksPaneProcessingWarning } from '../ProcessingWarnings';
import { TASK_STATUS, TaskStatus } from '@/types/database';

const CANCELLABLE_TASK_STATUSES: TaskStatus[] = [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS];
const ITEMS_PER_PAGE = 50;

// Status filter mapping
export type FilterGroup = 'Processing' | 'Succeeded' | 'Failed';

const STATUS_GROUPS: Record<FilterGroup, TaskStatus[]> = {
  Processing: ['Queued', 'In Progress'],
  Succeeded: ['Complete'],
  Failed: ['Failed', 'Cancelled'],
};

// Status indicator component with count and styling
interface StatusIndicatorProps {
  count: number;
  type: FilterGroup;
  onClick?: () => void;
  isSelected: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ count, type, onClick, isSelected }) => {
  const borderStyle = type === 'Processing' ? 'border-solid' : 'border-dashed';
  const borderColor = 'border-zinc-500';
  
  return (
    <div 
      className={cn(
        "ml-2 px-2 py-1 border-2 rounded text-xs font-medium cursor-pointer transition-all",
        borderStyle,
        borderColor,
        count === 0 ? "opacity-50" : "opacity-100",
        isSelected ? "bg-white/20" : "bg-white/10 hover:bg-white/15"
      )}
      onClick={onClick}
    >
      {count}
    </div>
  );
};

// Pagination controls component
interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  isLoading?: boolean;
  filterType: FilterGroup;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  totalItems,
  isLoading = false,
  filterType
}) => {
  // Only show pagination when there are multiple pages
  if (totalPages <= 1) return null;

  const getFilterLabel = () => {
    switch (filterType) {
      case 'Processing':
        return 'processing tasks';
      case 'Succeeded':
        return 'succeeded tasks';
      case 'Failed':
        return 'failed tasks';
      default:
        return 'tasks';
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 text-[11px] text-zinc-400">
      <span>
        {totalItems} {getFilterLabel()}, showing {ITEMS_PER_PAGE} per page
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-zinc-300 text-[11px]">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

interface TasksPaneProps {
  onOpenSettings: () => void;
}

export const TasksPane: React.FC<TasksPaneProps> = ({ onOpenSettings }) => {
  const {
    isGenerationsPaneLocked,
    generationsPaneHeight,
    isTasksPaneLocked,
    setIsTasksPaneLocked,
    tasksPaneWidth,
  } = usePanes();

  // Status filter state - default to Processing
  const [selectedFilter, setSelectedFilter] = useState<FilterGroup>('Processing');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Project context & task helpers
  const { selectedProjectId } = useProject();
  const { data: cancellableTasks } = useListTasks({ projectId: selectedProjectId, status: CANCELLABLE_TASK_STATUSES });
  
  // Get paginated tasks
  const { data: paginatedData, isLoading: isPaginatedLoading } = usePaginatedTasks({
    projectId: selectedProjectId,
    status: STATUS_GROUPS[selectedFilter],
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
  });
  
  // Store previous pagination data to avoid flickering during loading
  const [displayPaginatedData, setDisplayPaginatedData] = useState<typeof paginatedData>(paginatedData);
  
  // Only update display data when we have new data (not during loading) or when initializing
  useEffect(() => {
    if ((!isPaginatedLoading && paginatedData) || (!displayPaginatedData && paginatedData)) {
      setDisplayPaginatedData(paginatedData);
    }
  }, [paginatedData, isPaginatedLoading, displayPaginatedData]);
  
  // Get status counts for indicators
  const { data: statusCounts, isLoading: isStatusCountsLoading } = useTaskStatusCounts(selectedProjectId);
  
  // Store previous status counts to avoid flickering during loading
  const [displayStatusCounts, setDisplayStatusCounts] = useState<typeof statusCounts>(statusCounts);
  
  // Only update display counts when we have new data (not during loading) or when initializing
  useEffect(() => {
    if ((!isStatusCountsLoading && statusCounts) || (!displayStatusCounts && statusCounts)) {
      setDisplayStatusCounts(statusCounts);
    }
  }, [statusCounts, isStatusCountsLoading, displayStatusCounts]);
  
  // Count only visible tasks (exclude travel_segment and travel_stitch) for display
  const visibleCancellableCount = filterVisibleTasks(cancellableTasks || []).length;

  const cancelAllPendingMutation = useCancelAllPendingTasks();
  const { toast } = useToast();

  useRenderLogger('TasksPane', { cancellableCount: visibleCancellableCount });

  // Reset to page 1 when filter changes
  const handleFilterChange = (filter: FilterGroup) => {
    setSelectedFilter(filter);
    setCurrentPage(1);
  };

  // Handle page changes
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handler for status indicator clicks
  const handleStatusIndicatorClick = (type: FilterGroup, count: number) => {
    setSelectedFilter(type);
    setCurrentPage(1);
    
    if (type === 'Succeeded') {
      toast({
        title: 'Recent Successes',
        description: `${count} generation${count === 1 ? '' : 's'} in past hour`,
        variant: 'default',
      });
    } else if (type === 'Failed') {
      toast({
        title: 'Recent Failures',
        description: `${count} generation${count === 1 ? '' : 's'} in past hour`,
        variant: 'destructive',
      });
    }
  };

  const handleCancelAllPending = () => {
    if (!selectedProjectId) {
      toast({ title: 'Error', description: 'No project selected.', variant: 'destructive' });
      return;
    }

    cancelAllPendingMutation.mutate(selectedProjectId, {
      onSuccess: (data) => {
        toast({
          title: 'Tasks Cancellation Initiated',
          description: `Cancelled ${Array.isArray(data) ? data.length : 0} pending tasks.`,
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

  // Calculate pagination info using display data to avoid flickering
  const totalTasks = displayPaginatedData?.total || 0;
  const totalPages = displayPaginatedData?.totalPages || 0;

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
        thirdButton={{
          onClick: openPane,
          ariaLabel: `Open Tasks pane (${visibleCancellableCount} active tasks)`,
          content: <span className="text-xs font-medium">{visibleCancellableCount}</span>
        }}
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
            'pointer-events-auto absolute top-0 right-0 h-full w-full bg-zinc-900/95 border-l border-zinc-600 shadow-xl transform transition-transform duration-300 ease-smooth flex flex-col',
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
                  {cancelAllPendingMutation.isPending ? 'Cancelling All...' : 'Cancel All'}
                </Button>
              )}
          </div>
          
          {/* Status Filter Toggle */}
          <div className="p-4 border-b border-zinc-800 flex-shrink-0">
            <div className="bg-zinc-800 rounded-lg p-1 space-y-1">
              {/* Processing button - full width on top */}
              {(() => {
                const filter = 'Processing' as FilterGroup;
                const count = displayStatusCounts?.processing || 0;
                
                return (
                  <Button
                    key={filter}
                    variant={selectedFilter === filter ? "default" : "ghost"}
                    size="sm"
                    onClick={() => handleFilterChange(filter)}
                    className={cn(
                      "w-full text-xs flex items-center justify-center",
                      selectedFilter === filter 
                        ? "bg-zinc-600 text-zinc-100 hover:bg-zinc-500" 
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    )}
                  >
                    <span>{filter}</span>
                    <StatusIndicator
                      count={count}
                      type={filter}
                      isSelected={selectedFilter === filter}
                      onClick={() => {
                        handleStatusIndicatorClick(filter, count);
                      }}
                    />
                  </Button>
                );
              })()}
              
              {/* Succeeded and Failed buttons - side by side */}
              <div className="flex gap-1">
                {(['Succeeded', 'Failed'] as FilterGroup[]).map((filter) => {
                  const getCount = () => {
                    if (!displayStatusCounts) return 0;
                    switch (filter) {
                      case 'Succeeded':
                        return displayStatusCounts.recentSuccesses;
                      case 'Failed':
                        return displayStatusCounts.recentFailures;
                      default:
                        return 0;
                    }
                  };
                  
                  const count = getCount();
                  
                  return (
                    <Button
                      key={filter}
                      variant={selectedFilter === filter ? "default" : "ghost"}
                      size="sm"
                      onClick={() => handleFilterChange(filter)}
                      className={cn(
                        "flex-1 text-xs flex items-center justify-center",
                        selectedFilter === filter 
                          ? "bg-zinc-600 text-zinc-100 hover:bg-zinc-500" 
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                      )}
                    >
                      <span>{filter}</span>
                      <StatusIndicator
                        count={count}
                        type={filter}
                        isSelected={selectedFilter === filter}
                        onClick={() => {
                          handleStatusIndicatorClick(filter, count);
                        }}
                      />
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pagination Controls */}
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            totalItems={totalTasks}
            isLoading={isPaginatedLoading}
            filterType={selectedFilter}
          />

          <TasksPaneProcessingWarning onOpenSettings={onOpenSettings} />
          <div className="flex-grow overflow-y-auto">
            <TaskList
              filterStatuses={STATUS_GROUPS[selectedFilter]}
              activeFilter={selectedFilter}
              statusCounts={displayStatusCounts}
              paginatedData={displayPaginatedData}
              isLoading={isPaginatedLoading}
              currentPage={currentPage}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(TasksPane); 