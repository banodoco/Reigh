/**
 * Service for applying settings from a task to the current shot
 * Refactored from monolithic function for better maintainability and testability
 */

import { supabase } from '@/integrations/supabase/client';

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
  frames?: number;
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
  console.log('[ApplySettings] 📡 Fetching task from database...');
  
  const { data: taskRow, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  
  if (error || !taskRow) {
    console.error('[ApplySettings] ❌ Failed to fetch task:', error);
    return null;
  }
  
  console.log('[ApplySettings] ✅ Task fetched successfully');
  
  const params: any = taskRow.params || {};
  const orchestrator: any = params.full_orchestrator_payload || {};
  
  console.log('[ApplySettings] 🔍 Task data structure:', {
    hasParams: !!params,
    hasOrchestrator: !!orchestrator,
    paramsKeys: Object.keys(params).slice(0, 10),
    orchestratorKeys: Object.keys(orchestrator).slice(0, 10)
  });
  
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
    frames: orchestrator.segment_frames_expanded?.[0] ?? params.segment_frames_expanded,
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
    
    // LoRAs
    loras: orchestrator.loras ?? params.loras,
    
    // Structure video
    structureVideoPath: orchestrator.structure_video_path ?? params.structure_video_path,
    structureVideoTreatment: orchestrator.structure_video_treatment ?? params.structure_video_treatment,
    structureVideoMotionStrength: orchestrator.structure_video_motion_strength ?? params.structure_video_motion_strength,
    structureVideoType: orchestrator.structure_video_type ?? params.structure_video_type,
  };
  
  console.log('[ApplySettings] 📋 Extracted settings:', {
    prompt: extracted.prompt ? `"${extracted.prompt.substring(0, 50)}..."` : undefined,
    prompts: extracted.prompts ? `${extracted.prompts.length} prompts` : undefined,
    negativePrompt: extracted.negativePrompt ? `"${extracted.negativePrompt.substring(0, 30)}..."` : undefined,
    model: extracted.model,
    steps: extracted.steps,
    frames: extracted.frames,
    context: extracted.context,
    generationMode: extracted.generationMode,
    advancedMode: extracted.advancedMode,
    motionMode: extracted.motionMode,
    turboMode: extracted.turboMode,
    enhancePrompt: extracted.enhancePrompt,
    amountOfMotion: extracted.amountOfMotion,
    hasPhaseConfig: !!extracted.phaseConfig,
    hasLoras: !!(extracted.loras && extracted.loras.length > 0),
    lorasCount: extracted.loras?.length,
    structureVideo: {
      path: extracted.structureVideoPath || 'NOT SET',
      type: extracted.structureVideoType,
      treatment: extracted.structureVideoTreatment,
      motionStrength: extracted.structureVideoMotionStrength,
    }
  });
  
  // Log warning if structure video appears to exist but wasn't extracted
  if ((taskData.orchestrator.structure_video_path || taskData.params.structure_video_path) && !extracted.structureVideoPath) {
    console.error('[ApplySettings] ⚠️  Structure video in task params but extraction failed:', {
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
    console.log('[ApplySettings] ⏭️  Skipping model (no change or undefined)');
    return { success: true, settingName: 'model', details: 'skipped - no change' };
  }
  
  console.log('[ApplySettings] 🎨 Applying model:', {
    from: context.steerableMotionSettings.model_name,
    to: settings.model
  });
  
  context.onSteerableMotionSettingsChange({ model_name: settings.model });
  
  return { success: true, settingName: 'model', details: settings.model };
};

export const applyPromptSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply main prompt
  if (typeof settings.prompt === 'string' && settings.prompt.trim()) {
    console.log('[ApplySettings] 💬 Applying prompt:', {
      prompt: `"${settings.prompt.substring(0, 60)}..."`,
      length: settings.prompt.length
    });
    context.onBatchVideoPromptChange(settings.prompt);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping prompt (undefined, empty, or not string)');
  }
  
  // Apply individual prompts for timeline mode
  if (settings.prompts && settings.prompts.length > 1 && context.currentGenerationMode === 'timeline') {
    console.log('[ApplySettings] 📝 Applying individual prompts for timeline mode:', {
      promptCount: settings.prompts.length,
      hasNegativePrompts: !!(settings.negativePrompts && settings.negativePrompts.length > 0)
    });
    
    const errors: string[] = [];
    
    for (let i = 0; i < settings.prompts.length; i++) {
      const pairPrompt = settings.prompts[i]?.trim();
      const pairNegativePrompt = settings.negativePrompts?.[i]?.trim() || '';
      
      if (pairPrompt) {
        console.log('[ApplySettings] 📝 Applying prompt for pair', i, ':', {
          prompt: `"${pairPrompt.substring(0, 40)}..."`,
          hasNegativePrompt: !!pairNegativePrompt
        });
        
        if (context.updatePairPromptsByIndex) {
          try {
            await context.updatePairPromptsByIndex(i, pairPrompt, pairNegativePrompt);
          } catch (e) {
            const error = `Failed to apply prompt for pair ${i}: ${e}`;
            console.error(`[ApplySettings] ❌ ${error}`);
            errors.push(error);
          }
        }
      }
    }
    
    console.log('[ApplySettings] ✅ Individual prompts applied');
    
    if (errors.length > 0) {
      return { success: false, settingName: 'prompts', error: errors.join('; ') };
    }
  } else if (settings.prompts && settings.prompts.length > 1) {
    console.log('[ApplySettings] ⏭️  Skipping individual prompts (not in timeline mode)');
  }
  
  // Apply negative prompt
  if (settings.negativePrompt !== undefined) {
    console.log('[ApplySettings] 🚫 Applying negative prompt:', {
      hasContent: !!settings.negativePrompt,
      willClear: !settings.negativePrompt
    });
    context.onSteerableMotionSettingsChange({ negative_prompt: settings.negativePrompt || '' });
  } else {
    console.log('[ApplySettings] ⏭️  Skipping negative prompt (undefined)');
  }
  
  return { success: true, settingName: 'prompts' };
};

export const applyGenerationSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply frames
  if (typeof settings.frames === 'number' && !Number.isNaN(settings.frames)) {
    console.log('[ApplySettings] 🎞️  Applying frames:', {
      frames: settings.frames,
      currentFrames: context.batchVideoFrames
    });
    context.onBatchVideoFramesChange(settings.frames);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping frames (invalid or undefined)');
  }
  
  // Apply context
  if (typeof settings.context === 'number' && !Number.isNaN(settings.context)) {
    console.log('[ApplySettings] 🔗 Applying context:', {
      context: settings.context,
      currentContext: context.batchVideoContext
    });
    context.onBatchVideoContextChange(settings.context);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping context (invalid or undefined)');
  }
  
  // Apply steps
  if (typeof settings.steps === 'number' && !Number.isNaN(settings.steps)) {
    console.log('[ApplySettings] 👣 Applying steps:', {
      steps: settings.steps,
      currentSteps: context.batchVideoSteps
    });
    context.onBatchVideoStepsChange(settings.steps);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping steps (invalid or undefined)');
  }
  
  return { success: true, settingName: 'generation' };
};

export const applyModeSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply generation mode
  if (settings.generationMode && (settings.generationMode === 'batch' || settings.generationMode === 'timeline')) {
    console.log('[ApplySettings] 🎬 Applying generation mode:', {
      from: context.currentGenerationMode,
      to: settings.generationMode
    });
    context.onGenerationModeChange(settings.generationMode);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping generation mode (invalid or undefined)');
  }
  
  // Apply advanced mode
  if (settings.advancedMode !== undefined) {
    console.log('[ApplySettings] 🎛️  Applying advanced mode:', {
      from: context.currentAdvancedMode,
      to: settings.advancedMode,
      hasPhaseConfig: !!settings.phaseConfig
    });
    context.onAdvancedModeChange(settings.advancedMode);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping advanced mode (undefined)');
  }
  
  // Apply motion mode
  if (settings.motionMode !== undefined && context.onMotionModeChange) {
    console.log('[ApplySettings] 🎨 Applying motion mode:', {
      from: context.motionMode,
      to: settings.motionMode
    });
    context.onMotionModeChange(settings.motionMode);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping motion mode (undefined or no handler)');
  }
  
  return { success: true, settingName: 'modes' };
};

export const applyAdvancedModeSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply phase config
  if (settings.phaseConfig) {
    console.log('[ApplySettings] ⚙️  Applying phase configuration:', {
      num_phases: settings.phaseConfig.num_phases,
      phases_count: settings.phaseConfig.phases?.length,
      steps_per_phase: settings.phaseConfig.steps_per_phase,
      flow_shift: settings.phaseConfig.flow_shift,
      model_switch_phase: settings.phaseConfig.model_switch_phase,
      sample_solver: settings.phaseConfig.sample_solver
    });
    context.onPhaseConfigChange(settings.phaseConfig);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping phase config (undefined)');
  }
  
  // Apply phase preset ID
  if (settings.selectedPhasePresetId !== undefined) {
    console.log('[ApplySettings] 📌 Applying phase preset ID:', {
      presetId: settings.selectedPhasePresetId ? settings.selectedPhasePresetId.substring(0, 8) : null
    });
    
    if (settings.selectedPhasePresetId && context.onPhasePresetSelect && settings.phaseConfig) {
      context.onPhasePresetSelect(settings.selectedPhasePresetId, settings.phaseConfig);
    } else if (!settings.selectedPhasePresetId && context.onPhasePresetRemove) {
      console.log('[ApplySettings] 🗑️  Clearing preset (task had no preset selected)');
      context.onPhasePresetRemove();
    }
  } else {
    console.log('[ApplySettings] ⏭️  Skipping phase preset ID (undefined)');
  }
  
  // Apply turbo mode
  if (settings.turboMode !== undefined && context.onTurboModeChange) {
    console.log('[ApplySettings] ⚡ Applying turbo mode:', {
      from: context.turboMode,
      to: settings.turboMode
    });
    context.onTurboModeChange(settings.turboMode);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping turbo mode (undefined or no handler)');
  }
  
  // Apply enhance prompt
  if (settings.enhancePrompt !== undefined && context.onEnhancePromptChange) {
    console.log('[ApplySettings] ✨ Applying enhance prompt:', {
      from: context.enhancePrompt,
      to: settings.enhancePrompt
    });
    context.onEnhancePromptChange(settings.enhancePrompt);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping enhance prompt (undefined or no handler)');
  }
  
  return { success: true, settingName: 'advancedMode' };
};

export const applyTextPromptAddons = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Apply text before prompts
  if (settings.textBeforePrompts !== undefined && context.onTextBeforePromptsChange) {
    console.log('[ApplySettings] 📝 Applying text before prompts:', {
      from: context.textBeforePrompts ? `"${context.textBeforePrompts.substring(0, 30)}..."` : '(empty)',
      to: settings.textBeforePrompts ? `"${settings.textBeforePrompts.substring(0, 30)}..."` : '(empty)'
    });
    context.onTextBeforePromptsChange(settings.textBeforePrompts);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping text before prompts (undefined or no handler)');
  }
  
  // Apply text after prompts
  if (settings.textAfterPrompts !== undefined && context.onTextAfterPromptsChange) {
    console.log('[ApplySettings] 📝 Applying text after prompts:', {
      from: context.textAfterPrompts ? `"${context.textAfterPrompts.substring(0, 30)}..."` : '(empty)',
      to: settings.textAfterPrompts ? `"${settings.textAfterPrompts.substring(0, 30)}..."` : '(empty)'
    });
    context.onTextAfterPromptsChange(settings.textAfterPrompts);
  } else {
    console.log('[ApplySettings] ⏭️  Skipping text after prompts (undefined or no handler)');
  }
  
  return { success: true, settingName: 'textAddons' };
};

export const applyMotionSettings = async (
  settings: ExtractedSettings,
  context: ApplyContext
): Promise<ApplyResult> => {
  // Only apply if NOT in advanced mode
  if (settings.amountOfMotion !== undefined && !settings.advancedMode && context.onAmountOfMotionChange) {
    console.log('[ApplySettings] 🎢 Applying amount of motion:', {
      from: context.amountOfMotion,
      to: settings.amountOfMotion * 100,
      rawValue: settings.amountOfMotion
    });
    context.onAmountOfMotionChange(settings.amountOfMotion * 100);
  } else if (settings.advancedMode) {
    console.log('[ApplySettings] ⏭️  Skipping amount of motion (advanced mode enabled)');
  } else {
    console.log('[ApplySettings] ⏭️  Skipping amount of motion (undefined or no handler)');
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
      console.log('[ApplySettings] ⏭️  Skipping LoRAs (advanced mode enabled)');
    } else {
      console.log('[ApplySettings] ⏭️  Skipping LoRAs (undefined)');
    }
    return { success: true, settingName: 'loras', details: 'skipped' };
  }
  
  if (settings.loras && settings.loras.length > 0) {
    console.log('[ApplySettings] 🎨 Applying LoRAs from task:', {
      lorasCount: settings.loras.length,
      loras: settings.loras.map(l => ({
        path: l.path.split('/').pop(),
        strength: l.strength
      }))
    });
    
    // Clear existing LoRAs first
    console.log('[ApplySettings] 🗑️  Clearing existing LoRAs...');
    if (context.loraManager.setSelectedLoras) {
      context.loraManager.setSelectedLoras([]);
    }
    
    // Map paths to available LoRAs and restore them (with delay to ensure state is cleared)
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('[ApplySettings] 🔍 Matching and adding LoRAs...');
        let matchedCount = 0;
        
        settings.loras!.forEach(loraData => {
          const matchingLora = context.availableLoras.find(lora => {
            const loraUrl = (lora as any).huggingface_url || lora['Download Link'] || '';
            return loraUrl === loraData.path ||
                   loraUrl.endsWith(loraData.path) ||
                   loraData.path.endsWith(loraUrl.split('/').pop() || '');
          });
          
          if (matchingLora) {
            console.log('[ApplySettings] ✅ Matched and adding LoRA:', {
              id: matchingLora['Model ID'],
              name: matchingLora.Name,
              strength: loraData.strength,
              path: loraData.path.split('/').pop()
            });
            context.loraManager.handleAddLora(matchingLora, false, loraData.strength);
            matchedCount++;
          } else {
            console.warn('[ApplySettings] ⚠️  Could not find matching LoRA for path:', loraData.path.split('/').pop());
          }
        });
        
        console.log('[ApplySettings] 📊 LoRA restoration complete:', {
          requested: settings.loras!.length,
          matched: matchedCount,
          failed: settings.loras!.length - matchedCount
        });
        
        resolve({
          success: true,
          settingName: 'loras',
          details: { matched: matchedCount, total: settings.loras!.length }
        });
      }, 100);
    });
  } else {
    // Task has no LoRAs - clear existing ones
    console.log('[ApplySettings] 🗑️  Clearing LoRAs (task had none)');
    if (context.loraManager.setSelectedLoras) {
      context.loraManager.setSelectedLoras([]);
    }
    return { success: true, settingName: 'loras', details: 'cleared' };
  }
};

export const applyStructureVideo = async (
  settings: ExtractedSettings,
  context: ApplyContext,
  taskData: TaskData
): Promise<ApplyResult> => {
  const hasStructureVideoInTask =
    taskData.orchestrator.hasOwnProperty('structure_video_path') ||
    taskData.params.hasOwnProperty('structure_video_path');
  
  if (!hasStructureVideoInTask) {
    // Check if structure video exists but hasOwnProperty check failed
    if (taskData.orchestrator.structure_video_path || taskData.params.structure_video_path) {
      console.error('[ApplySettings] ⚠️  WARNING: Structure video exists in task but hasOwnProperty check failed:', {
        orchestratorHasIt: !!taskData.orchestrator.structure_video_path,
        paramsHasIt: !!taskData.params.structure_video_path,
        orchestratorValue: taskData.orchestrator.structure_video_path,
        paramsValue: taskData.params.structure_video_path
      });
    }
    console.log('[ApplySettings] ⏭️  Skipping structure video (not defined in task params)');
    return { success: true, settingName: 'structureVideo', details: 'skipped - not in task' };
  }
  
  if (settings.structureVideoPath) {
    console.log('[ApplySettings] 🎥 Applying structure video:', {
      path: settings.structureVideoPath.substring(settings.structureVideoPath.lastIndexOf('/') + 1),
      treatment: settings.structureVideoTreatment,
      motionStrength: settings.structureVideoMotionStrength,
      type: settings.structureVideoType,
      fullPath: settings.structureVideoPath
    });
    
    try {
      context.handleStructureVideoChange(
        settings.structureVideoPath,
        null, // metadata will be fetched from the video path
        settings.structureVideoTreatment || 'adjust',
        settings.structureVideoMotionStrength ?? 1.0,
        settings.structureVideoType || 'flow'
      );
      console.log('[ApplySettings] ✅ Structure video change handler called successfully');
      return { success: true, settingName: 'structureVideo' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ApplySettings] ❌ ERROR applying structure video:', {
        error,
        errorMessage,
        path: settings.structureVideoPath,
        treatment: settings.structureVideoTreatment,
        motionStrength: settings.structureVideoMotionStrength,
        type: settings.structureVideoType
      });
      return {
        success: false,
        settingName: 'structureVideo',
        error: errorMessage
      };
    }
  } else {
    console.log('[ApplySettings] 🗑️  Clearing structure video (was null/undefined in task)');
    context.handleStructureVideoChange(null, null, 'adjust', 1.0, 'flow');
    return { success: true, settingName: 'structureVideo', details: 'cleared' };
  }
};

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
    console.log('[ApplySettings] ⏭️  Skipping image replacement (replaceImages = false)');
    return { success: true, settingName: 'images', details: 'skipped' };
  }
  
  if (!selectedShot?.id || !projectId) {
    console.log('[ApplySettings] ⏭️  Skipping image replacement (missing shot or project)');
    return { success: true, settingName: 'images', details: 'skipped - missing context' };
  }
  
  console.log('[ApplySettings] 🖼️  === REPLACING IMAGES ===', {
    shotId: selectedShot.id.substring(0, 8),
    existingImagesCount: simpleFilteredImages.length,
    newImagesCount: inputImages.length
  });
  
  try {
    // Remove existing non-video images
    const imagesToDelete = simpleFilteredImages.filter(img => !!img.shotImageEntryId);
    console.log('[ApplySettings] 🗑️  Removing existing images:', {
      count: imagesToDelete.length
    });
    
    const deletions = imagesToDelete.map(img => removeImageFromShotMutation.mutateAsync({
      shot_id: selectedShot.id,
      shotImageEntryId: img.shotImageEntryId!,
      project_id: projectId,
    }));
    
    if (deletions.length > 0) {
      await Promise.allSettled(deletions);
      console.log('[ApplySettings] ✅ Existing images removed');
    }
    
    // Calculate timeline positions based on segment_frames
    const segmentFrames = settings.frames || 60;
    
    console.log('[ApplySettings] 📐 Calculating timeline positions:', {
      segmentFrames,
      imageCount: inputImages.length,
      extractedFrom: settings.frames ? 'task params' : 'default fallback'
    });
    
    // Add input images in order with calculated timeline_frame positions
    const additions = (inputImages || []).map((url, index) => {
      const timelineFrame = index * segmentFrames;
      console.log('[ApplySettings] ➕ Adding image:', {
        index,
        filename: url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('/') + 20) + '...',
        timelineFrame,
        calculation: `${index} × ${segmentFrames} = ${timelineFrame}`
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
      console.log('[ApplySettings] ✅ New images added');
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

