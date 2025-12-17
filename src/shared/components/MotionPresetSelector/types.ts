import { PhaseConfig } from '@/tools/travel-between-images/settings';
import type { LoraModel } from '@/shared/hooks/useLoraManager';

// =============================================================================
// TYPES
// =============================================================================

export type MotionMode = 'basic' | 'advanced';
export type GenerationTypeMode = 'i2v' | 'vace';

/**
 * Sample generation attached to a preset
 */
export interface PresetSampleGeneration {
  url: string;
  type: 'video' | 'image';
  alt_text?: string;
}

/**
 * Common metadata structure shared by both built-in and database presets
 */
export interface PresetMetadata {
  name: string;
  description?: string;
  phaseConfig: PhaseConfig;
  generationTypeMode?: GenerationTypeMode;
  sample_generations?: PresetSampleGeneration[];
  is_public?: boolean;
  use_count?: number;
  tags?: string[];
}

/**
 * Built-in preset definition (not from database)
 */
export interface BuiltinPreset {
  id: string;
  metadata: PresetMetadata & {
    description: string; // Required for built-in
    generationTypeMode: GenerationTypeMode; // Required for built-in
  };
}

/**
 * Preset from database with metadata
 */
export interface DatabasePreset {
  id: string;
  metadata: PresetMetadata;
  createdAt?: string;
  _isMyPreset?: boolean;
}

export type Preset = BuiltinPreset | DatabasePreset;

/**
 * Props for the preset selector component
 */
export interface MotionPresetSelectorProps {
  // === Core Configuration ===
  /** The built-in default preset for this tool */
  builtinPreset: BuiltinPreset;
  /** Featured preset IDs from database to show as chips */
  featuredPresetIds?: string[];
  /** Generation type mode (determines filter in Browse modal) */
  generationTypeMode: GenerationTypeMode;
  
  // === State ===
  /** Currently selected preset ID (null = custom/no preset) */
  selectedPhasePresetId: string | null;
  /** Current phase config */
  phaseConfig?: PhaseConfig;
  /** Current motion mode (basic/advanced) */
  motionMode: MotionMode;
  
  // === Callbacks ===
  /** Called when a preset is selected */
  onPresetSelect: (presetId: string, config: PhaseConfig, metadata?: any) => void;
  /** Called when preset is removed (going to custom mode) */
  onPresetRemove: () => void;
  /** Called when motion mode changes */
  onModeChange: (mode: MotionMode) => void;
  /** Called when phase config changes (in advanced mode) */
  onPhaseConfigChange: (config: PhaseConfig) => void;
  /** Called to restore defaults (in advanced mode) */
  onRestoreDefaults?: () => void;
  
  // === Advanced Mode Props ===
  /** Available LoRAs for PhaseConfigVertical */
  availableLoras?: LoraModel[];
  /** Random seed state for PhaseConfigVertical */
  randomSeed?: boolean;
  /** Random seed change handler for PhaseConfigVertical */
  onRandomSeedChange?: (value: boolean) => void;
  
  // === Optional Behavior ===
  /** Whether Advanced tab is disabled (e.g., turbo mode) */
  advancedDisabled?: boolean;
  /** Tooltip text for Advanced tab when disabled */
  advancedDisabledReason?: string;
  /** Custom tooltip text for the preset label */
  presetTooltip?: string;
  /** Whether to show LoRA section in basic mode (render function) */
  renderBasicModeContent?: () => React.ReactNode;
  /** Query key prefix for preset fetching (for cache isolation) */
  queryKeyPrefix?: string;
}

/**
 * Props for SelectedPresetCard component
 */
export interface SelectedPresetCardProps {
  presetId: string;
  onSwitchToAdvanced: () => void;
  onChangePreset: () => void;
  /** Called when user clicks X to remove/deselect the preset */
  onRemove?: () => void;
  /** Query key prefix for preset fetching */
  queryKeyPrefix?: string;
}

/**
 * Return type for useMotionPresets hook
 */
export interface UseMotionPresetsReturn {
  /** All presets (built-in + featured from database) */
  allPresets: Preset[];
  /** All known preset IDs (built-in + featured) */
  allKnownPresetIds: string[];
  /** Whether to show preset chips (true if no selection or selection is known) */
  shouldShowPresetChips: boolean;
  /** Whether in custom mode (no preset selected) */
  isCustomConfig: boolean;
  /** Whether using the built-in default */
  isUsingBuiltinDefault: boolean;
  /** Loading state for featured presets */
  isLoading: boolean;
}
