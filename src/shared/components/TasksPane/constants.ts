import { TaskStatus } from '@/types/database';

export const ITEMS_PER_PAGE = 50;

// Status filter mapping
export type FilterGroup = 'Processing' | 'Succeeded' | 'Failed';

export const STATUS_GROUPS: Record<FilterGroup, TaskStatus[]> = {
  Processing: ['Queued', 'In Progress'],
  Succeeded: ['Complete'],
  Failed: ['Failed', 'Cancelled'],
};

// Known image task types for content type inference
// Used when task_types table doesn't have content_type set
export const KNOWN_IMAGE_TASK_TYPES = [
  'image_inpaint',
  'qwen_image',
  'qwen_image_2512',
  'z_image_turbo',
  'qwen_image_edit',
  'image_generation',
  'magic_edit',
  'kontext_image_edit',
  'flux_image_edit',
  'upscale_image',
  'style_transfer',
] as const;

// Image edit task types - these don't show prompt in task list
// (the edit instruction is less useful to display than generation prompts)
export const IMAGE_EDIT_TASK_TYPES = [
  'image_inpaint',
  'qwen_image_edit',
  'magic_edit',
  'kontext_image_edit',
  'flux_image_edit',
] as const;

// Task name abbreviations for tight spaces
export const TASK_NAME_ABBREVIATIONS: Record<string, string> = {
  'Travel Between Images': 'Travel Video',
  'Image Generation': 'Image Gen',
  'Edit Travel (Kontext)': 'Edit Travel (K)',
  'Edit Travel (Flux)': 'Edit Travel (F)',
  'Training Data Helper': 'Training Data',
  'Video Generation': 'Video Gen',
  'Style Transfer': 'Style Transfer',
};



