// Edit Video Tool Settings
// For regenerating portions of videos using AI

import { PhaseConfig } from '@/tools/travel-between-images/settings';
import { BUILTIN_VACE_DEFAULT_ID, DEFAULT_VACE_PHASE_CONFIG } from '@/shared/lib/vaceDefaults';

export const editVideoSettings = {
  id: 'edit-video',
  scope: ['project'] as const,
  defaults: {
    // Generation settings (same as join-clips)
    contextFrameCount: 8,
    gapFrameCount: 12,
    replaceMode: true, // Replace frames (true) or insert new frames (false)
    keepBridgingImages: false,
    model: 'wan_2_2_vace_lightning_baseline_2_2_2' as const,
    numInferenceSteps: 6,
    guidanceScale: 3.0,
    seed: -1,
    negativePrompt: '',
    priority: 0,
    prompt: '',
    randomSeed: true,
    enhancePrompt: true,
    
    // Motion settings (Basic/Advanced mode with presets)
    motionMode: 'basic' as 'basic' | 'advanced',
    phaseConfig: undefined as PhaseConfig | undefined, // undefined = use default
    selectedPhasePresetId: BUILTIN_VACE_DEFAULT_ID as string | null,
    
    // Selected video info
    selectedVideoUrl: undefined as string | undefined,
    selectedVideoPosterUrl: undefined as string | undefined,
    selectedVideoGenerationId: undefined as string | undefined,
    
    // Portion selection (in seconds)
    portionStartTime: 0,
    portionEndTime: 0,
    
    // LoRAs (for basic mode - additional loras on top of preset)
    loras: [] as Array<{ id: string; strength: number }>,
    hasEverSetLoras: false as boolean,
  },
};

// TypeScript type for settings
export type EditVideoSettings = typeof editVideoSettings.defaults;

// Re-export shared defaults for convenience
export { BUILTIN_VACE_DEFAULT_ID, DEFAULT_VACE_PHASE_CONFIG } from '@/shared/lib/vaceDefaults';

