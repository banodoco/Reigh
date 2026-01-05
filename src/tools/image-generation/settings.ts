export type GenerationMode = 'wan-local' | 'qwen-image';

export interface PromptEntry {
  id: string;
  fullPrompt: string;
  shortPrompt?: string;
}

export interface ActiveLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
}

export type PromptMode = 'managed' | 'automated';

export interface HiresFixConfig {
  enabled: boolean;
  base_steps: number;
  hires_scale: number;
  hires_steps: number;
  hires_denoise: number;
  lightning_lora_strength_phase_1: number;
  lightning_lora_strength_phase_2: number;
  phaseLoraStrengths: Array<{
    loraId: string;
    loraPath: string;
    loraName: string;
    pass1Strength: number;
    pass2Strength: number;
  }>;
}

export interface ImageGenerationSettings {
  prompts?: PromptEntry[];
  promptsByShot?: Record<string, PromptEntry[]>; // Prompts organized by shot ID
  imagesPerPrompt?: number;
  selectedLorasByMode?: Record<GenerationMode, ActiveLora[]>;
  selectedLoras?: ActiveLora[]; // Currently selected LoRAs
  depthStrength?: number;
  softEdgeStrength?: number;
  generationMode?: GenerationMode;
  beforeEachPromptText?: string; // Text to prepend (defaults empty, not inherited)
  afterEachPromptText?: string; // Text to append (defaults empty, not inherited)
  associatedShotId?: string | null; // Last associated shot
  promptMode?: PromptMode;
  masterPromptByShot?: Record<string, string>; // Master prompt per shot ID
  masterPromptText?: string; // Legacy - kept for migration
  hiresFixConfig?: HiresFixConfig; // Two-pass hires fix settings
}

export const defaultImageGenerationSettings: ImageGenerationSettings = {
  prompts: [
    {
      id: 'prompt-1',
      fullPrompt: 'A majestic cat astronaut exploring a vibrant nebula, artstation',
      shortPrompt: 'Cat Astronaut',
    },
  ],
  // Content fields (don't inherit to new projects) - explicit empty defaults
  promptsByShot: {},
  // Note: beforeEachPromptText/afterEachPromptText are NOT persisted
  associatedShotId: null,

  // Configuration fields (can inherit to new projects)
  imagesPerPrompt: 1,
  selectedLorasByMode: {
    'wan-local': [],
    'qwen-image': [],
  },
  selectedLoras: [],
  depthStrength: 50,
  softEdgeStrength: 20,
  generationMode: 'wan-local',
  promptMode: 'automated',
  masterPromptByShot: {},
  masterPromptText: '', // Legacy - kept for migration
  hiresFixConfig: {
    enabled: true,
    base_steps: 8,
    hires_scale: 1.1,
    hires_steps: 8,
    hires_denoise: 0.55,
    lightning_lora_strength_phase_1: 0.9,
    lightning_lora_strength_phase_2: 0.5,
    phaseLoraStrengths: [],
  },
};

export const imageGenerationSettings = {
  id: 'image-generation',
  scope: ['project'] as const,
  defaults: defaultImageGenerationSettings,
}; 