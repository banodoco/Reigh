// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest, verifyShotOwnership } from "../_shared/auth.ts";
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
  const { shot_id, enhanced_prompts } = requestBody;
  if (!shot_id) {
    return new Response("Missing required field: shot_id", { status: 400 });
  }
  if (!enhanced_prompts || !Array.isArray(enhanced_prompts)) {
    return new Response("Missing or invalid required field: enhanced_prompts (must be array)", { status: 400 });
  }

  try {
    // Verify shot ownership if user token
    if (!isServiceRole && callerId) {
      const ownershipResult = await verifyShotOwnership(
        supabaseAdmin, 
        shot_id, 
        callerId, 
        LOG_PREFIX
      );

      if (!ownershipResult.success) {
        return new Response(ownershipResult.error || "Forbidden", { 
          status: ownershipResult.statusCode || 403 
        });
      }

      console.log(`${LOG_PREFIX} Shot ownership verified for user ${callerId}`);
    }

    console.log(`${LOG_PREFIX} Processing shot ${shot_id}:`, {
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
      console.error(`${LOG_PREFIX} Error fetching shot_generations:`, sgError);
      return new Response(`Database error: ${sgError.message}`, { status: 500 });
    }

    if (!shotGenerations || shotGenerations.length === 0) {
      console.warn(`${LOG_PREFIX} No shot_generations found for shot ${shot_id}`);
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

    // Verify enhanced_prompts count matches image count
    if (enhanced_prompts.length !== imageGenerations.length) {
      console.warn(`${LOG_PREFIX} ⚠️ Enhanced prompts count mismatch:`, {
        imageCount: imageGenerations.length,
        enhancedPromptsCount: enhanced_prompts.length,
        warning: 'The number of enhanced_prompts should equal imageCount for proper mapping'
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

    // Update each shot_generation's metadata with the corresponding enhanced_prompt
    // Image at index i gets enhanced_prompts[i]
    const updatePromises = imageGenerations.map(async (sg, index) => {
      // Get existing metadata or create new object
      const existingMetadata = sg.metadata || {};
      
      // Check if we have an enhanced_prompt for this index
      const enhancedPrompt = index < enhanced_prompts.length ? enhanced_prompts[index] : undefined;
      
      // Skip if enhanced_prompt is empty/falsy
      if (!enhancedPrompt) {
        console.log(`${LOG_PREFIX} Skipping shot_generation ${sg.id.substring(0, 8)} at index ${index} (empty enhanced_prompt)`);
        return { id: sg.id, success: true, skipped: true };
      }

      // Build updated metadata with enhanced_prompt
      const updatedMetadata = {
        ...existingMetadata,
        enhanced_prompt: enhancedPrompt,
      };

      console.log(`${LOG_PREFIX} Updating shot_generation ${sg.id.substring(0, 8)}:`, {
        index,
        timeline_frame: sg.timeline_frame,
        enhanced_prompt: enhancedPrompt.substring(0, 100) + (enhancedPrompt.length > 100 ? '...' : ''),
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
      message: `Updated ${successCount} shot_generation(s) with enhanced prompts`,
      updated_count: successCount,
      failed_count: failedCount,
      shot_id: shot_id,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
});

