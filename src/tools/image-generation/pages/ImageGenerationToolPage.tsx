import React, { useState, useEffect, useRef } from "react";
import { ToolSettingsGate } from "@/shared/components/ToolSettingsGate";
import ImageGenerationForm, { ImageGenerationFormHandles, PromptEntry } from "../components/ImageGenerationForm";
import ImageGallery, { GeneratedImageWithMetadata, DisplayableMetadata, MetadataLora } from "@/shared/components/ImageGallery";
import SettingsModal from "@/shared/components/SettingsModal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { useListShots, useAddImageToShot } from "@/shared/hooks/useShots";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { useProject } from "@/shared/contexts/ProjectContext";
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { nanoid } from 'nanoid';
import { useListAllGenerations, useDeleteGeneration } from "@/shared/hooks/useGenerations";
import { Settings } from "lucide-react";
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import { useCreateTask, useListTasks } from "@/shared/hooks/useTasks";
import { PageFadeIn } from '@/shared/components/transitions';

// Remove unnecessary environment detection - tool should work in all environments

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Dummy placeholder images for display purposes
const placeholderImages: GeneratedImageWithMetadata[] = [
  {
    id: 'placeholder-1',
    url: '/placeholder.svg',
    prompt: 'Loading...',
    metadata: {
      prompt: 'Loading...',
      model: 'placeholder',
      seed: 0,
      steps: 0,
      cfg_scale: 0,
      width: 512,
      height: 512,
      generatedAt: new Date().toISOString(),
    } as DisplayableMetadata
  },
  {
    id: 'placeholder-2',
    url: '/placeholder.svg',
    prompt: 'Loading...',
    metadata: {
      prompt: 'Loading...',
      model: 'placeholder',
      seed: 0,
      steps: 0,
      cfg_scale: 0,
      width: 512,
      height: 512,
      generatedAt: new Date().toISOString(),
    } as DisplayableMetadata
  }
];

const ImageGenerationToolPage = () => {
  console.log('[ImageGenerationToolPage] Component loading...');

  const [generatedImages, setGeneratedImages] = useState<GeneratedImageWithMetadata[]>(placeholderImages);
  const [showPlaceholders, setShowPlaceholders] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isUpscalingImageId, setIsUpscalingImageId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Suppress per-task success toasts; we'll show a single aggregated toast
  const { mutateAsync: createTaskAsync } = useCreateTask({ showToast: false });

  const [isCreatingTasks, setIsCreatingTasks] = useState(false);
  const [pendingTasksInfo, setPendingTasksInfo] = useState<{ initial: number; expected: number } | null>(null);

  // Always use hooks - no environment-based disabling
  const { apiKeys, getApiKey } = useApiKeys();
  const imageGenerationFormRef = useRef<ImageGenerationFormHandles>(null);
  const { selectedProjectId } = useProject();

  // Track project tasks to know when they appear in the TasksPane (must be after selectedProjectId)
  const { data: projectTasks } = useListTasks({ projectId: selectedProjectId });
  const { data: shots, isLoading: isLoadingShots, error: shotsError } = useListShots(selectedProjectId);
  const addImageToShotMutation = useAddImageToShot();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const { data: generatedImagesData, isLoading: isLoadingGenerations } = useListAllGenerations(selectedProjectId);
  const deleteGenerationMutation = useDeleteGeneration();

  const queryClient = useQueryClient();

  useEffect(() => {
    if (generatedImagesData) {
      setGeneratedImages(generatedImagesData);
      setShowPlaceholders(generatedImagesData.length === 0);
    } else {
      setGeneratedImages(placeholderImages);
      setShowPlaceholders(true);
    }
  }, [generatedImagesData]);

  useEffect(() => {
    setShowPlaceholders(!isLoadingGenerations && (!generatedImagesData || generatedImagesData.length === 0));
  }, [generatedImagesData, isLoadingGenerations]);

  const handleDeleteImage = async (id: string) => {
    deleteGenerationMutation?.mutate(id);
  };

  const handleUpscaleImage = async (imageId: string, imageUrl: string, currentMetadata?: DisplayableMetadata) => {
    setIsUpscalingImageId(imageId);
    const toastId = `upscale-${imageId}`;
    toast.info("Sending request to DEBUG upscale function...", { id: toastId });

    try {
      const { data: functionData, error: functionError } = await supabase.functions.invoke("hello-debug", {
        body: { imageUrl },
      });

      if (functionError) {
        console.error("Supabase Edge Function error:", functionError);
        let errorMessage = functionError.message;
        try {
          const parsedError = JSON.parse(functionError.message);
          if (parsedError && parsedError.error) {
            errorMessage = parsedError.error;
          }
        } catch (e) { /* Ignore if parsing fails */ }
        throw new Error(`Upscale request failed: ${errorMessage}`);
      }

      console.log("Debug function response data:", functionData);

      if (!functionData || !functionData.upscaledImageUrl) {
        console.error("Debug Edge function returned unexpected data:", functionData);
        if (functionData && functionData.message && functionData.message.includes("imageUrl is missing")) {
          throw new Error("Debug function reports: imageUrl is missing in payload.");
        }
        throw new Error("Debug upscale completed but did not return a valid image URL or expected message.");
      }

      const upscaledImageUrl = functionData.upscaledImageUrl;
      toast.success(`Debug upscale successful! Mock URL: ${upscaledImageUrl}. Message: ${functionData.message}`, { id: toastId, duration: 5000 });

      const newMetadata: DisplayableMetadata = {
        ...(currentMetadata || {}),
        upscaled: true,
        original_image_url: imageUrl, 
      };

      const upscaledImage: GeneratedImageWithMetadata = {
        id: `upscaled-${Date.now()}`,
        url: upscaledImageUrl,
        prompt: currentMetadata?.prompt || "Upscaled image",
        metadata: newMetadata,
      };

      setGeneratedImages(prev => [upscaledImage, ...prev]);
      setShowPlaceholders(false);
    } catch (error) {
      console.error("Error upscaling image:", error);
      toast.error(`Failed to upscale image: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
    } finally {
      setIsUpscalingImageId(null);
    }
  };

  const handleNewGenerate = async (formData: any) => {
    if (!selectedProjectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return;
    }

    const { generationMode, ...restOfFormData } = formData;

    const tasksToCreateCount = generationMode === 'wan-local'
      ? restOfFormData.prompts.length * restOfFormData.imagesPerPrompt
      : 1;

    // Record current task count so we can detect when new tasks have appeared
    const initialTaskCount = projectTasks?.length || 0;
    setPendingTasksInfo({ initial: initialTaskCount, expected: tasksToCreateCount });

    setIsCreatingTasks(true);
    
    // Clear placeholders if needed
    if (showPlaceholders && restOfFormData.prompts.length * restOfFormData.imagesPerPrompt > 0) {
      setGeneratedImages([]);
      setShowPlaceholders(false);
    }

    if (generationMode === 'wan-local') {
      // Process all prompts for wan-local mode
      const lorasMapped: Array<{ path: string; strength: number }> = (restOfFormData.loras || []).map((lora: any) => ({
        path: lora.path,
        strength: parseFloat(lora.scale ?? lora.strength) || 0.0,
      }));

      // Build an array of payloads – one per image task
      const taskPayloads: any[] = restOfFormData.prompts.flatMap((promptEntry: PromptEntry, promptIdx: number) => {
        return Array.from({ length: restOfFormData.imagesPerPrompt }, (_, imgIdx) => {
          const globalIndex = promptIdx * restOfFormData.imagesPerPrompt + imgIdx;
          return {
            project_id: selectedProjectId,
            prompt: promptEntry.fullPrompt,
            resolution: restOfFormData.determinedApiImageSize || undefined,
            seed: 11111 + globalIndex * 100, // Vary seed deterministically across all images
            loras: lorasMapped,
          };
        });
      });

      // Fire off all requests concurrently and wait for them to finish
      let successfulCreations = 0;
      const results = await Promise.allSettled(
        taskPayloads.map(payload => createTaskAsync({ functionName: 'single-image-generate', payload }))
      );

      results.forEach(r => {
        if (r.status === 'fulfilled') successfulCreations += 1;
      });

      const failedCreations = taskPayloads.length - successfulCreations;

      if (failedCreations > 0) {
        toast.error(`${failedCreations} of ${taskPayloads.length} tasks failed to create.`);
      }

      if (successfulCreations === 0) {
        setIsCreatingTasks(false);
        setPendingTasksInfo(null);
        return;
      }

      // Ensure the task list is refreshed so the user sees the new tasks
      await queryClient.invalidateQueries({ queryKey: ['tasks', selectedProjectId] });
      await queryClient.refetchQueries({ queryKey: ['tasks', selectedProjectId] });

      setIsCreatingTasks(false);
      
      setPendingTasksInfo(null);

    } else {
      // Single task for API-based modes
      try {
        await createTaskAsync({
          functionName: 'single-image-generate',
          payload: {
            project_id: selectedProjectId,
            prompts: restOfFormData.prompts.map((p: PromptEntry) => p.fullPrompt),
            images_per_prompt: restOfFormData.imagesPerPrompt,
            loras: restOfFormData.loras,
            generation_mode: generationMode,
          }
        });

        // Refresh tasks and then clear loading state
        await queryClient.invalidateQueries({ queryKey: ['tasks', selectedProjectId] });
        await queryClient.refetchQueries({ queryKey: ['tasks', selectedProjectId] });

        setIsCreatingTasks(false);
        toast.success(`1 task added`);
        setPendingTasksInfo(null);
      } catch (err) {
        console.error('[ImageGeneration] Error creating task:', err);
        toast.error('Failed to create task.');
        setIsCreatingTasks(false);
        setPendingTasksInfo(null);
        return;
      }
    }
  };

  // When tasks list updates, check if we've reached the expected count
  useEffect(() => {
    if (isCreatingTasks && pendingTasksInfo && projectTasks) {
      if (projectTasks.length >= pendingTasksInfo.initial + pendingTasksInfo.expected) {
        setIsCreatingTasks(false);
        toast.success(`${pendingTasksInfo.expected} tasks added`);
        setPendingTasksInfo(null);
      }
    }
  }, [projectTasks, isCreatingTasks, pendingTasksInfo]);

  const handleImageSaved = async (imageId: string, newImageUrl: string) => {
    console.log(`[ImageGeneration-HandleImageSaved] Starting image update process:`, { imageId, newImageUrl });
    
    try {
      // Update the database record via local API
      console.log(`[ImageGeneration-HandleImageSaved] Updating database record for image:`, imageId);
      const response = await fetch(`/api/generations/${imageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ location: newImageUrl }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("[ImageGeneration-HandleImageSaved] Database update error:", errorData);
        toast.error("Failed to update image in database.");
        return;
      }

      console.log(`[ImageGeneration-HandleImageSaved] Database update successful for image:`, imageId);

      // Update local state
      console.log(`[ImageGeneration-HandleImageSaved] Updating local state...`);
      setGeneratedImages(prevImages => {
        const updated = prevImages.map(img => 
          img.id === imageId 
            ? { ...img, url: newImageUrl } 
            : img
        );
        console.log(`[ImageGeneration-HandleImageSaved] Local state updated. Found image to update:`, updated.some(img => img.id === imageId));
        return updated;
      });

      // Invalidate the generations query to ensure fresh data
      console.log(`[ImageGeneration-HandleImageSaved] Invalidating React Query cache...`);
      queryClient.invalidateQueries({ queryKey: ['generations', selectedProjectId] });

      console.log(`[ImageGeneration-HandleImageSaved] Complete process finished successfully`);
      toast.success("Image updated successfully!");
    } catch (error) {
      console.error("[ImageGeneration-HandleImageSaved] Unexpected error:", error);
      toast.error("Failed to update image.");
    }
  };

  const falApiKey = getApiKey('fal_api_key');
  const openaiApiKey = getApiKey('openai_api_key');
  const hasValidFalApiKey = true; // Always true - let the task creation handle validation

  const targetShotIdForButton = lastAffectedShotId || (shots && shots.length > 0 ? shots[0].id : undefined);
  const targetShotNameForButtonTooltip = targetShotIdForButton 
    ? (shots?.find(s => s.id === targetShotIdForButton)?.name || 'Selected Shot')
    : (shots && shots.length > 0 ? shots[0].name : 'Last Shot');

  const handleAddImageToTargetShot = async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    if (!targetShotIdForButton) {
      toast.error("No target shot available to add to. Create a shot first or interact with one.");
      return false;
    }
    if (!generationId) {
        toast.error("Image has no ID, cannot add to shot.");
        return false;
    }
    if (!selectedProjectId) {
        toast.error("No project selected. Cannot add image to shot.");
        return false;
    }
    try {
      await addImageToShotMutation?.mutateAsync({
        shot_id: targetShotIdForButton,
        generation_id: generationId,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: selectedProjectId, 
      });
      setLastAffectedShotId(targetShotIdForButton);
      return true;
    } catch (error) {
      console.error("Error adding image to target shot:", error);
      toast.error("Failed to add image to shot.");
      return false;
    }
  };

  const validShots = shots || [];

  const isGenerating = isCreatingTasks;

  const imagesToShow = showPlaceholders 
    ? placeholderImages 
    : [...(generatedImagesData || [])];

  return (
    <PageFadeIn className="flex flex-col h-screen">
      <header className="flex justify-between items-center mb-6 sticky top-0 bg-background py-4 z-40 border-b border-border/50 shadow-sm">
        <h1 className="text-3xl font-bold">
          Image Generation
        </h1>
        {/* <Button variant="ghost" onClick={() => setShowSettingsModal(true)}>
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button> */}
      </header>

      {!hasValidFalApiKey && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-center text-sm text-muted-foreground">
            You need a valid API key to use this tool.
          </p>
          <Button className="mt-4">
            <a href="https://fal.ai/signup" target="_blank" rel="noopener noreferrer">
              Sign Up for Fal
            </a>
          </Button>
        </div>
      )}

      {/* Render only if API key is valid */}
      {hasValidFalApiKey && (
        <>
          <div className="mb-8 p-6 border rounded-lg shadow-sm bg-card">
            <ToolSettingsGate
              ready={true}
              loadingMessage="Loading image generation settings..."
            >
              <ImageGenerationForm
                ref={imageGenerationFormRef}
                onGenerate={handleNewGenerate}
                isGenerating={isGenerating}
                hasApiKey={hasValidFalApiKey}
                apiKey={falApiKey}
                openaiApiKey={openaiApiKey}
              />
            </ToolSettingsGate>
          </div>

          <div className="mt-8">
            <ImageGallery
              images={imagesToShow}
              onDelete={handleDeleteImage}
              onImageSaved={handleImageSaved}
              onAddToLastShot={handleAddImageToTargetShot}
              isDeleting={isDeleting}
              allShots={validShots}
              lastShotId={targetShotIdForButton}
              lastShotNameForTooltip={targetShotNameForButtonTooltip}
            />
          </div>
        </>
      )}


      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onOpenChange={setShowSettingsModal}
      />
    </PageFadeIn>
  );
};

export default ImageGenerationToolPage;

