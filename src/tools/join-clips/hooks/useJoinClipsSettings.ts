import { useToolPageSettings } from '@/shared/hooks/useToolPageSettings';
import { JoinClipsSettings } from '../settings';

const DEFAULT_JOIN_CLIPS_SETTINGS: JoinClipsSettings = {
  contextFrameCount: 8,
  gapFrameCount: 12,
  replaceMode: true,
  keepBridgingImages: true,
  model: 'wan_2_2_vace_lightning_baseline_2_2_2',
  numInferenceSteps: 6,
  guidanceScale: 3.0,
  seed: -1,
  negativePrompt: '',
  priority: 0,
  prompt: '',
  randomSeed: true,
  // Legacy two-video format
  startingVideoUrl: undefined,
  startingVideoPosterUrl: undefined,
  endingVideoUrl: undefined,
  endingVideoPosterUrl: undefined,
  // New multi-clip format
  clips: [],
  transitionPrompts: [],
  loras: [],
  hasEverSetLoras: false,
};

/**
 * Hook for managing Join Clips tool settings at the project level
 * Uses the generic useToolPageSettings with Join Clips specific defaults
 */
export function useJoinClipsSettings(projectId: string | null | undefined) {
  return useToolPageSettings<JoinClipsSettings>(
    'join-clips',
    'project',
    projectId,
    DEFAULT_JOIN_CLIPS_SETTINGS,
    {
      debug: false, // Set to true for debugging
      debugTag: '[JoinClips]'
    }
  );
}

