import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Slider } from "@/shared/components/ui/slider";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Shot, GenerationRow } from "@/types/shots";
import { useProject } from "@/shared/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import FileInput from "@/shared/components/FileInput";
import { uploadImageToStorage } from "@/shared/lib/imageUploader";
import { useAddImageToShot, useRemoveImageFromShot, useUpdateShotImageOrder } from "@/shared/hooks/useShots";
import {
  arrayMove,
} from '@dnd-kit/sortable';
import ShotImageManager from '@/shared/components/ShotImageManager';

// Interface for individual video pair configuration (copied from Index.tsx)
export interface VideoPairConfig {
  id: string;
  imageA: GenerationRow;
  imageB: GenerationRow;
  prompt: string;
  frames: number;
  context: number;
  generatedVideoUrl?: string;
}

interface VideoEditLayoutProps {
  selectedShot: Shot;
  projectId: string | null;
  videoPairConfigs: VideoPairConfig[];
  videoControlMode: 'individual' | 'batch';
  batchVideoPrompt: string;
  batchVideoFrames: number;
  batchVideoContext: number;
  orderedShotImages: GenerationRow[];
  onShotImagesUpdate: () => void;
  onBack: () => void;
  onVideoControlModeChange: (mode: 'individual' | 'batch') => void;
  onPairConfigChange: (pairId: string, field: keyof Omit<VideoPairConfig, 'imageA' | 'imageB' | 'id' | 'generatedVideoUrl'>, value: string | number) => void;
  onBatchVideoPromptChange: (value: string) => void;
  onBatchVideoFramesChange: (value: number) => void;
  onBatchVideoContextChange: (value: number) => void;
  // Add any other necessary props, e.g., for generating videos
}

const VideoEditLayout: React.FC<VideoEditLayoutProps> = ({
  selectedShot,
  projectId,
  videoPairConfigs,
  videoControlMode,
  batchVideoPrompt,
  batchVideoFrames,
  batchVideoContext,
  orderedShotImages,
  onShotImagesUpdate,
  onBack,
  onVideoControlModeChange,
  onPairConfigChange,
  onBatchVideoPromptChange,
  onBatchVideoFramesChange,
  onBatchVideoContextChange,
}) => {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);
  const { selectedProjectId } = useProject();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  const [fileInputKey, setFileInputKey] = useState<number>(Date.now());

  const [managedImages, setManagedImages] = useState<GenerationRow[]>([]);

  // Filter for video outputs from managedImages
  const videoOutputs = useMemo(() => {
    if (!managedImages) return [];
    return managedImages.filter(gen => 
      gen.type === 'video_travel_output' || 
      (gen.location && gen.location.endsWith('.mp4')) || 
      (gen.imageUrl && gen.imageUrl.endsWith('.mp4'))
    );
  }, [managedImages]);

  useEffect(() => {
    setManagedImages(orderedShotImages || []);
  }, [orderedShotImages]);

  if (!selectedShot) {
    return <p>Error: No shot selected. Please go back and select a shot.</p>;
  }

  const handleImageUploadToShot = async (files: File[]) => {
    if (!files || files.length === 0) return;
    if (!projectId) {
      toast.error("Project ID is missing. Cannot upload image(s).");
      return;
    }
    if (!selectedShot || !selectedShot.id) {
      toast.error("Selected shot is invalid. Cannot upload image(s).");
      return;
    }

    setIsUploadingImage(true);
    toast.info(`Uploading ${files.length} image(s)...`);

    let successfulUploads = 0;
    let failedUploads = 0;
    
    for (const file of files) {
      try {
        const imageUrl = await uploadImageToStorage(file);
        if (!imageUrl) {
          toast.error(`Upload failed for ${file.name}.`);
          failedUploads++;
          continue; 
        }

        const generationPrompt = `Uploaded image: ${file.name}`;
        const generationResponse = await fetch('/api/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: imageUrl,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            projectId: projectId,
            prompt: generationPrompt,
          }),
        });

        if (!generationResponse.ok) {
          const errorData = await generationResponse.json().catch(() => ({ message: generationResponse.statusText }));
          toast.error(`Failed to create generation record for ${file.name}: ${errorData.message}`);
          failedUploads++;
          continue;
        }
        const newGeneration = await generationResponse.json();

        await addImageToShotMutation.mutateAsync({
          shot_id: selectedShot.id,
          generation_id: newGeneration.id,
          project_id: projectId,
          imageUrl: newGeneration.location, // Assuming newGeneration has location
          thumbUrl: newGeneration.location, // Assuming newGeneration has location
        });
        successfulUploads++;
      } catch (error: any) {
        console.error(`[VideoEditLayout] Error processing file ${file.name}:`, error);
        toast.error(`Failed to process ${file.name}: ${error.message}`);
        failedUploads++;
      }
    }

    setIsUploadingImage(false);
    if (successfulUploads > 0) {
      toast.success(`${successfulUploads} image(s) added to shot "${selectedShot.name}" successfully!`);
    }
    if (failedUploads > 0) {
      toast.warning(`${failedUploads} image(s) could not be added.`);
    }
    if (successfulUploads === 0 && failedUploads === 0 && files.length > 0) {
        toast.info("No images were processed. Please check the files or try again.");
    }
    setFileInputKey(Date.now()); 
    if (successfulUploads > 0 || failedUploads > 0) { // Only refetch if something changed
        onShotImagesUpdate(); 
    }
  };

  const handleDeleteImageFromShot = async (generationId: string) => {
    if (!selectedProjectId || !selectedShot || !selectedShot.id) {
      toast.error("Cannot delete image: Project or Shot ID is missing.");
      return;
    }
    removeImageFromShotMutation.mutate({
      shot_id: selectedShot.id,
      generation_id: generationId,
      project_id: selectedProjectId
    }, {
      onSuccess: () => {
        onShotImagesUpdate(); 
        // Success toast is handled by the hook
      },
      onError: (error) => {
        // Error toast is handled by the hook
        console.error("[VideoEditLayout] Failed to remove image:", error);
      }
    });
  };

  const handleReorderImagesInShot = (activeId: string, overId: string) => {
    const oldIndex = managedImages.findIndex((img) => img.id === activeId);
    const newIndex = managedImages.findIndex((img) => img.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) {
        console.error("[VideoEditLayout] Dragged item not found in managed images.");
        toast.error("Error reordering images. Item not found.");
        return;
    }

    const newOrder = arrayMove(managedImages, oldIndex, newIndex);
    setManagedImages(newOrder); // Optimistically update local UI

    if (!selectedProjectId || !selectedShot || !selectedShot.id) {
      toast.error("Cannot reorder images: Project or Shot ID is missing.");
      setManagedImages(orderedShotImages || []); // Revert to prop order on error
      return;
    }

    const orderedGenerationIds = newOrder.map(img => img.id);
    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedGenerationIds,
      projectId: selectedProjectId
    }, {
      onSuccess: () => {
        onShotImagesUpdate();
        // Success toast handled by hook
      },
      onError: (error) => {
        console.error("[VideoEditLayout] Failed to reorder images:", error);
        setManagedImages(orderedShotImages || []); // Revert to prop order on error
        // Error toast handled by hook
      }
    });
  };

  const handleGenerateVideo = async (pairConfig: VideoPairConfig) => {
    if (!projectId) { 
      toast.error("No project selected. Please select a project first.");
      return;
    }
    if (!pairConfig.imageA?.imageUrl || !pairConfig.imageB?.imageUrl) {
      toast.error("Image A or Image B is missing for this pair.");
      return;
    }

    setIsCreatingTask(true);
    setCreatingTaskId(pairConfig.id);
    toast.info(`Creating video task for segment ${pairConfig.imageA.id.substring(0,4)}... to ${pairConfig.imageB.id.substring(0,4)}...`);

    const taskApiParams = {
      image_a_url: pairConfig.imageA.imageUrl,
      image_b_url: pairConfig.imageB.imageUrl,
      prompt: pairConfig.prompt,
      frames: pairConfig.frames,
      context: pairConfig.context,
      shot_id: selectedShot.id,
    };

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, 
          task_type: 'video_travel_segment',
          params: taskApiParams as Json, 
          status: 'Pending',
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      
      const newTask = await response.json(); 

      if (newTask && newTask.id) {
        console.log("[VideoEditLayout] Video task created via API:", newTask);
        toast.success(`Video task created (ID: ${(newTask.id as string).substring(0,8)}...).`);
      } else {
        console.warn("[VideoEditLayout] Video task creation via API did not return ID or data.");
        toast.info("Video task creation registered, but no confirmation ID received from API.");
      }
    } catch (err: any) {
      console.error("[VideoEditLayout] Error creating video task via API:", err);
      toast.error(`An unexpected error occurred: ${err.message || 'Unknown API error'}`);
    } finally {
      setIsCreatingTask(false);
      setCreatingTaskId(null);
    }
  };

  const handleGenerateAllVideos = async () => {
    if (!projectId) {
      toast.error('No project selected. Please select a project first.');
      return;
    }

    if (managedImages.length < 2) {
      toast.warning('Add at least two images to generate a travel video.');
      return;
    }

    setIsCreatingTask(true);
    setCreatingTaskId('batch');
    toast.info('Queuing travel-between-images task via API...');

    const imageUrls = managedImages
      .map((img) => img.imageUrl)
      .filter((url): url is string => Boolean(url));

    const basePrompts =
      videoControlMode === 'batch' ? [batchVideoPrompt] : videoPairConfigs.map((cfg) => cfg.prompt);

    const segmentFrames =
      videoControlMode === 'batch' ? [batchVideoFrames] : videoPairConfigs.map((cfg) => cfg.frames);

    const frameOverlap =
      videoControlMode === 'batch' ? [batchVideoContext] : videoPairConfigs.map((cfg) => cfg.context);

    try {
      const response = await fetch('/api/steerable-motion/travel-between-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          shot_id: selectedShot.id,
          image_urls: imageUrls,
          base_prompts: basePrompts,
          segment_frames: segmentFrames,
          frame_overlap: frameOverlap,
          resolution: '700x460',
          model_name: 'vace_14B',
          seed: 789,
          debug: true,
          use_causvid_lora: true,
          fade_in_duration:
            '{"low_point": 0.0, "high_point": 0.8, "curve_type": "ease_in_out", "duration_factor": 0.00}',
          fade_out_duration:
            '{"low_point": 0.0, "high_point": 0.8, "curve_type": "ease_in_out", "duration_factor": 0.00}',
          after_first_post_generation_saturation: 0.6,
          params_json_str: '{"steps": 4}',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }

      const newTask = await response.json();
      toast.success(`Travel task queued (ID: ${(newTask.id as string).substring(0, 8)}...).`);
    } catch (err: any) {
      console.error('[VideoEditLayout] Error creating travel task:', err);
      toast.error(`Failed to create travel task: ${err.message || 'Unknown error'}`);
    } finally {
      setIsCreatingTask(false);
      setCreatingTaskId(null);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Button onClick={onBack} className="mb-6">Back to Video Shots List</Button>
      <h2 className="text-3xl font-bold mb-1">Video Edit: {selectedShot.name}</h2>
      <p className="text-muted-foreground mb-6">Configure and generate video segments, or add new images to this shot.</p>

      {videoOutputs.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Output Videos</CardTitle>
            <p className="text-sm text-muted-foreground pt-1">
              Generated videos for this shot.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videoOutputs.map((video, index) => (
                <div key={video.id || `video-${index}`} className="rounded-lg overflow-hidden shadow-md bg-muted/30 aspect-video flex items-center justify-center">
                  { (video.location || video.imageUrl) ? (
                    <video 
                      src={video.location || video.imageUrl} 
                      controls 
                      className="w-full h-full object-contain"
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <p className="text-xs text-muted-foreground p-2">Video URL not available.</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/*
      <div className="mb-6 flex items-center space-x-2">
        <Label className="text-sm font-medium">Control Mode:</Label>
        <Button 
          variant={videoControlMode === 'batch' ? 'secondary' : 'outline'} 
          size="sm"
          onClick={() => onVideoControlModeChange('batch')}
        >
          Batch
        </Button>
        <Button 
          variant={videoControlMode === 'individual' ? 'secondary' : 'outline'} 
          size="sm"
          onClick={() => onVideoControlModeChange('individual')}
        >
          Individual
        </Button>
      </div>
      */}

      {videoControlMode === 'individual' && videoPairConfigs.length > 0 && (
        <div className="space-y-8 mb-8">
          {videoPairConfigs.map((pairConfig, index) => (
            <div key={pairConfig.id} className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 p-4 border rounded-lg items-start bg-card shadow-md">
              <div className="flex flex-col space-y-2 md:flex-row md:space-x-3 md:space-y-0">
                <div className="flex-1 flex flex-col space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground self-start">Image A</Label>
                  <div className="w-full h-36 bg-muted/50 rounded border flex items-center justify-center p-1 overflow-hidden">
                    <img 
                      src={pairConfig.imageA.thumbUrl || pairConfig.imageA.imageUrl || '/placeholder.svg'} 
                      alt={`Pair ${index + 1} - Image A`}
                      className="max-w-full max-h-full object-contain rounded-sm"
                    />
                  </div>
                </div>
                <div className="flex-1 flex flex-col space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground self-start">Image B</Label>
                  <div className="w-full h-36 bg-muted/50 rounded border flex items-center justify-center p-1 overflow-hidden">
                    <img 
                      src={pairConfig.imageB.thumbUrl || pairConfig.imageB.imageUrl || '/placeholder.svg'} 
                      alt={`Pair ${index + 1} - Image B`}
                      className="max-w-full max-h-full object-contain rounded-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-4 pt-1 md:pt-0">
                <div>
                  <Label htmlFor={`prompt-${pairConfig.id}`} className="text-sm font-medium block mb-1.5">Prompt</Label>
                  <Textarea 
                    id={`prompt-${pairConfig.id}`}
                    value={pairConfig.prompt}
                    onChange={(e) => onPairConfigChange(pairConfig.id, 'prompt', e.target.value)}
                    placeholder={`Video prompt for A to B...`}
                    className="min-h-[70px] text-sm"
                    rows={3}
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor={`frames-${pairConfig.id}`} className="text-sm font-medium block mb-1">Frames: {pairConfig.frames}</Label>
                    <Slider
                      id={`frames-${pairConfig.id}`}
                      min={10}
                      max={120} 
                      step={1}
                      value={[pairConfig.frames]}
                      onValueChange={(val) => onPairConfigChange(pairConfig.id, 'frames', val[0])}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`context-${pairConfig.id}`} className="text-sm font-medium block mb-1">Context: {pairConfig.context}</Label>
                    <Slider
                      id={`context-${pairConfig.id}`}
                      min={0}
                      max={60}
                      step={1}
                      value={[pairConfig.context]}
                      onValueChange={(val) => onPairConfigChange(pairConfig.id, 'context', val[0])}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col space-y-2 items-center pt-2 md:pt-0">
                <Label className="text-xs font-medium text-muted-foreground self-center">Video Preview</Label>
                <div className="w-full aspect-video bg-muted/50 rounded border flex items-center justify-center overflow-hidden">
                  {pairConfig.generatedVideoUrl ? (
                    <video src={pairConfig.generatedVideoUrl} controls className="w-full h-full object-contain" />
                  ) : (
                    <p className="text-xs text-muted-foreground text-center p-2">Video output will appear here</p>
                  )}
                </div>
                <Button 
                  size="sm" 
                  className="w-full mt-1" 
                  onClick={() => handleGenerateVideo(pairConfig)} 
                  disabled={isCreatingTask && creatingTaskId === pairConfig.id}
                >
                  {(isCreatingTask && creatingTaskId === pairConfig.id) ? 'Creating Task...' : 'Generate Video'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {videoControlMode === 'batch' && videoPairConfigs.length > 0 && (
        <div className="space-y-6 mb-8">
          <div className="p-4 border rounded-lg bg-card shadow-md space-y-4">
            <h3 className="text-lg font-semibold">Batch Generation Settings</h3>
            <div>
              <Label htmlFor="batchVideoPrompt" className="text-sm font-medium block mb-1.5">Global Prompt</Label>
              <Textarea 
                id="batchVideoPrompt"
                value={batchVideoPrompt}
                onChange={(e) => onBatchVideoPromptChange(e.target.value)}
                placeholder="Enter a global prompt for all video segments... (e.g., cinematic transition)"
                className="min-h-[70px] text-sm"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="batchVideoFrames" className="text-sm font-medium block mb-1">Frames for all: {batchVideoFrames}</Label>
                <Slider
                  id="batchVideoFrames"
                  min={10}
                  max={120} 
                  step={1}
                  value={[batchVideoFrames]}
                  onValueChange={(value) => onBatchVideoFramesChange(value[0])}
                />
              </div>
              <div>
                <Label htmlFor="batchVideoContext" className="text-sm font-medium block mb-1">Context for all: {batchVideoContext}</Label>
                <Slider
                  id="batchVideoContext"
                  min={0}
                  max={60}
                  step={1}
                  value={[batchVideoContext]}
                  onValueChange={(value) => onBatchVideoContextChange(value[0])}
                />
              </div>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Manage Images in "{selectedShot.name}"</CardTitle>
              <p className="text-sm text-muted-foreground pt-1">
                Drag to reorder images. Reordering will affect video segment pairs. 
                {managedImages.length < 2 ? "Add at least two images to create video segments." : ""}
              </p>
            </CardHeader>
            <CardContent>
              <ShotImageManager
                images={managedImages}
                onImageDelete={handleDeleteImageFromShot}
                onImageReorder={handleReorderImagesInShot}
              />
              {managedImages.length === 0 && (
                 <p className="text-sm text-muted-foreground mt-4">No images in this shot yet. Upload images using the form below.</p>
              )}
            </CardContent>
          </Card>
          
          <Button size="lg" className="w-full" onClick={handleGenerateAllVideos} disabled={isCreatingTask && creatingTaskId === 'batch'}>
            {(isCreatingTask && creatingTaskId === 'batch') ? 'Creating Tasks...' : 'Generate All Videos (Batch)'}
          </Button>
        </div>
      )}

      {videoPairConfigs.length === 0 && videoControlMode !== 'batch' && (
        <p className="mb-8">No image pairs to configure for individual mode. This shot might have less than two images. Add images below.</p>
      )}
       {videoPairConfigs.length === 0 && videoControlMode === 'batch' && (
        <p className="mb-8">No image pairs to configure for batch mode. This shot might have less than two images. Add more images below.</p>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Add New Image(s) to "{selectedShot.name}"</CardTitle>
        </CardHeader>
        <CardContent>
          <FileInput
            key={fileInputKey}
            onFileChange={handleImageUploadToShot}
            acceptTypes={['image']}
            label="Upload Image(s)"
            disabled={isUploadingImage}
            multiple
          />
          {isUploadingImage && <p className="text-sm text-primary mt-2">Uploading and processing image(s)...</p>}
        </CardContent>
      </Card>

    </div>
  );
};

export default VideoEditLayout; 