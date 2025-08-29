import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import TaskList from './TaskList';
import { cn } from '@/shared/lib/utils'; // For conditional classnames
import { Button } from '@/shared/components/ui/button'; // For the lock button
import { LockIcon, UnlockIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'; // Example icons
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCancelAllPendingTasks, useTaskStatusCounts, usePaginatedTasks, type PaginatedTasksResponse } from '@/shared/hooks/useTasks';
import { useToast } from '@/shared/hooks/use-toast';
import { TasksPaneProcessingWarning } from '../ProcessingWarnings';
import { TASK_STATUS, TaskStatus } from '@/types/database';
import { useBottomOffset } from '@/shared/hooks/useBottomOffset';
import { filterVisibleTasks, isTaskVisible } from '@/shared/lib/taskConfig';

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
        "ml-2 px-2 py-1 border-2 rounded text-xs font-light cursor-pointer transition-all",
        borderStyle,
        borderColor,
        count === 0 ? "opacity-50" : "opacity-100",
        isSelected ? "bg-white/20" : "bg-white/10 md:hover:bg-white/15"
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
  recentCount?: number;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  totalItems,
  isLoading = false,
  filterType,
  recentCount
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

  // Show recent count info if available and it's a filter that has recent data
  const showRecentInfo = recentCount && recentCount > 0 && (filterType === 'Succeeded' || filterType === 'Failed');

  return (
    <div className="flex items-center justify-between px-4 py-2 text-[11px] text-zinc-400">
      <span>
        {showRecentInfo ? (
          filterType === 'Succeeded' ? 
            `${recentCount} succeeded in the past hour, ${totalItems} in total.` :
            `${recentCount} fails in the past hour, ${totalItems} in total.`
        ) : (
          `${totalItems} ${getFilterLabel()}, showing ${ITEMS_PER_PAGE} per page`
        )}
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

const TasksPaneComponent: React.FC<TasksPaneProps> = ({ onOpenSettings }) => {
  const queryClient = useQueryClient();
  const {
    isGenerationsPaneLocked,
    isGenerationsPaneOpen,
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
  const shouldLoadTasks = !!selectedProjectId;
  
  // [TasksPaneCountMismatch] Track task loading conditions
  console.log('[TasksPaneCountMismatch]', {
    selectedProjectId,
    shouldLoadTasks,
    selectedFilter,
    currentPage,
    timestamp: Date.now()
  });
  
  // Get paginated tasks
  const { data: paginatedData, isLoading: isPaginatedLoading, error: paginatedError } = usePaginatedTasks({
    projectId: shouldLoadTasks ? selectedProjectId : null,
    status: STATUS_GROUPS[selectedFilter],
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
  });
  
  // [TasksPaneCountMismatch] Track paginated tasks hook results
  console.log('[TasksPaneCountMismatch]', {
    hookParams: {
      projectId: shouldLoadTasks ? selectedProjectId : null,
      status: STATUS_GROUPS[selectedFilter],
      limit: ITEMS_PER_PAGE,
      offset: (currentPage - 1) * ITEMS_PER_PAGE,
    },
    hookResults: {
      isLoading: isPaginatedLoading,
      hasData: !!paginatedData,
      tasksCount: paginatedData?.tasks?.length || 0,
      total: paginatedData?.total || 0,
      totalPages: paginatedData?.totalPages || 0,
      hasMore: paginatedData?.hasMore,
      error: paginatedError,
    },
    timestamp: Date.now()
  });
  
  // Store previous pagination data to avoid flickering during loading
  const [displayPaginatedData, setDisplayPaginatedData] = useState<typeof paginatedData>(paginatedData);
  
  // Only update display data when we have new data (not during loading) or when initializing
  useEffect(() => {
    if ((!isPaginatedLoading && paginatedData) || (!displayPaginatedData && paginatedData)) {
      console.log('[TasksPaneCountMismatch]', {
        context: 'TasksPane:update-display-paginated-data',
        reason: !displayPaginatedData ? 'initial' : 'new_data',
        previousTasksCount: displayPaginatedData?.tasks?.length || 0,
        newTasksCount: paginatedData?.tasks?.length || 0,
        isLoading: isPaginatedLoading,
        selectedFilter,
        currentPage,
        timestamp: Date.now()
      });
      
      setDisplayPaginatedData(paginatedData);
      
      // [TasksPaneCountMismatch] Track pagination data in TasksPane
      console.log('[TasksPaneCountMismatch]', {
        context: 'TasksPane:new-paginated-data',
        selectedFilter,
        currentPage,
        isLoading: isPaginatedLoading,
        tasksReceived: paginatedData?.tasks?.length || 0,
        totalFromHook: paginatedData?.total || 0,
        totalPagesFromHook: paginatedData?.totalPages || 0,
        hasMoreFromHook: paginatedData?.hasMore,
        calculatedOffset: (currentPage - 1) * ITEMS_PER_PAGE,
        expectedItemsPerPage: ITEMS_PER_PAGE,
        ISSUE_DETECTED: paginatedData?.tasks?.length === 0 && currentPage > 2 && (paginatedData?.total || 0) > 0,
        timestamp: Date.now()
      });

      // [TasksPaneCountMismatch] Mismatch detector between counts and visible items on page
      try {
        const tasks = paginatedData?.tasks || [];
        const visibleTasks = filterVisibleTasks(tasks);
        const hiddenTasks = tasks.filter(t => !isTaskVisible((t as any).taskType));
        const processingOnPage = visibleTasks.filter(t => (t as any).status === 'Queued' || (t as any).status === 'In Progress');
        console.log('[TasksPaneCountMismatch]', {
          context: 'TasksPane:page-visibility-breakdown',
          selectedFilter,
          currentPage,
          pageTasksCount: tasks.length,
          visibleOnPage: visibleTasks.length,
          hiddenOnPage: hiddenTasks.length,
          hiddenTypesSample: hiddenTasks.slice(0, 5).map(t => ({ id: (t as any).id, taskType: (t as any).taskType, status: (t as any).status })),
          processingOnPage: processingOnPage.length,
          processingSample: processingOnPage.slice(0, 5).map(t => ({ id: (t as any).id, taskType: (t as any).taskType })),
          timestamp: Date.now()
        });
      } catch (e) {
        console.warn('[TasksPaneCountMismatch]', { context: 'TasksPane:page-visibility-breakdown:log-error', message: (e as Error)?.message });
      }
    } else {
      console.log('[TasksPaneCountMismatch]', {
        context: 'TasksPane:skip-display-update',
        isLoading: isPaginatedLoading,
        hasPaginatedData: !!paginatedData,
        hasDisplayData: !!displayPaginatedData,
        selectedFilter,
        currentPage,
        timestamp: Date.now()
      });
    }
  }, [paginatedData, isPaginatedLoading, displayPaginatedData, selectedFilter, currentPage]);
  
  // Get status counts for indicators
  const { data: statusCounts, isLoading: isStatusCountsLoading, error: statusCountsError } = useTaskStatusCounts(shouldLoadTasks ? selectedProjectId : null);
  
  // [TasksPaneCountMismatch] Track status counts hook results
  console.log('[TasksPaneCountMismatch]', {
    context: 'TasksPane:status-counts-hook-results',
    hookParams: {
      projectId: shouldLoadTasks ? selectedProjectId : null,
    },
    hookResults: {
      isLoading: isStatusCountsLoading,
      hasData: !!statusCounts,
      statusCounts,
      error: statusCountsError,
    },
    timestamp: Date.now()
  });
  
  // Store previous status counts to avoid flickering during loading
  const [displayStatusCounts, setDisplayStatusCounts] = useState<typeof statusCounts>(statusCounts);
  
  // Only update display counts when we have new data (not during loading) or when initializing
  useEffect(() => {
    if ((!isStatusCountsLoading && statusCounts) || (!displayStatusCounts && statusCounts)) {
      setDisplayStatusCounts(statusCounts);
    }
  }, [statusCounts, isStatusCountsLoading, displayStatusCounts]);
  
  // Use processing count from status counts as the single source of truth
  const cancellableTaskCount = displayStatusCounts?.processing || 0;

  // [TasksPaneCountMismatch] Compare processing count badge to visible processing tasks on current page
  try {
    const pageTasks = displayPaginatedData?.tasks || [];
    const visiblePageTasks = filterVisibleTasks(pageTasks);
    const processingOnPage = visiblePageTasks.filter(t => (t as any).status === 'Queued' || (t as any).status === 'In Progress');
    console.log('[TasksPaneCountMismatch]', {
      context: 'TasksPane:processing-badge-vs-page',
      selectedFilter,
      currentPage,
      processingBadgeCount: cancellableTaskCount,
      processingOnPageCount: processingOnPage.length,
      possibleCause: 'Counts exclude orchestrators; list includes them',
      pageProcessingTypesSample: processingOnPage.slice(0, 3).map(t => ({ id: (t as any).id, taskType: (t as any).taskType })),
      timestamp: Date.now()
    });
  } catch {}

  const cancelAllPendingMutation = useCancelAllPendingTasks();
  const { toast } = useToast();

  useRenderLogger('TasksPane', { cancellableCount: cancellableTaskCount });

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
    
    // Don't show toast for Succeeded/Failed filters when there are recent counts
    // because the pagination controls will show this information when they're visible
    // and when they're not visible, the user can see the results directly
    if ((type === 'Succeeded' || type === 'Failed') && count > 0) {
      return; // No toast needed
    }
    
    // Show toast for other cases (like when there are no recent items)
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
        
        // Force refresh of all task-related queries to ensure UI updates immediately
        // Note: The useCancelPendingTasks hook already invalidates basic task queries,
        // but we need to also invalidate paginated queries and ensure they refetch
        queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
        // Force refetch of current paginated data to immediately update the UI
        queryClient.refetchQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
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
        bottomOffset={useBottomOffset()}
        handlePaneEnter={handlePaneEnter}
        handlePaneLeave={handlePaneLeave}
        thirdButton={{
          onClick: openPane,
          ariaLabel: `Open Tasks pane (${cancellableTaskCount} active tasks)`,
          content: <span className="text-xs font-light">{cancellableTaskCount}</span>
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
              <h2 className="text-xl font-light text-zinc-200 ml-2">Tasks</h2>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelAllPending}
                disabled={cancelAllPendingMutation.isPending || cancellableTaskCount === 0}
                className="flex items-center gap-2"
              >
                {cancelAllPendingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancel All
                  </>
                ) : (
                  'Cancel All'
                )}
              </Button>
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
                        ? "bg-zinc-600 text-zinc-100 md:hover:bg-zinc-500" 
                        : "text-zinc-400 md:hover:text-zinc-200 md:hover:bg-zinc-700"
                    )}
                  >
                    <span>{filter}</span>
                    <StatusIndicator
                      count={count}
                      type={filter}
                      isSelected={selectedFilter === filter}
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
                          ? "bg-zinc-600 text-zinc-100 md:hover:bg-zinc-500" 
                          : "text-zinc-400 md:hover:text-zinc-200 md:hover:bg-zinc-700"
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
            recentCount={
              selectedFilter === 'Succeeded' ? displayStatusCounts?.recentSuccesses :
              selectedFilter === 'Failed' ? displayStatusCounts?.recentFailures :
              undefined
            }
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

// Memoize TasksPane with custom comparison to prevent unnecessary re-renders
export const TasksPane = React.memo(TasksPaneComponent, (prevProps, nextProps) => {
  // Only re-render if onOpenSettings function reference changes
  // (this should be stable if properly memoized in parent)
  return prevProps.onOpenSettings === nextProps.onOpenSettings;
});

export default TasksPane; 