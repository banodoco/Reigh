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
import { useLargeModal } from '@/shared/hooks/useModal';
import { Label } from '@/shared/components/ui/label';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Task } from '@/types/tasks';
import { supabase } from '@/integrations/supabase/client';
import { useCreateGeneration } from '@/shared/hooks/useGenerations';
import { useGetTaskIdForGeneration } from '@/shared/lib/generationTaskBridge';
import { useGetTask } from '@/shared/hooks/useTasks';
import { Check, X, Copy } from 'lucide-react';
import { SharedTaskDetails } from './SharedTaskDetails';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { LoraModel } from '@/shared/components/LoraSelectorModal';


interface TaskDetailsModalProps {
  generationId: string;
  children?: ReactNode;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onClose?: () => void;
  onShowVideo?: () => void;
  isVideoContext?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ generationId, children, onApplySettingsFromTask, onClose, onShowVideo, isVideoContext, open, onOpenChange }) => {
  const isMobile = useIsMobile();
  const modal = useLargeModal();
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled state if provided, otherwise fall back to internal state
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [replaceImages, setReplaceImages] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [showDetailedParams, setShowDetailedParams] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);
  const [paramsCopied, setParamsCopied] = useState(false);

  // Use the new hooks
  const getTaskIdMutation = useGetTaskIdForGeneration();
  const { data: task, isLoading: isLoadingTask, error: taskError } = useGetTask(taskId || '');
  
  // Fetch public LoRAs for proper name display
  const publicLorasQuery = useListPublicResources('lora');
  const availableLoras = ((publicLorasQuery.data || []) as any[]).map(resource => resource.metadata || {}) as LoraModel[];

  // Derive input images from multiple possible locations within task params
  // Strips any surrounding quotes from URLs that may have been improperly stored
  const inputImages: string[] = React.useMemo(() => {
    const cleanUrl = (url: string): string => {
      if (typeof url !== 'string') return url;
      // Remove surrounding quotes if present
      return url.replace(/^["']|["']$/g, '');
    };
    
    const p = (task as any)?.params || {};
    if (Array.isArray(p.input_images) && p.input_images.length > 0) {
      return p.input_images.map(cleanUrl);
    }
    if (p.full_orchestrator_payload && Array.isArray(p.full_orchestrator_payload.input_image_paths_resolved)) {
      return p.full_orchestrator_payload.input_image_paths_resolved.map(cleanUrl);
    }
    if (Array.isArray(p.input_image_paths_resolved)) {
      return p.input_image_paths_resolved.map(cleanUrl);
    }
    return [];
  }, [task]);



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

  const handleApplySettingsFromTask = () => {
    if (taskId && onApplySettingsFromTask && task) {
      // Pass the correctly ordered inputImages array (derived from task JSON sources)
      onApplySettingsFromTask(taskId, replaceImages, inputImages);
    }
    setIsOpen(false);
    onClose?.();
  };

  const handleCopyParams = async () => {
    if (!task?.params) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(task.params, null, 2));
      setParamsCopied(true);
      setTimeout(() => setParamsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy parameters:', err);
    }
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
      {/* Avoid rendering an active trigger when controlled via `open` to prevent unintended close events */}
      {!open && children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent 
        className={modal.className}
        style={modal.style}
        {...modal.props}
        aria-describedby="task-details-description"
      >
        <div className={modal.headerClass}>
          <DialogHeader>
            <DialogTitle className="text-xl font-light">Generation Task Details</DialogTitle>
            <p id="task-details-description" className="sr-only">
              View details about the task that generated this video, including input images, settings, and parameters.
            </p>
          </DialogHeader>
        </div>
        
        <div className={modal.scrollClass}>
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
            <div className="space-y-6 p-4">
              {/* Generation Summary Section */}
              <div className="space-y-3">
                <SharedTaskDetails
                  task={task}
                  inputImages={inputImages}
                  variant="modal"
                  isMobile={isMobile}
                  showAllImages={showAllImages}
                  onShowAllImagesChange={setShowAllImages}
                  showFullPrompt={showFullPrompt}
                  onShowFullPromptChange={setShowFullPrompt}
                  showFullNegativePrompt={showFullNegativePrompt}
                  onShowFullNegativePromptChange={setShowFullNegativePrompt}
                  availableLoras={availableLoras}
                />
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyParams}
                      className="h-8 px-2 -ml-2"
                      title="Copy all parameters"
                    >
                      {paramsCopied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <h3 className="text-lg font-light text-foreground">Detailed Task Parameters</h3>
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
        
        <div className={modal.footerClass}>
          <DialogFooter className="pt-4 border-t">
           <div className="flex w-full items-center gap-3">
              {inputImages.length > 0 && (
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="replaceImages"
                      checked={replaceImages}
                      onCheckedChange={(checked) => setReplaceImages(checked as boolean)}
                    />
                    <Label htmlFor="replaceImages" className={`text-sm font-light ${isMobile ? 'whitespace-pre-line leading-tight' : ''}`}>
                      {isMobile ? 'Replace\nthese\nimages' : 'Replace these images'}
                    </Label>
                  </div>
                  {onApplySettingsFromTask && task && taskId && (
                    <Button 
                      variant="retro" 
                      size="retro-sm"
                      onClick={handleApplySettingsFromTask}
                      className={`text-sm ${isMobile ? 'whitespace-pre-line leading-tight py-3 px-4 min-h-[3rem]' : ''}`}
                    >
                      {isMobile ? 'Apply\nSettings' : 'Apply Settings'}
                    </Button>
                  )}
                </>
              )}
              <div className="flex items-center space-x-3 ml-auto">
              {/* Show Video button for mobile video context - now positioned directly to the left of close button */}
              {isMobile && isVideoContext && onShowVideo && (
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    // Don't close modal immediately - let the onShowVideo handler manage the timing
                    onShowVideo();
                  }}
                  className="text-sm whitespace-pre-line leading-tight py-3 px-4 min-h-[3rem]"
                >
                  {'Show\nVideo'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className={`text-sm ${isMobile ? 'whitespace-pre-line leading-tight py-3 px-4 min-h-[2.5rem]' : ''}`}
              >
                Close
              </Button>
            </div>
          </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailsModal; 