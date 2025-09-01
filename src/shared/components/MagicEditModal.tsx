import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { PlusCircle } from 'lucide-react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useListShots, useCreateShot } from '@/shared/hooks/useShots';
import CreateShotModal from '@/shared/components/CreateShotModal';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createBatchMagicEditTasks, TaskValidationError } from '@/shared/lib/tasks/magicEdit';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useModalStyling, createMobileModalProps } from '@/shared/hooks/useMobileModalStyling';
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
}

export const MagicEditModal: React.FC<MagicEditModalProps> = ({
  isOpen,
  imageUrl,
  imageDimensions,
  onClose,
}) => {
  const isMobile = useIsMobile();
  
  // Mobile modal styling
  const mobileModalStyling = useModalStyling('medium-wide');
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(4);
  const [magicEditInSceneBoost, setMagicEditInSceneBoost] = useState(false);
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
      // Create batch magic edit tasks using the unified system
      const batchParams = {
        project_id: selectedProjectId,
        prompt: magicEditPrompt,
        image_url: imageUrl, // Source image for magic edit
        numImages: magicEditNumImages,
        negative_prompt: "", // Empty negative prompt as default
        resolution: imageDimensions ? `${imageDimensions.width}x${imageDimensions.height}` : undefined,
        seed: 11111, // Base seed, will be incremented for each image
        in_scene: magicEditInSceneBoost,
        shot_id: currentShotId || magicEditShotId || undefined, // Associate with current shot if in shot context
      };

      const results = await createBatchMagicEditTasks(batchParams);
      
      console.log(`[MagicEditForm] Created ${results.length} magic edit tasks`);
      toast.success(`Created ${results.length} magic edit task${results.length > 1 ? 's' : ''}`);
      
      setTasksCreated(true);
      
      // Don't close modal immediately - let success state show
      // Reset form only after success state is shown
      setTimeout(() => {
        onClose();
        setMagicEditPrompt('');
        setMagicEditNumImages(4);
        setMagicEditInSceneBoost(false);
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
        <DialogContent
          className={mobileModalStyling.fullClassName}
          style={mobileModalStyling.dialogContentStyle}
          {...createMobileModalProps(mobileModalStyling.isMobile)}
        >
          <div className={mobileModalStyling.headerContainerClassName}>
            <DialogHeader className={`${mobileModalStyling.isMobile ? 'px-4 pt-3 pb-1' : 'px-6 pt-3 pb-1'} flex-shrink-0`}>
              <DialogTitle>Magic Edit</DialogTitle>
            </DialogHeader>
          </div>
          
          <div className={`${mobileModalStyling.isMobile ? 'px-4' : 'px-6'} flex-1 overflow-y-auto min-h-0`}>
            <div className="space-y-4 py-3">
        {/* Image Preview */}
        <div className="relative w-full">
          <Label>Image</Label>
          <div className="mt-2 rounded-lg border border-border overflow-hidden bg-muted/50">
            <img 
              src={imageUrl} 
              alt="Image to edit"
              className="w-full h-48 object-contain"
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
            className="min-h-[100px] resize-none"
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

        {/* In-Scene Boost Checkbox */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="magic-edit-in-scene"
            checked={magicEditInSceneBoost}
            onCheckedChange={(checked) => setMagicEditInSceneBoost(checked === true)}
          />
          <Label htmlFor="magic-edit-in-scene" className="text-sm font-light leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            In-Scene Boost
          </Label>
        </div>

            </div>
          </div>
          
          <div className={mobileModalStyling.footerContainerClassName}>
            <DialogFooter className={`${mobileModalStyling.isMobile ? 'px-4 pt-4 pb-1 flex-row justify-between' : 'px-6 pt-5 pb-2'} border-t`}>
              <Button variant="outline" onClick={onClose} disabled={isCreatingTasks} className={mobileModalStyling.isMobile ? '' : 'mr-auto'}>
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
      />
    </>
  );
};

export default MagicEditModal; 