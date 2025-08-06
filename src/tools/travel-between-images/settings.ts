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
  generationMode: 'batch' | 'by-pair' | 'timeline';
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
}

export const videoTravelSettings = {
  id: 'travel-between-images',
  scope: ['shot'], // Video travel settings are per-shot
  defaults: {
    videoControlMode: 'batch' as const,
    batchVideoPrompt: '',
    batchVideoFrames: 60,
    batchVideoContext: 10,
    batchVideoSteps: 20,
    dimensionSource: 'firstImage' as const,
    generationMode: 'batch' as const,
    enhancePrompt: false,
    steerableMotionSettings: DEFAULT_STEERABLE_MOTION_SETTINGS,
  },
}; 