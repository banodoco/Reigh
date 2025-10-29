import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Settings, Key, Copy, Trash2, AlertCircle, Terminal, Coins, Monitor, LogOut, HelpCircle, MoreHorizontal } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Button } from "@/shared/components/ui/button";
import { Task, TASK_STATUS } from '@/types/tasks';
import { getTaskDisplayName, taskSupportsProgress } from '@/shared/lib/taskConfig';
import { useCancelTask } from '@/shared/hooks/useTasks';
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useToast } from '@/shared/hooks/use-toast';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { formatDistanceToNow, isValid } from 'date-fns';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useTaskTimestamp } from '@/shared/hooks/useUpdatingTimestamp';
import { useProcessingTimestamp, useCompletedTimestamp } from '@/shared/hooks/useProcessingTimestamp';
import { GenerationRow } from '@/types/shots';
import { useListShots, useAddImageToShot } from '@/shared/hooks/useShots';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTaskGenerationMapping } from '@/shared/lib/generationTaskBridge';
import { SharedTaskDetails } from '@/tools/travel-between-images/components/SharedTaskDetails';
import SharedMetadataDetails from '@/shared/components/SharedMetadataDetails';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useTaskType } from '@/shared/hooks/useTaskType';
import { useTaskDetails } from '@/shared/components/ShotImageManager/hooks/useTaskDetails';

// Function to create abbreviated task names for tight spaces
const getAbbreviatedTaskName = (fullName: string): string => {
  const abbreviations: Record<string, string> = {
    'Travel Between Images': 'Travel Video',
    'Image Generation': 'Image Gen',
    'Edit Travel (Kontext)': 'Edit Travel (K)',
    'Edit Travel (Flux)': 'Edit Travel (F)',
    'Training Data Helper': 'Training Data',
    'Video Generation': 'Video Gen',
    'Style Transfer': 'Style Transfer',
  };
  
  return abbreviations[fullName] || fullName;
};

interface TaskItemProps {
  task: Task;
  isNew?: boolean;
  isActive?: boolean;
  onOpenImageLightbox?: (task: Task, media: GenerationRow) => void;
  onOpenVideoLightbox?: (task: Task, media: GenerationRow[], videoIndex: number) => void;
}

// Timestamp formatting now handled by useTaskTimestamp hook

const TaskItem: React.FC<TaskItemProps> = ({ task, isNew = false, isActive = false, onOpenImageLightbox, onOpenVideoLightbox }) => {
  const { toast } = useToast();
  
  // Mobile detection hook - declare early for use throughout component
  const isMobile = useIsMobile();

  // Access project context early so it can be used in other hooks
  const { selectedProjectId } = useProject();
  
  // Access pane controls for setting active task
  const { setActiveTaskId, setIsTasksPaneOpen, tasksPaneWidth } = usePanes();
  
  // Get live-updating timestamp
  const createdTimeAgo = useTaskTimestamp(task.createdAt || (task as any).created_at);
  
  // Get processing timestamp for In Progress tasks
  const processingTime = useProcessingTimestamp({ 
    generationStartedAt: task.generationStartedAt || (task as any).generation_started_at
  });
  
  // Get completed timestamp for Complete tasks
  const completedTime = useCompletedTimestamp({
    generationProcessedAt: task.generationProcessedAt || (task as any).generation_processed_at
  });

  // Query client for optimistic updates
  const queryClient = useQueryClient();

  // Mutations
  const cancelTaskMutation = useCancelTask(selectedProjectId);

  // Progress checking will be done via direct API calls when needed
  // No longer loading all 1000+ tasks into memory

  // Shot-related hooks
  const { data: shots } = useListShots(selectedProjectId);
  const { currentShotId } = useCurrentShot();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const addImageToShotMutation = useAddImageToShot();

  // No longer need local lightbox state - hoisted to TasksPane
  const [selectedShotId, setSelectedShotId] = useState<string>('');
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);

  // Set initial selected shot
  useEffect(() => {
    const newSelectedShotId = currentShotId || lastAffectedShotId || (shots && shots.length > 0 ? shots[0].id : "");
    setSelectedShotId(newSelectedShotId);
  }, [currentShotId, lastAffectedShotId, shots]);

  // Handler for adding image to shot
  const handleAddToShot = async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    if (!selectedShotId) {
      toast({
        title: "No shot selected",
        description: "Please select a shot to add to.",
        variant: "destructive",
      });
      return false;
    }
    if (!selectedProjectId) {
      toast({
        title: "No project selected",
        description: "Please select a project first.",
        variant: "destructive",
      });
      return false;
    }

    try {
      await addImageToShotMutation.mutateAsync({
        shot_id: selectedShotId,
        generation_id: generationId,
        project_id: selectedProjectId,
      });
      
      setLastAffectedShotId(selectedShotId);
      return true;
    } catch (error) {
      console.error('Failed to add image to shot:', error);
      toast({
        title: "Failed to add image to shot",
        description: "Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  // Handler for shot selection change
  const handleShotChange = (shotId: string) => {
    setSelectedShotId(shotId);
  };

  // Handler for tick display
  const handleShowTick = (imageId: string) => {
    setShowTickForImageId(imageId);
    setTimeout(() => setShowTickForImageId(null), 2000);
  };

  // Fetch task type information including content_type
  const { data: taskTypeInfo } = useTaskType(task.taskType);

  // Use display_name from task_types table, with fallback to legacy logic
  const displayTaskType = taskTypeInfo?.display_name || getTaskDisplayName(task.taskType);
  const abbreviatedTaskType = getAbbreviatedTaskName(displayTaskType);

  // Consolidated parameter parsing
  const taskParams = useMemo(() => {
    const parsed = typeof task.params === 'string' ? 
      (() => { try { return JSON.parse(task.params); } catch { return {}; } })() : 
      (task.params || {});
    
    const promptText = parsed?.orchestrator_details?.prompt || parsed?.prompt || '';
    return { parsed, promptText };
  }, [task.params]);

  // Consolidated task type detection using content_type from database
  const taskInfo = useMemo(() => {
    const contentType = taskTypeInfo?.content_type;
    const isVideoTask = contentType === 'video';
    const isImageTask = contentType === 'image';
    const isCompletedVideoTask = isVideoTask && task.status === 'Complete';
    const isCompletedImageTask = isImageTask && task.status === 'Complete';
    // Show tooltips for all video and image tasks
    const showsTooltip = (isVideoTask || isImageTask);
    
    return { 
      isVideoTask, 
      isImageTask, 
      isCompletedVideoTask, 
      isCompletedImageTask,
      showsTooltip,
      contentType,
      // Legacy properties for backward compatibility (can be removed later)
      isTravelTask: isVideoTask, 
      isSingleImageTask: isImageTask,
      isCompletedTravelTask: isCompletedVideoTask
    };
  }, [taskTypeInfo?.content_type, task.status]);

  // Check if this is a successful Image Generation task with output
  const hasGeneratedImage = React.useMemo(() => {
    return taskInfo.isImageTask && task.status === 'Complete' && task.outputLocation;
  }, [taskInfo.isImageTask, task.status, task.outputLocation]);

  // Fetch the actual generation record for this task
  // Use the generalized bridge for task-to-generation mapping
  const { data: actualGeneration } = useTaskGenerationMapping(
    task.id, 
    hasGeneratedImage ? task.outputLocation : null, 
    task.projectId
  );
  
  // Legacy fallback - can be removed once bridge is stable
  const { data: legacyGeneration } = useQuery({
    queryKey: ['generation-for-task-legacy', task.id, task.outputLocation],
    queryFn: async () => {
      if (!hasGeneratedImage || !task.outputLocation || actualGeneration !== undefined) return null;
      
      // Debug: Check if this task has the generation_created flag set
      const { data: taskCheck, error: taskCheckError } = await supabase
        .from('tasks')
        .select('generation_created')
        .eq('id', task.id)
        .single();
      
      if (!taskCheckError && taskCheck) {
        console.log(`[TaskFetchGeneration] Debug: Task ${task.id} generation_created flag:`, taskCheck.generation_created);
      }
      
      // Debug: Check if any generation exists with this output location (project agnostic)
      const { data: anyGeneration, error: anyGenerationError } = await supabase
        .from('generations')
        .select('id, project_id, location')
        .eq('location', task.outputLocation)
        .maybeSingle();
      
      if (!anyGenerationError && anyGeneration) {
        console.log(`[TaskFetchGeneration] Debug: Found generation with location ${task.outputLocation}:`, {
          id: anyGeneration.id,
          project_id: anyGeneration.project_id,
          expected_project_id: task.projectId,
          project_match: anyGeneration.project_id === task.projectId
        });
      } else if (anyGenerationError) {
        console.error(`[TaskFetchGeneration] Debug: Error checking for any generation:`, anyGenerationError);
      } else {
        console.log(`[TaskFetchGeneration] Debug: No generation found with location ${task.outputLocation}`);
      }
      
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('location', task.outputLocation)
        .eq('project_id', task.projectId)
        .maybeSingle();
      
      if (error) {
        console.error('[TaskFetchGeneration] Error fetching generation for task:', {
          taskId: task.id,
          taskType: task.taskType,
          outputLocation: task.outputLocation,
          projectId: task.projectId,
          error: {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            fullError: error
          }
        });
        return null;
      }
      
      if (!data) {
        console.warn('[TaskFetchGeneration] No generation found for completed task:', {
          taskId: task.id,
          taskType: task.taskType,
          outputLocation: task.outputLocation,
          projectId: task.projectId
        });
      }
      
      return data;
    },
    enabled: hasGeneratedImage && !!task.outputLocation,
  });

  // Create GenerationRow data for MediaLightbox using the actual generation
  const generationData: GenerationRow | null = React.useMemo(() => {
    if (!hasGeneratedImage || !actualGeneration) return null;
    
    // The field in the database is 'based_on' - check for it at the top level
    const basedOnValue = (actualGeneration as any).based_on || (actualGeneration.metadata as any)?.based_on || null;
    
    // Transform shot associations from shot_generations array
    const shotGenerations = (actualGeneration as any).shot_generations || [];
    const shotIds = shotGenerations.map((sg: any) => sg.shot_id);
    const timelineFrames = shotGenerations.reduce((acc: any, sg: any) => {
      acc[sg.shot_id] = sg.timeline_frame;
      return acc;
    }, {});
    
    // Also create all_shot_associations format for compatibility
    const allShotAssociations = shotGenerations.map((sg: any) => ({
      shot_id: sg.shot_id,
      position: sg.timeline_frame,
    }));
    
    // Log what's in actualGeneration to understand what data we have
    console.log('[TasksPane:AddToShot] 📦 Creating generationData from actualGeneration:', {
      taskId: task.id.substring(0, 8),
      generationId: actualGeneration.id.substring(0, 8),
      hasBasedOnAtTopLevel: !!(actualGeneration as any).based_on,
      basedOnAtTopLevel: (actualGeneration as any).based_on?.substring(0, 8) || 'null',
      hasBasedOnInMetadata: !!(actualGeneration.metadata as any)?.based_on,
      basedOnInMetadata: (actualGeneration.metadata as any)?.based_on?.substring(0, 8) || 'null',
      finalBasedOnValue: basedOnValue?.substring(0, 8) || 'null',
      hasShotAssociations: shotGenerations.length > 0,
      shotAssociationsCount: shotGenerations.length,
      shotIds: shotIds.map((id: string) => id.substring(0, 8)),
      hasLocation: !!actualGeneration.location,
      hasThumbnailUrl: !!(actualGeneration as any).thumbnail_url,
      hasUpscaledUrl: !!(actualGeneration as any).upscaled_url,
      locationPreview: (actualGeneration.location || '').substring(0, 80),
      thumbnailUrlPreview: ((actualGeneration as any).thumbnail_url || '').substring(0, 80),
      upscaledUrlPreview: ((actualGeneration as any).upscaled_url || '').substring(0, 80),
      finalImageUrl: (actualGeneration.location || (actualGeneration as any).upscaled_url || (actualGeneration as any).thumbnail_url || '').substring(0, 80),
      finalThumbUrl: ((actualGeneration as any).thumbnail_url || actualGeneration.location || '').substring(0, 80),
      actualGenerationKeys: Object.keys(actualGeneration).join(', '),
      timestamp: Date.now()
    });
    
    // Database fields: location (full image), thumbnail_url (thumb)
    // Note: Sometimes location might be incomplete, check upscaled_url as fallback
    const imageUrl = actualGeneration.location || (actualGeneration as any).upscaled_url || (actualGeneration as any).thumbnail_url;
    const thumbUrl = (actualGeneration as any).thumbnail_url || actualGeneration.location;
    
    return {
      id: actualGeneration.id, // Use the real generation ID
      location: actualGeneration.location,
      imageUrl,
      thumbUrl,
      type: actualGeneration.type || 'image',
      createdAt: (actualGeneration as any).created_at || actualGeneration.createdAt, // Handle both snake_case and camelCase
      metadata: actualGeneration.metadata || {},
      // CRITICAL: Include based_on field at TOP LEVEL for "Based On" feature in MediaLightbox
      based_on: basedOnValue,
      // Also include as sourceGenerationId for compatibility
      sourceGenerationId: basedOnValue,
      // Shot associations for "Add to Shot" button state
      shotIds,
      timelineFrames,
      all_shot_associations: allShotAssociations,
    } as GenerationRow;
  }, [hasGeneratedImage, actualGeneration, task.id]);

  // State to control when to fetch video generations (on hover)
  const [shouldFetchVideo, setShouldFetchVideo] = useState(false);
  
  // State to track if user clicked the button (not just hovered)
  const [waitingForVideoToOpen, setWaitingForVideoToOpen] = useState(false);
  
  // Fetch video generations for video tasks - only when hovering
  const { data: videoGenerations, isLoading: isLoadingVideoGen } = useQuery({
    queryKey: ['video-generations-for-task', task.id, task.outputLocation],
    queryFn: async () => {
      if (!taskInfo.isVideoTask || task.status !== 'Complete') return null;
      
      // Try to find generation by output location first (most reliable)
      if (task.outputLocation) {
        const { data: byLocation, error: locError } = await supabase
          .from('generations')
          .select('*')
          .eq('location', task.outputLocation)
          .eq('project_id', task.projectId);
        
        if (!locError && byLocation && byLocation.length > 0) {
          return byLocation;
        }
      }
      
      // Fallback: Search by task ID in the tasks JSONB array
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .filter('tasks', 'cs', JSON.stringify([task.id]))
        .eq('project_id', task.projectId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[ShowVideoDebug] Error fetching video generations:', error);
        return null;
      }
      
      return data || [];
    },
    enabled: shouldFetchVideo && taskInfo.isVideoTask && task.status === 'Complete',
  });

  // Extract travel-specific data
  const travelData = React.useMemo(() => {
    if (!taskInfo.isVideoTask) return { imageUrls: [], videoOutputs: null };
    
    const imageUrls = taskParams.parsed?.orchestrator_details?.input_image_paths_resolved || [];
    
    // Convert video generations from database to GenerationRow format
    const videoOutputs = videoGenerations?.map(gen => ({
      id: gen.id,
      location: gen.location,
      imageUrl: gen.location,
      thumbUrl: gen.thumbnail_url || gen.location,
      type: gen.type || 'video',
      createdAt: gen.created_at,
      metadata: gen.params || {},
    } as GenerationRow)) || null;
    
    return {
      imageUrls,
      videoOutputs
    };
  }, [taskInfo.isVideoTask, taskParams.parsed, videoGenerations]);

  const imagesToShow = travelData.imageUrls.slice(0, 4);
  const extraImageCount = Math.max(0, travelData.imageUrls.length - imagesToShow.length);

  // Extract shot_id for video tasks
  const shotId: string | null = React.useMemo(() => {
    if (!taskInfo.isVideoTask) return null;
    
    const params = task.params as any;
    
    // Try different locations where shot_id might be stored based on task type
    return (
      params?.orchestrator_details?.shot_id ||           // travel_orchestrator, wan_2_2_i2v
      params?.full_orchestrator_payload?.shot_id ||      // travel_stitch, wan_2_2_i2v fallback
      params?.shot_id ||                                 // direct shot_id
      null
    );
  }, [task, taskInfo.isVideoTask]);

  // Navigation setup
  const navigate = useNavigate();
  const { setCurrentShotId } = useCurrentShot();
  
  // State for hover functionality
  const [isHoveringTaskItem, setIsHoveringTaskItem] = useState<boolean>(false);
  
  // Trigger video fetch when hovering over completed video tasks
  useEffect(() => {
    if (isHoveringTaskItem && taskInfo.isCompletedVideoTask && !shouldFetchVideo) {
      setShouldFetchVideo(true);
    }
  }, [isHoveringTaskItem, taskInfo.isCompletedVideoTask, shouldFetchVideo]);
  
  // State for video lightbox
  // No longer need video lightbox state - hoisted to TasksPane
  
  // State for ID copy indicator
  const [idCopied, setIdCopied] = useState<boolean>(false);
  
  // Task details no longer needed here - handled by TasksPane
  
  // Fetch the actual error message if this is a cascaded failure
  const cascadedTaskIdMatch = task.errorMessage?.match(/Cascaded failed from related task ([a-f0-9-]+)/i);
  const cascadedTaskId = cascadedTaskIdMatch ? cascadedTaskIdMatch[1] : null;
  
  const { data: cascadedTask, isLoading: isCascadedTaskLoading } = useQuery({
    queryKey: ['cascaded-task-error', cascadedTaskId],
    queryFn: async () => {
      if (!cascadedTaskId) return null;
      
      console.log('[TaskItem] Fetching cascaded task error for:', cascadedTaskId);
      
      const { data, error } = await supabase
        .from('tasks')
        .select('error_message, task_type')
        .eq('id', cascadedTaskId)
        .single();
      
      if (error) {
        console.error('[TaskItem] Failed to fetch cascaded task error:', error);
        return null;
      }
      
      console.log('[TaskItem] Cascaded task data:', {
        task_type: data?.task_type,
        has_error_message: !!data?.error_message,
        error_message: data?.error_message
      });
      
      return data;
    },
    enabled: !!cascadedTaskId && task.status === 'Failed',
  });
  
  // Lightbox state no longer tracked here

  // Local state to show progress percentage temporarily
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  const handleCancel = () => {
    // Optimistically update this task to 'Cancelled' status immediately
    // This will hide the "Check Progress" button instantly
    const taskId = task.id;
    
    // Update all paginated queries that might contain this task
    queryClient.setQueriesData(
      { queryKey: ['tasks', 'paginated', selectedProjectId] },
      (oldData: any) => {
        if (!oldData?.tasks) return oldData;
        
        return {
          ...oldData,
          tasks: oldData.tasks.map((t: any) => {
            if (t.id === taskId) {
              return { ...t, status: 'Cancelled' };
            }
            return t;
          }),
        };
      }
    );
    
    // Cancel task (subtasks will be automatically cancelled if this is an orchestrator)
    cancelTaskMutation.mutate(task.id, {
      onError: (error) => {
        // Revert the optimistic update on error
        // The task status will be restored when queries are refetched
        queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
        
        toast({
          title: 'Cancellation Failed',
          description: error.message || 'Could not cancel the task.',
          variant: 'destructive',
        });
      },
    });
  };

  // Fetch tasks directly for progress checking - no more deprecated useListTasks
  const handleCheckProgress = async () => {
    console.log('[TaskProgressDebug] Check Progress clicked for task:', task.id, 'taskType:', task.taskType);
    console.log('[PollingBreakageIssue] TaskItem progress check - using direct API call instead of deprecated useListTasks');
    
    if (!selectedProjectId) {
      console.error('[TaskProgressDebug] No project selected');
      return;
    }
    
    try {
      // Direct API call for progress checking - only fetch what we need
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', selectedProjectId)
        .order('created_at', { ascending: false })
        .limit(500); // Reasonable limit for progress checking
        
      if (error) throw error;
      
      console.log('[TaskProgressDebug] Fetched tasks for progress:', tasks?.length || 0);
      console.log('[PollingBreakageIssue] TaskItem progress check completed successfully');
      
      if (tasks) {
        computeAndShowProgress(tasks as any);
      } else {
        console.log('[TaskProgressDebug] No data available for progress computation');
        toast({
          title: "Error",
          description: "Failed to load tasks for progress computation",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('[TaskProgressDebug] Error fetching tasks for progress:', error);
      console.error('[PollingBreakageIssue] TaskItem progress check failed:', error);
      toast({
        title: "Error",
        description: "Failed to load tasks for progress computation",
        variant: "destructive",
      });
    }
  };

  const computeAndShowProgress = (tasksData: Task[]) => {
    console.log('[TaskProgressDebug] computeAndShowProgress called with', tasksData.length, 'tasks');
    const pRoot: any = typeof task.params === 'string' ? JSON.parse(task.params) : task.params || {};
    console.log('[TaskProgressDebug] Task params parsed:', pRoot);
    const orchestratorDetails = pRoot.orchestrator_details || {};
    console.log('[TaskProgressDebug] orchestratorDetails:', orchestratorDetails);
    const orchestratorId = orchestratorDetails.orchestrator_task_id || pRoot.orchestrator_task_id || pRoot.task_id || task.id;
    console.log('[TaskProgressDebug] orchestratorId resolved to:', orchestratorId);
    const orchestratorRunId = orchestratorDetails.run_id || pRoot.orchestrator_run_id;
    console.log('[TaskProgressDebug] orchestratorRunId:', orchestratorRunId);

    const subtasks = tasksData.filter((t) => {
      const p: any = typeof t.params === 'string' ? JSON.parse(t.params) : t.params || {};
      const matchesOrchestrator = (
        (p.orchestrator_task_id_ref === orchestratorId || p.orchestrator_task_id === orchestratorId || p.orchestrator_task_id_ref === task.id || p.orchestrator_task_id === task.id || (orchestratorRunId && p.orchestrator_run_id === orchestratorRunId))
        && t.id !== task.id
      );
      if (matchesOrchestrator) {
        console.log('[TaskProgressDebug] Found subtask:', t.id, 'status:', t.status, 'taskType:', t.taskType, 'params:', p);
      }
      return (
        (p.orchestrator_task_id_ref === orchestratorId || p.orchestrator_task_id === orchestratorId || p.orchestrator_task_id_ref === task.id || p.orchestrator_task_id === task.id || (orchestratorRunId && p.orchestrator_run_id === orchestratorRunId))
        && t.id !== task.id
      );
    });

    console.log('[TaskProgressDebug] Found', subtasks.length, 'subtasks');
    
    let percent = 0;
    
    if (subtasks.length === 0) {
      console.log('[TaskProgressDebug] No subtasks found yet, showing 0% progress');
      percent = 0;
    } else {
      // Progress is based on the ratio of completed subtasks to (total subtasks - 1)
      const completed = subtasks.filter((t) => t.status === 'Complete').length;
      console.log('[TaskProgressDebug] Completed subtasks:', completed);
      const denominator = Math.max(subtasks.length - 1, 1); // Avoid divide-by-zero and remove the final stitch task
      console.log('[TaskProgressDebug] Denominator:', denominator);

      const rawPercent = (completed / denominator) * 100;
      percent = Math.round(Math.min(rawPercent, 100));
      console.log('[TaskProgressDebug] Calculated progress:', percent, '% (raw:', rawPercent, ')');
    }

    toast({ title: 'Progress', description: `${percent}% Complete`, variant: 'default' });

    // Show inline for 5s
    setProgressPercent(percent);
    setTimeout(() => setProgressPercent(null), 5000);
  };

  // Handler for visiting shot
  const handleVisitShot = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent any parent click handlers
    e.preventDefault(); // Prevent default behavior
    if (!shotId) return;
    
    // Reset hover state immediately
    setIsHoveringTaskItem(false);
    
    setCurrentShotId(shotId);
    navigate(`/tools/travel-between-images#${shotId}`, { state: { fromShotClick: true } });
  };

  // Handler for opening video lightbox
  const handleViewVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Reset hover state immediately
    setIsHoveringTaskItem(false);
    
    // Use callback if provided, otherwise do nothing (old behavior)
    if (onOpenVideoLightbox && travelData.videoOutputs && travelData.videoOutputs.length > 0) {
      onOpenVideoLightbox(task, travelData.videoOutputs, 0);
    } else if (!onOpenVideoLightbox) {
      // Fallback: if no callback, maintain old behavior
      // Set this task as active and open tasks pane (desktop only)
      if (!isMobile) {
        setActiveTaskId(task.id);
        setIsTasksPaneOpen(true);
      }
      // If not loaded yet, trigger fetch and mark that we're waiting to open
      setShouldFetchVideo(true);
      setWaitingForVideoToOpen(true);
    }
  };
  
  // Auto-open lightbox when video data becomes available after clicking (not just hovering)
  useEffect(() => {
    if (waitingForVideoToOpen && travelData.videoOutputs && travelData.videoOutputs.length > 0) {
      if (onOpenVideoLightbox) {
        onOpenVideoLightbox(task, travelData.videoOutputs, 0);
      }
      setWaitingForVideoToOpen(false); // Reset the flag
    }
  }, [travelData.videoOutputs, waitingForVideoToOpen, onOpenVideoLightbox, task]);

  // Handler for opening image lightbox
  const handleViewImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Reset hover state immediately
    setIsHoveringTaskItem(false);
    
    if (generationData) {
      // Use callback if provided
      if (onOpenImageLightbox) {
        onOpenImageLightbox(task, generationData);
      } else {
        // Fallback: maintain old behavior if no callback
        if (!isMobile) {
          setActiveTaskId(task.id);
          setIsTasksPaneOpen(true);
        }
        // (No local state to set since it's been removed)
      }
    }
  };

  const containerClass = cn(
    "relative p-3 mb-2 bg-zinc-800/95 rounded-md shadow border transition-colors overflow-hidden",
    isNew ? "border-teal-400 animate-[flash_3s_ease-in-out]" : 
    isActive ? "border-blue-500 bg-blue-900/20 ring-2 ring-blue-400/50" :
    "border-zinc-600 hover:border-zinc-400"
  );


  
  // Fetch video outputs for completed travel tasks - DISABLED to avoid per-item query spam in Tasks pane
  const videoOutputs: GenerationRow[] = React.useMemo(() => {
    return travelData.videoOutputs || [];
  }, [travelData.videoOutputs]);

  // Handler for mobile tap - jump to shot for video tasks, open content for image tasks
  const handleMobileTap = (e: React.MouseEvent) => {
    if (!isMobile) return; // Only handle on mobile
    
    e.stopPropagation();
    e.preventDefault();
    
    // For video tasks - jump to the shot if available
    if (taskInfo.isVideoTask && shotId) {
      setCurrentShotId(shotId);
      navigate(`/tools/travel-between-images#${shotId}`, { state: { fromShotClick: true } });
      return;
    }
    
    // For image generation tasks - open image if available
    if (taskInfo.isImageTask && generationData && onOpenImageLightbox) {
      onOpenImageLightbox(task, generationData);
      return;
    }
  };

  const taskItemContent = (
    <div 
      className={containerClass}
      onMouseEnter={() => setIsHoveringTaskItem(true)}
      onMouseLeave={() => setIsHoveringTaskItem(false)}
      onClick={handleMobileTap}
    >
      <div className="flex justify-between items-center mb-1 gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-sm font-light text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis cursor-default min-w-0">
            {abbreviatedTaskType}
          </span>
          {task.status !== 'Complete' && isHoveringTaskItem && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(task.id);
                setIdCopied(true);
                setTimeout(() => setIdCopied(false), 2000);
                toast({
                  title: 'ID Copied',
                  description: 'Task ID copied to clipboard',
                  variant: 'default',
                });
              }}
              className={cn(
                "flex-shrink-0 px-1.5 py-0.5 text-[10px] rounded transition-colors border",
                idCopied 
                  ? "text-green-400 bg-green-900/20 border-green-500" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 border-zinc-600 hover:border-zinc-400"
              )}
              title="Copy task ID"
            >
              {idCopied ? 'copied' : 'id'}
            </button>
          )}
        </div>
        <span
          className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${
            task.status === 'In Progress' ? 'bg-blue-500 text-blue-100' :
            task.status === 'Complete' ? 'bg-green-500 text-green-100' :
            task.status === 'Failed' ? 'bg-red-500 text-red-100' :
            task.status === 'Queued' ? 'bg-purple-500 text-purple-100' :
            task.status === 'Cancelled' ? 'bg-orange-500 text-orange-100' : 'bg-gray-500 text-gray-100'
          }`}
        >
          {task.status}
        </span>
      </div>
      {/* Image previews for Travel Between Images task */}
      {imagesToShow.length > 0 && (
        <div 
          className="relative flex items-center overflow-x-auto mb-1 mt-2"
        >
          <div className="flex items-center">
            {imagesToShow.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`input-${idx}`}
                className="w-12 h-12 object-cover rounded mr-1 border border-zinc-700"
              />
            ))}
            {extraImageCount > 0 && (
              <span className="text-xs text-zinc-400 ml-1">+ {extraImageCount}</span>
            )}
          </div>
          {/* Action buttons overlay on hover - desktop only */}
          {isHoveringTaskItem && shotId && !isMobile && (
            <div 
              className="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded flex items-center justify-center gap-2"
              onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to parent
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleVisitShot}
                className="text-xs px-2 py-1 h-auto bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 transition-all"
              >
                Visit Shot
              </Button>
              {taskInfo.isCompletedVideoTask && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleViewVideo}
                  disabled={isLoadingVideoGen}
                  className="text-xs px-2 py-1 h-auto bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 transition-all disabled:opacity-50"
                >
                  {isLoadingVideoGen ? 'Loading...' : 'Show Video'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {/* Show prompt for Image Generation tasks */}
      {taskParams.promptText && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5 flex items-center justify-between">
            <div className="text-xs text-zinc-200 flex-1 min-w-0 pr-2">
              "{taskParams.promptText.length > 50 ? `${taskParams.promptText.substring(0, 50)}...` : taskParams.promptText}"
            </div>
            {/* Tiny thumbnail for successful Image Generation tasks */}
            {generationData && (
              <button
                onClick={() => onOpenImageLightbox && onOpenImageLightbox(task, generationData)}
                className="w-8 h-8 rounded border border-zinc-500 overflow-hidden hover:border-zinc-400 transition-colors flex-shrink-0"
              >
                <img
                  src={generationData.imageUrl}
                  alt="Generated image"
                  className="w-full h-full object-cover"
                />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center text-[11px] text-zinc-400">
        <span className="flex-1">
          {task.status === 'In Progress' && processingTime ? 
            processingTime : 
            task.status === 'Complete' && completedTime ?
            completedTime :
            `Created ${createdTimeAgo}`
          }
        </span>
        
        {/* Action buttons for queued/in progress tasks */}
        {(task.status === 'Queued' || task.status === 'In Progress') && (
          <div className="flex items-center flex-shrink-0">
            {taskSupportsProgress(task.taskType) && task.status === 'In Progress' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCheckProgress}
                disabled={progressPercent !== null}
                className="px-2 py-1 min-w-[80px] h-auto text-blue-400 hover:bg-blue-900/20 hover:text-blue-300 flex flex-col items-center justify-center"
              >
                <div className="text-xs leading-tight">
                  {progressPercent === null ? (
                    <>
                      <div>Check</div>
                      <div>Progress</div>
                    </>
                  ) : (
                    <>
                      <div>{progressPercent}%</div>
                      <div>Complete</div>
                    </>
                  )}
                </div>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={cancelTaskMutation.isPending}
              className="px-2 py-0.5 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            >
              {cancelTaskMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </Button>
          </div>
        )}
        
      </div>
      
      {/* Error message for failed tasks - only shows on hover */}
      {task.status === 'Failed' && task.errorMessage && isHoveringTaskItem && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-200 animate-in slide-in-from-top-2 duration-200">
          <div className="font-semibold text-red-300 mb-1">Error:</div>
          {cascadedTaskId ? (
            <div>
              {isCascadedTaskLoading ? (
                <div className="text-zinc-400 text-[10px] mb-1">Loading error from related task...</div>
              ) : cascadedTask?.error_message ? (
                <div>
                  <div className="text-zinc-400 text-[10px] mb-1">
                    Cascaded from related task ({getTaskDisplayName(cascadedTask.task_type)}):
                  </div>
                  <div className="whitespace-pre-wrap break-words">{cascadedTask.error_message}</div>
                </div>
              ) : (
                <div>
                  <div className="text-zinc-400 text-[10px] mb-1">
                    Cascaded from related task{cascadedTask ? ` (${getTaskDisplayName(cascadedTask.task_type)})` : ''}:
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">No error message available</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(cascadedTaskId);
                        toast({
                          title: 'Task ID Copied',
                          description: 'Related task ID copied to clipboard',
                          variant: 'default',
                        });
                      }}
                      className="px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors border border-zinc-600 hover:border-zinc-400"
                      title="Copy related task ID"
                    >
                      copy id
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">{task.errorMessage}</div>
          )}
        </div>
      )}
      
      {/* Add more task details as needed, e.g., from task.params */}
      {/* <pre className="text-xs text-zinc-500 whitespace-pre-wrap break-all">{JSON.stringify(task.params, null, 2)}</pre> */}
      

      {/* Action button overlay for image generation tasks on hover - desktop only */}
      {isHoveringTaskItem && taskInfo.isImageTask && generationData && !isMobile && (
        <div 
          className="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded flex items-center justify-center"
          onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to parent
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewImage}
            className="text-xs px-2 py-1 h-auto bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 transition-all"
          >
            View Image
          </Button>
        </div>
      )}
    </div>
  );

  // ENHANCED Debug logging for single image tasks - why no tooltip?
  // IMPORTANT: This useEffect must be called before any conditional returns to follow Rules of Hooks
  React.useEffect(() => {
    if (taskInfo.isImageTask) {
      console.log('[TaskTooltipDebug] Single image task tooltip analysis:', {
        taskId: task.id,
        taskType: task.taskType,
        status: task.status,
        hasActualGeneration: !!actualGeneration,
        actualGenerationData: actualGeneration ? {
          id: actualGeneration.id,
          hasMetadata: !!actualGeneration.metadata,
          metadataKeys: actualGeneration.metadata ? Object.keys(actualGeneration.metadata) : [],
          location: actualGeneration.location,
          metadata: actualGeneration.metadata
        } : null,
        hasOutputLocation: !!task.outputLocation,
        outputLocation: task.outputLocation,
        hasPromptText: !!taskParams.promptText,
        promptText: taskParams.promptText.substring(0, 50) + (taskParams.promptText.length > 50 ? '...' : ''),
        hasTaskParams: !!task.params,
        taskParamsPreview: task.params ? (typeof task.params === 'string' ? 'STRING_PARAMS' : Object.keys(task.params).join(',')) : null,
        conditionBreakdown: {
          isImageTask: taskInfo.isImageTask,
          hasMetadata: !!actualGeneration?.metadata,
          isComplete: task.status === 'Complete',
          hasParamsOrPrompt: !!(task.params || taskParams.promptText),
          showsTooltip: taskInfo.showsTooltip
        },
        shouldShowTooltip: taskInfo.showsTooltip,
        WHY_NO_TOOLTIP: !taskInfo.isImageTask ? 'NOT_IMAGE_TASK' : 'SHOULD_SHOW',
        timestamp: Date.now()
      });
    }
  }, [taskInfo.isImageTask, task.id, task.taskType, task.status, actualGeneration, task.outputLocation, taskParams.promptText, task.params]);

  // Unified tooltip wrapper for both travel and image tasks
  // Don't show tooltips on mobile to improve performance and UX
  const mainContent = taskInfo.showsTooltip && !isMobile ? (() => {
    const isTravel = taskInfo.isVideoTask;
    const hasClickableContent = taskInfo.isVideoTask ? 
      (taskInfo.isCompletedVideoTask && travelData.videoOutputs && travelData.videoOutputs.length > 0) : 
      !!generationData;
    
    const handleTooltipClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      
      // Reset hover state immediately when clicking tooltip
      setIsHoveringTaskItem(false);
      
      if (taskInfo.isVideoTask && hasClickableContent && onOpenVideoLightbox && travelData.videoOutputs && travelData.videoOutputs.length > 0) {
        onOpenVideoLightbox(task, travelData.videoOutputs, 0);
      } else if (!taskInfo.isVideoTask && hasClickableContent && onOpenImageLightbox && generationData) {
        onOpenImageLightbox(task, generationData);
      }
    };

    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          {taskItemContent}
        </TooltipTrigger>
        <TooltipContent 
          side="left" 
          className={cn(
            "p-0 border-0 bg-background/95 backdrop-blur-sm",
            taskInfo.isVideoTask ? "max-w-lg" : "max-w-md"
          )}
          sideOffset={15}
          collisionPadding={10}
        >
          <div 
            className="relative cursor-pointer hover:bg-background/90 transition-colors rounded-lg group"
            onClick={handleTooltipClick}
          >
            {taskInfo.isVideoTask ? (
              <SharedTaskDetails
                task={task}
                inputImages={travelData.imageUrls}
                variant="hover"
                isMobile={false}
              />
            ) : (
              <SharedMetadataDetails
                metadata={{
                  prompt: taskParams.promptText,
                  tool_type: task.taskType,
                  // Include original task parameters to access LoRA data
                  originalParams: task.params,
                  ...actualGeneration?.metadata
                }}
                variant="hover"
                isMobile={false}
                showUserImage={true}
              />
            )}
            
            {/* Click to view indicator */}
            {hasClickableContent && (
              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-zinc-900/90 via-zinc-800/60 to-transparent p-2 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-xs text-zinc-100 text-center font-medium drop-shadow-md">
                  {taskInfo.isVideoTask ? "Click to view video" : "Click to view image"}
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  })() : taskItemContent;

  return (
    <>
      {mainContent}
      
      {/* MediaLightbox now rendered centrally in TasksPane to persist across pagination */}
    </>
  );
};

export default TaskItem; 