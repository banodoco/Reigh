export type GenerationMode = 'wan-local' | 'flux-api' | 'hidream-api';

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

export interface ImageGenerationSettings {
  prompts?: PromptEntry[];
  imagesPerPrompt?: number;
  selectedLorasByMode?: Record<GenerationMode, ActiveLora[]>;
  depthStrength?: number;
  softEdgeStrength?: number;
  generationMode?: GenerationMode;
  beforeEachPromptText?: string;
  afterEachPromptText?: string;
}

export const defaultImageGenerationSettings: ImageGenerationSettings = {
  prompts: [
    {
      id: 'prompt-1',
      fullPrompt: 'A majestic cat astronaut exploring a vibrant nebula, artstation',
      shortPrompt: 'Cat Astronaut',
    },
  ],
  imagesPerPrompt: 1,
  selectedLorasByMode: {
    'wan-local': [],
    'flux-api': [],
    'hidream-api': [],
  },
  depthStrength: 50,
  softEdgeStrength: 20,
  generationMode: 'wan-local',
  beforeEachPromptText: '',
  afterEachPromptText: '',
};

export const imageGenerationSettings = {
  id: 'image-generation',
  scope: ['project'] as const,
  defaults: defaultImageGenerationSettings,
}; 