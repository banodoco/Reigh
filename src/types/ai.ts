export interface AIPromptItem {
  id: string;
  text: string;        // The main prompt text
  shortText?: string;   // Optional short summary
  hidden: boolean;      // Added from user specification
}

export interface GeneratePromptsParams {
  overallPromptText: string;
  rulesToRememberText: string;
  numberToGenerate: number;
  existingPrompts?: AIPromptItem[];         // Renamed and kept optional
  includeExistingContext?: boolean;         // Added from user specification
  addSummaryForNewPrompts?: boolean;        // Renamed from addSummary
  replaceCurrentPrompts?: boolean;          // Whether to replace existing prompts instead of adding
  temperature?: number;                     // AI creativity level (0.6-1.4)
}

export type AIModelType = 'standard' | 'smart';

export interface EditPromptParams {
  originalPromptText: string;
  editInstructions: string;
  modelType?: AIModelType;                // Renamed from modelPreference and uses new type
}

// Result type for editing a prompt
export interface EditPromptResult {
  success: boolean;
  newText?: string;
  newShortText?: string; // If summaries are also potentially updated/generated
}

// Result type for generating prompts
export type GeneratePromptsResult = AIPromptItem[]; 