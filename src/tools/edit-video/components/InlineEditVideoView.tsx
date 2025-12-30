import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { Loader2, Check, Plus, Trash2, Play, Pause } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { VideoPortionEditor } from './VideoPortionEditor';
import { useEditVideoSettings } from '../hooks/useEditVideoSettings';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useListPublicResources } from '@/shared/hooks/useResources';
import type { LoraModel } from '@/shared/hooks/useLoraManager';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { generateUUID, generateRunId, createTask } from '@/shared/lib/taskCreation';
import { MultiPortionTimeline, formatTime, PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { DEFAULT_VACE_PHASE_CONFIG, buildPhaseConfigWithLoras, BUILTIN_VACE_DEFAULT_ID } from '@/shared/lib/vaceDefaults';

// PortionSelection is now imported from shared component

// Type for frame-accurate selection to send to backend
interface FrameRangeSelection {
  start_frame: number;
  end_frame: number;
  start_time: number;
  end_time: number;
  frame_count: number;
  gap_frame_count: number;
  prompt: string;
}

// Default FPS for AI-generated videos
const DEFAULT_VIDEO_FPS = 16;

// Convert time selections to frame ranges with per-segment settings
function selectionsToFrameRanges(
  selections: PortionSelection[], 
  fps: number, 
  totalDuration: number,
  globalGapFrameCount: number,
  globalPrompt: string
): FrameRangeSelection[] {
  const totalFrames = Math.round(totalDuration * fps);
  
  return selections.map(selection => {
    const startFrame = Math.max(0, Math.round(selection.start * fps));
    const endFrame = Math.min(totalFrames, Math.round(selection.end * fps));
    return {
      start_frame: startFrame,
      end_frame: endFrame,
      start_time: selection.start,
      end_time: selection.end,
      frame_count: endFrame - startFrame,
      gap_frame_count: selection.gapFrameCount ?? globalGapFrameCount,
      prompt: selection.prompt || globalPrompt,
    };
  });
}

interface InlineEditVideoViewProps {
  media: GenerationRow;
  onClose: () => void;
  onVideoSaved?: (newVideoUrl: string) => Promise<void>;
  onNavigateToGeneration?: (generationId: string) => Promise<void>;
  initialSegments?: PortionSelection[];
  onSegmentsChange?: (segments: PortionSelection[]) => void;
}

export function InlineEditVideoView({ 
  media, 
  onClose, 
  onVideoSaved, 
  onNavigateToGeneration,
  initialSegments,
  onSegmentsChange,
}: InlineEditVideoViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Use stacked layout for both mobile and tablet - video on top, settings below
  const useStackedLayout = isMobile || isTablet;
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  
  // Get video URL
  const videoUrl = media.location || (media as any).url || (media as any).imageUrl;
  
  // Video duration and FPS state
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoFps, setVideoFps] = useState<number | null>(null);
  const [fpsDetectionStatus, setFpsDetectionStatus] = useState<'pending' | 'detecting' | 'detected' | 'fallback'>('pending');
  
  // Current video playhead time for overlay display
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  
  // Progressive loading: show thumbnail first, then video when ready
  const [videoReady, setVideoReady] = useState(false);
  const thumbnailUrl = (media as any).thumbnail_url || (media as any).thumbUrl;
  
  // Multiple portion selections - start at 10%-20% of video
  // Each selection can have its own gapFrameCount and prompt
  // Initialize from saved segments if provided, otherwise default to empty selection
  const [selections, setSelections] = useState<PortionSelection[]>(() => {
    if (initialSegments && initialSegments.length > 0) {
      return initialSegments;
    }
    return [{ id: generateUUID(), start: 0, end: 0, gapFrameCount: 12, prompt: '' }]; // Will be initialized when duration is known
  });
  
  // Track if we've initialized from saved segments to skip the first callback
  const hasInitializedSegments = useRef(!!initialSegments && initialSegments.length > 0);
  
  // Notify parent when selections change (debounced to avoid excessive updates)
  useEffect(() => {
    // Skip the initial call if we loaded from saved segments
    if (hasInitializedSegments.current) {
      hasInitializedSegments.current = false;
      return;
    }
    // Skip if selections haven't been initialized yet (start/end are 0)
    if (selections.length === 1 && selections[0].start === 0 && selections[0].end === 0) {
      return;
    }
    onSegmentsChange?.(selections);
  }, [selections, onSegmentsChange]);
  
  // Currently active selection for editing
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);
  
  // Track if video is playing
  const [isPlaying, setIsPlaying] = useState(false);

  // Track video time updates for overlay display
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentVideoTime(video.currentTime);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);
  
  // Check if current time is in a regeneration zone and which segment
  const regenerationZoneInfo = useMemo(() => {
    // Sort by start time to get correct index
    const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sortedSelections.length; i++) {
      const selection = sortedSelections[i];
      if (currentVideoTime >= selection.start && currentVideoTime <= selection.end) {
        return { inZone: true, segmentIndex: i };
      }
    }
    return { inZone: false, segmentIndex: -1 };
  }, [currentVideoTime, selections]);
  
  // Segment colors matching VideoPortionEditor
  const SEGMENT_COLORS = [
    { bg: 'bg-primary/40', text: 'text-primary' },
    { bg: 'bg-blue-500/40', text: 'text-blue-400' },
    { bg: 'bg-green-500/40', text: 'text-green-400' },
    { bg: 'bg-orange-500/40', text: 'text-orange-400' },
    { bg: 'bg-purple-500/40', text: 'text-purple-400' },
  ];
  
  // Handler to update per-segment settings
  const handleUpdateSelectionSettings = useCallback((id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt' | 'name'>>) => {
    setSelections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);
  
  // Get the first selection for backward compatibility
  const portionStart = selections[0]?.start ?? 0;
  const portionEnd = selections[0]?.end ?? 0;
  
  // Settings hook
  const editSettings = useEditVideoSettings(selectedProjectId);
  const settingsLoaded = editSettings.status !== 'idle' && editSettings.status !== 'loading';
  
  // Derive settings
  const {
    prompt = '',
    negativePrompt = '',
    contextFrameCount = 8,
    gapFrameCount = 12,
    enhancePrompt = true,
    motionMode = 'basic',
    phaseConfig: savedPhaseConfig,
    randomSeed = true,
    selectedPhasePresetId,
  } = editSettings.settings;
  
  // Hardcoded settings
  const replaceMode = true;
  const keepBridgingImages = false;
  
  // Project aspect ratio for resolution
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // LoRA management
  const publicLorasResult = useListPublicResources('lora');
  const availableLoras = ((publicLorasResult.data || []) as any[]).map(resource => resource.metadata || {}) as LoraModel[];
  
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'project',
    enableProjectPersistence: true,
    persistenceKey: 'edit-video',
  });
  
  // Success state for button feedback
  const [showSuccessState, setShowSuccessState] = useState(false);
  
  // Handle video metadata loaded - set FPS and ensure paused
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      // Ensure video is paused immediately
      videoRef.current.pause();
      
      // Mark video as ready to show (hide thumbnail)
      setVideoReady(true);
      
      const duration = videoRef.current.duration;
      if (Number.isFinite(duration) && duration > 0) {
        setVideoDuration(duration);
        // Initialize first selection to 10%-20% of video if not set
        setSelections(prev => {
          if (prev.length > 0 && prev[0].end === 0) {
            const start = duration * 0.1;
            const end = duration * 0.2;
            // Calculate gap frames based on actual frame difference
            const calculatedGapFrames = videoFps 
              ? (() => {
                  const frameCount = Math.round((end - start) * videoFps);
                  // Quantize to 4N+1 format (required by Wan models)
                  const n = Math.round((frameCount - 1) / 4);
                  return Math.max(1, n * 4 + 1);
                })()
              : (prev[0].gapFrameCount ?? gapFrameCount);
            return [{ ...prev[0], start, end, gapFrameCount: calculatedGapFrames }, ...prev.slice(1)];
          }
          return prev;
        });
        
        // Set FPS to default (16fps is standard for AI-generated videos)
        if (fpsDetectionStatus === 'pending') {
          setVideoFps(DEFAULT_VIDEO_FPS);
          setFpsDetectionStatus('detected');
        }
      }
    }
  }, [fpsDetectionStatus]);
  
  // Add a new selection - start 10% after the last one, or 10% before if no space
  const handleAddSelection = useCallback(() => {
    const selectionWidth = 0.1; // 10% of video duration
    const gap = 0.1; // 10% gap after last selection
    
    // Find the last selection's end position
    const sortedSelections = [...selections].sort((a, b) => a.end - b.end);
    const lastSelection = sortedSelections[sortedSelections.length - 1];
    
    let newStart: number;
    let newEnd: number;
    
    if (lastSelection) {
      // Try to place 10% after the last selection
      const afterStart = lastSelection.end + (videoDuration * gap);
      const afterEnd = afterStart + (videoDuration * selectionWidth);
      
      if (afterEnd <= videoDuration) {
        // There's space after
        newStart = afterStart;
        newEnd = afterEnd;
      } else {
        // No space after, try 10% before the first selection
        const firstSelection = sortedSelections[0];
        const beforeEnd = firstSelection.start - (videoDuration * gap);
        const beforeStart = beforeEnd - (videoDuration * selectionWidth);
        
        if (beforeStart >= 0) {
          newStart = beforeStart;
          newEnd = beforeEnd;
        } else {
          // No space before either, just overlap with default
          newStart = videoDuration * 0.4;
          newEnd = videoDuration * 0.5;
        }
      }
    } else {
      // No existing selections, use default 10%-20%
      newStart = videoDuration * 0.1;
      newEnd = videoDuration * 0.2;
    }
    
    // Calculate gap frames based on actual frame difference
    const calculatedGapFrames = videoFps 
      ? (() => {
          const frameCount = Math.round((newEnd - newStart) * videoFps);
          // Quantize to 4N+1 format (required by Wan models)
          const n = Math.round((frameCount - 1) / 4);
          return Math.max(1, n * 4 + 1);
        })()
      : gapFrameCount; // Fallback to global default if FPS not available
    
    const newSelection: PortionSelection = {
      id: generateUUID(),
      start: newStart,
      end: newEnd,
      gapFrameCount: calculatedGapFrames,
      prompt: '',
    };
    setSelections(prev => [...prev, newSelection]);
    setActiveSelectionId(newSelection.id);
  }, [videoDuration, selections, gapFrameCount, videoFps]);
  
  // Remove a selection
  const handleRemoveSelection = useCallback((id: string) => {
    setSelections(prev => {
      if (prev.length <= 1) return prev; // Keep at least one selection
      return prev.filter(s => s.id !== id);
    });
    if (activeSelectionId === id) {
      setActiveSelectionId(null);
    }
  }, [activeSelectionId]);
  
  // Helper to calculate gap frames from time range (enforces max limit)
  const calculateGapFramesFromRange = useCallback((start: number, end: number, fps: number | null): number => {
    if (!fps || end <= start) return gapFrameCount; // Fallback to global default

    const frameCount = Math.round((end - start) * fps);
    // Quantize to 4N+1 format (required by Wan models)
    const n = Math.round((frameCount - 1) / 4);
    const quantized = Math.max(1, n * 4 + 1);
    
    // Enforce max limit: 81 - (contextFrameCount * 2)
    const maxGapFrames = Math.max(1, 81 - (contextFrameCount * 2));
    return Math.min(quantized, maxGapFrames);
  }, [gapFrameCount, contextFrameCount]);

  // Update a selection with minimum 2 frame gap enforcement
  const handleUpdateSelection = useCallback((id: string, start: number, end: number) => {
    // Minimum gap of 2 frames
    const minGapFrames = 2;
    const minGapTime = videoFps ? minGapFrames / videoFps : 0.1;
    
    // Enforce minimum gap - adjust whichever value was likely being dragged
    let adjustedStart = start;
    let adjustedEnd = end;
    
    if (end - start < minGapTime) {
      // If gap is too small, we need to figure out which handle is being moved
      // We'll adjust the value that makes the gap smaller
      setSelections(prev => {
        const existing = prev.find(s => s.id === id);
        if (existing) {
          // If start moved closer to end, push start back
          if (Math.abs(start - existing.start) > Math.abs(end - existing.end)) {
            adjustedStart = end - minGapTime;
          } else {
            // If end moved closer to start, push end forward
            adjustedEnd = start + minGapTime;
          }
        }
        return prev.map(s => {
          if (s.id === id) {
            const calculatedGapFrames = calculateGapFramesFromRange(adjustedStart, adjustedEnd, videoFps);
            return { ...s, start: adjustedStart, end: adjustedEnd, gapFrameCount: calculatedGapFrames };
          }
          return s;
        });
      });
      return;
    }
    
    setSelections(prev => prev.map(s => {
      if (s.id === id) {
        const calculatedGapFrames = calculateGapFramesFromRange(start, end, videoFps);
        return { ...s, start, end, gapFrameCount: calculatedGapFrames };
      }
      return s;
    }));
  }, [videoFps, calculateGapFramesFromRange]);
  
  // Set portion start/end for backward compatibility with VideoPortionEditor
  const setPortionStart = useCallback((val: number) => {
    if (selections.length > 0) {
      handleUpdateSelection(selections[0].id, val, selections[0].end);
    }
  }, [selections, handleUpdateSelection]);
  
  const setPortionEnd = useCallback((val: number) => {
    if (selections.length > 0) {
      handleUpdateSelection(selections[0].id, selections[0].start, val);
    }
  }, [selections, handleUpdateSelection]);
  
  // Calculate portion duration
  const portionDuration = useMemo(() => {
    return Math.max(0, portionEnd - portionStart);
  }, [portionStart, portionEnd]);
  
  // Check if all portions are valid for regeneration
  const portionValidation = useMemo(() => {
    const errors: string[] = [];
    
    if (selections.length === 0) {
      errors.push('No portions selected');
      return { isValid: false, errors };
    }
    
    if (videoFps === null) {
      errors.push('Video FPS not detected yet');
      return { isValid: false, errors };
    }
    
    // Check each selection individually
    for (let i = 0; i < selections.length; i++) {
      const s = selections[i];
      const selNum = selections.length > 1 ? ` #${i + 1}` : '';
      
      // Check if start is before end
      if (s.start >= s.end) {
        errors.push(`Portion${selNum}: Start must be before end`);
      }
      
      // Check minimum duration (at least 0.1 seconds or ~2 frames at 16fps)
      const duration = s.end - s.start;
      if (duration < 0.1) {
        errors.push(`Portion${selNum}: Too short (min 0.1s)`);
      }
      
      // Check if within video bounds
      if (s.start < 0) {
        errors.push(`Portion${selNum}: Starts before video`);
      }
      if (s.end > videoDuration) {
        errors.push(`Portion${selNum}: Extends past video end`);
      }
    }
    
    // Check for overlapping segments
    if (selections.length > 1) {
      const sorted = [...selections].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        if (current.end > next.start) {
          errors.push(`Portions overlap: ${formatTime(current.start)}-${formatTime(current.end)} and ${formatTime(next.start)}-${formatTime(next.end)}`);
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }, [selections, videoFps, videoDuration]);
  
  const isValidPortion = portionValidation.isValid;
  
  // Calculate frame ranges from selections
  const frameRanges = useMemo(() => {
    if (!videoFps || !videoDuration) return [];
    return selectionsToFrameRanges(selections, videoFps, videoDuration, gapFrameCount, prompt);
  }, [selections, videoFps, videoDuration, gapFrameCount, prompt]);
  
  // Calculate max context frames based on shortest keeper clip
  // This prevents users from setting values that would exceed keeper clip lengths
  const maxContextFrames = useMemo(() => {
    if (!videoFps || !videoDuration || frameRanges.length === 0) return 30; // Default max
    
    const totalFrames = Math.round(videoDuration * videoFps);
    const sortedPortions = [...frameRanges].sort((a, b) => a.start_frame - b.start_frame);
    let minKeeperFrames = totalFrames;
    
    // First keeper: from start of video to first portion
    if (sortedPortions.length > 0) {
      const firstKeeperLength = sortedPortions[0].start_frame;
      if (firstKeeperLength > 0) {
        minKeeperFrames = Math.min(minKeeperFrames, firstKeeperLength);
      }
    }
    
    // Middle keepers: between consecutive portions
    for (let i = 0; i < sortedPortions.length - 1; i++) {
      const keeperLength = sortedPortions[i + 1].start_frame - sortedPortions[i].end_frame;
      if (keeperLength > 0) {
        minKeeperFrames = Math.min(minKeeperFrames, keeperLength);
      }
    }
    
    // Last keeper: from last portion to end of video
    if (sortedPortions.length > 0) {
      const lastKeeperLength = totalFrames - sortedPortions[sortedPortions.length - 1].end_frame;
      if (lastKeeperLength > 0) {
        minKeeperFrames = Math.min(minKeeperFrames, lastKeeperLength);
      }
    }
    
    // Use minKeeperFrames - 1 as safety margin for off-by-one in video extraction
    return Math.max(4, minKeeperFrames - 1); // Min 4 to match slider min
  }, [videoFps, videoDuration, frameRanges]);
  
  // Generate mutation using join clips task
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('No project selected');
      if (!videoUrl) throw new Error('No video URL');
      if (!isValidPortion) throw new Error('Invalid portion selected');
      if (!videoFps) throw new Error('Video FPS not detected');
      
      // Convert selections to frame-accurate ranges with per-segment settings
      const portionFrameRanges = selectionsToFrameRanges(selections, videoFps, videoDuration, gapFrameCount, prompt);
      
      console.log('[EditVideo] Frame-accurate selections:', {
        fps: videoFps,
        duration: videoDuration,
        totalFrames: Math.round(videoDuration * videoFps),
        selections: portionFrameRanges,
      });
      
      // Convert selected LoRAs
      const lorasForTask = loraManager.selectedLoras.map(lora => ({
        path: lora.path,
        strength: lora.strength,
      }));
      
      // Calculate resolution from project's aspect ratio
      let resolutionTuple: [number, number] | undefined;
      if (projectAspectRatio) {
        const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
        if (resolutionStr) {
          const [width, height] = resolutionStr.split('x').map(Number);
          if (width && height) {
            resolutionTuple = [width, height];
          }
        }
      }
      
      // Build phase config based on motion mode
      // In Advanced mode: use the saved phaseConfig directly
      // In Basic mode: use saved/default config with additional user LoRAs merged in
      const baseConfig = savedPhaseConfig || DEFAULT_VACE_PHASE_CONFIG;
      const phaseConfig = motionMode === 'advanced' 
        ? baseConfig 
        : buildPhaseConfigWithLoras(lorasForTask, baseConfig);
      
      // Calculate the minimum keeper clip length to cap context_frame_count
      // Keeper clips are the segments BETWEEN the portions being regenerated
      // context_frame_count cannot exceed the shortest keeper clip length
      const totalFrames = Math.round(videoDuration * videoFps);
      const sortedPortions = [...portionFrameRanges].sort((a, b) => a.start_frame - b.start_frame);
      let minKeeperFrames = totalFrames; // Start with max possible
      
      // First keeper: from start of video to first portion
      if (sortedPortions.length > 0) {
        const firstKeeperLength = sortedPortions[0].start_frame;
        if (firstKeeperLength > 0) {
          minKeeperFrames = Math.min(minKeeperFrames, firstKeeperLength);
        }
      }
      
      // Middle keepers: between consecutive portions
      for (let i = 0; i < sortedPortions.length - 1; i++) {
        const keeperLength = sortedPortions[i + 1].start_frame - sortedPortions[i].end_frame;
        if (keeperLength > 0) {
          minKeeperFrames = Math.min(minKeeperFrames, keeperLength);
        }
      }
      
      // Last keeper: from last portion to end of video
      if (sortedPortions.length > 0) {
        const lastKeeperLength = totalFrames - sortedPortions[sortedPortions.length - 1].end_frame;
        if (lastKeeperLength > 0) {
          minKeeperFrames = Math.min(minKeeperFrames, lastKeeperLength);
        }
      }
      
      // Cap context_frame_count to the minimum keeper clip length
      // Use minKeeperFrames - 1 as safety margin for off-by-one in video extraction
      const safeMaxContextFrames = Math.max(1, minKeeperFrames - 1);
      const cappedContextFrameCount = Math.min(contextFrameCount, safeMaxContextFrames);
      
      if (cappedContextFrameCount < contextFrameCount) {
        console.log(`[EditVideo] Capped context_frame_count from ${contextFrameCount} to ${cappedContextFrameCount} (min keeper clip: ${minKeeperFrames} frames, safe max: ${safeMaxContextFrames})`);
      }
      
      // Build orchestrator details for edit_video_orchestrator
      const orchestratorDetails: Record<string, unknown> = {
        run_id: generateRunId(),
        priority: editSettings.settings.priority || 0,
        tool_type: 'edit-video', // For filtering results in gallery
        
        // Source video info
        source_video_url: videoUrl,
        source_video_fps: videoFps,
        source_video_total_frames: totalFrames,
        
        // Portions to regenerate with per-segment settings
        portions_to_regenerate: portionFrameRanges,
        
        // Model settings
        model: editSettings.settings.model || 'wan_2_2_vace_lightning_baseline_2_2_2',
        resolution: resolutionTuple || [902, 508],
        seed: editSettings.settings.seed ?? -1,
        
        // Frame settings (capped to min keeper clip length)
        context_frame_count: cappedContextFrameCount,
        gap_frame_count: gapFrameCount,
        replace_mode: replaceMode,
        keep_bridging_images: keepBridgingImages,
        
        // Prompt settings
        prompt: prompt,
        negative_prompt: negativePrompt,
        enhance_prompt: enhancePrompt,
        
        // Inference settings
        num_inference_steps: editSettings.settings.numInferenceSteps || 6,
        guidance_scale: editSettings.settings.guidanceScale || 3,
        phase_config: phaseConfig,
        
        // Motion settings for UI state restoration
        motion_mode: motionMode,
        selected_phase_preset_id: selectedPhasePresetId,
        
        // Parent generation for tracking
        parent_generation_id: media.id,
      };
      
      // Add LoRAs if provided
      if (lorasForTask.length > 0) {
        orchestratorDetails.loras = lorasForTask;
      }
      
      console.log('[EditVideo] Creating edit_video_orchestrator task:', {
        video_fps: videoFps,
        video_duration: videoDuration,
        total_frames: Math.round(videoDuration * videoFps),
        portions_to_regenerate: portionFrameRanges,
      });
      
      // Create the task using the createTask function
      // Note: tool_type must be at top level for complete_task to pick it up for variant creation
      const result = await createTask({
        project_id: selectedProjectId,
        task_type: 'edit_video_orchestrator',
        params: {
          orchestrator_details: orchestratorDetails,
          tool_type: 'edit-video', // Top level for complete_task variant creation
          parent_generation_id: media.id, // Top level for complete_task variant creation
        },
      });
      
      return result;
    },
    onSuccess: () => {
      // No success toast - per .cursorrules, only show error toasts
      setShowSuccessState(true);
      setTimeout(() => setShowSuccessState(false), 3000);
      
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ 
        queryKey: ['unified-generations', 'project', selectedProjectId]
      });
    },
    onError: (error) => {
      console.error('[EditVideo] Task creation failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create regeneration task');
    },
  });
  
  const handleGenerate = () => {
    if (!isValidPortion) {
      toast.error('Please select a valid portion of the video');
      return;
    }
    generateMutation.mutate();
  };

  if (!media) return null;

  return (
    <TooltipProvider>
      <div className={cn(
        "w-full bg-background",
        useStackedLayout ? "flex flex-col" : "h-full flex flex-row"
      )}>
        {/* Left side: Video + Timeline (stacked vertically) */}
        <div className={cn(
          "flex flex-col min-h-0",
          useStackedLayout ? "w-full" : "flex-1 h-full"
        )}>
          {/* Video Display Area - constrained height on desktop to leave room for timeline */}
          <div className={cn(
            "relative flex items-center justify-center bg-zinc-900 overflow-hidden",
            useStackedLayout ? "w-full" : "flex-shrink rounded-t-lg"
          )}>
            {/* Playhead info overlay - top right of video */}
            {videoReady && videoDuration > 0 && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-[11px] font-mono text-white/80 bg-black/50 backdrop-blur-sm rounded px-2 py-1">
                {formatTime(currentVideoTime)}
                {videoFps && <span className="text-white/50 ml-1">f{Math.round(currentVideoTime * videoFps)}</span>}
                {' '}
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] ml-1",
                  regenerationZoneInfo.inZone
                    ? SEGMENT_COLORS[regenerationZoneInfo.segmentIndex % SEGMENT_COLORS.length].bg + ' ' + SEGMENT_COLORS[regenerationZoneInfo.segmentIndex % SEGMENT_COLORS.length].text
                    : "bg-white/20 text-white/70"
                )}>
                  {regenerationZoneInfo.inZone ? `segment ${regenerationZoneInfo.segmentIndex + 1}` : 'keep'}
                </span>
                {/* Delete button - only show when in a segment and there's more than 1 */}
                {regenerationZoneInfo.inZone && selections.length > 1 && (
                  <button
                    onClick={() => {
                      // Find the actual selection ID for this segment index
                      const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
                      const selectionToDelete = sortedSelections[regenerationZoneInfo.segmentIndex];
                      if (selectionToDelete) {
                        handleRemoveSelection(selectionToDelete.id);
                      }
                    }}
                    className="ml-1 p-0.5 rounded hover:bg-white/20 text-white/50 hover:text-white transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Play/Pause button overlay - center, shows on hover (desktop only) */}
            {videoReady && !useStackedLayout && (
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) {
                    video.play().catch(() => {});
                  } else {
                    video.pause();
                  }
                }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-16 h-16 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all opacity-0 hover:opacity-100 focus:opacity-100"
              >
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </button>
            )}
            
            {/* Video Player with progressive loading - thumbnail first, then video */}
            <div className={cn(
              "w-full flex items-center justify-center relative",
              useStackedLayout 
                ? isTablet 
                  ? "p-2 pt-12 max-h-[35vh]" // Constrained height on iPad/tablet
                  : "p-2 pt-20 aspect-video" // Mobile
                : "p-4 pt-24" // Desktop
            )}>
              {/* Thumbnail shown while video loads */}
              {thumbnailUrl && !videoReady && (
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className={cn(
                    "max-w-full object-contain rounded-lg",
                    useStackedLayout 
                      ? isTablet
                        ? "max-h-[30vh]"
                        : "max-h-full"
                      : "max-h-[40vh]"
                  )}
                />
              )}
              
              {/* Video element - hidden until ready if thumbnail is showing */}
              <video
                ref={videoRef}
                src={videoUrl}
                controls={false} // Hide controls
                playsInline // Prevents fullscreen on iOS when video plays
                poster={thumbnailUrl} // Fallback poster
                className={cn(
                  "max-w-full object-contain rounded-lg cursor-pointer",
                  "[&::-webkit-media-controls-play-button]:hidden [&::-webkit-media-controls-start-playback-button]:hidden",
                  useStackedLayout
                    ? isTablet
                      ? "max-h-[30vh]" // Smaller on tablet
                      : "max-h-full"
                    : "max-h-[40vh]", // Slightly smaller than original to accommodate buffer
                  // Hide video until ready if we have a thumbnail showing
                  thumbnailUrl && !videoReady ? "absolute opacity-0 pointer-events-none" : ""
                )}
                style={{
                  // Additional CSS to hide native controls overlay
                  WebkitAppearance: 'none',
                }}
                onLoadedMetadata={handleVideoLoadedMetadata}
                preload="metadata"
                // Prevent double-click fullscreen on mobile/tablet
                onDoubleClick={useStackedLayout ? (e) => e.preventDefault() : undefined}
                // Click to play/pause on all devices
                onClick={(e) => {
                  e.preventDefault();
                  const video = e.currentTarget;
                  if (video.paused) {
                    video.play().catch(() => {
                      // Ignore play errors (e.g., user interaction required)
                    });
                  } else {
                    video.pause();
                  }
                }}
              />
            </div>
          </div>
          
          {/* Spacer between video and timeline on desktop */}
          {!useStackedLayout && videoDuration > 0 && <div className="h-4 bg-zinc-900" />}
          
          {/* Timeline Section - Below video on both mobile and desktop */}
          {videoDuration > 0 && (
            <div className={cn(
              "bg-zinc-900 select-none touch-manipulation flex-shrink-0",
              useStackedLayout ? "px-3 py-2" : "px-4 pt-2 pb-2 rounded-b-lg"
            )}>
              {/* Timeline */}
              <MultiPortionTimeline
                duration={videoDuration}
                selections={selections}
                activeSelectionId={activeSelectionId}
                onSelectionChange={handleUpdateSelection}
                onSelectionClick={setActiveSelectionId}
                onRemoveSelection={handleRemoveSelection}
                videoRef={videoRef}
                videoUrl={videoUrl}
                fps={videoFps}
                maxGapFrames={Math.max(1, 81 - (contextFrameCount * 2))}
              />
              
              {/* Add button */}
              <div className="flex justify-center -mt-3 pb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddSelection}
                  className="text-white/70 hover:text-white hover:bg-white/10 gap-1 text-xs h-6 px-2"
                >
                  <Plus className="w-3 h-3" />
                  Add selection
                </Button>
              </div>
            </div>
          )}
        </div>
        
        {/* Settings Panel */}
        <div className={cn(
          "bg-background overflow-y-auto",
          useStackedLayout ? "w-full border-t border-border" : "w-[40%] border-l border-border"
        )}>
          <VideoPortionEditor
            gapFrames={gapFrameCount}
            setGapFrames={(val) => editSettings.updateField('gapFrameCount', val)}
            contextFrames={contextFrameCount}
            setContextFrames={(val) => {
              const maxGap = Math.max(1, 81 - (val * 2));
              const newGapFrames = gapFrameCount > maxGap ? maxGap : gapFrameCount;
              editSettings.updateFields({
                contextFrameCount: val,
                gapFrameCount: newGapFrames
              });
            }}
            maxContextFrames={maxContextFrames}
            negativePrompt={negativePrompt}
            setNegativePrompt={(val) => editSettings.updateField('negativePrompt', val)}
            enhancePrompt={enhancePrompt}
            setEnhancePrompt={(val) => editSettings.updateField('enhancePrompt', val)}
            selections={selections}
            onUpdateSelectionSettings={handleUpdateSelectionSettings}
            onRemoveSelection={handleRemoveSelection}
            onAddSelection={handleAddSelection}
            videoUrl={videoUrl}
            fps={videoFps}
            availableLoras={availableLoras}
            projectId={selectedProjectId}
            loraManager={loraManager}
            // Motion settings
            motionMode={motionMode as 'basic' | 'advanced'}
            onMotionModeChange={(mode) => editSettings.updateField('motionMode', mode)}
            phaseConfig={savedPhaseConfig ?? DEFAULT_VACE_PHASE_CONFIG}
            onPhaseConfigChange={(config) => editSettings.updateField('phaseConfig', config)}
            randomSeed={randomSeed}
            onRandomSeedChange={(val) => editSettings.updateField('randomSeed', val)}
            selectedPhasePresetId={selectedPhasePresetId ?? BUILTIN_VACE_DEFAULT_ID}
            onPhasePresetSelect={(presetId, config) => {
              editSettings.updateFields({
                selectedPhasePresetId: presetId,
                phaseConfig: config,
              });
            }}
            onPhasePresetRemove={() => {
              editSettings.updateField('selectedPhasePresetId', null);
            }}
            // Actions
            onGenerate={handleGenerate}
            isGenerating={generateMutation.isPending}
            generateSuccess={showSuccessState}
            isGenerateDisabled={!isValidPortion}
            validationErrors={portionValidation.errors}
            onClose={onClose}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

// MultiPortionTimeline, FrameThumbnail, and formatTime are now imported from @/shared/components/VideoPortionTimeline
