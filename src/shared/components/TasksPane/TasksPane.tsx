import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRenderLogger } from '@/shared/hooks/useRenderLogger';
import TaskList from './TaskList';
import { cn } from '@/shared/lib/utils'; // For conditional classnames
import { Button } from '@/shared/components/ui/button'; // For the lock button
import { LockIcon, UnlockIcon, ChevronLeft, ChevronRight, Loader2, Filter, X } from 'lucide-react'; // Example icons
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCancelAllPendingTasks, useTaskStatusCounts, usePaginatedTasks, useAllTaskTypes, type PaginatedTasksResponse } from '@/shared/hooks/useTasks';
import { useToast } from '@/shared/hooks/use-toast';
import { TasksPaneProcessingWarning } from '../ProcessingWarnings';
import { TASK_STATUS, TaskStatus } from '@/types/database';
import { useBottomOffset } from '@/shared/hooks/useBottomOffset';
import { filterVisibleTasks, isTaskVisible, getTaskDisplayName } from '@/shared/lib/taskConfig';
import { useSimpleRealtime } from '@/shared/providers/SimpleRealtimeProvider';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { GenerationRow } from '@/types/shots';
import { Task } from '@/types/tasks';
import { useListShots, useAddImageToShot, useAddImageToShotWithoutPosition } from '@/shared/hooks/useShots';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { supabase } from '@/integrations/supabase/client';
import { toast as sonnerToast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/shared/components/ui/select';

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
        isSelected ? "bg-foreground/20" : "bg-foreground/10 md:hover:bg-foreground/15"
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
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {/* Page selector dropdown */}
        <Select 
          value={currentPage.toString()} 
          onValueChange={(value) => onPageChange(parseInt(value))}
          disabled={isLoading}
        >
          <SelectTrigger variant="retro-dark" colorScheme="zinc" size="sm" className="h-6 w-9 text-xs px-1" hideIcon>
            <SelectValue />
          </SelectTrigger>
          <SelectContent variant="zinc">
            {Array.from({ length: totalPages }, (_, i) => (
              <SelectItem variant="zinc" key={i + 1} value={(i + 1).toString()} className="text-xs">
                {i + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-zinc-300 text-[11px]">
          of {totalPages}
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
  
  // Task type filter state - null means "All types"
  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null);
  
  // Project scope filter - 'current' shows current project, 'all' shows all projects, or a specific project ID
  const [projectScope, setProjectScope] = useState<string>(() => {
    // Restore from session storage if available
    try {
      const stored = sessionStorage.getItem('tasks-pane-project-scope');
      if (stored) {
        return stored;
      }
    } catch (e) {
      // Session storage not available
    }
    return 'current';
  });
  
  // Save project scope to session storage when it changes
  useEffect(() => {
    try {
      sessionStorage.setItem('tasks-pane-project-scope', projectScope);
    } catch (e) {
      // Session storage not available
    }
  }, [projectScope]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Lightbox state - hoisted here so pagination doesn't close it
  const [lightboxData, setLightboxData] = useState<{
    type: 'image' | 'video';
    task: Task;
    media: GenerationRow | GenerationRow[];
    videoIndex?: number;
    initialVariantId?: string;  // For opening directly to a specific variant
  } | null>(null);
  
  // Mobile two-step tap interaction state
  const [mobileActiveTaskId, setMobileActiveTaskId] = useState<string | null>(null);
  
  // Optimistic updates for "Add to Shot" button states
  const [optimisticPositionedIds, setOptimisticPositionedIds] = useState<Set<string>>(new Set());
  const [optimisticUnpositionedIds, setOptimisticUnpositionedIds] = useState<Set<string>>(new Set());

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
  
  // Simplified shot options for MediaLightbox
  const simplifiedShotOptions = React.useMemo(() => shots?.map(s => ({ id: s.id, name: s.name })) || [], [shots]);
  
  // Task details for current lightbox media
  // Derive input images from task params (helper function from useTaskDetails)
  const deriveInputImages = (task: any): string[] => {
    if (!task?.params) return [];
    const params = task.params;
    
    // For individual_travel_segment, use top-level or individual_segment_params (2 images only)
    if (task.taskType === 'individual_travel_segment') {
      const images = params.individual_segment_params?.input_image_paths_resolved || 
                     params.input_image_paths_resolved || 
                     [];
      return images.filter(Boolean);
    }
    
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
    // Also check top-level input_image_paths_resolved
    if (params.input_image_paths_resolved && Array.isArray(params.input_image_paths_resolved)) {
      inputImages.push(...params.input_image_paths_resolved);
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
  const { isConnected: realtimeConnected, isConnecting: realtimeConnecting, error: realtimeError } = useSimpleRealtime();
  
  // Determine the effective project ID(s) based on scope
  const effectiveProjectId = projectScope === 'current' 
    ? selectedProjectId 
    : projectScope !== 'all' 
      ? projectScope // Specific project ID selected
      : null;
  
  const isAllProjectsMode = projectScope === 'all';
  
  // Get paginated tasks - task type filter is now applied server-side
  const { data: paginatedData, isLoading: isPaginatedLoading, error: paginatedError, refetch: refetchPaginatedTasks } = usePaginatedTasks({
    projectId: shouldLoadTasks ? effectiveProjectId : null,
    status: STATUS_GROUPS[selectedFilter],
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
    taskType: selectedTaskType, // Server-side task type filter
    allProjects: isAllProjectsMode,
    allProjectIds: isAllProjectsMode ? allProjectIds : undefined,
  });

  // NOTE: Task invalidation is now handled by the centralized TaskInvalidationSubscriber
  // which provides better read-after-write consistency with exponential backoff retry
  
  // Get status counts for indicators
  const { data: statusCounts, isLoading: isStatusCountsLoading, error: statusCountsError } = useTaskStatusCounts(shouldLoadTasks ? selectedProjectId : null);
  
  // Fetch all unique task types for this project (across ALL statuses, ALL pages)
  // This ensures the filter shows all available task types, not just current page
  const { data: allTaskTypes } = useAllTaskTypes(shouldLoadTasks ? selectedProjectId : null);
  
  // Convert to dropdown options format
  const taskTypeOptions = React.useMemo(() => {
    console.log('[TaskTypeFilterDebug] Building dropdown options:', {
      allTaskTypes,
      hasAllTaskTypes: !!allTaskTypes,
      length: allTaskTypes?.length || 0,
    });
    if (!allTaskTypes || allTaskTypes.length === 0) return [];
    
    const options = allTaskTypes
      .map(taskType => ({
        value: taskType,
        label: getTaskDisplayName(taskType),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    console.log('[TaskTypeFilterDebug] Final options:', options);
    return options;
  }, [allTaskTypes]);
  
  // Store previous status counts to avoid flickering during loading
  const [displayStatusCounts, setDisplayStatusCounts] = useState<typeof statusCounts>(statusCounts);
  
  // Only update display counts when we have new data (not during loading) or when initializing
  useEffect(() => {
    if ((!isStatusCountsLoading && statusCounts) || (!displayStatusCounts && statusCounts)) {
      setDisplayStatusCounts(statusCounts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusCounts, isStatusCountsLoading]);
  
  // Note: We now use status counts total instead of per-page visible count for badge consistency

  // Always use paginated data total for perfect consistency between badge, pagination, and task list
  // For Processing filter: shows total processing tasks across all pages
  // For other filters: shows the processing tasks count from status counts (for the badge)
  const cancellableTaskCount = selectedFilter === 'Processing' 
    ? ((paginatedData as any)?.total || 0)
    : (displayStatusCounts?.processing || 0);
  
  // Track count vs task list mismatch
  const currentTasksCount = (paginatedData as any)?.tasks?.length || 0;
  const isProcessingFilter = selectedFilter === 'Processing';
  
  // Badge now uses status counts total, pagination uses database total - both should match
  const hasMismatch = false;

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
    setMobileActiveTaskId(null); // Clear mobile active state on filter change
    // Keep the task type filter when switching status filters
  };
  
  // Handle task type filter change
  const handleTaskTypeChange = (taskType: string | null) => {
    console.log('[TaskTypeFilterDebug] Filter changed:', {
      from: selectedTaskType,
      to: taskType,
      projectId: selectedProjectId?.substring(0, 8),
    });
    setSelectedTaskType(taskType);
    setCurrentPage(1);
    setMobileActiveTaskId(null);
  };

  // Handle page changes
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setMobileActiveTaskId(null); // Clear mobile active state on page change
  };

  // Lightbox handlers - passed down to TaskItems
  const handleOpenImageLightbox = (task: Task, media: GenerationRow) => {
    setLightboxData({ type: 'image', task, media });
    setActiveTaskId(task.id);
    setIsTasksPaneOpenProgrammatic(true);
  };

  const handleOpenVideoLightbox = (task: Task, media: GenerationRow[], videoIndex: number, initialVariantId?: string) => {
    setLightboxData({ type: 'video', task, media, videoIndex, initialVariantId });
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
        const basedOnValue = (data as any).based_on || (data as any).metadata?.based_on || null;
        
        // Transform the data to match GenerationRow format
        const shotGenerations = (data as any).shot_generations || [];
        
        // Database fields: location (full image), thumbnail_url (thumb)
        const imageUrl = (data as any).location || (data as any).thumbnail_url;
        const thumbUrl = (data as any).thumbnail_url || (data as any).location;
        
        const transformedData: GenerationRow = {
          id: data.id,
          location: (data as any).location,
          imageUrl,
          thumbUrl,
          videoUrl: (data as any).video_url || null,
          createdAt: data.created_at,
          taskId: (data as any).task_id,
          metadata: (data as any).metadata,
          starred: (data as any).starred || false,
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
        
        // Update lightbox to show this generation
        // We don't have the original task, so we'll use a minimal task object
        const minimalTask: Task = {
          id: (data as any).task_id || 'unknown',
          status: 'Complete',
          taskType: 'unknown',
          createdAt: data.created_at,
          updatedAt: data.created_at,
          projectId: selectedProjectId || '',
        } as Task;
        
        setLightboxData({
          type: (transformedData as any).videoUrl ? 'video' : 'image', // Safe access via any
          task: minimalTask,
          media: transformedData,
        });
      }
    } catch (error) {
      console.error('[TasksPane:BasedOn] ❌ Failed to fetch external generation:', error);
      sonnerToast.error('Failed to load generation');
    }
  }, [selectedProjectId]);

  // Optimistic update handlers - use composite key mediaId:shotId
  const handleOptimisticPositioned = useCallback((mediaId: string, shotId?: string) => {
    // Handle both old (simple) and new (composite) formats
    const key = shotId ? `${mediaId}:${shotId}` : mediaId;
    setOptimisticPositionedIds(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setOptimisticUnpositionedIds(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);
  
  const handleOptimisticUnpositioned = useCallback((mediaId: string, shotId?: string) => {
    // Handle both old (simple) and new (composite) formats
    const key = shotId ? `${mediaId}:${shotId}` : mediaId;
    setOptimisticUnpositionedIds(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setOptimisticPositionedIds(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Handler for adding generation to shot (with position)
  const handleAddToShot = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    // Prefer the locally selected shot in the lightbox, falling back to global current shot
    const targetShotId = lightboxSelectedShotId || currentShotId || lastAffectedShotId;
    
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
    
    // Optimistically update UI with composite key
    handleOptimisticPositioned(generationId, targetShotId);
    
    try {
      await addImageToShotMutation.mutateAsync({
        shot_id: targetShotId,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });
      
      // Toast removed per user request - button state change is sufficient feedback
      return true;
    } catch (error) {
      console.error('[TasksPane:AddToShot] ❌ Failed to add to shot:', error);
      // Revert optimistic update on error (use composite key)
      const key = `${generationId}:${targetShotId}`;
      setOptimisticPositionedIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      sonnerToast.error('Failed to add to shot');
      return false;
    }
  }, [lightboxSelectedShotId, currentShotId, lastAffectedShotId, selectedProjectId, addImageToShotMutation, handleOptimisticPositioned]);
  
  // Handler for adding generation to shot (without position)
  const handleAddToShotWithoutPosition = useCallback(async (
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    // Prefer the locally selected shot in the lightbox, falling back to global current shot
    const targetShotId = lightboxSelectedShotId || currentShotId || lastAffectedShotId;

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
    
    // Optimistically update UI with composite key
    handleOptimisticUnpositioned(generationId, targetShotId);
    
    try {
      await addImageToShotWithoutPositionMutation.mutateAsync({
        shot_id: targetShotId,
        generation_id: generationId,
        imageUrl,
        thumbUrl,
        project_id: selectedProjectId,
      });
      
      // Toast removed per user request - button state change is sufficient feedback
      return true;
    } catch (error) {
      console.error('[TasksPane:AddToShot] ❌ Failed to add to shot without position:', error);
      // Revert optimistic update on error (use composite key)
      const key = `${generationId}:${targetShotId}`;
      setOptimisticUnpositionedIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      sonnerToast.error('Failed to add to shot');
      return false;
    }
  }, [lightboxSelectedShotId, currentShotId, lastAffectedShotId, selectedProjectId, addImageToShotWithoutPositionMutation, handleOptimisticUnpositioned]);

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

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave, isMobile, showBackdrop, closePane } = useSlidingPane({
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
  const totalTasks = (paginatedData as any)?.total || 0;
  const totalPages = Math.ceil(totalTasks / ITEMS_PER_PAGE);

  return (
    <>
      {/* Backdrop overlay to capture taps outside the pane on mobile */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-[59] touch-none"
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
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
                  paginatedTotal: (paginatedData as any)?.total,
                  tasksOnCurrentPage: (paginatedData as any)?.tasks?.length,
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
                    // Always show recent count (past hour) for Succeeded/Failed
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
            
            {/* Task Type Filter + Project Scope Filter - side by side, 50% each */}
            <div className="mt-2 flex items-center gap-2">
              {/* Task Type Dropdown */}
              <Select
                value={selectedTaskType || 'all'}
                onValueChange={(value) => handleTaskTypeChange(value === 'all' ? null : value)}
              >
                <SelectTrigger variant="retro-dark" size="sm" colorScheme="zinc" className="h-7 !text-xs flex-1 min-w-0">
                  <SelectValue placeholder="All task types" />
                </SelectTrigger>
                <SelectContent variant="zinc">
                  <SelectItem variant="zinc" value="all" className="!text-xs">All task types</SelectItem>
                  {taskTypeOptions.map((type) => (
                    <SelectItem variant="zinc" key={type.value} value={type.value} className="!text-xs">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Project Scope Dropdown */}
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
                  {projects.filter(p => p.id !== selectedProjectId).length > 0 && (
                    <SelectSeparator className="bg-zinc-700" />
                  )}
                  {projects
                    .filter(p => p.id !== selectedProjectId)
                    .sort((a, b) => {
                      // Sort by newest first (createdAt descending)
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
              const mediaArray = lightboxData.media as GenerationRow[];
              if (currentIndex < mediaArray.length - 1) {
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
        const totalVideos = Array.isArray(lightboxData.media) ? (lightboxData.media as any[]).length : 1;
        
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
              // Optional: handle tick display logic here if needed
            }}
            onOpenExternalGeneration={handleOpenExternalGeneration}
            tasksPaneOpen={true}
            tasksPaneWidth={tasksPaneWidth}
            initialVariantId={lightboxData.initialVariantId}
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