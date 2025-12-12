// Join Clips Tool Settings
export const joinClipsSettings = {
  id: 'join-clips',
  scope: ['project', 'shot'] as const,
  defaults: {
    contextFrameCount: 15,
    gapFrameCount: 23,
    replaceMode: true, // Replace frames (true) or generate new frames (false)
    keepBridgingImages: false,
    model: 'wan_2_2_vace_lightning_baseline_2_2_2' as const,
    numInferenceSteps: 6,
    guidanceScale: 3.0,
    seed: -1,
    negativePrompt: '',
    priority: 0,
    prompt: '', // User's current prompt (persisted per project)
    randomSeed: true,
    useIndividualPrompts: false, // Whether to use per-transition prompts
    enhancePrompt: true, // AI enhancement of prompts
    useInputVideoResolution: false, // Use first input video's resolution instead of project resolution
    useInputVideoFps: false, // Use first input video's FPS instead of downsampling to 16fps
    noisedInputVideo: 0, // vid2vid init strength - adds noise to input video (0 = disabled)
    // Legacy two-video format (kept for backward compatibility)
    startingVideoUrl: undefined as string | undefined,
    startingVideoPosterUrl: undefined as string | undefined,
    endingVideoUrl: undefined as string | undefined,
    endingVideoPosterUrl: undefined as string | undefined,
    // New multi-clip format (with optional duration for validation)
    clips: [] as Array<{ 
      url: string; 
      posterUrl?: string; 
      finalFrameUrl?: string;
      durationSeconds?: number;  // Video duration for frame validation
    }>,
    transitionPrompts: [] as Array<{ clipIndex: number; prompt: string }>, // Prompts for each transition
    loras: [] as Array<{ id: string; strength: number }>, // Saved LoRA configurations
    hasEverSetLoras: false as boolean, // Track if user has ever set LoRAs
  },
};

// TypeScript type for settings
export type JoinClipsSettings = typeof joinClipsSettings.defaults;

