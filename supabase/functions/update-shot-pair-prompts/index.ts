// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest, verifyShotOwnership } from "../_shared/auth.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: update-shot-pair-prompts
 * 
 * Updates the shot_generations.metadata.enhanced_prompt field for all positioned
 * images in a shot with the provided enhanced prompts array.
 * 
 * POST /functions/v1/update-shot-pair-prompts
 * Headers: Authorization: Bearer <Service Role Key or PAT>
 * Body: {
 *   "shot_id": "uuid-string",           // Shot ID to update
 *   "task_id": "uuid-string",           // Optional: Task ID for log association
 *   "enhanced_prompts": [               // Array of enhanced prompts (one per image)
 *     "Detailed VLM description...",
 *     "",                               // Empty strings are skipped
 *     "Another description..."
 *   ]
 * }
 * 
 * Returns:
 * - 200 OK with updated shot_generations count
 * - 400 Bad Request if missing required fields
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if user doesn't own the shot
 * - 404 Not Found if shot doesn't exist
 * - 500 Internal Server Error
 */

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey || !supabaseUrl) {
    console.error("[UPDATE-SHOT-PAIR-PROMPTS] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  
  // Create logger (task_id will be set after parsing body)
  const logger = new SystemLogger(supabaseAdmin, 'update-shot-pair-prompts');

  // Only accept POST requests
  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return new Response("Method not allowed", { status: 405 });
  }

  // Authenticate request using shared utility
  const auth = await authenticateRequest(req, supabaseAdmin, "[UPDATE-SHOT-PAIR-PROMPTS]");
  
  if (!auth.success) {
    logger.error("Authentication failed", { error: auth.error });
    await logger.flush();
    return new Response(auth.error || "Authentication failed", { 
      status: auth.statusCode || 403 
    });
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  logger.info("Authenticated", {
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
    logger.error("Invalid JSON body");
    await logger.flush();
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Validate required fields
  const { shot_id, task_id, enhanced_prompts } = requestBody;
  
  // Set task_id for all subsequent logs if provided
  if (task_id) {
    logger.setDefaultTaskId(task_id);
    logger.info("Task ID associated with request", { task_id, shot_id });
  }
  
  if (!shot_id) {
    logger.error("Missing required field: shot_id");
    await logger.flush();
    return new Response("Missing required field: shot_id", { status: 400 });
  }
  if (!enhanced_prompts || !Array.isArray(enhanced_prompts)) {
    logger.error("Missing or invalid required field: enhanced_prompts", { 
      shot_id,
      hasEnhancedPrompts: !!enhanced_prompts,
      isArray: Array.isArray(enhanced_prompts)
    });
    await logger.flush();
    return new Response("Missing or invalid required field: enhanced_prompts (must be array)", { status: 400 });
  }

  try {
    // Verify shot ownership if user token
    if (!isServiceRole && callerId) {
      const ownershipResult = await verifyShotOwnership(
        supabaseAdmin, 
        shot_id, 
        callerId, 
        "[UPDATE-SHOT-PAIR-PROMPTS]"
      );

      if (!ownershipResult.success) {
        logger.error("Shot ownership verification failed", {
          shot_id,
          userId: callerId,
          error: ownershipResult.error
        });
        await logger.flush();
        return new Response(ownershipResult.error || "Forbidden", { 
          status: ownershipResult.statusCode || 403 
        });
      }

      logger.info("Shot ownership verified", { shot_id, userId: callerId });
    }

    logger.info("Processing shot", {
      shot_id,
      enhancedPromptsCount: enhanced_prompts.length,
    });

    // Get all shot_generations for this shot, filtering for images with timeline_frame
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
      .eq("shot_id", shot_id)
      .not("timeline_frame", "is", null)
      .order("timeline_frame", { ascending: true });

    if (sgError) {
      logger.error("Error fetching shot_generations", { 
        shot_id, 
        error: sgError.message 
      });
      await logger.flush();
      return new Response(`Database error: ${sgError.message}`, { status: 500 });
    }

    if (!shotGenerations || shotGenerations.length === 0) {
      logger.warn("No shot_generations found for shot", { shot_id });
      await logger.flush();
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

    logger.info("Found shot_generations", {
      shot_id,
      totalCount: shotGenerations.length,
      imageCount: imageGenerations.length,
      firstFewIds: imageGenerations.slice(0, 3).map(sg => sg.id.substring(0, 8)),
      firstFewFrames: imageGenerations.slice(0, 3).map(sg => sg.timeline_frame),
    });

    // Verify enhanced_prompts count matches expected (N-1 for N images, since prompts describe transitions)
    const expectedPromptCount = Math.max(0, imageGenerations.length - 1);
    if (enhanced_prompts.length !== expectedPromptCount) {
      logger.warn("Enhanced prompts count differs from expected", {
        shot_id,
        imageCount: imageGenerations.length,
        expectedPromptCount,
        actualPromptCount: enhanced_prompts.length,
        note: 'Enhanced prompts describe transitions between images (N-1 prompts for N images)'
      });
    }

    if (imageGenerations.length === 0) {
      logger.info("No image generations found for shot", { shot_id });
      await logger.flush();
      return new Response(JSON.stringify({
        success: true,
        message: "No image generations found for this shot",
        updated_count: 0,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Update each shot_generation's metadata with the corresponding enhanced_prompt
    // Image at index i gets enhanced_prompts[i] (describes transition FROM this image TO the next)
    const updatePromises = imageGenerations.map(async (sg, index) => {
      // Get existing metadata or create new object
      const existingMetadata = sg.metadata || {};
      
      // Check if we have an enhanced_prompt for this index
      const enhancedPrompt = index < enhanced_prompts.length ? enhanced_prompts[index] : undefined;
      
      // Skip if enhanced_prompt is empty/falsy (expected for last image)
      if (!enhancedPrompt) {
        logger.debug("Skipping shot_generation (no prompt for this index)", {
          shot_id,
          shotGenerationId: sg.id.substring(0, 8),
          index,
          timeline_frame: sg.timeline_frame,
          reason: index >= enhanced_prompts.length ? 'last_image_no_transition' : 'empty_prompt'
        });
        return { id: sg.id, success: true, skipped: true };
      }

      // Build updated metadata with enhanced_prompt
      const updatedMetadata = {
        ...existingMetadata,
        enhanced_prompt: enhancedPrompt,
      };

      logger.debug("Updating shot_generation with enhanced_prompt", {
        shot_id,
        shotGenerationId: sg.id.substring(0, 8),
        index,
        timeline_frame: sg.timeline_frame,
        promptPreview: enhancedPrompt.substring(0, 80) + (enhancedPrompt.length > 80 ? '...' : ''),
      });

      // Update the shot_generation
      const { error: updateError } = await supabaseAdmin
        .from("shot_generations")
        .update({ metadata: updatedMetadata })
        .eq("id", sg.id);

      if (updateError) {
        logger.error("Error updating shot_generation", {
          shot_id,
          shotGenerationId: sg.id.substring(0, 8),
          error: updateError.message
        });
        return { id: sg.id, success: false, error: updateError.message };
      }

      return { id: sg.id, success: true };
    });

    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const skippedCount = results.filter(r => (r as any).skipped).length;

    logger.info("Update complete", {
      shot_id,
      total: results.length,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
    });

    await logger.flush();
    
    return new Response(JSON.stringify({
      success: true,
      message: `Updated ${successCount - skippedCount} shot_generation(s) with enhanced prompts`,
      updated_count: successCount - skippedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      shot_id: shot_id,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    logger.critical("Unexpected error", { 
      shot_id, 
      error: error?.message || String(error) 
    });
    await logger.flush();
    return new Response(`Internal server error: ${error?.message || 'Unknown error'}`, { status: 500 });
  }
});
