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
} from '@/shared/components/ui/dialog';

interface MagicEditModalProps {
  isOpen: boolean;
  imageUrl: string;
  imageDimensions?: { width: number; height: number };
  onClose: () => void;
  // Optional shot generation context for prompt persistence
  shotGenerationId?: string;
  // Optional tool type override - when provided, forces the generation to use this tool type
  toolTypeOverride?: string;
  // Optional z-index override for when opened from high z-index contexts (e.g., MediaLightbox)
  zIndexOverride?: number;
}

const MagicEditModal: React.FC<MagicEditModalProps> = ({
  isOpen,
  imageUrl,
  imageDimensions,
  onClose,
  shotGenerationId,
  toolTypeOverride,
  zIndexOverride,
}) => {
  const isMobile = useIsMobile();
  
  // Modal styling
  const modal = useMediumModal();
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(4);
  const [magicEditShotId, setMagicEditShotId] = useState<string | null>(null);
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const [isNextSceneBoostEnabled, setIsNextSceneBoostEnabled] = useState(false);
  const [isInSceneBoostEnabled, setIsInSceneBoostEnabled] = useState(false);
  
  // Log when modal is opened/closed
  useEffect(() => {
    if (isOpen) {
      console.log('[MagicEditPromptPersist] 🚀 MODAL OPENED with props:', {
        hasImageUrl: !!imageUrl,
        hasImageDimensions: !!imageDimensions,
        hasShotGenerationId: !!shotGenerationId,
        shotGenerationIdPrefix: shotGenerationId?.substring(0, 8),
        hasToolTypeOverride: !!toolTypeOverride,
        toolTypeOverride,
        timestamp: Date.now()
      });
    } else {
      console.log('[MagicEditPromptPersist] 🚪 MODAL CLOSED', {
        timestamp: Date.now()
      });
    }
  }, [isOpen, shotGenerationId, toolTypeOverride, imageUrl, imageDimensions]);

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
    getLastSettings,
    isLoading: isLoadingMetadata
  } = useShotGenerationMetadata({
    shotId: currentShotId || '',
    shotGenerationId: shotGenerationId || '',
    enabled: !!shotGenerationId && !!currentShotId
  });
  
  console.log('[MagicEditPromptPersist] Hook initialized:', {
    hasShotGenerationId: !!shotGenerationId,
    hasCurrentShotId: !!currentShotId,
    enabled: !!shotGenerationId && !!currentShotId,
    shotGenerationIdPrefix: shotGenerationId?.substring(0, 8),
    currentShotIdPrefix: currentShotId?.substring(0, 8),
    isLoadingMetadata,
    timestamp: Date.now()
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
      
      // Build loras array if any boosts are enabled
      const loras = [];
      if (isNextSceneBoostEnabled) {
        loras.push({
          url: 'https://huggingface.co/lovis93/next-scene-qwen-image-lora-2509/resolve/main/next-scene_lora_v1-3000.safetensors',
          strength: 1.0
        });
      }
      if (isInSceneBoostEnabled) {
        loras.push({
          url: 'https://huggingface.co/peteromallet/mystery_models/resolve/main/in_scene_qwen_edit_2_000006750.safetensors',
          strength: 1.0
        });
      }
      
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
        loras: loras.length > 0 ? loras : undefined, // Array of lora configurations
      };
      
      console.log(`[MagicEditModal] Creating tasks with shot_id: ${shotId} (currentShotId: ${currentShotId}, magicEditShotId: ${magicEditShotId}), tool_type override: ${toolTypeOverride}`);

      const results = await createBatchMagicEditTasks(batchParams);
      
      console.log(`[MagicEditForm] Created ${results.length} magic edit tasks`);
      
      // Save the prompt to shot generation metadata if we have the context
      console.log('[MagicEditPromptPersist] 💾 ATTEMPTING TO SAVE prompt:', {
        hasShotGenerationId: !!shotGenerationId,
        hasCurrentShotId: !!currentShotId,
        shotGenerationId: shotGenerationId?.substring(0, 8),
        currentShotId: currentShotId?.substring(0, 8),
        promptLength: magicEditPrompt.trim().length,
        numImages: magicEditNumImages,
        willAttemptSave: !!(shotGenerationId && currentShotId),
        timestamp: Date.now()
      });
      
      if (shotGenerationId && currentShotId) {
        try {
          console.log('[MagicEditPromptPersist] 💾 CALLING addMagicEditPrompt...');
          await addMagicEditPrompt(
            magicEditPrompt.trim(), 
            magicEditNumImages,
            isNextSceneBoostEnabled,
            isInSceneBoostEnabled
          );
          console.log('[MagicEditPromptPersist] ✅ SAVE SUCCESS:', {
            shotGenerationId: shotGenerationId.substring(0, 8),
            currentShotId: currentShotId.substring(0, 8),
            promptLength: magicEditPrompt.trim().length,
            promptPreview: magicEditPrompt.trim().substring(0, 50) + '...',
            numImages: magicEditNumImages,
            timestamp: Date.now()
          });
        } catch (error) {
          console.error('[MagicEditPromptPersist] ❌ SAVE FAILED:', {
            shotGenerationId: shotGenerationId?.substring(0, 8),
            currentShotId: currentShotId?.substring(0, 8),
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: Date.now()
          });
          // Don't fail the entire operation if metadata save fails
        }
      } else {
        console.log('[MagicEditPromptPersist] ⏭️  SKIPPING SAVE - missing context:', {
          hasShotGenerationId: !!shotGenerationId,
          hasCurrentShotId: !!currentShotId,
          reason: !shotGenerationId ? 'No shotGenerationId' : 'No currentShotId',
          timestamp: Date.now()
        });
      }
      
      setTasksCreated(true);
      
      // Don't close modal immediately - let success state show
      // Reset form only after success state is shown
      setTimeout(() => {
        onClose();
        setMagicEditPrompt('');
        setMagicEditNumImages(4);
        setMagicEditShotId(null);
        setIsNextSceneBoostEnabled(false);
        setIsInSceneBoostEnabled(false);
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

  // Load last saved prompt and settings when modal opens (for shot generation context)
  useEffect(() => {
    console.log('[MagicEditPromptPersist] 📥 LOAD EFFECT triggered:', {
      isOpen,
      hasShotGenerationId: !!shotGenerationId,
      shotGenerationIdPrefix: shotGenerationId?.substring(0, 8),
      isLoadingMetadata,
      hasCurrentPrompt: !!magicEditPrompt,
      currentPromptLength: magicEditPrompt?.length || 0,
      willAttemptLoad: !!(isOpen && shotGenerationId && !isLoadingMetadata),
      timestamp: Date.now()
    });
    
    if (isOpen && shotGenerationId && !isLoadingMetadata) {
      console.log('[MagicEditPromptPersist] 📥 CALLING getLastMagicEditPrompt and getLastSettings...');
      const lastPrompt = getLastMagicEditPrompt();
      const lastSettings = getLastSettings();
      
      console.log('[MagicEditPromptPersist] 📥 LOAD RESULT:', {
        hasLastPrompt: !!lastPrompt,
        lastPromptLength: lastPrompt?.length || 0,
        lastPromptPreview: lastPrompt ? lastPrompt.substring(0, 50) + '...' : 'none',
        lastSettings,
        hasCurrentPrompt: !!magicEditPrompt,
        currentPromptLength: magicEditPrompt?.length || 0,
        willSetPrompt: !!(lastPrompt && !magicEditPrompt),
        shotGenerationId: shotGenerationId.substring(0, 8),
        timestamp: Date.now()
      });
      
      if (lastPrompt && !magicEditPrompt) {
        console.log('[MagicEditPromptPersist] ✅ SETTING PROMPT and SETTINGS from saved data:', {
          shotGenerationId: shotGenerationId.substring(0, 8),
          promptLength: lastPrompt.length,
          promptPreview: lastPrompt.substring(0, 50) + '...',
          settings: lastSettings,
          timestamp: Date.now()
        });
        setMagicEditPrompt(lastPrompt);
        setMagicEditNumImages(lastSettings.numImages);
        setIsNextSceneBoostEnabled(lastSettings.isNextSceneBoostEnabled);
        setIsInSceneBoostEnabled(lastSettings.isInSceneBoostEnabled);
      } else if (lastPrompt && magicEditPrompt) {
        console.log('[MagicEditPromptPersist] ⏭️  SKIPPING LOAD - current prompt exists:', {
          currentPromptLength: magicEditPrompt.length,
          savedPromptLength: lastPrompt.length,
          reason: 'User already has a prompt entered',
          timestamp: Date.now()
        });
      } else if (!lastPrompt) {
        console.log('[MagicEditPromptPersist] ℹ️  NO SAVED PROMPT found:', {
          shotGenerationId: shotGenerationId.substring(0, 8),
          reason: 'No previous prompt saved for this generation',
          timestamp: Date.now()
        });
      }
    } else {
      console.log('[MagicEditPromptPersist] ⏭️  SKIPPING LOAD - conditions not met:', {
        isOpen,
        hasShotGenerationId: !!shotGenerationId,
        isLoadingMetadata,
        reasons: [
          !isOpen && 'Modal not open',
          !shotGenerationId && 'No shotGenerationId',
          isLoadingMetadata && 'Still loading metadata'
        ].filter(Boolean),
        timestamp: Date.now()
      });
    }
  }, [isOpen, shotGenerationId, isLoadingMetadata, getLastMagicEditPrompt, getLastSettings, magicEditPrompt]);

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
        {/* Custom overlay with higher z-index when needed */}
        {zIndexOverride && (
          <style>
            {`
              [data-radix-dialog-overlay][data-state="open"] {
                z-index: ${zIndexOverride - 10} !important;
              }
            `}
          </style>
        )}
        <DialogContent
          className={modal.className}
          style={{
            ...modal.style,
            ...(zIndexOverride ? { zIndex: zIndexOverride } : {})
          }}
          {...modal.props}
          onPointerDownOutside={(e) => {
            // Allow closing when clicking outside
            console.log('[MagicEditModal] onPointerDownOutside triggered');
          }}
          onInteractOutside={(e) => {
            // Allow closing when clicking outside
            console.log('[MagicEditModal] onInteractOutside triggered');
          }}
        >
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

        {/* Boosts and Number of Images - Side by Side */}
        <div className="flex gap-6">
          {/* Boosts Section */}
          <div className="space-y-2 flex-shrink-0">
            <Label>Boosts</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="in-scene-boost"
                checked={isInSceneBoostEnabled}
                onCheckedChange={(checked) => setIsInSceneBoostEnabled(checked === true)}
              />
              <label
                htmlFor="in-scene-boost"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                In-Scene
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="next-scene-boost"
                checked={isNextSceneBoostEnabled}
                onCheckedChange={(checked) => setIsNextSceneBoostEnabled(checked === true)}
              />
              <label
                htmlFor="next-scene-boost"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Next Shot
              </label>
            </div>
          </div>

          {/* Number of Images Slider */}
          <div className="space-y-2 flex-1">
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
        </DialogContent>
      </Dialog>

      {/* Create Shot Modal for Magic Edit */}
      <CreateShotModal
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleCreateShotForMagicEdit}
        isLoading={createShotMutation.isPending}
        projectId={selectedProjectId}
      />
    </>
  );
};

export default MagicEditModal;
export { MagicEditModal }; 