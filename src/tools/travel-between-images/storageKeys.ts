// Storage keys for persisting travel-between-images settings
export const STORAGE_KEYS = {
  // Key for storing the main settings of the last active shot (for inheritance)
  LAST_ACTIVE_SHOT_SETTINGS: (projectId: string) => `last-active-shot-settings-${projectId}`,
  
  // Key for storing the LoRA settings of the last active shot (for inheritance)
  LAST_ACTIVE_LORA_SETTINGS: (projectId: string) => `last-active-lora-settings-${projectId}`,
  
  // Key for storing UI state settings (for inheritance)
  LAST_ACTIVE_UI_SETTINGS: (projectId: string) => `last-active-ui-settings-${projectId}`,
  
  // Key for passing inherited settings to a new shot via sessionStorage
  APPLY_PROJECT_DEFAULTS: (shotId: string) => `apply-project-defaults-${shotId}`,
};






