import React, { useState, useEffect, useRef } from "react";
import ImageGenerationForm, { ImageGenerationFormHandles, PromptEntry } from "./components/ImageGenerationForm";
import ImageGallery, { GeneratedImageWithMetadata, DisplayableMetadata, MetadataLora } from "@/shared/components/ImageGallery";
import SettingsModal from "@/shared/components/SettingsModal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type Json } from "@supabase/supabase-js";
import { Button } from "@/shared/components/ui/button";
import ShotsPane from "@/shared/components/ShotsPane/ShotsPane";
import { useListShots, useAddImageToShot } from "@/shared/hooks/useShots";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { useProject } from "@/shared/contexts/ProjectContext";
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { nanoid } from 'nanoid';

// This interface defines the rich LoRA structure we expect from the form and want to save in metadata
// interface StoredActiveLora { // This might be covered by MetadataLora or internal to the form/hook
//   id: string;
//   name: string;
//   path: string;
//   strength: number; // 0-100
//   previewImageUrl?: string;
// }

// const initializeFalClient = () => { // Handled by the hook / global initializer
//   const API_KEY = localStorage.getItem('fal_api_key') || '0b6f1876-0aab-4b56-b821-b384b64768fa:121392c885a381f93de56d701e3d532f';
//   fal.config({ credentials: API_KEY });
//   return API_KEY;
// };

const placeholderImages: GeneratedImageWithMetadata[] = Array(8).fill(null).map((_, index) => ({
  id: `image-${index}`,
  url: "/placeholder.svg",
  prompt: "Placeholder image",
  metadata: { prompt: "Placeholder image" } as DisplayableMetadata
}));

const ImageGenerationToolPage = () => {
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageWithMetadata[]>(placeholderImages);
  // const [isGenerating, setIsGenerating] = useState(false); // From hook
  // const [currentPromptIndex, setCurrentPromptIndex] = useState<number | null>(null); // Part of hook's progress
  // const [currentImageCount, setCurrentImageCount] = useState<number>(0); // Part of hook's progress
  const [falApiKey, setFalApiKey] = useState<string>('');
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('');
  const [replicateApiKey, setReplicateApiKey] = useState<string>('');
  const [showPlaceholders, setShowPlaceholders] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isUpscalingImageId, setIsUpscalingImageId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const imageGenerationFormRef = useRef<ImageGenerationFormHandles>(null);
  // const cancelGenerationRef = useRef(false); // Handled by hook
  // const currentSubscriptionRef = useRef<any>(null); // Handled by hook
  // const [generationProgress, setGenerationProgress] = useState<FalGenerationProgress | null>(null); // From hook

  const { selectedProjectId } = useProject();
  const { data: shots, isLoading: isLoadingShots, error: shotsError } = useListShots(selectedProjectId);
  const addImageToShotMutation = useAddImageToShot();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();

  // Add state for task creation loading
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  useEffect(() => {
    // Initialize Fal client globally
    // initializeGlobalFalClient(); // REMOVE - Function is obsolete
    const storedFalKey = localStorage.getItem('fal_api_key') || '0b6f1876-0aab-4b56-b821-b384b64768fa:121392c885a381f93de56d701e3d532f'; // Keep for local display/validation
    setFalApiKey(storedFalKey);
    const storedOpenaiKey = localStorage.getItem('openai_api_key') || "";
    setOpenaiApiKey(storedOpenaiKey);
    const storedReplicateKey = localStorage.getItem('replicate_api_key') || "";
    setReplicateApiKey(storedReplicateKey);
    fetchGeneratedImages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);
  
  const fetchGeneratedImages = async () => {
    if (!selectedProjectId) {
      // console.log("No project selected, skipping fetch of generated images."); // [VideoLoadSpeedIssue]
      setGeneratedImages(placeholderImages); // Show placeholders if no project or clear
      setShowPlaceholders(true);
      return; 
    }
    try {
      // console.log(`[ImageGenerationToolPage] Fetching images for project: ${selectedProjectId}`); // [VideoLoadSpeedIssue]
      const { data, error } = await supabase
        .from('generations' as any) // Cast to any to bypass strict table check
        .select('id, image_url, prompt, seed, metadata, project_id') 
        .eq('project_id', selectedProjectId) 
        .order('created_at', { ascending: false });
        
      if (error) { console.error('Error fetching images:', error); toast.error("Failed to load previously generated images."); return; }
      
      if (data && data.length > 0) {
        // Cast data to any[] to bypass strict type checking during map
        const dbImages: GeneratedImageWithMetadata[] = (data as any[]).map(record_any => {
          const record = record_any as any;
          const metadata = (record.metadata || {}) as DisplayableMetadata;
          return {
            id: record.id as string, // Ensure id is string
            url: record.image_url as string,
            prompt: record.prompt as string || metadata.prompt,
            seed: typeof record.seed === 'number' ? record.seed : (typeof metadata.seed === 'number' ? metadata.seed : undefined),
            metadata: metadata, 
          };
        });
        setGeneratedImages(dbImages);
        setShowPlaceholders(false);
      } else {
        setGeneratedImages(placeholderImages); // Or an empty array if preferred when no images found
        setShowPlaceholders(true);
      }
    } catch (error) { 
        console.error('Error fetching images:', error); // [VideoLoadSpeedIssue]
        toast.error("An error occurred while fetching images."); 
        setGeneratedImages(placeholderImages);
        setShowPlaceholders(true);
    }
  };

  const handleSaveApiKeys = (newFalApiKey: string, newOpenaiApiKey: string, newReplicateApiKey: string) => {
    localStorage.setItem('fal_api_key', newFalApiKey);
    localStorage.setItem('openai_api_key', newOpenaiApiKey);
    localStorage.setItem('replicate_api_key', newReplicateApiKey);
    // Re-initialize Fal client with the new key
    // initializeGlobalFalClient(); // REMOVE - Function is obsolete
    setFalApiKey(newFalApiKey);
    setOpenaiApiKey(newOpenaiApiKey);
    setReplicateApiKey(newReplicateApiKey);
    toast.success("API keys updated successfully");
  };
  
  const handleDeleteImage = async (id: string) => {
    setIsDeleting(id);
    try {
      const { error } = await supabase.from('generations' as any).delete().eq('id', id);
      if (error) { toast.error("Failed to delete image: " + error.message); return; }
      setGeneratedImages(prevImages => prevImages.filter(image => image.id !== id));
      toast.success("Image deleted successfully");
    } catch (error) { console.error('Error deleting image:', error); toast.error("Failed to delete image");
    } finally { setIsDeleting(null); }
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

      const { data: updatedData, error: updateError } = await supabase
        .from('generations' as any)
        .update({ 
          image_url: upscaledImageUrl, 
          metadata: newMetadata as Json 
        })
        .eq('id', imageId)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase DB update error:", updateError);
        throw new Error(`Failed to save upscaled image to database: ${updateError.message}`);
      }

      if (updatedData) {
          setGeneratedImages(prevImages =>
            prevImages.map(img => 
              img.id === imageId 
                ? { ...img, url: upscaledImageUrl!, metadata: newMetadata } 
                : img
            )
          );
        toast.success("Upscaled image saved and gallery updated.", { id: toastId });
      }

    } catch (error) {
      console.error("Error during upscale process:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during upscaling.";
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsUpscalingImageId(null);
    }
  };

  const handleNewGenerate = async (formData: any) => {
    if (!selectedProjectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return;
    }

    setIsCreatingTask(true);
    toast.info("Preparing image generation task to be sent to API...");

    if (showPlaceholders && formData.prompts.length * formData.imagesPerPrompt > 0) {
      setGeneratedImages([]); // Clear placeholders
      setShowPlaceholders(false);
    }

    let userImageUrl: string | null = null;
    if (formData.startingImage) {
      try {
        toast.info("Uploading starting image...");
        userImageUrl = await uploadImageToStorage(formData.startingImage);
        if (!userImageUrl) {
          toast.error("Starting image upload failed. Please try again.");
          setIsCreatingTask(false);
          return;
        }
        toast.success("Starting image uploaded!");
      } catch (uploadError: any) {
        console.error("[ImageGenerationToolPage] Error uploading starting image:", uploadError);
        toast.error(`Failed to upload starting image: ${uploadError.message || 'Unknown error'}`);
        setIsCreatingTask(false);
        return;
      }
    } else if (formData.appliedStartingImageUrl) {
        userImageUrl = formData.appliedStartingImageUrl;
    }

    const taskParamsForApi = {
        prompts: formData.prompts.map((p: PromptEntry) => ({ id: p.id, fullPrompt: p.fullPrompt, shortPrompt: p.shortPrompt })),
        images_per_prompt: formData.imagesPerPrompt,
        image_size: formData.determinedApiImageSize,
        loras: formData.loras, 
        controlnets: formData.softEdgeStrength && userImageUrl ? [ 
          {
            path: "https://huggingface.co/XLabs-AI/flux-controlnet-hed-v3/resolve/main/flux-hed-controlnet-v3.safetensors",
            conditioning_scale: formData.softEdgeStrength, 
            control_image_url: userImageUrl,
          }
        ] : undefined, // Use undefined if empty for cleaner JSON
        control_loras: formData.depthStrength && userImageUrl ? [
          {
            path: "https://huggingface.co/black-forest-labs/FLUX.1-Depth-dev-lora/resolve/main/flux1-depth-dev-lora.safetensors",
            preprocess: "depth", 
            control_image_url: userImageUrl, 
            scale: formData.depthStrength?.toString(), 
          }
        ] : undefined, // Use undefined if empty
        starting_image_url: userImageUrl,
        original_starting_image_filename: formData.startingImage ? formData.startingImage.name : (formData.appliedStartingImageUrl ? 'applied_image' : null),
        full_selected_loras_for_metadata: formData.fullSelectedLoras,
        depth_strength: formData.depthStrength,
        soft_edge_strength: formData.softEdgeStrength,
        // Fal specific parameters like fal_model_id, num_inference_steps can be added here from formData
        // e.g. fal_model_id: formData.falModelId (if it exists on the form)
    };

    // Remove undefined keys from taskParamsForApi to keep payload clean
    Object.keys(taskParamsForApi).forEach(key => (taskParamsForApi as any)[key] === undefined && delete (taskParamsForApi as any)[key]);

    const apiPayload = {
      project_id: selectedProjectId,
      task_type: 'image_generation',
      params: taskParamsForApi as Json, // Cast the inner params object to Json
      status: 'Pending',
    };

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }

      const newTask = await response.json();

      if (newTask && newTask.id) {
        console.log('[ImageGenerationToolPage] Task created successfully via API:', newTask);        
      } else {
        console.warn("[ImageGenerationToolPage] Task creation via API didn't return data or ID.");
        toast.info("Task creation registered via API but no confirmation ID received. Check logs.");
      }
    } catch (error: any) {
      console.error("[ImageGenerationToolPage] Exception creating task via API:", error);
      toast.error(`An unexpected error occurred while creating the task via API: ${error.message || 'Unknown API error'}`);
    } finally {
      setIsCreatingTask(false);
    }
  };

  // const handleCancelGeneration = () => { // Now using cancelGeneration from the hook
  //   console.log("[Index.tsx] handleCancelGeneration called.");
  //   toast.info("Cancelling image generation...");
  //   cancelGenerationRef.current = true;
  //   if (currentSubscriptionRef.current && typeof currentSubscriptionRef.current.unsubscribe === 'function') {
  //     currentSubscriptionRef.current.unsubscribe();
  //     console.log("[Index.tsx] Fal subscription cancelled via unsubscribe().");
  //   }
  //   currentSubscriptionRef.current = null; 
  //   setIsGenerating(false); 
  //   setGenerationProgress(null); 
  // };

  // REMOVE OLD handleGenerate function (lines 212-393 approx)
  // ... old handleGenerate logic was here ...

  const handleApplySettingsFromGallery = (settings: DisplayableMetadata) => {
    if (imageGenerationFormRef.current?.applySettings) {
      imageGenerationFormRef.current.applySettings(settings);
      toast.success("Settings applied to form!");
    } else {
      toast.error("Could not apply settings to the form.");
    }
  };

  const hasValidFalApiKey = !!falApiKey && falApiKey.trim() !== '' && falApiKey !== '0b6f1876-0aab-4b56-b821-b384b64768fa:121392c885a381f93de56d701e3d532f';

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
      await addImageToShotMutation.mutateAsync({
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

  const MemoizedShotsPane = React.memo(ShotsPane);
  const validShots = shots || [];

  // Update the condition for showing the form, and disable generate button if task is being created
  const canGenerate = hasValidFalApiKey && !isCreatingTask; // And selectedProjectId is implicitly checked in handleNewGenerate

  return (
    <div className="flex flex-col h-screen">
      <header className="flex justify-between items-center p-4 border-b sticky top-0 bg-background/90 backdrop-blur-md z-10">
        <h1 className="text-xl font-semibold">Image Generation Tool</h1>
        <SettingsModal 
            currentFalApiKey={falApiKey}
            onSaveApiKeys={handleSaveApiKeys}
         />
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
            <ImageGenerationForm 
              ref={imageGenerationFormRef} 
              onGenerate={handleNewGenerate} // Use the new handler
              isGenerating={isCreatingTask} // isCreatingTask from handleNewGenerate
              hasApiKey={!!falApiKey} // Still relevant for UI
              apiKey={falApiKey} // Potentially for display or direct use by form
              openaiApiKey={openaiApiKey}
            />
          </div>

          {isCreatingTask && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) { /* handleCancelGeneration() */ } }}>
              <div className="bg-background p-8 rounded-lg shadow-2xl w-full max-w-md text-center" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-2xl font-semibold mb-4">Creating Image Generation Task...</h2>
                <p className="mb-2">Task ID: {/* generationProgress?.taskId */}</p>
                <p className="mb-4">Overall progress: {/* generationProgress?.progressPercentage */}%</p>
                <Button variant="destructive" onClick={(e) => { if (e.target === e.currentTarget) { /* handleCancelGeneration() */ } }}>Cancel Task</Button>
              </div>
            </div>
          )}

          <ImageGallery 
            images={showPlaceholders ? placeholderImages : generatedImages} 
            onDelete={handleDeleteImage}
            isDeleting={isDeleting}
            onApplySettings={handleApplySettingsFromGallery}
            onAddToLastShot={handleAddImageToTargetShot}
            lastShotId={lastAffectedShotId}
            allShots={validShots}
            currentToolType="image-generation"
            initialFilterState={true} // Added this prop, assuming it exists or should be added to ImageGallery
          />
          <MemoizedShotsPane />
        </>
      )}
    </div>
  );
};

export default ImageGenerationToolPage;

