import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from './components/ShotEditor/state/types';
// import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay'; // Removed - LoRAs now managed in ShotEditor

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
  autoCreateIndividualPrompts: boolean;
  generationMode: 'batch' | 'by-pair' | 'timeline';
  selectedModel?: 'wan-2.1' | 'wan-2.2';
  turboMode: boolean;
  amountOfMotion: number; // 0-100 range for UI
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
    videoControlMode: 'batch' as const,
    batchVideoPrompt: '',
    batchVideoFrames: 60,
    batchVideoContext: 10,
    batchVideoSteps: 6,
    dimensionSource: 'firstImage' as const,
    generationMode: 'batch' as const,
    enhancePrompt: false,
    autoCreateIndividualPrompts: true,
    selectedModel: 'wan-2.1' as const,
    turboMode: false,
    amountOfMotion: 50,
    selectedMode: 'Zippy Supreme' as const,
    steerableMotionSettings: DEFAULT_STEERABLE_MOTION_SETTINGS,
  },
}; 