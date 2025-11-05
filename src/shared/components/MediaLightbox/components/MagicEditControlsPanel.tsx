import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { PlusCircle, X, Loader2, CheckCircle, Wand2 } from 'lucide-react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useListShots, useCreateShot } from '@/shared/hooks/useShots';
import CreateShotModal from '@/shared/components/CreateShotModal';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createBatchMagicEditTasks, TaskValidationError } from '@/shared/lib/tasks/magicEdit';
import { useShotGenerationMetadata } from '@/shared/hooks/useShotGenerationMetadata';
import { cn } from '@/shared/lib/utils';
import { useEditModeLoRAs } from '../hooks';

export interface MagicEditControlsPanelProps {
  variant: 'desktop' | 'mobile';
  imageUrl: string;
  imageDimensions?: { width: number; height: number };
  shotGenerationId?: string;
  toolTypeOverride?: string;
  onExitMagicEditMode: () => void;
}

/**
 * Magic Edit controls panel - matches InpaintControlsPanel structure
 */
export const MagicEditControlsPanel: React.FC<MagicEditControlsPanelProps> = ({
  variant,
  imageUrl,
  imageDimensions,
  shotGenerationId,
  toolTypeOverride,
  onExitMagicEditMode,
}) => {
  const isMobile = variant === 'mobile';
  const isDesktop = variant === 'desktop';

  // State management
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(4);
  const [magicEditShotId, setMagicEditShotId] = useState<string | null>(null);
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const [isCreatingTasks, setIsCreatingTasks] = useState(false);
  const [tasksCreated, setTasksCreated] = useState(false);

  // LoRA mode management
  const { 
    isInSceneBoostEnabled, 
    setIsInSceneBoostEnabled, 
    editModeLoRAs 
  } = useEditModeLoRAs();

  // Project context functionality
  const { selectedProjectId } = useProject();
  const { currentShotId } = useCurrentShot();
  const { data: shots } = useListShots(selectedProjectId);
  const createShotMutation = useCreateShot();
  const queryClient = useQueryClient();

  // Shot generation metadata for prompt persistence
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

  // Load last saved prompt and settings when panel opens
  useEffect(() => {
    });
    
    if (shotGenerationId && !isLoadingMetadata) {
      const lastPrompt = getLastMagicEditPrompt();
      const lastSettings = getLastSettings();
      
      if (lastPrompt && !magicEditPrompt) {
        setMagicEditPrompt(lastPrompt);
        setMagicEditNumImages(lastSettings.numImages);
        setIsInSceneBoostEnabled(lastSettings.isInSceneBoostEnabled);
      }
    }
  }, [shotGenerationId, isLoadingMetadata, getLastMagicEditPrompt, getLastSettings, magicEditPrompt]);

  // Reset magicEditShotId if the selected shot no longer exists
  useEffect(() => {
    if (magicEditShotId && shots) {
      const shotExists = shots.some(shot => shot.id === magicEditShotId);
      if (!shotExists) {
        setMagicEditShotId(null);
      }
    }
  }, [magicEditShotId, shots]);

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
      const shotId = currentShotId || magicEditShotId || undefined;
      
      const batchParams = {
        project_id: selectedProjectId,
        prompt: magicEditPrompt,
        image_url: imageUrl,
        numImages: magicEditNumImages,
        negative_prompt: "",
        resolution: imageDimensions ? `${imageDimensions.width}x${imageDimensions.height}` : undefined,
        seed: 11111,
        shot_id: shotId,
        tool_type: toolTypeOverride,
        loras: editModeLoRAs,
        based_on: shotGenerationId, // Track source generation for lineage
      };
      
      const results = await createBatchMagicEditTasks(batchParams);
      
      // Save the prompt to shot generation metadata if we have the context
      if (shotGenerationId && currentShotId) {
        try {
          await addMagicEditPrompt(
            magicEditPrompt.trim(), 
            magicEditNumImages,
            false,
            isInSceneBoostEnabled
          );
          } catch (error) {
          console.error('[TaskDetailsSidebar] MagicEditPanel: Failed to save prompt', error);
        }
      }
      
      setTasksCreated(true);
      
      // Wait 2 seconds to show success, then exit magic edit mode
      setTimeout(() => {
        onExitMagicEditMode();
        setMagicEditPrompt('');
        setMagicEditNumImages(4);
        setMagicEditShotId(null);
        setTasksCreated(false);
        // Note: LoRA mode state is managed by the hook and persists across sessions
      }, 2000);
    } catch (error) {
      console.error('[TaskDetailsSidebar] MagicEditPanel: Error creating tasks', error);
      
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
      
      setMagicEditShotId(result.shot.id);
      setIsCreateShotModalOpen(false);
    } catch (error) {
      console.error('[TaskDetailsSidebar] MagicEditPanel: Error creating shot', error);
      toast.error("Failed to create shot");
    }
  }, [selectedProjectId, createShotMutation, queryClient]);

  const containerClass = isMobile
    ? "p-4 space-y-3 bg-white dark:bg-background rounded-lg"
    : "p-6 space-y-4";

  const headingClass = isMobile ? "text-lg font-light" : "text-2xl font-light";
  const headingMargin = isMobile ? "mb-3" : "mb-4";
  const spacingClass = isMobile ? "space-y-3" : "space-y-4";

  return (
    <>
      <div className={containerClass}>
        <div className={`flex items-center justify-between ${headingMargin}`}>
          <h2 className={headingClass}>Magic Edit</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onExitMagicEditMode}
            className="hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className={spacingClass}>
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
              <Label htmlFor="magic-edit-shot" className={cn("inline-block", isMobile ? "text-xs" : "text-sm")}>
                Associate with Shot
              </Label>
              <Select
                value={magicEditShotId || "none"}
                onValueChange={(value) => setMagicEditShotId(value === "none" ? null : value)}
              >
                <SelectTrigger id="magic-edit-shot" className={cn("inline-flex w-auto min-w-[200px]", isMobile && "text-sm")}>
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
          <div className={isMobile ? "space-y-1" : "space-y-2"}>
            <Label htmlFor="magic-edit-prompt" className={isMobile ? "text-xs font-medium" : "text-sm font-medium"}>
              Prompt
            </Label>
            <Textarea
              id="magic-edit-prompt"
              value={magicEditPrompt}
              onChange={(e) => setMagicEditPrompt(e.target.value)}
              placeholder="Describe how you want to transform this image..."
              className={cn(
                "resize-none",
                isMobile ? "min-h-[60px] text-sm" : "min-h-[80px]"
              )}
            />
          </div>

          {/* Boosts and Number of Images */}
          <div className={cn("flex gap-6", isMobile && "flex-col gap-3")}>
            {/* Boosts Section */}
            <div className={isMobile ? "space-y-1" : "space-y-2"}>
              <Label className={isMobile ? "text-xs font-medium" : "text-sm font-medium"}>Boosts</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="in-scene-boost"
                  checked={isInSceneBoostEnabled}
                  onCheckedChange={(checked) => setIsInSceneBoostEnabled(!!checked)}
                />
                <label
                  htmlFor="in-scene-boost"
                  className={cn(
                    "font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer",
                    isMobile ? "text-xs" : "text-sm"
                  )}
                >
                  In-Scene
                </label>
              </div>
            </div>

            {/* Number of Images Slider */}
            <div className={cn("flex-1", isMobile ? "space-y-1" : "space-y-2")}>
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

          {/* Generate Button */}
          <Button
            variant="default"
            size={isMobile ? "sm" : "default"}
            onClick={handleMagicEditGenerate}
            disabled={!magicEditPrompt.trim() || isCreatingTasks || tasksCreated}
            className={cn(
              "w-full",
              tasksCreated && "bg-green-600 hover:bg-green-600"
            )}
          >
            {isCreatingTasks ? (
              <>
                <Loader2 className={cn("animate-spin", isMobile ? "h-3 w-3 mr-2" : "h-4 w-4 mr-2")} />
                Creating...
              </>
            ) : tasksCreated ? (
              <>
                <CheckCircle className={isMobile ? "h-3 w-3 mr-2" : "h-4 w-4 mr-2"} />
                Tasks created!
              </>
            ) : (
              <>
                <Wand2 className={isMobile ? "h-3 w-3 mr-2" : "h-4 w-4 mr-2"} />
                {isMobile ? 'Generate' : 'Generate Magic Edit'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Create Shot Modal */}
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

