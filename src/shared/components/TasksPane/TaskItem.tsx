import React, { useState, useEffect, useMemo, useRef } from "react";
import { Settings, Key, Copy, Trash2, AlertCircle, Terminal, Coins, Monitor, LogOut, HelpCircle, MoreHorizontal } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Button } from "@/shared/components/ui/button";
import { Task } from '@/types/tasks';
import { getTaskDisplayName, taskSupportsProgress } from '@/shared/lib/taskConfig';
import { useListTasks, useCancelTask } from '@/shared/hooks/useTasks';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useToast } from '@/shared/hooks/use-toast';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { formatDistanceToNow, isValid } from 'date-fns';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { GenerationRow } from '@/types/shots';
import { useListShots, useAddImageToShot } from '@/shared/hooks/useShots';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
}

// Helper to abbreviate distance strings (e.g., "5 minutes ago" -> "5 mins ago")
const abbreviateDistance = (str: string) => {
  // Handle "less than a minute ago" special case
  if (str.includes('less than a minute')) {
    return '<1 min ago';
  }
  
  return str
    .replace(/1 minutes ago/, '1 min ago')
    .replace(/1 hours ago/, '1 hr ago')
    .replace(/1 seconds ago/, '1 sec ago')
    .replace(/1 days ago/, '1 day ago')
    .replace(/minutes?/, 'mins')
    .replace(/hours?/, 'hrs')
    .replace(/seconds?/, 'secs')
    .replace(/days?/, 'days');
};

const TaskItem: React.FC<TaskItemProps> = ({ task, isNew = false }) => {
  const { toast } = useToast();

  // Access project context early so it can be used in other hooks
  const { selectedProjectId } = useProject();

  // Mutations
  const cancelTaskMutation = useCancelTask(selectedProjectId);

  // Access all tasks for project (used for progress checking)
  const { data: allProjectTasks, refetch: refetchAllTasks } = useListTasks({ projectId: selectedProjectId });

  // Shot-related hooks
  const { data: shots } = useListShots(selectedProjectId);
  const { currentShotId } = useCurrentShot();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const addImageToShotMutation = useAddImageToShot();

  // State for MediaLightbox
  const [showLightbox, setShowLightbox] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState<string>('');
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);

  // Create simplified shot options for MediaLightbox
  const simplifiedShotOptions = React.useMemo(() => shots?.map(s => ({ id: s.id, name: s.name })) || [], [shots]);

  // Set initial selected shot
  useEffect(() => {
    const newSelectedShotId = currentShotId || lastAffectedShotId || (simplifiedShotOptions.length > 0 ? simplifiedShotOptions[0].id : "");
    setSelectedShotId(newSelectedShotId);
  }, [currentShotId, lastAffectedShotId, simplifiedShotOptions]);

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

  // Map certain task types to more user-friendly names for display purposes
  const displayTaskType = getTaskDisplayName(task.taskType);
  const abbreviatedTaskType = getAbbreviatedTaskName(displayTaskType);

  // Extract prompt for Image Generation tasks (single_image)
  const promptText: string = React.useMemo(() => {
    if (task.taskType !== 'single_image') return '';
    const params = typeof task.params === 'string' ? JSON.parse(task.params) : task.params || {};
    return params?.orchestrator_details?.prompt || '';
  }, [task]);

  // Check if this is a successful Image Generation task with output
  const hasGeneratedImage = React.useMemo(() => {
    return (
      task.taskType === 'single_image' && 
      task.status === 'Complete' && 
      task.outputLocation
    );
  }, [task.taskType, task.status, task.outputLocation]);

  // Fetch the actual generation record for this task
  const { data: actualGeneration } = useQuery({
    queryKey: ['generation-for-task', task.id, task.outputLocation],
    queryFn: async () => {
      if (!hasGeneratedImage || !task.outputLocation) return null;
      
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
          error
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
    
    return {
      id: actualGeneration.id, // Use the real generation ID
      location: actualGeneration.location,
      imageUrl: actualGeneration.location,
      thumbUrl: actualGeneration.thumb_url || actualGeneration.location,
      type: actualGeneration.type || 'image',
      created_at: actualGeneration.created_at,
      metadata: actualGeneration.metadata || {},
      params: actualGeneration.params || {},
      project_id: actualGeneration.project_id,
      tasks: actualGeneration.tasks || [task.id],
    } as GenerationRow;
  }, [hasGeneratedImage, actualGeneration, task.id]);

  // Extract image URLs for Travel Between Images tasks (travel_orchestrator)
  const imageUrls: string[] = React.useMemo(() => {
    if (task.taskType !== 'travel_orchestrator') return [];
    const resolved = (task.params as any)?.orchestrator_details?.input_image_paths_resolved;
    return Array.isArray(resolved) ? resolved as string[] : [];
  }, [task]);
  const imagesToShow = imageUrls.slice(0, 4);
  const extraImageCount = Math.max(0, imageUrls.length - imagesToShow.length);

  // Extract shot_id for Travel Between Images tasks
  const shotId: string | null = React.useMemo(() => {
    if (task.taskType !== 'travel_orchestrator') return null;
    return (task.params as any)?.orchestrator_details?.shot_id || null;
  }, [task]);

  // Navigation setup
  const navigate = useNavigate();
  const { setCurrentShotId } = useCurrentShot();
  
  // State for hover functionality
  const [isHoveringImages, setIsHoveringImages] = useState<boolean>(false);

  // Local state to show progress percentage temporarily
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  const handleCancel = () => {
    // Cancel task (subtasks will be automatically cancelled if this is an orchestrator)
    cancelTaskMutation.mutate(task.id, {
      onError: (error) => {
        toast({
          title: 'Cancellation Failed',
          description: error.message || 'Could not cancel the task.',
          variant: 'destructive',
        });
      },
    });
  };

  // Always refetch the latest tasks before computing progress so that we use
  // up-to-date information rather than potentially stale cached data.
  const handleCheckProgress = () => {
    console.log('[TaskProgressDebug] Check Progress clicked for task:', task.id, 'taskType:', task.taskType);
    console.log('[TaskProgressDebug] Current allProjectTasks length:', allProjectTasks?.length || 0);
    
    refetchAllTasks()
      .then(({ data }) => {
        console.log('[TaskProgressDebug] Refetch completed, data length:', data?.length || 0);
        // Prefer freshly-fetched data when available
        if (data && data.length > 0) {
          console.log('[TaskProgressDebug] Using freshly fetched data');
          computeAndShowProgress(data);
        } else if (allProjectTasks) {
          console.log('[TaskProgressDebug] Using cached allProjectTasks');
          // Fallback to existing cached data if refetch didn't return anything
          computeAndShowProgress(allProjectTasks);
        } else {
          console.log('[TaskProgressDebug] No data available for progress computation');
        }
      })
      .catch(() => {
        console.log('[TaskProgressDebug] Refetch failed, using cached data if available');
        // If refetch fails, still attempt to compute progress from cached data
        if (allProjectTasks) {
          computeAndShowProgress(allProjectTasks);
        }
      });
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
    if (subtasks.length === 0) {
      console.log('[TaskProgressDebug] No subtasks found, showing toast');
      toast({ title: 'Progress', description: 'No subtasks found yet.', variant: 'default' });
      return;
    }
    // Progress is based on the ratio of completed subtasks to (total subtasks - 1)
    const completed = subtasks.filter((t) => t.status === 'Complete').length;
    console.log('[TaskProgressDebug] Completed subtasks:', completed);
    const denominator = Math.max(subtasks.length - 1, 1); // Avoid divide-by-zero and remove the final stitch task
    console.log('[TaskProgressDebug] Denominator:', denominator);

    const rawPercent = (completed / denominator) * 100;
    const percent = Math.round(Math.min(rawPercent, 100));
    console.log('[TaskProgressDebug] Calculated progress:', percent, '% (raw:', rawPercent, ')');

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
    
    setCurrentShotId(shotId);
    navigate(`/tools/travel-between-images#${shotId}`, { state: { fromShotClick: true } });
  };

  const containerClass = cn(
    "p-3 mb-2 bg-zinc-800/95 rounded-md shadow border transition-colors overflow-hidden",
    isNew ? "border-teal-400 animate-[flash_3s_ease-in-out]" : "border-zinc-600 hover:border-zinc-400"
  );

  return (
    <div className={containerClass}>
      <div className="flex justify-between items-center mb-1 gap-2">
        <span className="text-sm font-semibold text-zinc-200 flex-1 whitespace-nowrap overflow-hidden text-ellipsis cursor-default min-w-0">
          {abbreviatedTaskType}
        </span>
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
          onMouseEnter={() => setIsHoveringImages(true)}
          onMouseLeave={() => setIsHoveringImages(false)}
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
          {/* Visit Shot button overlay on hover */}
          {isHoveringImages && shotId && (
            <div 
              className="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded flex items-center justify-center"
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
            </div>
          )}
        </div>
      )}
      {/* Show prompt for Image Generation tasks */}
      {promptText && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5 flex items-center justify-between">
            <div className="text-xs text-zinc-200 flex-1 min-w-0 pr-2">
              "{promptText.length > 50 ? `${promptText.substring(0, 50)}...` : promptText}"
            </div>
            {/* Tiny thumbnail for successful Image Generation tasks */}
            {generationData && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setShowLightbox(true)}
                      className="w-8 h-8 rounded border border-zinc-500 overflow-hidden hover:border-zinc-400 transition-colors flex-shrink-0"
                    >
                      <img
                        src={generationData.imageUrl}
                        alt="Generated image"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Click to view image</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center text-xs text-zinc-400">
        <span className="flex-1">
          Created: {(() => {
            // Handle both createdAt and created_at field names from database
            const dateStr = task.createdAt || (task as any).created_at;
            if (!dateStr) return 'Unknown';
            
            const date = new Date(dateStr);
            if (!isValid(date)) return 'Unknown';
            
            return abbreviateDistance(formatDistanceToNow(date, { addSuffix: true }));
          })()}
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
                className="px-1 py-1 min-w-[120px] h-auto text-blue-400 hover:bg-blue-900/20 hover:text-blue-300 flex flex-col items-center justify-center"
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
      {/* Add more task details as needed, e.g., from task.params */}
      {/* <pre className="text-xs text-zinc-500 whitespace-pre-wrap break-all">{JSON.stringify(task.params, null, 2)}</pre> */}
      
      {/* MediaLightbox for viewing generated images */}
      {showLightbox && generationData && (
        <MediaLightbox
          media={generationData}
          onClose={() => setShowLightbox(false)}
          showNavigation={false}
          showImageEditTools={true}
          showDownload={true}
          showMagicEdit={false}
          allShots={simplifiedShotOptions}
          selectedShotId={selectedShotId}
          onShotChange={handleShotChange}
          onAddToShot={handleAddToShot}
          showTickForImageId={showTickForImageId}
          onShowTick={handleShowTick}
        />
      )}
    </div>
  );
};

export default TaskItem; 