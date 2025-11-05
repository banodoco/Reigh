// Join Clips Tool Settings
export const joinClipsSettings = {
  id: 'join-clips',
  scope: ['project', 'shot'] as const,
  defaults: {
    contextFrameCount: 10,
    gapFrameCount: 33,
    replaceMode: true, // Replace frames (true) or generate new frames (false)
    model: 'lightning_baseline_2_2_2' as const,
    numInferenceSteps: 6,
    guidanceScale: 3.0,
    seed: -1,
    negativePrompt: '',
    priority: 0,
    prompt: '', // User's current prompt (persisted per project)
    randomSeed: true,
    startingVideoUrl: undefined as string | undefined,
    startingVideoPosterUrl: undefined as string | undefined,
    endingVideoUrl: undefined as string | undefined,
    endingVideoPosterUrl: undefined as string | undefined,
    loras: [] as Array<{ id: string; strength: number }>, // Saved LoRA configurations
    hasEverSetLoras: false as boolean, // Track if user has ever set LoRAs
  },
};

// TypeScript type for settings
export type JoinClipsSettings = typeof joinClipsSettings.defaults;

