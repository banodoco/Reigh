import { PhaseConfig } from '@/tools/travel-between-images/settings';

// Builtin preset ID (must match the one in JoinClipsSettingsForm.tsx)
const BUILTIN_JOIN_CLIPS_DEFAULT_ID = '__builtin_join_clips_default__';

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
    loopFirstClip: false, // Loop first clip - use first clip as both start and end
    // Motion settings mode (Basic = LoRAs, Advanced = Phase Config)
    motionMode: 'basic' as 'basic' | 'advanced',
    // Phase config for advanced mode (undefined = use default)
    phaseConfig: undefined as PhaseConfig | undefined,
    // Selected phase preset ID (for tracking which preset is active)
    selectedPhasePresetId: BUILTIN_JOIN_CLIPS_DEFAULT_ID as string | null,
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

