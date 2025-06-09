import React, { useState, useEffect, useMemo } from "react";
import { nanoid } from "nanoid";
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
import { useAddImageToShot, useRemoveImageFromShot, useUpdateShotImageOrder, ShotGenerationRow } from "@/shared/hooks/useShots";
import { useDeleteGeneration } from "@/shared/hooks/useGenerations";
import ShotImageManager from '@/shared/components/ShotImageManager';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { ChevronsUpDown, Info, X } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import { getDisplayUrl } from '@/shared/lib/utils';
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import VideoOutputsGallery from "./VideoOutputsGallery";
import BatchSettingsForm from "./BatchSettingsForm";
import { ActiveLora } from '../pages/VideoTravelToolPage';
import { LoraModel, LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';

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

export interface ShotEditorProps {
  selectedShot: Shot;
  projectId: string;
  videoPairConfigs: VideoPairConfig[];
  videoControlMode: 'individual' | 'batch';
  batchVideoPrompt: string;
  batchVideoFrames: number;
  batchVideoContext: number;
  orderedShotImages: GenerationRow[];
  onShotImagesUpdate: () => void;
  onBack: () => void;
  onVideoControlModeChange: (mode: 'individual' | 'batch') => void;
  onPairConfigChange: (pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => void;
  onBatchVideoPromptChange: (prompt: string) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoContextChange: (context: number) => void;
  batchVideoSteps: number;
  onBatchVideoStepsChange: (steps: number) => void;
  dimensionSource: 'project' | 'firstImage' | 'custom';
  onDimensionSourceChange: (source: 'project' | 'firstImage' | 'custom') => void;
  customWidth?: number;
  onCustomWidthChange: (width?: number) => void;
  customHeight?: number;
  onCustomHeightChange: (height?: number) => void;
  steerableMotionSettings: SteerableMotionSettings;
  onSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  onGenerateAllSegments: () => void;
  selectedLoras: ActiveLora[];
  onAddLora: (lora: LoraModel) => void;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  availableLoras: LoraModel[];
  isLoraModalOpen: boolean;
  setIsLoraModalOpen: (isOpen: boolean) => void;
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
  selectedLoras,
  onAddLora,
  onRemoveLora,
  onLoraStrengthChange,
  availableLoras,
  isLoraModalOpen,
  setIsLoraModalOpen,
}) => {
  const { selectedProjectId, projects } = useProject();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  const deleteGenerationMutation = useDeleteGeneration();
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

  useEffect(() => {
    if (selectedShot?.id) {
      localStorage.setItem(`shot-settings-${selectedShot.id}`, JSON.stringify(settingsToSave));
      localStorage.setItem('last-edited-shot-id', selectedShot.id);
    }
  }, [selectedShot?.id, settingsToSave]);

  const nonVideoImages = useMemo(() => {
    return localOrderedShotImages.filter(g => !isGenerationVideo(g));
  }, [localOrderedShotImages]);
  
  const videoOutputs = useMemo(() => {
    return localOrderedShotImages.filter(g => isGenerationVideo(g));
  }, [localOrderedShotImages]);

  const handleImageUploadToShot = async (files: File[]) => {
    if (!files || files.length === 0) return;
    if (!selectedProjectId || !selectedShot?.id) {
      toast.error("Cannot upload image: Project or Shot ID is missing.");
      return;
    }

    setIsUploadingImage(true);
    toast.info(`Uploading ${files.length} image(s)...`);

    const optimisticImages: GenerationRow[] = [];
    for (const file of files) {
      const tempId = nanoid();
      const optimisticImage: GenerationRow = {
        shotImageEntryId: tempId,
        id: tempId,
        imageUrl: URL.createObjectURL(file),
        thumbUrl: URL.createObjectURL(file),
        type: 'image',
        isOptimistic: true,
      };
      optimisticImages.push(optimisticImage);
    }

    setLocalOrderedShotImages(prev => [...prev, ...optimisticImages]);

    let successfulUploads = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const optimisticImage = optimisticImages[i];

      try {
        const imageUrl = await uploadImageToStorage(file);

        const promptForGeneration = `External image: ${file.name || 'untitled'}`;
        const genResponse = await fetch(`${baseUrl}/api/generations`, {
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

        const newShotImage = await addImageToShotMutation.mutateAsync({
          shot_id: selectedShot.id,
          generation_id: newGeneration.id,
          project_id: selectedProjectId,
          imageUrl: imageUrl,
          thumbUrl: imageUrl,
        });

        setLocalOrderedShotImages(prev =>
          prev.map(img => {
            if (img.shotImageEntryId === optimisticImage.shotImageEntryId) {
              const updatedImage: GenerationRow = {
                ...(newGeneration as Omit<GenerationRow, 'id' | 'shotImageEntryId'>),
                shotImageEntryId: newShotImage.id,
                id: newShotImage.generationId,
                isOptimistic: false,
              };
              return updatedImage;
            }
            return img;
          })
        );
        successfulUploads++;
      } catch (error: any) {
        console.error(`[ShotEditor] Error uploading one image: ${file.name}`, error);
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
        setLocalOrderedShotImages(prev => prev.filter(img => img.shotImageEntryId !== optimisticImage.shotImageEntryId));
      }
    }

    if (successfulUploads > 0) {
      toast.success(`${successfulUploads} image(s) uploaded and added successfully.`);
      onShotImagesUpdate();
    }
    
    setFileInputKey(Date.now());
    setIsUploadingImage(false);
  };

  const handleDeleteVideoOutput = async (generationId: string) => {
    if (!selectedShot || !selectedProjectId) {
      toast.error("No shot or project selected.");
      return;
    }
    setDeletingVideoId(generationId);
    
    try {
      // Optimistically remove the video from local state
      setLocalOrderedShotImages(prev => prev.filter(img => img.id !== generationId));
      
      // Delete the generation (this will show success/error toasts automatically)
      await deleteGenerationMutation.mutateAsync(generationId);
      
      // Refresh the shot data
      onShotImagesUpdate(); 
    } catch (error) {
      // Rollback the optimistic update on error
      setLocalOrderedShotImages(orderedShotImages);
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleDeleteImageFromShot = async (shotImageEntryId: string) => {
    if (!selectedShot || !selectedProjectId) {
      toast.error("Cannot delete image: No shot or project selected.");
      return;
    }

    // Optimistically remove the image from the local state
    setLocalOrderedShotImages(prev => prev.filter(img => img.shotImageEntryId !== shotImageEntryId));
    
    removeImageFromShotMutation.mutate({
      shot_id: selectedShot.id,
      shotImageEntryId: shotImageEntryId, // Use the unique entry ID
      project_id: selectedProjectId,
    }, {
      onError: () => {
        // Rollback on error
        setLocalOrderedShotImages(orderedShotImages);
      }
    });
  };

  const handleReorderImagesInShot = (orderedShotGenerationIds: string[]) => {
    if (!selectedShot || !selectedProjectId) {
      console.error('Cannot reorder images: No shot or project selected.');
      return;
    }
    
    // Optimistic update of local state
    const imageMap = new Map(localOrderedShotImages.map(img => [img.shotImageEntryId, img]));
    const reorderedImages = orderedShotGenerationIds
      .map(id => imageMap.get(id))
      .filter((img): img is GenerationRow => !!img);
    setLocalOrderedShotImages(reorderedImages);

    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedShotGenerationIds, // Pass the new array of IDs
      projectId: selectedProjectId,
    }, {
      onError: () => {
        // Rollback on error
        setLocalOrderedShotImages(orderedShotImages);
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

    if (nonVideoImages.length < 2) {
      toast.warning('Add at least two images to generate a travel video.');
      return;
    }

    setIsCreatingTask(true);
    setCreatingTaskId('batch');
    toast.info('Queuing travel-between-images task via API...');

    let resolution: string | undefined = undefined;

    if ((dimensionSource || 'firstImage') === 'firstImage' && nonVideoImages.length > 0) {
      try {
        const firstImage = nonVideoImages[0];
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
    // IMPORTANT: Use nonVideoImages to exclude generated video outputs
    const absoluteImageUrls = nonVideoImages
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

  const handleGenerateAll = () => {
    // Logic to prepare and generate all video segments
    console.log('Generate all segments clicked');
    // This would gather all configs and prompts and then trigger generation
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

      {/* Output Videos Section - Now at the top */}
      <div className="flex-shrink-0">
        <VideoOutputsGallery 
          videoOutputs={videoOutputs} 
          onDelete={handleDeleteVideoOutput}
          deletingVideoId={deletingVideoId}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row flex-grow gap-4 min-h-0">
        
        {/* Left Column: Image Manager */}
        <div className="flex flex-col lg:w-1/2 xl:w-1/2 gap-4 min-h-0">
          <Card className="flex-grow flex flex-col min-h-0">
            <CardHeader>
              <CardTitle>Manage Shot Images</CardTitle>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold tracking-tight">Images</h3>
              </div>
              <p className="text-sm text-muted-foreground pt-1">
                Drag to reorder. Cmd+click to select and move multiple images.
              </p>
            </CardHeader>
            <CardContent className="flex-grow overflow-y-auto">
              <div className="p-1">
                <ShotImageManager
                  images={nonVideoImages}
                  onImageDelete={handleDeleteImageFromShot}
                  onImageReorder={handleReorderImagesInShot}
                  columns={3}
                />
              </div>
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
        </div>

        {/* Right Column: Generation Settings */}
        <div className="lg:w-1/2 xl:w-1/2">
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
                
                <div className="space-y-4 py-6 border-t mt-6">
                   
                    <Button type="button" variant="outline" className="w-full" onClick={() => setIsLoraModalOpen(true)}>
                     Add or Manage LoRAs
                    </Button>
                    {availableLoras.length === 0 && !isLoraModalOpen && <p className="text-xs text-muted-foreground mt-1">Loading LoRA models for selection...</p>}
                    {selectedLoras.length > 0 && (
                      <TooltipProvider delayDuration={300}>
                        <div className="mt-4 space-y-4">
                          <h3 className="text-md font-semibold">Active LoRAs:</h3>
                          {selectedLoras.map((lora) => (
                            <div key={lora.id} className="p-3 border rounded-md shadow-sm bg-slate-50/50 dark:bg-slate-800/30">
                              <div className="flex items-start gap-3">
                                {lora.previewImageUrl && (
                                  <img 
                                    src={lora.previewImageUrl} 
                                    alt={`Preview for ${lora.name}`} 
                                    className="h-16 w-16 object-cover rounded-md border flex-shrink-0"
                                  />
                                )}
                                <div className="flex-grow min-w-0">
                                  <div className="flex justify-between items-start mb-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Label htmlFor={`lora-strength-${lora.id}`} className="text-sm font-medium truncate pr-2 cursor-help">
                                          {lora.name}
                                        </Label>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p>{lora.name}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Button variant="ghost" size="icon" onClick={() => onRemoveLora(lora.id)} className="text-destructive hover:bg-destructive/10 h-7 w-7 flex-shrink-0">
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <SliderWithValue 
                                    label={`Strength`}
                                    value={lora.strength}
                                    onChange={(newStrength) => onLoraStrengthChange(lora.id, newStrength)}
                                    min={0} max={100} step={1}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TooltipProvider>
                    )}
                </div>
                
                <div className="mt-0 pt-6 border-t">
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
      <LoraSelectorModal
        isOpen={isLoraModalOpen}
        onClose={() => setIsLoraModalOpen(false)}
        loras={availableLoras}
        onAddLora={onAddLora}
        selectedLoraIds={selectedLoras.map(l => l.id)}
        lora_type="Wan 2.1 14b"
      />
    </div>
  );
};

export default ShotEditor; 