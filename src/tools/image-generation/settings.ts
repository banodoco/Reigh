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
  trigger_word?: string;
}

// Prompt Editor Settings Interface
export interface PromptEditorSettings {
  overallPromptText?: string;
  rulesToRememberText?: string;
  numberToGenerate?: number;
  includeExistingContext?: boolean;
  addSummary?: boolean;
  editInstructions?: string;
  modelType?: 'standard' | 'smart';
  activeTab?: 'generate' | 'bulk-edit';
  isAIPromptSectionExpanded?: boolean;
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
  // Prompt Editor Settings
  promptEditor?: PromptEditorSettings;
}

export const defaultPromptEditorSettings: PromptEditorSettings = {
  overallPromptText: '',
  rulesToRememberText: '',
  numberToGenerate: 24,
  includeExistingContext: true,
  addSummary: true,
  editInstructions: '',
  modelType: 'smart',
  activeTab: 'generate',
  isAIPromptSectionExpanded: false,
};

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
  promptEditor: defaultPromptEditorSettings,
};

export const imageGenerationSettings = {
  id: 'image-generation',
  scope: ['project'] as const,
  defaults: defaultImageGenerationSettings,
}; 