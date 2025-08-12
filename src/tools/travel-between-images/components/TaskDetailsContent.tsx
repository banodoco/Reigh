import React, { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { Task } from '@/types/tasks';
import { useGetTaskIdForGeneration } from '@/shared/hooks/useGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';
import { cn } from '@/shared/lib/utils';

interface TaskDetailsContentProps {
  generationId: string;
  onApplySettings?: (settings: any) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onClose?: () => void;
  className?: string;
}

const TaskDetailsContent: React.FC<TaskDetailsContentProps> = ({ 
  generationId, 
  onApplySettings, 
  onApplySettingsFromTask, 
  onClose,
  className 
}) => {
  const [replaceImages, setReplaceImages] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [showDetailedParams, setShowDetailedParams] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);

  // Use the new hooks
  const getTaskIdMutation = useGetTaskIdForGeneration();
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(taskId || '');

  // Derive input images from multiple possible locations within task params
  const inputImages: string[] = React.useMemo(() => {
    const p = (task as any)?.params || {};
    if (Array.isArray(p.input_images) && p.input_images.length > 0) return p.input_images;
    if (p.full_orchestrator_payload && Array.isArray(p.full_orchestrator_payload.input_image_paths_resolved)) {
      return p.full_orchestrator_payload.input_image_paths_resolved;
    }
    if (Array.isArray(p.input_image_paths_resolved)) return p.input_image_paths_resolved;
    return [];
  }, [task]);

  // Helper to safely access orchestrator payload
  const orchestratorPayload = (task as any)?.params?.full_orchestrator_payload as any;
  
  // Get LoRAs from the correct location (orchestrator payload first, then fallback to params)
  const additionalLoras = (orchestratorPayload?.additional_loras || (task as any)?.params?.additional_loras) as Record<string, any> | undefined;

  useEffect(() => {
    let cancelled = false; // guard to avoid state updates after unmount
    const fetchTaskDetails = async () => {
      if (!generationId) return;

      try {
        // Step 1: Get the task ID from the generation using Supabase
        const result = await getTaskIdMutation.mutateAsync(generationId);

        if (cancelled) return;

        if (!result.taskId) {
            console.log(`[TaskDetailsContent] No task ID found for generation ID: ${generationId}`);
            setTaskId(null);
            return;
        }
        
        setTaskId(result.taskId);
        // The task data will be fetched by the useGetTask hook automatically

      } catch (error: any) {
        if (cancelled) return;
        console.error(`[TaskDetailsContent] Error fetching task details:`, error);
        setTaskId(null);
      }
    };

    fetchTaskDetails();

    // Cleanup to avoid setting state after unmount
    return () => {
      cancelled = true;
    };
  }, [generationId]);

  const handleApplySettings = () => {
    if (task && onApplySettings) {
      onApplySettings(task.params);
    }
    onClose?.();
  };

  const handleApplySettingsFromTask = () => {
    if (taskId && onApplySettingsFromTask && task) {
      // Pass the correctly ordered inputImages array (derived from task JSON sources)
      onApplySettingsFromTask(taskId, replaceImages, inputImages);
    }
    onClose?.();
  };

  const isLoading = getTaskIdMutation.isPending || isLoadingTask;
  const error = getTaskIdMutation.error || taskError;

  return (
    <div className={cn("text-white p-4 space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Task Details</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-white hover:text-white hover:bg-white/20"
        >
          ×
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-32">
          <div className="flex flex-col items-center space-y-3">
            <svg className="animate-spin h-6 w-6 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-sm text-white/80">Loading task details...</p>
          </div>
        </div>
      ) : task ? (
        <div className="space-y-4 max-h-[calc(100%-4rem)] overflow-y-auto">
          {/* Generation Summary Section */}
          <div className="space-y-3">
            <div className="space-y-4 p-3 bg-white/10 rounded-lg border border-white/20">
              {/* Input Images Section */}
              {inputImages.length > 0 && (() => {
                const imagesPerRow = 4;
                const imagesToShow = showAllImages ? inputImages : inputImages.slice(0, imagesPerRow);
                const remainingCount = inputImages.length - imagesPerRow;
                
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Input Images</p>
                        <span className="text-xs text-white/60">({inputImages.length} image{inputImages.length !== 1 ? 's' : ''})</span>
                      </div>
                      {inputImages.length > imagesPerRow && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAllImages(!showAllImages)}
                          className="h-6 px-2 text-xs text-white hover:text-white hover:bg-white/20"
                        >
                          {showAllImages ? 'Show Less' : `Show ${remainingCount} More`}
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {imagesToShow.map((img: string, index: number) => (
                        <div key={index} className="relative group">
                          <img 
                            src={img} 
                            alt={`Input image ${index + 1}`} 
                            className="w-full aspect-square object-cover rounded border shadow-sm transition-transform group-hover:scale-105"
                          />
                          <div className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                            {index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Prompts and Technical Settings Section */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Prompt</p>
                  {(() => {
                    const prompt = orchestratorPayload?.base_prompts_expanded?.[0] || (task as any)?.params?.prompt || 'N/A';
                    const maxLength = 100;
                    const shouldTruncate = prompt.length > maxLength;
                    const displayText = showFullPrompt || !shouldTruncate ? prompt : prompt.slice(0, maxLength) + '...';
                    
                    return (
                      <div>
                        <p className="text-sm text-white break-words whitespace-pre-wrap">
                          {displayText}
                        </p>
                        {shouldTruncate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowFullPrompt(!showFullPrompt)}
                            className="h-6 px-0 text-xs text-blue-300 hover:text-blue-200 mt-1"
                          >
                            {showFullPrompt ? 'Show Less' : 'Show More'}
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-white/80">Steps</p>
                    <p className="text-white">{orchestratorPayload?.steps || (task as any)?.params?.num_inference_steps || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/80">Resolution</p>
                    <p className="text-white">{(task as any)?.params?.parsed_resolution_wh || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/80">Frames</p>
                    <p className="text-white">{orchestratorPayload?.segment_frames_expanded?.[0] || (task as any)?.params?.segment_frames_expanded || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/80">Context</p>
                    <p className="text-white">{(task as any)?.params?.frame_overlap_settings_expanded?.[0] || orchestratorPayload?.frame_overlap_expanded?.[0] || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          {inputImages.length > 0 && (
            <div className="border-t border-white/20 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="replaceImages"
                    checked={replaceImages}
                    onCheckedChange={(checked) => setReplaceImages(checked as boolean)}
                  />
                  <Label htmlFor="replaceImages" className="text-sm text-white">
                    Replace images
                  </Label>
                </div>
                {onApplySettingsFromTask && task && taskId && (
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleApplySettingsFromTask}
                    className="text-xs"
                  >
                    Apply Settings
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-center items-center h-32">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 mx-auto bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-white/80">No task details available</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetailsContent;
