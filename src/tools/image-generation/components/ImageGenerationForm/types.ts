export type GenerationMode = 'wan-local' | 'qwen-image';

export type PromptMode = 'managed' | 'automated';

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
  beforeEachPromptText?: string;
  afterEachPromptText?: string;
  selectedLorasByMode?: Record<GenerationMode, ActiveLora[]>;
  associatedShotId?: string | null;
  promptMode?: PromptMode;
  
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
  /** Text to prepend to every prompt */
  beforeEachPromptText?: string;
  /** Text to append to every prompt */
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
export interface ProjectImageSettings {
  selectedModel?: GenerationMode;
  
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
