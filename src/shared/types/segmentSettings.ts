/**
 * Unified Segment Settings Types
 *
 * This file defines the canonical types for video generation settings.
 * These types are used at ALL layers:
 * - Shot level: default settings for all segments
 * - Segment/Pair level: overrides for specific segments
 * - Form level: current editing state
 * - Task level: final values sent to backend
 *
 * NAMING CONVENTION: camelCase everywhere (no snake_case, no prefixes)
 * SCALE CONVENTION: motionAmount is 0-100 everywhere, converted to 0-1 only at task submission
 */

import type { PhaseConfig } from '@/tools/travel-between-images/settings';

// =============================================================================
// LORA CONFIG
// =============================================================================

/**
 * LoRA configuration - unified format for all layers.
 */
export interface LoraConfig {
  id: string;
  name: string;
  path: string;
  strength: number;
  /** For multi-stage LoRAs - low noise variant path */
  lowNoisePath?: string;
  /** Whether this is a multi-stage LoRA (high/low noise variants) */
  isMultiStage?: boolean;
  /** Preview image URL */
  previewImageUrl?: string;
  /** Trigger word for the LoRA */
  triggerWord?: string;
}

// =============================================================================
// SEGMENT SETTINGS (Core - used at both shot and segment level)
// =============================================================================

/**
 * Core segment settings that can exist at shot level (defaults) or segment level (overrides).
 *
 * At shot level: provides defaults for all segments
 * At segment level: sparse object with only overridden fields
 *
 * NOTE: Field names match existing codebase conventions for backwards compatibility:
 * - amountOfMotion (not motionAmount) - 0-100 scale
 * - numFrames (not frameCount)
 * - selectedPhasePresetId (not phasePresetId)
 */
export interface SegmentSettings {
  // === PROMPTS ===
  /** Main generation prompt */
  prompt: string;
  /** Negative prompt - things to avoid */
  negativePrompt: string;

  // === MOTION ===
  /** Motion control mode */
  motionMode: 'basic' | 'advanced';
  /** Amount of motion (0-100 scale, UI-friendly). Convert to 0-1 only at task submission. */
  amountOfMotion: number;

  // === ADVANCED CONFIG ===
  /** Phase configuration for advanced mode */
  phaseConfig?: PhaseConfig;
  /** ID of selected phase preset (null = custom/manual) */
  selectedPhasePresetId: string | null;

  // === LORAS ===
  /** Active LoRAs for generation */
  loras: LoraConfig[];

  // === VIDEO ===
  /** Frame count for this segment */
  numFrames: number;

  // === SEED ===
  /** Whether to use random seed */
  randomSeed: boolean;
  /** Specific seed value (only used if randomSeed is false) */
  seed?: number;

  // === VARIANT BEHAVIOR ===
  /** Whether to make this the primary variant when regenerating */
  makePrimaryVariant: boolean;
}

// =============================================================================
// SHOT VIDEO SETTINGS (Extends SegmentSettings with batch-specific fields)
// =============================================================================

/**
 * Shot-level video settings - extends SegmentSettings with batch-specific fields.
 * This is what's stored in shots.settings['travel-between-images'].
 *
 * NOTE: Field names match existing codebase conventions:
 * - batchVideoFrames (not batchFrameCount)
 * - enhancePrompt (not enhancePrompts)
 * - generationTypeMode (not generationMode)
 */
export interface ShotVideoSettings extends SegmentSettings {
  // === BATCH-SPECIFIC (not per-segment) ===
  /** Default frame count for batch generation */
  batchVideoFrames: number;
  /** Text prepended to all prompts */
  textBeforePrompts: string;
  /** Text appended to all prompts */
  textAfterPrompts: string;
  /** Whether to AI-enhance prompts */
  enhancePrompt: boolean;
  /** Generation mode: I2V or VACE */
  generationTypeMode: 'i2v' | 'vace';

  // === LEGACY/UI STATE (not part of core settings) ===
  /** @deprecated Use motionMode === 'advanced' instead */
  advancedMode?: boolean;
}

// =============================================================================
// SEGMENT OVERRIDES (Sparse - only overridden fields)
// =============================================================================

/**
 * Segment-level overrides - a sparse version of SegmentSettings.
 * Only includes fields that differ from shot defaults.
 * Stored in shot_generations.metadata.segmentOverrides
 */
export type SegmentOverrides = Partial<Omit<SegmentSettings, 'makePrimaryVariant'>>;

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Default values for SegmentSettings.
 */
export const DEFAULT_SEGMENT_SETTINGS: SegmentSettings = {
  prompt: '',
  negativePrompt: '',
  motionMode: 'basic',
  amountOfMotion: 50,
  phaseConfig: undefined,
  selectedPhasePresetId: null,
  loras: [],
  numFrames: 61,
  randomSeed: true,
  seed: undefined,
  makePrimaryVariant: false,
};

/**
 * Default values for ShotVideoSettings (extends segment defaults).
 */
export const DEFAULT_SHOT_VIDEO_SETTINGS: ShotVideoSettings = {
  ...DEFAULT_SEGMENT_SETTINGS,
  batchVideoFrames: 61,
  textBeforePrompts: '',
  textAfterPrompts: '',
  enhancePrompt: false,
  generationTypeMode: 'i2v',
};

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if a value is a valid LoraConfig.
 */
export function isLoraConfig(value: unknown): value is LoraConfig {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.path === 'string' && typeof obj.strength === 'number';
}

/**
 * Check if a value is a valid SegmentSettings.
 */
export function isSegmentSettings(value: unknown): value is SegmentSettings {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.prompt === 'string' &&
    typeof obj.negativePrompt === 'string' &&
    (obj.motionMode === 'basic' || obj.motionMode === 'advanced') &&
    typeof obj.amountOfMotion === 'number'
  );
}
