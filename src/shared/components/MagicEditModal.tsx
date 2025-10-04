import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { PlusCircle, X } from 'lucide-react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useListShots, useCreateShot } from '@/shared/hooks/useShots';
import CreateShotModal from '@/shared/components/CreateShotModal';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createBatchMagicEditTasks, TaskValidationError } from '@/shared/lib/tasks/magicEdit';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useMediumModal } from '@/shared/hooks/useModal';
import { useShotGenerationMetadata } from '@/shared/hooks/useShotGenerationMetadata';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogPortal,
  DialogOverlay,
} from '@/shared/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/shared/lib/utils";

interface MagicEditModalProps {
  isOpen: boolean;
  imageUrl: string;
  imageDimensions?: { width: number; height: number };
  onClose: () => void;
  // Optional shot generation context for prompt persistence
  shotGenerationId?: string;
  // Optional tool type override - when provided, forces the generation to use this tool type
  toolTypeOverride?: string;
}

const MagicEditModal: React.FC<MagicEditModalProps> = ({
  isOpen,
  imageUrl,
  imageDimensions,
  onClose,
  shotGenerationId,
  toolTypeOverride,
}) => {
  const isMobile = useIsMobile();
  
  // Modal styling
  const modal = useMediumModal();
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(1);
  const [magicEditShotId, setMagicEditShotId] = useState<string | null>(null);
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);

  // Project context functionality
  const { selectedProjectId } = useProject();
  const { currentShotId } = useCurrentShot();
  const { data: shots } = useListShots(selectedProjectId);
  const createShotMutation = useCreateShot();
  const queryClient = useQueryClient();

  // State for task creation
  const [isCreatingTasks, setIsCreatingTasks] = useState(false);
  const [tasksCreated, setTasksCreated] = useState(false);

  // Shot generation metadata for prompt persistence (only when shotGenerationId is provided)
  const {
    addMagicEditPrompt,
    getLastMagicEditPrompt,
    isLoading: isLoadingMetadata
  } = useShotGenerationMetadata({
    shotId: currentShotId || '',
    shotGenerationId: shotGenerationId || '',
    enabled: !!shotGenerationId && !!currentShotId
  });

  const handleMagicEditGenerate = async () => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    if (!magicEditPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    setIsCreatingTasks(true);
    setTasksCreated(false);

    try {
      // Determine shot_id: prioritize currentShotId (when ON a shot), then magicEditShotId (when selected from dropdown)
      const shotId = currentShotId || magicEditShotId || undefined;
      
      // Create batch magic edit tasks using the unified system
      const batchParams = {
        project_id: selectedProjectId,
        prompt: magicEditPrompt,
        image_url: imageUrl, // Source image for magic edit
        numImages: magicEditNumImages,
        negative_prompt: "", // Empty negative prompt as default
        resolution: imageDimensions ? `${imageDimensions.width}x${imageDimensions.height}` : undefined,
        seed: 11111, // Base seed, will be incremented for each image
        shot_id: shotId, // Associate with shot if available (currentShotId takes priority over magicEditShotId)
        tool_type: toolTypeOverride, // Override tool type if provided (e.g., 'image-generation' when used in ImageGenerationToolPage)
      };
      
      console.log(`[MagicEditModal] Creating tasks with shot_id: ${shotId} (currentShotId: ${currentShotId}, magicEditShotId: ${magicEditShotId}), tool_type override: ${toolTypeOverride}`);

      const results = await createBatchMagicEditTasks(batchParams);
      
      console.log(`[MagicEditForm] Created ${results.length} magic edit tasks`);
      
      // Save the prompt to shot generation metadata if we have the context
      if (shotGenerationId && currentShotId) {
        try {
          await addMagicEditPrompt(magicEditPrompt.trim(), magicEditNumImages);
          console.log('[MagicEditModal] Saved prompt to shot generation metadata:', {
            shotGenerationId: shotGenerationId.substring(0, 8),
            promptLength: magicEditPrompt.trim().length,
            numImages: magicEditNumImages
          });
        } catch (error) {
          console.warn('[MagicEditModal] Failed to save prompt to metadata:', error);
          // Don't fail the entire operation if metadata save fails
        }
      }
      
      setTasksCreated(true);
      
      // Don't close modal immediately - let success state show
      // Reset form only after success state is shown
      setTimeout(() => {
        onClose();
        setMagicEditPrompt('');
        setMagicEditNumImages(1);
        setMagicEditShotId(null);
        setTasksCreated(false);
      }, 2000); // Wait 2 seconds to show success state
    } catch (error) {
      console.error('Error creating magic-edit tasks:', error);
      
      if (error instanceof TaskValidationError) {
        toast.error(`Validation error: ${error.message}`);
      } else {
        toast.error(`Failed to create magic-edit tasks: ${error.message || 'Unknown error'}`);
      }
      
      setTasksCreated(false);
    } finally {
      setIsCreatingTasks(false);
    }
  };

  // Handle creating a new shot for magic edit
  const handleCreateShotForMagicEdit = useCallback(async (shotName: string, files: File[]) => {
    if (!selectedProjectId) {
      toast.error("No project selected");
      return;
    }

    try {
      const result = await createShotMutation.mutateAsync({
        name: shotName,
        projectId: selectedProjectId,
        shouldSelectAfterCreation: false
      });

      await queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      await queryClient.refetchQueries({ queryKey: ['shots', selectedProjectId] });
      
      // Switch to the newly created shot
      setMagicEditShotId(result.shot.id);
      setIsCreateShotModalOpen(false);
      toast.success(`Shot "${shotName}" created and selected`);
    } catch (error) {
      console.error('Error creating shot:', error);
      toast.error("Failed to create shot");
    }
  }, [selectedProjectId, createShotMutation, queryClient]);

  // Load last saved prompt when modal opens (for shot generation context)
  useEffect(() => {
    if (isOpen && shotGenerationId && !isLoadingMetadata) {
      const lastPrompt = getLastMagicEditPrompt();
      if (lastPrompt && !magicEditPrompt) {
        setMagicEditPrompt(lastPrompt);
        console.log('[MagicEditModal] Loaded last saved prompt for shot generation:', {
          shotGenerationId: shotGenerationId.substring(0, 8),
          promptLength: lastPrompt.length
        });
      }
    }
  }, [isOpen, shotGenerationId, isLoadingMetadata, getLastMagicEditPrompt, magicEditPrompt]);

  // Reset magicEditShotId if the selected shot no longer exists (e.g., was deleted)
  useEffect(() => {
    if (magicEditShotId && shots) {
      const shotExists = shots.some(shot => shot.id === magicEditShotId);
      if (!shotExists) {
        console.log('[MagicEditForm] Selected shot', magicEditShotId, 'no longer exists, resetting to None');
        setMagicEditShotId(null);
      }
    }
  }, [magicEditShotId, shots]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogPortal>
          <DialogOverlay 
            className="z-[100002]"
            onPointerDown={(e) => {
              // Block all pointer events from reaching underlying elements
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent?.stopImmediatePropagation) {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onPointerUp={(e) => {
              // Block pointer up events too
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent?.stopImmediatePropagation) {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onMouseDown={(e) => {
              // Block mouse down events
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent?.stopImmediatePropagation) {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onMouseUp={(e) => {
              // Block mouse up events
              e.preventDefault();
              e.stopPropagation();
              if (e.nativeEvent?.stopImmediatePropagation) {
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onClick={(e) => {
              // Only close if clicking directly on the overlay (background)
              if (e.target === e.currentTarget) {
                onClose();
              }
            }}
          />
          {/* Use DialogPrimitive.Content directly to avoid double overlay */}
          <DialogPrimitive.Content
            data-pane-control
            data-radix-dialog-content
            className={cn(
              "fixed left-[50%] top-[50%] z-[100003] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
              modal.className
            )}
            style={{ ...modal.style, zIndex: 100003 }}
            {...{...modal.props}}
            onPointerDown={(e) => {
              // Block propagation from modal content to underlying elements
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              // Block propagation from modal content to underlying elements
              e.stopPropagation();
            }}
          >
            {/* Close button */}
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          <div className={modal.headerClass}>
            <DialogHeader className={`${modal.isMobile ? 'px-4 pt-2 pb-1' : 'px-6 pt-2 pb-1'} flex-shrink-0`}>
              <DialogTitle>Magic Edit</DialogTitle>
            </DialogHeader>
          </div>
          
          <div className={`${modal.isMobile ? 'px-4' : 'px-6'} flex-1 overflow-y-auto min-h-0`}>
            <div className="space-y-4 py-3">
        {/* Image Preview */}
        <div className="relative w-full">
          <div className="rounded-lg border border-border overflow-hidden bg-muted/50 w-1/2">
            <img 
              src={imageUrl} 
              alt="Image to edit"
              className="w-full h-24 object-contain"
            />
          </div>
        </div>

        {/* Shot Selector - only show when not in a shot context */}
        {!currentShotId && (
          <div className="flex items-center gap-2">
            <Label htmlFor="magic-edit-shot" className="inline-block">Associate with Shot</Label>
            <Select
              value={magicEditShotId || "none"}
              onValueChange={(value) => setMagicEditShotId(value === "none" ? null : value)}
            >
              <SelectTrigger id="magic-edit-shot" className="inline-flex w-auto min-w-[200px]">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {shots?.map((shot) => (
                  <SelectItem key={shot.id} value={shot.id}>
                    {shot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateShotModalOpen(true)}
              className="h-8 w-8 p-0"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Prompt Input */}
        <div className="space-y-2">
          <Label htmlFor="magic-edit-prompt">Prompt</Label>
          <Textarea
            id="magic-edit-prompt"
            value={magicEditPrompt}
            onChange={(e) => setMagicEditPrompt(e.target.value)}
            placeholder="Describe how you want to transform this image..."
            className="min-h-[50px] resize-none"
          />
        </div>

        {/* Number of Images Slider */}
        <div className="space-y-2">
          <SliderWithValue
            label="Number to Generate"
            value={magicEditNumImages}
            onChange={setMagicEditNumImages}
            min={1}
            max={16}
            step={1}
          />
        </div>


            </div>
          </div>
          
          <div className={modal.footerClass}>
            <DialogFooter className={`${modal.isMobile ? 'px-4 pt-4 pb-0 flex-row justify-between' : 'px-6 pt-5 pb-0'} border-t`}>
              <Button variant="outline" onClick={onClose} disabled={isCreatingTasks} className={modal.isMobile ? '' : 'mr-auto'}>
                Cancel
              </Button>
              <Button 
                onClick={handleMagicEditGenerate}
                disabled={!magicEditPrompt.trim() || isCreatingTasks}
                variant={tasksCreated ? "success" : "default"}
              >
                {tasksCreated
                  ? "Tasks created!"
                  : isCreatingTasks
                    ? 'Creating...' 
                    : 'Generate'}
              </Button>
            </DialogFooter>
          </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* Create Shot Modal for Magic Edit */}
      <CreateShotModal
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleCreateShotForMagicEdit}
        isLoading={createShotMutation.isPending}
      />
    </>
  );
};

export default MagicEditModal;
export { MagicEditModal }; 