// Import API types from shared (used in interfaces below, re-exported at bottom)
import { ReferenceMode } from '@/shared/lib/tasks/imageGeneration';
import type { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';

export type GenerationMode = 'wan-local' | 'qwen-image';

export type PromptMode = 'managed' | 'automated';

// Generation source: whether to use a reference image or just text prompts
export type GenerationSource = 'by-reference' | 'just-text';

// Available models for "just text" mode
export type TextToImageModel = 'qwen-image' | 'qwen-image-2512' | 'z-image';

export const TEXT_TO_IMAGE_MODELS: { id: TextToImageModel; name: string; description: string; loraType: string }[] = [
  { id: 'qwen-image', name: 'Qwen Image', description: 'Default Qwen model', loraType: 'Qwen Image' },
  { id: 'qwen-image-2512', name: 'Qwen Image 2512', description: 'Higher resolution Qwen', loraType: 'Qwen Image 2512' },
  { id: 'z-image', name: 'Z-Image', description: 'Z-Image model', loraType: 'Z-Image' },
];

// LoRA type for "by reference" mode (always Qwen Image)
export const BY_REFERENCE_LORA_TYPE = 'Qwen Image';

// Get the LoRA type for a given text-to-image model
export function getLoraTypeForModel(model: TextToImageModel): string {
  return TEXT_TO_IMAGE_MODELS.find(m => m.id === model)?.loraType ?? 'Qwen Image';
}

export interface MetadataLora {
  id: string;
  name: string;
  path: string;
  strength: number; 
  previewImageUrl?: string;
}

export interface ImageGenerationFormHandles {
  applySettings: (settings: DisplayableMetadata) => void;
  getAssociatedShotId: () => string | null;
}

export interface PromptEntry {
  id: string;
  fullPrompt: string;
  shortPrompt?: string;
  selected?: boolean;
}

interface LoraDataEntry {
  "Model ID": string;
  Name: string;
  Author: string;
  Images: Array<{ url: string; alt_text: string; [key: string]: any; }>;
  "Model Files": Array<{ url: string; path: string; [key: string]: any; }>;
  [key: string]: any;
}

export interface LoraData {
  models: LoraDataEntry[];
}

export interface PersistedFormSettings {
  // Project-level settings (NOT shot-specific)
  imagesPerPrompt?: number;
  selectedLoras?: ActiveLora[];
  depthStrength?: number;
  softEdgeStrength?: number;
  /** Text to prepend to every prompt (defaults to empty, not inherited) */
  beforeEachPromptText?: string;
  /** Text to append to every prompt (defaults to empty, not inherited) */
  afterEachPromptText?: string;
  selectedLorasByMode?: Record<GenerationMode, ActiveLora[]>;
  associatedShotId?: string | null;
  promptMode?: PromptMode;
  /** Two-pass hires fix configuration for local generation */
  hiresFixConfig?: HiresFixConfig;

  /** Prompts when no shot is selected (project-level fallback) */
  prompts?: PromptEntry[];
  /** Master prompt when no shot is selected (project-level fallback) */
  masterPrompt?: string;

  // DEPRECATED: Legacy shot-specific storage (replaced by ImageGenShotSettings)
  // Kept for migration - will be removed after all users migrate
  promptsByShot?: Record<string, PromptEntry[]>;
  masterPromptByShot?: Record<string, string>;
}

/**
 * Shot-scoped settings for image generation prompts.
 * Stored per-shot in shots.settings['image-gen-prompts']
 * Uses useAutoSaveSettings for automatic persistence.
 */
export interface ImageGenShotSettings {
  /** Prompts for this shot */
  prompts: PromptEntry[];
  /** Master prompt for automated mode */
  masterPrompt: string;
  /** Prompt mode: automated vs managed */
  promptMode?: PromptMode;
  /** Selected reference ID for this shot */
  selectedReferenceId?: string | null;
  /** Text to prepend to every prompt (defaults to empty, not inherited between shots) */
  beforeEachPromptText?: string;
  /** Text to append to every prompt (defaults to empty, not inherited between shots) */
  afterEachPromptText?: string;
}

// Reference mode type - re-exported from shared at bottom of file
// (kept here as comment to explain the type used in interfaces below)

// Reference pointer stored in tool settings (lightweight)
// Actual image data is stored in resources table, usage settings stored here
export interface ReferenceImage {
  id: string; // Unique identifier for UI state (use nanoid())
  resourceId: string; // ID in resources table where actual data is stored
  
  // Project-specific usage settings (how YOU use this reference in YOUR project)
  referenceMode?: ReferenceMode;
  styleReferenceStrength?: number;
  subjectStrength?: number;
  subjectDescription?: string;
  inThisScene?: boolean;
  inThisSceneStrength?: number;
  styleBoostTerms?: string;
  
  // Legacy fields for migration - will be removed after bulk migration
  name?: string;
  styleReferenceImage?: string | null;
  styleReferenceImageOriginal?: string | null;
  thumbnailUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Hydrated reference with full data from resources table
export interface HydratedReferenceImage {
  id: string; // UI identifier
  resourceId: string; // Resource table ID
  name: string;
  styleReferenceImage: string;
  styleReferenceImageOriginal: string;
  thumbnailUrl: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
  styleBoostTerms: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean; // Whether this reference is visible to other users
  isOwner: boolean; // Whether the current user owns this reference
}

// LoRA category for storage - Qwen models and by-reference share one bucket, Z-Image has its own
export type LoraCategory = 'qwen' | 'z-image';

// Get the LoRA category for a given model (used for per-category LORA storage)
// Any model starting with 'z-' is categorized as z-image, everything else is qwen
export function getLoraCategoryForModel(model: TextToImageModel): LoraCategory {
  return model.startsWith('z-') ? 'z-image' : 'qwen';
}

// Project-level settings for model and style reference
// Note: Prompt-related no-shot settings (prompts, masterPrompt, promptMode, beforeEachPromptText,
// afterEachPromptText, associatedShotId) are persisted via usePersistentToolState with toolId='image-generation'.
// This interface stores model selection and reference image settings in 'project-image-settings'.
export interface ProjectImageSettings {
  selectedModel?: GenerationMode;

  // Generation source: by-reference or just-text
  generationSource?: GenerationSource;
  // Model for just-text mode
  selectedTextModel?: TextToImageModel;
  // Per-category LoRA selections: 'qwen' (shared by all Qwen models + by-reference) and 'z-image'
  selectedLorasByCategory?: Record<LoraCategory, ActiveLora[]>;
  // DEPRECATED: per-model storage (migrated to selectedLorasByCategory)
  selectedLorasByTextModel?: Record<TextToImageModel, ActiveLora[]>;

  // DEPRECATED: projectPrompts moved to 'image-generation' tool settings via usePersistentToolState
  // Kept for migration - will be removed after all users migrate
  projectPrompts?: PromptEntry[];

  // Multi-reference structure (shot-specific selection)
  selectedReferenceIdByShot?: Record<string, string | null>; // Map of shotId -> referenceId
  references?: ReferenceImage[]; // Array of references (project-wide)

  // Legacy structures (deprecated, kept for migration)
  selectedReferenceId?: string | null; // Old project-wide selection (deprecated)
  styleReferenceImage?: string | null; // URL of processed style reference image (used for generation)
  styleReferenceImageOriginal?: string | null; // URL of original uploaded image (used for display)
  styleReferenceStrength?: number; // Style strength slider value
  subjectStrength?: number; // Subject strength slider value
  subjectDescription?: string; // Subject description text input
  inThisScene?: boolean; // Whether subject is "in this scene" checkbox
}

export interface PromptInputRowProps {
  promptEntry: PromptEntry;
  onUpdate: (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
  isGenerating?: boolean;
  hasApiKey?: boolean;
  index: number;
  totalPrompts?: number;
  onEditWithAI?: () => void;
  aiEditButtonIcon?: React.ReactNode;
  onSetActiveForFullView: (id: string | null) => void;
  isActiveForFullView: boolean;
  forceExpanded?: boolean;
  /**
   * When true on mobile, entering active full-view automatically switches into typing mode.
   */
  autoEnterEditWhenActive?: boolean;
  /**
   * Optional custom content to render on the right side of the header.
   * When provided, it replaces the default AI edit icon button, but retains
   * the remove button (if allowed).
   */
  rightHeaderAddon?: React.ReactNode;
  /**
   * When true on mobile, hides the header label and remove button and
   * allows the right header addon to expand to full width.
   */
  mobileInlineEditing?: boolean;
  /**
   * When true, hides the remove button regardless of platform.
   */
  hideRemoveButton?: boolean;
}

// Re-export ActiveLora from shared component
export type { ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";

// Re-export DisplayableMetadata from shared component
export type { DisplayableMetadata } from "@/shared/components/ImageGallery";

// ============================================================================
// Re-export API types from shared (single source of truth)
// ============================================================================
export type { ReferenceApiParams, HiresFixApiParams, ReferenceMode } from '@/shared/lib/tasks/imageGeneration';
export { DEFAULT_REFERENCE_PARAMS } from '@/shared/lib/tasks/imageGeneration';

/**
 * Helper to convert from HydratedReferenceImage to ReferenceApiParams.
 * Use this when reading from hydrated reference to prepare task params.
 */
export function toReferenceApiParams(
  hydrated: {
    styleReferenceImage?: string;
    styleReferenceStrength?: number;
    subjectStrength?: number;
    subjectDescription?: string;
    inThisScene?: boolean;
    inThisSceneStrength?: number;
    referenceMode?: ReferenceMode;
  },
  defaults = DEFAULT_REFERENCE_PARAMS
): ReferenceApiParams {
  return {
    style_reference_image: hydrated.styleReferenceImage,
    style_reference_strength: hydrated.styleReferenceStrength ?? defaults.style_reference_strength,
    subject_strength: hydrated.subjectStrength ?? defaults.subject_strength,
    subject_description: hydrated.subjectDescription ?? defaults.subject_description,
    in_this_scene: hydrated.inThisScene ?? defaults.in_this_scene,
    in_this_scene_strength: hydrated.inThisSceneStrength ?? defaults.in_this_scene_strength,
    reference_mode: hydrated.referenceMode ?? defaults.reference_mode,
  };
}

// ============================================================================
// Hires Fix / Two-Pass Generation Settings (UI config)
// ============================================================================

/**
 * Per-LoRA phase strength override for two-pass hires fix generation.
 * Allows different LoRA strengths for the initial pass vs the upscaling pass.
 */
export interface PhaseLoraStrength {
  /** References ActiveLora.id for syncing with base LoRA selection */
  loraId: string;
  /** LoRA file URL for task payload */
  loraPath: string;
  /** Display name */
  loraName: string;
  /** Strength for initial pass (0-2) */
  pass1Strength: number;
  /** Strength for upscaling/hires pass (0-2) */
  pass2Strength: number;
}

/** Resolution mode for image generation */
export type ResolutionMode = 'project' | 'custom';

/**
 * Configuration for two-pass hires fix image generation.
 * When enabled, generates at base resolution then upscales with refinement.
 *
 * Uses snake_case to match API params directly - no conversion needed.
 */
export interface HiresFixConfig {
  /** Whether hires fix is enabled (UI only) */
  enabled: boolean;
  /** Resolution mode: 'project' uses project dimensions, 'custom' allows selecting aspect ratio */
  resolution_mode: ResolutionMode;
  /** Custom aspect ratio when resolution_mode is 'custom' (e.g., "16:9") */
  custom_aspect_ratio?: string;
  /** Scale factor for initial resolution vs base resolution (1.0-2.5x) */
  resolution_scale: number;
  /** Number of inference steps for base pass (maps to `steps` in API) */
  base_steps: number;
  /** Upscale factor for hires pass (e.g., 2.0 = 2x resolution) */
  hires_scale: number;
  /** Number of steps for hires/refinement pass */
  hires_steps: number;
  /** Denoising strength for hires pass (0-1) */
  hires_denoise: number;
  /** Lightning LoRA strength for phase 1 (initial generation, 0-1) */
  lightning_lora_strength_phase_1: number;
  /** Lightning LoRA strength for phase 2 (hires/refinement pass, 0-1) */
  lightning_lora_strength_phase_2: number;
  /** Per-LoRA phase strength overrides (UI structure, transforms to additional_loras) */
  phaseLoraStrengths: PhaseLoraStrength[];
}

/** Default hires fix configuration (used as fallback) */
export const DEFAULT_HIRES_FIX_CONFIG: HiresFixConfig = {
  enabled: true,
  resolution_mode: 'project',
  resolution_scale: 1.5,
  base_steps: 8,
  hires_scale: 1.1,
  hires_steps: 8,
  hires_denoise: 0.55,
  lightning_lora_strength_phase_1: 0.9,
  lightning_lora_strength_phase_2: 0.5,
  phaseLoraStrengths: [],
};

/** Model-specific hires fix defaults */
export const MODEL_HIRES_FIX_DEFAULTS: Record<string, HiresFixConfig> = {
  // Qwen Image - used for by-reference mode and just-text qwen-image
  'qwen-image': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 8,
    hires_scale: 1.1,
    hires_steps: 8,
    hires_denoise: 0.55,
    lightning_lora_strength_phase_1: 0.9,
    lightning_lora_strength_phase_2: 0.5,
    phaseLoraStrengths: [],
  },
  // Qwen Image 2512 - higher resolution variant
  'qwen-image-2512': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 10,
    hires_scale: 1.0,
    hires_steps: 8,
    hires_denoise: 0.5,
    lightning_lora_strength_phase_1: 0.85,
    lightning_lora_strength_phase_2: 0.4,
    phaseLoraStrengths: [],
  },
  // Z-Image model
  'z-image': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 12,
    hires_scale: 1.2,
    hires_steps: 10,
    hires_denoise: 0.6,
    lightning_lora_strength_phase_1: 0.8,
    lightning_lora_strength_phase_2: 0.3,
    phaseLoraStrengths: [],
  },
};

/** Get the default hires fix config for a given model */
export function getHiresFixDefaultsForModel(modelName: string): HiresFixConfig {
  return MODEL_HIRES_FIX_DEFAULTS[modelName] ?? DEFAULT_HIRES_FIX_CONFIG;
}

// ============================================================================
// Reference Mode Strength Defaults
// ============================================================================

export interface ReferenceModeStrengths {
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisSceneStrength: number;
  inThisScene: boolean;
}

/** Default strength values for each reference mode, by generation environment */
export const REFERENCE_MODE_DEFAULTS: Record<'local' | 'cloud', Record<ReferenceMode, ReferenceModeStrengths>> = {
  local: {
    style: { styleReferenceStrength: 1.1, subjectStrength: 0, inThisSceneStrength: 0, inThisScene: false },
    subject: { styleReferenceStrength: 0.4, subjectStrength: 1.0, inThisSceneStrength: 0, inThisScene: false },
    scene: { styleReferenceStrength: 0.4, subjectStrength: 0, inThisSceneStrength: 1.0, inThisScene: true },
    custom: { styleReferenceStrength: 0.8, subjectStrength: 0.8, inThisSceneStrength: 0, inThisScene: false },
  },
  cloud: {
    style: { styleReferenceStrength: 1.1, subjectStrength: 0, inThisSceneStrength: 0, inThisScene: false },
    subject: { styleReferenceStrength: 1.1, subjectStrength: 0.4, inThisSceneStrength: 0, inThisScene: false },
    scene: { styleReferenceStrength: 1.1, subjectStrength: 0, inThisSceneStrength: 0.4, inThisScene: true },
    custom: { styleReferenceStrength: 0.8, subjectStrength: 0.8, inThisSceneStrength: 0, inThisScene: false },
  },
};

/** Get the default strength values for a given reference mode and generation environment */
export function getReferenceModeDefaults(mode: ReferenceMode, isLocalGeneration: boolean): ReferenceModeStrengths {
  const env = isLocalGeneration ? 'local' : 'cloud';
  return REFERENCE_MODE_DEFAULTS[env][mode] ?? REFERENCE_MODE_DEFAULTS[env].style;
}
