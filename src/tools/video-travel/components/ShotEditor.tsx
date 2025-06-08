import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Slider } from "@/shared/components/ui/slider";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Shot, GenerationRow } from "@/types/shots";
import { useProject } from "@/shared/contexts/ProjectContext";
import { toast } from "sonner";
import FileInput from "@/shared/components/FileInput";
import { uploadImageToStorage } from "@/shared/lib/imageUploader";
import { useAddImageToShot, useRemoveImageFromShot, useUpdateShotImageOrder } from "@/shared/hooks/useShots";
import ShotImageManager from '@/shared/components/ShotImageManager';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { ChevronsUpDown, Info } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import { getDisplayUrl } from '@/shared/lib/utils';
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import VideoOutputsGallery from "./VideoOutputsGallery";
import BatchSettingsForm from "./BatchSettingsForm";

// Add the missing type definition
export interface SegmentGenerationParams {
  prompts: string[];
  frames: number[];
  context: number[];
}

// Local definition for Json type to remove dependency on supabase client types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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

export interface SteerableMotionSettings {
  negative_prompt: string;
  model_name: string;
  seed: number;
  debug: boolean;
  apply_reward_lora: boolean;
  colour_match_videos: boolean;
  apply_causvid: boolean;
  fade_in_duration: string;
  fade_out_duration: string;
  after_first_post_generation_saturation: number;
  after_first_post_generation_brightness: number;
}

interface ShotSettings {
  videoControlMode: 'individual' | 'batch';
  batchVideoPrompt: string;
  batchVideoFrames: number;
  batchVideoContext: number;
  batchVideoSteps: number;
  dimensionSource: 'project' | 'firstImage' | 'custom';
  customWidth?: number;
  customHeight?: number;
  steerableMotionSettings: SteerableMotionSettings;
}

interface ShotEditorProps {
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
  batchVideoSteps: number;
  onBatchVideoStepsChange: (value: number) => void;
  dimensionSource: 'project' | 'firstImage' | 'custom';
  onDimensionSourceChange: (source: 'project' | 'firstImage' | 'custom') => void;
  steerableMotionSettings: SteerableMotionSettings;
  onSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  customWidth?: number;
  onCustomWidthChange: (v: number | undefined) => void;
  customHeight?: number;
  onCustomHeightChange: (v: number | undefined) => void;
  onGenerateAllSegments: (shot: Shot, segmentParams: SegmentGenerationParams, dimensionInfo: any) => void;
}

const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';

const DEFAULT_RESOLUTION = '840x552';

const getDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = (err) => reject(err);
    img.src = url;
  });
};

const isGenerationVideo = (gen: GenerationRow): boolean => {
  return gen.type === 'video_travel_output' ||
         (gen.location && gen.location.endsWith('.mp4')) ||
         (gen.imageUrl && gen.imageUrl.endsWith('.mp4'));
};

const ShotEditor: React.FC<ShotEditorProps> = ({
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
  batchVideoSteps,
  onBatchVideoStepsChange,
  dimensionSource,
  onDimensionSourceChange,
  steerableMotionSettings,
  onSteerableMotionSettingsChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  onGenerateAllSegments,
}) => {
  const { selectedProjectId, projects } = useProject();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  const [fileInputKey, setFileInputKey] = useState<number>(Date.now());
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);

  // Use local state for optimistic updates on image list
  const [localOrderedShotImages, setLocalOrderedShotImages] = useState(orderedShotImages || []);
  useEffect(() => {
    setLocalOrderedShotImages(orderedShotImages || []);
  }, [orderedShotImages]);

  useEffect(() => {
    if (!selectedShot?.id) return;

    const shotId = selectedShot.id;
    let settingsToApply: ShotSettings | null = null;

    const loadSettings = (key: string): ShotSettings | null => {
      const settingsStr = localStorage.getItem(key);
      if (settingsStr) {
        try {
          return JSON.parse(settingsStr) as ShotSettings;
        } catch (e) {
          console.error(`[ShotEditor] Failed to parse settings from localStorage for key ${key}`, e);
          return null;
        }
      }
      return null;
    };

    settingsToApply = loadSettings(`shot-settings-${shotId}`);

    if (!settingsToApply) {
      const lastEditedShotId = localStorage.getItem('last-edited-shot-id');
      if (lastEditedShotId) {
        settingsToApply = loadSettings(`shot-settings-${lastEditedShotId}`);
      }
    }

    if (settingsToApply) {
      if (settingsToApply.videoControlMode) onVideoControlModeChange(settingsToApply.videoControlMode);
      if (typeof settingsToApply.batchVideoPrompt === 'string') onBatchVideoPromptChange(settingsToApply.batchVideoPrompt);
      if (typeof settingsToApply.batchVideoFrames === 'number') onBatchVideoFramesChange(settingsToApply.batchVideoFrames);
      if (typeof settingsToApply.batchVideoContext === 'number') onBatchVideoContextChange(settingsToApply.batchVideoContext);
      if (typeof settingsToApply.batchVideoSteps === 'number') onBatchVideoStepsChange(settingsToApply.batchVideoSteps);
      if (settingsToApply.dimensionSource) onDimensionSourceChange(settingsToApply.dimensionSource);
      if (settingsToApply.customWidth) onCustomWidthChange(settingsToApply.customWidth);
      if (settingsToApply.customHeight) onCustomHeightChange(settingsToApply.customHeight);
      if (settingsToApply.steerableMotionSettings) {
        const defaultSteerableSettings = {
          negative_prompt: '',
          model_name: 'vace_14B',
          seed: 789,
          debug: true,
          apply_reward_lora: true,
          colour_match_videos: true,
          apply_causvid: true,
          fade_in_duration: '{"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}',
          fade_out_duration: '{"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}',
          after_first_post_generation_saturation: 0.75,
          after_first_post_generation_brightness: -0.3,
        };
        onSteerableMotionSettingsChange({
          ...defaultSteerableSettings,
          ...settingsToApply.steerableMotionSettings
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShot?.id]);

  const settingsToSave = useMemo(() => ({
    videoControlMode,
    batchVideoPrompt,
    batchVideoFrames,
    batchVideoContext,
    batchVideoSteps,
    dimensionSource,
    customWidth,
    customHeight,
    steerableMotionSettings,
  }), [
    videoControlMode,
    batchVideoPrompt,
    batchVideoFrames,
    batchVideoContext,
    batchVideoSteps,
    dimensionSource,
    customWidth,
    customHeight,
    steerableMotionSettings,
  ]);

  // Debounced save of settings to localStorage to prevent rapid re-renders while typing
  useEffect(() => {
    if (!selectedShot?.id) return;

    const shotId = selectedShot.id;

    const handler = setTimeout(() => {
      try {
        const settingsJson = JSON.stringify(settingsToSave);
        localStorage.setItem(`shot-settings-${shotId}`, settingsJson);
        localStorage.setItem('last-edited-shot-id', shotId);
      } catch (e) {
        console.error("[ShotEditor] Failed to save shot settings to localStorage", e);
      }
    }, 400); // Save after 400ms of inactivity

    return () => {
      clearTimeout(handler);
    };
  }, [selectedShot?.id, settingsToSave]);

  const nonVideoImages = useMemo(() => localOrderedShotImages.filter(img => !isGenerationVideo(img)), [localOrderedShotImages]);
  const videoOutputs = useMemo(() => localOrderedShotImages.filter(isGenerationVideo), [localOrderedShotImages]);

  const handleImageUploadToShot = async (files: File[]) => {
    if (!files || files.length === 0) return;
    if (!selectedProjectId || !selectedShot?.id) {
      toast.error("Cannot upload image: Project or Shot ID is missing.");
      return;
    }

    setIsUploadingImage(true);
    toast.info(`Uploading ${files.length} image(s)...`);

    try {
      for (const file of files) {
        const imageUrl = await uploadImageToStorage(file);

        const promptForGeneration = `External image: ${file.name || 'untitled'}`;
        const genResponse = await fetch('/api/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: imageUrl,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            projectId: selectedProjectId,
            prompt: promptForGeneration,
          }),
        });

        if (!genResponse.ok) {
          const errorData = await genResponse.json().catch(() => ({ message: genResponse.statusText }));
          throw new Error(errorData.message || `Failed to create generation record: ${genResponse.statusText}`);
        }
        const newGeneration = await genResponse.json();

        await addImageToShotMutation.mutateAsync({
          shot_id: selectedShot.id,
          generation_id: newGeneration.id,
          project_id: selectedProjectId,
          imageUrl: imageUrl,
          thumbUrl: imageUrl,
        });
      }

      toast.success(`${files.length} image(s) uploaded and added successfully.`);
      onShotImagesUpdate();
      setFileInputKey(Date.now());

    } catch (error: any) {
      console.error("[ShotEditor] Error uploading images:", error);
      toast.error(`Image upload failed: ${error.message}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteVideoOutput = async (generationId: string) => {
    if (!selectedProjectId || !selectedShot?.id) {
      toast.error("Cannot delete video: Project or Shot ID is missing.");
      return;
    }
    setDeletingVideoId(generationId);
    try {
      console.log(`Deleting video generation ${generationId} from shot ${selectedShot.id}`);
      await removeImageFromShotMutation.mutateAsync({
        shot_id: selectedShot.id,
        generation_id: generationId,
        project_id: selectedProjectId,
      });
      // Optimistically update the local ordering by removing the deleted item
      const updatedOrdering = localOrderedShotImages.filter(item => item.id !== generationId);
      setLocalOrderedShotImages(updatedOrdering);
      updateShotImageOrderMutation.mutate({
        shotId: selectedShot.id,
        orderedGenerationIds: updatedOrdering.map(item => item.id),
        projectId: selectedProjectId
      }, {
        onSuccess: () => {
          toast.success("Video output removed and ordering updated.");
        },
        onError: (error) => {
          console.error("[ShotEditor] Failed to update ordering after deletion:", error);
          toast.error("Failed to update ordering after deletion.");
        }
      });
    } catch (error: any) {
      // The hook will show its own toast on error.
      console.error(`Failed to delete video output: ${error.message}`);
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleDeleteImageFromShot = async (generationId: string) => {
    if (!selectedProjectId || !selectedShot?.id) {
      toast.error("Cannot delete image: Project or Shot ID is missing.");
      return;
    }
    setDeletingVideoId(generationId);
    try {
      console.log(`Deleting image generation ${generationId} from shot ${selectedShot.id}`);
      await removeImageFromShotMutation.mutateAsync({
        shot_id: selectedShot.id,
        generation_id: generationId,
        project_id: selectedProjectId,
      });
      // Optimistically update the local ordering by removing the deleted item
      const updatedOrdering = localOrderedShotImages.filter(item => item.id !== generationId);
      setLocalOrderedShotImages(updatedOrdering);
      updateShotImageOrderMutation.mutate({
        shotId: selectedShot.id,
        orderedGenerationIds: updatedOrdering.map(item => item.id),
        projectId: selectedProjectId
      }, {
        onSuccess: () => {
          toast.success("Image removed and ordering updated.");
        },
        onError: (error) => {
          console.error("[ShotEditor] Failed to update ordering after deletion:", error);
          toast.error("Failed to update ordering after deletion.");
        }
      });
    } catch (error: any) {
      // The hook will show its own toast on error.
      console.error(`Failed to delete image: ${error.message}`);
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleReorderImagesInShot = (activeId: string, overId: string | null) => {
    const oldIndex = localOrderedShotImages.findIndex((img) => img.id === activeId);
    const newIndex = localOrderedShotImages.findIndex((img) => img.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) {
        console.error("[ShotEditor] Dragged item not found in local ordered images.");
        toast.error("Error reordering images. Item not found.");
        return;
    }

    const newOrder = arrayMove(localOrderedShotImages, oldIndex, newIndex);
    setLocalOrderedShotImages(newOrder); // Optimistically update local UI

    if (!selectedProjectId || !selectedShot || !selectedShot.id) {
      toast.error("Cannot reorder images: Project or Shot ID is missing.");
      setLocalOrderedShotImages((localOrderedShotImages) || []); // Revert to local order on error
      return;
    }
    
    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedGenerationIds: newOrder.map(item => item.id),
      projectId: selectedProjectId
    }, {
      onSuccess: () => {
        onShotImagesUpdate();
      },
      onError: (error) => {
        console.error("[ShotEditor] Failed to reorder images:", error);
        setLocalOrderedShotImages((localOrderedShotImages) || []); // Revert to local order on error
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
        console.log("[ShotEditor] Video task created via API:", newTask);        
      } else {
        console.warn("[ShotEditor] Video task creation via API did not return ID or data.");
        toast.info("Video task creation registered, but no confirmation ID received from API.");
      }
    } catch (err: any) {
      console.error("[ShotEditor] Error creating video task via API:", err);
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

    if (localOrderedShotImages.length < 2) {
      toast.warning('Add at least two images to generate a travel video.');
      return;
    }

    setIsCreatingTask(true);
    setCreatingTaskId('batch');
    toast.info('Queuing travel-between-images task via API...');

    let resolution: string | undefined = undefined;

    if ((dimensionSource || 'firstImage') === 'firstImage' && localOrderedShotImages.length > 0) {
      try {
        const firstImage = localOrderedShotImages[0];
        const imageUrl = getDisplayUrl(firstImage.imageUrl);
        if (imageUrl) {          
          const { width, height } = await getDimensions(imageUrl);
          const imageAspectRatio = width / height;
          const closestRatioKey = findClosestAspectRatio(imageAspectRatio);
          resolution = ASPECT_RATIO_TO_RESOLUTION[closestRatioKey] || DEFAULT_RESOLUTION;
        } else {
          toast.warning("Could not get URL for the first image. Using project default resolution.");
        }
      } catch (error) {
        console.error("Error getting first image dimensions:", error);
        toast.warning("Could not determine first image dimensions. Using project default resolution.");
      }
    }

    if (dimensionSource === 'custom') {
      if (customWidth && customHeight) {
        resolution = `${customWidth}x${customHeight}`;        
      } else {
        toast.error('Custom dimensions are selected, but width or height is not set.');
        setIsCreatingTask(false);
        setCreatingTaskId(null);
        return;
      }
    }

    // Use getDisplayUrl to convert relative paths to absolute URLs
    const absoluteImageUrls = localOrderedShotImages
      .map((img) => getDisplayUrl(img.imageUrl)) // Use getDisplayUrl here
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg'); // Ensure it's a valid, non-placeholder URL

    if (absoluteImageUrls.length < 2) {
      toast.error('Not enough valid image URLs to generate video. Ensure images are processed correctly.');
      setIsCreatingTask(false);
      setCreatingTaskId(null);
      return;
    }

    const basePrompts =
      videoControlMode === 'batch' ? [batchVideoPrompt] : videoPairConfigs.map((cfg) => cfg.prompt);

    const segmentFrames =
      videoControlMode === 'batch' ? [batchVideoFrames] : videoPairConfigs.map((cfg) => cfg.frames);

    const frameOverlap =
      videoControlMode === 'batch' ? [batchVideoContext] : videoPairConfigs.map((cfg) => cfg.context);

    try {
      const requestBody: any = {
        project_id: projectId,
        shot_id: selectedShot.id,
        image_urls: absoluteImageUrls,
        base_prompts: basePrompts,
        segment_frames: segmentFrames,
        frame_overlap: frameOverlap,
        negative_prompts: [steerableMotionSettings.negative_prompt],
        model_name: steerableMotionSettings.model_name,
        seed: steerableMotionSettings.seed,
        debug: steerableMotionSettings.debug,
        apply_reward_lora: steerableMotionSettings.apply_reward_lora,
        colour_match_videos: steerableMotionSettings.colour_match_videos ?? true,
        apply_causvid: steerableMotionSettings.apply_causvid ?? true,
        fade_in_duration: steerableMotionSettings.fade_in_duration,
        fade_out_duration: steerableMotionSettings.fade_out_duration,
        after_first_post_generation_saturation: steerableMotionSettings.after_first_post_generation_saturation,
        after_first_post_generation_brightness: steerableMotionSettings.after_first_post_generation_brightness,
        params_json_str: JSON.stringify({ steps: batchVideoSteps }),
      };

      if (resolution) {
        requestBody.resolution = resolution;
      }
      
      const response = await fetch('/api/steerable-motion/travel-between-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }

      const newTask = await response.json();
      toast.success(`Travel task queued (ID: ${(newTask.id as string).substring(0, 8)}...).`);
    } catch (err: any) {
      console.error('[ShotEditor] Error creating travel task:', err);
      toast.error(`Failed to create travel task: ${err.message || 'Unknown error'}`);
    } finally {
      setIsCreatingTask(false);
      setCreatingTaskId(null);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex-shrink-0 flex justify-between items-center">
        <Button onClick={onBack}>&larr; Back to Shot List</Button>
        <h2 className="text-2xl font-bold text-center truncate px-4">
          Editing Shot: <span className="text-primary">{selectedShot.name}</span>
        </h2>
        <div className="w-[150px]" /> {/* Spacer to balance the back button */}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row flex-grow gap-4 min-h-0">
        
        {/* Left Column: Image Manager & Video Outputs */}
        <div className="flex flex-col lg:w-1/2 xl:w-2/5 gap-4 min-h-0">
          <Card className="flex-grow flex flex-col min-h-0">
            <CardHeader>
              <CardTitle>Manage Shot Images</CardTitle>
              <p className="text-sm text-muted-foreground pt-1">Drag to reorder. Add at least two images to generate videos.</p>
            </CardHeader>
            <CardContent className="flex-grow overflow-y-auto">
              <ShotImageManager
                images={nonVideoImages}
                onImageDelete={handleDeleteImageFromShot}
                onImageReorder={handleReorderImagesInShot}
              />
            </CardContent>
            <div className="p-4 border-t">
              <FileInput
                key={fileInputKey}
                onFileChange={handleImageUploadToShot}
                acceptTypes={['image']}
                label="Add more images"
                disabled={isUploadingImage}
                multiple
              />
            </div>
          </Card>
          <div className="flex-shrink-0">
             <VideoOutputsGallery 
                videoOutputs={videoOutputs} 
                onDelete={handleDeleteVideoOutput}
                deletingVideoId={deletingVideoId}
              />
          </div>
        </div>

        {/* Right Column: Generation Settings */}
        <div className="lg:w-1/2 xl:w-3/5">
          <Card>
            <CardHeader>
                <CardTitle>Travel Between Images</CardTitle>
                <p className="text-sm text-muted-foreground pt-1">Configure and generate video segments between the images in this shot.</p>
            </CardHeader>
            <CardContent>
                <BatchSettingsForm
                    batchVideoPrompt={batchVideoPrompt}
                    onBatchVideoPromptChange={onBatchVideoPromptChange}
                    batchVideoFrames={batchVideoFrames}
                    onBatchVideoFramesChange={onBatchVideoFramesChange}
                    batchVideoContext={batchVideoContext}
                    onBatchVideoContextChange={onBatchVideoContextChange}
                    batchVideoSteps={batchVideoSteps}
                    onBatchVideoStepsChange={onBatchVideoStepsChange}
                    dimensionSource={dimensionSource}
                    onDimensionSourceChange={onDimensionSourceChange}
                    customWidth={customWidth}
                    onCustomWidthChange={onCustomWidthChange}
                    customHeight={customHeight}
                    onCustomHeightChange={onCustomHeightChange}
                    steerableMotionSettings={steerableMotionSettings}
                    onSteerableMotionSettingsChange={onSteerableMotionSettingsChange}
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                />
                <div className="mt-6">
                    <Button 
                        size="lg" 
                        className="w-full" 
                        onClick={handleGenerateAllVideos} 
                        disabled={isCreatingTask || nonVideoImages.length < 2}
                    >
                        {isCreatingTask ? 'Creating Tasks...' : 'Generate All Videos (Batch)'}
                    </Button>
                    {nonVideoImages.length < 2 && <p className="text-xs text-center text-muted-foreground mt-2">You need at least two images to generate videos.</p>}
                </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ShotEditor; 