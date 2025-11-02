import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { useSimpleRealtime } from '@/shared/providers/SimpleRealtimeProvider';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { GenerationRow } from '@/types/shots';
import { Task } from '@/types/tasks';
import { useListShots, useAddImageToShot, useAddImageToShotWithoutPosition } from '@/shared/hooks/useShots';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { supabase } from '@/integrations/supabase/client';
import { toast as sonnerToast } from 'sonner';

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
  
  // Local state for shot selector dropdown (separate from the shot being viewed)
  const [lightboxSelectedShotId, setLightboxSelectedShotId] = useState<string | undefined>(undefined);
  
  // Expose queryClient globally for diagnostics
  useEffect(() => {
    if (typeof window !== 'undefined' && queryClient) {
      (window as any).__REACT_QUERY_CLIENT__ = queryClient;
    }
  }, [queryClient]);
  const {
    isGenerationsPaneLocked,
    isGenerationsPaneOpen,
    generationsPaneHeight,
    isTasksPaneLocked,
    setIsTasksPaneLocked,
    tasksPaneWidth,
    activeTaskId,
    setActiveTaskId,
    isTasksPaneOpen: isTasksPaneOpenProgrammatic,
    setIsTasksPaneOpen: setIsTasksPaneOpenProgrammatic,
  } = usePanes();

  // Status filter state - default to Processing
  const [selectedFilter, setSelectedFilter] = useState<FilterGroup>('Processing');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Lightbox state - hoisted here so pagination doesn't close it
  const [lightboxData, setLightboxData] = useState<{
    type: 'image' | 'video';
    task: Task;
    media: GenerationRow | GenerationRow[];
    videoIndex?: number;
  } | null>(null);
  
  // Optimistic updates for "Add to Shot" button states
  const [optimisticPositionedIds, setOptimisticPositionedIds] = useState<Set<string>>(new Set());
  const [optimisticUnpositionedIds, setOptimisticUnpositionedIds] = useState<Set<string>>(new Set());

  // Project context & task helpers
  const { selectedProjectId } = useProject();
  const shouldLoadTasks = !!selectedProjectId;
  
  // Shots data for lightbox
  const { data: shots } = useListShots(selectedProjectId);
  const { currentShotId } = useCurrentShot();
  const { lastAffectedShotId } = useLastAffectedShot();
  
  // Simplified shot options for MediaLightbox
  const simplifiedShotOptions = React.useMemo(() => shots?.map(s => ({ id: s.id, name: s.name })) || [], [shots]);
  
  // Task details for current lightbox media
  // Derive input images from task params (helper function from useTaskDetails)
  const deriveInputImages = (task: any): string[] => {
    if (!task?.params) return [];
    const params = task.params;
    const inputImages: string[] = [];
    if (params.input_image) inputImages.push(params.input_image);
    if (params.image) inputImages.push(params.image);
    if (params.init_image) inputImages.push(params.init_image);
    if (params.control_image) inputImages.push(params.control_image);
    if (params.images && Array.isArray(params.images)) inputImages.push(...params.images);
    if (params.input_images && Array.isArray(params.input_images)) inputImages.push(...params.input_images);
    // For travel tasks, also check orchestrator paths
    if (params.full_orchestrator_payload?.input_image_paths_resolved && Array.isArray(params.full_orchestrator_payload.input_image_paths_resolved)) {
      inputImages.push(...params.full_orchestrator_payload.input_image_paths_resolved);
    }
    if (params.orchestrator_details?.input_image_paths_resolved && Array.isArray(params.orchestrator_details.input_image_paths_resolved)) {
      inputImages.push(...params.orchestrator_details.input_image_paths_resolved);
    }
    return inputImages.filter(Boolean);
  };
  
  // Build task details data directly from lightbox task (no need to re-fetch)
  const taskDetailsData = React.useMemo(() => {
    if (!lightboxData?.task) return null;
    
    const task = lightboxData.task;
    const inputImages = deriveInputImages(task);
    
    return {
      task,
      isLoading: false,
      error: null,
      inputImages,
      taskId: task.id,
      onApplySettingsFromTask: undefined,
      onClose: undefined
    };
  }, [lightboxData?.task]);
  
  // Realtime connection status
  const { isConnected: realtimeConnected, isConnecting: realtimeConnecting, error: realtimeError, lastTaskUpdate, lastNewTask } = useSimpleRealtime();
  
  // [TasksPaneRealtimeDebug] Track realtime connection and task loading conditions
  console.log('[TasksPaneRealtimeDebug]', {
    context: 'connection-and-loading-state',
    selectedProjectId,
    shouldLoadTasks,
    selectedFilter,
    currentPage,
    realtimeConnected,
    realtimeConnecting,
    realtimeError: realtimeError?.message || null,
    timestamp: Date.now()
  });
  
  // Get paginated tasks
  const { data: paginatedData, isLoading: isPaginatedLoading, error: paginatedError, refetch: refetchPaginatedTasks } = usePaginatedTasks({
    projectId: shouldLoadTasks ? selectedProjectId : null,
    status: STATUS_GROUPS[selectedFilter],
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
  });

  // NOTE: Task invalidation is now handled by the centralized TaskInvalidationSubscriber
  // which provides better read-after-write consistency with exponential backoff retry
  
  // [TasksPaneRealtimeDebug] Track React Query state and detect polling fallback
  const queryState = queryClient.getQueryState(['tasks', 'paginated', selectedProjectId, STATUS_GROUPS[selectedFilter], ITEMS_PER_PAGE, (currentPage - 1) * ITEMS_PER_PAGE]);
  const queryData = queryClient.getQueryData(['tasks', 'paginated', selectedProjectId, STATUS_GROUPS[selectedFilter], ITEMS_PER_PAGE, (currentPage - 1) * ITEMS_PER_PAGE]);
  
  console.log('[TasksPaneRealtimeDebug]', {
    context: 'react-query-state-analysis',
    queryKey: ['tasks', 'paginated', selectedProjectId, STATUS_GROUPS[selectedFilter], ITEMS_PER_PAGE, (currentPage - 1) * ITEMS_PER_PAGE],
    queryState: {
      status: queryState?.status,
      fetchStatus: queryState?.fetchStatus,
      isStale: queryState?.isStale,
      dataUpdatedAt: queryState?.dataUpdatedAt ? new Date(queryState.dataUpdatedAt).toISOString() : null,
      dataUpdatedAtAge: queryState?.dataUpdatedAt ? Date.now() - queryState.dataUpdatedAt : null,
      errorUpdatedAt: queryState?.errorUpdatedAt ? new Date(queryState.errorUpdatedAt).toISOString() : null,
      isInvalidated: queryState?.isInvalidated,
    },
    hasQueryData: !!queryData,
    realtimeStatus: {
      connected: realtimeConnected,
      connecting: realtimeConnecting,
      error: realtimeError?.message || null
    },
    possiblePollingFallback: !realtimeConnected && queryState?.fetchStatus === 'fetching',
    timestamp: Date.now()
  });

  // [TasksPaneRealtimeDebug] Track paginated tasks hook results
  console.log('[TasksPaneRealtimeDebug]', {
    context: 'paginated-hook-params-and-results',
    hookParams: {
      projectId: shouldLoadTasks ? selectedProjectId : null,
      status: STATUS_GROUPS[selectedFilter],
      limit: ITEMS_PER_PAGE,
      offset: (currentPage - 1) * ITEMS_PER_PAGE,
      ITEMS_PER_PAGE_CONSTANT: ITEMS_PER_PAGE,
      currentPage,
      selectedFilter,
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
  
  // [TasksPaneRealtimeDebug] Track data freshness and invalidation events
  useEffect(() => {
    const handleTaskUpdate = (event: CustomEvent) => {
      console.log('[TasksPaneRealtimeDebug]', {
        context: 'realtime-task-update-event-received',
        eventType: 'realtime:task-update',
        eventDetail: event.detail,
        currentFilter: selectedFilter,
        currentPage,
        realtimeConnected,
        timestamp: Date.now()
      });
    };

    const handleTaskNew = (event: CustomEvent) => {
      console.log('[TasksPaneRealtimeDebug]', {
        context: 'realtime-task-new-event-received',
        eventType: 'realtime:task-new',
        eventDetail: event.detail,
        currentFilter: selectedFilter,
        currentPage,
        realtimeConnected,
        timestamp: Date.now()
      });
    };

    // Listen for realtime events
    window.addEventListener('realtime:task-update', handleTaskUpdate as EventListener);
    window.addEventListener('realtime:task-new', handleTaskNew as EventListener);

    return () => {
      window.removeEventListener('realtime:task-update', handleTaskUpdate as EventListener);
      window.removeEventListener('realtime:task-new', handleTaskNew as EventListener);
    };
  }, [selectedFilter, currentPage, realtimeConnected]);
  
  // Update display data more aggressively - update when tasks are added OR removed
  useEffect(() => {
    const shouldUpdate = (!isPaginatedLoading && paginatedData) || 
                        (!displayPaginatedData && paginatedData) ||
                        // IMMEDIATE UPDATE: If we have new data with different task count, update immediately
                        (paginatedData && displayPaginatedData && 
                         (paginatedData as any).tasks.length !== (displayPaginatedData as any).tasks.length);
    
    if (shouldUpdate) {
      console.log('[TasksPaneRealtimeDebug]', {
        context: 'data-update-triggered',
        reason: !displayPaginatedData ? 'initial' : 'task_count_changed',
        previousTasksCount: (displayPaginatedData as any)?.tasks?.length || 0,
        newTasksCount: (paginatedData as any)?.tasks?.length || 0,
        countChange: ((paginatedData as any)?.tasks?.length || 0) - ((displayPaginatedData as any)?.tasks?.length || 0),
        isLoading: isPaginatedLoading,
        selectedFilter,
        currentPage,
        realtimeConnected,
        dataFreshness: {
          queryDataUpdatedAt: queryState?.dataUpdatedAt ? new Date(queryState.dataUpdatedAt).toISOString() : null,
          ageInMs: queryState?.dataUpdatedAt ? Date.now() - queryState.dataUpdatedAt : null,
          isStale: queryState?.isStale,
          wasRecentlyInvalidated: queryState?.isInvalidated
        },
        timestamp: Date.now()
      });
      
      setDisplayPaginatedData(paginatedData);
      
      // [TasksPaneCountMismatch] Track pagination data in TasksPane
      console.log('[TasksPaneCountMismatch]', {
        context: 'TasksPane:new-paginated-data',
        selectedFilter,
        currentPage,
        isLoading: isPaginatedLoading,
      tasksReceived: (paginatedData as any)?.tasks?.length || 0,
      totalFromHook: (paginatedData as any)?.total || 0,
      totalPagesFromHook: (paginatedData as any)?.totalPages || 0,
      hasMoreFromHook: (paginatedData as any)?.hasMore,
        calculatedOffset: (currentPage - 1) * ITEMS_PER_PAGE,
        expectedItemsPerPage: ITEMS_PER_PAGE,
        ISSUE_DETECTED: (paginatedData as any)?.tasks?.length === 0 && currentPage > 2 && ((paginatedData as any)?.total || 0) > 0,
        timestamp: Date.now()
      });

      // [TasksPaneCountMismatch] Mismatch detector between counts and visible items on page
      try {
        const tasks = (paginatedData as any)?.tasks || [];
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
      console.log('[PollingBreakageIssue] [TasksPane] Skipping display update', {
        context: 'TasksPane:skip-display-update',
        isLoading: isPaginatedLoading,
        hasPaginatedData: !!paginatedData,
        hasDisplayData: !!displayPaginatedData,
        selectedFilter,
        currentPage,
        reason: isPaginatedLoading ? 'still_loading' : 'no_new_data',
        paginatedDataTasksCount: paginatedData?.tasks?.length || 0,
        displayDataTasksCount: displayPaginatedData?.tasks?.length || 0,
        timestamp: Date.now()
      });
    }
  }, [paginatedData, isPaginatedLoading, displayPaginatedData, selectedFilter, currentPage]);
  
  // Get status counts for indicators
  const { data: statusCounts, isLoading: isStatusCountsLoading, error: statusCountsError } = useTaskStatusCounts(shouldLoadTasks ? selectedProjectId : null);
  
  // [TasksPaneRealtimeDebug] Track status counts hook results and freshness
  const statusCountsQueryState = queryClient.getQueryState(['task-status-counts', selectedProjectId]);
  
  console.log('[TasksPaneRealtimeDebug]', {
    context: 'status-counts-hook-results-and-freshness',
    hookParams: {
      projectId: shouldLoadTasks ? selectedProjectId : null,
    },
    hookResults: {
      isLoading: isStatusCountsLoading,
      hasData: !!statusCounts,
      statusCounts,
      error: statusCountsError,
    },
    queryFreshness: {
      status: statusCountsQueryState?.status,
      fetchStatus: statusCountsQueryState?.fetchStatus,
      dataUpdatedAt: statusCountsQueryState?.dataUpdatedAt ? new Date(statusCountsQueryState.dataUpdatedAt).toISOString() : null,
      ageInMs: statusCountsQueryState?.dataUpdatedAt ? Date.now() - statusCountsQueryState.dataUpdatedAt : null,
      isStale: statusCountsQueryState?.isStale,
      isInvalidated: statusCountsQueryState?.isInvalidated
    },
    realtimeConnected,
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
  
  // Note: We now use status counts total instead of per-page visible count for badge consistency

  // Always use paginated data total for perfect consistency between badge, pagination, and task list
  // For Processing filter: shows total processing tasks across all pages
  // For other filters: shows the processing tasks count from status counts (for the badge)
  const cancellableTaskCount = selectedFilter === 'Processing' 
    ? ((displayPaginatedData as any)?.total || 0)
    : (displayStatusCounts?.processing || 0);
  
  // Track count vs task list mismatch
  const currentTasksCount = (displayPaginatedData as any)?.tasks?.length || 0;
  const isProcessingFilter = selectedFilter === 'Processing';
  
  // Badge now uses status counts total, pagination uses database total - both should match
  const hasMismatch = false;
  
  // [TasksPaneRealtimeDebug] Comprehensive realtime behavior summary
  const paginatedQueryAge = queryState?.dataUpdatedAt ? Date.now() - queryState.dataUpdatedAt : null;
  const statusCountsQueryAge = statusCountsQueryState?.dataUpdatedAt ? Date.now() - statusCountsQueryState.dataUpdatedAt : null;
  
  console.log('[TasksPaneRealtimeDebug]', {
    context: 'comprehensive-realtime-behavior-summary',
    realtimeStatus: {
      connected: realtimeConnected,
      connecting: realtimeConnecting,
      error: realtimeError?.message || null
    },
    dataFreshness: {
      paginatedQuery: {
        ageInMs: paginatedQueryAge,
        ageInSeconds: paginatedQueryAge ? Math.round(paginatedQueryAge / 1000) : null,
        isStale: queryState?.isStale,
        status: queryState?.status,
        fetchStatus: queryState?.fetchStatus
      },
      statusCountsQuery: {
        ageInMs: statusCountsQueryAge,
        ageInSeconds: statusCountsQueryAge ? Math.round(statusCountsQueryAge / 1000) : null,
        isStale: statusCountsQueryState?.isStale,
        status: statusCountsQueryState?.status,
        fetchStatus: statusCountsQueryState?.fetchStatus
      }
    },
    possibleIssues: {
      realtimeDisconnected: !realtimeConnected,
      dataVeryStale: (paginatedQueryAge && paginatedQueryAge > 30000) || (statusCountsQueryAge && statusCountsQueryAge > 30000),
      queriesStillFetching: queryState?.fetchStatus === 'fetching' || statusCountsQueryState?.fetchStatus === 'fetching',
      likelyUsingPolling: !realtimeConnected && (queryState?.fetchStatus === 'fetching' || statusCountsQueryState?.fetchStatus === 'fetching')
    },
    currentState: {
      selectedFilter,
      currentPage,
      tasksDisplayed: (displayPaginatedData as any)?.tasks?.length || 0,
      badgeCount: cancellableTaskCount
    },
    timestamp: Date.now()
  });

  console.log('[TasksPane] Badge count calculation', {
    selectedFilter,
    statusCountsProcessing: displayStatusCounts?.processing || 0,
    paginatedTotal: (displayPaginatedData as any)?.total || 0,
    finalBadgeCount: cancellableTaskCount,
    usingPaginatedTotal: selectedFilter === 'Processing',
    totalTasksInView: (displayPaginatedData as any)?.tasks?.length || 0,
    timestamp: Date.now()
  });

  // [TaskDisplayDiag] Only log when there are actual changes to avoid noise
  const currentDisplayState = {
    paginatedTasksCount: paginatedData?.tasks?.length || 0,
    displayTasksCount: (displayPaginatedData as any)?.tasks?.length || 0,
    isLoadingState: isPaginatedLoading,
    connected: realtimeConnected
  };
  
  // Only log if something meaningful changed
  const prevStateRef = React.useRef(currentDisplayState);
  const hasStateChanged = JSON.stringify(currentDisplayState) !== JSON.stringify(prevStateRef.current);
  
  if (hasStateChanged) {
    console.log('[TaskDisplayDiag] 📊 UI STATE CHANGED:', {
      queryStates: {
        paginatedLoading: isPaginatedLoading,
        paginatedError: !!paginatedError,
        paginatedDataExists: !!paginatedData,
        paginatedTasksCount: paginatedData?.tasks?.length || 0,
        statusCountsLoading: isStatusCountsLoading,
        statusCountsError: !!statusCountsError
      },
      displayLogic: {
        shouldShowTasks: shouldLoadTasks,
        hasDisplayData: !!displayPaginatedData,
        displayTasksCount: (displayPaginatedData as any)?.tasks?.length || 0,
        isLoadingState: isPaginatedLoading,
        isErrorState: !!paginatedError
      },
      realtimeHealth: {
        connected: realtimeConnected,
        connecting: realtimeConnecting,
        error: realtimeError?.message || null,
        lastUpdate: lastTaskUpdate?.timestamp || 'never',
        lastNewTask: lastNewTask?.timestamp || 'never'
      },
      timestamp: Date.now()
    });
    prevStateRef.current = currentDisplayState;
  }
  
  // NOTE: Mismatch detection is now handled by the unified polling system
  // which provides more robust detection and automatic resolution

  // [TasksPaneCountMismatch] Compare processing count badge to visible processing tasks on current page
  try {
    const pageTasks = (displayPaginatedData as any)?.tasks || [];
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
  
  // Shot management mutations
  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();

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

  // Lightbox handlers - passed down to TaskItems
  const handleOpenImageLightbox = (task: Task, media: GenerationRow) => {
    console.log('[TasksPane:BasedOn] 🖼️ Opening image lightbox:', {
      taskId: task.id.substring(0, 8),
      mediaId: media.id.substring(0, 8),
      hasBasedOn: !!(media as any).based_on,
      basedOn: (media as any).based_on?.substring(0, 8) || 'null',
      hasSourceGenerationId: !!media.sourceGenerationId,
      sourceGenerationId: media.sourceGenerationId?.substring(0, 8) || 'null',
      hasBasedOnInMetadata: !!(media.metadata as any)?.based_on,
      metadataBasedOn: (media.metadata as any)?.based_on?.substring(0, 8) || 'null',
      mediaKeys: Object.keys(media).join(', '),
    });
    
    setLightboxData({ type: 'image', task, media });
    setActiveTaskId(task.id);
    setIsTasksPaneOpenProgrammatic(true);
  };

  const handleOpenVideoLightbox = (task: Task, media: GenerationRow[], videoIndex: number) => {
    const firstMedia = media[videoIndex];
    console.log('[TasksPane:BasedOn] 🎥 Opening video lightbox:', {
      taskId: task.id.substring(0, 8),
      videoIndex,
      totalVideos: media.length,
      firstMediaId: firstMedia?.id.substring(0, 8),
      hasBasedOn: !!(firstMedia as any)?.based_on,
      basedOn: (firstMedia as any)?.based_on?.substring(0, 8) || 'null',
      hasSourceGenerationId: !!firstMedia?.sourceGenerationId,
      sourceGenerationId: firstMedia?.sourceGenerationId?.substring(0, 8) || 'null',
    });
    
    setLightboxData({ type: 'video', task, media, videoIndex });
    setActiveTaskId(task.id);
    setIsTasksPaneOpenProgrammatic(true);
  };

  const handleCloseLightbox = () => {
    setLightboxData(null);
    setActiveTaskId(null);
  };

  // Handler for opening external generation (for "Based On" navigation)
  const handleOpenExternalGeneration = useCallback(async (
    generationId: string,
    derivedContext?: string[]
  ) => {
    console.log('[TasksPane:BasedOn] 🌐 Opening external generation:', {
      generationId: generationId.substring(0, 8),
      hasDerivedContext: !!derivedContext,
      timestamp: Date.now()
    });

    try {
      // Fetch the generation from the database with its shot associations
      const { data, error } = await supabase
        .from('generations')
        .select(`
          *,
          shot_generations(shot_id, timeline_frame)
        `)
        .eq('id', generationId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        // The database field is 'based_on' at the top level
        const basedOnValue = (data as any).based_on || (data.metadata as any)?.based_on || null;
        
        console.log('[TasksPane:BasedOn] 📦 Raw data from DB:', {
          id: data.id.substring(0, 8),
          hasBasedOnAtTopLevel: !!(data as any).based_on,
          basedOnAtTopLevel: (data as any).based_on?.substring(0, 8) || 'null',
          hasBasedOnInMetadata: !!(data.metadata as any)?.based_on,
          metadataBasedOn: (data.metadata as any)?.based_on?.substring(0, 8) || 'null',
          finalBasedOnValue: basedOnValue?.substring(0, 8) || 'null',
          allKeys: Object.keys(data).join(', '),
        });
        
        // Transform the data to match GenerationRow format
        const shotGenerations = (data as any).shot_generations || [];
        
        // Database fields: location (full image), thumbnail_url (thumb)
        const imageUrl = (data as any).location || (data as any).upscaled_url || (data as any).thumbnail_url;
        const thumbUrl = (data as any).thumbnail_url || (data as any).location;
        
        console.log('[TasksPane:BasedOn] 🖼️ Image URL details:', {
          id: data.id.substring(0, 8),
          hasLocation: !!(data as any).location,
          hasThumbnailUrl: !!(data as any).thumbnail_url,
          hasUpscaledUrl: !!(data as any).upscaled_url,
          locationPreview: ((data as any).location || '').substring(0, 80),
          thumbnailUrlPreview: ((data as any).thumbnail_url || '').substring(0, 80),
          finalImageUrl: imageUrl?.substring(0, 80) || 'null',
          finalThumbUrl: thumbUrl?.substring(0, 80) || 'null',
        });
        
        const transformedData: GenerationRow = {
          id: data.id,
          location: (data as any).location,
          imageUrl,
          thumbUrl,
          videoUrl: (data as any).video_url || null,
          createdAt: data.created_at,
          taskId: data.task_id,
          metadata: data.metadata,
          starred: data.starred || false,
          // CRITICAL: Include based_on at TOP LEVEL for MediaLightbox
          based_on: basedOnValue,
          // Also include as sourceGenerationId for compatibility
          sourceGenerationId: basedOnValue,
          // Add shot associations
          shotIds: shotGenerations.map((sg: any) => sg.shot_id),
          timelineFrames: shotGenerations.reduce((acc: any, sg: any) => {
            acc[sg.shot_id] = sg.timeline_frame;
            return acc;
          }, {}),
        } as any;
        
        console.log('[TasksPane:BasedOn] ✅ Transformed data:', {
          id: transformedData.id.substring(0, 8),
          based_on: (transformedData as any).based_on?.substring(0, 8) || 'null',
          hasBasedOn: !!(transformedData as any).based_on,
        });
        
        // Update lightbox to show this generation
        // We don't have the original task, so we'll use a minimal task object
        const minimalTask: Task = {
          id: data.task_id || 'unknown',
          status: 'Complete',
          taskType: 'unknown',
          createdAt: data.created_at,
          updatedAt: data.created_at,
          projectId: selectedProjectId || '',
        } as Task;
        
        setLightboxData({
          type: transformedData.videoUrl ? 'video' : 'image',
          task: minimalTask,
          media: transformedData,
        });
        
        console.log('[TasksPane:BasedOn] 🎯 Lightbox data set with media:', {
          mediaId: transformedData.id.substring(0, 8),
          hasBasedOn: !!(transformedData as any).based_on,
        });
      }
    } catch (error) {
      console.error('[TasksPane:BasedOn] ❌ Failed to fetch external generation:', error);
      sonnerToast.error('Failed to load generation');
    }
  }, [selectedProjectId]);

  // Optimistic update handlers
  const handleOptimisticPositioned = useCallback((mediaId: string) => {
    console.log('[TasksPane:AddToShot] ➕ Optimistically marking as positioned:', mediaId.substring(0, 8));
    setOptimisticPositionedIds(prev => new Set(prev).add(mediaId));
    setOptimisticUnpositionedIds(prev => {
      const next = new Set(prev);
      next.delete(mediaId);
      return next;
    });
  }, []);
  
  const handleOptimisticUnpositioned = useCallback((mediaId: string) => {
    console.log('[TasksPane:AddToShot] ➕ Optimistically marking as unpositioned:', mediaId.substring(0, 8));
    setOptimisticUnpositionedIds(prev => new Set(prev).add(mediaId));
    setOptimisticPositionedIds(prev => {
      const next = new Set(prev);
      next.delete(mediaId);
      return next;
    });
  }, []);

  // Handler for adding generation to shot (with position)
  const handleAddToShot = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    const targetShotId = currentShotId || lastAffectedShotId;
    
    console.log('[TasksPane:AddToShot] 🎯 Add to shot requested:', {
      generationId: generationId.substring(0, 8),
      targetShotId: targetShotId?.substring(0, 8) || 'none',
      hasCurrentShotId: !!currentShotId,
      hasLastAffectedShotId: !!lastAffectedShotId,
      hasImageUrl: !!imageUrl,
      hasThumbUrl: !!thumbUrl,
      selectedProjectId: selectedProjectId?.substring(0, 8) || 'none',
      timestamp: Date.now()
    });
    
    if (!targetShotId) {
      console.error('[TasksPane:AddToShot] ❌ No shot selected');
      sonnerToast.error('No shot selected. Please select a shot first.');
      return false;
    }
    
    if (!selectedProjectId) {
      console.error('[TasksPane:AddToShot] ❌ No project selected');
      sonnerToast.error('No project selected');
      return false;
    }
    
    // Optimistically update UI
    handleOptimisticPositioned(generationId);
    
    try {
      await addImageToShotMutation.mutateAsync({
        shot_id: targetShotId,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });
      
      console.log('[TasksPane:AddToShot] ✅ Successfully added to shot');
      // Toast removed per user request - button state change is sufficient feedback
      return true;
    } catch (error) {
      console.error('[TasksPane:AddToShot] ❌ Failed to add to shot:', error);
      // Revert optimistic update on error
      setOptimisticPositionedIds(prev => {
        const next = new Set(prev);
        next.delete(generationId);
        return next;
      });
      sonnerToast.error('Failed to add to shot');
      return false;
    }
  }, [currentShotId, lastAffectedShotId, selectedProjectId, addImageToShotMutation, handleOptimisticPositioned]);
  
  // Handler for adding generation to shot (without position)
  const handleAddToShotWithoutPosition = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    const targetShotId = currentShotId || lastAffectedShotId;
    
    console.log('[TasksPane:AddToShot] 🎯 Add to shot without position requested:', {
      generationId: generationId.substring(0, 8),
      targetShotId: targetShotId?.substring(0, 8) || 'none',
      hasCurrentShotId: !!currentShotId,
      hasLastAffectedShotId: !!lastAffectedShotId,
      hasImageUrl: !!imageUrl,
      hasThumbUrl: !!thumbUrl,
      selectedProjectId: selectedProjectId?.substring(0, 8) || 'none',
      timestamp: Date.now()
    });
    
    if (!targetShotId) {
      console.error('[TasksPane:AddToShot] ❌ No shot selected');
      sonnerToast.error('No shot selected. Please select a shot first.');
      return false;
    }
    
    if (!selectedProjectId) {
      console.error('[TasksPane:AddToShot] ❌ No project selected');
      sonnerToast.error('No project selected');
      return false;
    }
    
    // Optimistically update UI
    handleOptimisticUnpositioned(generationId);
    
    try {
      await addImageToShotWithoutPositionMutation.mutateAsync({
        shot_id: targetShotId,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });
      
      console.log('[TasksPane:AddToShot] ✅ Successfully added to shot without position');
      // Toast removed per user request - button state change is sufficient feedback
      return true;
    } catch (error) {
      console.error('[TasksPane:AddToShot] ❌ Failed to add to shot without position:', error);
      // Revert optimistic update on error
      setOptimisticUnpositionedIds(prev => {
        const next = new Set(prev);
        next.delete(generationId);
        return next;
      });
      sonnerToast.error('Failed to add to shot');
      return false;
    }
  }, [currentShotId, lastAffectedShotId, selectedProjectId, addImageToShotWithoutPositionMutation, handleOptimisticUnpositioned]);

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

    // Optimistically update all processing tasks to 'Cancelled' status immediately
    // This will hide "Check Progress" buttons instantly
    const queryKey = ['tasks', 'paginated', selectedProjectId, STATUS_GROUPS[selectedFilter], ITEMS_PER_PAGE, (currentPage - 1) * ITEMS_PER_PAGE];
    const previousData = queryClient.getQueryData(queryKey);
    
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!oldData?.tasks) return oldData;
      
      return {
        ...oldData,
        tasks: oldData.tasks.map((task: any) => {
          if (task.status === 'Queued' || task.status === 'In Progress') {
            return { ...task, status: 'Cancelled' };
          }
          return task;
        }),
      };
    });

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
        // Revert the optimistic update on error
        queryClient.setQueryData(queryKey, previousData);
        toast({
          title: 'Cancellation Failed',
          description: (error as Error).message || 'Could not cancel all active tasks.',
          variant: 'destructive',
        });
      },
    });
  };

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave, isMobile } = useSlidingPane({
    side: 'right',
    isLocked: isTasksPaneLocked,
    onToggleLock: () => setIsTasksPaneLocked(!isTasksPaneLocked),
  });
  
  // On desktop, override isOpen with programmatic state when set
  const effectiveIsOpen = !isMobile && isTasksPaneOpenProgrammatic ? true : isOpen;

  // Delay pointer events until animation completes to prevent tap bleed-through on mobile
  const [isAnimating, setIsAnimating] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      // Disable pointer events for 300ms (matching the transition duration)
      const timeoutId = setTimeout(() => {
        setIsAnimating(false);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // Calculate pagination info - use paginated data total for perfect consistency with badge
  const totalTasks = (displayPaginatedData as any)?.total || 0;
  const totalPages = Math.ceil(totalTasks / ITEMS_PER_PAGE);

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
            'absolute top-0 right-0 h-full w-full bg-zinc-900/95 border-l border-zinc-600 shadow-xl transform transition-transform duration-300 ease-smooth flex flex-col',
            !isMobile && effectiveIsOpen ? 'translate-x-0' : transformClass,
            'pointer-events-auto' // Always allow hover detection for pane visibility
          )}
        >
          {/* Inner wrapper with delayed pointer events to prevent tap bleed-through */}
          <div 
            className={cn(
              'flex flex-col h-full',
              isMobile
                ? (isAnimating || !isOpen ? 'pointer-events-none' : 'pointer-events-auto')
                : (effectiveIsOpen ? 'pointer-events-auto' : 'pointer-events-none')
            )}
          >
            <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-light text-zinc-200 ml-2">Tasks</h2>
              <div className="flex gap-2">
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
          </div>
          
          {/* Status Filter Toggle */}
          <div className="p-4 border-b border-zinc-800 flex-shrink-0">
            <div className="bg-zinc-800 rounded-lg p-1 space-y-1">
              {/* Processing button - full width on top */}
              {(() => {
                const filter = 'Processing' as FilterGroup;
                // Use the same status counts total that the badge uses
                const count = cancellableTaskCount;
                
                // Debug: Log what we're showing vs what we have
                console.log('[TasksPane] Processing button count debug', {
                  buttonCount: count,
                  source: 'paginatedData.total (actual count from query)',
                  paginatedTotal: (displayPaginatedData as any)?.total,
                  tasksOnCurrentPage: (displayPaginatedData as any)?.tasks?.length,
                  selectedFilter,
                  currentPage,
                  timestamp: Date.now()
                });
                
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
                    // Show total count from paginated data when viewing that filter
                    // This makes the badge consistent with the task list
                    if (selectedFilter === filter) {
                      return (displayPaginatedData as any)?.total || 0;
                    }
                    
                    // When not viewing this filter, show recent count (past hour)
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
            paginatedData={displayPaginatedData as any}
            isLoading={isPaginatedLoading}
            currentPage={currentPage}
            activeTaskId={activeTaskId}
            onOpenImageLightbox={handleOpenImageLightbox}
            onOpenVideoLightbox={handleOpenVideoLightbox}
          />
          </div>
          </div> {/* Close inner wrapper with delayed pointer events */}
        </div>
      </div>

      {/* Centralized MediaLightbox - rendered via portal */}
      {lightboxData && (() => {
        // For videos, extract the specific video from the array
        const actualMedia = lightboxData.type === 'video' && Array.isArray(lightboxData.media)
          ? lightboxData.media[lightboxData.videoIndex ?? 0]
          : lightboxData.media;
        
        // Handle navigation for video arrays
        const handleNext = lightboxData.type === 'video' && Array.isArray(lightboxData.media) 
          ? () => {
              const currentIndex = lightboxData.videoIndex ?? 0;
              if (currentIndex < lightboxData.media.length - 1) {
                setLightboxData({ ...lightboxData, videoIndex: currentIndex + 1 });
              }
            }
          : undefined;
        
        const handlePrevious = lightboxData.type === 'video' && Array.isArray(lightboxData.media)
          ? () => {
              const currentIndex = lightboxData.videoIndex ?? 0;
              if (currentIndex > 0) {
                setLightboxData({ ...lightboxData, videoIndex: currentIndex - 1 });
              }
            }
          : undefined;
        
        const currentIndex = lightboxData.videoIndex ?? 0;
        const totalVideos = Array.isArray(lightboxData.media) ? lightboxData.media.length : 1;
        
        return createPortal(
          <MediaLightbox
            media={actualMedia as GenerationRow}
            onClose={() => {
              // Reset dropdown to current shot when closing
              setLightboxSelectedShotId(currentShotId || lastAffectedShotId || undefined);
              handleCloseLightbox();
            }}
            onNext={handleNext}
            onPrevious={handlePrevious}
            showNavigation={lightboxData.type === 'video' && totalVideos > 1}
            hasNext={lightboxData.type === 'video' && currentIndex < totalVideos - 1}
            hasPrevious={lightboxData.type === 'video' && currentIndex > 0}
            showImageEditTools={lightboxData.type === 'image'}
            showDownload={true}
            showMagicEdit={lightboxData.type === 'image'}
            showTaskDetails={true}
            taskDetailsData={taskDetailsData}
            allShots={simplifiedShotOptions}
            selectedShotId={lightboxSelectedShotId || currentShotId || lastAffectedShotId || undefined}
            onShotChange={(shotId) => {
              console.log('[TasksPane:AddToShot] 📝 Shot change requested:', {
                newShotId: shotId.substring(0, 8),
                timestamp: Date.now()
              });
              setLightboxSelectedShotId(shotId);
            }}
            onAddToShot={handleAddToShot}
            onAddToShotWithoutPosition={handleAddToShotWithoutPosition}
            optimisticPositionedIds={optimisticPositionedIds}
            optimisticUnpositionedIds={optimisticUnpositionedIds}
            onOptimisticPositioned={handleOptimisticPositioned}
            onOptimisticUnpositioned={handleOptimisticUnpositioned}
            showTickForImageId={undefined}
            onShowTick={async (imageId) => {
              console.log('[TasksPane:AddToShot] ✓ Show tick requested:', {
                imageId: imageId.substring(0, 8),
                timestamp: Date.now()
              });
            }}
            onOpenExternalGeneration={handleOpenExternalGeneration}
            tasksPaneOpen={true}
            tasksPaneWidth={tasksPaneWidth}
          />,
          document.body
        );
      })()}
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