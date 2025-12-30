/**
 * Centralized task type utilities
 *
 * This module provides a single source of truth for task type categorization.
 * Use these utilities instead of inline checks like `taskType?.includes('travel')`.
 *
 * Note: Some types like 'clip_join' are variant_types (stored on generation_variants),
 * not task_types (in task_types DB table). This utility handles both uniformly.
 */

// Join clips related types (includes variant_type 'clip_join')
const JOIN_CLIPS_TYPES = new Set([
  'join_clips_orchestrator',
  'join_clips_segment',
  'join_clips',
  'clip_join', // variant_type, not a task_type
]);

// Travel/video generation types
const TRAVEL_TYPES = new Set([
  'travel_orchestrator',
  'travel_segment',
  'individual_travel_segment',
]);

// Character animation types
const CHARACTER_ANIMATE_TYPES = new Set([
  'animate_character',
]);

// All video-related task types (for determining UI to show)
const VIDEO_TASK_TYPES = new Set([
  ...JOIN_CLIPS_TYPES,
  ...TRAVEL_TYPES,
  ...CHARACTER_ANIMATE_TYPES,
]);

/**
 * Check if a task type is a join clips type
 * Includes: join_clips_orchestrator, join_clips_segment, join_clips, clip_join
 */
export const isJoinClipsTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  return JOIN_CLIPS_TYPES.has(taskType);
};

/**
 * Check if a task type is a travel/video generation type
 * Includes: travel_orchestrator, travel_segment, individual_travel_segment
 */
export const isTravelTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  // Also check for partial match to handle any future travel types
  return TRAVEL_TYPES.has(taskType) || taskType.includes('travel');
};

/**
 * Check if a task type is a character animate type
 */
export const isCharacterAnimateTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  return CHARACTER_ANIMATE_TYPES.has(taskType);
};

/**
 * Check if a task type should show video-style details UI
 * This determines whether to render SharedTaskDetails vs SharedMetadataDetails
 */
export const isVideoTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  return VIDEO_TASK_TYPES.has(taskType) ||
         taskType.includes('travel') ||
         taskType.includes('join_clips');
};

/**
 * Get the display category for a task type
 * Useful for UI labels and grouping
 */
export const getTaskTypeCategory = (taskType: string | null | undefined): 'join_clips' | 'travel' | 'character_animate' | 'image' | 'unknown' => {
  if (!taskType) return 'unknown';
  if (isJoinClipsTaskType(taskType)) return 'join_clips';
  if (isTravelTaskType(taskType)) return 'travel';
  if (isCharacterAnimateTaskType(taskType)) return 'character_animate';
  // Default to 'image' for image generation task types
  return 'image';
};

// ============================================================================
// Orchestrator ID Extraction
// ============================================================================

/**
 * Extract the orchestrator task ID from task params.
 * Checks all known paths where orchestrator reference might be stored.
 * Matches the backend logic in complete_task/params.ts
 */
export const extractOrchestratorTaskId = (params: Record<string, any> | null | undefined): string | null => {
  if (!params) return null;

  return (
    params.orchestrator_task_id_ref ||
    params.orchestrator_details?.orchestrator_task_id ||
    params.originalParams?.orchestrator_details?.orchestrator_task_id ||
    params.orchestrator_task_id ||
    null
  );
};

/**
 * Extract the orchestrator run ID from task params.
 */
export const extractOrchestratorRunId = (params: Record<string, any> | null | undefined): string | null => {
  if (!params) return null;

  return (
    params.orchestrator_details?.run_id ||
    params.orchestrator_run_id ||
    null
  );
};

/**
 * Parse task params, handling both string and object formats
 */
export const parseTaskParams = (params: string | Record<string, any> | null | undefined): Record<string, any> => {
  if (!params) return {};
  if (typeof params === 'string') {
    try {
      return JSON.parse(params);
    } catch {
      return {};
    }
  }
  return params;
};
