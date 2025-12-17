/**
 * Orchestrator completion logic for complete_task
 * Handles checking if all child segments are complete and marking orchestrator done
 */

import { extractOrchestratorTaskId, extractOrchestratorRunId } from './params.ts';
import { createVariant } from './generation.ts';
import { triggerCostCalculation } from './billing.ts';
import { TASK_TYPES, SEGMENT_TYPE_CONFIG } from './constants.ts';

// ===== ORCHESTRATOR COMPLETION =====

/**
 * Check if all sibling segments are complete and mark orchestrator done if so
 */
export async function checkOrchestratorCompletion(
  supabase: any,
  taskIdString: string,
  completedTask: any,
  publicUrl: string,
  thumbnailUrl: string | null,
  supabaseUrl: string,
  serviceKey: string
): Promise<void> {
  const taskType = completedTask?.task_type;
  const config = taskType ? SEGMENT_TYPE_CONFIG[taskType] : null;

  if (!config) {
    return; // Not a segment task
  }

  const orchestratorTaskId = extractOrchestratorTaskId(completedTask.params, 'OrchestratorComplete');
  const orchestratorRunId = extractOrchestratorRunId(completedTask.params, 'OrchestratorComplete');

  if (!orchestratorTaskId) {
    return;
  }

  console.log(`[OrchestratorComplete] ${taskType} ${taskIdString} completed. Checking siblings for orchestrator ${orchestratorTaskId}`);

  // Fetch orchestrator task
  const { data: orchestratorTask, error: orchError } = await supabase
    .from("tasks")
    .select("id, status, params")
    .eq("id", orchestratorTaskId)
    .single();

  if (orchError) {
    console.error(`[OrchestratorComplete] Error fetching orchestrator task ${orchestratorTaskId}:`, orchError);
    return;
  }

  if (!orchestratorTask) {
    console.log(`[OrchestratorComplete] Orchestrator task ${orchestratorTaskId} not found`);
    return;
  }

  if (orchestratorTask.status === 'Complete') {
    console.log(`[OrchestratorComplete] Orchestrator ${orchestratorTaskId} is already Complete`);
    return;
  }

  // Get expected segment count
  let expectedSegmentCount: number | null = null;
  
  if (taskType === TASK_TYPES.TRAVEL_SEGMENT) {
    expectedSegmentCount = orchestratorTask.params?.orchestrator_details?.num_new_segments_to_generate ||
      orchestratorTask.params?.num_new_segments_to_generate || null;
  } else if (taskType === TASK_TYPES.JOIN_CLIPS_SEGMENT) {
    const clipList = orchestratorTask.params?.orchestrator_details?.clip_list;
    if (Array.isArray(clipList) && clipList.length > 1) {
      expectedSegmentCount = clipList.length - 1;
    } else {
      expectedSegmentCount = orchestratorTask.params?.orchestrator_details?.num_joins || null;
    }
  }

  console.log(`[OrchestratorComplete] Orchestrator expects ${expectedSegmentCount ?? 'unknown'} segments`);

  // Query sibling segments
  const allSegments = await findSiblingSegments(
    supabase,
    config.segmentType,
    completedTask.project_id,
    orchestratorTaskId,
    orchestratorRunId
  );

  if (!allSegments || allSegments.length === 0) {
    console.log(`[OrchestratorComplete] No segments found for orchestrator`);
    return;
  }

  const foundSegments = allSegments.length;
  const completedSegments = allSegments.filter((s: any) => s.status === 'Complete').length;
  const failedSegments = allSegments.filter((s: any) => s.status === 'Failed' || s.status === 'Cancelled').length;
  const pendingSegments = foundSegments - completedSegments - failedSegments;

  console.log(`[OrchestratorComplete] ${taskType} status: ${completedSegments} complete, ${failedSegments} failed, ${pendingSegments} pending`);

  // Validate segment count
  if (expectedSegmentCount !== null && foundSegments !== expectedSegmentCount) {
    console.log(`[OrchestratorComplete] Warning: Found ${foundSegments} segments but expected ${expectedSegmentCount}`);
    return;
  }

  if (pendingSegments > 0) {
    console.log(`[OrchestratorComplete] Still waiting for ${pendingSegments} segments to complete`);
    return;
  }

  if (failedSegments > 0) {
    // Mark orchestrator as Failed
    await markOrchestratorFailed(supabase, orchestratorTaskId, failedSegments, foundSegments);
    return;
  }

  if (completedSegments === foundSegments && (expectedSegmentCount === null || foundSegments === expectedSegmentCount)) {
    // All segments complete! Mark orchestrator as Complete
    await markOrchestratorComplete(
      supabase,
      orchestratorTaskId,
      orchestratorTask,
      allSegments,
      publicUrl,
      thumbnailUrl,
      taskType,
      taskIdString,
      supabaseUrl,
      serviceKey
    );
  }
}

/**
 * Find sibling segment tasks
 */
async function findSiblingSegments(
  supabase: any,
  segmentType: string,
  projectId: string,
  orchestratorTaskId: string,
  orchestratorRunId: string | null
): Promise<any[] | null> {
  let allSegments: any[] | null = null;
  let segmentsError: any = null;

  // Strategy 1: Query by run_id
  if (orchestratorRunId) {
    console.log(`[OrchestratorComplete] Querying ${segmentType} by run_id: ${orchestratorRunId}`);
    
    const runIdQuery = supabase
      .from("tasks")
      .select("id, status, params, generation_started_at")
      .eq("task_type", segmentType)
      .eq("project_id", projectId)
      .or(`params->>orchestrator_run_id.eq.${orchestratorRunId},params->>run_id.eq.${orchestratorRunId},params->orchestrator_details->>run_id.eq.${orchestratorRunId}`);

    const runIdResult = await runIdQuery;
    allSegments = runIdResult.data;
    segmentsError = runIdResult.error;
    
    if (allSegments && allSegments.length > 0) {
      console.log(`[OrchestratorComplete] Found ${allSegments.length} segments via run_id query`);
      return allSegments;
    }
  }

  // Strategy 2: Fallback to orchestrator_task_id
  if ((!allSegments || allSegments.length === 0) && !segmentsError) {
    console.log(`[OrchestratorComplete] Trying orchestrator_task_id: ${orchestratorTaskId}`);
    
    const orchIdQuery = supabase
      .from("tasks")
      .select("id, status, params, generation_started_at")
      .eq("task_type", segmentType)
      .eq("project_id", projectId)
      .or(`params->>orchestrator_task_id.eq.${orchestratorTaskId},params->>orchestrator_task_id_ref.eq.${orchestratorTaskId},params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`);

    const orchIdResult = await orchIdQuery;
    allSegments = orchIdResult.data;
    segmentsError = orchIdResult.error;
    
    if (allSegments && allSegments.length > 0) {
      console.log(`[OrchestratorComplete] Found ${allSegments.length} segments via orchestrator_task_id query`);
    }
  }

  if (segmentsError) {
    console.error(`[OrchestratorComplete] Error querying segments:`, segmentsError);
    return null;
  }

  return allSegments;
}

/**
 * Mark orchestrator as Failed
 */
async function markOrchestratorFailed(
  supabase: any,
  orchestratorTaskId: string,
  failedSegments: number,
  totalSegments: number
): Promise<void> {
  console.log(`[OrchestratorComplete] Marking orchestrator ${orchestratorTaskId} as Failed (${failedSegments}/${totalSegments} failed)`);

  const { error: updateOrchError } = await supabase
    .from("tasks")
    .update({
      status: "Failed",
      error_message: `${failedSegments} of ${totalSegments} segments failed`,
      generation_processed_at: new Date().toISOString()
    })
    .eq("id", orchestratorTaskId)
    .in("status", ["Queued", "In Progress"]);

  if (updateOrchError) {
    console.error(`[OrchestratorComplete] Failed to mark orchestrator as Failed:`, updateOrchError);
  } else {
    console.log(`[OrchestratorComplete] Marked orchestrator ${orchestratorTaskId} as Failed`);
  }
}

/**
 * Mark orchestrator as Complete and handle billing
 */
async function markOrchestratorComplete(
  supabase: any,
  orchestratorTaskId: string,
  orchestratorTask: any,
  allSegments: any[],
  publicUrl: string,
  thumbnailUrl: string | null,
  taskType: string,
  taskIdString: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<void> {
  console.log(`[OrchestratorComplete] All ${allSegments.length} segments complete! Marking orchestrator ${orchestratorTaskId} as Complete`);

  // Find earliest sub-task start time for billing
  let earliestStartTime: string | null = null;
  for (const segment of allSegments) {
    if (segment.generation_started_at) {
      if (!earliestStartTime || segment.generation_started_at < earliestStartTime) {
        earliestStartTime = segment.generation_started_at;
      }
    }
  }

  const { error: updateOrchError } = await supabase
    .from("tasks")
    .update({
      status: "Complete",
      output_location: publicUrl,
      generation_started_at: earliestStartTime || new Date().toISOString(),
      generation_processed_at: new Date().toISOString()
    })
    .eq("id", orchestratorTaskId)
    .in("status", ["Queued", "In Progress"]);

  if (updateOrchError) {
    console.error(`[OrchestratorComplete] Failed to mark orchestrator ${orchestratorTaskId} as Complete:`, updateOrchError);
    return;
  }

  console.log(`[OrchestratorComplete] Successfully marked orchestrator ${orchestratorTaskId} as Complete`);
  
  // Trigger billing
  await triggerCostCalculation(supabaseUrl, serviceKey, orchestratorTaskId, 'OrchestratorComplete');
  
  // Update parent_generation_id for join_clips_segment
  if (taskType === TASK_TYPES.JOIN_CLIPS_SEGMENT) {
    await handleJoinClipsParentUpdate(supabase, orchestratorTask, publicUrl, thumbnailUrl, taskIdString, orchestratorTaskId);
  }
}

/**
 * Handle variant creation for join_clips completion
 * Note: We only create a variant - we do NOT update the parent generation's location
 * Each task output has its own unique URL via the variant system
 */
async function handleJoinClipsParentUpdate(
  supabase: any,
  orchestratorTask: any,
  publicUrl: string,
  thumbnailUrl: string | null,
  taskIdString: string,
  orchestratorTaskId: string
): Promise<void> {
  const parentGenId = orchestratorTask.params?.orchestrator_details?.parent_generation_id || 
                      orchestratorTask.params?.parent_generation_id;
  
  if (!parentGenId) {
    return;
  }

  console.log(`[OrchestratorComplete] Creating variant for parent generation ${parentGenId}`);
  
  try {
    const variantParams = {
      ...orchestratorTask.params,
      tool_type: orchestratorTask.params?.tool_type || orchestratorTask.params?.orchestrator_details?.tool_type || 'join-clips',
      source_task_id: taskIdString,
      orchestrator_task_id: orchestratorTaskId,
      created_from: 'join_clips_complete',
    };

    await createVariant(supabase, parentGenId, publicUrl, thumbnailUrl, variantParams, true, 'clip_join', null);
    
    console.log(`[OrchestratorComplete] Successfully created variant for parent generation ${parentGenId}`);
  } catch (genUpdateErr) {
    console.error(`[OrchestratorComplete] Exception creating variant:`, genUpdateErr);
  }
}

