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
  // New format - root level fields
  pair_prompt?: string;
  pair_negative_prompt?: string;
  pair_phase_config?: PhaseConfig;
  pair_motion_settings?: {
    motion_mode?: 'basic' | 'advanced';
    amount_of_motion?: number;
  };
  pair_loras?: Array<{ path: string; strength: number }>;
  // Video settings (per-pair overrides)
  pair_num_frames?: number;
  pair_random_seed?: boolean;
  pair_seed?: number;
  // UI state (for restoring preset selection)
  pair_selected_phase_preset_id?: string | null;
  enhanced_prompt?: string;
  // Legacy format - nested in user_overrides
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

  // Extract from pair metadata (new format + legacy fallback)
  const legacyOverrides = pairMetadata?.user_overrides || {};

  // Prompts: pair_prompt (explicit override) > enhanced_prompt > batch > default
  // Note: empty string is a valid override (user explicitly cleared)
  let prompt = defaults.prompt;
  if (typeof pairMetadata?.pair_prompt === 'string') {
    // User explicitly set a prompt (even if empty)
    prompt = pairMetadata.pair_prompt;
    sources.prompt = 'pair';
  } else if (pairMetadata?.enhanced_prompt) {
    // AI-generated prompt (fallback when no user override)
    prompt = pairMetadata.enhanced_prompt;
    sources.prompt = 'pair';
  } else if (shotBatchSettings?.prompt) {
    prompt = shotBatchSettings.prompt;
    sources.prompt = 'batch';
  }

  // Negative prompt: pair > batch > default
  let negativePrompt = defaults.negativePrompt;
  if (pairMetadata?.pair_negative_prompt !== undefined) {
    negativePrompt = pairMetadata.pair_negative_prompt;
    sources.prompt = 'pair'; // Negative follows positive source for simplicity
  } else if (shotBatchSettings?.negativePrompt !== undefined) {
    negativePrompt = shotBatchSettings.negativePrompt;
  }

  // Motion mode: pair (new) > pair (legacy) > batch > default
  let motionMode: 'basic' | 'advanced' = 'basic';
  const pairMotionMode = pairMetadata?.pair_motion_settings?.motion_mode ?? legacyOverrides.motion_mode;
  if (pairMotionMode !== undefined) {
    motionMode = pairMotionMode;
    sources.motionMode = 'pair';
  } else if (shotBatchSettings?.motionMode !== undefined) {
    motionMode = shotBatchSettings.motionMode;
    sources.motionMode = 'batch';
  }

  // Amount of motion: pair (new) > pair (legacy) > batch > default (0.5)
  let amountOfMotion = 0.5;
  const pairAmount = pairMetadata?.pair_motion_settings?.amount_of_motion ?? legacyOverrides.amount_of_motion;
  if (pairAmount !== undefined) {
    amountOfMotion = pairAmount;
  } else if (shotBatchSettings?.amountOfMotion !== undefined) {
    amountOfMotion = shotBatchSettings.amountOfMotion;
  }

  // Phase config: only when motion mode is advanced
  // pair (new) > pair (legacy) > batch > none
  let phaseConfig: PhaseConfig | undefined = undefined;
  if (motionMode === 'advanced') {
    const pairPhaseConfig = pairMetadata?.pair_phase_config ?? legacyOverrides.phase_config;
    if (pairPhaseConfig) {
      phaseConfig = stripModeFromPhaseConfig(pairPhaseConfig);
      sources.phaseConfig = 'pair';
    } else if (shotBatchSettings?.phaseConfig) {
      phaseConfig = stripModeFromPhaseConfig(shotBatchSettings.phaseConfig);
      sources.phaseConfig = 'batch';
    }
  }
  // When in basic mode, phaseConfig is always undefined (invariant)

  // LoRAs: pair (new) > pair (legacy) > batch > none
  let loras: ActiveLora[] = [];
  if (pairMetadata?.pair_loras && pairMetadata.pair_loras.length > 0) {
    loras = pairLorasToArray(pairMetadata.pair_loras);
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

export function buildMetadataUpdate(
  currentMetadata: Record<string, any>,
  settings: PairSettingsToSave
): Record<string, any> {
  const newMetadata = { ...currentMetadata };

  // Prompts
  if (settings.prompt !== undefined) {
    newMetadata.pair_prompt = settings.prompt;
  }
  if (settings.negativePrompt !== undefined) {
    newMetadata.pair_negative_prompt = settings.negativePrompt;
  }

  // Motion settings
  if (settings.motionMode !== undefined || settings.amountOfMotion !== undefined) {
    const existingMotion = newMetadata.pair_motion_settings || {};
    newMetadata.pair_motion_settings = {
      ...existingMotion,
      ...(settings.motionMode !== undefined && { motion_mode: settings.motionMode }),
      ...(settings.amountOfMotion !== undefined && { amount_of_motion: settings.amountOfMotion }),
    };
    // Clear legacy fields
    if (newMetadata.user_overrides) {
      delete newMetadata.user_overrides.motion_mode;
      delete newMetadata.user_overrides.amount_of_motion;
    }
  }

  // Phase config
  if (settings.phaseConfig !== undefined) {
    if (settings.phaseConfig === null) {
      delete newMetadata.pair_phase_config;
    } else {
      newMetadata.pair_phase_config = stripModeFromPhaseConfig(settings.phaseConfig);
    }
    // Clear legacy field
    if (newMetadata.user_overrides?.phase_config !== undefined) {
      delete newMetadata.user_overrides.phase_config;
    }
  }

  // LoRAs
  if (settings.loras !== undefined) {
    if (settings.loras.length === 0) {
      delete newMetadata.pair_loras;
    } else {
      newMetadata.pair_loras = lorasToSaveFormat(settings.loras);
    }
    // Clear legacy field
    if (newMetadata.user_overrides?.additional_loras !== undefined) {
      delete newMetadata.user_overrides.additional_loras;
    }
  }

  // Video settings (randomSeed, seed)
  // Note: numFrames is NOT saved - timeline positions are the source of truth
  if (settings.randomSeed !== undefined) {
    newMetadata.pair_random_seed = settings.randomSeed;
  }
  if (settings.seed !== undefined) {
    newMetadata.pair_seed = settings.seed;
  }

  // UI state (selectedPhasePresetId)
  if (settings.selectedPhasePresetId !== undefined) {
    newMetadata.pair_selected_phase_preset_id = settings.selectedPhasePresetId;
  }

  // Clean up empty user_overrides
  if (newMetadata.user_overrides && Object.keys(newMetadata.user_overrides).length === 0) {
    delete newMetadata.user_overrides;
  }

  return newMetadata;
}
