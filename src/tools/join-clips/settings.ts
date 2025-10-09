// Join Clips Tool Settings
export const joinClipsSettings = {
  id: 'join-clips',
  scope: ['project', 'shot'] as const,
  defaults: {
    contextFrameCount: 10,
    gapFrameCount: 33,
    model: 'lightning_baseline_2_2_2' as const,
    numInferenceSteps: 6,
    guidanceScale: 3.0,
    seed: -1,
    negativePrompt: '',
    priority: 0,
    defaultPrompt: 'smooth camera glide between scenes',
    randomSeed: true,
    startingVideoUrl: undefined as string | undefined,
    endingVideoUrl: undefined as string | undefined,
  },
};

// TypeScript type for settings
export type JoinClipsSettings = typeof joinClipsSettings.defaults;

