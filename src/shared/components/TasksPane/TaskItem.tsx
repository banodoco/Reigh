import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Task } from '@/types/tasks';
import { getTaskDisplayName, taskSupportsProgress } from '@/shared/lib/taskConfig';
import { parseTaskParams } from '@/shared/lib/taskTypeUtils';
import { useCancelTask } from '@/shared/hooks/useTasks';
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useToast } from '@/shared/hooks/use-toast';
import { cn } from '@/shared/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useTaskTimestamp } from '@/shared/hooks/useUpdatingTimestamp';
import { useProcessingTimestamp, useCompletedTimestamp } from '@/shared/hooks/useProcessingTimestamp';
import { GenerationRow } from '@/types/shots';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useTaskType } from '@/shared/hooks/useTaskType';

// Import from new modules
import { parseTaskParamsForDisplay, getAbbreviatedTaskName, extractShotId } from './utils/task-utils';
import { useTaskContentType } from './hooks/useTaskContentType';
import { useVideoGenerations } from './hooks/useVideoGenerations';
import { useImageGeneration } from './hooks/useImageGeneration';
import { TaskItemActions } from './components/TaskItemActions';
import { TaskItemTooltip } from './components/TaskItemTooltip';
import { IMAGE_EDIT_TASK_TYPES } from './constants';

interface TaskItemProps {
  task: Task;
  isNew?: boolean;
  isActive?: boolean;
  onOpenImageLightbox?: (task: Task, media: GenerationRow, initialVariantId?: string) => void;
  onOpenVideoLightbox?: (task: Task, media: GenerationRow[], videoIndex: number, initialVariantId?: string) => void;
  isMobileActive?: boolean;
  onMobileActiveChange?: (taskId: string | null) => void;
  showProjectIndicator?: boolean;
  projectName?: string;
}

const TaskItem: React.FC<TaskItemProps> = ({ 
  task, 
  isNew = false, 
  isActive = false, 
  onOpenImageLightbox, 
  onOpenVideoLightbox, 
  isMobileActive = false, 
  onMobileActiveChange, 
  showProjectIndicator = false, 
  projectName 
}) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { setActiveTaskId, setIsTasksPaneOpen } = usePanes();
  const { setCurrentShotId } = useCurrentShot();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Timestamps
  const createdTimeAgo = useTaskTimestamp(task.createdAt || (task as any).created_at);
  const processingTime = useProcessingTimestamp({ 
    generationStartedAt: task.generationStartedAt || (task as any).generation_started_at
  });
  const completedTime = useCompletedTimestamp({
    generationProcessedAt: task.generationProcessedAt || (task as any).generation_processed_at
  });

  // Mutations
  const cancelTaskMutation = useCancelTask(selectedProjectId);

  // Task type info from database
  const { data: taskTypeInfo } = useTaskType(task.taskType);
  const displayTaskType = taskTypeInfo?.display_name || getTaskDisplayName(task.taskType);
  const abbreviatedTaskType = getAbbreviatedTaskName(displayTaskType);

  // Parse task params
  const taskParams = useMemo(() => parseTaskParamsForDisplay(task.params), [task.params]);

  // Task content type detection - pass taskTypeInfo to avoid duplicate query
  const taskInfo = useTaskContentType({ task, taskParams, taskTypeInfo });

  // State for hover
  const [isHoveringTaskItem, setIsHoveringTaskItem] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  // Video generations hook
  const {
    videoOutputs,
    isLoadingVideoGen,
    waitingForVideoToOpen,
    ensureFetch: ensureVideoFetch,
    triggerOpen: triggerVideoOpen,
    clearWaiting: clearVideoWaiting,
  } = useVideoGenerations({
    task,
    taskParams,
    isVideoTask: taskInfo.isVideoTask,
    isCompletedVideoTask: taskInfo.isCompletedVideoTask,
    isHovering: isHoveringTaskItem,
  });

  // Image generation hook
  const { generationData, actualGeneration, variantId: imageVariantId } = useImageGeneration({
    task,
    taskParams,
    isImageTask: taskInfo.isImageTask,
  });

  // Extract travel-specific data
  const travelImageUrls = useMemo(() => {
    if (!taskInfo.isVideoTask) return [];
    const isIndividualSegment = task.taskType === 'individual_travel_segment';
    return isIndividualSegment
      ? (taskParams.parsed?.input_image_paths_resolved || [])
      : (taskParams.parsed?.orchestrator_details?.input_image_paths_resolved || 
         taskParams.parsed?.input_image_paths_resolved || 
         []);
  }, [taskInfo.isVideoTask, taskParams.parsed, task.taskType]);

  const imagesToShow = travelImageUrls.slice(0, 4);
  const extraImageCount = Math.max(0, travelImageUrls.length - imagesToShow.length);

  // Extract shot_id for video tasks
  const shotId = useMemo(() => {
    if (!taskInfo.isVideoTask) return null;
    return extractShotId(task);
  }, [task, taskInfo.isVideoTask]);

  // Cascaded error handling
  const cascadedTaskIdMatch = task.errorMessage?.match(/Cascaded failed from related task ([a-f0-9-]+)/i);
  const cascadedTaskId = cascadedTaskIdMatch ? cascadedTaskIdMatch[1] : null;
  
  const { data: cascadedTask, isLoading: isCascadedTaskLoading } = useQuery({
    queryKey: ['cascaded-task-error', cascadedTaskId],
    queryFn: async () => {
      if (!cascadedTaskId) return null;
      const { data, error } = await supabase
        .from('tasks')
        .select('error_message, task_type')
        .eq('id', cascadedTaskId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!cascadedTaskId && task.status === 'Failed',
  });

  // Auto-open lightbox when video data loads after clicking
  useEffect(() => {
    if (waitingForVideoToOpen && !isLoadingVideoGen) {
      if (videoOutputs && videoOutputs.length > 0) {
        const initialVariantId = (videoOutputs[0] as any)?._variant_id;
        if (onOpenVideoLightbox) {
          onOpenVideoLightbox(task, videoOutputs, 0, initialVariantId);
        }
        clearVideoWaiting();
      } else {
        // Query finished but no video found - show error
        console.error('[TaskItem] Video query completed but no outputs found for task:', task.id);
        toast({
          title: 'Video not found',
          description: 'Could not locate the video output for this task.',
          variant: 'destructive',
        });
        clearVideoWaiting();
      }
    }
  }, [videoOutputs, waitingForVideoToOpen, isLoadingVideoGen, onOpenVideoLightbox, task, clearVideoWaiting, toast]);

  // Handlers
  const handleCancel = () => {
    const taskId = task.id;
    
    queryClient.setQueriesData(
      { queryKey: ['tasks', 'paginated', selectedProjectId] },
      (oldData: any) => {
        if (!oldData?.tasks) return oldData;
        return {
          ...oldData,
          tasks: oldData.tasks.map((t: any) => 
            t.id === taskId ? { ...t, status: 'Cancelled' } : t
          ),
        };
      }
    );
    
    cancelTaskMutation.mutate(task.id, {
      onError: (error) => {
        queryClient.invalidateQueries({ queryKey: ['tasks', 'paginated', selectedProjectId] });
        toast({
          title: 'Cancellation Failed',
          description: error.message || 'Could not cancel the task.',
          variant: 'destructive',
        });
      },
    });
  };

  const handleCheckProgress = async () => {
    if (!selectedProjectId) return;

    const params = parseTaskParams(task.params);
    const orchestratorDetails = params.orchestrator_details || {};
    const orchestratorId = orchestratorDetails.orchestrator_task_id || params.orchestrator_task_id || params.task_id || task.id;

    try {
      const { data: subtasks, error } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('project_id', selectedProjectId)
        .neq('id', task.id)
        .or([
          `params->>orchestrator_task_id_ref.eq.${orchestratorId}`,
          `params->>orchestrator_task_id.eq.${orchestratorId}`,
          `params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorId}`,
        ].join(','));

      if (error) throw error;

      const total = subtasks?.length || 0;
      const completed = subtasks?.filter(t => t.status === 'Complete').length || 0;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      setProgressPercent(percent);
      setTimeout(() => setProgressPercent(null), 5000);
    } catch (error) {
      console.error('[TaskItem] Error checking progress:', error);
      toast({ title: "Error", description: "Failed to check progress", variant: "destructive" });
    }
  };

  const handleVisitShot = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!shotId) return;
    
    setIsHoveringTaskItem(false);
    setCurrentShotId(shotId);
    navigate(`/tools/travel-between-images#${shotId}`, { state: { fromShotClick: true } });
  };

  const handleViewVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsHoveringTaskItem(false);

    if (onOpenVideoLightbox && videoOutputs && videoOutputs.length > 0) {
      const initialVariantId = (videoOutputs[0] as any)?._variant_id;
      onOpenVideoLightbox(task, videoOutputs, 0, initialVariantId);
    } else {
      if (!isMobile) {
        setActiveTaskId(task.id);
        setIsTasksPaneOpen(true);
      }
      triggerVideoOpen();
    }
  };

  const handleViewImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsHoveringTaskItem(false);

    if (generationData && onOpenImageLightbox) {
      // Pass variant ID if available (for edit tasks that create variants)
      const initialVariantId = imageVariantId || (generationData as any)?._variant_id;
      onOpenImageLightbox(task, generationData, initialVariantId);
    }
  };

  const handleSwitchProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    navigate('/');
  };

  // Mobile tap handler
  const handleMobileTap = (e: React.MouseEvent) => {
    if (!isMobile) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    const hasActionableContent = 
      taskInfo.isCompletedVideoTask ||
      (taskInfo.isVideoTask && shotId) ||
      (taskInfo.isImageTask && generationData);
    
    if (hasActionableContent) {
      if (isMobileActive) {
        if (taskInfo.isCompletedVideoTask && onOpenVideoLightbox && videoOutputs && videoOutputs.length > 0) {
          onMobileActiveChange?.(null);
          const initialVariantId = (videoOutputs[0] as any)?._variant_id;
          onOpenVideoLightbox(task, videoOutputs, 0, initialVariantId);
          return;
        }
        
        if (taskInfo.isVideoTask && shotId) {
          onMobileActiveChange?.(null);
          setCurrentShotId(shotId);
          navigate(`/tools/travel-between-images#${shotId}`, { state: { fromShotClick: true } });
          return;
        }
        
        if (taskInfo.isImageTask && generationData && onOpenImageLightbox) {
          onMobileActiveChange?.(null);
          const initialVariantId = imageVariantId || (generationData as any)?._variant_id;
          onOpenImageLightbox(task, generationData, initialVariantId);
          return;
        }
      } else {
        onMobileActiveChange?.(task.id);
        if (taskInfo.isVideoTask) {
          ensureVideoFetch();
        }
        return;
      }
    }
    
    onMobileActiveChange?.(isMobileActive ? null : task.id);
  };

  const containerClass = cn(
    "relative p-3 mb-2 bg-zinc-800/95 rounded-md shadow border transition-colors overflow-hidden",
    isNew ? "border-teal-400 animate-[flash_3s_ease-in-out]" : 
    isActive ? "border-blue-500 bg-blue-900/20 ring-2 ring-blue-400/50" :
    "border-zinc-600 hover:border-zinc-400"
  );

  // Get variant name for display
  const variantName = taskInfo.isVideoTask 
    ? videoOutputs?.[0]?.name 
    : generationData?.name;

  const taskItemContent = (
    <div 
      className={containerClass}
      onMouseEnter={() => setIsHoveringTaskItem(true)}
      onMouseLeave={() => setIsHoveringTaskItem(false)}
      onClick={handleMobileTap}
    >
      {/* Header row */}
      <div className="flex justify-between items-center mb-1 gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-sm font-light text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis cursor-default min-w-0">
            {abbreviatedTaskType}
          </span>
          
          <TaskItemActions
            task={task}
            isMobile={isMobile}
            isCompletedVideoTask={taskInfo.isCompletedVideoTask}
            isImageTask={taskInfo.isImageTask}
            generationData={generationData}
            isLoadingVideoGen={isLoadingVideoGen}
            waitingForVideoToOpen={waitingForVideoToOpen}
            onViewVideo={handleViewVideo}
            onViewImage={handleViewImage}
            onVisitShot={handleVisitShot}
            showProjectIndicator={showProjectIndicator}
            projectName={projectName}
            selectedProjectId={selectedProjectId || undefined}
            onSwitchProject={handleSwitchProject}
            shotId={shotId}
          />
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
      
      {/* Image previews for Travel tasks */}
      {imagesToShow.length > 0 && (
        <div className="flex items-center overflow-x-auto mb-1 mt-2">
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
        </div>
      )}
      
      {/* Prompt for Image Generation tasks (not edit tasks) */}
      {taskParams.promptText && !taskInfo.isVideoTask && !IMAGE_EDIT_TASK_TYPES.includes(task.taskType as any) && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5 flex items-center justify-between">
            <div className="text-xs text-zinc-200 flex-1 min-w-0 pr-2">
              "{taskParams.promptText.length > 50 ? `${taskParams.promptText.substring(0, 50)}...` : taskParams.promptText}"
            </div>
            {generationData && (
              <button
                onClick={() => {
                  const initialVariantId = imageVariantId || (generationData as any)?._variant_id;
                  onOpenImageLightbox && onOpenImageLightbox(task, generationData, initialVariantId);
                }}
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
      
      {/* Footer row */}
      <div className="flex items-center text-[11px] text-zinc-400">
        <span className="flex-1">
          {task.status === 'In Progress' && processingTime ? 
            processingTime : 
            task.status === 'Complete' && completedTime ?
            completedTime :
            `Created ${createdTimeAgo}`
          }
        </span>
        
        {variantName && (
          <span className="ml-2 px-1.5 py-0.5 bg-black/50 text-white text-[10px] rounded-md flex-shrink-0">
            {variantName}
          </span>
        )}
        
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
      
      {/* Error message for failed tasks */}
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
                        toast({ title: 'Task ID Copied', description: 'Related task ID copied to clipboard', variant: 'default' });
                      }}
                      className="px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors border border-zinc-600 hover:border-zinc-400"
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
    </div>
  );

  return (
    <TaskItemTooltip
      task={task}
      taskParams={taskParams}
      isVideoTask={taskInfo.isVideoTask}
      isCompletedVideoTask={taskInfo.isCompletedVideoTask}
      showsTooltip={taskInfo.showsTooltip}
      isMobile={isMobile}
      travelImageUrls={travelImageUrls}
      videoOutputs={videoOutputs}
      generationData={generationData}
      actualGeneration={actualGeneration}
      onOpenVideoLightbox={onOpenVideoLightbox}
      onOpenImageLightbox={onOpenImageLightbox}
      onResetHoverState={() => setIsHoveringTaskItem(false)}
    >
      {taskItemContent}
    </TaskItemTooltip>
  );
};

export default TaskItem;
