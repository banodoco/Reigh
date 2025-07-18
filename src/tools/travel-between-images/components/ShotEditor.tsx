import React, { useState, useEffect, useMemo, useRef } from "react";
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
import { useAddImageToShot, useRemoveImageFromShot, useUpdateShotImageOrder, useHandleExternalImageDrop } from "@/shared/hooks/useShots";
import { useDeleteGeneration } from "@/shared/hooks/useGenerations";
import ShotImageManager from '@/shared/components/ShotImageManager';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Input } from "@/shared/components/ui/input";
import { ChevronsUpDown, Info, X } from 'lucide-react';
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { arrayMove } from '@dnd-kit/sortable';
import { getDisplayUrl } from '@/shared/lib/utils';
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';
import VideoOutputsGallery from "./VideoOutputsGallery";
import BatchSettingsForm from "./BatchSettingsForm";
import { LoraModel, LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { ActiveLoRAsDisplay, ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { cropImageToProjectAspectRatio } from '@/shared/lib/imageCropper';
import { parseRatio } from '@/shared/lib/aspectRatios';
// (Timeline related imports removed – now provided within the Timeline component file)

import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { useListTasks, useCancelTask, useCreateTask } from "@/shared/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from '@tanstack/react-query';

import SettingsModal from '@/shared/components/SettingsModal';
import Timeline from "@/tools/travel-between-images/components/Timeline";
import { useCreateGeneration, useUpdateGenerationLocation } from '@/shared/hooks/useGenerations';

// Add the missing type definition
export interface SegmentGenerationParams {
  prompts: string[];
  frames: number[];
  context: number[];
  generatedVideoUrl?: string;
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

export interface PairConfig {
  id: string;
  prompt: string;
  frames: number;
  negativePrompt: string;
  context: number;
}

export interface SteerableMotionSettings {
  negative_prompt: string;
  model_name: string;
  seed: number;
  debug: boolean;
  apply_reward_lora: boolean;
  colour_match_videos: boolean;
  apply_causvid: boolean;
  use_lighti2x_lora: boolean;
  fade_in_duration: string;
  fade_out_duration: string;
  after_first_post_generation_saturation: number;
  after_first_post_generation_brightness: number;
  show_input_images: boolean;
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
  enhancePrompt: boolean;
  generationMode?: 'batch' | 'by-pair';
  pairConfigs?: PairConfig[];
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

  generationMode: 'batch' | 'by-pair' | 'timeline';
  onGenerationModeChange: (mode: 'batch' | 'by-pair' | 'timeline') => void;
  enhancePrompt: boolean;
  onEnhancePromptChange: (enhance: boolean) => void;
  pairConfigs: PairConfig[];
  onPairConfigsChange: (configs: PairConfig[]) => void;
  // Navigation props
  onPreviousShot?: () => void;
  onNextShot?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  // Shot name editing
  onUpdateShotName?: (newName: string) => void;
}

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
  enhancePrompt,
  onEnhancePromptChange,
  generationMode,
  onGenerationModeChange,
  pairConfigs,
  onPairConfigsChange,
  onPreviousShot,
  onNextShot,
  hasPrevious,
  hasNext,
  onUpdateShotName,
}) => {
  const { selectedProjectId, projects } = useProject();
  const { getApiKey } = useApiKeys();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  const deleteGenerationMutation = useDeleteGeneration();
  const createGenerationMutation = useCreateGeneration();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();
  const [fileInputKey, setFileInputKey] = useState<number>(Date.now());
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  
  // Timeline frame positions for task creation
  const [timelineFramePositions, setTimelineFramePositions] = useState<Map<string, number>>(new Map());
  
  const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();

  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const skipNextSyncRef = useRef(false);
  const isMobile = useIsMobile();

  // Ensure mobile users are always in batch generation mode
  useEffect(() => {
    if (isMobile && generationMode !== 'batch') {
      onGenerationModeChange('batch');
    }
  }, [isMobile, generationMode]);

  
  // Shot name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(selectedShot.name);

  // Update editing name when selected shot changes
  useEffect(() => {
    setEditingName(selectedShot.name);
    setIsEditingName(false);
  }, [selectedShot.id, selectedShot.name]);

  const handleNameClick = () => {
    if (onUpdateShotName) {
      setIsEditingName(true);
    }
  };

  const handleNameSave = () => {
    if (onUpdateShotName && editingName.trim() && editingName.trim() !== selectedShot.name) {
      onUpdateShotName(editingName.trim());
    }
    setIsEditingName(false);
  };

  const handleNameCancel = () => {
    setEditingName(selectedShot.name);
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  };

  // Use local state for optimistic updates on image list
  const [localOrderedShotImages, setLocalOrderedShotImages] = useState(orderedShotImages || []);
  useEffect(() => {
    // Skip sync if we just finished uploading to prevent flicker
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    
    // Only sync from props if we are not in the middle of an upload.
    // The upload function will be the source of truth during the upload process.
    if (!isUploadingImage) {
      setLocalOrderedShotImages(orderedShotImages || []);
    }
  }, [orderedShotImages, isUploadingImage]);

  // Settings are now loaded from the database via the parent component
  // This effect is removed as settings persistence is handled by VideoTravelToolPage

  // Settings persistence is now handled by the parent component via database

  const nonVideoImages = useMemo(() => {
    return localOrderedShotImages.filter(g => !isGenerationVideo(g));
  }, [localOrderedShotImages]);
  
  const videoOutputs = useMemo(() => {
    return localOrderedShotImages.filter(g => isGenerationVideo(g));
  }, [localOrderedShotImages]);

  useEffect(() => {
    const newPairConfigs = nonVideoImages.slice(0, -1).map((image, index) => {
      const nextImage = nonVideoImages[index + 1];
      const pairId = `${image.id}-${nextImage.id}`;
      
      const existingConfig = pairConfigs.find(p => p.id === pairId);
      
      return existingConfig || {
        id: pairId,
        prompt: '',
        frames: batchVideoFrames,
        negativePrompt: '',
        context: 16,
      };
    });
    
    // Only update if the configs have actually changed
    const newConfigsStr = JSON.stringify(newPairConfigs);
    const currentConfigsStr = JSON.stringify(pairConfigs);
    if (newConfigsStr !== currentConfigsStr) {
      onPairConfigsChange(newPairConfigs);
    }
  }, [nonVideoImages, batchVideoFrames, batchVideoContext]); // Remove pairConfigs from deps to prevent loop

  const {
    settings: uploadSettings,
  } = useToolSettings<{ cropToProjectSize?: boolean }>('upload', { projectId: selectedProjectId });

  const handleImageUploadToShot = async (files: File[]) => {
    if (!files || files.length === 0) return;
    if (!selectedProjectId || !selectedShot?.id) {
      toast.error("Cannot upload image: Project or Shot ID is missing.");
      return;
    }

    setIsUploadingImage(true);
    toast.info(`Uploading ${files.length} image(s)...`);

    // Determine if cropping is enabled via project settings (toolSettings)
    const cropToProjectSize = (uploadSettings?.cropToProjectSize ?? true);
    let projectAspectRatio: number | null = null;
    if (cropToProjectSize) {
      const currentProject = projects.find(p => p.id === selectedProjectId);
      const aspectRatioStr = currentProject?.aspectRatio || (currentProject as any)?.settings?.aspectRatio;
      if (currentProject && aspectRatioStr) {
        projectAspectRatio = parseRatio(aspectRatioStr);
        if (isNaN(projectAspectRatio)) {
          toast.error(`Invalid project aspect ratio: ${aspectRatioStr}`);
          setIsUploadingImage(false);
          return;
        }
      } else {
        toast.error("Cannot crop to project size: Project aspect ratio not found.");
        setIsUploadingImage(false);
        return;
      }
    }

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

    const uploadPromises = files.map(async (file, i) => {
      const optimisticImage = optimisticImages[i];
      try {
        let fileToUpload = file;
        let croppedImageUrl: string | undefined;

        if (cropToProjectSize && projectAspectRatio) {
          const cropResult = await cropImageToProjectAspectRatio(file, projectAspectRatio);
          if (cropResult) {
            fileToUpload = cropResult.croppedFile;
            croppedImageUrl = cropResult.croppedImageUrl;
          } else {
            toast.warning(`Failed to crop image: ${file.name}. Using original image.`);
          }
        }

        const imageUrl = await uploadImageToStorage(fileToUpload);
        const finalImageUrl = croppedImageUrl ? getDisplayUrl(imageUrl) : imageUrl;

        const promptForGeneration = `External image: ${file.name || 'untitled'}`;

        // Support environments without API server (e.g., static web build)
        const currentEnv = import.meta.env.VITE_APP_ENV?.toLowerCase() || 'web';
        let newGeneration: any;

        if (currentEnv === 'web') {
          // Directly insert into Supabase instead of hitting the API server
          const { data: inserted, error } = await supabase
            .from('generations')
            .insert({
              location: finalImageUrl,
              type: file.type || 'image',
              project_id: selectedProjectId,
              params: {
                prompt: promptForGeneration,
                source: 'external_upload',
                original_filename: file.name,
                file_type: file.type,
                file_size: file.size,
              },
            })
            .select()
            .single();

          if (error || !inserted) throw error || new Error('Failed to create generation');
          newGeneration = inserted;
        } else {
          // Use the new Supabase-based hook for all environments
          newGeneration = await createGenerationMutation.mutateAsync({
            imageUrl: finalImageUrl,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            projectId: selectedProjectId,
            prompt: promptForGeneration,
          });
        }

        // Save link in DB (ignore returned shotImageEntryId for UI key stability)
        await addImageToShotMutation.mutateAsync({
          shot_id: selectedShot.id,
          generation_id: newGeneration.id,
          project_id: selectedProjectId,
          imageUrl: finalImageUrl,
          thumbUrl: finalImageUrl,
        });

        const finalImage: GenerationRow = {
          ...(newGeneration as Omit<GenerationRow, 'id' | 'shotImageEntryId'>),
          // Preserve the optimistic shotImageEntryId so React key stays stable
          shotImageEntryId: optimisticImage.shotImageEntryId,
          id: newGeneration.id,
          isOptimistic: false,
          imageUrl: finalImageUrl, // Ensure final URL is used
          thumbUrl: finalImageUrl,
        };
        
        return { optimisticId: optimisticImage.shotImageEntryId, finalImage, success: true };
      } catch (error: any) {
        console.error(`[ShotEditor] Error uploading one image: ${file.name}`, error);
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
        return { optimisticId: optimisticImage.shotImageEntryId, success: false };
      }
    });

    const results = await Promise.all(uploadPromises);

    // Build the final images array after processing results
    let updatedImages = [...localOrderedShotImages];
    results.forEach(result => {
      if (result.success) {
        const idx = updatedImages.findIndex(img => img.shotImageEntryId === result.optimisticId);
        if (idx !== -1) {
          updatedImages[idx] = result.finalImage!;
        }
      } else {
        updatedImages = updatedImages.filter(img => img.shotImageEntryId !== result.optimisticId);
      }
    });

    // Apply the single state update
    setLocalOrderedShotImages(updatedImages);

    const successfulUploads = results.filter(r => r.success).length;
    if (successfulUploads > 0) {      
      // Update parent cache directly to avoid refetch-based reordering
      if (selectedProjectId) {
        queryClient.setQueryData<Shot[]>(['shots', selectedProjectId], (oldShots = []) => {
          return oldShots.map(shot => {
            if (shot.id !== selectedShot.id) return shot;
            return { ...shot, images: updatedImages };
          });
        });
      }
    }
    
    setFileInputKey(Date.now());
    skipNextSyncRef.current = true; // Skip the next prop sync to prevent flicker
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

    // Preserve existing video outputs so they don't disappear during re-order
    const videoImages = localOrderedShotImages.filter(img => isGenerationVideo(img));
    const combinedImages = [...reorderedImages, ...videoImages];
    setLocalOrderedShotImages(combinedImages);

    // Include video images when sending the new order to the backend so their positions remain stable
    const combinedIds = [...orderedShotGenerationIds, ...videoImages.map(v => v.shotImageEntryId)];

    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedShotGenerationIds: combinedIds,
      projectId: selectedProjectId,
    }, {
      onError: () => {
        // Rollback on error
        setLocalOrderedShotImages(orderedShotImages);
      }
    });
  };

  const handleImageSaved = async (imageId: string, newImageUrl: string) => {
    console.log(`[ShotEditor-HandleImageSaved] Starting image update process:`, { imageId, newImageUrl, shotId: selectedShot.id });
    
    try {
      // Update the database record via local API
      console.log(`[ShotEditor-HandleImageSaved] Updating database record for image:`, imageId);
      await updateGenerationLocationMutation.mutateAsync({
        id: imageId,
        location: newImageUrl,
      });

      console.log(`[ShotEditor-HandleImageSaved] Database update successful for image:`, imageId);

      // Update local state with cache-busting for immediate UI update
      console.log(`[ShotEditor-HandleImageSaved] Updating local state...`);
      // Use getDisplayUrl with forceRefresh to ensure immediate update
      const cacheBustedUrl = getDisplayUrl(newImageUrl, true);
      setLocalOrderedShotImages(prevImages => {
        const updated = prevImages.map(img => 
          img.id === imageId 
            ? { ...img, imageUrl: cacheBustedUrl, thumbUrl: cacheBustedUrl } 
            : img
        );
        console.log(`[ShotEditor-HandleImageSaved] Local state updated. Found image to update:`, updated.some(img => img.id === imageId));
        return updated;
      });

      // Invalidate relevant queries to ensure fresh data
      console.log(`[ShotEditor-HandleImageSaved] Invalidating React Query cache...`);
      queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['generations', selectedProjectId] });

      console.log(`[ShotEditor-HandleImageSaved] Complete process finished successfully`);
    
    } catch (error) {
      console.error("[ShotEditor-HandleImageSaved] Unexpected error:", error);
      toast.error("Failed to update image.");
    }
  };

  const handleGenerateBatch = async () => {
    if (!projectId) {
      toast.error('No project selected. Please select a project first.');
      return;
    }

    if (nonVideoImages.length < 2) {
      toast.warning('Add at least two images to generate a travel video.');
      return;
    }

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
      return;
    }

    let basePrompts: string[];
    let segmentFrames: number[];
    let frameOverlap: number[];
    let negativePrompts: string[];

    if (generationMode === 'timeline') {
      // Extract frame gaps from timeline positions
      const sortedPositions = [...timelineFramePositions.entries()]
        .map(([id, pos]) => ({ id, pos }))
        .sort((a, b) => a.pos - b.pos);
      
      const frameGaps = [];
      for (let i = 0; i < sortedPositions.length - 1; i++) {
        const gap = sortedPositions[i + 1].pos - sortedPositions[i].pos;
        frameGaps.push(gap);
      }
      
      basePrompts = frameGaps.length > 0 ? frameGaps.map(() => batchVideoPrompt) : [batchVideoPrompt];
      segmentFrames = frameGaps.length > 0 ? frameGaps : [batchVideoFrames];
      frameOverlap = frameGaps.length > 0 ? frameGaps.map(() => batchVideoContext) : [batchVideoContext];
      negativePrompts = frameGaps.length > 0 ? frameGaps.map(() => steerableMotionSettings.negative_prompt) : [steerableMotionSettings.negative_prompt];
    } else if (generationMode === 'batch') {
      basePrompts = [batchVideoPrompt];
      segmentFrames = [batchVideoFrames];
      frameOverlap = [batchVideoContext];
      negativePrompts = [steerableMotionSettings.negative_prompt];
    } else {
      // by-pair mode
      basePrompts = pairConfigs.map((cfg) => cfg.prompt);
      segmentFrames = pairConfigs.map((cfg) => cfg.frames);
      frameOverlap = pairConfigs.map((cfg) => cfg.context);
      negativePrompts = pairConfigs.map((cfg) => cfg.negativePrompt);
    }

    const requestBody: any = {
      project_id: projectId,
      shot_id: selectedShot.id,
      image_urls: absoluteImageUrls,
      base_prompts: basePrompts,
      segment_frames: segmentFrames,
      frame_overlap: frameOverlap,
      negative_prompts: negativePrompts,
      model_name: steerableMotionSettings.model_name,
      seed: steerableMotionSettings.seed,
      debug: steerableMotionSettings.debug,
      apply_reward_lora: steerableMotionSettings.apply_reward_lora,
      colour_match_videos: steerableMotionSettings.colour_match_videos ?? true,
      apply_causvid: steerableMotionSettings.apply_causvid ?? true,
      use_lighti2x_lora: steerableMotionSettings.use_lighti2x_lora ?? false,
      fade_in_duration: steerableMotionSettings.fade_in_duration,
      fade_out_duration: steerableMotionSettings.fade_out_duration,
      after_first_post_generation_saturation: steerableMotionSettings.after_first_post_generation_saturation,
      after_first_post_generation_brightness: steerableMotionSettings.after_first_post_generation_brightness,
      params_json_str: JSON.stringify({ steps: batchVideoSteps }),
      enhance_prompt: enhancePrompt,
      openai_api_key: enhancePrompt ? openaiApiKey : '',
      show_input_images: steerableMotionSettings.show_input_images,
    };

    if (selectedLoras && selectedLoras.length > 0) {
      requestBody.loras = selectedLoras.map(l => ({ 
        path: l.path, 
        strength: parseFloat(l.strength?.toString() ?? '0') || 0.0 
      }));
    }

    if (resolution) {
      requestBody.resolution = resolution;
    }
    
    createTask({
      functionName: 'steerable-motion',
      payload: requestBody,
    });
  };

  const handleGenerateAll = () => {
    // Logic to prepare and generate all video segments
    console.log('Generate all segments clicked');
    // This would gather all configs and prompts and then trigger generation
  };

  const handleApplySettingsFromTaskNew = async (taskId: string, replaceImages: boolean, inputImages: string[]) => {
    try {
      // Fetch the task details directly from Supabase
      const { data: task, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error || !task) {
        throw new Error(`Task not found: ${error?.message || 'Unknown error'}`);
      }
      
      // Extract settings from task params (same logic as the deprecated Express API)
      const params = task.params as any;
      const orchestratorDetails = params?.full_orchestrator_payload ?? params?.orchestrator_details;
      
      const settings = {
        videoControlMode: 'batch' as const,
        batchVideoPrompt: orchestratorDetails?.base_prompts?.[0] || params?.prompt || '',
        batchVideoFrames: orchestratorDetails?.segment_frames?.[0] || params?.frames || 24,
        batchVideoContext: orchestratorDetails?.frame_overlap?.[0] || params?.context || 16,
        batchVideoSteps: (() => {
          // Priority: explicit params.steps, override JSON, orchestratorDetails fields, fallback 20
          if (typeof params?.steps === 'number') return params.steps;

          // Parse params_json_str_override if present to extract steps
          let overrideSteps: number | undefined;
          const overrideStr = orchestratorDetails?.params_json_str_override ?? params?.params_json_str_override;
          if (overrideStr && typeof overrideStr === 'string') {
            try {
              const parsed = JSON.parse(overrideStr);
              if (typeof parsed?.steps === 'number') overrideSteps = parsed.steps;
            } catch { /* ignore JSON parse errors */ }
          }

          if (overrideSteps) return overrideSteps;

          if (typeof orchestratorDetails?.steps === 'number') return orchestratorDetails.steps;
          if (typeof orchestratorDetails?.num_inference_steps === 'number') return orchestratorDetails.num_inference_steps;

          return 20;
        })(),
        dimensionSource: 'custom' as const,
        ...(() => {
          // Parse resolution (e.g., "902x508") into width & height numbers
          const res = orchestratorDetails?.parsed_resolution_wh ?? params?.parsed_resolution_wh;
          if (typeof res === 'string' && res.includes('x')) {
            const [w, h] = res.split('x').map((n: string) => parseInt(n, 10));
            return { customWidth: w, customHeight: h };
          }
          if (Array.isArray(res) && res.length === 2) {
            const [w, h] = res;
            return { customWidth: w, customHeight: h };
          }
          return { customWidth: params?.width, customHeight: params?.height };
        })(),
        enhancePrompt: params?.enhance_prompt || false,
        generationMode: 'batch' as const,
        // Expose the LoRAs (url + strength) so the client can attach them
        loras: Object.entries(orchestratorDetails?.additional_loras || {}).map(([url, strength]) => ({ url, strength })),
        steerableMotionSettings: {
          negative_prompt: orchestratorDetails?.negative_prompt || params?.negative_prompt || '',
          model_name: params?.model_name || 'vace_14B',
          seed: params?.seed || 789,
          debug: params?.debug ?? true,
          apply_reward_lora: params?.apply_reward_lora ?? false,
          colour_match_videos: params?.colour_match_videos ?? true,
          apply_causvid: params?.apply_causvid ?? true,
          use_lighti2x_lora: params?.use_lighti2x_lora ?? false,
          fade_in_duration: params?.fade_in_duration || '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
          fade_out_duration: params?.fade_out_duration || '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
          after_first_post_generation_saturation: params?.after_first_post_generation_saturation ?? 1,
          after_first_post_generation_brightness: params?.after_first_post_generation_brightness ?? 0,
          show_input_images: params?.show_input_images ?? false,
        },
        // Check if this is a by-pair generation
        ...(orchestratorDetails?.base_prompts_expanded && orchestratorDetails.base_prompts_expanded.length > 1 ? {
          generationMode: 'by-pair' as const,
          pairConfigs: orchestratorDetails.base_prompts_expanded.map((prompt: string, i: number) => ({
            id: `pair-${i}`,
            prompt,
            frames: orchestratorDetails.segment_frames_expanded?.[i] || 24,
            negativePrompt: orchestratorDetails.negative_prompts_expanded?.[i] || '',
            context: orchestratorDetails.frame_overlap_expanded?.[i] || 16,
          }))
        } : {})
      };
      
      // Apply the settings
      onVideoControlModeChange(settings.videoControlMode || 'batch');
      onBatchVideoPromptChange(settings.batchVideoPrompt || '');
      onBatchVideoFramesChange(settings.batchVideoFrames || 24);
      onBatchVideoContextChange(settings.batchVideoContext || 16);
      onBatchVideoStepsChange(settings.batchVideoSteps || 20);
      onDimensionSourceChange(settings.dimensionSource || 'custom');
      if (settings.customWidth) onCustomWidthChange(settings.customWidth);
      if (settings.customHeight) onCustomHeightChange(settings.customHeight);
      onEnhancePromptChange(settings.enhancePrompt || false);
      onGenerationModeChange(settings.generationMode || 'batch');
      if (settings.pairConfigs) onPairConfigsChange(settings.pairConfigs);
      if (settings.steerableMotionSettings) {
        onSteerableMotionSettingsChange(settings.steerableMotionSettings);
      }

      // Apply LoRAs if provided in settings
      if (settings.loras && Array.isArray(settings.loras) && settings.loras.length > 0) {
        settings.loras.forEach((l: any) => {
          const url: string = l.url || l.path;
          const strength: number = parseFloat(l.strength?.toString() || '0') || 0;

          // Try to find matching LoRA in availableLoras by matching any file URL or huggingface URL
          const matching = availableLoras.find(av =>
            av["Model Files"].some((f: any) => f.url === url || f.path === url) ||
            av.huggingface_url === url
          );

          if (matching) {
            onAddLora(matching);
            // Wait a tick so it's added before updating strength
            setTimeout(() => onLoraStrengthChange(matching["Model ID"], strength), 0);
          } else {
            // Fallback: derive a name from filename and add a minimal LoraModel-like object
            const fileName = url.split('/').pop() || url;
            const derivedId = fileName.replace(/\.(safetensors|ckpt|pt)$/i, '');
            onAddLora({
              "Model ID": derivedId,
              Name: derivedId,
              Author: 'Imported',
              Images: [],
              "Model Files": [{ path: url, url }],
              huggingface_url: url,
              lora_type: 'motion',
            } as any);
            setTimeout(() => onLoraStrengthChange(derivedId, strength), 0);
          }
        });
      }
      
      // Handle image replacement if requested
      if (replaceImages && inputImages && inputImages.length > 0) {
        await handleReplaceImagesFromTask(inputImages);
      }
      

    } catch (error) {
      console.error('Error applying settings from task:', error);
      toast.error('Failed to apply settings from task');
    }
  };

  const handleApplySettingsFromTask = (settings: {
    prompt?: string;
    prompts?: string[];
    negativePrompt?: string;
    negativePrompts?: string[];
    steps?: number;
    frame?: number;
    frames?: number[];
    context?: number;
    contexts?: number[];
    width?: number;
    height?: number;
    replaceImages?: boolean;
    inputImages?: string[];
  }) => {
    // Check if there are multiple unique prompts or frame counts
    const uniquePrompts = settings.prompts ? [...new Set(settings.prompts)] : [];
    const uniqueFrames = settings.frames ? [...new Set(settings.frames)] : [];
    
    const isByPair = uniquePrompts.length > 1 || uniqueFrames.length > 1;

    if (isByPair) {
      onGenerationModeChange('by-pair');
      
      // Create pair configs from the settings
      const imagePairsCount = Math.max(0, nonVideoImages.length - 1);
      const newPairConfigs: PairConfig[] = [];
      
      for (let i = 0; i < imagePairsCount; i++) {
        const pairId = i < nonVideoImages.length - 1 ? 
          `${nonVideoImages[i].id}-${nonVideoImages[i + 1].id}` : 
          `pair-${i}`;
        
        newPairConfigs.push({
          id: pairId,
          prompt: settings.prompts?.[i] || settings.prompt || '',
          frames: settings.frames?.[i] || settings.frame || batchVideoFrames,
          negativePrompt: settings.negativePrompts?.[i] || settings.negativePrompt || '',
          context: settings.contexts?.[i] || settings.context || 16,
        });
      }
              onPairConfigsChange(newPairConfigs);
    } else {
      // Default to batch mode for timeline or single settings
      onGenerationModeChange('batch');
      
      // Apply single values to batch settings
      if (settings.prompt) {
        onBatchVideoPromptChange(settings.prompt);
      }
      if (settings.frame !== undefined) {
        onBatchVideoFramesChange(settings.frame);
      }
      if (settings.context !== undefined) {
        onBatchVideoContextChange(settings.context);
      }
    }

    // Apply other settings
    if (settings.negativePrompt && !isByPair) {
      onSteerableMotionSettingsChange({ negative_prompt: settings.negativePrompt });
    }
    if (settings.steps) {
      onBatchVideoStepsChange(settings.steps);
    }
    if (settings.width && settings.height) {
      onDimensionSourceChange('custom');
      onCustomWidthChange(settings.width);
      onCustomHeightChange(settings.height);
    }

    // Handle image replacement
    if (settings.replaceImages && settings.inputImages && settings.inputImages.length > 0) {
      handleReplaceImagesFromTask(settings.inputImages);
    }


  };

  const handleReplaceImagesFromTask = async (inputImages: string[]) => {
    if (!selectedShot?.id || !selectedProjectId) {
      toast.error("Cannot replace images: Shot or Project ID is missing.");
      return;
    }

    try {
      toast.info(`Replacing images with ${inputImages.length} images from previous generation...`);
      
      // First, remove all current non-video images
      const imagesToRemove = nonVideoImages.map(img => img.shotImageEntryId);
      
      // Optimistically update to remove old images
      setLocalOrderedShotImages(prev => prev.filter(img => isGenerationVideo(img)));
      
      // Remove existing images from the shot
      for (const shotImageEntryId of imagesToRemove) {
        await removeImageFromShotMutation.mutateAsync({
          shot_id: selectedShot.id,
          shotImageEntryId: shotImageEntryId,
          project_id: selectedProjectId,
        });
      }

      // Add the new images from the task
      const newGenerationRows: GenerationRow[] = [];
      for (let i = 0; i < inputImages.length; i++) {
        const imageUrl = inputImages[i];
        
        // Create a generation record for the input image
        const promptForGeneration = `Input image from task ${i + 1}`;

        const currentEnv = import.meta.env.VITE_APP_ENV?.toLowerCase() || 'web';
        let newGeneration: any;

        if (currentEnv === 'web') {
          const { data: inserted, error } = await supabase
            .from('generations')
            .insert({
              location: imageUrl,
              type: 'image',
              project_id: projectId,
              params: {
                prompt: promptForGeneration,
                source: 'task_input',
              },
            })
            .select()
            .single();

          if (error || !inserted) throw error || new Error('Failed to create generation');
          newGeneration = inserted;
        } else {
          // Use the new Supabase-based hook for all environments
          newGeneration = await createGenerationMutation.mutateAsync({
            imageUrl: imageUrl,
            fileName: `input-image-${i + 1}`,
            fileType: 'image/jpeg', // Placeholder, adjust if needed
            fileSize: 0, // Placeholder, adjust if needed
            projectId: projectId,
            prompt: promptForGeneration,
          });
        }

        // Add the generation to the shot
        const newShotImage = await addImageToShotMutation.mutateAsync({
          shot_id: selectedShot.id,
          generation_id: newGeneration.id,
          project_id: selectedProjectId,
          imageUrl: imageUrl,
          thumbUrl: imageUrl,
        });

        const newGenerationRow: GenerationRow = {
          ...(newGeneration as Omit<GenerationRow, 'id' | 'shotImageEntryId'>),
          shotImageEntryId: newShotImage.id,
          id: (newShotImage as any).generationId ?? (newShotImage as any).generation_id,
          isOptimistic: false,
        };
        newGenerationRows.push(newGenerationRow);
      }

      // Update local state with new images
      setLocalOrderedShotImages(prev => {
        const videoImages = prev.filter(img => isGenerationVideo(img));
        return [...newGenerationRows, ...videoImages];
      });

      // Refresh the shot data
      onShotImagesUpdate();
      

    } catch (error: any) {
      console.error('Error replacing images:', error);
      toast.error(`Failed to replace images: ${error.message}`);
      // Revert optimistic update on error
      setLocalOrderedShotImages(orderedShotImages);
    }
  };

  // Check if generation should be disabled due to missing OpenAI API key for enhance prompt
  const openaiApiKey = getApiKey('openai_api_key');
  const isGenerationDisabledDueToApiKey = enhancePrompt && (!openaiApiKey || openaiApiKey.trim() === '');
  const isGenerationDisabled = isCreatingTask || nonVideoImages.length < 2 || isGenerationDisabledDueToApiKey;

  const handleUpdatePairConfig = (
    id: string,
    field: 'prompt' | 'frames' | 'negativePrompt' | 'context',
    value: string | number
  ) => {
    let updatedConfigs: PairConfig[];

    // Find if the pair already exists
    const existingIndex = pairConfigs.findIndex((p) => p.id === id);

    if (existingIndex !== -1) {
      // Update the existing pair config
      updatedConfigs = pairConfigs.map((pair) =>
        pair.id === id ? { ...pair, [field]: value } : pair
      );
    } else {
      // Create a new pair config with sensible defaults, then apply the field
      const newConfig: PairConfig = {
        id,
        prompt: '',
        negativePrompt: '',
        frames: 30,
        context: 16,
      };
      (newConfig as any)[field] = value; // apply the first edited field

      updatedConfigs = [...pairConfigs, newConfig];
    }

    onPairConfigsChange(updatedConfigs);
  };

  return (
    <div className="flex flex-col space-y-4 pb-16">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-wrap justify-between items-center gap-y-2 px-2">
        <Button onClick={onBack}>&larr; Back to Shot List</Button>
        <div className="hidden sm:flex items-center space-x-2 min-w-0 flex-1 justify-center px-4">
          <span className="hidden sm:inline text-2xl font-bold">Editing Shot:</span>
          {isEditingName ? (
            <div className="flex items-center space-x-2">
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={handleNameSave}
                className="text-2xl font-bold text-primary h-auto py-1 px-2 min-w-[200px]"
                autoFocus
                maxLength={30}
              />
              <Button size="sm" variant="outline" onClick={handleNameSave}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={handleNameCancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <span 
              className={`text-2xl font-bold text-primary truncate ${onUpdateShotName ? 'cursor-pointer hover:underline' : ''}`}
              onClick={handleNameClick}
              title={onUpdateShotName ? "Click to edit shot name" : undefined}
            >
              {selectedShot.name}
            </span>
          )}
        </div>
        <div className="flex flex-row items-center space-x-2">
          {(hasPrevious || hasNext) && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onPreviousShot}
                disabled={!hasPrevious}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onNextShot}
                disabled={!hasNext}
              >
                Next
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Output Videos Section - Now at the top */}
      <div className="">
        <VideoOutputsGallery 
          videoOutputs={videoOutputs} 
          onDelete={handleDeleteVideoOutput}
          deletingVideoId={deletingVideoId}
          onApplySettings={handleApplySettingsFromTask}
          onApplySettingsFromTask={handleApplySettingsFromTaskNew}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-4">
        
        {/* Image Manager */}
        <div className="flex flex-col w-full gap-4">
          <Card className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Manage Shot Images</CardTitle>
                {!isMobile && (
                  <div className="flex items-center space-x-2">
                    <ToggleGroup type="single" value={generationMode} onValueChange={(value: 'batch' | 'by-pair' | 'timeline') => value && onGenerationModeChange(value)} size="sm">
                      <ToggleGroupItem value="batch" aria-label="Toggle batch">
                        Batch
                      </ToggleGroupItem>
   
                      <ToggleGroupItem value="timeline" aria-label="Toggle timeline">
                        Timeline
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                )}
              </div>
              {nonVideoImages.length > 0 && (
                <>
                  <p className="text-sm text-muted-foreground pt-1">
                    {isMobile 
                      ? 'Tap to select and move multiple images.'
                      : generationMode === 'timeline' 
                        ? 'Drag images to precise frame positions. Drop on other images to reorder.'
                        : 'Drag to reorder. Cmd+click to select and move multiple images.'
                    }
                  </p>
                </>
              )}
            </CardHeader>
            <CardContent className={nonVideoImages.length > 0 ? "" : ""}>
              <div className="p-1">
                {generationMode === 'timeline' ? (
                  <Timeline
                    shotId={selectedShot.id}
                    images={nonVideoImages}
                    frameSpacing={batchVideoFrames}
                    contextFrames={batchVideoContext}
                    onImageReorder={handleReorderImagesInShot}
                    onImageSaved={handleImageSaved}
                    onContextFramesChange={onBatchVideoContextChange}
                    onFramePositionsChange={setTimelineFramePositions}
                  />
                ) : (
                  <ShotImageManager
                    images={nonVideoImages}
                    onImageDelete={handleDeleteImageFromShot}
                    onImageReorder={handleReorderImagesInShot}
                    columns={isMobile ? 3 : 6}
                    generationMode={isMobile ? 'batch' : generationMode}
                    pairConfigs={pairConfigs}
                    onPairConfigChange={handleUpdatePairConfig}
                    onImageSaved={handleImageSaved}
                  />
                )}
              </div>
            </CardContent>
            <div className="p-4 border-t space-y-3">
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

        {/* Generation Settings */}
        <div className="w-full">
          <Card>
            <CardHeader>
                <CardTitle>Travel Between Images</CardTitle>
                <p className="text-sm text-muted-foreground pt-1">Configure and generate video segments between the images in this shot.</p>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left Column: Main Settings */}
                    <div className="flex-1 order-2 lg:order-1">
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
                            selectedLoras={selectedLoras}
                            availableLoras={availableLoras}
                            isTimelineMode={generationMode === 'timeline'}
                        />
                        
                        {/* LoRA Settings (Mobile) */}
                        <div className="block lg:hidden mt-6">
                            <div className="space-y-4 p-4 border rounded-lg bg-card">
                                <h3 className="font-semibold text-sm">LoRA Models</h3>
                                
                                <Button type="button" variant="outline" className="w-full" onClick={() => setIsLoraModalOpen(true)}>
                                    Add or Manage LoRAs
                                </Button>
                                
                                <ActiveLoRAsDisplay
                                    selectedLoras={selectedLoras}
                                    onRemoveLora={onRemoveLora}
                                    onLoraStrengthChange={onLoraStrengthChange}
                                    availableLoras={availableLoras}
                                    className="mt-4"
                                />
                            </div>
                        </div>
                        
                        <div className="mt-6 pt-6 border-t">
                            <Button 
                                size="lg" 
                                className="w-full" 
                                onClick={handleGenerateBatch} 
                                disabled={isGenerationDisabled}
                            >
                                {isCreatingTask ? 'Creating Tasks...' : 'Generate Video'}
                            </Button>
                            {nonVideoImages.length < 2 && <p className="text-xs text-center text-muted-foreground mt-2">You need at least two images to generate videos.</p>}
                            {isGenerationDisabledDueToApiKey && (
                              <p className="text-xs text-center text-muted-foreground mt-2">
                                If Enhance Prompt is enabled, you must add an{' '}
                                <button 
                                  onClick={() => setIsSettingsModalOpen(true)}
                                  className="underline text-blue-600 hover:text-blue-800 cursor-pointer"
                                >
                                  OpenAI API key
                                </button>
                              </p>
                            )}
                        </div>
                    </div>

                    {/* Right Column: LoRA Settings (Desktop) */}
                    <div className="hidden lg:block lg:w-80 order-1 lg:order-2">
                        <div className="space-y-4 p-4 border rounded-lg bg-card">
                            <h3 className="font-semibold text-sm">LoRA Models</h3>
                            
                            <Button type="button" variant="outline" className="w-full" onClick={() => setIsLoraModalOpen(true)}>
                                Add or Manage LoRAs
                            </Button>
                            
                            <ActiveLoRAsDisplay
                                selectedLoras={selectedLoras}
                                onRemoveLora={onRemoveLora}
                                onLoraStrengthChange={onLoraStrengthChange}
                                availableLoras={availableLoras}
                                className="mt-4"
                            />
                        </div>
                    </div>
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
        onRemoveLora={onRemoveLora}
        onUpdateLoraStrength={onLoraStrengthChange}
        selectedLoras={selectedLoras.map(lora => {
          const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
          return {
            ...fullLora,
            "Model ID": lora.id,
            Name: lora.name,
            strength: lora.strength,
          } as LoraModel & { strength: number };
        })}
        lora_type="Wan 2.1 14b"
      />
      
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onOpenChange={setIsSettingsModalOpen}
      />
    </div>
  );
};

export default ShotEditor; 