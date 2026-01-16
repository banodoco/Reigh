import React, { useState, useMemo, useEffect } from 'react';
import { type PaginatedTasksResponse } from '@/shared/hooks/useTasks';
import { useProject } from '@/shared/contexts/ProjectContext';
import TaskItem from './TaskItem';
import IncomingTaskItem from './IncomingTaskItem';
import { TaskStatus, Task } from '@/types/tasks';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from "@/shared/components/ui/scroll-area"
import { filterVisibleTasks, isTaskVisible } from '@/shared/lib/taskConfig';
import { RefreshCw } from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { FilterGroup } from './TasksPane';
import { GenerationRow } from '@/types/shots';
import { cn } from '@/shared/lib/utils';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';

// Realistic task item skeleton that mimics the TaskItem layout
interface TaskItemSkeletonProps {
  variant?: 'processing' | 'complete' | 'failed';
  showImages?: boolean;
  showPrompt?: boolean;
}

const TaskItemSkeleton: React.FC<TaskItemSkeletonProps> = ({ 
  variant = 'processing',
  showImages = false,
  showPrompt = false
}) => {
  const statusColors = {
    processing: 'bg-blue-500/60',
    complete: 'bg-green-500/60',
    failed: 'bg-red-500/60',
  };

  return (
    <div className="relative p-3 mb-2 bg-zinc-800/95 rounded-md shadow border border-zinc-600 animate-pulse">
      {/* Header row: task type + status badge */}
      <div className="flex justify-between items-center mb-1 gap-2">
        <Skeleton className="h-4 w-24 bg-zinc-600" />
        <Skeleton className={cn("h-5 w-16 rounded-full", statusColors[variant])} />
      </div>
      
      {/* Image previews (for travel tasks) */}
      {showImages && (
        <div className="flex items-center gap-1 mb-1 mt-2">
          <Skeleton className="w-12 h-12 rounded bg-zinc-700" />
          <Skeleton className="w-12 h-12 rounded bg-zinc-700" />
          <Skeleton className="w-12 h-12 rounded bg-zinc-700" />
        </div>
      )}
      
      {/* Prompt box (for image generation tasks) */}
      {showPrompt && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5 flex items-center justify-between">
            <Skeleton className="h-3 flex-1 mr-2 bg-zinc-600" />
            <Skeleton className="w-8 h-8 rounded bg-zinc-600 flex-shrink-0" />
          </div>
        </div>
      )}
      
      {/* Timestamp row */}
      <div className="flex items-center mt-2">
        <Skeleton className="h-3 w-20 bg-zinc-700" />
      </div>
    </div>
  );
};

// Loading skeleton for the task list that shows varied task types
const TaskListSkeleton: React.FC<{ activeFilter: FilterGroup; count?: number }> = ({ activeFilter, count }) => {
  // Determine how many skeletons to show (cap at 4, default to 4 if unknown)
  const skeletonCount = count !== undefined ? Math.min(count, 4) : 4;

  // Get variant based on filter type
  const getVariant = (): 'processing' | 'complete' | 'failed' => {
    switch (activeFilter) {
      case 'Processing': return 'processing';
      case 'Succeeded': return 'complete';
      case 'Failed': return 'failed';
      default: return 'processing';
    }
  };

  const variant = getVariant();

  // Generate skeleton items alternating between image and prompt styles
  const skeletonItems = Array.from({ length: skeletonCount }, (_, i) => ({
    variant,
    showImages: i % 2 === 0,
    showPrompt: i % 2 === 1,
  }));

  return (
    <div className="space-y-1">
      {skeletonItems.map((config, idx) => (
        <React.Fragment key={idx}>
          <TaskItemSkeleton {...config} />
          {idx < skeletonItems.length - 1 && (
            <div className="h-0 border-b border-zinc-700/40 my-1" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

interface TaskListProps {
  filterStatuses: TaskStatus[];
  activeFilter: FilterGroup;
  statusCounts: {
    processing: number;
    recentSuccesses: number;
    recentFailures: number;
  } | undefined;
  paginatedData?: PaginatedTasksResponse;
  isLoading?: boolean;
  currentPage?: number; // Add current page to track pagination changes
  activeTaskId?: string | null; // Currently active/viewed task ID
  onOpenImageLightbox?: (task: Task, media: GenerationRow, initialVariantId?: string) => void;
  onOpenVideoLightbox?: (task: Task, media: GenerationRow[], videoIndex: number, initialVariantId?: string) => void;
  // Mobile two-step tap interaction state
  mobileActiveTaskId?: string | null;
  onMobileActiveTaskChange?: (taskId: string | null) => void;
  taskTypeFilter?: string; // Optional task type filter
  // Project scope props for "All Projects" mode
  showProjectIndicator?: boolean;
  projectNameMap?: Record<string, string>;
}

const TaskList: React.FC<TaskListProps> = ({
  filterStatuses,
  activeFilter,
  statusCounts,
  paginatedData,
  isLoading = false,
  currentPage = 1,
  activeTaskId,
  onOpenImageLightbox,
  onOpenVideoLightbox,
  mobileActiveTaskId,
  onMobileActiveTaskChange,
  taskTypeFilter,
  showProjectIndicator = false,
  projectNameMap = {},
}) => {
  const { selectedProjectId } = useProject();
  const { incomingTasks } = useIncomingTasks();

  // State to track tasks that have just been added for flash effect
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const prevTaskIdsRef = React.useRef<Set<string>>(new Set());
  const hasInitializedRef = React.useRef(false);
  const prevPageRef = React.useRef<number>(currentPage);
  
  // Track filter transitions to show skeleton during switch
  const [isFilterTransitioning, setIsFilterTransitioning] = useState(false);
  const prevFilterRef = React.useRef<FilterGroup>(activeFilter);

  // Use paginated data instead of fetching tasks directly
  const tasks = paginatedData?.tasks || [];
  
  // Detect filter changes and show skeleton during transition
  useEffect(() => {
    if (prevFilterRef.current !== activeFilter) {
      // Filter changed - show skeleton immediately
      setIsFilterTransitioning(true);
      prevFilterRef.current = activeFilter;
    }
  }, [activeFilter]);
  
  // Clear transitioning state when we get data for the new filter
  useEffect(() => {
    if (isFilterTransitioning && tasks.length > 0 && !isLoading) {
      // We have data and we're not loading - transition complete
      setIsFilterTransitioning(false);
    } else if (isFilterTransitioning && !isLoading && tasks.length === 0) {
      // No data but also not loading - this filter is genuinely empty
      // Use a small delay to ensure we're not in a race condition
      const timer = setTimeout(() => {
        setIsFilterTransitioning(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isFilterTransitioning, tasks.length, isLoading]);

  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    
    const currentIds = new Set(tasks.map(t => t.id));
    
    // Check if this is a pagination change
    const isPaginationChange = prevPageRef.current !== currentPage;
    
    // On the very first load with tasks, or on pagination change, just set the previous IDs without marking anything as new
    if (!hasInitializedRef.current || isPaginationChange) {
      prevTaskIdsRef.current = currentIds;
      prevPageRef.current = currentPage;
      hasInitializedRef.current = true;
      return;
    }
    
    // Find truly new tasks - must be:
    // 1. Not present in previous load
    // 2. Created within the last 15 seconds (truly new, not just newly visible)
    const now = Date.now();
    const NEW_TASK_THRESHOLD_MS = 15000; // 15 seconds
    
    const newlyAddedIds = tasks
      .filter(t => {
        // Not in previous load
        if (prevTaskIdsRef.current.has(t.id)) return false;
        
        // Check if task was created recently
        const createdAt = t.createdAt || (t as any).created_at;
        if (!createdAt) return false;
        
        const createdTime = new Date(createdAt).getTime();
        const ageMs = now - createdTime;
        
        // Only flash if created within threshold
        return ageMs < NEW_TASK_THRESHOLD_MS;
      })
      .map(t => t.id);

    if (newlyAddedIds.length > 0) {
      setNewTaskIds(new Set(newlyAddedIds));
      // Clear the flash effect after 3 seconds
      const timer = setTimeout(() => setNewTaskIds(new Set()), 3000);
      
      // Update previous IDs ref after processing
      prevTaskIdsRef.current = currentIds;
      
      return () => clearTimeout(timer);
    }

    // Update previous IDs ref even if no new tasks
    prevTaskIdsRef.current = currentIds;
  }, [tasks, currentPage]);

  // Effect to reset pagination baseline when filter changes
  useEffect(() => {
    // Reset the baseline so tasks loaded by a filter switch are not considered new
    prevTaskIdsRef.current = new Set();
    prevPageRef.current = currentPage;
    hasInitializedRef.current = false;
  }, [filterStatuses, currentPage]);

  // Note: Processing count for badge is now handled by parent using status counts total

  // Filter out travel_segment and travel_stitch tasks so they do not appear in the sidebar
  // NOTE: Sorting is now done at the query level in usePaginatedTasks for better performance
  const filteredTasks = useMemo(() => {
    if (!tasks) return [] as Task[];
    const visible = filterVisibleTasks(tasks);
    
    // [TaskTypeFilterDebug] Log what task types are actually being shown in the task list
    const visibleTaskTypes = [...new Set(visible.map(t => t.taskType))];
    const allTaskTypes = [...new Set(tasks.map(t => t.taskType))];
    console.log('[TaskTypeFilterDebug] TaskList - DISPLAYED task types:', visibleTaskTypes);
    console.log('[TaskTypeFilterDebug] TaskList - ALL task types before filter:', allTaskTypes);
    
    // [TasksPaneCountMismatch] Log when local filtering hides tasks that might be counted
    try {
      const hidden = tasks.filter(t => !isTaskVisible(t.taskType));
      console.log('[TaskList] Visible task filtering', {
        context: 'TaskList:filter-visible-tasks',
        activeFilter,
        tasksCount: tasks.length,
        visibleCount: visible.length,
        hiddenCount: hidden.length,
        hiddenTypesSample: hidden.slice(0, 5).map(t => ({ id: t.id, taskType: t.taskType, status: t.status })),
        timestamp: Date.now()
      });
    } catch {}
    return visible;
  }, [tasks, activeFilter]);

  // Filter incoming tasks to hide those whose real task has arrived
  // This ensures the placeholder disappears in the SAME render cycle as the real task appears,
  // preventing the brief coexistence flicker
  const visibleIncomingTasks = useMemo(() => {
    if (activeFilter !== 'Processing' || incomingTasks.length === 0) return [];

    const now = Date.now();
    const REPLACEMENT_WINDOW_MS = 60000; // 60 seconds - match the stale task timeout

    return incomingTasks.filter(incoming => {
      // Check if any real task could be the "replacement" for this incoming task
      const hasMatchingRealTask = filteredTasks.some(task => {
        // Must be same task type
        if (task.taskType !== incoming.taskType) return false;

        // Get task creation time
        const taskCreatedAt = new Date(task.createdAt || (task as any).created_at).getTime();

        // Must be created after the incoming task started (or within 2 seconds before, for clock skew)
        if (taskCreatedAt < incoming.startedAt.getTime() - 2000) return false;

        // Must be recent (within window)
        if (now - taskCreatedAt > REPLACEMENT_WINDOW_MS) return false;

        return true;
      });

      // Show incoming task only if no matching real task exists yet
      return !hasMatchingRealTask;
    });
  }, [activeFilter, incomingTasks, filteredTasks]);

  const summaryMessage = useMemo(() => {
    if (!statusCounts) return null;
    
    // Only show summary message when pagination controls are not visible
    // Pagination controls are only shown when there are multiple pages
    const hasPagination = paginatedData && paginatedData.totalPages > 1;
    
    if (hasPagination) {
      return null; // Don't show summary when pagination is visible
    }
    
    if (activeFilter === 'Succeeded') {
      const count = statusCounts.recentSuccesses;
      if (count > 0) {
        return `${count} succeeded in the past hour.`;
      }
    }
    if (activeFilter === 'Failed') {
      const count = statusCounts.recentFailures;
      if (count > 0) {
        return `${count} fails in the past hour.`;
      }
    }
    return null;
  }, [activeFilter, statusCounts, paginatedData]);

  // Generate filter-specific empty message
  const getEmptyMessage = () => {
    switch (activeFilter) {
      case 'Processing':
        return 'No tasks processing';
      case 'Succeeded':
        return 'No tasks succeeded';
      case 'Failed':
        return 'No tasks failed';
      default:
        return 'No tasks found';
    }
  };

  // For Processing filter, we know the exact count from statusCounts
  // For Succeeded/Failed, the counts are only "recent" (past hour) but the list shows all history
  // So we can only skip skeleton for Processing when we know count is 0
  const knownEmptyProcessing = activeFilter === 'Processing' && statusCounts?.processing === 0;

  // Show skeleton during initial load OR during filter transitions
  // BUT skip skeleton if we already know Processing is empty
  const showSkeleton = (isLoading || isFilterTransitioning) && !knownEmptyProcessing;

  return (
    <div className="p-4 h-full flex flex-col text-zinc-200">
      {summaryMessage && !showSkeleton && (
        <div className="p-3 mb-4 bg-zinc-800/95 rounded-md text-sm text-zinc-300 border border-zinc-700">
          {summaryMessage}
        </div>
      )}
      
      {showSkeleton && (
        <TaskListSkeleton activeFilter={activeFilter} count={activeFilter === 'Processing' ? statusCounts?.processing : undefined} />
      )}
      
      {!showSkeleton && filteredTasks.length === 0 && !summaryMessage && !(activeFilter === 'Processing' && visibleIncomingTasks.length > 0) && (
        <p className="text-zinc-400 text-center">{getEmptyMessage()}</p>
      )}

      {!showSkeleton && (filteredTasks.length > 0 || (activeFilter === 'Processing' && visibleIncomingTasks.length > 0)) && (
        <div className="flex-grow -mr-4">
          <ScrollArea className="h-full pr-4">
              {/* Real tasks */}
              {filteredTasks.map((task: Task, idx: number) => (
                  <React.Fragment key={task.id}>
                    <TaskItem
                      task={task}
                      isNew={newTaskIds.has(task.id)}
                      isActive={task.id === activeTaskId}
                      onOpenImageLightbox={onOpenImageLightbox}
                      onOpenVideoLightbox={onOpenVideoLightbox}
                      isMobileActive={mobileActiveTaskId === task.id}
                      onMobileActiveChange={onMobileActiveTaskChange}
                      showProjectIndicator={showProjectIndicator}
                      projectName={projectNameMap[task.projectId]}
                    />
                    {(idx < filteredTasks.length - 1 || (activeFilter === 'Processing' && visibleIncomingTasks.length > 0)) && (
                      <div className="h-0 border-b border-zinc-700/40 my-1" />
                    )}
                  </React.Fragment>
              ))}
              {/* Incoming/placeholder tasks at bottom - only show if not yet replaced by real task */}
              {visibleIncomingTasks.map((incoming, idx) => (
                <React.Fragment key={incoming.id}>
                  <IncomingTaskItem task={incoming} />
                  {idx < visibleIncomingTasks.length - 1 && (
                    <div className="h-0 border-b border-zinc-700/40 my-1" />
                  )}
                </React.Fragment>
              ))}
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default TaskList;
