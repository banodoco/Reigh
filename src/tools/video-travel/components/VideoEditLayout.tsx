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
import { ChevronsUpDown } from 'lucide-react';
import VideoLightbox from "./VideoLightbox.tsx";
import { VideoOutputItem } from './VideoOutputItem';
import { arrayMove } from '@dnd-kit/sortable';
import { getDisplayUrl } from '@/shared/lib/utils';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/shared/components/ui/pagination";
import { Skeleton } from '@/shared/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);
  const [animatedVideoOutputs, setAnimatedVideoOutputs] = useState<GenerationRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const videosPerPage = 9;
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
          console.error(`[VideoEditLayout] Failed to parse settings from localStorage for key ${key}`, e);
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
        console.error("[VideoEditLayout] Failed to save shot settings to localStorage", e);
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
      console.error("[VideoEditLayout] Error uploading images:", error);
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

  // Pagination logic
  const pageCount = Math.ceil(videoOutputs.length / videosPerPage);
  const paginatedVideos = useMemo(() => {
    const startIndex = (currentPage - 1) * videosPerPage;
    const endIndex = startIndex + videosPerPage;
    return videoOutputs.slice(startIndex, endIndex);
  }, [videoOutputs, currentPage]);

  useEffect(() => {
    // This effect handles the sequential fade-in of video items.
    // When the list of videos changes, it resets and re-runs the animation.
    setAnimatedVideoOutputs([]);

    const timeouts = paginatedVideos.map((video, index) => {
        return setTimeout(() => {
            setAnimatedVideoOutputs(prev => [...prev, video]);
        }, index * 150); // Stagger by 150ms
    });

    // Cleanup timeouts on unmount or if videoOutputs changes again
    return () => {
        timeouts.forEach(clearTimeout);
    };
  }, [paginatedVideos]);

  // Update managedImages effect to use localOrderedShotImages
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
          console.error("[VideoEditLayout] Failed to update ordering after deletion:", error);
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
        console.error("[VideoEditLayout] Dragged item not found in managed images.");
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
        console.error("[VideoEditLayout] Failed to reorder images:", error);
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
        console.log("[VideoEditLayout] Video task created via API:", newTask);        
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

      {lightboxIndex !== null && videoOutputs[lightboxIndex] && (
        <VideoLightbox
          video={videoOutputs[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
        />
      )}

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
              {paginatedVideos.map((video) => {
                const isVisible = animatedVideoOutputs.some(v => v.id === video.id);
                if (!isVisible) {
                  return (
                    <Skeleton
                      key={video.id}
                      className="w-full aspect-video rounded-lg bg-muted/40"
                    />
                  );
                }
                return (
                  <div key={video.id} className="animate-in fade-in zoom-in-95 duration-500 ease-out">
                    <VideoOutputItem
                      video={video}
                      onDoubleClick={() => {
                        const originalIndex = videoOutputs.findIndex(v => v.id === video.id);
                        setLightboxIndex(originalIndex);
                      }}
                      onDelete={handleDeleteVideoOutput}
                      isDeleting={deletingVideoId === video.id}
                    />
                  </div>
                );
              })}
            </div>
            {pageCount > 1 && (
              <Pagination className="mt-8">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      href="#" 
                      onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(p - 1, 1)); }} 
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                      size="default"
                    />
                  </PaginationItem>
                  
                  {/* Simplified page numbers for now */}
                  <PaginationItem>
                    <PaginationLink href="#" isActive size="default">
                      Page {currentPage} of {pageCount}
                    </PaginationLink>
                  </PaginationItem>

                  <PaginationItem>
                    <PaginationNext 
                      href="#" 
                      onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(p + 1, pageCount)); }}
                      className={currentPage === pageCount ? "pointer-events-none opacity-50" : undefined}
                      size="default"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
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
          <div className="p-4 border rounded-lg bg-card shadow-md space-y-4">
            <h3 className="text-lg font-semibold">Batch Generation Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="batchVideoPrompt" className="text-sm font-medium block mb-1.5">
                  Prompt
                  <span title="This prompt will be applied to every video. These are very sensitive and will impact things a lot." className="ml-1 text-muted-foreground cursor-help">ℹ️</span>
                </Label>
                <Textarea 
                  id="batchVideoPrompt"
                  value={batchVideoPrompt}
                  onChange={(e) => onBatchVideoPromptChange(e.target.value)}
                  placeholder="Enter a global prompt for all video segments... (e.g., cinematic transition)"
                  className="min-h-[70px] text-sm"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="negative_prompt" className="text-sm font-medium block mb-1.5">
                  Negative Prompt
                  <span title="This will be applied to every video to tell it what to avoid." className="ml-1 text-muted-foreground cursor-help">ℹ️</span>
                </Label>
                <Textarea
                  id="negative_prompt"
                  value={steerableMotionSettings.negative_prompt}
                  onChange={(e) => onSteerableMotionSettingsChange({ negative_prompt: e.target.value })}
                  placeholder="e.g., blurry, low quality"
                  className="min-h-[70px] text-sm"
                  rows={3}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="batchVideoFrames" className="text-sm font-medium block mb-1">
                  Frames per Image: {batchVideoFrames}
                  <span title="Number of frames to have per image." className="ml-1 text-muted-foreground cursor-help">ℹ️</span>
                </Label>
                <Slider
                  id="batchVideoFrames"
                  min={10}
                  max={81} 
                  step={1}
                  value={[batchVideoFrames]}
                  onValueChange={(value) => onBatchVideoFramesChange(value[0])}
                />
                <Input
                  id="batchVideoFramesInput"
                  type="number"
                  value={batchVideoFrames}
                  onChange={(e) => onBatchVideoFramesChange(parseInt(e.target.value, 10) || 0)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="batchVideoContext" className="text-sm font-medium block mb-1">
                  Number of Context Frames: {batchVideoContext}
                  <span title="Number of frames in the previous video to provide us context to the next one." className="ml-1 text-muted-foreground cursor-help">ℹ️</span>
                </Label>
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
            <div>
              <Label htmlFor="batchVideoSteps" className="text-sm font-medium block mb-1">
                Generation Steps: {batchVideoSteps}
                <span title="Amount of time to spend processing the generations; more steps generally means more quality." className="ml-1 text-muted-foreground cursor-help">ℹ️</span>
              </Label>
              <Slider
                id="batchVideoSteps"
                min={1}
                max={20}
                step={1}
                value={[batchVideoSteps]}
                onValueChange={(value) => onBatchVideoStepsChange(value[0])}
              />
            </div>
            <div>
              <Label className="text-sm font-medium block mb-2">Dimension Source</Label>
              <RadioGroup
                value={dimensionSource || 'firstImage'}
                onValueChange={(value) => {
                  const newSource = value as 'project' | 'firstImage' | 'custom';
                  onDimensionSourceChange(newSource);
                  if (newSource === 'custom' && (!customWidth || !customHeight)) {
                    const project = projects.find(p => p.id === selectedProjectId);
                    if (project && project.aspectRatio) {
                      const res = ASPECT_RATIO_TO_RESOLUTION[project.aspectRatio];
                      if (res) {
                        const [width, height] = res.split('x').map(Number);
                        onCustomWidthChange(width);
                        onCustomHeightChange(height);
                      }
                    }
                  }
                }}
                className="flex space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="firstImage" id="r_firstImage" />
                  <Label htmlFor="r_firstImage">Use First Image Dimensions</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="project" id="r_project" />
                  <Label htmlFor="r_project">Use Project Dimensions</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="r_custom" />
                  <Label htmlFor="r_custom">Custom</Label>
                </div>
              </RadioGroup>
            </div>
            {dimensionSource === 'custom' && (
              <div className="grid grid-cols-2 gap-4 p-4 border rounded-md bg-muted/20">
                <div>
                  <Label htmlFor="customWidth">Width</Label>
                  <Input
                    id="customWidth"
                    type="number"
                    value={customWidth || ''}
                    onChange={(e) => onCustomWidthChange(parseInt(e.target.value, 10) || undefined)}
                    placeholder="e.g., 1024"
                  />
                </div>
                <div>
                  <Label htmlFor="customHeight">Height</Label>
                  <Input
                    id="customHeight"
                    type="number"
                    value={customHeight || ''}
                    onChange={(e) => onCustomHeightChange(parseInt(e.target.value, 10) || undefined)}
                    placeholder="e.g., 576"
                  />
                </div>
                {(customWidth || 0) > 2048 || (customHeight || 0) > 2048 ? (
                  <p className="col-span-2 text-sm text-destructive">Warning: Very large dimensions may lead to slow generation or failures.</p>
                ) : null}
              </div>
            )}
            
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-center text-sm">
                  <ChevronsUpDown className="h-4 w-4 mr-2" />
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="model_name">Model Name</Label>
                    <Input
                      id="model_name"
                      value={steerableMotionSettings.model_name}
                      onChange={(e) => onSteerableMotionSettingsChange({ model_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="seed">Seed</Label>
                    <Input
                      id="seed"
                      type="number"
                      value={steerableMotionSettings.seed}
                      onChange={(e) => onSteerableMotionSettingsChange({ seed: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                    <Label htmlFor="saturation">Post-Gen Saturation: {steerableMotionSettings.after_first_post_generation_saturation}</Label>
                    <Slider
                      id="saturation"
                      min={0} max={2} step={0.05}
                      value={[steerableMotionSettings.after_first_post_generation_saturation]}
                      onValueChange={(v) => onSteerableMotionSettingsChange({ after_first_post_generation_saturation: v[0] })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="brightness">Post-Gen Brightness: {steerableMotionSettings.after_first_post_generation_brightness}</Label>
                    <Slider
                      id="brightness"
                      min={-1} max={1} step={0.05}
                      value={[steerableMotionSettings.after_first_post_generation_brightness]}
                      onValueChange={(v) => onSteerableMotionSettingsChange({ after_first_post_generation_brightness: v[0] })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="fade_in_duration">Fade-In Duration (JSON)</Label>
                  <Textarea
                    id="fade_in_duration"
                    value={steerableMotionSettings.fade_in_duration}
                    onChange={(e) => onSteerableMotionSettingsChange({ fade_in_duration: e.target.value })}
                    placeholder='e.g., {"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}'
                    className="font-mono text-xs"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="fade_out_duration">Fade-Out Duration (JSON)</Label>
                  <Textarea
                    id="fade_out_duration"
                    value={steerableMotionSettings.fade_out_duration}
                    onChange={(e) => onSteerableMotionSettingsChange({ fade_out_duration: e.target.value })}
                    placeholder='e.g., {"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}'
                    className="font-mono text-xs"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="debug"
                      checked={steerableMotionSettings.debug ?? true}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ debug: v })}
                    />
                    <Label htmlFor="debug">Debug Mode</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="apply_reward_lora"
                      checked={steerableMotionSettings.apply_reward_lora ?? true}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ apply_reward_lora: v })}
                    />
                    <Label htmlFor="apply_reward_lora">Apply Reward LoRA</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="colour-match"
                      checked={steerableMotionSettings.colour_match_videos ?? true}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ colour_match_videos: v })}
                    />
                    <Label htmlFor="colour-match">Color Match Videos</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="apply-causvid"
                      checked={steerableMotionSettings.apply_causvid ?? true}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ apply_causvid: v })}
                    />
                    <Label htmlFor="apply-causvid">Apply Causvid</Label>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
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

export default VideoEditLayout; 