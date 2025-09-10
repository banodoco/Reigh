import React, { useState, useMemo, useEffect } from 'react';
import { type PaginatedTasksResponse } from '@/shared/hooks/useTasks';
import { useProject } from '@/shared/contexts/ProjectContext';
import TaskItem from './TaskItem';
import { TaskStatus, Task } from '@/types/tasks';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from "@/shared/components/ui/scroll-area"
import { filterVisibleTasks, isTaskVisible } from '@/shared/lib/taskConfig';
import { RefreshCw } from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { FilterGroup } from './TasksPane';

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
  onVisibleCountChange?: (count: number) => void; // Callback to report actual visible count
}

const TaskList: React.FC<TaskListProps> = ({ 
  filterStatuses, 
  activeFilter, 
  statusCounts,
  paginatedData,
  isLoading = false,
  currentPage = 1,
  onVisibleCountChange
}) => {
  const { selectedProjectId } = useProject();

  // State to track tasks that have just been added for flash effect
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const prevTaskIdsRef = React.useRef<Set<string>>(new Set());
  const hasInitializedRef = React.useRef(false);
  const prevPageRef = React.useRef<number>(currentPage);

  // Use paginated data instead of fetching tasks directly
  const tasks = paginatedData?.tasks || [];

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
    
    // Find truly new tasks (not present in previous load)
    const newlyAddedIds = tasks
      .filter(t => !prevTaskIdsRef.current.has(t.id))
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

  // Filter out travel_segment and travel_stitch tasks so they do not appear in the sidebar
  // NOTE: Sorting is now done at the query level in usePaginatedTasks for better performance
  const filteredTasks = useMemo(() => {
    if (!tasks) return [] as Task[];
    const visible = filterVisibleTasks(tasks);
    
    // Calculate processing count and report it to parent
    const processingVisible = visible.filter(t => t.status === 'Queued' || t.status === 'In Progress');
    
    // Report the actual visible processing count to parent for badge
    if (onVisibleCountChange && activeFilter === 'Processing') {
      onVisibleCountChange(processingVisible.length);
    }
    
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
        processingVisibleCount: processingVisible.length,
        reportedToParent: activeFilter === 'Processing' ? processingVisible.length : 'not processing filter',
        timestamp: Date.now()
      });
    } catch {}
    return visible;
  }, [tasks, activeFilter, onVisibleCountChange]);

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

  return (
    <div className="p-4 h-full flex flex-col text-zinc-200">
      {summaryMessage && (
        <div className="p-3 mb-4 bg-zinc-800/95 rounded-md text-sm text-zinc-300 border border-zinc-700">
          {summaryMessage}
        </div>
      )}
      
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-24 rounded-lg bg-zinc-700/60" />
          ))}
        </div>
      )}
      
      {!isLoading && filteredTasks.length === 0 && !summaryMessage && (
        <p className="text-zinc-400 text-center">{getEmptyMessage()}</p>
      )}

      {!isLoading && filteredTasks.length > 0 && (
        <div className="flex-grow -mr-4">
          <ScrollArea className="h-full pr-4">
              {filteredTasks.map((task: Task, idx: number) => (
                  <React.Fragment key={task.id}>
                    <TaskItem task={task} isNew={newTaskIds.has(task.id)} />
                    {idx < filteredTasks.length - 1 && (
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