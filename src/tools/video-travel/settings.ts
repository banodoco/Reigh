import { SteerableMotionSettings } from './components/ShotEditor';

export interface VideoTravelSettings {
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
  generationMode: 'batch' | 'by-pair';
  pairConfigs?: Array<{
    id: string;
    prompt: string;
    frames: number;
    negativePrompt: string;
    context: number;
  }>;
  // Store the shot images as part of settings
  shotImageIds?: string[];
}

// Define which settings belong to which scope
export const PROJECT_LEVEL_SETTINGS = [
  'dimensionSource',
  'customWidth', 
  'customHeight',
  'batchVideoSteps',
  'enhancePrompt'
] as const;

export const SHOT_LEVEL_SETTINGS = [
  'videoControlMode',
  'batchVideoPrompt',
  'batchVideoFrames',
  'batchVideoContext',
  'generationMode',
  'pairConfigs',
  'shotImageIds',
  'steerableMotionSettings'
] as const;

export const videoTravelSettings = {
  id: 'video-travel',
  scope: ['project', 'shot'], // Video travel uses both project and shot settings
  defaults: {
    // Project-level defaults
    dimensionSource: 'project' as const, // Default to project dimensions for consistency
    customWidth: undefined,
    customHeight: undefined,
    batchVideoSteps: 4, // Lower default for faster generation
    enhancePrompt: false,
    
    // Shot-level defaults
    videoControlMode: 'batch' as const,
    batchVideoPrompt: '',
    batchVideoFrames: 30, // Standard video frame count
    batchVideoContext: 10, // Reasonable overlap for smooth transitions
    generationMode: 'batch' as const,
    steerableMotionSettings: {
      negative_prompt: 'blurry, distorted, low quality, artifacts',
      model_name: 'vace_14B',
      seed: Math.floor(Math.random() * 10000), // Random seed by default
      debug: false, // Debug off by default for cleaner output
      apply_reward_lora: true, // Better quality with reward LoRA
      colour_match_videos: true,
      apply_causvid: true,
      use_lighti2x_lora: false,
      fade_in_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
      fade_out_duration: '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
      after_first_post_generation_saturation: 1,
      after_first_post_generation_brightness: 0,
      show_input_images: false,
    },
  },
};

// Helper to determine which scope a setting belongs to
export function getSettingScope(settingKey: keyof VideoTravelSettings): 'project' | 'shot' {
  if (PROJECT_LEVEL_SETTINGS.includes(settingKey as any)) {
    return 'project';
  }
  return 'shot';
} 