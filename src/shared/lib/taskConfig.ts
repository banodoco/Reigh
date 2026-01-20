/**
 * Centralized task configuration system
 * 
 * This module provides synchronous access to task type configuration.
 * Configuration is loaded from the database (task_types table) and cached globally.
 * Hardcoded fallbacks exist for backwards compatibility and offline scenarios.
 */

import { getTaskTypeConfigCache, isTaskTypeConfigCacheInitialized, type TaskTypeInfo } from '@/shared/hooks/useTaskType';

export interface TaskTypeConfig {
  /** Whether this task type should be visible in the UI */
  isVisible: boolean;
  /** Display name for the task type (overrides the raw taskType) */
  displayName?: string;
  /** Whether this task type supports progress checking */
  supportsProgress?: boolean;
  /** Whether this task type can be manually cancelled by users */
  canCancel?: boolean;
  /** Category for grouping related task types */
  category?: 'generation' | 'processing' | 'orchestration' | 'utility';
  /** Description for documentation/debugging */
  description?: string;
}

/**
 * HARDCODED FALLBACK: Task type configuration registry
 * Used when database cache is not yet initialized or as fallback for unknown types
 * 
 * NOTE: The source of truth is the task_types database table.
 * This is a fallback for backwards compatibility.
 */
const HARDCODED_TASK_TYPE_CONFIG: Record<string, TaskTypeConfig> = {
  // Visible orchestration tasks
  travel_orchestrator: { isVisible: true, displayName: 'Travel Between Images', supportsProgress: true, category: 'orchestration' },
  join_clips_orchestrator: { isVisible: true, displayName: 'Join Clips', supportsProgress: true, category: 'orchestration' },
  edit_video_orchestrator: { isVisible: true, displayName: 'Edit Video', supportsProgress: true, category: 'orchestration' },
  
  // Visible generation tasks
  animate_character: { isVisible: true, displayName: 'Animate Character', category: 'generation' },
  individual_travel_segment: { isVisible: true, displayName: 'Travel Segment', category: 'generation' },
  image_inpaint: { isVisible: true, displayName: 'Image Inpaint', category: 'generation' },
  annotated_image_edit: { isVisible: true, displayName: 'Annotated Edit', category: 'generation' },
  qwen_image: { isVisible: true, displayName: 'Qwen Image', category: 'generation' },
  qwen_image_2512: { isVisible: true, displayName: 'Qwen Image 2512', category: 'generation' },
  z_image_turbo: { isVisible: true, displayName: 'Z Image Turbo', category: 'generation' },
  z_image_turbo_i2i: { isVisible: true, displayName: 'Z Image Img2Img', category: 'generation' },
  qwen_image_style: { isVisible: true, displayName: 'Qwen w/ Reference', category: 'generation' },
  qwen_image_edit: { isVisible: true, displayName: 'Qwen Image Edit', category: 'generation' },
  
  // Hidden processing/utility tasks
  travel_segment: { isVisible: false, category: 'processing' },
  travel_stitch: { isVisible: false, category: 'processing' },
  single_image: { isVisible: false, category: 'generation' },
  edit_travel_kontext: { isVisible: false, category: 'generation' },
  edit_travel_flux: { isVisible: false, category: 'generation' },
  join_clips_segment: { isVisible: false, category: 'processing' },
  edit_video_segment: { isVisible: false, category: 'processing' },
  wan_2_2_t2i: { isVisible: false, category: 'generation' },
  extract_frame: { isVisible: false, category: 'utility' },
  generate_openpose: { isVisible: false, category: 'utility' },
  rife_interpolate_images: { isVisible: false, category: 'utility' },
  wgp: { isVisible: false, category: 'utility' },
};

/**
 * Convert database TaskTypeInfo to TaskTypeConfig format
 */
function dbConfigToTaskConfig(dbConfig: TaskTypeInfo): TaskTypeConfig {
  return {
    isVisible: dbConfig.is_visible ?? false,
    displayName: dbConfig.display_name,
    supportsProgress: dbConfig.supports_progress ?? false,
    canCancel: true, // Default all tasks to cancellable
    category: dbConfig.category as TaskTypeConfig['category'],
  };
}

/**
 * Get configuration for a specific task type
 * Checks the database cache first, falls back to hardcoded defaults
 */
export function getTaskConfig(taskType: string): TaskTypeConfig {
  // Check database cache first (populated by useAllTaskTypesConfig hook)
  if (isTaskTypeConfigCacheInitialized()) {
    const cache = getTaskTypeConfigCache();
    const dbConfig = cache[taskType];
    if (dbConfig) {
      return dbConfigToTaskConfig(dbConfig);
    }
  }
  
  // Fall back to hardcoded config
  const hardcodedConfig = HARDCODED_TASK_TYPE_CONFIG[taskType];
  if (hardcodedConfig) {
    return hardcodedConfig;
  }
  
  // Default for completely unknown task types
  return {
    isVisible: false, // Default to hidden for unknown types
    canCancel: true,
    category: 'utility'
  };
}

/**
 * Check if a task type should be visible in the UI
 */
export function isTaskVisible(taskType: string): boolean {
  return getTaskConfig(taskType).isVisible;
}

/**
 * Get the display name for a task type
 */
export function getTaskDisplayName(taskType: string): string {
  const config = getTaskConfig(taskType);
  return config.displayName || taskType;
}

/**
 * Check if a task type supports progress checking
 */
export function taskSupportsProgress(taskType: string): boolean {
  return getTaskConfig(taskType).supportsProgress || false;
}

/**
 * Check if a task type can be cancelled
 */
export function canCancelTask(taskType: string): boolean {
  return getTaskConfig(taskType).canCancel !== false; // Default to true
}

/**
 * Get all visible task types
 * Uses database cache if available, falls back to hardcoded list
 */
export function getVisibleTaskTypes(): string[] {
  if (isTaskTypeConfigCacheInitialized()) {
    const cache = getTaskTypeConfigCache();
    return Object.entries(cache)
      .filter(([_, config]) => config.is_visible)
      .map(([taskType]) => taskType);
  }
  
  // Fall back to hardcoded
  return Object.entries(HARDCODED_TASK_TYPE_CONFIG)
    .filter(([_, config]) => config.isVisible)
    .map(([taskType]) => taskType);
}

/**
 * Get all hidden task types
 * Uses database cache if available, falls back to hardcoded list
 */
export function getHiddenTaskTypes(): string[] {
  if (isTaskTypeConfigCacheInitialized()) {
    const cache = getTaskTypeConfigCache();
    return Object.entries(cache)
      .filter(([_, config]) => !config.is_visible)
      .map(([taskType]) => taskType);
  }
  
  // Fall back to hardcoded
  return Object.entries(HARDCODED_TASK_TYPE_CONFIG)
    .filter(([_, config]) => !config.isVisible)
    .map(([taskType]) => taskType);
}

/**
 * Filter tasks to only include visible ones
 */
export function filterVisibleTasks<T extends { taskType: string }>(tasks: T[]): T[] {
  return tasks.filter(task => isTaskVisible(task.taskType));
}

// Re-export for backwards compatibility
export { HARDCODED_TASK_TYPE_CONFIG as TASK_TYPE_CONFIG };
