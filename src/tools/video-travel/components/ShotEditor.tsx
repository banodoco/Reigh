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
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
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

const findClosestResolution = (width: number, height: number): string => {
  const imageAspectRatio = width / height;
  let closestRatioKey = 'Square';
  let minDiff = Math.abs(imageAspectRatio - 1);

  for (const key in ASPECT_RATIO_TO_RESOLUTION) {
    let ratio: number;
    if (key === 'Square') {
      ratio = 1;
    } else {
      const parts = key.split(':').map(Number);
      ratio = parts[0] / parts[1];
    }
    const diff = Math.abs(imageAspectRatio - ratio);
    if (diff < minDiff) {
      minDiff = diff;
      closestRatioKey = key;
    }
  }
  return ASPECT_RATIO_TO_RESOLUTION[closestRatioKey] || DEFAULT_RESOLUTION;
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);
  const [localOrderedShotImages, setLocalOrderedShotImages] = useState(orderedShotImages || []);

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

  useEffect(() => {
    if (orderedShotImages.length !== localOrderedShotImages.length) {
      setLocalOrderedShotImages(orderedShotImages);
    }
  }, [orderedShotImages]);

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

  const [managedImages, setManagedImages] = useState<GenerationRow[]>([]);

  // Update videoOutputs to use localOrderedShotImages
  const videoOutputs = useMemo(() => {
    if (!localOrderedShotImages) return [];
    return localOrderedShotImages.filter(isGenerationVideo).reverse();
  }, [localOrderedShotImages]);

  useEffect(() => {
    setManagedImages((localOrderedShotImages || []).filter(gen => !isGenerationVideo(gen)));
  }, [localOrderedShotImages]);

  if (!selectedShot) {
    return <p>Error: No shot selected. Please go back and select a shot.</p>;
  }

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

  const handleReorderImagesInShot = (activeId: string, overId: string | null) => {
    const oldIndex = managedImages.findIndex((img) => img.id === activeId);
    const newIndex = managedImages.findIndex((img) => img.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) {
        console.error("[ShotEditor] Dragged item not found in managed images.");
        toast.error("Error reordering images. Item not found.");
        return;
    }

    const newOrder = arrayMove(managedImages, oldIndex, newIndex);
    setManagedImages(newOrder); // Optimistically update local UI

    if (!selectedProjectId || !selectedShot || !selectedShot.id) {
      toast.error("Cannot reorder images: Project or Shot ID is missing.");
      setManagedImages((localOrderedShotImages) || []); // Revert to local order on error
      return;
    }
    
    // Build full ordering by merging the reordered non-video images with the unchanged video outputs
    const newNonVideoIds = newOrder.map(img => img.id);
    let nonVideoIndex = 0;
    const fullOrderedGenerationIds = localOrderedShotImages.map(item => {
       if (!isGenerationVideo(item)) {
         return newNonVideoIds[nonVideoIndex++];
       }
       return item.id;
    });

    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedGenerationIds: fullOrderedGenerationIds,
      projectId: selectedProjectId
    }, {
      onSuccess: () => {
        onShotImagesUpdate();
      },
      onError: (error) => {
        console.error("[ShotEditor] Failed to reorder images:", error);
        setManagedImages((localOrderedShotImages) || []); // Revert to local order on error
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

    if (managedImages.length < 2) {
      toast.warning('Add at least two images to generate a travel video.');
      return;
    }

    setIsCreatingTask(true);
    setCreatingTaskId('batch');
    toast.info('Queuing travel-between-images task via API...');

    let resolution: string | undefined = undefined;

    if ((dimensionSource || 'firstImage') === 'firstImage' && managedImages.length > 0) {
      try {
        const firstImage = managedImages[0];
        const imageUrl = getDisplayUrl(firstImage.imageUrl);
        if (imageUrl) {          
          const { width, height } = await getDimensions(imageUrl);
          resolution = findClosestResolution(width, height);          
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
    const absoluteImageUrls = managedImages
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
    <div className="container mx-auto p-4">
      <Button onClick={onBack} className="mb-6">Back to Video Shots List</Button>
      <h2 className="text-3xl font-bold mb-1">Video Edit: {selectedShot.name}</h2>
      <p className="text-muted-foreground mb-6">Configure and generate video segments, or add new images to this shot.</p>

      <VideoOutputsGallery
        videoOutputs={videoOutputs}
        onDelete={handleDeleteVideoOutput}
        deletingVideoId={deletingVideoId}
      />

      {/*
      <div className="mb-6 flex items-center space-x-2">
        <Label className="text-sm font-medium">Control Mode:</Label>
        Individual
        <Button
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
                      src={getDisplayUrl(pairConfig.imageA.thumbUrl || pairConfig.imageA.imageUrl)} 
                      alt={`Pair ${index + 1} - Image A`}
                      className="max-w-full max-h-full object-contain rounded-sm"
                    />
                  </div>
                </div>
                <div className="flex-1 flex flex-col space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground self-start">Image B</Label>
                  <div className="w-full h-36 bg-muted/50 rounded border flex items-center justify-center p-1 overflow-hidden">
                    <img 
                      src={getDisplayUrl(pairConfig.imageB.thumbUrl || pairConfig.imageB.imageUrl)} 
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
                    <video src={getDisplayUrl(pairConfig.generatedVideoUrl)} controls className="w-full h-full object-contain" />
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
                onImageDelete={handleDeleteVideoOutput}
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

export default ShotEditor; 