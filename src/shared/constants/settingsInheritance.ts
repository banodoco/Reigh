/**
 * Settings Inheritance Policy
 * 
 * This file documents which settings are inherited when creating a new project
 * from an existing one. Settings are categorized as either "content" or "configuration".
 * 
 * INHERITANCE RULES:
 * - Content fields: Project-specific data that SHOULD NOT inherit (prompts, references, etc.)
 * - Configuration fields: Reusable settings that CAN inherit (dimensions, UI preferences, etc.)
 * 
 * HOW IT WORKS:
 * When a new project is created in ProjectContext.tsx, settings from the current project
 * are copied EXCEPT for fields explicitly filtered out. The filtering logic removes:
 * 1. Fields listed in NEVER_INHERIT_FIELDS
 * 2. Fields whose names contain "prompt" or "reference" (case-insensitive)
 * 3. Tool-specific content fields marked in TOOL_CONTENT_FIELDS
 * 
 * MAINTENANCE:
 * - When adding a new tool, document its content vs configuration fields here
 * - When adding content fields to existing tools, add them to TOOL_CONTENT_FIELDS
 * - Keep this file in sync with actual filtering logic in ProjectContext.tsx
 */

/**
 * Fields that should NEVER inherit to new projects regardless of tool
 */
export const NEVER_INHERIT_FIELDS = [
  // Prompt-related (content)
  'promptsByShot',
  'batchVideoPrompt',
  'prompts',
  'beforeEachPromptText',
  'afterEachPromptText',
  'textBeforePrompts',
  'textAfterPrompts',
  'pairConfigs',
  
  // Reference-related (content)
  'references',
  'selectedReferenceId',
  'selectedReferenceIdByShot',
  'styleReferenceImage',
  'styleReferenceImageOriginal',
  'styleReferenceStrength',
  'subjectStrength',
  'subjectDescription',
  'inThisScene',
  
  // AI generation metadata (ephemeral)
  'generationSettings',
  'bulkEditSettings',
  'activeTab',
  
  // Shot-specific content
  'shotImageIds',
  'associatedShotId',
  'structureVideo',
  'phaseConfig',
] as const;

/**
 * Tool-specific field categorization
 * Documents which fields are "content" (don't inherit) vs "configuration" (can inherit)
 */
export const TOOL_FIELD_CATEGORIES = {
  'image-generation': {
    content: [
      'promptsByShot',      // Prompts organized by shot
      'prompts',            // Legacy prompts array
      'beforeEachPromptText', // Prompt wrapping text
      'afterEachPromptText',  // Prompt wrapping text
      'associatedShotId',   // UI state for shot selection
    ],
    configuration: [
      'imagesPerPrompt',    // Number of images to generate
      'selectedLoras',      // Active LoRAs
      'selectedLorasByMode', // LoRAs per generation mode
      'depthStrength',      // Depth control strength
      'softEdgeStrength',   // Soft edge strength
      'generationMode',     // wan-local vs qwen-image
    ],
  },
  
  'travel-between-images': {
    content: [
      'batchVideoPrompt',   // Main batch prompt
      'pairConfigs',        // Individual pair configs (contain prompts)
      'shotImageIds',       // Images in this shot
      'phaseConfig',        // Advanced phase configuration
      'structureVideo',     // Structure video path and metadata
      'textBeforePrompts',  // Text to prepend to prompts
      'textAfterPrompts',   // Text to append to prompts
    ],
    configuration: [
      'videoControlMode',   // Individual vs batch
      'batchVideoFrames',   // Number of frames
      'batchVideoSteps',    // Generation steps
      'dimensionSource',    // project/firstImage/custom
      'customWidth',        // Custom dimensions
      'customHeight',
      'steerableMotionSettings', // Motion control settings
      'enhancePrompt',      // Auto-enhance toggle
      'autoCreateIndividualPrompts',
      'generationMode',     // batch/by-pair/timeline
      'selectedModel',      // Wan 2.1 vs 2.2
      'turboMode',          // Turbo mode toggle
      'amountOfMotion',     // Motion intensity
      'advancedMode',       // Show advanced settings
    ],
  },
  
  'edit-travel': {
    content: [
      'prompts',            // Edit prompts
    ],
    configuration: [
      'imagesPerPrompt',    // Number per prompt
      'generationMode',     // kontext vs flux
      'fluxSoftEdgeStrength', // Soft edge strength
      'fluxDepthStrength',  // Depth strength
      'reconstructVideo',   // Reconstruction toggle
    ],
  },
  
  'character-animate': {
    content: [
      'defaultPrompt',      // Default prompt text
      'inputImageUrl',      // Last used image
      'inputVideoUrl',      // Last used video
    ],
    configuration: [
      'mode',               // replace vs animate
      'resolution',         // 480p vs 720p
      'autoMatchAspectRatio', // Auto aspect ratio
      'randomSeed',         // Random seed toggle
      'seed',               // Specific seed value
    ],
  },
  
  'join-clips': {
    content: [
      'defaultPrompt',      // Default transition prompt
      'startingVideoUrl',   // Last used starting video
      'endingVideoUrl',     // Last used ending video
    ],
    configuration: [
      'contextFrameCount',  // Frames to extract from each clip
      'gapFrameCount',      // Frames to generate between clips
      'model',              // Generation model
      'numInferenceSteps',  // Inference steps
      'guidanceScale',      // Guidance scale
      'seed',               // Seed value
      'negativePrompt',     // Negative prompt
      'priority',           // Queue priority
      'randomSeed',         // Random seed toggle
    ],
  },
  
  'project-image-settings': {
    content: [
      'references',         // All reference images
      'selectedReferenceId',
      'selectedReferenceIdByShot',
      'styleReferenceImage',
      'styleReferenceImageOriginal',
      'styleReferenceStrength',
      'subjectStrength',
      'subjectDescription',
      'inThisScene',
    ],
    configuration: [
      'selectedModel',      // Generation model
    ],
  },
} as const;

/**
 * Human-readable explanation of inheritance behavior
 */
export const INHERITANCE_EXPLANATION = {
  content: 'Project-specific data like prompts, references, and media. Starts fresh for each new project.',
  configuration: 'Reusable settings like dimensions, model choices, and UI preferences. Carries over to streamline workflow.',
} as const;

/**
 * Helper type to extract all content field names
 */
export type ContentField = typeof NEVER_INHERIT_FIELDS[number] | 
  typeof TOOL_FIELD_CATEGORIES[keyof typeof TOOL_FIELD_CATEGORIES]['content'][number];

/**
 * Helper type to extract all configuration field names  
 */
export type ConfigurationField = 
  typeof TOOL_FIELD_CATEGORIES[keyof typeof TOOL_FIELD_CATEGORIES]['configuration'][number];




