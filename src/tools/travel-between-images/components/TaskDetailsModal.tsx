import React, { useEffect, useState, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription, 
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter 
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Separator } from '@/shared/components/ui/separator';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Label } from '@/shared/components/ui/label';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Task } from '@/types/tasks';
import { supabase } from '@/integrations/supabase/client';
import { useGetTaskIdForGeneration, useCreateGeneration } from '@/shared/hooks/useGenerations';
import { useGetTask } from '@/shared/hooks/useTasks';


interface TaskDetailsModalProps {
  generationId: string;
  children: ReactNode;
  onApplySettings?: (settings: any) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onClose?: () => void;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ generationId, children, onApplySettings, onApplySettingsFromTask, onClose }) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
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
      if (!isOpen || !generationId) return;

      try {
        // Step 1: Get the task ID from the generation using Supabase
        const result = await getTaskIdMutation.mutateAsync(generationId);

        if (cancelled) return;

        if (!result.taskId) {
            console.log(`[TaskDetailsModal] No task ID found for generation ID: ${generationId}`);
            setTaskId(null);
            return;
        }
        
        setTaskId(result.taskId);
        // The task data will be fetched by the useGetTask hook automatically

      } catch (error: any) {
        if (cancelled) return;
        console.error(`[TaskDetailsModal] Error fetching task details:`, error);
        setTaskId(null);
      }
    };

    fetchTaskDetails();

    // Cleanup to avoid setting state after unmount
    return () => {
      cancelled = true;
    };
  }, [isOpen, generationId]); // Removed getTaskIdMutation to avoid infinite loop

  const handleApplySettings = () => {
    if (task && onApplySettings) {
      onApplySettings(task.params);
    }
    setIsOpen(false);
    onClose?.();
  };

    const handleApplySettingsFromTask = () => {
    if (taskId && onApplySettingsFromTask && task) {
      // Pass the correctly ordered inputImages array (derived from task JSON sources)
      onApplySettingsFromTask(taskId, replaceImages, inputImages);
    }
    setIsOpen(false);
    onClose?.();
  };

  const isLoading = getTaskIdMutation.isPending || isLoadingTask;
  const error = getTaskIdMutation.error || taskError;

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
      <DialogContent 
        className={`sm:max-w-[700px] flex flex-col ${
          isMobile ? 'mx-2 my-5 max-h-[calc(100vh-2.5rem)]' : ''
        }`}
        aria-describedby="task-details-description"
      >
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
              {/* Generation Summary Section */}
              <div className="space-y-3">
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                  {/* Input Images Section - Inside Generation Summary */}
                  {inputImages.length > 0 && (() => {
                    const imagesPerRow = 6;
                    const imagesToShow = showAllImages ? inputImages : inputImages.slice(0, imagesPerRow);
                    const remainingCount = inputImages.length - imagesPerRow;
                    
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Input Images</p>
                            <span className="text-xs text-muted-foreground">({inputImages.length} image{inputImages.length !== 1 ? 's' : ''})</span>
                          </div>
                          {inputImages.length > imagesPerRow && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowAllImages(!showAllImages)}
                              className="h-6 px-2 text-xs"
                            >
                              {showAllImages ? 'Show Less' : `Show ${remainingCount} More`}
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                          {imagesToShow.map((img: string, index: number) => (
                            <div key={index} className="relative group">
                              <img 
                                src={img} 
                                alt={`Input image ${index + 1}`} 
                                className="w-full aspect-square object-cover rounded-md border shadow-sm transition-transform group-hover:scale-105"
                              />
                              <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                                {index + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Prompts and Technical Settings Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Prompts Section - Left side (50% width) */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
                        {(() => {
                          const prompt = orchestratorPayload?.base_prompts_expanded?.[0] || (task as any)?.params?.prompt || 'N/A';
                          const maxLength = 150;
                          const shouldTruncate = prompt.length > maxLength;
                          const displayText = showFullPrompt || !shouldTruncate ? prompt : prompt.slice(0, maxLength) + '...';
                          
                          return (
                            <div>
                              <p className="text-sm font-medium break-words whitespace-pre-wrap">
                                {displayText}
                              </p>
                              {shouldTruncate && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowFullPrompt(!showFullPrompt)}
                                  className="h-6 px-0 text-xs text-primary mt-1"
                                >
                                  {showFullPrompt ? 'Show Less' : 'Show More'}
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Negative Prompt</p>
                        {(() => {
                          const negativePrompt = orchestratorPayload?.negative_prompts_expanded?.[0] || (task as any)?.params?.negative_prompt || 'N/A';
                          const maxLength = 150;
                          const shouldTruncate = negativePrompt.length > maxLength;
                          const displayText = showFullNegativePrompt || !shouldTruncate ? negativePrompt : negativePrompt.slice(0, maxLength) + '...';
                          
                          return (
                            <div>
                              <p className="text-sm font-medium break-words whitespace-pre-wrap">
                                {displayText}
                              </p>
                              {shouldTruncate && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowFullNegativePrompt(!showFullNegativePrompt)}
                                  className="h-6 px-0 text-xs text-primary mt-1"
                                >
                                  {showFullNegativePrompt ? 'Show Less' : 'Show More'}
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    
                    {/* Technical Settings - Right side (50% width, 2x2 grid) */}
                    <div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Steps</p>
                          <p className="text-sm font-medium">
                            {orchestratorPayload?.steps || (task as any)?.params?.num_inference_steps || 'N/A'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolution</p>
                          <p className="text-sm font-medium">{(task as any)?.params?.parsed_resolution_wh || 'N/A'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Frames / Segment</p>
                          <p className="text-sm font-medium">
                            {orchestratorPayload?.segment_frames_expanded?.[0] || (task as any)?.params?.segment_frames_expanded || 'N/A'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Context Frames</p>
                          <p className="text-sm font-medium">
                            {(task as any)?.params?.frame_overlap_settings_expanded?.[0] || orchestratorPayload?.frame_overlap_expanded?.[0] || (task as any)?.params?.frame_overlap_expanded || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* LoRAs Section */}
                  {additionalLoras && Object.keys(additionalLoras).length > 0 && (
                    <div className="pt-3 border-t border-muted-foreground/20">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LoRAs Used</p>
                        <div className="space-y-2">
                          {Object.entries(additionalLoras).map(([url, strength]) => {
                            const fileName = url.split('/').pop() || 'Unknown';
                            const displayName = fileName.replace(/\.(safetensors|ckpt|pt)$/, '');
                            return (
                              <div key={url} className="flex items-center justify-between p-2 bg-background/50 rounded border">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate" title={displayName}>
                                    {displayName}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate" title={url}>
                                    {url}
                                  </p>
                                </div>
                                <div className="text-sm font-medium text-muted-foreground ml-2">
                                  {strength}
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-semibold text-foreground">Detailed Task Parameters</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetailedParams(!showDetailedParams)}
                    className="h-8 px-2"
                  >
                    <svg 
                      className={`h-4 w-4 transition-transform ${showDetailedParams ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="ml-1 text-xs">
                      {showDetailedParams ? 'Hide' : 'Show'}
                    </span>
                  </Button>
                </div>
                {showDetailedParams && (
                  <div className="bg-muted/30 rounded-lg border p-4">
                    <div className="max-h-96 overflow-y-auto">
                      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                        {JSON.stringify(task?.params ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
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
                  {onApplySettingsFromTask && task && taskId && (
                    <Button 
                      variant="default" 
                      onClick={handleApplySettingsFromTask}
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