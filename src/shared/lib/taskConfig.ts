/**
 * Centralized task configuration system
 * Manages task visibility, display names, and other task-specific behaviors
 */

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
 * Task type configuration registry
 * Add new task types here with their specific configurations
 */
export const TASK_TYPE_CONFIG: Record<string, TaskTypeConfig> = {
  // Travel orchestration tasks
  travel_orchestrator: {
    isVisible: true,
    displayName: 'Travel Between Images',
    supportsProgress: true,
    canCancel: true,
    category: 'orchestration',
    description: 'Main orchestrator for travel generation workflows'
  },
  
  // Hidden travel subtasks
  travel_segment: {
    isVisible: false,
    canCancel: true,
    category: 'processing',
    description: 'Individual video segment generation (part of travel workflow)'
  },
  
  travel_stitch: {
    isVisible: false,
    canCancel: true,
    category: 'processing', 
    description: 'Video stitching task (part of travel workflow)'
  },

  // Image generation tasks
  single_image: {
    isVisible: true,
    displayName: 'Image Generation',
    canCancel: true,
    category: 'generation',
    description: 'Single image generation task'
  },

  // Edit travel tasks
  edit_travel_kontext: {
    isVisible: true,
    displayName: 'Edit Travel (Kontext)',
    canCancel: true,
    category: 'generation',
    description: 'Edit travel using Kontext model'
  },

  edit_travel_flux: {
    isVisible: true,
    displayName: 'Edit Travel (Flux)',
    canCancel: true,
    category: 'generation',
    description: 'Edit travel using Flux model'
  },

  // Character animation tasks
  animate_character: {
    isVisible: true,
    displayName: 'Animate Character',
    canCancel: true,
    category: 'generation',
    description: 'Animate or replace characters in videos'
  },

  // Video joining tasks
  join_clips_orchestrator: {
    isVisible: true,
    displayName: 'Join Clips',
    supportsProgress: true,
    canCancel: true,
    category: 'orchestration',
    description: 'Main orchestrator for join clips workflows with multiple videos'
  },

  // Hidden join clips subtasks
  join_clips_segment: {
    isVisible: false,
    canCancel: true,
    category: 'processing',
    description: 'Individual join segment generation (part of join clips workflow)'
  },

  // Individual segment regeneration (visible - standalone task)
  individual_travel_segment: {
    isVisible: true,
    displayName: 'Regenerate Segment',
    canCancel: true,
    category: 'generation',
    description: 'Standalone segment regeneration from segment details view'
  },

  // Add more task types as needed...
};

/**
 * Get configuration for a specific task type
 */
export function getTaskConfig(taskType: string): TaskTypeConfig {
  return TASK_TYPE_CONFIG[taskType] || {
    isVisible: true, // Default to visible for unknown task types
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
 */
export function getVisibleTaskTypes(): string[] {
  return Object.entries(TASK_TYPE_CONFIG)
    .filter(([_, config]) => config.isVisible)
    .map(([taskType, _]) => taskType);
}

/**
 * Get all hidden task types
 */
export function getHiddenTaskTypes(): string[] {
  return Object.entries(TASK_TYPE_CONFIG)
    .filter(([_, config]) => !config.isVisible)
    .map(([taskType, _]) => taskType);
}

/**
 * Filter tasks to only include visible ones
 */
export function filterVisibleTasks<T extends { taskType: string }>(tasks: T[]): T[] {
  return tasks.filter(task => isTaskVisible(task.taskType));
} 