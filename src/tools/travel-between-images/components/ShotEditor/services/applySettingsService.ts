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
  // FIX: Structure video is stored in orchestrator_details (new format), 
  // fallback to full_orchestrator_payload (old format)
  const orchestrator: any = params.orchestrator_details || params.full_orchestrator_payload || {};
  
  // USE console.error so this shows in production logs
  console.error('[ApplySettings] 🔍 TASK DATA STRUCTURE:', {
    hasParams: !!params,
    hasOrchestratorDetails: !!params.orchestrator_details,
    hasFullOrchestratorPayload: !!params.full_orchestrator_payload,
    usingOrchestrator: params.orchestrator_details ? 'orchestrator_details' : (params.full_orchestrator_payload ? 'full_orchestrator_payload' : 'none'),
    paramsKeys: Object.keys(params).slice(0, 15),
    orchestratorKeys: Object.keys(orchestrator).slice(0, 15),
    structureVideoPath: orchestrator.structure_video_path || 'NOT FOUND',
    basePromptsInOrchestratorDetails: params.orchestrator_details?.base_prompts_expanded,
    basePromptsInFullPayload: params.full_orchestrator_payload?.base_prompts_expanded,
    basePromptsInSelectedOrchestrator: orchestrator.base_prompts_expanded,
    // MOST SUSPECT: Show actual orchestrator content for structure video fields
    orchestrator_structure_fields: {
      structure_video_path: orchestrator.structure_video_path,
      structure_video_treatment: orchestrator.structure_video_treatment,
      structure_video_motion_strength: orchestrator.structure_video_motion_strength,
      structure_video_type: orchestrator.structure_video_type,
      structure_type: orchestrator.structure_type,  // Alternative field name
    }
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
  console.error('[ApplySettings] 📋 EXTRACTED SETTINGS (STRUCTURE VIDEO):', {
    structureVideo: {
      path: extracted.structureVideoPath || 'NOT SET',
      type: extracted.structureVideoType,
      treatment: extracted.structureVideoTreatment,
      motionStrength: extracted.structureVideoMotionStrength,
      pathLength: extracted.structureVideoPath?.length || 0,
      pathPreview: extracted.structureVideoPath ? extracted.structureVideoPath.substring(0, 80) + '...' : 'NULL'
    },
    segmentFramesExpanded: extracted.segmentFramesExpanded,
    hasPhaseConfig: !!extracted.phaseConfig,
  });
  
  console.error('[ApplySettings] 📋 EXTRACTED SETTINGS (PROMPTS):', {
    prompt: extracted.prompt ? `"${extracted.prompt.substring(0, 50)}..."` : undefined,
    prompts: extracted.prompts ? `${extracted.prompts.length} prompts` : undefined,
    promptsArray: extracted.prompts?.map((p, i) => `[${i}] "${p?.substring(0, 30)}..."`),
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
    hasLoras: !!(extracted.loras && extracted.loras.length > 0),
    lorasCount: extracted.loras?.length,
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
    console.error('[ApplySettings] 💬 Applying main prompt:', {
      prompt: `"${settings.prompt.substring(0, 60)}..."`,
      length: settings.prompt.length
    });
    context.onBatchVideoPromptChange(settings.prompt);
  } else {
    console.error('[ApplySettings] ⏭️  Skipping main prompt (undefined, empty, or not string)');
  }
  
  // Apply individual prompts to pair configs (regardless of current mode)
  // These prompts populate the pair fields whether you're in batch or timeline mode
  if (settings.prompts && settings.prompts.length > 1 && context.updatePairPromptsByIndex) {
    console.error('[ApplySettings] 📝 === APPLYING INDIVIDUAL PROMPTS TO PAIR CONFIGS ===');
    console.error('[ApplySettings] 📝 Prompt application details:', {
      promptCount: settings.prompts.length,
      hasNegativePrompts: !!(settings.negativePrompts && settings.negativePrompts.length > 0),
      currentMode: context.currentGenerationMode,
      hasCallback: !!context.updatePairPromptsByIndex,
      prompts: settings.prompts.map((p, i) => `[${i}] "${p?.substring(0, 30)}..."`),
      promptsRaw: settings.prompts, // Show the actual raw values
      note: 'Prompts applied regardless of current mode'
    });
    
    const errors: string[] = [];
    const successes: number[] = [];
    
    for (let i = 0; i < settings.prompts.length; i++) {
      const rawPrompt = settings.prompts[i];
      console.error(`[ApplySettings] 🔍 Processing pair ${i}:`, {
        rawValue: rawPrompt,
        typeOf: typeof rawPrompt,
        isString: typeof rawPrompt === 'string',
        isNull: rawPrompt === null,
        isUndefined: rawPrompt === undefined,
        length: rawPrompt?.length,
        afterTrim: rawPrompt?.trim?.(),
        afterTrimLength: rawPrompt?.trim?.().length
      });
      const pairPrompt = settings.prompts[i]?.trim();
      const pairNegativePrompt = settings.negativePrompts?.[i]?.trim() || '';
      
      if (pairPrompt) {
        console.error(`[ApplySettings] 📝 Applying prompt for pair ${i}:`, {
          prompt: `"${pairPrompt.substring(0, 40)}..."`,
          promptLength: pairPrompt.length,
          hasNegativePrompt: !!pairNegativePrompt
        });
        
        try {
          await context.updatePairPromptsByIndex(i, pairPrompt, pairNegativePrompt);
          successes.push(i);
          console.error(`[ApplySettings] ✅ Successfully saved prompt for pair ${i}`);
        } catch (e) {
          const error = `Failed to apply prompt for pair ${i}: ${e}`;
          console.error(`[ApplySettings] ❌ ${error}`, e);
          errors.push(error);
        }
      } else {
        console.error(`[ApplySettings] ⏭️ Skipping pair ${i} - empty prompt`);
      }
    }
    
    console.error('[ApplySettings] 📊 PAIR PROMPTS APPLICATION SUMMARY:', {
      totalPrompts: settings.prompts.length,
      successCount: successes.length,
      errorCount: errors.length,
      skippedCount: settings.prompts.length - successes.length - errors.length,
      successIndexes: successes,
      errors: errors
    });
    
    if (errors.length > 0) {
      return { success: false, settingName: 'prompts', error: errors.join('; ') };
    }
  } else {
    console.error('[ApplySettings] ⏭️ SKIPPING INDIVIDUAL PROMPTS:', {
      hasPrompts: !!settings.prompts,
      promptsLength: settings.prompts?.length,
      hasCallback: !!context.updatePairPromptsByIndex,
      reason: !settings.prompts ? 'no prompts' : 
              settings.prompts.length <= 1 ? 'only 1 or fewer prompts' : 
              !context.updatePairPromptsByIndex ? 'callback not available' : 'unknown'
    });
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
        
        console.log('[ApplySettings] ✅ LoRAs applied successfully:', {
          matched: matchedCount,
          total: settings.loras!.length
        });
        
        resolve({ success: true, settingName: 'loras', details: `${matchedCount}/${settings.loras!.length} matched` });
      }, 100); // Small delay to ensure state clears
    });
  } else {
    console.log('[ApplySettings] 🗑️  Clearing LoRAs (empty array in task)');
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
  
  console.error('[ApplySettings] 🔍 STRUCTURE VIDEO FIELD CHECK - orchestratorHasField:', orchestratorHasField);
  console.error('[ApplySettings] 🔍 STRUCTURE VIDEO FIELD CHECK - paramsHasField:', paramsHasField);
  console.error('[ApplySettings] 🔍 STRUCTURE VIDEO FIELD CHECK - orchestratorValue:', taskData.orchestrator.structure_video_path);
  console.error('[ApplySettings] 🔍 STRUCTURE VIDEO FIELD CHECK - paramsValue:', taskData.params.structure_video_path);
  console.error('[ApplySettings] 🔍 STRUCTURE VIDEO FIELD CHECK - extractedValue:', settings.structureVideoPath);
  console.error('[ApplySettings] 🔍 STRUCTURE VIDEO FIELD CHECK - hasStructureVideoInTask:', hasStructureVideoInTask);
  console.error('[ApplySettings] 🔍 STRUCTURE VIDEO FIELD CHECK - willApply:', !!settings.structureVideoPath);
  
  if (!hasStructureVideoInTask) {
    console.log('[ApplySettings] ⏭️  Skipping structure video (field not present in task)');
    return { success: true, settingName: 'structureVideo', details: 'skipped - not in task' };
  }
  
  if (settings.structureVideoPath) {
    console.error('[ApplySettings] 🎥 === APPLYING STRUCTURE VIDEO ===');
    console.error('[ApplySettings] 🎥 Structure video path:', settings.structureVideoPath);
    console.error('[ApplySettings] 🎥 Structure video pathFilename:', settings.structureVideoPath.substring(settings.structureVideoPath.lastIndexOf('/') + 1));
    console.error('[ApplySettings] 🎥 Structure video treatment:', settings.structureVideoTreatment);
    console.error('[ApplySettings] 🎥 Structure video motionStrength:', settings.structureVideoMotionStrength);
    console.error('[ApplySettings] 🎥 Structure video type:', settings.structureVideoType);
    console.error('[ApplySettings] 🎥 Structure video hasHandler:', !!context.handleStructureVideoChange);
    console.error('[ApplySettings] 🎥 Structure video handlerType:', typeof context.handleStructureVideoChange);
    
    if (!context.handleStructureVideoChange) {
      console.error('[ApplySettings] ❌ handleStructureVideoChange is not defined in context!');
      return {
        success: false,
        settingName: 'structureVideo',
        error: 'handleStructureVideoChange not defined in context'
      };
    }
    
    try {
      console.error('[ApplySettings] 🎥 Extracting metadata from video URL...');
      let metadata = null;
      try {
        metadata = await extractVideoMetadataFromUrl(settings.structureVideoPath);
        console.error('[ApplySettings] ✅ Metadata duration:', metadata.duration_seconds);
        console.error('[ApplySettings] ✅ Metadata frameRate:', metadata.frame_rate);
        console.error('[ApplySettings] ✅ Metadata totalFrames:', metadata.total_frames);
        console.error('[ApplySettings] ✅ Metadata dimensions:', `${metadata.width}x${metadata.height}`);
      } catch (metadataError) {
        console.error('[ApplySettings] ⚠️  Failed to extract metadata, proceeding without it:', metadataError);
      }
      
      console.error('[ApplySettings] 🎥 Calling handleStructureVideoChange - videoPath:', settings.structureVideoPath);
      console.error('[ApplySettings] 🎥 Calling handleStructureVideoChange - hasMetadata:', !!metadata);
      console.error('[ApplySettings] 🎥 Calling handleStructureVideoChange - treatment:', settings.structureVideoTreatment || 'adjust');
      console.error('[ApplySettings] 🎥 Calling handleStructureVideoChange - motionStrength:', settings.structureVideoMotionStrength ?? 1.0);
      console.error('[ApplySettings] 🎥 Calling handleStructureVideoChange - structureType:', settings.structureVideoType || 'flow');
      
      context.handleStructureVideoChange(
        settings.structureVideoPath,
        metadata,
        settings.structureVideoTreatment || 'adjust',
        settings.structureVideoMotionStrength ?? 1.0,
        settings.structureVideoType || 'flow'
      );
      
      console.error('[ApplySettings] ✅ Structure video change handler completed successfully');
      console.error('[ApplySettings] 🎥 === STRUCTURE VIDEO APPLICATION COMPLETE ===');
      return { success: true, settingName: 'structureVideo' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[ApplySettings] ❌ ERROR applying structure video - error:', error);
      console.error('[ApplySettings] ❌ ERROR applying structure video - errorMessage:', errorMessage);
      console.error('[ApplySettings] ❌ ERROR applying structure video - errorStack:', errorStack);
      console.error('[ApplySettings] ❌ ERROR applying structure video - path:', settings.structureVideoPath);
      console.error('[ApplySettings] ❌ ERROR applying structure video - treatment:', settings.structureVideoTreatment);
      console.error('[ApplySettings] ❌ ERROR applying structure video - motionStrength:', settings.structureVideoMotionStrength);
      console.error('[ApplySettings] ❌ ERROR applying structure video - type:', settings.structureVideoType);
      return {
        success: false,
        settingName: 'structureVideo',
        error: errorMessage
      };
    }
  } else {
    console.log('[ApplySettings] 🗑️  Clearing structure video (was null/undefined in task)');
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
    console.log('[ApplySettings] ⏭️  No segment_frames_expanded to apply to existing images');
    return { success: true, settingName: 'framePositions', details: 'no data' };
  }
  
  if (!selectedShot?.id) {
    console.log('[ApplySettings] ⏭️  Cannot apply frame positions: missing shot');
    return { success: true, settingName: 'framePositions', details: 'skipped - no shot' };
  }
  
  // Calculate cumulative positions from gaps
  const cumulativePositions: number[] = [0]; // First image always at frame 0
  for (let i = 0; i < segmentGaps.length; i++) {
    const prevPosition = cumulativePositions[cumulativePositions.length - 1];
    cumulativePositions.push(prevPosition + segmentGaps[i]);
  }
  
  console.log('[ApplySettings] 📐 Applying frame positions to existing images:', {
    shotId: selectedShot.id.substring(0, 8),
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
      
      console.log('[ApplySettings] 🎯 Updating timeline_frame:', {
        index,
        shotImageEntryId: img.shotImageEntryId.substring(0, 8),
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
    
    console.log('[ApplySettings] ✅ Frame positions applied:', {
      total: simpleFilteredImages.length,
      success: successCount,
      failed: simpleFilteredImages.length - successCount
    });
    
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
    console.log('[ApplySettings] ⏭️  Skipping image replacement (replaceImages = false)');
    // NEW: Apply frame positions to existing images even when not replacing
    return await applyFramePositionsToExistingImages(settings, selectedShot, simpleFilteredImages);
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
    
    console.log('[ApplySettings] 📐 Calculating timeline positions:', {
      hasSegmentGaps,
      segmentGaps,
      cumulativePositions,
      uniformSpacingFallback: !hasSegmentGaps ? uniformSpacing : 'not used',
      imageCount: inputImages.length,
      extractedFrom: hasSegmentGaps ? 'task segment_frames_expanded' : (settings.frames ? 'task frames (uniform)' : 'default fallback')
    });
    
    // Add input images in order with calculated timeline_frame positions
    const additions = (inputImages || []).map((url, index) => {
      // Use cumulative position if available, otherwise fall back to uniform spacing
      const timelineFrame = hasSegmentGaps && index < cumulativePositions.length
        ? cumulativePositions[index]
        : index * uniformSpacing;
      
      console.log('[ApplySettings] ➕ Adding image:', {
        index,
        filename: url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('/') + 20) + '...',
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

