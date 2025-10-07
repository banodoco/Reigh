import { GenerationRow } from "@/types/shots";
import { LoraModel } from '@/shared/components/LoraSelectorModal';

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
  apply_reward_lora: boolean;
  colour_match_videos: boolean;
  apply_causvid: boolean;
  use_lighti2x_lora: boolean;
  use_styleboost_loras: boolean;
  fade_in_duration: string;
  fade_out_duration: string;
  after_first_post_generation_saturation: number;
  after_first_post_generation_brightness: number;
  show_input_images: boolean;
}

// Default values for steerable motion settings - single source of truth
export const DEFAULT_STEERABLE_MOTION_SETTINGS: SteerableMotionSettings = {
  negative_prompt: '',
  model_name: 'lightning_baseline_2_2_2',
  seed: 789,
  debug: false,
  apply_reward_lora: false,
  colour_match_videos: false,
  apply_causvid: false,
  use_lighti2x_lora: false,
  use_styleboost_loras: false,
  fade_in_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
  fade_out_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
  after_first_post_generation_saturation: 1,
  after_first_post_generation_brightness: 0,
  show_input_images: false,
};

// Shot settings interface
export interface ShotSettings {
  videoControlMode: 'individual' | 'batch';
  batchVideoPrompt: string;
  batchVideoFrames: number;
  batchVideoContext: number;
  batchVideoSteps: number;
  dimensionSource: 'project' | 'firstImage' | 'custom';
  customWidth?: number;
  customHeight?: number;
  steerableMotionSettings: SteerableMotionSettings;
  enhancePrompt: boolean;
  autoCreateIndividualPrompts: boolean;
  generationMode?: 'batch' | 'timeline';
}

// Main props interface for ShotEditor
export interface ShotEditorProps {
  selectedShotId: string;
  projectId: string;
  videoPairConfigs: VideoPairConfig[];
  videoControlMode: 'individual' | 'batch';
  batchVideoPrompt: string;
  batchVideoFrames: number;
  batchVideoContext: number;
  onShotImagesUpdate: () => void;
  onBack: () => void;
  onVideoControlModeChange: (mode: 'individual' | 'batch') => void;
  onPairConfigChange: (pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => void;
  onBatchVideoPromptChange: (prompt: string) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoContextChange: (context: number) => void;
  batchVideoSteps: number;
  onBatchVideoStepsChange: (steps: number) => void;
  dimensionSource: 'project' | 'firstImage' | 'custom';
  onDimensionSourceChange: (source: 'project' | 'firstImage' | 'custom') => void;
  customWidth?: number;
  onCustomWidthChange: (width?: number) => void;
  customHeight?: number;
  onCustomHeightChange: (height?: number) => void;
  steerableMotionSettings: SteerableMotionSettings;
  onSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  onGenerateAllSegments: () => void;
  availableLoras: LoraModel[];

  generationMode: 'batch' | 'timeline';
  onGenerationModeChange: (mode: 'batch' | 'timeline') => void;
  enhancePrompt: boolean;
  onEnhancePromptChange: (enhance: boolean) => void;
  turboMode: boolean;
  onTurboModeChange: (turbo: boolean) => void;
  amountOfMotion: number;
  onAmountOfMotionChange: (motion: number) => void;
  // Auto-create individual prompts
  autoCreateIndividualPrompts: boolean;
  onAutoCreateIndividualPromptsChange: (autoCreate: boolean) => void;
  // Advanced mode
  advancedMode: boolean;
  onAdvancedModeChange: (advanced: boolean) => void;
  phaseConfig?: any; // PhaseConfig type from settings
  onPhaseConfigChange: (config: any) => void;
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
}

// Internal state interface for the shot editor
export interface ShotEditorState {
  // Upload and UI state
  isUploadingImage: boolean;
  fileInputKey: number;
  deletingVideoId: string | null;
  duplicatingImageId: string | null;
  duplicateSuccessImageId: string | null;
  pendingFramePositions: Map<string, number>;
  
  // Optimistic updates
  localOrderedShotImages: GenerationRow[];
  
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
} 