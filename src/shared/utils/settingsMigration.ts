/**
 * Settings Migration Utilities
 *
 * These utilities handle reading and writing settings in the unified format.
 *
 * SHOT SETTINGS (shots.settings['travel-between-images']):
 * - prompt, negativePrompt, motionMode, amountOfMotion, phaseConfig,
 *   selectedPhasePresetId, loras, numFrames, randomSeed, seed, etc.
 *
 * SEGMENT OVERRIDES (shot_generations.metadata.segmentOverrides):
 * - prompt, negativePrompt, motionMode, amountOfMotion, phaseConfig,
 *   selectedPhasePresetId, loras, numFrames, randomSeed, seed
 *
 * NOTE: Old field names (batchVideoPrompt, selectedLoras, pair_* fields) were
 * migrated to new names via DB migration 20260125_migrate_settings_field_names.sql.
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
 * Read shot settings from unified format.
 *
 * @param raw - Raw settings object from shots.settings['travel-between-images']
 * @returns Normalized ShotVideoSettings
 */
export function readShotSettings(raw: Record<string, any> | null | undefined): ShotVideoSettings {
  if (!raw) return { ...DEFAULT_SHOT_VIDEO_SETTINGS };

  return {
    // Prompts (unified field names after DB migration)
    prompt: raw.prompt ?? DEFAULT_SHOT_VIDEO_SETTINGS.prompt,
    negativePrompt: raw.negativePrompt ?? DEFAULT_SHOT_VIDEO_SETTINGS.negativePrompt,

    // Motion
    motionMode: raw.motionMode ?? DEFAULT_SHOT_VIDEO_SETTINGS.motionMode,
    amountOfMotion: normalizeMotionAmount(raw.amountOfMotion),

    // Advanced config
    phaseConfig: raw.phaseConfig,
    selectedPhasePresetId: raw.selectedPhasePresetId ?? DEFAULT_SHOT_VIDEO_SETTINGS.selectedPhasePresetId,

    // LoRAs (unified field name after DB migration)
    loras: migrateLoras(raw.loras),

    // Video
    numFrames: raw.numFrames ?? DEFAULT_SHOT_VIDEO_SETTINGS.numFrames,

    // Seed
    randomSeed: raw.randomSeed ?? DEFAULT_SHOT_VIDEO_SETTINGS.randomSeed,
    seed: raw.seed,

    // Variant behavior
    makePrimaryVariant: raw.makePrimaryVariant ?? DEFAULT_SHOT_VIDEO_SETTINGS.makePrimaryVariant,

    // Batch-specific
    batchVideoFrames: raw.batchVideoFrames ?? DEFAULT_SHOT_VIDEO_SETTINGS.batchVideoFrames,
    textBeforePrompts: raw.textBeforePrompts ?? DEFAULT_SHOT_VIDEO_SETTINGS.textBeforePrompts,
    textAfterPrompts: raw.textAfterPrompts ?? DEFAULT_SHOT_VIDEO_SETTINGS.textAfterPrompts,
    enhancePrompt: raw.enhancePrompt ?? DEFAULT_SHOT_VIDEO_SETTINGS.enhancePrompt,
    generationTypeMode: raw.generationTypeMode ?? DEFAULT_SHOT_VIDEO_SETTINGS.generationTypeMode,

    // Legacy (for any code still reading this)
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
 * Read segment overrides from metadata.
 * Returns sparse SegmentOverrides with only overridden fields.
 *
 * @param metadata - Raw metadata object from shot_generations.metadata
 * @returns Sparse SegmentOverrides (only fields that were set)
 */
export function readSegmentOverrides(metadata: Record<string, any> | null | undefined): SegmentOverrides {
  if (!metadata) return {};

  const overrides: SegmentOverrides = {};
  const segmentOverrides = metadata.segmentOverrides ?? {};

  // Prompt - include empty strings to distinguish "explicitly empty" from "no override"
  if (segmentOverrides.prompt !== undefined) {
    overrides.prompt = segmentOverrides.prompt;
  }

  // Negative prompt - include empty strings to distinguish "explicitly empty" from "no override"
  if (segmentOverrides.negativePrompt !== undefined) {
    overrides.negativePrompt = segmentOverrides.negativePrompt;
  }

  // Motion mode
  if (segmentOverrides.motionMode !== undefined) {
    overrides.motionMode = segmentOverrides.motionMode;
  }

  // Motion amount (normalize to 0-100 scale)
  if (segmentOverrides.amountOfMotion !== undefined) {
    overrides.amountOfMotion = normalizeMotionAmount(segmentOverrides.amountOfMotion);
  }

  // Phase config
  if (segmentOverrides.phaseConfig !== undefined) {
    overrides.phaseConfig = segmentOverrides.phaseConfig;
  }

  // Phase preset ID
  if (segmentOverrides.selectedPhasePresetId !== undefined) {
    overrides.selectedPhasePresetId = segmentOverrides.selectedPhasePresetId;
  }

  // LoRAs - include empty arrays to distinguish "explicitly no loras" from "no override"
  if (segmentOverrides.loras !== undefined && Array.isArray(segmentOverrides.loras)) {
    overrides.loras = migrateLoras(segmentOverrides.loras);
  }

  // Frame count
  if (segmentOverrides.numFrames !== undefined) {
    overrides.numFrames = segmentOverrides.numFrames;
  }

  // Random seed
  if (segmentOverrides.randomSeed !== undefined) {
    overrides.randomSeed = segmentOverrides.randomSeed;
  }

  // Seed
  if (segmentOverrides.seed !== undefined) {
    overrides.seed = segmentOverrides.seed;
  }

  // Structure video overrides
  if (segmentOverrides.structureMotionStrength !== undefined) {
    overrides.structureMotionStrength = segmentOverrides.structureMotionStrength;
  }
  if (segmentOverrides.structureTreatment !== undefined) {
    overrides.structureTreatment = segmentOverrides.structureTreatment;
  }
  if (segmentOverrides.structureUni3cEndPercent !== undefined) {
    overrides.structureUni3cEndPercent = segmentOverrides.structureUni3cEndPercent;
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
    newOverrides.loras = overrides.loras;  // Preserve empty arrays to distinguish "no loras" from "use shot default"
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
