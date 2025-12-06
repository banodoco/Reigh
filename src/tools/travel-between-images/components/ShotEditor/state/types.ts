import { GenerationRow } from "@/types/shots";
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { ShotLora } from '@/tools/travel-between-images/settings';

// JSON type for compatibility with Supabase client types
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Segment generation parameters
export interface SegmentGenerationParams {
  prompts: string[];
  frames: number[];
  context: number[];
  generatedVideoUrl?: string;
}

// Interface for per-shot GenerationsPane settings (matches useGenerationsPageLogic.ts)
export interface GenerationsPaneSettings {
  selectedShotFilter: string;
  excludePositioned: boolean;
  // Flag to track if user has manually changed settings (never auto-reset after this)
  userHasCustomized?: boolean;
}

// Interface for individual video pair configuration
export interface VideoPairConfig {
  id: string;
  imageA: GenerationRow;
  imageB: GenerationRow;
  prompt: string;
  frames: number;
  context: number;
  generatedVideoUrl?: string;
}

// Steerable motion settings interface
export interface SteerableMotionSettings {
  negative_prompt: string;
  model_name: string;
  seed: number;
  debug: boolean;
  show_input_images: boolean;
}

// Default values for steerable motion settings - single source of truth
export const DEFAULT_STEERABLE_MOTION_SETTINGS: SteerableMotionSettings = {
  negative_prompt: '',
  model_name: 'wan_2_2_i2v_lightning_baseline_2_2_2',
  seed: 789,
  debug: false,
  show_input_images: false,
};

// Main props interface for ShotEditor
// NEW: Simplified settings bundle approach
export interface ShotSettings {
  videoControlMode: 'individual' | 'batch';
  batchVideoPrompt: string;
  batchVideoFrames: number;
  batchVideoSteps: number;
  steerableMotionSettings: SteerableMotionSettings;
  generationMode: 'batch' | 'timeline' | 'by-pair';
  enhancePrompt: boolean;
  turboMode: boolean;
  amountOfMotion: number;
  advancedMode: boolean;
  motionMode?: 'basic' | 'presets' | 'advanced'; // Motion control mode
  phaseConfig?: any;
  pairConfigs?: any[];
  textBeforePrompts?: string;
  textAfterPrompts?: string;
}

export interface ShotEditorProps {
  selectedShotId: string;
  projectId: string;
  videoPairConfigs?: VideoPairConfig[]; // DEPRECATED - pair prompts now in shot_generations.metadata.pair_prompt
  
  // NEW: Settings bundle (preferred way)
  settings?: ShotSettings;
  onUpdateSetting?: <K extends keyof ShotSettings>(key: K, value: ShotSettings[K]) => void;
  settingsStatus?: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  
  // OLD: Individual props (kept for backward compatibility)
  videoControlMode?: 'individual' | 'batch';
  batchVideoPrompt?: string;
  batchVideoFrames?: number;
  onShotImagesUpdate: () => void;
  onBack: () => void;
  onVideoControlModeChange?: (mode: 'individual' | 'batch') => void;
  onPairConfigChange: (pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => void;
  onBatchVideoPromptChange?: (prompt: string) => void;
  onBatchVideoFramesChange?: (frames: number) => void;
  batchVideoSteps?: number;
  onBatchVideoStepsChange?: (steps: number) => void;
  dimensionSource?: 'project' | 'firstImage' | 'custom';
  onDimensionSourceChange?: (source: 'project' | 'firstImage' | 'custom') => void;
  customWidth?: number;
  onCustomWidthChange?: (width?: number) => void;
  customHeight?: number;
  onCustomHeightChange?: (height?: number) => void;
  steerableMotionSettings?: SteerableMotionSettings;
  onSteerableMotionSettingsChange?: (settings: Partial<SteerableMotionSettings>) => void;
  onGenerateAllSegments: () => void;
  availableLoras: LoraModel[];
  
  // LoRAs - now unified with shot settings
  selectedLoras?: ShotLora[];
  onSelectedLorasChange?: (loras: ShotLora[]) => void;
  
  // Text before/after prompts
  textBeforePrompts?: string;
  onTextBeforePromptsChange?: (text: string) => void;
  textAfterPrompts?: string;
  onTextAfterPromptsChange?: (text: string) => void;

  generationMode?: 'batch' | 'timeline';
  onGenerationModeChange?: (mode: 'batch' | 'timeline') => void;
  enhancePrompt?: boolean;
  onEnhancePromptChange?: (enhance: boolean) => void;
  turboMode?: boolean;
  onTurboModeChange?: (turbo: boolean) => void;
  amountOfMotion?: number;
  onAmountOfMotionChange?: (motion: number) => void;
  // Motion mode
  motionMode?: 'basic' | 'presets' | 'advanced';
  onMotionModeChange?: (mode: 'basic' | 'presets' | 'advanced') => void;
  // Generation type mode (I2V vs VACE)
  generationTypeMode?: 'i2v' | 'vace';
  onGenerationTypeModeChange?: (mode: 'i2v' | 'vace') => void;
  // Advanced mode
  advancedMode?: boolean;
  onAdvancedModeChange?: (advanced: boolean) => void;
  phaseConfig?: any; // PhaseConfig type from settings
  onPhaseConfigChange?: (config: any) => void;
  // Phase preset props
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect?: (presetId: string, config: any) => void;
  onPhasePresetRemove?: () => void;
  // Blur save - triggers immediate save when user clicks away from field
  onBlurSave?: () => void;
  // Restore defaults - respects current I2V/VACE mode (Task 2)
  onRestoreDefaults?: () => void;
  // Mode selection removed - now hardcoded to use specific model
  // Navigation props
  onPreviousShot?: () => void;
  onNextShot?: () => void;
  onPreviousShotNoScroll?: () => void;
  onNextShotNoScroll?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  // Shot name editing
  onUpdateShotName?: (newName: string) => void;

  // Indicates if parent is still loading settings. Manage Shot Images should wait until this is false.
  settingsLoading?: boolean;
  
  // Project-wide video count lookup function for instant skeleton display
  getShotVideoCount?: (shotId: string | null) => number | null;
  
  // Function to invalidate video counts cache when videos are added/deleted
  invalidateVideoCountsCache?: () => void;
  
  // Callback refs for parent-level floating UI elements (notify parent when attached)
  headerContainerRef?: (node: HTMLDivElement | null) => void;
  timelineSectionRef?: (node: HTMLDivElement | null) => void;
  ctaContainerRef?: (node: HTMLDivElement | null) => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  
  // Mutable ref to expose shot-specific generation data to parent
  getGenerationDataRef?: React.MutableRefObject<(() => {
    structureVideo: {
      path: string | null;
      type: 'canny' | 'depth' | null;
      treatment: 'image' | 'video';
      motionStrength: number;
    };
    aspectRatio: string | null;
    loras: Array<{ id: string; path: string; strength: number; name: string }>;
    clearEnhancedPrompts: () => Promise<void>;
  }) | null>;
  
  // Mutable ref to expose generate video function to parent
  generateVideoRef?: React.MutableRefObject<((variantName: string) => Promise<void>) | null>;
  
  // Mutable ref to expose name click handler to parent (for floating header)
  nameClickRef?: React.MutableRefObject<(() => void) | null>;
  
  // CTA state from parent (for rendering CTA in both positions)
  variantName?: string;
  onVariantNameChange?: (name: string) => void;
  isGeneratingVideo?: boolean;
  videoJustQueued?: boolean;
}

// Internal state interface for the shot editor
export interface ShotEditorState {
  // Upload and UI state
  isUploadingImage: boolean;
  uploadProgress: number; // 0-100 percentage for image uploads
  fileInputKey: number;
  deletingVideoId: string | null;
  duplicatingImageId: string | null;
  duplicateSuccessImageId: string | null;
  pendingFramePositions: Map<string, number>;
  
  // REMOVED: localOrderedShotImages - redundant with two-phase loading + ShotImageManager's optimisticOrder
  
  // UI state
  creatingTaskId: string | null;
  isSettingsModalOpen: boolean;
  isModeReady: boolean;
  settingsError: string | null;
  
  // Shot name editing
  isEditingName: boolean;
  editingName: string;
  isTransitioningFromNameEdit: boolean;
  
  // Settings state
  showStepsNotification: boolean;
  hasInitializedShot: string | null;
  hasInitializedUISettings: string | null;
}

// Action types for state management
export type ShotEditorAction =
  | { type: 'SET_UPLOADING_IMAGE'; payload: boolean }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: number }
  | { type: 'SET_FILE_INPUT_KEY'; payload: number }
  | { type: 'SET_DELETING_VIDEO_ID'; payload: string | null }
  | { type: 'SET_DUPLICATING_IMAGE_ID'; payload: string | null }
  | { type: 'SET_DUPLICATE_SUCCESS_IMAGE_ID'; payload: string | null }
  | { type: 'SET_PENDING_FRAME_POSITIONS'; payload: Map<string, number> }
  | { type: 'SET_LOCAL_ORDERED_SHOT_IMAGES'; payload: GenerationRow[] }
  | { type: 'SET_CREATING_TASK_ID'; payload: string | null }
  | { type: 'SET_SETTINGS_MODAL_OPEN'; payload: boolean }
  | { type: 'SET_MODE_READY'; payload: boolean }
  | { type: 'SET_SETTINGS_ERROR'; payload: string | null }
  | { type: 'SET_EDITING_NAME'; payload: boolean }
  | { type: 'SET_EDITING_NAME_VALUE'; payload: string }
  | { type: 'SET_TRANSITIONING_FROM_NAME_EDIT'; payload: boolean }
  | { type: 'SET_SHOW_STEPS_NOTIFICATION'; payload: boolean }
  | { type: 'SET_HAS_INITIALIZED_SHOT'; payload: string | null }
  | { type: 'SET_HAS_INITIALIZED_UI_SETTINGS'; payload: string | null };

// Settings that can be applied from tasks
export interface TaskSettings {
  prompt?: string;
  prompts?: string[];
  negativePrompt?: string;
  negativePrompts?: string[];
  steps?: number;
  frame?: number;
  frames?: number[];
  context?: number;
  contexts?: number[];
  width?: number;
  height?: number;
  replaceImages?: boolean;
  inputImages?: string[];
  textBeforePrompts?: string;
  textAfterPrompts?: string;
} 