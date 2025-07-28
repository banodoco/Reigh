import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
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
import { useAddImageToShot, useRemoveImageFromShot, useUpdateShotImageOrder, useHandleExternalImageDrop, useDuplicateImageInShot } from "@/shared/hooks/useShots";
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
import { Skeleton } from '@/shared/components/ui/skeleton';
import { usePanes } from '@/shared/contexts/PanesContext';
import Timeline from '@/tools/travel-between-images/components/Timeline';

import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { useListTasks, useCancelTask } from "@/shared/hooks/useTasks";
import { useTaskQueueNotifier } from "@/shared/hooks/useTaskQueueNotifier";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from '@tanstack/react-query';

import SettingsModal from '@/shared/components/SettingsModal';
// Removed React.lazy for Timeline – imported above eagerly.
import { useCreateGeneration, useUpdateGenerationLocation } from '@/shared/hooks/useGenerations';
import { useUnpositionedGenerationsCount } from '@/shared/hooks/useShotGenerations';

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
  generationMode?: 'batch' | 'timeline';
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

  generationMode: 'batch' | 'timeline';
  onGenerationModeChange: (mode: 'batch' | 'timeline') => void;
  enhancePrompt: boolean;
  onEnhancePromptChange: (enhance: boolean) => void;
  // Navigation props
  onPreviousShot?: () => void;
  onNextShot?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  // Shot name editing
  onUpdateShotName?: (newName: string) => void;
  // After each prompt text
  afterEachPromptText?: string;
  onAfterEachPromptTextChange?: (text: string) => void;

  // Indicates if parent is still loading settings. Manage Shot Images should wait until this is false.
  settingsLoading?: boolean;
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
  const result = gen.type === 'video' ||
         gen.type === 'video_travel_output' ||
         (gen.location && gen.location.endsWith('.mp4')) ||
         (gen.imageUrl && gen.imageUrl.endsWith('.mp4'));
  
  return result;
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
  onPreviousShot,
  onNextShot,
  hasPrevious,
  hasNext,
  onUpdateShotName,
  settingsLoading,
  afterEachPromptText,
  onAfterEachPromptTextChange,
}) => {
  // Call all hooks first (Rules of Hooks)
  const { selectedProjectId, projects } = useProject();
  const { getApiKey } = useApiKeys();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  const deleteGenerationMutation = useDeleteGeneration();
  const createGenerationMutation = useCreateGeneration();
  const updateGenerationLocationMutation = useUpdateGenerationLocation();
  const duplicateImageInShotMutation = useDuplicateImageInShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const [fileInputKey, setFileInputKey] = useState<number>(Date.now());
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  
  // Flag to skip next prop sync after successful operations
  const skipNextSyncRef = useRef(false);
  
  // Timeline frame positions for task creation
  const [timelineFramePositions, setTimelineFramePositions] = useState<Map<string, number>>(new Map());
  
  // Use the new task queue notifier hook
  const { enqueueTasks, isEnqueuing, justQueued: localJustQueued } = useTaskQueueNotifier({ 
    projectId: selectedProjectId,
    suppressPerTaskToast: true 
  });

  // Use the local hook's justQueued state instead of the prop
  const actualJustQueued = localJustQueued;

  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { setIsGenerationsPaneLocked } = usePanes();

  // Track if generation mode has been determined
  const [isModeReady, setIsModeReady] = useState(false);

  // Detect if settings never finish loading (e.g., network hiccup on mobile)
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // If settings stay in the loading state for too long, assume failure and continue with defaults
  useEffect(() => {
    if (!settingsLoading) {
      // Reset any existing error once loading completes successfully
      setSettingsError(null);
      return;
    }

    // Give the settings query a reasonable grace period before timing-out
    const fallbackTimer = setTimeout(() => {
      console.warn('[ShotEditor] Settings failed to load within expected time. Falling back to defaults.');
      setSettingsError('Failed to load saved settings – using defaults.');
      setIsModeReady(true);
    }, 3500); // 3.5 s chosen to balance UX and real-world mobile latency

    return () => clearTimeout(fallbackTimer);
  }, [settingsLoading]);

  // Reset mode readiness when shot changes
  useEffect(() => {
    if (selectedShot?.id) {
      setIsModeReady(false);
    }
  }, [selectedShot?.id]);

  // Handle generation mode setup and readiness
  useEffect(() => {
    // Wait for settings to load
    if (settingsLoading) {
      return;
    }

    // If we previously bailed out due to a settings load error, we're already ready
    if (settingsError) {
      return;
    }

    // For mobile users, ensure batch mode
    if (isMobile && generationMode !== 'batch') {
      onGenerationModeChange('batch');
      // Don't set ready yet - the mode change will trigger this effect again
      return;
    }

    // At this point, settings are loaded and mode is correct (or we're not on mobile)
    // Use a small timeout to prevent flicker but make it consistent
    const timer = setTimeout(() => {
      setIsModeReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [isMobile, generationMode, settingsLoading, onGenerationModeChange, settingsError]);

  
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
  
  // Filter out generations without position
  const filteredOrderedShotImages = useMemo(() => {
    const filtered = localOrderedShotImages.filter(img => {
      const hasPosition = (img as any).position !== null && (img as any).position !== undefined;
      const isVideo = isGenerationVideo(img);
      
      // Include if it has a position OR if it's a video (videos can have null positions)
      const shouldInclude = hasPosition || isVideo;
      
      return shouldInclude;
    });
    
    return filtered;
  }, [localOrderedShotImages]);
  
  // Count unpositioned generations for this shot (excluding videos, which are expected to have null positions)
  const { data: unpositionedGenerationsCount = 0 } = useUnpositionedGenerationsCount(selectedShot?.id);
  
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
    return filteredOrderedShotImages.filter(g => !isGenerationVideo(g));
  }, [filteredOrderedShotImages]);
  
  const videoOutputs = useMemo(() => {
    return filteredOrderedShotImages.filter(g => isGenerationVideo(g));
  }, [filteredOrderedShotImages]);

  // Ref to always have the latest nonVideoImages inside async callbacks
  const nonVideoImagesRef = useRef<GenerationRow[]>(nonVideoImages);
  useEffect(() => {
    nonVideoImagesRef.current = nonVideoImages;
  }, [nonVideoImages]);

  const {
    settings: uploadSettings,
  } = useToolSettings<{ cropToProjectSize?: boolean }>('upload', { projectId: selectedProjectId });

  // Early return check after all hooks are called (Rules of Hooks)
  if (!selectedShot) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No shot selected</p>
      </div>
    );
  }

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

  const handleDuplicateImage = async (generationId: string, position: number) => {
    if (!selectedShot || !selectedProjectId) {
      toast.error("Cannot duplicate image: No shot or project selected.");
      return;
    }

    duplicateImageInShotMutation.mutate({
      shot_id: selectedShot.id,
      generation_id: generationId,
      position: position,
      project_id: selectedProjectId,
    });
  };

  const handleReorderImagesInShot = (orderedShotGenerationIds: string[]) => {
    
    if (!selectedShot || !selectedProjectId) {
      console.error('Cannot reorder images: No shot or project selected.');
      return;
    }

    // Optimistic update of local state
    // Create a map of shotImageEntryId -> image for quick lookup
    const imageMap = new Map(localOrderedShotImages.map(img => [img.shotImageEntryId, img]));
    
    // Reorder the images based on the new order
    const reorderedImages = orderedShotGenerationIds
      .map(id => imageMap.get(id))
      .filter((img): img is GenerationRow => !!img);

    // Preserve existing video outputs and unpositioned images
    const videoImages = localOrderedShotImages.filter(img => isGenerationVideo(img));
    const unpositionedImages = localOrderedShotImages.filter(img => 
      (img as any).position === null || (img as any).position === undefined
    );
    
    // Combine reordered positioned images with videos and unpositioned images
    const combinedImages = [...reorderedImages, ...videoImages, ...unpositionedImages];
    
    setLocalOrderedShotImages(combinedImages);

    // Send the new order to the backend (include video images to preserve their positions)
    const combinedIds = [...orderedShotGenerationIds, ...videoImages.map(v => v.shotImageEntryId)];

    updateShotImageOrderMutation.mutate({
      shotId: selectedShot.id,
      orderedShotGenerationIds: combinedIds,
      projectId: selectedProjectId,
    }, {
      onError: (error) => {
        console.error('Failed to reorder images:', error);
        // Rollback on error
        setLocalOrderedShotImages(orderedShotImages);
      },
      onSuccess: () => {
        // Skip the next prop sync to prevent overriding our reorder
        skipNextSyncRef.current = true;
      }
    });
  };

  const handleImageSaved = async (imageId: string, newImageUrl: string, createNew?: boolean) => {
    
    try {
      // If the new image is a temporary Blob URL (from in-browser edits), upload it to storage first
      let finalImageUrl = newImageUrl;
      if (newImageUrl.startsWith('blob:')) {
        try {
          const response = await fetch(newImageUrl);
          const blob = await response.blob();

          // Derive a filename / extension from the blob type (fallback to png)
          const mimeType = blob.type || 'image/png';
          const ext = mimeType.split('/').pop() || 'png';
          const file = new File([blob], `${createNew ? 'flipped' : 'edited'}-${imageId}.${ext}`, { type: mimeType });

          finalImageUrl = await uploadImageToStorage(file);

          // Release the local object URL – it is no longer needed
          URL.revokeObjectURL(newImageUrl);
        } catch (uploadErr) {
          console.error('[ShotEditor-HandleImageSaved] Failed to upload edited image:', uploadErr);
          toast.error('Failed to upload edited image.');
          return;
        }
      }

      if (createNew) {
        // Create a new generation and add it to the shot
        
        // Get the original image to find its position
        const originalImage = filteredOrderedShotImages.find(img => img.id === imageId);
        const originalPosition = originalImage ? filteredOrderedShotImages.indexOf(originalImage) : filteredOrderedShotImages.length;
        
        // Create a new generation
        const newGeneration = await createGenerationMutation.mutateAsync({
          imageUrl: finalImageUrl,
          fileName: `flipped-${imageId}`,
          fileType: 'image/png',
          fileSize: 0, // We don't have the exact size, but it's not critical
          projectId: selectedProjectId!,
          prompt: 'Flipped image',
        });

        // Add it to the shot (it will be positioned at the end)
        const addedShotImage = await addImageToShotMutation.mutateAsync({
          shot_id: selectedShot.id,
          generation_id: newGeneration.id,
          project_id: selectedProjectId,
          imageUrl: finalImageUrl,
          thumbUrl: finalImageUrl,
        });

        // Remove the original image from the shot to avoid duplicates
        if (originalImage?.shotImageEntryId) {
          await removeImageFromShotMutation.mutateAsync({
            shot_id: selectedShot.id,
            shotImageEntryId: originalImage.shotImageEntryId,
            project_id: selectedProjectId,
          });
        }
        // Force refresh the shot images in parent
        onShotImagesUpdate();
      } else {
        // Update the existing image
        
        await updateGenerationLocationMutation.mutateAsync({
          id: imageId,
          location: finalImageUrl,
        });

        // Update local state with cache-busting for immediate UI update
        const cacheBustedUrl = getDisplayUrl(finalImageUrl, true);
        setLocalOrderedShotImages(prevImages => {
          const updated = prevImages.map(img => 
            img.id === imageId 
              ? { ...img, imageUrl: cacheBustedUrl, thumbUrl: cacheBustedUrl } 
              : img
          );
          return updated;
        });
      }

      // Invalidate relevant queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['generations', selectedProjectId] });

    } catch (error) {
      console.error("[ShotEditor-HandleImageSaved] Unexpected error:", error);
      toast.error("Failed to save image.");
    }
  };

  // Handle image drop on timeline
  const handleTimelineImageDrop = async (files: File[], targetFrame?: number) => {
    if (!selectedShot?.id || !selectedProjectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: files,
        targetShotId: selectedShot.id,
        currentProjectQueryKey: selectedProjectId,
        currentShotCount: 0 // Not needed when adding to existing shot
      });

      // If a target frame was specified and we got generation IDs back, update the frame positions
      if (targetFrame !== undefined && result && result.generationIds && result.generationIds.length > 0) {
        console.log(`[Timeline Drop] Target frame: ${targetFrame}, Generation IDs:`, result.generationIds);
        
        // Immediately set positions in localStorage using generation IDs
        // This will persist even if the component state gets reset
        const storedPositions = localStorage.getItem(`timelineFramePositions_${selectedShot.id}`);
        const currentStoredPositions = storedPositions ? new Map(JSON.parse(storedPositions)) : new Map();
        
        // Pre-set positions for the generation IDs we expect
        result.generationIds.forEach((generationId, index) => {
          const framePosition = targetFrame + (index * batchVideoFrames);
          // We'll use a temporary key format until we get the actual shotImageEntryId
          currentStoredPositions.set(`temp_${generationId}`, framePosition);
          console.log(`[Timeline Drop] Pre-setting position for generation ${generationId} to frame ${framePosition}`);
        });
        
        localStorage.setItem(
          `timelineFramePositions_${selectedShot.id}`, 
          JSON.stringify(Array.from(currentStoredPositions.entries()))
        );
        
        // Create a function to retry finding the images and update with actual shotImageEntryIds
        const tryUpdateFramePositions = (retryCount = 0) => {
          const currentImages = nonVideoImagesRef.current;
          console.log(`[Timeline Drop] Retry ${retryCount}, Current images count:`, currentImages.length);
          
          const newShotImageEntries = currentImages.filter(image => 
            result.generationIds.includes(image.id)
          );
          
          console.log(`[Timeline Drop] Found ${newShotImageEntries.length} matching images out of ${result.generationIds.length} expected`);
          
          if (newShotImageEntries.length === result.generationIds.length) {
            // Found all images, update their positions with actual shotImageEntryIds
            const updatedPositions = new Map(timelineFramePositions);
            
            newShotImageEntries.forEach((image, index) => {
              const framePosition = targetFrame + (index * batchVideoFrames);
              updatedPositions.set(image.shotImageEntryId, framePosition);
              // Remove the temporary key
              updatedPositions.delete(`temp_${image.id}`);
              console.log(`[Timeline Drop] Setting frame position for image ${image.shotImageEntryId} (gen: ${image.id}) to frame ${framePosition}`);
            });
            
            setTimelineFramePositions(updatedPositions);
            
            // Update localStorage with actual shotImageEntryIds
            const finalStoredPositions = new Map();
            updatedPositions.forEach((position, key) => {
              if (!key.startsWith('temp_')) {
                finalStoredPositions.set(key, position);
              }
            });
            
            localStorage.setItem(
              `timelineFramePositions_${selectedShot.id}`, 
              JSON.stringify(Array.from(finalStoredPositions.entries()))
            );
            
            console.log(`[Timeline Drop] Successfully set positions for ${newShotImageEntries.length} images`);
          } else if (retryCount < 8) {
            // Retry after a short delay
            console.log(`[Timeline Drop] Retrying in 300ms (attempt ${retryCount + 1}/8)`);
            setTimeout(() => tryUpdateFramePositions(retryCount + 1), 300);
          } else {
            console.warn(`[Timeline Drop] Failed to find all images after 8 retries. Found ${newShotImageEntries.length}/${result.generationIds.length}`);
          }
        };
        
        // Start trying to update positions
        tryUpdateFramePositions();
      }

      const frameText = targetFrame !== undefined ? ` at frame ${targetFrame}` : '';
      toast.success(`Successfully added ${files.length} image(s) to the timeline${frameText}.`);
      
      // Refresh the shot data
      onShotImagesUpdate();
    } catch (error) {
      console.error('Error adding images to timeline:', error);
      throw error; // Re-throw to let Timeline component handle the error display
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
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg');

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
    } else {
      // batch mode
      basePrompts = [batchVideoPrompt];
      segmentFrames = [batchVideoFrames];
      frameOverlap = [batchVideoContext];
      negativePrompts = [steerableMotionSettings.negative_prompt];
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
    
    try {
      await enqueueTasks([{
        functionName: 'steerable-motion',
        payload: requestBody,
      }]);
      
      // Success feedback is now handled by useTaskQueueNotifier
    } catch (error) {
      console.error('Error creating video generation task:', error);
      // Error handling is done by the useTaskQueueNotifier hook
    }
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
        batchVideoFrames: orchestratorDetails?.segment_frames?.[0] || params?.frames || 60,
        batchVideoContext: orchestratorDetails?.frame_overlap?.[0] || params?.context || 10,
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
      };
      
      // Apply the settings
      onVideoControlModeChange(settings.videoControlMode || 'batch');
      onBatchVideoPromptChange(settings.batchVideoPrompt || '');
      onBatchVideoFramesChange(settings.batchVideoFrames || 60);
      onBatchVideoContextChange(settings.batchVideoContext || 10);
      onBatchVideoStepsChange(settings.batchVideoSteps || 20);
      onDimensionSourceChange(settings.dimensionSource || 'custom');
      if (settings.customWidth) onCustomWidthChange(settings.customWidth);
      if (settings.customHeight) onCustomHeightChange(settings.customHeight);
      onEnhancePromptChange(settings.enhancePrompt || false);
      onGenerationModeChange(settings.generationMode || 'batch');
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

    // Apply other settings
    if (settings.negativePrompt) {
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
          ...(newGeneration as any),
          shotImageEntryId: (newShotImage as any).id,
          id: (newShotImage as any).generationId ?? (newShotImage as any).generation_id ?? (newGeneration as any).id,
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
  const isGenerationDisabled = isEnqueuing || nonVideoImages.length < 2 || isGenerationDisabledDueToApiKey;

  // Skeleton component for image manager
  const ImageManagerSkeleton = () => (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-7 w-48" />
        {!isMobile && (
          <Skeleton className="h-8 w-36" />
        )}
      </div>
      
      {/* Description skeleton */}
      <Skeleton className="h-4 w-full max-w-lg mb-6" />
      
      {/* Content area skeleton */}
      <div className="p-1 min-h-[200px]">
        {/* Image grid skeleton - fewer items initially */}
        <div className={`grid gap-3 ${isMobile ? 'grid-cols-3' : 'grid-cols-6'}`}>
          {Array.from({ length: isMobile ? 3 : 6 }).map((_, i) => (
            <div key={i} className="aspect-square">
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Upload section skeleton */}
      <div className="pt-4 border-t space-y-3">
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col space-y-4 pb-16">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-wrap justify-between items-center gap-y-2 px-2">
        <Button onPointerUp={onBack}>&larr; Back to Shot List</Button>
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
            {!isModeReady ? (
              <CardContent className="p-6">
                <ImageManagerSkeleton />
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  {settingsError && (
                    <div className="mb-4 p-3 rounded bg-yellow-100 text-yellow-800 text-sm">
                      {settingsError}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <CardTitle>Manage Shot Images</CardTitle>
                    {!isMobile && (
                      <div className="flex items-center space-x-2">
                        <ToggleGroup type="single" value={generationMode} onValueChange={(value: 'batch' | 'timeline') => value && onGenerationModeChange(value)} size="sm">
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
                            : 'Drag to reorder. Ctrl+click to select and move multiple images.'
                        }
                      </p>
                    </>
                  )}
                </CardHeader>
                <CardContent className={nonVideoImages.length > 0 ? "" : ""}>
                  <div className="p-1">
                    {generationMode === 'timeline' ? (
                      <Suspense fallback={
                        <div className="flex items-center justify-center p-8">
                          <div className="text-sm text-muted-foreground">Loading Timeline...</div>
                        </div>
                      }>
                        <Timeline
                          shotId={selectedShot.id}
                          images={nonVideoImages}
                          frameSpacing={batchVideoFrames}
                          contextFrames={batchVideoContext}
                          onImageReorder={handleReorderImagesInShot}
                          onImageSaved={handleImageSaved}
                          onContextFramesChange={onBatchVideoContextChange}
                          onFramePositionsChange={setTimelineFramePositions}
                          onImageDrop={handleTimelineImageDrop}
                        />
                      </Suspense>
                    ) : (
                    <ShotImageManager
                      images={nonVideoImages}
                      onImageDelete={handleDeleteImageFromShot}
                      onImageDuplicate={handleDuplicateImage}
                      onImageReorder={handleReorderImagesInShot}
                      columns={isMobile ? 3 : 6}
                      generationMode={isMobile ? 'batch' : generationMode}
                      onImageSaved={handleImageSaved}
                      onMagicEdit={(imageUrl, prompt, numImages) => {
                        // TODO: Implement magic edit generation
                        console.log('Magic Edit:', { imageUrl, prompt, numImages });
                      }}
                    />
                  )}
                  </div>
                  
                  {/* Unpositioned generations message */}
                  {unpositionedGenerationsCount > 0 && (
                    <div className="mx-1 mt-4 p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        There {unpositionedGenerationsCount === 1 ? 'is' : 'are'} {unpositionedGenerationsCount} generation{unpositionedGenerationsCount === 1 ? '' : 's'} associated with this shot that {unpositionedGenerationsCount === 1 ? "doesn't" : "don't"} have a position
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (isMobile) {
                            // On mobile, just open the pane normally (no locking)
                            const evt = new CustomEvent('mobilePaneOpen', { detail: { side: 'bottom' } });
                            window.dispatchEvent(evt);
                          } else {
                            // On desktop, open the generations pane and set the locked state
                            setIsGenerationsPaneLocked(true);
                          }
                          // TODO: Set the shot filter in the generations pane to the current shot
                        }}
                      >
                        Open Pane
                      </Button>
                    </div>
                  )}
                </CardContent>
                <div className="p-4 border-t space-y-3">
                  <FileInput
                    key={fileInputKey}
                    onFileChange={handleImageUploadToShot}
                    acceptTypes={['image']}
                    label="Add more images"
                    disabled={isUploadingImage || !isModeReady}
                    multiple
                  />
                </div>
              </>
            )}
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
                            afterEachPromptText={afterEachPromptText}
                            onAfterEachPromptTextChange={onAfterEachPromptTextChange}
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
                                    onAddTriggerWord={onAfterEachPromptTextChange ? (triggerWord) => {
                                      const currentText = afterEachPromptText || '';
                                      const newText = currentText.trim() ? `${currentText}, ${triggerWord}` : triggerWord;
                                      onAfterEachPromptTextChange(newText);
                                    } : undefined}
                                />
                            </div>
                        </div>
                        
                        <div className="mt-6 pt-6 border-t">
                            <Button 
                                size="lg" 
                                className="w-full" 
                                variant={actualJustQueued ? "success" : "default"}
                                onClick={handleGenerateBatch} 
                                disabled={isGenerationDisabled}
                            >
                                {actualJustQueued
                                  ? "Added to queue!"
                                  : isEnqueuing 
                                    ? 'Creating Tasks...' 
                                    : 'Generate Video'}
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
                                onAddTriggerWord={onAfterEachPromptTextChange ? (triggerWord) => {
                                  const currentText = afterEachPromptText || '';
                                  const newText = currentText.trim() ? `${currentText}, ${triggerWord}` : triggerWord;
                                  onAfterEachPromptTextChange(newText);
                                } : undefined}
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