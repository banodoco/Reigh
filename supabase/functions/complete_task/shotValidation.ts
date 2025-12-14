/**
 * Shot validation and cleanup for complete_task
 * Validates shot_id references and removes invalid ones from task params
 */

// ===== TYPES =====

export interface ShotValidationResult {
  needsUpdate: boolean;
  updatedParams: Record<string, any>;
}

// ===== SHOT VALIDATION =====

/**
 * Extract shot_id from task params based on tool_type
 */
function extractShotIdByToolType(params: any, toolType: string | null): any {
  if (toolType === 'travel-between-images') {
    // For travel-between-images tasks, try multiple possible locations
    return params?.originalParams?.orchestrator_details?.shot_id ||
           params?.orchestrator_details?.shot_id ||
           params?.full_orchestrator_payload?.shot_id;
  } else if (toolType === 'image-generation') {
    // For image generation tasks, shot_id is typically at top level
    return params?.shot_id;
  } else {
    // Fallback for other task types - try common locations
    return params?.shot_id || params?.orchestrator_details?.shot_id;
  }
}

/**
 * Remove invalid shot_id from params based on tool_type
 * @returns Updated params with shot_id removed from appropriate locations
 */
function removeShotIdByToolType(params: Record<string, any>, toolType: string | null): Record<string, any> {
  const updatedParams = JSON.parse(JSON.stringify(params)); // Deep clone

  if (toolType === 'travel-between-images') {
    // Clean up all possible locations for travel-between-images tasks
    if (updatedParams.originalParams?.orchestrator_details) {
      delete updatedParams.originalParams.orchestrator_details.shot_id;
    }
    if (updatedParams.orchestrator_details) {
      delete updatedParams.orchestrator_details.shot_id;
    }
    if (updatedParams.full_orchestrator_payload) {
      delete updatedParams.full_orchestrator_payload.shot_id;
    }
  } else if (toolType === 'image-generation') {
    delete updatedParams.shot_id;
  } else {
    // Fallback cleanup for other task types
    delete updatedParams.shot_id;
    if (updatedParams.orchestrator_details) {
      delete updatedParams.orchestrator_details.shot_id;
    }
  }

  return updatedParams;
}

/**
 * Convert shot_id from various formats to string
 * Handles JSONB objects that may wrap the UUID
 */
function normalizeToString(value: any): string {
  if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'object' && value !== null) {
    // If it's wrapped in an object, try to extract the actual UUID
    return String(value.id || value.uuid || value);
  } else {
    return String(value);
  }
}

/**
 * Validate UUID format
 */
function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Validate shot references and clean up invalid ones from task params
 * 
 * @param supabase - Supabase client
 * @param params - Task params to validate
 * @param toolType - The resolved tool_type for this task
 * @returns Updated params if changes needed, or original params if valid
 */
export async function validateAndCleanupShotId(
  supabase: any,
  params: Record<string, any>,
  toolType: string | null
): Promise<ShotValidationResult> {
  // Extract shot_id based on tool_type
  const extractedShotId = extractShotIdByToolType(params, toolType);

  if (!extractedShotId) {
    // No shot_id to validate
    return { needsUpdate: false, updatedParams: params };
  }

  console.log(`[ShotValidation] Checking if shot ${extractedShotId} exists...`);

  // Normalize to string (handles JSONB objects)
  const shotIdString = normalizeToString(extractedShotId);

  // Validate UUID format
  if (!isValidUuid(shotIdString)) {
    console.log(`[ShotValidation] Invalid UUID format for shot: ${shotIdString}, removing from parameters`);
    return {
      needsUpdate: true,
      updatedParams: removeShotIdByToolType(params, toolType)
    };
  }

  // Check if shot exists in database
  const { data: shotData, error: shotError } = await supabase
    .from("shots")
    .select("id")
    .eq("id", shotIdString)
    .single();

  if (shotError || !shotData) {
    console.log(`[ShotValidation] Shot ${shotIdString} does not exist (error: ${shotError?.message || 'not found'}), removing from task parameters`);
    return {
      needsUpdate: true,
      updatedParams: removeShotIdByToolType(params, toolType)
    };
  }

  console.log(`[ShotValidation] Shot ${shotIdString} exists and is valid`);
  return { needsUpdate: false, updatedParams: params };
}
