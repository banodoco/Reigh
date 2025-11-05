/**
 * Service for applying settings from a task to the current shot
 * Refactored from monolithic function for better maintainability and testability
 */

import { supabase } from '@/integrations/supabase/client';
import { extractVideoMetadataFromUrl } from '@/shared/lib/videoUploader';

// ==================== Types ====================

export interface TaskData {
  params: any;
  orchestrator: any;
}

export interface ExtractedSettings {
  // Prompts
  prompt?: string;
  prompts?: string[];
  negativePrompt?: string;
  negativePrompts?: string[];
  
  // Generation settings
  steps?: number;
  frames?: number;  // Legacy: single value for uniform spacing
  segmentFramesExpanded?: number[];  // NEW: array of gaps between successive frames
  context?: number;
  model?: string;
  
  // Modes
  generationMode?: 'batch' | 'timeline';
  advancedMode?: boolean;
  motionMode?: 'basic' | 'presets' | 'advanced';
  
  // Advanced mode settings
  phaseConfig?: any;
  selectedPhasePresetId?: string | null;
  turboMode?: boolean;
  enhancePrompt?: boolean;
  
  // Text addons
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  
  // Motion
  amountOfMotion?: number;
  
  // LoRAs
  loras?: Array<{ path: string; strength: number }>;
  
  // Structure video
  structureVideoPath?: string | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'flow' | 'canny' | 'depth';
}

export interface ApplyResult {
  success: boolean;
  settingName: string;
  error?: string;
  details?: any;
}

export interface ApplyContext {
  // Current state
  currentGenerationMode: 'batch' | 'timeline';
  currentAdvancedMode: boolean;
  
  // Callbacks for applying settings
  onBatchVideoPromptChange: (prompt: string) => void;
  onSteerableMotionSettingsChange: (settings: any) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoContextChange: (context: number) => void;
  onBatchVideoStepsChange: (steps: number) => void;
  onGenerationModeChange: (mode: 'batch' | 'timeline') => void;
  onAdvancedModeChange: (advanced: boolean) => void;
  onMotionModeChange?: (mode: 'basic' | 'presets' | 'advanced') => void;
  onPhaseConfigChange: (config: any) => void;
  onPhasePresetSelect?: (presetId: string, config: any) => void;
  onPhasePresetRemove?: () => void;
  onTurboModeChange?: (turbo: boolean) => void;
  onEnhancePromptChange?: (enhance: boolean) => void;
  onTextBeforePromptsChange?: (text: string) => void;
  onTextAfterPromptsChange?: (text: string) => void;
  onAmountOfMotionChange?: (motion: number) => void;
  
  // Structure video
  handleStructureVideoChange: (
    videoPath: string | null,
    metadata: any | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'flow' | 'canny' | 'depth'
  ) => void;
  
  // LoRAs
  loraManager: {
    setSelectedLoras?: (loras: any[]) => void;
    handleAddLora: (lora: any, showToast: boolean, strength: number) => void;
  };
  availableLoras: any[];
  
  // Pair prompts (for timeline mode)
  updatePairPromptsByIndex?: (index: number, prompt: string, negativePrompt: string) => Promise<void>;
  
  // Current values for comparison
  steerableMotionSettings: { model_name: string };
  batchVideoFrames: number;
  batchVideoContext: number;
  batchVideoSteps: number;
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  turboMode?: boolean;
  enhancePrompt?: boolean;
  amountOfMotion?: number;
  motionMode?: 'basic' | 'presets' | 'advanced';
}

// ==================== Fetch Task ====================

export const fetchTask = async (taskId: string): Promise<TaskData | null> => {
  const { data: taskRow, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  
  if (error || !taskRow) {
    console.error('[ApplySettings] ❌ Failed to fetch task:', error);
    return null;
  }
  
  const params: any = taskRow.params || {};
  // FIX: Structure video is stored in orchestrator_details (new format), 
  // fallback to full_orchestrator_payload (old format)
  const orchestrator: any = params.orchestrator_details || params.full_orchestrator_payload || {};
  
  return { params, orchestrator };
};

// ==================== Extract Settings ====================

export const extractSettings = (taskData: TaskData): ExtractedSettings => {
  const { params, orchestrator } = taskData;
  
  // Extract all settings with fallbacks
  const extracted: ExtractedSettings = {
    // Prompts
    prompt: (
      (orchestrator.base_prompts_expanded?.[0] && orchestrator.base_prompts_expanded[0].trim()) ||
      (orchestrator.base_prompt && orchestrator.base_prompt.trim()) ||
      (params.prompt && params.prompt.trim()) ||
      undefined
    ),
    prompts: orchestrator.base_prompts_expanded,
    negativePrompt: orchestrator.negative_prompts_expanded?.[0] ?? params.negative_prompt,
    negativePrompts: orchestrator.negative_prompts_expanded,
    
    // Generation settings
    steps: orchestrator.steps ?? params.num_inference_steps,
    frames: orchestrator.segment_frames_expanded?.[0] ?? params.segment_frames_expanded, // Legacy: single value for backward compat
    segmentFramesExpanded: orchestrator.segment_frames_expanded ?? params.segment_frames_expanded, // NEW: full array of gaps
    context: orchestrator.frame_overlap_expanded?.[0] ?? params.frame_overlap_expanded,
    model: params.model_name ?? orchestrator.model_name,
    
    // Modes
    generationMode: orchestrator.generation_mode ?? params.generation_mode,
    advancedMode: orchestrator.advanced_mode ?? params.advanced_mode,
    motionMode: orchestrator.motion_mode ?? params.motion_mode,
    
    // Advanced mode settings
    phaseConfig: orchestrator.phase_config ?? params.phase_config,
    selectedPhasePresetId: orchestrator.selected_phase_preset_id ?? params.selected_phase_preset_id,
    turboMode: orchestrator.turbo_mode ?? params.turbo_mode,
    enhancePrompt: orchestrator.enhance_prompt ?? params.enhance_prompt,
    
    // Text addons
    textBeforePrompts: orchestrator.text_before_prompts ?? params.text_before_prompts,
    textAfterPrompts: orchestrator.text_after_prompts ?? params.text_after_prompts,
    
    // Motion
    amountOfMotion: orchestrator.amount_of_motion ?? params.amount_of_motion,
    
    // LoRAs - convert from object format to array format
    // Backend stores as { "url": strength, ... } but we need [{ path, strength }, ...]
    loras: (() => {
      const loraData = orchestrator.loras ?? orchestrator.additional_loras ?? params.loras ?? params.additional_loras;
      if (!loraData) return undefined;
      
      // If already array format, return as-is
      if (Array.isArray(loraData)) return loraData;
      
      // Convert object format to array format
      return Object.entries(loraData).map(([path, strength]) => ({
        path,
        strength: strength as number
      }));
    })(),
    
    // Structure video
    structureVideoPath: orchestrator.structure_video_path ?? params.structure_video_path,
    structureVideoTreatment: orchestrator.structure_video_treatment ?? params.structure_video_treatment,
    structureVideoMotionStrength: orchestrator.structure_video_motion_strength ?? params.structure_video_motion_strength,
    // Note: Backend uses both "structure_type" and "structure_video_type" - check both
    structureVideoType: orchestrator.structure_video_type ?? orchestrator.structure_type ?? params.structure_video_type ?? params.structure_type,
  };
  
  // USE console.error for structure video fields so they show in production
  // Log warning if structure video appears to exist but wasn't extracted
  if ((taskData.orchestrator.structure_video_path || taskData.params.structure_video_path) && !extracted.structureVideoPath) {
    console.warn('[ApplySettings] ⚠️  Structure video in task params but extraction failed:', {
      orchestratorValue: taskData.orchestrator.structure_video_path,
      paramsValue: taskData.params.structure_video_path,
      extractedValue: extracted.structureVideoPath,
    });
  }
  
  return extracted;
};

// ==================== Apply Functions ====================

export const applyModelSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  if (!settings.model || settings.model === context.steerableMotionSettings.model_name) {
    ');
    return { success: true, settingName: 'model', details: 'skipped - no change' };
  }
  
  context.onSteerableMotionSettingsChange({ model_name: settings.model });
  
  return { success: true, settingName: 'model', details: settings.model };
};

export const applyPromptSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply main prompt
  if (typeof settings.prompt === 'string' && settings.prompt.trim()) {
    context.onBatchVideoPromptChange(settings.prompt);
  }
  
  // Apply individual prompts to pair configs (regardless of current mode)
  // These prompts populate the pair fields whether you're in batch or timeline mode
  if (settings.prompts && settings.prompts.length > 1 && context.updatePairPromptsByIndex) {
    const errors: string[] = [];
    const successes: number[] = [];
    
    for (let i = 0; i < settings.prompts.length; i++) {
      const pairPrompt = settings.prompts[i]?.trim();
      const pairNegativePrompt = settings.negativePrompts?.[i]?.trim() || '';
      
      if (pairPrompt) {
        try {
          await context.updatePairPromptsByIndex(i, pairPrompt, pairNegativePrompt);
          successes.push(i);
        } catch (e) {
          const error = `Failed to apply prompt for pair ${i}: ${e}`;
          console.error(`[ApplySettings] ❌ ${error}`, e);
          errors.push(error);
        }
      }
    }
    
    if (errors.length > 0) {
      return { success: false, settingName: 'prompts', error: errors.join('; ') };
    }
  }
  
  // Apply negative prompt
  if (settings.negativePrompt !== undefined) {
    context.onSteerableMotionSettingsChange({ negative_prompt: settings.negativePrompt || '' });
  }
  
  return { success: true, settingName: 'prompts' };
};

export const applyGenerationSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply frames
  if (typeof settings.frames === 'number' && !Number.isNaN(settings.frames)) {
    context.onBatchVideoFramesChange(settings.frames);
  }
  
  // Apply context
  if (typeof settings.context === 'number' && !Number.isNaN(settings.context)) {
    context.onBatchVideoContextChange(settings.context);
  }
  
  // Apply steps
  if (typeof settings.steps === 'number' && !Number.isNaN(settings.steps)) {
    context.onBatchVideoStepsChange(settings.steps);
  }
  
  return { success: true, settingName: 'generation' };
};

export const applyModeSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply generation mode
  if (settings.generationMode && (settings.generationMode === 'batch' || settings.generationMode === 'timeline')) {
    context.onGenerationModeChange(settings.generationMode);
  }
  
  // Apply advanced mode
  if (settings.advancedMode !== undefined) {
    context.onAdvancedModeChange(settings.advancedMode);
  }
  
  // Apply motion mode
  if (settings.motionMode !== undefined && context.onMotionModeChange) {
    context.onMotionModeChange(settings.motionMode);
  }
  
  return { success: true, settingName: 'modes' };
};

export const applyAdvancedModeSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply phase config
  if (settings.phaseConfig) {
    context.onPhaseConfigChange(settings.phaseConfig);
  }
  
  // Apply phase preset ID
  if (settings.selectedPhasePresetId !== undefined) {
    if (settings.selectedPhasePresetId && context.onPhasePresetSelect && settings.phaseConfig) {
      context.onPhasePresetSelect(settings.selectedPhasePresetId, settings.phaseConfig);
    } else if (!settings.selectedPhasePresetId && context.onPhasePresetRemove) {
      context.onPhasePresetRemove();
    }
  }
  
  // Apply turbo mode
  if (settings.turboMode !== undefined && context.onTurboModeChange) {
    context.onTurboModeChange(settings.turboMode);
  }
  
  // Apply enhance prompt
  if (settings.enhancePrompt !== undefined && context.onEnhancePromptChange) {
    context.onEnhancePromptChange(settings.enhancePrompt);
  }
  
  return { success: true, settingName: 'advancedMode' };
};

export const applyTextPromptAddons = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply text before prompts
  if (settings.textBeforePrompts !== undefined && context.onTextBeforePromptsChange) {
    }..."` : '(empty)',
      to: settings.textBeforePrompts ? `"${settings.textBeforePrompts.substring(0, 30)}..."` : '(empty)'
    });
    context.onTextBeforePromptsChange(settings.textBeforePrompts);
  } else {
    ');
  }
  
  // Apply text after prompts
  if (settings.textAfterPrompts !== undefined && context.onTextAfterPromptsChange) {
    }..."` : '(empty)',
      to: settings.textAfterPrompts ? `"${settings.textAfterPrompts.substring(0, 30)}..."` : '(empty)'
    });
    context.onTextAfterPromptsChange(settings.textAfterPrompts);
  } else {
    ');
  }
  
  return { success: true, settingName: 'textAddons' };
};

export const applyMotionSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Only apply if NOT in advanced mode
  if (settings.amountOfMotion !== undefined && !settings.advancedMode && context.onAmountOfMotionChange) {
    context.onAmountOfMotionChange(settings.amountOfMotion * 100);
  } else if (settings.advancedMode) {
    ');
  } else {
    ');
  }
  
  return { success: true, settingName: 'motion' };
};

export const applyLoRAs = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Only apply if NOT in advanced mode
  if (settings.loras === undefined || settings.advancedMode) {
    if (settings.advancedMode) {
      ');
    } else {
      ');
    }
    return { success: true, settingName: 'loras', details: 'skipped' };
  }
  
  if (settings.loras && settings.loras.length > 0) {
    .pop(),
        strength: l.strength
      }))
    });
    
    // Clear existing LoRAs first
    if (context.loraManager.setSelectedLoras) {
      context.loraManager.setSelectedLoras([]);
    }
    
    // Map paths to available LoRAs and restore them (with delay to ensure state is cleared)
    return new Promise((resolve) => {
      setTimeout(() => {
        let matchedCount = 0;
        
        settings.loras!.forEach(loraData => {
          const matchingLora = context.availableLoras.find(lora => {
            const loraUrl = (lora as any).huggingface_url || lora['Download Link'] || '';
            return loraUrl === loraData.path ||
                   loraUrl.endsWith(loraData.path) ||
                   loraData.path.endsWith(loraUrl.split('/').pop() || '');
          });
          
          if (matchingLora) {
            .pop()
            });
            context.loraManager.handleAddLora(matchingLora, false, loraData.strength);
            matchedCount++;
          } else {
            console.warn('[ApplySettings] ⚠️  Could not find matching LoRA for path:', loraData.path.split('/').pop());
          }
        });
        
        resolve({ success: true, settingName: 'loras', details: `${matchedCount}/${settings.loras!.length} matched` });
      }, 100); // Small delay to ensure state clears
    });
  } else {
    ');
    if (context.loraManager.setSelectedLoras) {
      context.loraManager.setSelectedLoras([]);
    }
    return { success: true, settingName: 'loras', details: 'cleared' };
  }
};

// ==================== Apply Structure Video ====================

export const applyStructureVideo = async (
  settings: ExtractedSettings,
  context: ApplyContext,
  taskData: TaskData
): Promise<ApplyResult> => {
  const orchestratorHasField = 'structure_video_path' in taskData.orchestrator;
  const paramsHasField = 'structure_video_path' in taskData.params;
  const hasStructureVideoInTask = orchestratorHasField || paramsHasField;
  
  if (!hasStructureVideoInTask) {
    return { success: true, settingName: 'structureVideo', details: 'skipped - not in task' };
  }
  
  if (settings.structureVideoPath) {
    if (!context.handleStructureVideoChange) {
      console.error('[ApplySettings] ❌ handleStructureVideoChange is not defined in context!');
      return {
        success: false,
        settingName: 'structureVideo',
        error: 'handleStructureVideoChange not defined in context'
      };
    }
    
    try {
      let metadata = null;
      try {
        metadata = await extractVideoMetadataFromUrl(settings.structureVideoPath);
      } catch (metadataError) {
        console.warn('[ApplySettings] ⚠️  Failed to extract metadata, proceeding without it:', metadataError);
      }
      
      context.handleStructureVideoChange(
        settings.structureVideoPath,
        metadata,
        settings.structureVideoTreatment || 'adjust',
        settings.structureVideoMotionStrength ?? 1.0,
        settings.structureVideoType || 'flow'
      );
      
      return { success: true, settingName: 'structureVideo' };
    } catch (error) {
      console.error('[ApplySettings] ❌ ERROR applying structure video:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        path: settings.structureVideoPath,
        treatment: settings.structureVideoTreatment,
        motionStrength: settings.structureVideoMotionStrength,
        type: settings.structureVideoType
      });
      return {
        success: false,
        settingName: 'structureVideo',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  } else {
    if (context.handleStructureVideoChange) {
      context.handleStructureVideoChange(null, null, 'adjust', 1.0, 'flow');
    }
    return { success: true, settingName: 'structureVideo', details: 'cleared' };
  }
};

// ==================== Apply Frame Positions ====================

/**
 * Apply frame positions from segment_frames_expanded to existing images
 * This is used when settings are applied WITHOUT replacing images
 */
export const applyFramePositionsToExistingImages = async (
  settings: ExtractedSettings,
  selectedShot: any,
  simpleFilteredImages: any[]
): Promise<ApplyResult> => {
  const segmentGaps = settings.segmentFramesExpanded;
  const hasSegmentGaps = Array.isArray(segmentGaps) && segmentGaps.length > 0;
  
  if (!hasSegmentGaps) {
    return { success: true, settingName: 'framePositions', details: 'no data' };
  }
  
  if (!selectedShot?.id) {
    return { success: true, settingName: 'framePositions', details: 'skipped - no shot' };
  }
  
  // Calculate cumulative positions from gaps
  const cumulativePositions: number[] = [0]; // First image always at frame 0
  for (let i = 0; i < segmentGaps.length; i++) {
    const prevPosition = cumulativePositions[cumulativePositions.length - 1];
    cumulativePositions.push(prevPosition + segmentGaps[i]);
  }
  
  ,
    imageCount: simpleFilteredImages.length,
    segmentGaps,
    cumulativePositions: cumulativePositions.slice(0, simpleFilteredImages.length),
    positionsToApply: Math.min(simpleFilteredImages.length, cumulativePositions.length)
  });
  
  try {
    // Update timeline_frame for each image
    const updates = simpleFilteredImages.map(async (img, index) => {
      if (!img.shotImageEntryId) {
        console.warn('[ApplySettings] ⚠️  Skipping image without shotImageEntryId:', index);
        return null;
      }
      
      // Use cumulative position if available
      const newTimelineFrame = index < cumulativePositions.length 
        ? cumulativePositions[index]
        : cumulativePositions[cumulativePositions.length - 1] + (index - cumulativePositions.length + 1) * (segmentGaps[segmentGaps.length - 1] || 60);
      
      ,
        oldTimelineFrame: img.timeline_frame,
        newTimelineFrame,
        source: index < cumulativePositions.length ? 'cumulative position' : 'extrapolated'
      });
      
      const { error } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: newTimelineFrame })
        .eq('id', img.shotImageEntryId);
      
      if (error) {
        console.error('[ApplySettings] ❌ Failed to update timeline_frame:', error);
        return null;
      }
      
      return { shotImageEntryId: img.shotImageEntryId, newTimelineFrame };
    });
    
    const results = await Promise.all(updates);
    const successCount = results.filter(r => r !== null).length;
    
    return {
      success: true,
      settingName: 'framePositions',
      details: { updated: successCount, total: simpleFilteredImages.length }
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('[ApplySettings] ❌ Error applying frame positions:', e);
    return {
      success: false,
      settingName: 'framePositions',
      error: errorMessage
    };
  }
};

// ==================== Replace Images ====================

export const replaceImagesIfRequested = async (
  settings: ExtractedSettings,
  replaceImages: boolean,
  inputImages: string[],
  selectedShot: any,
  projectId: string,
  simpleFilteredImages: any[],
  addImageToShotMutation: any,
  removeImageFromShotMutation: any
): Promise<ApplyResult> => {
  if (!replaceImages) {
    ');
    // NEW: Apply frame positions to existing images even when not replacing
    return await applyFramePositionsToExistingImages(settings, selectedShot, simpleFilteredImages);
  }
  
  if (!selectedShot?.id || !projectId) {
    ');
    return { success: true, settingName: 'images', details: 'skipped - missing context' };
  }
  
  ,
    existingImagesCount: simpleFilteredImages.length,
    newImagesCount: inputImages.length
  });
  
  try {
    // Remove existing non-video images
    const imagesToDelete = simpleFilteredImages.filter(img => !!img.shotImageEntryId);
    const deletions = imagesToDelete.map(img => removeImageFromShotMutation.mutateAsync({
      shot_id: selectedShot.id,
      shotImageEntryId: img.shotImageEntryId!,
      project_id: projectId,
    }));
    
    if (deletions.length > 0) {
      await Promise.allSettled(deletions);
      }
    
    // Calculate timeline positions from segment_frames_expanded array
    // segment_frames_expanded contains GAPS between successive frames
    // e.g., [65, 37, 21] means: image0=0, image1=0+65=65, image2=65+37=102, image3=102+21=123
    const segmentGaps = settings.segmentFramesExpanded;
    const hasSegmentGaps = Array.isArray(segmentGaps) && segmentGaps.length > 0;
    
    // Calculate cumulative positions from gaps
    let cumulativePositions: number[] = [];
    if (hasSegmentGaps) {
      cumulativePositions = [0]; // First image always at frame 0
      for (let i = 0; i < segmentGaps.length; i++) {
        const prevPosition = cumulativePositions[cumulativePositions.length - 1];
        cumulativePositions.push(prevPosition + segmentGaps[i]);
      }
    }
    
    // Fallback to uniform spacing if no segment_frames_expanded
    const uniformSpacing = settings.frames || 60;
    
    ' : 'default fallback')
    });
    
    // Add input images in order with calculated timeline_frame positions
    const additions = (inputImages || []).map((url, index) => {
      // Use cumulative position if available, otherwise fall back to uniform spacing
      const timelineFrame = hasSegmentGaps && index < cumulativePositions.length
        ? cumulativePositions[index]
        : index * uniformSpacing;
      
      + 1, url.lastIndexOf('/') + 20) + '...',
        timelineFrame,
        calculation: hasSegmentGaps 
          ? `cumulative position from gaps: ${cumulativePositions[index]}` 
          : `uniform spacing: ${index} × ${uniformSpacing} = ${timelineFrame}`
      });
      
      return addImageToShotMutation.mutateAsync({
        shot_id: selectedShot.id,
        generation_id: '',
        project_id: projectId,
        imageUrl: url,
        thumbUrl: url,
        timelineFrame: timelineFrame,
      } as any);
    });
    
    if (additions.length > 0) {
      await Promise.allSettled(additions);
      }
    
    return {
      success: true,
      settingName: 'images',
      details: { removed: imagesToDelete.length, added: inputImages.length }
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('[ApplySettings] ❌ Error replacing images:', e);
    return {
      success: false,
      settingName: 'images',
      error: errorMessage
    };
  }
};

