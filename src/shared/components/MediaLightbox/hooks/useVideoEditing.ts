import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GenerationRow } from '@/types/shots';
import { createTask, generateUUID, generateRunId } from '@/shared/lib/taskCreation';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { formatTime, PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { useEditVideoSettings } from '@/tools/edit-video/hooks/useEditVideoSettings';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useListPublicResources } from '@/shared/hooks/useResources';
import type { LoraModel } from '@/shared/hooks/useLoraManager';

export interface UseVideoEditingProps {
  media: GenerationRow | null;
  selectedProjectId: string | null;
  projectAspectRatio?: string;
  isVideo: boolean;
  videoDuration: number;
  videoUrl: string;
  onExitVideoEditMode?: () => void;
}

export interface UseVideoEditingReturn {
  // Mode state
  isVideoEditMode: boolean;
  setIsVideoEditMode: (value: boolean) => void;
  
  // Video ref for timeline control
  videoRef: React.RefObject<HTMLVideoElement>;
  
  // Portion selections
  selections: PortionSelection[];
  activeSelectionId: string | null;
  handleUpdateSelection: (id: string, start: number, end: number) => void;
  handleAddSelection: () => void;
  handleRemoveSelection: (id: string) => void;
  setActiveSelectionId: (id: string | null) => void;
  handleUpdateSelectionSettings: (id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt'>>) => void;
  
  // Validation
  isValid: boolean;
  validationErrors: string[];
  /** Max context frames based on shortest keeper clip (prevents invalid inputs) */
  maxContextFrames: number;
  
  // Settings (from useEditVideoSettings)
  editSettings: ReturnType<typeof useEditVideoSettings>;
  
  // LoRA management
  loraManager: ReturnType<typeof useLoraManager>;
  availableLoras: LoraModel[];
  
  // Generation
  handleGenerate: () => void;
  isGenerating: boolean;
  generateSuccess: boolean;
  
  // Handlers for entering/exiting mode
  handleEnterVideoEditMode: () => void;
  handleExitVideoEditMode: () => void;
}

/**
 * Hook for managing video editing (portion regeneration) functionality
 * Similar to useInpainting but for video portion selection and regeneration
 */
export const useVideoEditing = ({
  media,
  selectedProjectId,
  projectAspectRatio,
  isVideo,
  videoDuration,
  videoUrl,
  onExitVideoEditMode,
}: UseVideoEditingProps): UseVideoEditingReturn => {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Video edit mode state
  const [isVideoEditMode, setIsVideoEditMode] = useState(false);
  
  // Portion selections state - each selection can have its own gapFrameCount and prompt
  const [selections, setSelections] = useState<PortionSelection[]>([
    { id: generateUUID(), start: 0, end: 0, gapFrameCount: 12, prompt: '' }
  ]);
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);
  
  // Success state for UI feedback
  const [generateSuccess, setGenerateSuccess] = useState(false);
  
  // Settings hook
  const editSettings = useEditVideoSettings(selectedProjectId);
  
  // LoRA resources
  const { data: publicLoras } = useListPublicResources('lora');
  const availableLoras: LoraModel[] = useMemo(() => {
    if (!publicLoras) return [];
    return publicLoras.map((lora: any) => ({
      id: lora.id,
      name: lora.name || lora.id,
      path: lora.url || lora.path || '',
      strength: 1.0,
      thumbnail_url: lora.thumbnail_url,
    }));
  }, [publicLoras]);
  
  // LoRA manager - using current hook API with options object
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none', // Don't auto-persist, we manage via editSettings
  });
  
  // Get default gap frame count from settings
  const defaultGapFrameCount = editSettings.settings.gapFrameCount || 12;
  
  // Initialize selection to 10%-20% when video duration is available
  useEffect(() => {
    if (videoDuration > 0 && selections.length > 0 && selections[0].end === 0) {
      setSelections(prev => [{
        ...prev[0],
        start: videoDuration * 0.1,
        end: videoDuration * 0.2,
        gapFrameCount: prev[0].gapFrameCount ?? defaultGapFrameCount,
        prompt: prev[0].prompt ?? '',
      }, ...prev.slice(1)]);
    }
  }, [videoDuration, selections, defaultGapFrameCount]);
  
  // Reset selections when media changes
  useEffect(() => {
    if (media?.id) {
      setSelections([{ id: generateUUID(), start: 0, end: 0, gapFrameCount: defaultGapFrameCount, prompt: '' }]);
      setActiveSelectionId(null);
    }
  }, [media?.id]);
  
  // Update selection handler
  const handleUpdateSelection = useCallback((id: string, start: number, end: number) => {
    setSelections(prev => prev.map(s => 
      s.id === id ? { ...s, start, end } : s
    ));
  }, []);
  
  // Add new selection - 10% after last, or 10% before first if no space
  const handleAddSelection = useCallback(() => {
    const selectionWidth = 0.1; // 10% of video duration
    const gap = 0.1; // 10% gap
    
    // Find the last selection's end position
    const sortedSelections = [...selections].sort((a, b) => a.end - b.end);
    const lastSelection = sortedSelections[sortedSelections.length - 1];
    
    let newStart: number;
    let newEnd: number;
    
    if (lastSelection && videoDuration > 0) {
      // Try to place 10% after the last selection
      const afterStart = lastSelection.end + (videoDuration * gap);
      const afterEnd = afterStart + (videoDuration * selectionWidth);
      
      if (afterEnd <= videoDuration) {
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
          // No space, overlap with default
          newStart = videoDuration * 0.4;
          newEnd = videoDuration * 0.5;
        }
      }
    } else {
      newStart = videoDuration * 0.1;
      newEnd = videoDuration * 0.2;
    }
    
    const newSelection: PortionSelection = {
      id: generateUUID(),
      start: newStart,
      end: newEnd,
      gapFrameCount: defaultGapFrameCount,
      prompt: '',
    };
    setSelections(prev => [...prev, newSelection]);
    setActiveSelectionId(newSelection.id);
  }, [videoDuration, selections, defaultGapFrameCount]);
  
  // Remove selection handler
  const handleRemoveSelection = useCallback((id: string) => {
    setSelections(prev => {
      const filtered = prev.filter(s => s.id !== id);
      // Always keep at least one selection
      if (filtered.length === 0) {
        return [{ id: generateUUID(), start: videoDuration * 0.1, end: videoDuration * 0.2, gapFrameCount: defaultGapFrameCount, prompt: '' }];
      }
      return filtered;
    });
    if (activeSelectionId === id) {
      setActiveSelectionId(null);
    }
  }, [activeSelectionId, videoDuration, defaultGapFrameCount]);
  
  // Update a selection's per-segment settings
  const handleUpdateSelectionSettings = useCallback((id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt'>>) => {
    setSelections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);
  
  // Validation
  const validation = useMemo(() => {
    const errors: string[] = [];
    
    if (selections.length === 0) {
      errors.push('No portions selected');
      return { isValid: false, errors };
    }
    
    // Check each selection individually
    for (let i = 0; i < selections.length; i++) {
      const s = selections[i];
      const selNum = selections.length > 1 ? ` #${i + 1}` : '';
      
      if (s.start >= s.end) {
        errors.push(`Portion${selNum}: Start must be before end`);
      }
      
      const duration = s.end - s.start;
      if (duration < 0.1) {
        errors.push(`Portion${selNum}: Too short (min 0.1s)`);
      }
      
      if (s.start < 0) {
        errors.push(`Portion${selNum}: Starts before video`);
      }
      if (videoDuration > 0 && s.end > videoDuration) {
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
  }, [selections, videoDuration]);
  
  // Convert selections to frame ranges with per-segment settings
  const selectionsToFrameRanges = useCallback((fps: number, globalGapFrameCount: number, globalPrompt: string) => {
    return selections.map(s => ({
      start_frame: Math.round(s.start * fps),
      end_frame: Math.round(s.end * fps),
      start_time_seconds: s.start,
      end_time_seconds: s.end,
      frame_count: Math.round((s.end - s.start) * fps),
      gap_frame_count: s.gapFrameCount ?? globalGapFrameCount,
      prompt: s.prompt || globalPrompt,
    }));
  }, [selections]);
  
  // Calculate max context frames based on shortest keeper clip
  // This prevents users from setting values that would exceed keeper clip lengths
  const maxContextFrames = useMemo(() => {
    const fps = 16; // Assume 16 FPS for AI-generated videos
    if (videoDuration <= 0 || selections.length === 0) return 30; // Default max
    
    const totalFrames = Math.round(videoDuration * fps);
    const frameRanges = selections.map(s => ({
      start_frame: Math.round(s.start * fps),
      end_frame: Math.round(s.end * fps),
    }));
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
  }, [videoDuration, selections]);
  
  // Generate mutation - creates an edit_video_orchestrator task
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('No project selected');
      if (!videoUrl) throw new Error('No video URL');
      if (!validation.isValid) throw new Error('Invalid portion selected');
      if (!media) throw new Error('No media selected');
      
      const fps = 16; // Assume 16 FPS for AI-generated videos
      const totalFrames = Math.round(videoDuration * fps);
      
      // Get global settings
      const globalPrompt = editSettings.settings.prompt || '';
      const negativePrompt = editSettings.settings.negativePrompt || '';
      const globalGapFrameCount = editSettings.settings.gapFrameCount || 12;
      const enhancePrompt = editSettings.settings.enhancePrompt ?? true;
      
      // Hardcoded settings
      const replaceMode = true;
      const keepBridgingImages = false;
      
      // Convert selections to frame ranges with per-segment settings
      const portionFrameRanges = selectionsToFrameRanges(fps, globalGapFrameCount, globalPrompt);
      
      // Calculate the minimum keeper clip length to cap context_frame_count
      // Keeper clips are the segments BETWEEN the portions being regenerated
      // context_frame_count cannot exceed the shortest keeper clip length
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
      const requestedContextFrameCount = editSettings.settings.contextFrameCount || 8;
      const safeMaxContextFrames = Math.max(1, minKeeperFrames - 1);
      const contextFrameCount = Math.min(requestedContextFrameCount, safeMaxContextFrames);
      
      if (contextFrameCount < requestedContextFrameCount) {
        console.log(`[VideoEdit] Capped context_frame_count from ${requestedContextFrameCount} to ${contextFrameCount} (min keeper clip: ${minKeeperFrames} frames, safe max: ${safeMaxContextFrames})`);
      }
      
      // Get LoRAs
      const lorasForTask = loraManager.selectedLoras
        .filter(l => l.path)
        .map(l => ({ path: l.path, strength: l.strength }));
      
      // Get resolution from project aspect ratio
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
      
      // Build phase config for lightning model
      const phaseConfig = {
        phases: [
          { 
            phase: 1, 
            guidance_scale: 3, 
            loras: [{ url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors", multiplier: "0.75" }] 
          },
          { 
            phase: 2, 
            guidance_scale: 1, 
            loras: [{ url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors", multiplier: "1.0" }] 
          },
          { 
            phase: 3, 
            guidance_scale: 1, 
            loras: [{ url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors", multiplier: "1.0" }] 
          }
        ],
        flow_shift: 5,
        num_phases: 3,
        sample_solver: "euler",
        steps_per_phase: [2, 2, 2],
        model_switch_phase: 2
      };
      
      // Build orchestrator details for edit_video_orchestrator
      const orchestratorDetails: Record<string, unknown> = {
        run_id: generateRunId(),
        priority: editSettings.settings.priority || 0,
        tool_type: 'edit-video', // For filtering results in gallery
        
        // Source video info
        source_video_url: videoUrl,
        source_video_fps: fps,
        source_video_total_frames: Math.round(videoDuration * fps),
        
        // Portions to regenerate with per-segment settings
        portions_to_regenerate: portionFrameRanges,
        
        // Model settings
        model: editSettings.settings.model || 'wan_2_2_vace_lightning_baseline_2_2_2',
        resolution: resolutionTuple || [902, 508],
        seed: editSettings.settings.seed ?? -1,
        
        // Frame settings (global defaults)
        context_frame_count: contextFrameCount,
        gap_frame_count: globalGapFrameCount,
        replace_mode: replaceMode,
        keep_bridging_images: keepBridgingImages,
        
        // Prompt settings
        prompt: globalPrompt,
        negative_prompt: negativePrompt,
        enhance_prompt: enhancePrompt,
        
        // Inference settings
        num_inference_steps: editSettings.settings.numInferenceSteps || 6,
        guidance_scale: editSettings.settings.guidanceScale || 3,
        phase_config: phaseConfig,
        
        // Parent generation for tracking
        parent_generation_id: media.id,
      };
      
      // Add LoRAs if provided
      if (lorasForTask.length > 0) {
        orchestratorDetails.loras = lorasForTask;
      }
      
      console.log('[VideoEdit] Creating edit_video_orchestrator task:', {
        fps,
        duration: videoDuration,
        portions: portionFrameRanges,
        orchestratorDetails,
      });
      
      // Create the task using the createTask function
      // Note: tool_type and parent_generation_id must be at top level for complete_task variant creation
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
      // No success toast per .cursorrules
      setGenerateSuccess(true);
      setTimeout(() => setGenerateSuccess(false), 3000);
      
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ 
        queryKey: ['unified-generations', 'project', selectedProjectId]
      });
    },
    onError: (error) => {
      console.error('[VideoEdit] Task creation failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create regeneration task');
    },
  });
  
  // Handle generate
  const handleGenerate = useCallback(() => {
    if (!validation.isValid) {
      toast.error('Please fix validation errors before generating');
      return;
    }
    generateMutation.mutate();
  }, [validation.isValid, generateMutation]);
  
  // Enter video edit mode
  const handleEnterVideoEditMode = useCallback(() => {
    console.log('[VideoEdit] Entering video edit mode');
    setIsVideoEditMode(true);
  }, []);
  
  // Exit video edit mode
  const handleExitVideoEditMode = useCallback(() => {
    console.log('[VideoEdit] Exiting video edit mode');
    setIsVideoEditMode(false);
    onExitVideoEditMode?.();
  }, [onExitVideoEditMode]);
  
  return {
    // Mode state
    isVideoEditMode,
    setIsVideoEditMode,
    
    // Video ref
    videoRef,
    
    // Portion selections
    selections,
    activeSelectionId,
    handleUpdateSelection,
    handleAddSelection,
    handleRemoveSelection,
    setActiveSelectionId,
    handleUpdateSelectionSettings,
    
    // Validation
    isValid: validation.isValid,
    validationErrors: validation.errors,
    maxContextFrames,
    
    // Settings
    editSettings,
    
    // LoRA management
    loraManager,
    availableLoras,
    
    // Generation
    handleGenerate,
    isGenerating: generateMutation.isPending,
    generateSuccess,
    
    // Handlers
    handleEnterVideoEditMode,
    handleExitVideoEditMode,
  };
};

