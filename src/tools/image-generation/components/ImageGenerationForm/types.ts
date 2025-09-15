export type GenerationMode = 'wan-local' | 'qwen-image';

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
  // Shot-specific prompts storage
  promptsByShot?: Record<string, PromptEntry[]>;
  imagesPerPrompt?: number;
  selectedLoras?: ActiveLora[];
  depthStrength?: number;
  softEdgeStrength?: number;
  beforeEachPromptText?: string;
  afterEachPromptText?: string;
  selectedLorasByMode?: Record<GenerationMode, ActiveLora[]>;
  associatedShotId?: string | null;
}

// Project-level settings for model and style reference
export interface ProjectImageSettings {
  selectedModel?: GenerationMode;
  styleReferenceImage?: string | null; // URL of processed style reference image (used for generation)
  styleReferenceImageOriginal?: string | null; // URL of original uploaded image (used for display)
  styleReferenceStrength?: number; // Strength slider value
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
