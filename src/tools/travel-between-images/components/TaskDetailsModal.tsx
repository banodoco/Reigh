import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { getDisplayUrl } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/label';
import { fetchWithAuth } from '@/lib/api';

// Local definition for Json type to remove dependency on supabase client types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

interface TaskDetailsModalProps {
  generationId: string;
  children: React.ReactNode;
  onApplySettings?: (settings: {
    prompt?: string;
    prompts?: string[];
    negativePrompt?: string;
    negativePrompts?: string[];
    steps?: number;
    frame?: number;
    frames?: number[];
    context?: number;
    contexts?: number[];
    width?: number;
    height?: number;
    replaceImages?: boolean;
    inputImages?: string[];
  }) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  /**
   * Called when the modal is closed (either via the close button or external interaction).
   * Useful for parent components that need to reset state so the modal can be reopened for the same task.
   */
  onClose?: () => void;
}

interface Task {
  id: string;
  params: Json;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ generationId, children, onApplySettings, onApplySettingsFromTask, onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [replaceImages, setReplaceImages] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    const fetchTaskDetails = async () => {
      if (!isOpen || !generationId) return;

      setIsLoading(true);
      try {
        // Step 1: Get the task ID from the generation using the existing endpoint
        const taskIdResponse = await fetchWithAuth(`/api/generations/${generationId}/task-id`);
        if (!taskIdResponse.ok) {
          const errorData = await taskIdResponse.json().catch(() => ({ message: `Generation not found or has no task.` }));
          throw new Error(errorData.message);
        }
        const { taskId: fetchedTaskId } = await taskIdResponse.json();

        if (!fetchedTaskId) {
            console.log(`[TaskDetailsModal] No task ID found for generation ID: ${generationId}`);
            setTask(null);
            setTaskId(null);
            return;
        }
        
        setTaskId(fetchedTaskId);

        // Step 2: Fetch the task details using the database ID (not the task_id in params)
        const taskDetailsResponse = await fetchWithAuth(`/api/tasks/${fetchedTaskId}`);
        if (!taskDetailsResponse.ok) {
            const errorData = await taskDetailsResponse.json().catch(() => ({ message: `Task with ID ${fetchedTaskId} not found.` }));
            throw new Error(errorData.message);
        }
        
        const taskData = await taskDetailsResponse.json();
        setTask(taskData);

      } catch (error: any) {
        console.error('[TaskDetailsModal] Error fetching task details:', error);
        toast.error(`Failed to fetch task details: ${error.message}`);
        setTask(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTaskDetails();
  }, [isOpen, generationId]);

  const orchestratorDetails =
    task?.params && typeof task.params === 'object' && !Array.isArray(task.params)
      ? ((task.params.full_orchestrator_payload as any) ?? (task.params.orchestrator_details as any))
      : null;

  const inputImages = orchestratorDetails?.input_image_paths_resolved ?? [];

  // Helper to safely parse JSON strings from params
  const getParsedParams = () => {
    if (orchestratorDetails?.params_json_str_override) {
      try {
        return JSON.parse(orchestratorDetails.params_json_str_override);
      } catch (e) { /* ignore */ }
    }
    if (task?.params) {
      const params = task.params as any;
      if (params.params_json_str) {
        try {
          return JSON.parse(params.params_json_str);
        } catch (e) {
          return {};
        }
      }
      return params;
    }
    return {};
  };

  const parsedParams = getParsedParams();

  const getPrompt = () => {
    const promptsRaw = orchestratorDetails?.base_prompts ?? orchestratorDetails?.base_prompts_expanded;
    let promptValue: string | undefined;

    if (promptsRaw) {
      if (Array.isArray(promptsRaw)) {
        // Deduplicate prompts to avoid repetition and remove empty strings
        const uniquePrompts = [...new Set(promptsRaw.filter(p => p && p.trim()))];
        promptValue = uniquePrompts.join('; ');
      } else {
        promptValue = promptsRaw as string;
      }
    }

    if (!promptValue || promptValue.trim() === '') {
      // Fallback to params.prompt if available
      promptValue = typeof parsedParams.prompt === 'string' ? parsedParams.prompt : '';
    }

    return promptValue && promptValue.trim() !== '' ? promptValue : 'N/A';
  };

  const getNegativePrompt = () => {
    const negPromptsRaw = orchestratorDetails?.negative_prompt ?? orchestratorDetails?.negative_prompts_expanded;
    let negValue: string | undefined;

    if (negPromptsRaw) {
      if (Array.isArray(negPromptsRaw)) {
        const uniqueNeg = [...new Set(negPromptsRaw.filter(p => p && p.trim()))];
        negValue = uniqueNeg.join('; ');
      } else {
        negValue = negPromptsRaw as string;
      }
    }

    if (!negValue || negValue.trim() === '') {
      negValue = typeof parsedParams.negative_prompt === 'string' ? parsedParams.negative_prompt : '';
    }

    return negValue && negValue.trim() !== '' ? negValue : 'N/A';
  };

  // Frames per segment array (one entry per generated segment)
  const framesArray: number[] = orchestratorDetails?.segment_frames_expanded ?? [];
  const framesDisplay = framesArray.length === 0
    ? 'N/A'
    : (() => {
        const unique = [...new Set(framesArray)];
        return unique.length === 1 ? unique[0].toString() : framesArray.join(', ');
      })();

  const getSteps = () => {
    if (parsedParams.steps) return parsedParams.steps;
    if (orchestratorDetails?.steps) return orchestratorDetails.steps;
    if (orchestratorDetails?.num_inference_steps) return orchestratorDetails.num_inference_steps;
    return parsedParams.num_inference_steps ?? 'N/A';
  };

  // Context/overlap array
  const contextArray: number[] = orchestratorDetails?.frame_overlap_expanded ?? orchestratorDetails?.frame_overlap_settings_expanded ?? [];
  const contextDisplay = contextArray.length === 0
    ? 'N/A'
    : (() => {
        const unique = [...new Set(contextArray)];
        return unique.length === 1 ? unique[0].toString() : contextArray.join(', ');
      })();

  // LoRAs used in task
  const additionalLoras = orchestratorDetails?.additional_loras || {};
  const lorasList = Object.entries(additionalLoras).map(([url, strength]) => ({
    url: url as string,
    strength: strength as number,
    name: 'Unknown LoRA', // Default fallback
  }));

  const getResolution = () => {
    if (orchestratorDetails?.parsed_resolution_wh) return orchestratorDetails.parsed_resolution_wh;
    if (parsedParams.width && parsedParams.height) return `${parsedParams.width}x${parsedParams.height}`;
    return 'N/A';
  };

  const prompt = getPrompt();
  const negativePrompt = getNegativePrompt();
  const steps = getSteps();
  const resolution = getResolution();

  const handleApplySettings = () => {
    // Use the working approach with extracted settings
    if (onApplySettings && task) {
      const settings: any = {
        // Pass the full arrays for by-pair mode handling
        prompts: orchestratorDetails?.base_prompts_expanded ?? [],
        frames: orchestratorDetails?.segment_frames_expanded ?? [],
        negativePrompts: orchestratorDetails?.negative_prompts_expanded ?? [],
        contexts: orchestratorDetails?.frame_overlap_expanded ?? [],
      };
      
      // Include image replacement data if checkbox is checked
      if (replaceImages && inputImages.length > 0) {
        settings.replaceImages = true;
        settings.inputImages = inputImages;
      }
      
      // Extract single values for fallback or batch-like application
      const prompt = getPrompt();
      if (prompt && prompt !== 'N/A') {
        settings.prompt = prompt;
      }
      
      const negativePrompt = getNegativePrompt();
      if (negativePrompt && negativePrompt !== 'N/A') {
        settings.negativePrompt = negativePrompt;
      }
      
      const steps = getSteps();
      if (steps && steps !== 'N/A') {
        const stepsNum = typeof steps === 'number' ? steps : parseInt(steps.toString(), 10);
        if (!isNaN(stepsNum)) {
          settings.steps = stepsNum;
        }
      }

      const resolution = getResolution();
      if (resolution && resolution !== 'N/A') {
        if (typeof resolution === 'string' && resolution.includes('x')) {
          const [width, height] = resolution.split('x').map(n => parseInt(n, 10));
          if (!isNaN(width) && !isNaN(height)) {
            settings.width = width;
            settings.height = height;
          }
        } else if (Array.isArray(resolution) && resolution.length === 2) {
          const [width, height] = resolution;
          if (typeof width === 'number' && typeof height === 'number') {
            settings.width = width;
            settings.height = height;
          }
        }
      }
      
      // Add single frame and context for batch mode
      if (settings.frames.length > 0) {
          settings.frame = settings.frames[0];
      }
      if (settings.contexts.length > 0) {
          settings.context = settings.contexts[0];
      }

      onApplySettings(settings);
      setIsOpen(false);
      // Toast will be shown by parent handler
      return; // Exit early to prevent fallback
    }
    
    // Fallback to the new approach if the old one isn't available
    if (onApplySettingsFromTask && taskId) {
      onApplySettingsFromTask(taskId, replaceImages, inputImages);
      setIsOpen(false);
      // Toast will be shown by parent handler
      return;
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        // If the dialog is transitioning from open -> closed, notify parent
        if (!open && onClose) {
          onClose();
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col" aria-describedby="task-details-description">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-semibold">Generation Task Details</DialogTitle>
          <p id="task-details-description" className="sr-only">
            View details about the task that generated this video, including input images, settings, and parameters.
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="flex flex-col items-center space-y-3">
                <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-muted-foreground">Loading task details...</p>
              </div>
            </div>
          ) : task ? (
            <div className="overflow-y-auto pr-2 space-y-6" style={{ maxHeight: 'calc(80vh - 140px)' }}>
              {/* Input Images Section - Prominently displayed at top */}
              {inputImages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <h3 className="text-lg font-semibold text-foreground">Input Images</h3>
                    <span className="text-sm text-muted-foreground">({inputImages.length} image{inputImages.length !== 1 ? 's' : ''})</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-muted/30 rounded-lg border">
                    {inputImages.map((img: string, index: number) => (
                      <div key={index} className="relative group">
                        <img 
                          src={getDisplayUrl(img)} 
                          alt={`Input image ${index + 1}`} 
                          className="w-full aspect-square object-cover rounded-md border shadow-sm transition-transform group-hover:scale-105"
                        />
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generation Summary Section */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <h3 className="text-lg font-semibold text-foreground">Generation Summary</h3>
                </div>
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                  {/* Prompts Section */}
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
                      <p className="text-sm font-medium break-words whitespace-pre-wrap">{prompt}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Negative Prompt</p>
                      <p className="text-sm font-medium break-words whitespace-pre-wrap">{negativePrompt}</p>
                    </div>
                  </div>
                  
                  {/* Technical Settings */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-muted-foreground/20">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Steps</p>
                      <p className="text-sm font-medium">{steps}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolution</p>
                      <p className="text-sm font-medium">{resolution}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Frames / Segment</p>
                      <p className="text-sm font-medium">{framesDisplay}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Context Frames</p>
                      <p className="text-sm font-medium">{contextDisplay}</p>
                    </div>
                  </div>

                  {/* LoRAs Section */}
                  {lorasList.length > 0 && (
                    <div className="pt-3 border-t border-muted-foreground/20">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LoRAs Used</p>
                        <div className="space-y-2">
                          {lorasList.map((lora, index) => {
                            const fileName = lora.url.split('/').pop() || 'Unknown';
                            const displayName = fileName.replace(/\.(safetensors|ckpt|pt)$/, '');
                            return (
                              <div key={index} className="flex items-center justify-between p-2 bg-background/50 rounded border">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate" title={displayName}>
                                    {displayName}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate" title={lora.url}>
                                    {lora.url}
                                  </p>
                                </div>
                                <div className="text-sm font-medium text-muted-foreground ml-2">
                                  {lora.strength}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <h3 className="text-lg font-semibold text-foreground">Task Parameters</h3>
                </div>
                <div className="bg-muted/30 rounded-lg border p-4">
                  <div className="max-h-96 overflow-y-auto">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                      {JSON.stringify(task.params, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center h-64">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">No task details available for this generation.</p>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <div className="flex justify-between w-full items-center">
            <div className="flex items-center space-x-4">
              {inputImages.length > 0 && (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="replaceImages"
                      checked={replaceImages}
                      onCheckedChange={(checked) => setReplaceImages(checked as boolean)}
                    />
                    <Label htmlFor="replaceImages" className="text-sm font-medium">
                      Replace these images
                    </Label>
                  </div>
                  {onApplySettings && task && (
                    <Button 
                      variant="default" 
                      onClick={handleApplySettings}
                      className="text-sm"
                    >
                      Apply These Settings
                    </Button>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="text-sm"
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailsModal; 