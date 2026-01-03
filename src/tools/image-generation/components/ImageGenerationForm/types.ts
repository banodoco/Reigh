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

  // DEPRECATED: Legacy shot-specific storage (replaced by ImageGenShotSettings)
  // Kept for migration - will be removed after all users migrate
  promptsByShot?: Record<string, PromptEntry[]>;
  masterPromptByShot?: Record<string, string>;
  /** Master prompt when no shot is selected (project-level fallback) */
  masterPrompt?: string;
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

// Reference mode type
export type ReferenceMode = 'style' | 'subject' | 'style-character' | 'scene' | 'custom';

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

// Project-level settings for model and style reference
// Note: Most no-shot settings (masterPrompt, promptMode, beforeEachPromptText, afterEachPromptText,
// associatedShotId) are persisted via usePersistentToolState with toolId='image-generation'.
// Only projectPrompts needs explicit persistence here since it's an array not mapped there.
export interface ProjectImageSettings {
  selectedModel?: GenerationMode;

  // Generation source: by-reference or just-text
  generationSource?: GenerationSource;
  // Model for just-text mode
  selectedTextModel?: TextToImageModel;

  // Project-level prompts (used when no shot is selected)
  // This is the only no-shot field here - others are in usePersistentToolState
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
// Hires Fix / Two-Pass Generation Settings
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

/**
 * Configuration for two-pass hires fix image generation.
 * When enabled, generates at base resolution then upscales with refinement.
 */
export interface HiresFixConfig {
  /** Whether hires fix is enabled */
  enabled: boolean;
  /** Number of inference steps for base pass (default 6) */
  baseSteps: number;
  /** Upscale factor for hires pass (e.g., 2.0 = 2x resolution) */
  hiresScale: number;
  /** Number of steps for hires/refinement pass (default 6) */
  hiresSteps: number;
  /** Denoising strength for hires pass (0-1, default 0.5) */
  hiresDenoise: number;
  /** Per-LoRA phase strength overrides */
  phaseLoraStrengths: PhaseLoraStrength[];
}

/** Default hires fix configuration */
export const DEFAULT_HIRES_FIX_CONFIG: HiresFixConfig = {
  enabled: true,
  baseSteps: 6,
  hiresScale: 2.0,
  hiresSteps: 6,
  hiresDenoise: 0.5,
  phaseLoraStrengths: [],
};
