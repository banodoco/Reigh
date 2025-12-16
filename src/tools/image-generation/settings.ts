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
};

export const imageGenerationSettings = {
  id: 'image-generation',
  scope: ['project'] as const,
  defaults: defaultImageGenerationSettings,
}; 