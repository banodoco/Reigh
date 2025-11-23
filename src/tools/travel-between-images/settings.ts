import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from './components/ShotEditor/state/types';
// import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay'; // Removed - LoRAs now managed in ShotEditor

// PhaseConfig types for advanced video generation settings
export interface PhaseLoraConfig {
  url: string;
  multiplier: string; // Can be a single value "1.0" or comma-separated ramp "0.1,0.3,0.5"
}

export interface PhaseSettings {
  phase: number;
  guidance_scale: number;
  loras: PhaseLoraConfig[];
}

export interface PhaseConfig {
  num_phases: number; // 2 or 3 phases - determines which model is used (2=wan_2_2_i2v_lightning_baseline_3_3, 3=wan_2_2_i2v_lightning_baseline_2_2_2)
  steps_per_phase: number[];
  flow_shift: number;
  sample_solver: string;
  model_switch_phase: number;
  phases: PhaseSettings[];
}

export const DEFAULT_PHASE_CONFIG: PhaseConfig = {
  num_phases: 3,
  steps_per_phase: [2, 2, 2],
  flow_shift: 5.0,
  sample_solver: "euler",
  model_switch_phase: 2,
  phases: [
    {
      phase: 1,
      guidance_scale: 3.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
          multiplier: "0.75"
        }
      ]
    },
    {
      phase: 2,
      guidance_scale: 1.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
          multiplier: "1.0"
        }
      ]
    },
    {
      phase: 3,
      guidance_scale: 1.0,
      loras: [
        {
          url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors",
          multiplier: "1.0"
        }
      ]
    }
  ]
};

export interface VideoTravelSettings {
  videoControlMode: 'individual' | 'batch';
  batchVideoPrompt: string;
  batchVideoFrames: number;
  batchVideoSteps: number;
  dimensionSource?: 'project' | 'firstImage' | 'custom'; // DEPRECATED - now using aspect ratios only
  customWidth?: number; // DEPRECATED - now using aspect ratios only
  customHeight?: number; // DEPRECATED - now using aspect ratios only
  steerableMotionSettings: SteerableMotionSettings;
  enhancePrompt: boolean;
  autoCreateIndividualPrompts: boolean;
  generationMode: 'batch' | 'by-pair' | 'timeline';
  selectedModel?: 'wan-2.1' | 'wan-2.2';
  turboMode: boolean;
  amountOfMotion: number; // 0-100 range for UI
  motionMode?: 'basic' | 'presets' | 'advanced'; // Motion control mode
  advancedMode: boolean; // Toggle for showing phase_config settings
  regenerateAnchors: boolean; // Whether to regenerate anchor images (Advanced Mode only)
  phaseConfig?: PhaseConfig; // Advanced phase configuration
  selectedPhasePresetId?: string | null; // ID of the selected phase config preset (null if manually configured)
  textBeforePrompts?: string; // Text to prepend to all prompts
  textAfterPrompts?: string; // Text to append to all prompts
  // selectedMode removed - now hardcoded to use specific model
  pairConfigs?: Array<{
    id: string;
    prompt: string;
    frames: number;
    negativePrompt: string;
    context: number;
  }>;
  // Store the shot images as part of settings
  shotImageIds?: string[];
  // selectedLoras removed - now managed directly in ShotEditor with separate persistence
  // Structure video settings (per-shot basis)
  structureVideo?: {
    path: string;
    metadata: {
      duration_seconds: number;
      frame_rate: number;
      total_frames: number;
      width: number;
      height: number;
      file_size: number;
    };
    treatment: 'adjust' | 'clip';
    motionStrength: number;
  };
}

export const videoTravelSettings = {
  id: 'travel-between-images',
  scope: ['shot'], // Video travel settings are per-shot
  defaults: {
    // Content fields (don't inherit to new projects) - explicit empty defaults
    batchVideoPrompt: '',
    pairConfigs: [],
    shotImageIds: [],
    phaseConfig: undefined,
    structureVideo: undefined,
    textBeforePrompts: '',
    textAfterPrompts: '',
    
    // Configuration fields (can inherit to new projects)
    videoControlMode: 'batch' as const,
    batchVideoFrames: 60,
    batchVideoSteps: 6,
    dimensionSource: 'firstImage' as const,
    generationMode: 'batch' as const,
    enhancePrompt: false,
    autoCreateIndividualPrompts: true,
    selectedModel: 'wan-2.1' as const,
    turboMode: false,
    amountOfMotion: 50,
    motionMode: 'basic' as const,
    advancedMode: false,
    regenerateAnchors: false,
    selectedMode: 'Zippy Supreme' as const,
    steerableMotionSettings: DEFAULT_STEERABLE_MOTION_SETTINGS,
    customWidth: undefined,
    customHeight: undefined,
  },
}; 