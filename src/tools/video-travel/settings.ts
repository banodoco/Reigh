import { SteerableMotionSettings } from './components/ShotEditor';
import { ActiveLora } from './pages/VideoTravelToolPage';

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
  // Store selected LoRAs
  selectedLoras?: ActiveLora[];
}

export const videoTravelSettings = {
  id: 'video-travel',
  scope: ['shot'], // Video travel settings are per-shot
  defaults: {
    videoControlMode: 'batch' as const,
    batchVideoPrompt: '',
    batchVideoFrames: 24,
    batchVideoContext: 16,
    batchVideoSteps: 20,
    dimensionSource: 'firstImage' as const,
    generationMode: 'batch' as const,
    enhancePrompt: false,
    steerableMotionSettings: {
      negative_prompt: '',
      model_name: 'vace_14B',
      seed: 789,
      debug: true,
      apply_reward_lora: false,
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