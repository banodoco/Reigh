// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest, verifyTaskOwnership } from "../_shared/auth.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: update-shot-pair-prompts
 * 
 * Takes an orchestrator task ID and updates the shot_generations.metadata fields
 * for all images in the associated shot with prompts from the task.
 * 
 * Updates:
 * - pair_prompt: Individual prompt for each pair (from base_prompts array)
 * - pair_negative_prompt: Individual negative prompt for each pair (from negative_prompts array)
 * - enhanced_prompt: Enhanced/AI-generated prompt for each pair (from enhanced_prompts array)
 * - base_prompt: The default/base prompt used across all pairs (singular)
 * 
 * POST /functions/v1/update-shot-pair-prompts
 * Headers: Authorization: Bearer <Service Role Key or PAT>
 * Body: {
 *   "task_id": "uuid-string"  // Orchestrator task ID
 * }
 * 
 * Returns:
 * - 200 OK with updated shot_generations
 * - 400 Bad Request if missing required fields
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if user doesn't own the task
 * - 404 Not Found if task doesn't exist or has no shot_id
 * - 500 Internal Server Error
 */

serve(async (req) => {
  const LOG_PREFIX = "[UPDATE-SHOT-PAIR-PROMPTS]";
  
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey || !supabaseUrl) {
    console.error(`${LOG_PREFIX} Missing required environment variables`);
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Authenticate request using shared utility
  const auth = await authenticateRequest(req, supabaseAdmin, LOG_PREFIX);
  
  if (!auth.success) {
    return new Response(auth.error || "Authentication failed", { 
      status: auth.statusCode || 403 
    });
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  console.log(`${LOG_PREFIX} Authenticated:`, {
    isServiceRole,
    userId: callerId,
  });

  // Parse request body
  let requestBody: any = {};
  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch (e) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Validate required fields
  const { task_id } = requestBody;
  if (!task_id) {
    return new Response("Missing required field: task_id", { status: 400 });
  }

  try {
    // Verify task ownership if user token
    if (!isServiceRole && callerId) {
      const ownershipResult = await verifyTaskOwnership(
        supabaseAdmin, 
        task_id, 
        callerId, 
        LOG_PREFIX
      );

      if (!ownershipResult.success) {
        return new Response(ownershipResult.error || "Forbidden", { 
          status: ownershipResult.statusCode || 403 
        });
      }

      console.log(`${LOG_PREFIX} Task ownership verified for user ${callerId}`);
    }

    console.log(`${LOG_PREFIX} Fetching task ${task_id}`);
    
    // 1. Get the task and extract shot_id and base_prompts
    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("id, params, project_id")
      .eq("id", task_id)
      .single();

    if (taskError || !task) {
      console.error(`${LOG_PREFIX} Task not found:`, taskError);
      return new Response("Task not found", { status: 404 });
    }

    console.log(`${LOG_PREFIX} Task found:`, {
      taskId: task.id,
      projectId: task.project_id,
    });

    // Extract shot_id and prompts from params
    const params = typeof task.params === 'string' ? JSON.parse(task.params) : task.params;
    
    // Try multiple paths to find shot_id (matching complete_task logic)
    let shotId: string | null = null;
    
    // Priority 1: orchestrator_details.shot_id
    if (params.orchestrator_details?.shot_id) {
      shotId = params.orchestrator_details.shot_id;
    }
    // Priority 2: shot_id at top level
    else if (params.shot_id) {
      shotId = params.shot_id;
    }
    // Priority 3: full_orchestrator_payload.shot_id (legacy)
    else if (params.full_orchestrator_payload?.shot_id) {
      shotId = params.full_orchestrator_payload.shot_id;
    }

    if (!shotId) {
      console.error(`${LOG_PREFIX} No shot_id found in task params`);
      return new Response("Task does not have a shot_id in params", { status: 404 });
    }

    // Extract base_prompts (can be in multiple places)
    let basePrompts: string[] = [];
    if (params.base_prompts) {
      basePrompts = params.base_prompts;
    } else if (params.base_prompts_expanded) {
      basePrompts = params.base_prompts_expanded;
    } else if (params.orchestrator_details?.base_prompts) {
      basePrompts = params.orchestrator_details.base_prompts;
    }

    // Extract negative_prompts (optional)
    let negativePrompts: string[] = [];
    if (params.negative_prompts) {
      negativePrompts = params.negative_prompts;
    } else if (params.negative_prompts_expanded) {
      negativePrompts = params.negative_prompts_expanded;
    } else if (params.orchestrator_details?.negative_prompts) {
      negativePrompts = params.orchestrator_details.negative_prompts;
    }

    // Extract enhanced_prompts (optional) - only from orchestrator_details
    const enhancedPrompts: string[] = params.orchestrator_details?.enhanced_prompts || [];

    // Extract base_prompt (singular - the default/base prompt)
    const basePrompt: string | undefined = params.base_prompt || params.orchestrator_details?.base_prompt;

    console.log(`${LOG_PREFIX} Extracted from task:`, {
      shotId,
      basePromptsCount: basePrompts.length,
      basePrompt: basePrompt ? basePrompt.substring(0, 50) + '...' : '(none)',
      negativePromptsCount: negativePrompts.length,
      enhancedPromptsCount: enhancedPrompts.length,
    });

    if (basePrompts.length === 0) {
      console.warn(`${LOG_PREFIX} No base_prompts found in task params`);
    }

    // 2. Get all shot_generations for this shot, filtering for images with timeline_frame
    const { data: shotGenerations, error: sgError } = await supabaseAdmin
      .from("shot_generations")
      .select(`
        id,
        generation_id,
        timeline_frame,
        metadata,
        generation:generations!inner(
          id,
          type,
          location
        )
      `)
      .eq("shot_id", shotId)
      .not("timeline_frame", "is", null)
      .order("timeline_frame", { ascending: true });

    if (sgError) {
      console.error(`${LOG_PREFIX} Error fetching shot_generations:`, sgError);
      return new Response(`Database error: ${sgError.message}`, { status: 500 });
    }

    if (!shotGenerations || shotGenerations.length === 0) {
      console.warn(`${LOG_PREFIX} No shot_generations found for shot ${shotId}`);
      return new Response(JSON.stringify({
        success: true,
        message: "No positioned images found for this shot",
        updated_count: 0,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Filter to only include images (not videos)
    const imageGenerations = shotGenerations.filter(sg => {
      const gen = sg.generation as any;
      const isVideo = gen?.type === 'video' || 
                     gen?.type === 'video_travel_output' ||
                     (gen?.location && gen.location.endsWith('.mp4'));
      return !isVideo;
    });

    console.log(`${LOG_PREFIX} Found shot_generations:`, {
      totalCount: shotGenerations.length,
      imageCount: imageGenerations.length,
      firstFew: imageGenerations.slice(0, 3).map(sg => ({
        id: sg.id.substring(0, 8),
        timeline_frame: sg.timeline_frame,
      })),
    });

    // Verify prompt count matches expected (N images = N-1 pairs)
    const expectedPromptCount = imageGenerations.length - 1;
    if (basePrompts.length !== expectedPromptCount) {
      console.warn(`${LOG_PREFIX} ⚠️ Prompt count mismatch:`, {
        imageCount: imageGenerations.length,
        expectedPrompts: expectedPromptCount,
        actualPrompts: basePrompts.length,
        warning: 'The number of prompts should equal (imageCount - 1) for proper pair mapping'
      });
    }

    if (imageGenerations.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No image generations found for this shot",
        updated_count: 0,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Update each shot_generation's metadata with the corresponding pair_prompt
    // The first image gets base_prompts[0], second gets base_prompts[1], etc.
    const updatePromises = imageGenerations.map(async (sg, index) => {
      // Get existing metadata or create new object
      const existingMetadata = sg.metadata || {};
      
      // Build updated metadata - only add fields that have non-empty values
      const updatedMetadata = {
        ...existingMetadata,
      };

      let hasChanges = false;

      // Assign pair_prompt if available and not empty
      if (index < basePrompts.length && basePrompts[index]) {
        updatedMetadata.pair_prompt = basePrompts[index];
        hasChanges = true;
      }

      // Assign pair_negative_prompt if available and not empty
      if (index < negativePrompts.length && negativePrompts[index]) {
        updatedMetadata.pair_negative_prompt = negativePrompts[index];
        hasChanges = true;
      }

      // Assign enhanced_prompt if available and not empty
      if (index < enhancedPrompts.length && enhancedPrompts[index]) {
        updatedMetadata.enhanced_prompt = enhancedPrompts[index];
        hasChanges = true;
      }

      // Assign base_prompt (singular - the default/base prompt used for all pairs)
      if (basePrompt) {
        updatedMetadata.base_prompt = basePrompt;
        hasChanges = true;
      }

      // Skip update if no changes
      if (!hasChanges) {
        console.log(`${LOG_PREFIX} Skipping shot_generation ${sg.id.substring(0, 8)} (no non-empty values to update)`);
        return { id: sg.id, success: true, skipped: true };
      }

      console.log(`${LOG_PREFIX} Updating shot_generation ${sg.id.substring(0, 8)}:`, {
        index,
        timeline_frame: sg.timeline_frame,
        pair_prompt: updatedMetadata.pair_prompt?.substring(0, 50) || '(none)',
        pair_negative_prompt: updatedMetadata.pair_negative_prompt?.substring(0, 50) || '(none)',
        enhanced_prompt: updatedMetadata.enhanced_prompt?.substring(0, 50) || '(none)',
        base_prompt: updatedMetadata.base_prompt?.substring(0, 50) || '(none)',
      });

      // Update the shot_generation
      const { error: updateError } = await supabaseAdmin
        .from("shot_generations")
        .update({ metadata: updatedMetadata })
        .eq("id", sg.id);

      if (updateError) {
        console.error(`${LOG_PREFIX} Error updating shot_generation ${sg.id}:`, updateError);
        return { id: sg.id, success: false, error: updateError.message };
      }

      return { id: sg.id, success: true };
    });

    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log(`${LOG_PREFIX} Update complete:`, {
      total: results.length,
      success: successCount,
      failed: failedCount,
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Updated ${successCount} shot_generation(s) with pair prompts`,
      updated_count: successCount,
      failed_count: failedCount,
      shot_id: shotId,
      task_id: task_id,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
});

