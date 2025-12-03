// Edit Video Tool Settings
// For regenerating portions of videos using AI
export const editVideoSettings = {
  id: 'edit-video',
  scope: ['project'] as const,
  defaults: {
    // Generation settings (same as join-clips)
    contextFrameCount: 8,
    gapFrameCount: 12,
    replaceMode: true, // Replace frames (true) or insert new frames (false)
    keepBridgingImages: true,
    model: 'wan_2_2_vace_lightning_baseline_2_2_2' as const,
    numInferenceSteps: 6,
    guidanceScale: 3.0,
    seed: -1,
    negativePrompt: '',
    priority: 0,
    prompt: '',
    randomSeed: true,
    enhancePrompt: true,
    
    // Selected video info
    selectedVideoUrl: undefined as string | undefined,
    selectedVideoPosterUrl: undefined as string | undefined,
    selectedVideoGenerationId: undefined as string | undefined,
    
    // Portion selection (in seconds)
    portionStartTime: 0,
    portionEndTime: 0,
    
    // LoRAs
    loras: [] as Array<{ id: string; strength: number }>,
    hasEverSetLoras: false as boolean,
  },
};

// TypeScript type for settings
export type EditVideoSettings = typeof editVideoSettings.defaults;

