import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import TaskList from './TaskList';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCancelAllPendingTasks, useTaskStatusCounts, usePaginatedTasks, useAllTaskTypes } from '@/shared/hooks/useTasks';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useToast } from '@/shared/hooks/use-toast';
import { TasksPaneProcessingWarning } from '../ProcessingWarnings';
import { useBottomOffset } from '@/shared/hooks/useBottomOffset';
import { getTaskDisplayName } from '@/shared/lib/taskConfig';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useListShots } from '@/shared/hooks/useShots';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/shared/components/ui/select';

// Import from new modules
import { ITEMS_PER_PAGE, STATUS_GROUPS, FilterGroup } from './constants';
import { StatusIndicator, PaginationControls } from './components';
import { useTasksLightbox, useShotActions } from './hooks';

interface TasksPaneProps {
  onOpenSettings: () => void;
}

const TasksPaneComponent: React.FC<TasksPaneProps> = ({ onOpenSettings }) => {
  const queryClient = useQueryClient();
  
  // Expose queryClient globally for diagnostics
  useEffect(() => {
    if (typeof window !== 'undefined' && queryClient) {
      (window as any).__REACT_QUERY_CLIENT__ = queryClient;
    }
  }, [queryClient]);

  const {
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
  
  // Task type filter state - null means "All types"
  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null);
  
  // Project scope filter - 'current' shows current project, 'all' shows all projects, or a specific project ID
  const [projectScope, setProjectScope] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem('tasks-pane-project-scope');
      if (stored) return stored;
    } catch (e) { /* Session storage not available */ }
    return 'current';
  });
  
  // Save project scope to session storage when it changes
  useEffect(() => {
    try {
      sessionStorage.setItem('tasks-pane-project-scope', projectScope);
    } catch (e) { /* Session storage not available */ }
  }, [projectScope]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  
  // Mobile two-step tap interaction state
  const [mobileActiveTaskId, setMobileActiveTaskId] = useState<string | null>(null);

  // Project context & task helpers
  const { selectedProjectId, projects } = useProject();
  const shouldLoadTasks = !!selectedProjectId;
  
  // Get all project IDs for "all projects" mode
  const allProjectIds = useMemo(() => projects.map(p => p.id), [projects]);
  
  // Create a lookup map for project names
  const projectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach(p => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);
  
  // Shots data for lightbox
  const { data: shots } = useListShots(selectedProjectId);
  const { currentShotId } = useCurrentShot();
  const { lastAffectedShotId } = useLastAffectedShot();

  // Get incoming/placeholder tasks for count calculation
  const { incomingTasks } = useIncomingTasks();
  
  // Simplified shot options for MediaLightbox
  const simplifiedShotOptions = useMemo(() => shots?.map(s => ({ id: s.id, name: s.name })) || [], [shots]);

  // Use extracted lightbox hook
  const {
    lightboxData,
    lightboxSelectedShotId,
    setLightboxSelectedShotId,
    taskDetailsData,
    lightboxProps,
    handleOpenImageLightbox,
    handleOpenVideoLightbox,
    handleCloseLightbox,
    handleOpenExternalGeneration,
  } = useTasksLightbox({
    selectedProjectId,
    currentShotId,
    lastAffectedShotId,
    setActiveTaskId,
    setIsTasksPaneOpen: setIsTasksPaneOpenProgrammatic,
  });

  // Use extracted shot actions hook
  const {
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    handleOptimisticPositioned,
    handleOptimisticUnpositioned,
  } = useShotActions({
    lightboxSelectedShotId,
    currentShotId,
    lastAffectedShotId,
    selectedProjectId,
  });
  
  // Determine the effective project ID(s) based on scope
  const effectiveProjectId = projectScope === 'current' 
    ? selectedProjectId 
    : projectScope !== 'all' 
      ? projectScope
      : null;
  
  const isAllProjectsMode = projectScope === 'all';
  
  // Get paginated tasks
  const { data: paginatedData, isLoading: isPaginatedLoading } = usePaginatedTasks({
    projectId: shouldLoadTasks ? effectiveProjectId : null,
    status: STATUS_GROUPS[selectedFilter],
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
    taskType: selectedTaskType,
    allProjects: isAllProjectsMode,
    allProjectIds: isAllProjectsMode ? allProjectIds : undefined,
  });

  // Get status counts for indicators
  const { data: statusCounts, isLoading: isStatusCountsLoading } = useTaskStatusCounts(shouldLoadTasks ? selectedProjectId : null);
  
  // Fetch all unique task types for this project
  const { data: allTaskTypes } = useAllTaskTypes(shouldLoadTasks ? selectedProjectId : null);
  
  // Convert to dropdown options format
  const taskTypeOptions = useMemo(() => {
    if (!allTaskTypes || allTaskTypes.length === 0) return [];
    
    return allTaskTypes
      .map(taskType => ({
        value: taskType,
        label: getTaskDisplayName(taskType),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allTaskTypes]);
  
  // Store previous status counts to avoid flickering during loading
  const [displayStatusCounts, setDisplayStatusCounts] = useState<typeof statusCounts>(statusCounts);
  
  useEffect(() => {
    if ((!isStatusCountsLoading && statusCounts) || (!displayStatusCounts && statusCounts)) {
      setDisplayStatusCounts(statusCounts);
    }
  }, [statusCounts, isStatusCountsLoading, displayStatusCounts]);

  // Calculate the effective count including incoming/placeholder tasks
  const dbCount = selectedFilter === 'Processing'
    ? ((paginatedData as any)?.total || 0)
    : (displayStatusCounts?.processing || 0);

  const cancellableTaskCount = useMemo(() => {
    if (incomingTasks.length === 0) return dbCount;

    // While placeholders exist, show a fixed expected count (ignore dbCount fluctuations)
    // Use the oldest placeholder's baseline (last in array since we prepend new ones)
    const oldestTask = incomingTasks[incomingTasks.length - 1];
    const baseline = oldestTask.baselineCount ?? dbCount;
    const totalExpected = incomingTasks.reduce((sum, t) => sum + (t.expectedCount ?? 1), 0);

    // Show expected final count, but never less than actual dbCount
    // (handles case where other unrelated tasks complete)
    return Math.max(dbCount, baseline + totalExpected);
  }, [dbCount, incomingTasks]);

  const cancelAllPendingMutation = useCancelAllPendingTasks();
  const { toast } = useToast();

  useRenderLogger('TasksPane', { cancellableCount: cancellableTaskCount });

  // Filter/pagination handlers
  const handleFilterChange = (filter: FilterGroup) => {
    setSelectedFilter(filter);
    setCurrentPage(1);
    setMobileActiveTaskId(null);
  };
  
  const handleTaskTypeChange = (taskType: string | null) => {
    setSelectedTaskType(taskType);
    setCurrentPage(1);
    setMobileActiveTaskId(null);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setMobileActiveTaskId(null);
  };

  const handleStatusIndicatorClick = (type: FilterGroup, count: number) => {
    setSelectedFilter(type);
    setCurrentPage(1);
    
    if ((type === 'Succeeded' || type === 'Failed') && count > 0) {
      return;
    }
    
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

    const queryKey = ['tasks', 'paginated', selectedProjectId, STATUS_GROUPS[selectedFilter], ITEMS_PER_PAGE, (currentPage - 1) * ITEMS_PER_PAGE];
    const previousData = queryClient.getQueryData(queryKey);
    
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!oldData?.tasks) return oldData;

      return {
        ...oldData,
        tasks: oldData.tasks.map((task: any) => {
          if (task.status === 'Queued') {
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
        
        queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
        queryClient.refetchQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
      },
      onError: (error) => {
        console.error('Cancel-All failed:', error);
        queryClient.setQueryData(queryKey, previousData);
        toast({
          title: 'Cancellation Failed',
          description: (error as Error).message || 'Could not cancel all active tasks.',
          variant: 'destructive',
        });
      },
    });
  };

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave, isMobile, showBackdrop, closePane } = useSlidingPane({
    side: 'right',
    isLocked: isTasksPaneLocked,
    onToggleLock: () => {
      const willBeLocked = !isTasksPaneLocked;
      setIsTasksPaneLocked(willBeLocked);
      setIsTasksPaneOpenProgrammatic(willBeLocked);
    },
  });
  
  const effectiveIsOpen = !isMobile 
    ? (isTasksPaneLocked || isTasksPaneOpenProgrammatic)
    : isOpen;

  const [isAnimating, setIsAnimating] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      const timeoutId = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  const totalTasks = (paginatedData as any)?.total || 0;
  const totalPages = Math.ceil(totalTasks / ITEMS_PER_PAGE);

  return (
    <>
      {/* Backdrop overlay for mobile */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-[59] touch-none"
          onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); closePane(); }}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); closePane(); }}
          aria-hidden="true"
        />
      )}
      
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
          content: <span className="text-xs font-light">{cancellableTaskCount}</span>,
          tooltip: `${cancellableTaskCount} active task${cancellableTaskCount === 1 ? '' : 's'}`
        }}
        paneIcon="tasks"
        paneTooltip="View all tasks"
        dataTour="tasks-pane-tab"
      />
      
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: `${tasksPaneWidth}px`,
          zIndex: 60,
        }}
      >
        <div
          {...paneProps}
          data-tasks-pane="true"
          data-scroll-lock-scrollable="true"
          className={cn(
            'absolute top-0 right-0 h-full w-full bg-zinc-900/95 border-l border-zinc-600 shadow-xl transform transition-transform duration-300 ease-smooth flex flex-col',
            !isMobile
              ? (effectiveIsOpen ? 'translate-x-0' : 'translate-x-full')
              : transformClass,
            'pointer-events-auto'
          )}
        >
          <div 
            className={cn(
              'flex flex-col h-full',
              isMobile
                ? (isAnimating || !isOpen ? 'pointer-events-none' : 'pointer-events-auto')
                : (effectiveIsOpen ? 'pointer-events-auto' : 'pointer-events-none')
            )}
          >
            {/* Header */}
            <div className="p-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-light text-zinc-200 ml-2">Tasks</h2>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent>Cancel all queued tasks</TooltipContent>
                </Tooltip>
              </div>
            </div>
          
            {/* Status Filter Toggle */}
            <div className="p-4 border-b border-zinc-800 flex-shrink-0">
              <div className="bg-zinc-800 rounded-lg p-1 space-y-1">
                {/* Processing button */}
                <Button
                  variant={selectedFilter === 'Processing' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleFilterChange('Processing')}
                  className={cn(
                    "w-full text-xs flex items-center justify-center",
                    selectedFilter === 'Processing' 
                      ? "bg-zinc-600 text-zinc-100 md:hover:bg-zinc-500" 
                      : "text-zinc-400 md:hover:text-zinc-200 md:hover:bg-zinc-700"
                  )}
                >
                  <span>Processing</span>
                  <StatusIndicator
                    count={cancellableTaskCount}
                    type="Processing"
                    isSelected={selectedFilter === 'Processing'}
                  />
                </Button>
                
                {/* Succeeded and Failed buttons */}
                <div className="flex gap-1">
                  {(['Succeeded', 'Failed'] as FilterGroup[]).map((filter) => {
                    const count = filter === 'Succeeded' 
                      ? (displayStatusCounts?.recentSuccesses || 0)
                      : (displayStatusCounts?.recentFailures || 0);
                    
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
                          onClick={() => handleStatusIndicatorClick(filter, count)}
                        />
                      </Button>
                    );
                  })}
                </div>
              </div>
              
              {/* Task Type + Project Scope Filters */}
              <div className="mt-2 flex items-center gap-2">
                <Select
                  value={selectedTaskType || 'all'}
                  onValueChange={(value) => handleTaskTypeChange(value === 'all' ? null : value)}
                >
                  <SelectTrigger variant="retro-dark" size="sm" colorScheme="zinc" className="h-7 !text-xs flex-1 min-w-0">
                    <SelectValue placeholder="All task types" />
                  </SelectTrigger>
                  <SelectContent variant="zinc">
                    <SelectItem variant="zinc" value="all" className="!text-xs">All task types</SelectItem>
                    {taskTypeOptions.length > 0 && <SelectSeparator className="bg-zinc-700" />}
                    {taskTypeOptions.map((type) => (
                      <SelectItem variant="zinc" key={type.value} value={type.value} className="!text-xs">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select
                  value={projectScope}
                  onValueChange={(value) => {
                    setProjectScope(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger variant="retro-dark" size="sm" colorScheme="zinc" className="h-7 !text-xs flex-1 min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent variant="zinc">
                    <SelectItem variant="zinc" value="current" className="!text-xs">This project</SelectItem>
                    <SelectItem variant="zinc" value="all" className="!text-xs">All projects</SelectItem>
                    {projects.filter(p => p.id !== selectedProjectId).length > 0 && <SelectSeparator className="bg-zinc-700" />}
                    {projects
                      .filter(p => p.id !== selectedProjectId)
                      .sort((a, b) => {
                        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return bDate - aDate;
                      })
                      .map((project) => (
                        <SelectItem variant="zinc" key={project.id} value={project.id} className="!text-xs">
                          {project.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
            
            <div
              className="flex-grow overflow-y-auto"
              data-scroll-lock-scrollable="true"
            >
              <TaskList
                filterStatuses={STATUS_GROUPS[selectedFilter]}
                activeFilter={selectedFilter}
                statusCounts={displayStatusCounts}
                paginatedData={paginatedData as any}
                isLoading={isPaginatedLoading}
                currentPage={currentPage}
                activeTaskId={activeTaskId}
                onOpenImageLightbox={handleOpenImageLightbox}
                onOpenVideoLightbox={handleOpenVideoLightbox}
                mobileActiveTaskId={mobileActiveTaskId}
                onMobileActiveTaskChange={setMobileActiveTaskId}
                taskTypeFilter={selectedTaskType}
                showProjectIndicator={isAllProjectsMode}
                projectNameMap={projectNameMap}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Centralized MediaLightbox */}
      {lightboxData && lightboxProps && createPortal(
        <MediaLightbox
          media={lightboxProps.media}
          onClose={handleCloseLightbox}
          onNext={lightboxProps.onNext}
          onPrevious={lightboxProps.onPrevious}
          showNavigation={lightboxProps.showNavigation}
          hasNext={lightboxProps.hasNext}
          hasPrevious={lightboxProps.hasPrevious}
          showImageEditTools={lightboxProps.showImageEditTools}
          showDownload={true}
          showMagicEdit={lightboxProps.showMagicEdit}
          showTaskDetails={true}
          taskDetailsData={taskDetailsData}
          allShots={simplifiedShotOptions}
          selectedShotId={lightboxSelectedShotId || currentShotId || lastAffectedShotId || undefined}
          onShotChange={setLightboxSelectedShotId}
          onAddToShot={handleAddToShot}
          onAddToShotWithoutPosition={handleAddToShotWithoutPosition}
          optimisticPositionedIds={optimisticPositionedIds}
          optimisticUnpositionedIds={optimisticUnpositionedIds}
          onOptimisticPositioned={handleOptimisticPositioned}
          onOptimisticUnpositioned={handleOptimisticUnpositioned}
          showTickForImageId={undefined}
          onShowTick={async () => {}}
          onOpenExternalGeneration={handleOpenExternalGeneration}
          tasksPaneOpen={true}
          tasksPaneWidth={tasksPaneWidth}
          initialVariantId={lightboxProps.initialVariantId}
        />,
        document.body
      )}
    </>
  );
};

// Memoize TasksPane with custom comparison
export const TasksPane = React.memo(TasksPaneComponent, (prevProps, nextProps) => {
  return prevProps.onOpenSettings === nextProps.onOpenSettings;
});

export default TasksPane;
