/**
 * Segment Settings Utilities
 *
 * Clean merge logic for per-segment video generation settings.
 *
 * Priority (highest to lowest):
 * 1. pairMetadata (pair-specific settings from shot_generations.metadata)
 * 2. shotBatchSettings (shot-level defaults from shots.settings)
 * 3. defaults (hardcoded fallbacks)
 *
 * Note: Shot settings inheritance (from previous shot) is handled separately
 * when a new shot is created - see shotSettingsInheritance.ts
 *
 * Key invariants:
 * - Basic mode = no phase_config (always cleared)
 * - New format (pair_X fields at root) takes precedence over legacy (user_overrides.X)
 */

import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import type { ActiveLora } from '@/shared/hooks/useLoraManager';
import { readSegmentOverrides, writeSegmentOverrides, type SegmentOverrides, type LoraConfig } from '@/shared/utils/settingsMigration';

// =============================================================================
// BUILT-IN PRESETS
// =============================================================================

export interface BuiltinPreset {
  id: string;
  metadata: {
    name: string;
    description: string;
    phaseConfig: PhaseConfig;
    generationTypeMode: 'i2v' | 'vace';
  };
}

const BUILTIN_I2V_PRESET_ID = '__builtin_segment_i2v_default__';
const BUILTIN_VACE_PRESET_ID = '__builtin_segment_vace_default__';

export const BUILTIN_I2V_PRESET: BuiltinPreset = {
  id: BUILTIN_I2V_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation',
    phaseConfig: DEFAULT_PHASE_CONFIG,
    generationTypeMode: 'i2v',
  }
};

export const BUILTIN_VACE_PRESET: BuiltinPreset = {
  id: BUILTIN_VACE_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
    generationTypeMode: 'vace',
  }
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Result of computing a defaultable field's display state.
 */
export interface DefaultableFieldResult {
  /** Whether the field is currently showing the default value */
  isUsingDefault: boolean;
  /** The value to display in the field */
  displayValue: string;
}

/**
 * Compute display state for a field that can fall back to a default value.
 *
 * Semantics:
 * - `undefined` = no local value set, use default (show badge)
 * - `''` (empty string) = user explicitly cleared, show empty (no badge)
 * - `'value'` = user set a value, show it (no badge)
 *
 * @param localValue - The current local/settings value (may be undefined)
 * @param defaultValue - The fallback value from shot defaults
 * @param hasDbOverride - Whether there's a saved override in the database (optional)
 */
export function getDefaultableField(
  localValue: string | undefined,
  defaultValue: string | undefined,
  hasDbOverride?: boolean
): DefaultableFieldResult {
  // Key insight: check for `undefined` specifically, not falsiness
  // Empty string '' means user explicitly cleared - don't show default
  const isUsingDefault = localValue === undefined && (
    hasDbOverride !== undefined
      ? !hasDbOverride && defaultValue !== undefined
      : defaultValue !== undefined
  );

  return {
    isUsingDefault,
    displayValue: isUsingDefault ? (defaultValue ?? '') : (localValue ?? ''),
  };
}

/**
 * Detect generation mode from model name.
 */
export function detectGenerationMode(modelName?: string): 'i2v' | 'vace' {
  if (!modelName) return 'i2v';
  return modelName.toLowerCase().includes('vace') ? 'vace' : 'i2v';
}

// =============================================================================
// CONTROLLED FORM INTERFACE
// =============================================================================

/**
 * Complete segment settings for the controlled form.
 * This is the single source of truth passed to SegmentSettingsForm.
 */
export interface SegmentSettings {
  // Prompts
  prompt: string;
  negativePrompt: string;
  // Text before/after prompts (merged into final prompt when generating)
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  // Motion
  motionMode: 'basic' | 'advanced';
  amountOfMotion: number; // 0-100 (UI scale)
  // Phase config (only when motionMode is advanced)
  phaseConfig: PhaseConfig | undefined;
  selectedPhasePresetId: string | null;
  // LoRAs
  loras: ActiveLora[];
  // Video settings
  numFrames: number;
  randomSeed: boolean;
  seed?: number;
  // Variant behavior
  makePrimaryVariant: boolean;
  // Structure video overrides (only when segment has structure video)
  structureMotionStrength?: number; // 0-2 scale
  structureTreatment?: 'adjust' | 'clip';
  structureUni3cEndPercent?: number; // 0-1 scale
}

/**
 * Create default segment settings.
 */
export function createDefaultSettings(defaults?: {
  prompt?: string;
  negativePrompt?: string;
  numFrames?: number;
}): SegmentSettings {
  return {
    prompt: defaults?.prompt ?? '',
    negativePrompt: defaults?.negativePrompt ?? '',
    motionMode: 'basic',
    amountOfMotion: 50,
    phaseConfig: undefined,
    selectedPhasePresetId: null,
    loras: [],
    numFrames: defaults?.numFrames ?? 25,
    randomSeed: true,
    seed: undefined,
    makePrimaryVariant: false,
  };
}

/**
 * Convert MergedSegmentSettings to SegmentSettings for the form.
 */
export function mergedToFormSettings(
  merged: MergedSegmentSettings,
  extras?: {
    numFrames?: number;
    randomSeed?: boolean;
    seed?: number;
    selectedPhasePresetId?: string | null;
    makePrimaryVariant?: boolean;
  }
): SegmentSettings {
  return {
    prompt: merged.prompt,
    negativePrompt: merged.negativePrompt,
    motionMode: merged.motionMode,
    amountOfMotion: Math.round(merged.amountOfMotion * 100), // Convert 0-1 to 0-100
    phaseConfig: merged.phaseConfig,
    selectedPhasePresetId: extras?.selectedPhasePresetId ?? null,
    loras: merged.loras,
    numFrames: extras?.numFrames ?? 25,
    randomSeed: extras?.randomSeed ?? true,
    seed: extras?.seed,
    makePrimaryVariant: extras?.makePrimaryVariant ?? false,
  };
}

// =============================================================================
// DATA SOURCE TYPES
// =============================================================================

// Types for the settings sources
export interface PairMetadata {
  // NEW FORMAT: Segment overrides in nested structure
  segmentOverrides?: {
    prompt?: string;
    negativePrompt?: string;
    motionMode?: 'basic' | 'advanced';
    amountOfMotion?: number; // 0-100 scale
    phaseConfig?: PhaseConfig;
    selectedPhasePresetId?: string | null;
    loras?: Array<{ path: string; strength: number; id?: string; name?: string }>;
    numFrames?: number;
    randomSeed?: boolean;
    seed?: number;
  };
  // AI-generated prompt (not user settings, kept separate)
  enhanced_prompt?: string;
  // DEPRECATED: Old pair_* fields (kept for backward compatibility during migration)
  /** @deprecated Use segmentOverrides.prompt instead */
  pair_prompt?: string;
  /** @deprecated Use segmentOverrides.negativePrompt instead */
  pair_negative_prompt?: string;
  /** @deprecated Use segmentOverrides.phaseConfig instead */
  pair_phase_config?: PhaseConfig;
  /** @deprecated Use segmentOverrides.motionMode and segmentOverrides.amountOfMotion instead */
  pair_motion_settings?: {
    motion_mode?: 'basic' | 'advanced';
    amount_of_motion?: number;
  };
  /** @deprecated Use segmentOverrides.loras instead */
  pair_loras?: Array<{ path: string; strength: number }>;
  /** @deprecated Use segmentOverrides.numFrames instead */
  pair_num_frames?: number;
  /** @deprecated Use segmentOverrides.randomSeed instead */
  pair_random_seed?: boolean;
  /** @deprecated Use segmentOverrides.seed instead */
  pair_seed?: number;
  /** @deprecated Use segmentOverrides.selectedPhasePresetId instead */
  pair_selected_phase_preset_id?: string | null;
  // LEGACY: Very old format nested in user_overrides
  /** @deprecated Use segmentOverrides instead */
  user_overrides?: {
    phase_config?: PhaseConfig;
    motion_mode?: 'basic' | 'advanced';
    amount_of_motion?: number;
    additional_loras?: Record<string, number>;
    [key: string]: any;
  };
}

export interface ShotBatchSettings {
  amountOfMotion?: number;
  motionMode?: 'basic' | 'advanced';
  selectedLoras?: ActiveLora[];
  phaseConfig?: PhaseConfig;
  prompt?: string;
  negativePrompt?: string;
}

export interface MergedSegmentSettings {
  // Prompts
  prompt: string;
  negativePrompt: string;
  // Motion
  motionMode: 'basic' | 'advanced';
  amountOfMotion: number;
  // Phase config (only when motionMode is advanced)
  phaseConfig: PhaseConfig | undefined;
  // LoRAs
  loras: ActiveLora[];
  // Source tracking (for debugging)
  sources: {
    prompt: 'pair' | 'batch' | 'default';
    motionMode: 'pair' | 'batch' | 'default';
    phaseConfig: 'pair' | 'batch' | 'none';
    loras: 'pair' | 'batch' | 'none';
  };
}

// Convert legacy loras format (object) to array format
function legacyLorasToArray(lorasObj: Record<string, number>): ActiveLora[] {
  return Object.entries(lorasObj).map(([url, strength]) => {
    const filename = url.split('/').pop()?.replace('.safetensors', '') || url;
    return {
      id: url,
      name: filename,
      path: url,
      strength: typeof strength === 'number' ? strength : 1.0,
    };
  });
}

// Convert pair_loras format to ActiveLora[]
function pairLorasToArray(pairLoras: Array<{ path: string; strength: number }>): ActiveLora[] {
  return pairLoras.map((lora) => {
    const filename = lora.path.split('/').pop()?.replace('.safetensors', '') || lora.path;
    return {
      id: lora.path,
      name: filename,
      path: lora.path,
      strength: lora.strength,
    };
  });
}

// Convert ActiveLora[] to pair_loras format for saving
export function lorasToSaveFormat(loras: ActiveLora[]): Array<{ path: string; strength: number }> {
  return loras.map((lora) => ({
    path: lora.path,
    strength: lora.strength,
  }));
}

// Strip mode field from phase config (backend determines mode from model)
export function stripModeFromPhaseConfig(config: PhaseConfig): PhaseConfig {
  const { mode, ...rest } = config as PhaseConfig & { mode?: string };
  return rest as PhaseConfig;
}

/**
 * Merge segment settings from all sources with clear priority.
 *
 * Priority (highest to lowest):
 * 1. pairMetadata - Per-pair overrides from shot_generations.metadata
 * 2. shotBatchSettings - Shot-level defaults from shots.settings
 * 3. defaults - Hardcoded fallbacks
 *
 * Note: Shot settings inheritance (from previous shot) is handled separately
 * when a new shot is created - see shotSettingsInheritance.ts
 */
export function mergeSegmentSettings(
  pairMetadata: PairMetadata | null | undefined,
  shotBatchSettings: ShotBatchSettings | null | undefined,
  defaults: {
    prompt: string;
    negativePrompt: string;
  }
): MergedSegmentSettings {
  const sources: MergedSegmentSettings['sources'] = {
    prompt: 'default',
    motionMode: 'default',
    phaseConfig: 'none',
    loras: 'none',
  };

  // Use migration utility to read from new or old format
  const overrides = readSegmentOverrides(pairMetadata as Record<string, any> | null);

  // Legacy user_overrides for very old data fallback
  const legacyOverrides = (pairMetadata as any)?.user_overrides || {};

  // enhanced_prompt is separate (AI-generated, not user settings)
  const enhancedPrompt = (pairMetadata as any)?.enhanced_prompt;

  // Prompts: overrides.prompt > enhanced_prompt > batch > default
  // Note: empty string is a valid override (user explicitly cleared)
  let prompt = defaults.prompt;
  if (typeof overrides.prompt === 'string') {
    // User explicitly set a prompt (even if empty)
    prompt = overrides.prompt;
    sources.prompt = 'pair';
  } else if (enhancedPrompt) {
    // AI-generated prompt (fallback when no user override)
    prompt = enhancedPrompt;
    sources.prompt = 'pair';
  } else if (shotBatchSettings?.prompt) {
    prompt = shotBatchSettings.prompt;
    sources.prompt = 'batch';
  }

  // Negative prompt: overrides > batch > default
  let negativePrompt = defaults.negativePrompt;
  if (overrides.negativePrompt !== undefined) {
    negativePrompt = overrides.negativePrompt;
    sources.prompt = 'pair'; // Negative follows positive source for simplicity
  } else if (shotBatchSettings?.negativePrompt !== undefined) {
    negativePrompt = shotBatchSettings.negativePrompt;
  }

  // Motion mode: overrides > legacy > batch > default
  let motionMode: 'basic' | 'advanced' = 'basic';
  const pairMotionMode = overrides.motionMode ?? legacyOverrides.motion_mode;
  if (pairMotionMode !== undefined) {
    motionMode = pairMotionMode;
    sources.motionMode = 'pair';
  } else if (shotBatchSettings?.motionMode !== undefined) {
    motionMode = shotBatchSettings.motionMode;
    sources.motionMode = 'batch';
  }

  // Amount of motion: overrides (0-100) > legacy (0-1) > batch (0-1) > default (0.5)
  // Note: overrides.amountOfMotion is already normalized to 0-100 by migration utility
  // We return 0-1 scale for backwards compatibility with callers
  let amountOfMotion = 0.5;
  if (overrides.amountOfMotion !== undefined) {
    amountOfMotion = overrides.amountOfMotion / 100; // Convert 0-100 to 0-1
  } else if (legacyOverrides.amount_of_motion !== undefined) {
    amountOfMotion = legacyOverrides.amount_of_motion;
  } else if (shotBatchSettings?.amountOfMotion !== undefined) {
    amountOfMotion = shotBatchSettings.amountOfMotion;
  }

  // Phase config: only when motion mode is advanced
  // overrides > legacy > batch > none
  let phaseConfig: PhaseConfig | undefined = undefined;
  if (motionMode === 'advanced') {
    const pairPhaseConfig = overrides.phaseConfig ?? legacyOverrides.phase_config;
    if (pairPhaseConfig) {
      phaseConfig = stripModeFromPhaseConfig(pairPhaseConfig);
      sources.phaseConfig = 'pair';
    } else if (shotBatchSettings?.phaseConfig) {
      phaseConfig = stripModeFromPhaseConfig(shotBatchSettings.phaseConfig);
      sources.phaseConfig = 'batch';
    }
  }
  // When in basic mode, phaseConfig is always undefined (invariant)

  // LoRAs: overrides > legacy > batch > none
  // Note: overrides.loras !== undefined means the user has explicitly set loras (even if empty array)
  let loras: ActiveLora[] = [];
  if (overrides.loras !== undefined) {
    // Segment has explicit lora override (could be empty array = "no loras")
    loras = overrides.loras.map((lora) => ({
      id: lora.id || lora.path,
      name: lora.name || lora.path.split('/').pop()?.replace('.safetensors', '') || lora.path,
      path: lora.path,
      strength: lora.strength,
    }));
    sources.loras = 'pair';
  } else if (legacyOverrides.additional_loras && Object.keys(legacyOverrides.additional_loras).length > 0) {
    loras = legacyLorasToArray(legacyOverrides.additional_loras);
    sources.loras = 'pair';
  } else if (shotBatchSettings?.selectedLoras && shotBatchSettings.selectedLoras.length > 0) {
    loras = shotBatchSettings.selectedLoras;
    sources.loras = 'batch';
  }

  return {
    prompt,
    negativePrompt,
    motionMode,
    amountOfMotion,
    phaseConfig,
    loras,
    sources,
  };
}

/**
 * Build metadata update payload for saving pair settings.
 *
 * Uses the new format (pair_X fields at root level) and clears legacy fields.
 */
export interface PairSettingsToSave {
  prompt?: string;
  negativePrompt?: string;
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  motionMode?: 'basic' | 'advanced';
  amountOfMotion?: number;
  phaseConfig?: PhaseConfig | null; // null means clear
  loras?: ActiveLora[];
  // Video settings
  numFrames?: number;
  randomSeed?: boolean;
  seed?: number;
  // UI state
  selectedPhasePresetId?: string | null;
  // Structure video overrides
  structureMotionStrength?: number;
  structureTreatment?: 'adjust' | 'clip';
  structureUni3cEndPercent?: number;
}

/**
 * Build task params from segment settings.
 * Used by parent components to create generation tasks.
 */
export function buildTaskParams(
  settings: SegmentSettings,
  context: {
    projectId: string;
    shotId?: string;
    generationId?: string;
    childGenerationId?: string;
    segmentIndex: number;
    startImageUrl: string;
    endImageUrl: string;
    startImageGenerationId?: string;
    endImageGenerationId?: string;
    pairShotGenerationId?: string;
    projectResolution?: string;
  }
): Record<string, any> {
  return {
    project_id: context.projectId,
    shot_id: context.shotId,
    parent_generation_id: context.generationId,
    child_generation_id: context.childGenerationId,
    segment_index: context.segmentIndex,
    start_image_url: context.startImageUrl,
    end_image_url: context.endImageUrl,
    start_image_generation_id: context.startImageGenerationId,
    end_image_generation_id: context.endImageGenerationId,
    pair_shot_generation_id: context.pairShotGenerationId,
    // Settings
    base_prompt: settings.prompt,
    negative_prompt: settings.negativePrompt,
    num_frames: settings.numFrames,
    random_seed: settings.randomSeed,
    seed: settings.seed,
    amount_of_motion: settings.amountOfMotion / 100, // Convert 0-100 to 0-1
    motion_mode: settings.motionMode,
    phase_config: settings.motionMode === 'basic' ? undefined : settings.phaseConfig,
    selected_phase_preset_id: settings.selectedPhasePresetId,
    loras: settings.loras.map(l => ({ path: l.path, strength: l.strength })),
    make_primary_variant: settings.makePrimaryVariant,
    // Resolution
    ...(context.projectResolution && { parsed_resolution_wh: context.projectResolution }),
  };
}

/**
 * Extract SegmentSettings from variant/generation params.
 * Used to populate the form with settings from an existing generation.
 */
export function extractSettingsFromParams(
  params: Record<string, any>,
  defaults?: Partial<SegmentSettings>
): SegmentSettings {
  console.log('[extractSettingsFromParams] Input params:', params);
  console.log('[extractSettingsFromParams] Defaults:', defaults);

  // Handle nested orchestrator_details (common in task params)
  const orchDetails = params.orchestrator_details || {};
  console.log('[extractSettingsFromParams] orchestrator_details:', orchDetails);

  // Extract prompt: base_prompt > prompt > orchestrator > default
  const prompt = params.base_prompt ?? params.prompt ?? orchDetails.base_prompt ?? defaults?.prompt ?? '';
  console.log('[extractSettingsFromParams] Prompt sources:', {
    'params.base_prompt': params.base_prompt,
    'params.prompt': params.prompt,
    'orchDetails.base_prompt': orchDetails.base_prompt,
    'defaults?.prompt': defaults?.prompt,
    'final': prompt,
  });

  // Extract negative prompt
  const negativePrompt = params.negative_prompt ?? orchDetails.negative_prompt ?? defaults?.negativePrompt ?? '';

  // Extract num_frames
  const numFrames = params.num_frames ?? orchDetails.num_frames ?? defaults?.numFrames ?? 25;
  console.log('[extractSettingsFromParams] numFrames sources:', {
    'params.num_frames': params.num_frames,
    'orchDetails.num_frames': orchDetails.num_frames,
    'defaults?.numFrames': defaults?.numFrames,
    'final': numFrames,
  });

  // Extract seed/randomSeed
  const randomSeed = params.random_seed ?? orchDetails.random_seed ?? defaults?.randomSeed ?? true;
  const seed = params.seed ?? orchDetails.seed ?? defaults?.seed;

  // Extract motion settings
  const motionMode = params.motion_mode ?? orchDetails.motion_mode ?? defaults?.motionMode ?? 'basic';
  const amountOfMotion = params.amount_of_motion != null
    ? Math.round(params.amount_of_motion * 100) // Convert 0-1 to 0-100
    : (orchDetails.amount_of_motion != null
        ? Math.round(orchDetails.amount_of_motion * 100)
        : (defaults?.amountOfMotion ?? 50));

  // Extract phase config (only if advanced mode)
  let phaseConfig: PhaseConfig | undefined = undefined;
  if (motionMode === 'advanced') {
    phaseConfig = params.phase_config ?? orchDetails.phase_config ?? defaults?.phaseConfig;
    if (phaseConfig) {
      phaseConfig = stripModeFromPhaseConfig(phaseConfig);
    }
  }

  // Extract selected preset ID
  const selectedPhasePresetId = params.selected_phase_preset_id ?? orchDetails.selected_phase_preset_id ?? defaults?.selectedPhasePresetId ?? null;

  // Extract LoRAs - handle multiple formats
  let loras: ActiveLora[] = [];

  console.log('[extractSettingsFromParams] LoRA sources:', {
    'params.loras': params.loras,
    'params.additional_loras': params.additional_loras,
    'orchDetails.loras': orchDetails.loras,
    'orchDetails.additional_loras': orchDetails.additional_loras,
    'defaults?.loras': defaults?.loras,
  });

  // Format 1: loras array at top level (new format)
  if (Array.isArray(params.loras) && params.loras.length > 0) {
    console.log('[extractSettingsFromParams] Using params.loras');
    loras = pairLorasToArray(params.loras);
  }
  // Format 2: additional_loras object at top level (legacy)
  else if (params.additional_loras && typeof params.additional_loras === 'object' && Object.keys(params.additional_loras).length > 0) {
    console.log('[extractSettingsFromParams] Using params.additional_loras (legacy)');
    loras = legacyLorasToArray(params.additional_loras);
  }
  // Format 3: in orchestrator_details (either format)
  else if (Array.isArray(orchDetails.loras) && orchDetails.loras.length > 0) {
    console.log('[extractSettingsFromParams] Using orchDetails.loras');
    loras = pairLorasToArray(orchDetails.loras);
  }
  else if (orchDetails.additional_loras && typeof orchDetails.additional_loras === 'object' && Object.keys(orchDetails.additional_loras).length > 0) {
    console.log('[extractSettingsFromParams] Using orchDetails.additional_loras (legacy)');
    loras = legacyLorasToArray(orchDetails.additional_loras);
  }
  // Format 4: use defaults if provided
  else if (defaults?.loras) {
    console.log('[extractSettingsFromParams] Using defaults.loras');
    loras = defaults.loras;
  }

  console.log('[extractSettingsFromParams] Final loras:', loras);

  const result = {
    prompt,
    negativePrompt,
    motionMode,
    amountOfMotion,
    phaseConfig,
    selectedPhasePresetId,
    loras,
    numFrames,
    randomSeed,
    seed,
    makePrimaryVariant: defaults?.makePrimaryVariant ?? false,
  };

  console.log('[extractSettingsFromParams] Final result:', result);
  return result;
}

export function buildMetadataUpdate(
  currentMetadata: Record<string, any>,
  settings: PairSettingsToSave
): Record<string, any> {
  console.log(`[PairPromptDebug] buildMetadataUpdate called`, {
    settingsPrompt: settings.prompt?.substring(0, 30),
    settingsNegPrompt: settings.negativePrompt?.substring(0, 30),
    currentMetadataKeys: Object.keys(currentMetadata || {}),
    currentSegmentOverrides: currentMetadata?.segmentOverrides,
  });

  // Convert PairSettingsToSave to SegmentOverrides format for new storage
  // Convention:
  //   undefined = don't touch this field (keep existing value)
  //   '' (empty) = explicitly clear the override (use shot default)
  //   'value' = set the override
  const overrides: SegmentOverrides = {};

  // Track fields that should be explicitly cleared (set to '' means remove override)
  const fieldsToClear: (keyof SegmentOverrides)[] = [];

  if (settings.prompt !== undefined) {
    if (settings.prompt === '') {
      fieldsToClear.push('prompt');
    } else {
      overrides.prompt = settings.prompt;
    }
  }
  if (settings.negativePrompt !== undefined) {
    if (settings.negativePrompt === '') {
      fieldsToClear.push('negativePrompt');
    } else {
      overrides.negativePrompt = settings.negativePrompt;
    }
  }
  if (settings.textBeforePrompts !== undefined) {
    if (settings.textBeforePrompts === '') {
      fieldsToClear.push('textBeforePrompts');
    } else {
      overrides.textBeforePrompts = settings.textBeforePrompts;
    }
  }
  if (settings.textAfterPrompts !== undefined) {
    if (settings.textAfterPrompts === '') {
      fieldsToClear.push('textAfterPrompts');
    } else {
      overrides.textAfterPrompts = settings.textAfterPrompts;
    }
  }
  // Motion settings: null = clear, undefined = don't touch, value = set
  if (settings.motionMode !== undefined) {
    if (settings.motionMode === null) {
      fieldsToClear.push('motionMode');
    } else {
      overrides.motionMode = settings.motionMode;
    }
  }
  if (settings.amountOfMotion !== undefined) {
    if (settings.amountOfMotion === null) {
      fieldsToClear.push('amountOfMotion');
    } else {
      // Store in 0-100 scale (UI scale) in new format
      overrides.amountOfMotion = settings.amountOfMotion;
    }
  }
  if (settings.phaseConfig !== undefined) {
    if (settings.phaseConfig === null) {
      fieldsToClear.push('phaseConfig');
    } else {
      overrides.phaseConfig = stripModeFromPhaseConfig(settings.phaseConfig);
    }
  }
  if (settings.loras !== undefined) {
    if (settings.loras === null) {
      fieldsToClear.push('loras');
    } else {
      // Convert ActiveLora[] to LoraConfig[]
      overrides.loras = settings.loras.map((l): LoraConfig => ({
        id: l.id,
        name: l.name,
        path: l.path,
        strength: l.strength,
      }));
    }
  }
  // Note: numFrames is NOT saved - timeline positions are the source of truth
  if (settings.randomSeed !== undefined) {
    overrides.randomSeed = settings.randomSeed;
  }
  if (settings.seed !== undefined) {
    overrides.seed = settings.seed;
  }
  if (settings.selectedPhasePresetId !== undefined) {
    if (settings.selectedPhasePresetId === null) {
      fieldsToClear.push('selectedPhasePresetId');
    } else {
      overrides.selectedPhasePresetId = settings.selectedPhasePresetId;
    }
  }
  // Structure video overrides: null = clear, undefined = don't touch, value = set
  if (settings.structureMotionStrength !== undefined) {
    if (settings.structureMotionStrength === null) {
      fieldsToClear.push('structureMotionStrength');
    } else {
      overrides.structureMotionStrength = settings.structureMotionStrength;
    }
  }
  if (settings.structureTreatment !== undefined) {
    if (settings.structureTreatment === null) {
      fieldsToClear.push('structureTreatment');
    } else {
      overrides.structureTreatment = settings.structureTreatment;
    }
  }
  if (settings.structureUni3cEndPercent !== undefined) {
    if (settings.structureUni3cEndPercent === null) {
      fieldsToClear.push('structureUni3cEndPercent');
    } else {
      overrides.structureUni3cEndPercent = settings.structureUni3cEndPercent;
    }
  }

  // Use writeSegmentOverrides to write to new format
  const newMetadata = writeSegmentOverrides(currentMetadata, overrides);

  // Handle explicit clear of phaseConfig (when switching to basic mode)
  if (settings.phaseConfig === null && newMetadata.segmentOverrides) {
    delete newMetadata.segmentOverrides.phaseConfig;
    delete newMetadata.segmentOverrides.selectedPhasePresetId; // Also clear preset when clearing config
  }

  // Handle explicitly cleared fields ('' means remove override, use shot default)
  if (fieldsToClear.length > 0 && newMetadata.segmentOverrides) {
    for (const field of fieldsToClear) {
      delete newMetadata.segmentOverrides[field];
    }
  }

  // Clean up old pair_* fields (migration cleanup)
  // These fields are now stored in segmentOverrides
  if (settings.prompt !== undefined) {
    delete newMetadata.pair_prompt;
  }
  if (settings.negativePrompt !== undefined) {
    delete newMetadata.pair_negative_prompt;
  }
  if (settings.motionMode !== undefined || settings.amountOfMotion !== undefined) {
    delete newMetadata.pair_motion_settings;
  }
  if (settings.phaseConfig !== undefined) {
    delete newMetadata.pair_phase_config;
  }
  if (settings.loras !== undefined) {
    delete newMetadata.pair_loras;
  }
  if (settings.randomSeed !== undefined) {
    delete newMetadata.pair_random_seed;
  }
  if (settings.seed !== undefined) {
    delete newMetadata.pair_seed;
  }
  if (settings.selectedPhasePresetId !== undefined) {
    delete newMetadata.pair_selected_phase_preset_id;
  }

  // Clean up legacy user_overrides if present
  if (newMetadata.user_overrides) {
    if (settings.motionMode !== undefined) delete newMetadata.user_overrides.motion_mode;
    if (settings.amountOfMotion !== undefined) delete newMetadata.user_overrides.amount_of_motion;
    if (settings.phaseConfig !== undefined) delete newMetadata.user_overrides.phase_config;
    if (settings.loras !== undefined) delete newMetadata.user_overrides.additional_loras;

    // Clean up empty user_overrides
    if (Object.keys(newMetadata.user_overrides).length === 0) {
      delete newMetadata.user_overrides;
    }
  }

  return newMetadata;
}
