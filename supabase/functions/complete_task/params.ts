/**
 * Parameter extraction helpers for complete_task
 * 
 * These functions extract values from deeply nested task params,
 * supporting multiple possible locations for each field.
 */

// ===== THUMBNAIL PATH CONFIGURATION =====

/**
 * Configuration for where thumbnail_url should be stored based on task_type
 */
export const THUMBNAIL_PATH_CONFIG: Record<string, { path: string[]; extras?: Record<string, any> }> = {
  'travel_stitch': {
    path: ['full_orchestrator_payload', 'thumbnail_url'],
    extras: { accelerated: false } // Always hardcode accelerated=false for travel_stitch
  },
  'wan_2_2_i2v': {
    path: ['orchestrator_details', 'thumbnail_url']
  },
  'single_image': {
    path: ['thumbnail_url']
  },
  'default': {
    path: ['thumbnail_url']
  }
};

// ===== GENERIC PARAM EXTRACTION =====

/**
 * Generic function to extract a value from multiple nested paths in params
 * Checks paths in order and returns the first non-null/undefined value found
 * @param params - The params object to search
 * @param fieldName - The field name being extracted (for logging)
 * @param paths - Array of path arrays (e.g., [['based_on'], ['orchestrator_details', 'based_on']])
 * @param logTag - Optional log tag prefix
 * @returns The extracted value as string, or null if not found
 */
export function extractFromParams(params: any, fieldName: string, paths: string[][], logTag: string = 'ParamExtractor'): string | null {
  try {
    for (const path of paths) {
      let value = params;
      let pathValid = true;

      // Traverse the path
      for (const key of path) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          pathValid = false;
          break;
        }
      }

      // If we successfully traversed the path and got a value
      if (pathValid && value !== null && value !== undefined) {
        const pathStr = path.join('.');
        console.log(`[${logTag}] Found ${fieldName} in ${pathStr}: ${value}`);
        return String(value);
      }
    }

    console.log(`[${logTag}] No ${fieldName} found in task params`);
    return null;
  } catch (error) {
    console.error(`[${logTag}] Error extracting ${fieldName}:`, error);
    return null;
  }
}

// ===== SPECIFIC EXTRACTORS =====

/**
 * Extract orchestrator_task_id from task params
 * Checks multiple possible locations where this field might be stored
 */
export function extractOrchestratorTaskId(params: any, logTag: string = 'OrchestratorExtract'): string | null {
  return extractFromParams(
    params,
    'orchestrator_task_id',
    [
      ['orchestrator_details', 'orchestrator_task_id'],
      ['originalParams', 'orchestrator_details', 'orchestrator_task_id'],
      ['orchestrator_task_id_ref'],
      ['orchestrator_task_id'],
    ],
    logTag
  );
}

/**
 * Extract orchestrator run_id from task params
 * Used for finding sibling segment tasks
 */
export function extractOrchestratorRunId(params: any, logTag: string = 'OrchestratorExtract'): string | null {
  return extractFromParams(
    params,
    'run_id',
    [
      ['orchestrator_run_id'],
      ['run_id'],
      ['orchestrator_details', 'run_id'],
      ['originalParams', 'orchestrator_details', 'run_id'],
      ['full_orchestrator_payload', 'run_id'],
    ],
    logTag
  );
}

/**
 * Extract based_on from task params
 * Supports multiple param shapes for flexibility across different task types
 */
export function extractBasedOn(params: any): string | null {
  return extractFromParams(
    params,
    'based_on',
    [
      ['based_on'],                                      // Direct field (most common)
      ['originalParams', 'orchestrator_details', 'based_on'],
      ['orchestrator_details', 'based_on'],
      ['full_orchestrator_payload', 'based_on'],
      ['originalParams', 'based_on']
    ],
    'BasedOn'
  );
}

/**
 * Extract shot_id and add_in_position from task params
 * Supports multiple param shapes as per current DB trigger logic
 */
export function extractShotAndPosition(params: any): { shotId?: string, addInPosition: boolean } {
  // Extract shot_id using generic helper
  const shotId = extractFromParams(
    params,
    'shot_id',
    [
      ['originalParams', 'orchestrator_details', 'shot_id'],  // MOST COMMON for wan_2_2_i2v
      ['orchestrator_details', 'shot_id'],
      ['shot_id'],
      ['full_orchestrator_payload', 'shot_id'],              // For travel_stitch
      ['shotId']                                               // camelCase variant
    ],
    'GenMigration'
  ) || undefined;

  // Extract add_in_position flag from multiple locations
  let addInPosition = false; // Default: unpositioned

  const addInPositionValue = extractFromParams(
    params,
    'add_in_position',
    [
      ['add_in_position'],
      ['originalParams', 'add_in_position'],
      ['orchestrator_details', 'add_in_position'],
      ['originalParams', 'orchestrator_details', 'add_in_position']
    ],
    'GenMigration'
  );

  if (addInPositionValue !== null) {
    addInPosition = addInPositionValue === 'true' || addInPositionValue === '1';
    console.log(`[GenMigration] Extracted add_in_position: ${addInPosition}`);
  }

  return { shotId, addInPosition };
}

/**
 * Set thumbnail URL in params at the correct location based on task_type
 * @returns Updated params object (does not mutate original)
 */
export function setThumbnailInParams(
  params: Record<string, any>,
  taskType: string,
  thumbnailUrl: string
): Record<string, any> {
  const config = THUMBNAIL_PATH_CONFIG[taskType] || THUMBNAIL_PATH_CONFIG.default;
  const updatedParams = JSON.parse(JSON.stringify(params || {})); // Deep clone

  // Navigate to parent path and ensure it exists
  let target = updatedParams;
  for (let i = 0; i < config.path.length - 1; i++) {
    const key = config.path[i];
    if (!target[key]) {
      target[key] = {};
    }
    target = target[key];
  }

  // Set the thumbnail URL
  const finalKey = config.path[config.path.length - 1];
  target[finalKey] = thumbnailUrl;

  // Set any extras (e.g., accelerated=false for travel_stitch)
  if (config.extras) {
    for (const [key, value] of Object.entries(config.extras)) {
      target[key] = value;
    }
  }

  return updatedParams;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Get MIME content type from filename extension
 */
export function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Build generation params starting from normalized task params
 */
export function buildGenerationParams(
  baseParams: any, 
  toolType: string, 
  contentType?: string, 
  shotId?: string, 
  thumbnailUrl?: string
): any {
  let generationParams = { ...baseParams };

  // Add tool_type to the params JSONB
  generationParams.tool_type = toolType;

  // Add content_type to params for download/display purposes
  if (contentType) {
    generationParams.content_type = contentType;
  }

  // Add shot_id if present and valid
  if (shotId) {
    generationParams.shotId = shotId;
  }

  // Add thumbnail_url to params if available
  if (thumbnailUrl) {
    generationParams.thumbnailUrl = thumbnailUrl;
  }

  return generationParams;
}

