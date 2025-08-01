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
import { useTaskQueueNotifier } from '@/shared/hooks/useTaskQueueNotifier';
import CreateShotModal from '@/shared/components/CreateShotModal';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface MagicEditFormProps {
  imageUrl: string;
  imageDimensions?: { width: number; height: number };
  onClose: () => void;
}

export const MagicEditForm: React.FC<MagicEditFormProps> = ({
  imageUrl,
  imageDimensions,
  onClose,
}) => {
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(4);
  const [magicEditInSceneBoost, setMagicEditInSceneBoost] = useState(false);
  const [magicEditShotId, setMagicEditShotId] = useState<string | null>(null);
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);

  // Project context and task queue functionality
  const { selectedProjectId } = useProject();
  const { currentShotId } = useCurrentShot();
  const { data: shots } = useListShots(selectedProjectId);
  const createShotMutation = useCreateShot();
  const queryClient = useQueryClient();

  // Only use task queue notifier when modal is open
  const { enqueueTasks, isEnqueuing, justQueued } = useTaskQueueNotifier({
    projectId: selectedProjectId || undefined,
    suppressPerTaskToast: true,
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

    try {
      // Create multiple tasks - one for each image requested
      const tasks = Array.from({ length: magicEditNumImages }, (_, index) => {
        return {
          functionName: 'magic-edit',
          payload: {
            project_id: selectedProjectId,
            prompt: magicEditPrompt,
            negative_prompt: "",
            resolution: imageDimensions ? `${imageDimensions.width}x${imageDimensions.height}` : undefined,
            model_name: "flux-kontext",
            seed: 11111,
            image_url: imageUrl, // Source image for magic edit
            in_scene: magicEditInSceneBoost,
            shot_id: currentShotId || magicEditShotId || undefined, // Associate with current shot if in shot context
          }
        };
      });

      await enqueueTasks(tasks);
      
      // Don't close modal immediately - let success state show
      // Reset form only after success state is shown
      setTimeout(() => {
        onClose();
        setMagicEditPrompt('');
        setMagicEditNumImages(4);
        setMagicEditInSceneBoost(false);
        setMagicEditShotId(null);
      }, 2000); // Wait 2 seconds to show success state
    } catch (error) {
      console.error('Error creating magic-edit task:', error);
      toast.error('Failed to create magic-edit task');
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
      <div className="space-y-4">
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
            autoFocus
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
          <Label htmlFor="magic-edit-in-scene" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            In-Scene Boost
          </Label>
        </div>

        {/* Generate Button */}
        <Button 
          onClick={handleMagicEditGenerate}
          disabled={!magicEditPrompt.trim() || (isEnqueuing ?? false)}
          className="w-full"
          variant={(justQueued ?? false) ? "success" : "default"}
        >
          {(justQueued ?? false)
            ? "Added to queue!"
            : (isEnqueuing ?? false)
              ? 'Creating Task...' 
              : 'Generate'}
        </Button>
      </div>

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

export default MagicEditForm; 