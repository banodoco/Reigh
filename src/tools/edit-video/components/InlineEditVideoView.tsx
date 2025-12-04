import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import { X, ArrowLeft, Film, Loader2, Check, Plus } from 'lucide-react';
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

// Detect video FPS using requestVideoFrameCallback or fallback methods
async function detectVideoFPS(videoElement: HTMLVideoElement): Promise<number> {
  return new Promise((resolve) => {
    // Method 1: Use requestVideoFrameCallback if available (most accurate)
    if ('requestVideoFrameCallback' in videoElement) {
      let frameCount = 0;
      let startTime = 0;
      const targetFrames = 10; // Sample 10 frames for accuracy
      
      const countFrames = (now: number, metadata: any) => {
        if (frameCount === 0) {
          startTime = metadata.mediaTime;
        }
        frameCount++;
        
        if (frameCount >= targetFrames) {
          const elapsed = metadata.mediaTime - startTime;
          if (elapsed > 0) {
            const fps = Math.round((frameCount - 1) / elapsed);
            // Snap to common FPS values (including 16 for AI-generated videos)
            const commonFps = [16, 24, 25, 30, 48, 50, 60];
            const closestFps = commonFps.reduce((prev, curr) => 
              Math.abs(curr - fps) < Math.abs(prev - fps) ? curr : prev
            );
            resolve(closestFps);
          } else {
            resolve(16); // Fallback
          }
        } else {
          (videoElement as any).requestVideoFrameCallback(countFrames);
        }
      };
      
      // Need video to be playing to count frames
      const wasPlaying = !videoElement.paused;
      const originalTime = videoElement.currentTime;
      videoElement.muted = true;
      videoElement.currentTime = 0;
      
      videoElement.play().then(() => {
        (videoElement as any).requestVideoFrameCallback(countFrames);
        
        // Timeout fallback
        setTimeout(() => {
          videoElement.pause();
          videoElement.currentTime = originalTime;
          if (!wasPlaying) videoElement.pause();
          if (frameCount < targetFrames) {
            resolve(16); // Default fallback
          }
        }, 1000);
      }).catch(() => resolve(16));
      
    } else {
      // Method 2: Fallback - assume 16fps (common for AI-generated videos)
      resolve(16);
    }
  });
}

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
}

export function InlineEditVideoView({ 
  media, 
  onClose, 
  onVideoSaved, 
  onNavigateToGeneration 
}: InlineEditVideoViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  
  // Get video URL
  const videoUrl = media.location || (media as any).url || (media as any).imageUrl;
  
  // Video duration and FPS state
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoFps, setVideoFps] = useState<number | null>(null);
  const [fpsDetectionStatus, setFpsDetectionStatus] = useState<'pending' | 'detecting' | 'detected' | 'fallback'>('pending');
  
  // Multiple portion selections - start at 10%-20% of video
  // Each selection can have its own gapFrameCount and prompt
  const [selections, setSelections] = useState<PortionSelection[]>([
    { id: generateUUID(), start: 0, end: 0, gapFrameCount: 12, prompt: '' } // Will be initialized when duration is known
  ]);
  
  // Currently active selection for editing
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);
  
  // Handler to update per-segment settings
  const handleUpdateSelectionSettings = useCallback((id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt'>>) => {
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
  
  // Handle video metadata loaded - also detect FPS
  const handleVideoLoadedMetadata = useCallback(async () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      if (Number.isFinite(duration) && duration > 0) {
        setVideoDuration(duration);
        // Initialize first selection to 10%-20% of video if not set
        setSelections(prev => {
          if (prev.length > 0 && prev[0].end === 0) {
            return [{ ...prev[0], start: duration * 0.1, end: duration * 0.2 }, ...prev.slice(1)];
          }
          return prev;
        });
        
        // Detect FPS
        if (fpsDetectionStatus === 'pending') {
          setFpsDetectionStatus('detecting');
          try {
            const fps = await detectVideoFPS(videoRef.current);
            setVideoFps(fps);
            setFpsDetectionStatus('detected');
            console.log('[EditVideo] Detected FPS:', fps);
          } catch (e) {
            console.warn('[EditVideo] FPS detection failed, using fallback:', e);
            setVideoFps(16); // 16fps is common for AI-generated videos
            setFpsDetectionStatus('fallback');
          }
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
    
    const newSelection: PortionSelection = {
      id: generateUUID(),
      start: newStart,
      end: newEnd,
      gapFrameCount: gapFrameCount, // Use current global default
      prompt: '',
    };
    setSelections(prev => [...prev, newSelection]);
    setActiveSelectionId(newSelection.id);
  }, [videoDuration, selections, gapFrameCount]);
  
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
  
  // Update a selection
  const handleUpdateSelection = useCallback((id: string, start: number, end: number) => {
    setSelections(prev => prev.map(s => 
      s.id === id ? { ...s, start, end } : s
    ));
  }, []);
  
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
        source_video_fps: videoFps,
        source_video_total_frames: Math.round(videoDuration * videoFps),
        
        // Portions to regenerate with per-segment settings
        portions_to_regenerate: portionFrameRanges,
        
        // Model settings
        model: editSettings.settings.model || 'wan_2_2_vace_lightning_baseline_2_2_2',
        resolution: resolutionTuple || [902, 508],
        seed: editSettings.settings.seed ?? -1,
        
        // Frame settings
        context_frame_count: contextFrameCount,
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
        isMobile ? "flex flex-col min-h-full" : "h-full flex flex-col md:flex-row"
      )}>
        {/* Header - Mobile only */}
        {isMobile && (
          <div className="flex items-center justify-between p-4 border-b">
            <Button variant="ghost" size="sm" onClick={onClose} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <h2 className="text-sm font-medium">Edit Video</h2>
            <div className="w-16" /> {/* Spacer for centering */}
          </div>
        )}
        
        {/* Video Display Area */}
        <div className={cn(
          "relative flex items-center justify-center bg-black",
          isMobile ? "w-full aspect-video" : "flex-1 h-full"
        )}>
          {/* Close button - Desktop */}
          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 left-4 z-10 bg-black/50 hover:bg-black/70 text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
          
          {/* Video Player */}
          <div className="w-full h-full flex items-center justify-center p-4">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="max-w-full max-h-full object-contain rounded-lg"
              onLoadedMetadata={handleVideoLoadedMetadata}
              preload="metadata"
            />
          </div>
          
          {/* Portion Selection Overlay */}
          {videoDuration > 0 && (
            <div className={cn(
              "absolute left-0 right-0 px-2 md:px-4",
              isMobile ? "bottom-0 pb-2" : "bottom-0 pb-4"
            )}>
              <div className={cn(
                "bg-black/80 backdrop-blur-sm rounded-lg",
                isMobile ? "p-2" : "p-3"
              )}>
                {/* Header - stack on mobile */}
                <div className={cn(
                  "mb-2",
                  isMobile ? "space-y-1" : "flex items-center justify-between"
                )}>
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-white/70 flex-shrink-0" />
                    <span className={cn(
                      "text-white/70",
                      isMobile ? "text-xs" : "text-sm"
                    )}>
                      {selections.length === 1 ? 'Tap handles to move' : `${selections.length} portions`}
                    </span>
                  </div>
                  {/* FPS indicator */}
                  <div className={cn(
                    "flex items-center gap-2",
                    isMobile ? "text-[10px] pl-6" : "text-xs"
                  )}>
                    {fpsDetectionStatus === 'detecting' && (
                      <span className="text-yellow-400 animate-pulse">Detecting...</span>
                    )}
                    {(fpsDetectionStatus === 'detected' || fpsDetectionStatus === 'fallback') && videoFps && (
                      <span className={cn(
                        "font-mono px-1.5 py-0.5 rounded",
                        fpsDetectionStatus === 'detected' ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                      )}>
                        {videoFps}fps
                      </span>
                    )}
                    {videoFps && videoDuration && (
                      <span className="text-white/50">
                        {Math.round(videoDuration * videoFps)}f
                      </span>
                    )}
                  </div>
                </div>
                {/* Timeline bar with multiple selections */}
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
                />
                {/* Add new selection button */}
                <div className="flex justify-center mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddSelection}
                    className={cn(
                      "text-white/70 hover:text-white hover:bg-white/10 gap-1",
                      isMobile && "text-xs h-7 px-2"
                    )}
                  >
                    <Plus className="w-3 h-3 md:w-4 md:h-4" />
                    Add selection
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Settings Panel */}
        <div className={cn(
          "bg-background border-l border-border overflow-y-auto",
          isMobile ? "w-full" : "w-[400px]"
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
            negativePrompt={negativePrompt}
            setNegativePrompt={(val) => editSettings.updateField('negativePrompt', val)}
            enhancePrompt={enhancePrompt}
            setEnhancePrompt={(val) => editSettings.updateField('enhancePrompt', val)}
            selections={selections}
            onUpdateSelectionSettings={handleUpdateSelectionSettings}
            availableLoras={availableLoras}
            projectId={selectedProjectId}
            loraManager={loraManager}
            onGenerate={handleGenerate}
            isGenerating={generateMutation.isPending}
            generateSuccess={showSuccessState}
            isGenerateDisabled={!isValidPortion}
            validationErrors={portionValidation.errors}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

// MultiPortionTimeline, FrameThumbnail, and formatTime are now imported from @/shared/components/VideoPortionTimeline
