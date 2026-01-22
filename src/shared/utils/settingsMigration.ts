/**
 * Settings Migration Utilities
 *
 * These utilities handle reading settings from both old and new formats,
 * and writing only in the new format. This enables gradual migration
 * without breaking existing data.
 *
 * OLD FORMAT (shots.settings['travel-between-images']):
 * - batchVideoPrompt → prompt
 * - steerableMotionSettings.negative_prompt → negativePrompt
 * - amountOfMotion → motionAmount
 * - selectedLoras → loras
 * - selectedPhasePresetId → phasePresetId
 * - batchVideoFrames → batchFrameCount
 * - enhancePrompt → enhancePrompts
 * - generationTypeMode → generationMode
 *
 * OLD FORMAT (shot_generations.metadata):
 * - pair_prompt → segmentOverrides.prompt
 * - pair_negative_prompt → segmentOverrides.negativePrompt
 * - pair_motion_settings.amount_of_motion → segmentOverrides.motionAmount
 * - pair_motion_settings.motion_mode → segmentOverrides.motionMode
 * - pair_phase_config → segmentOverrides.phaseConfig
 * - pair_loras → segmentOverrides.loras
 * - pair_num_frames → segmentOverrides.frameCount
 * - pair_random_seed → segmentOverrides.randomSeed
 * - pair_seed → segmentOverrides.seed
 * - pair_selected_phase_preset_id → segmentOverrides.phasePresetId
 */

import type {
  SegmentSettings,
  ShotVideoSettings,
  SegmentOverrides,
  LoraConfig,
} from '@/shared/types/segmentSettings';
import {
  DEFAULT_SEGMENT_SETTINGS,
  DEFAULT_SHOT_VIDEO_SETTINGS,
} from '@/shared/types/segmentSettings';

// =============================================================================
// LORA MIGRATION
// =============================================================================

/**
 * Migrate LoRA from any format to LoraConfig.
 * Handles both old ShotLora and new LoraConfig formats.
 */
export function migrateLoraConfig(lora: Record<string, any>): LoraConfig {
  return {
    id: lora.id ?? lora.path ?? '',
    name: lora.name ?? '',
    path: lora.path ?? '',
    strength: lora.strength ?? 1.0,
    lowNoisePath: lora.lowNoisePath,
    isMultiStage: lora.isMultiStage,
    previewImageUrl: lora.previewImageUrl,
    triggerWord: lora.triggerWord ?? lora.trigger_word,
  };
}

/**
 * Migrate an array of LoRAs to the new format.
 */
export function migrateLoras(loras: any[] | undefined | null): LoraConfig[] {
  if (!loras || !Array.isArray(loras)) return [];
  return loras.map(migrateLoraConfig);
}

// =============================================================================
// MOTION AMOUNT NORMALIZATION
// =============================================================================

/**
 * Normalize motion amount to 0-100 scale.
 * Old pair metadata stored 0-1, new format uses 0-100.
 */
export function normalizeMotionAmount(value: number | undefined): number {
  if (value === undefined) return DEFAULT_SEGMENT_SETTINGS.amountOfMotion;
  // If value is <= 1, assume it's in 0-1 scale and convert
  return value <= 1 ? value * 100 : value;
}

/**
 * Convert motion amount from UI scale (0-100) to backend scale (0-1).
 * Only use this at task submission time.
 */
export function motionAmountToBackend(value: number): number {
  return value / 100;
}

// =============================================================================
// SHOT SETTINGS MIGRATION
// =============================================================================

/**
 * Read shot settings with automatic migration from old format.
 * Returns normalized format, reads from either old or new field locations.
 *
 * @param raw - Raw settings object from shots.settings['travel-between-images']
 * @returns Normalized ShotVideoSettings
 */
export function readShotSettings(raw: Record<string, any> | null | undefined): ShotVideoSettings {
  if (!raw) return { ...DEFAULT_SHOT_VIDEO_SETTINGS };

  // Determine negative prompt (new location or old nested location)
  const negativePrompt =
    raw.negativePrompt ??
    raw.steerableMotionSettings?.negative_prompt ??
    DEFAULT_SHOT_VIDEO_SETTINGS.negativePrompt;

  // Determine motion amount (normalize to 0-100)
  const amountOfMotion = normalizeMotionAmount(raw.amountOfMotion);

  return {
    // Prompts (batchVideoPrompt is the old name)
    prompt: raw.prompt ?? raw.batchVideoPrompt ?? DEFAULT_SHOT_VIDEO_SETTINGS.prompt,
    negativePrompt,

    // Motion
    motionMode: raw.motionMode ?? DEFAULT_SHOT_VIDEO_SETTINGS.motionMode,
    amountOfMotion,

    // Advanced config (selectedPhasePresetId is existing name)
    phaseConfig: raw.phaseConfig,
    selectedPhasePresetId: raw.selectedPhasePresetId ?? DEFAULT_SHOT_VIDEO_SETTINGS.selectedPhasePresetId,

    // LoRAs (selectedLoras is existing name)
    loras: migrateLoras(raw.loras ?? raw.selectedLoras),

    // Video (numFrames for segment, batchVideoFrames for batch)
    numFrames: raw.numFrames ?? raw.batchVideoFrames ?? DEFAULT_SHOT_VIDEO_SETTINGS.numFrames,

    // Seed
    randomSeed: raw.randomSeed ?? DEFAULT_SHOT_VIDEO_SETTINGS.randomSeed,
    seed: raw.seed,

    // Variant behavior
    makePrimaryVariant: raw.makePrimaryVariant ?? DEFAULT_SHOT_VIDEO_SETTINGS.makePrimaryVariant,

    // Batch-specific (using existing field names)
    batchVideoFrames: raw.batchVideoFrames ?? DEFAULT_SHOT_VIDEO_SETTINGS.batchVideoFrames,
    textBeforePrompts: raw.textBeforePrompts ?? DEFAULT_SHOT_VIDEO_SETTINGS.textBeforePrompts,
    textAfterPrompts: raw.textAfterPrompts ?? DEFAULT_SHOT_VIDEO_SETTINGS.textAfterPrompts,
    enhancePrompt: raw.enhancePrompt ?? DEFAULT_SHOT_VIDEO_SETTINGS.enhancePrompt,
    generationTypeMode: raw.generationTypeMode ?? DEFAULT_SHOT_VIDEO_SETTINGS.generationTypeMode,

    // Legacy (preserve for backwards compat reads)
    advancedMode: raw.advancedMode,
  };
}

/**
 * Write shot settings in normalized format.
 * Uses existing field names for backwards compatibility.
 *
 * @param settings - Settings to write
 * @returns Object ready to save to shots.settings['travel-between-images']
 */
export function writeShotSettings(settings: ShotVideoSettings): Record<string, any> {
  return {
    // Core settings (using existing field names for compatibility)
    prompt: settings.prompt,
    negativePrompt: settings.negativePrompt,
    motionMode: settings.motionMode,
    amountOfMotion: settings.amountOfMotion,
    phaseConfig: settings.phaseConfig,
    selectedPhasePresetId: settings.selectedPhasePresetId,
    loras: settings.loras,
    numFrames: settings.numFrames,
    randomSeed: settings.randomSeed,
    seed: settings.seed,
    makePrimaryVariant: settings.makePrimaryVariant,

    // Batch-specific (using existing field names)
    batchVideoFrames: settings.batchVideoFrames,
    textBeforePrompts: settings.textBeforePrompts,
    textAfterPrompts: settings.textAfterPrompts,
    enhancePrompt: settings.enhancePrompt,
    generationTypeMode: settings.generationTypeMode,

    // Mark as migrated
    _settingsVersion: 2,
  };
}

// =============================================================================
// SEGMENT/PAIR METADATA MIGRATION
// =============================================================================

/**
 * Read segment overrides from pair metadata with automatic migration.
 * Returns sparse SegmentOverrides with only overridden fields.
 *
 * @param metadata - Raw metadata object from shot_generations.metadata
 * @returns Sparse SegmentOverrides (only fields that were set)
 */
export function readSegmentOverrides(metadata: Record<string, any> | null | undefined): SegmentOverrides {
  if (!metadata) return {};

  const overrides: SegmentOverrides = {};

  // Check new location first, then old location
  const newOverrides = metadata.segmentOverrides ?? {};

  // Prompt
  const prompt = newOverrides.prompt ?? metadata.pair_prompt;
  if (prompt !== undefined && prompt !== '') {
    overrides.prompt = prompt;
  }

  // Negative prompt
  const negativePrompt = newOverrides.negativePrompt ?? metadata.pair_negative_prompt;
  if (negativePrompt !== undefined && negativePrompt !== '') {
    overrides.negativePrompt = negativePrompt;
  }

  // Motion mode (from new location or old pair_motion_settings)
  const motionMode =
    newOverrides.motionMode ??
    metadata.pair_motion_settings?.motion_mode;
  if (motionMode !== undefined) {
    overrides.motionMode = motionMode;
  }

  // Motion amount (normalize from 0-1 if from old format)
  const rawMotionAmount =
    newOverrides.amountOfMotion ??
    metadata.pair_motion_settings?.amount_of_motion;
  if (rawMotionAmount !== undefined) {
    overrides.amountOfMotion = normalizeMotionAmount(rawMotionAmount);
  }

  // Phase config
  const phaseConfig = newOverrides.phaseConfig ?? metadata.pair_phase_config;
  if (phaseConfig !== undefined) {
    overrides.phaseConfig = phaseConfig;
  }

  // Phase preset ID (using existing field name)
  const selectedPhasePresetId =
    newOverrides.selectedPhasePresetId ??
    metadata.pair_selected_phase_preset_id;
  if (selectedPhasePresetId !== undefined) {
    overrides.selectedPhasePresetId = selectedPhasePresetId;
  }

  // LoRAs
  const loras = newOverrides.loras ?? metadata.pair_loras;
  if (loras !== undefined && Array.isArray(loras) && loras.length > 0) {
    overrides.loras = migrateLoras(loras);
  }

  // Frame count (using existing field name: numFrames)
  const numFrames = newOverrides.numFrames ?? metadata.pair_num_frames;
  if (numFrames !== undefined) {
    overrides.numFrames = numFrames;
  }

  // Random seed
  const randomSeed = newOverrides.randomSeed ?? metadata.pair_random_seed;
  if (randomSeed !== undefined) {
    overrides.randomSeed = randomSeed;
  }

  // Seed
  const seed = newOverrides.seed ?? metadata.pair_seed;
  if (seed !== undefined) {
    overrides.seed = seed;
  }

  // Structure video overrides (new format only, no legacy fields)
  if (newOverrides.structureMotionStrength !== undefined) {
    overrides.structureMotionStrength = newOverrides.structureMotionStrength;
  }
  if (newOverrides.structureTreatment !== undefined) {
    overrides.structureTreatment = newOverrides.structureTreatment;
  }
  if (newOverrides.structureUni3cEndPercent !== undefined) {
    overrides.structureUni3cEndPercent = newOverrides.structureUni3cEndPercent;
  }

  return overrides;
}

/**
 * Write segment overrides to metadata in new format.
 * MERGES with existing segmentOverrides - only updates fields present in overrides.
 * Use `null` value to explicitly delete a field.
 *
 * @param currentMetadata - Current metadata object
 * @param overrides - New segment overrides to write (null values delete the field)
 * @returns Updated metadata object
 */
export function writeSegmentOverrides(
  currentMetadata: Record<string, any> | null | undefined,
  overrides: SegmentOverrides
): Record<string, any> {
  const metadata = { ...(currentMetadata ?? {}) };

  // Start with existing segmentOverrides (merge, not replace)
  const existingOverrides = metadata.segmentOverrides ?? {};
  const newOverrides = { ...existingOverrides };

  // Update each field if present in overrides
  // Use explicit undefined check so we can distinguish "not provided" from "set to value"
  if (overrides.prompt !== undefined) {
    newOverrides.prompt = overrides.prompt;
  }
  if (overrides.negativePrompt !== undefined) {
    newOverrides.negativePrompt = overrides.negativePrompt;
  }
  if (overrides.motionMode !== undefined) {
    newOverrides.motionMode = overrides.motionMode;
  }
  if (overrides.amountOfMotion !== undefined) {
    newOverrides.amountOfMotion = overrides.amountOfMotion;
  }
  if (overrides.phaseConfig !== undefined) {
    newOverrides.phaseConfig = overrides.phaseConfig;
  }
  if (overrides.selectedPhasePresetId !== undefined) {
    newOverrides.selectedPhasePresetId = overrides.selectedPhasePresetId;
  }
  if (overrides.loras !== undefined) {
    if (overrides.loras.length > 0) {
      newOverrides.loras = overrides.loras;
    } else {
      delete newOverrides.loras; // Empty array means clear
    }
  }
  if (overrides.numFrames !== undefined) {
    newOverrides.numFrames = overrides.numFrames;
  }
  if (overrides.randomSeed !== undefined) {
    newOverrides.randomSeed = overrides.randomSeed;
  }
  if (overrides.seed !== undefined) {
    newOverrides.seed = overrides.seed;
  }
  // Structure video overrides
  if (overrides.structureMotionStrength !== undefined) {
    newOverrides.structureMotionStrength = overrides.structureMotionStrength;
  }
  if (overrides.structureTreatment !== undefined) {
    newOverrides.structureTreatment = overrides.structureTreatment;
  }
  if (overrides.structureUni3cEndPercent !== undefined) {
    newOverrides.structureUni3cEndPercent = overrides.structureUni3cEndPercent;
  }

  metadata.segmentOverrides = newOverrides;

  // Clean up empty segmentOverrides
  if (Object.keys(metadata.segmentOverrides).length === 0) {
    delete metadata.segmentOverrides;
  }

  console.log(`[PairPromptDebug] writeSegmentOverrides result:`, {
    hasSegmentOverrides: !!metadata.segmentOverrides,
    segmentOverridesPrompt: metadata.segmentOverrides?.prompt?.substring(0, 30),
    segmentOverridesNegPrompt: metadata.segmentOverrides?.negativePrompt?.substring(0, 30),
  });

  return metadata;
}

// =============================================================================
// MERGE UTILITIES
// =============================================================================

/**
 * Merge shot defaults with segment overrides to get final segment settings.
 *
 * @param shotSettings - Shot-level defaults
 * @param overrides - Segment-level overrides (sparse)
 * @returns Complete SegmentSettings for this segment
 */
export function mergeSettingsWithOverrides(
  shotSettings: ShotVideoSettings,
  overrides: SegmentOverrides
): SegmentSettings {
  return {
    prompt: overrides.prompt ?? shotSettings.prompt,
    negativePrompt: overrides.negativePrompt ?? shotSettings.negativePrompt,
    motionMode: overrides.motionMode ?? shotSettings.motionMode,
    amountOfMotion: overrides.amountOfMotion ?? shotSettings.amountOfMotion,
    phaseConfig: overrides.phaseConfig ?? shotSettings.phaseConfig,
    selectedPhasePresetId: overrides.selectedPhasePresetId ?? shotSettings.selectedPhasePresetId,
    loras: overrides.loras ?? shotSettings.loras,
    numFrames: overrides.numFrames ?? shotSettings.numFrames,
    randomSeed: overrides.randomSeed ?? shotSettings.randomSeed,
    seed: overrides.seed ?? shotSettings.seed,
    makePrimaryVariant: shotSettings.makePrimaryVariant,
    // Structure video overrides (segment-level only, no shot-level defaults)
    structureMotionStrength: overrides.structureMotionStrength,
    structureTreatment: overrides.structureTreatment,
    structureUni3cEndPercent: overrides.structureUni3cEndPercent,
  };
}

/**
 * Extract overrides by comparing segment settings to shot defaults.
 * Returns only fields that differ from defaults.
 *
 * @param settings - Current segment settings
 * @param defaults - Shot-level defaults
 * @returns Sparse overrides (only changed fields)
 */
export function extractOverrides(
  settings: SegmentSettings,
  defaults: ShotVideoSettings
): SegmentOverrides {
  const overrides: SegmentOverrides = {};

  if (settings.prompt !== defaults.prompt) {
    overrides.prompt = settings.prompt;
  }
  if (settings.negativePrompt !== defaults.negativePrompt) {
    overrides.negativePrompt = settings.negativePrompt;
  }
  if (settings.motionMode !== defaults.motionMode) {
    overrides.motionMode = settings.motionMode;
  }
  if (settings.amountOfMotion !== defaults.amountOfMotion) {
    overrides.amountOfMotion = settings.amountOfMotion;
  }
  if (JSON.stringify(settings.phaseConfig) !== JSON.stringify(defaults.phaseConfig)) {
    overrides.phaseConfig = settings.phaseConfig;
  }
  if (settings.selectedPhasePresetId !== defaults.selectedPhasePresetId) {
    overrides.selectedPhasePresetId = settings.selectedPhasePresetId;
  }
  if (JSON.stringify(settings.loras) !== JSON.stringify(defaults.loras)) {
    overrides.loras = settings.loras;
  }
  if (settings.numFrames !== defaults.numFrames) {
    overrides.numFrames = settings.numFrames;
  }
  if (settings.randomSeed !== defaults.randomSeed) {
    overrides.randomSeed = settings.randomSeed;
  }
  if (settings.seed !== defaults.seed) {
    overrides.seed = settings.seed;
  }
  // Structure video overrides (always include if set since no shot-level defaults)
  if (settings.structureMotionStrength !== undefined) {
    overrides.structureMotionStrength = settings.structureMotionStrength;
  }
  if (settings.structureTreatment !== undefined) {
    overrides.structureTreatment = settings.structureTreatment;
  }
  if (settings.structureUni3cEndPercent !== undefined) {
    overrides.structureUni3cEndPercent = settings.structureUni3cEndPercent;
  }

  return overrides;
}

// =============================================================================
// CONVERSION TO TASK PARAMS (for backend)
// =============================================================================

/**
 * Convert SegmentSettings to task params format for backend.
 * This is where amountOfMotion 0-100 → 0-1 conversion happens.
 *
 * @param settings - Segment settings
 * @returns Object ready for task creation
 */
export function settingsToTaskParams(settings: SegmentSettings): Record<string, any> {
  return {
    // Prompts
    base_prompt: settings.prompt,
    negative_prompt: settings.negativePrompt,

    // Motion (convert to 0-1 scale for backend)
    motion_mode: settings.motionMode,
    amount_of_motion: motionAmountToBackend(settings.amountOfMotion),
    advanced_mode: settings.motionMode === 'advanced',

    // Phase config
    phase_config: settings.phaseConfig,
    selected_phase_preset_id: settings.selectedPhasePresetId,

    // LoRAs (convert to backend format)
    loras: settings.loras.map(l => ({
      path: l.path,
      strength: l.strength,
      low_noise_path: l.lowNoisePath,
      is_multi_stage: l.isMultiStage,
    })),

    // Video
    num_frames: settings.numFrames,

    // Seed
    random_seed: settings.randomSeed,
    seed: settings.seed,

    // Structure video overrides (only included if set)
    ...(settings.structureMotionStrength !== undefined && {
      structure_motion_strength: settings.structureMotionStrength,
    }),
    ...(settings.structureTreatment !== undefined && {
      structure_treatment: settings.structureTreatment,
    }),
    ...(settings.structureUni3cEndPercent !== undefined && {
      structure_uni3c_end_percent: settings.structureUni3cEndPercent,
    }),
  };
}

// =============================================================================
// LOGGING HELPERS
// =============================================================================

/**
 * Create a loggable summary of settings for debugging.
 */
export function summarizeSettings(settings: SegmentSettings | ShotVideoSettings): Record<string, any> {
  return {
    prompt: settings.prompt?.substring(0, 30) + (settings.prompt?.length > 30 ? '...' : ''),
    negativePrompt: settings.negativePrompt?.substring(0, 30) + (settings.negativePrompt?.length > 30 ? '...' : ''),
    motionMode: settings.motionMode,
    amountOfMotion: settings.amountOfMotion,
    hasPhaseConfig: !!settings.phaseConfig,
    selectedPhasePresetId: settings.selectedPhasePresetId,
    loraCount: settings.loras?.length ?? 0,
    numFrames: settings.numFrames,
    randomSeed: settings.randomSeed,
    seed: settings.seed,
  };
}
