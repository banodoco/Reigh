/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Map of common aspect ratios to fixed resolutions
const ASPECT_RATIO_TO_RESOLUTION: Record<string, string> = {
  "21:9": "1024x438",
  "16:9": "902x508",
  "4:3": "768x576",
  "3:2": "768x512",
  "1:1": "670x670",
  "2:3": "512x768",
  "3:4": "576x768",
  "9:16": "508x902",
  "9:21": "438x1024",
  "Square": "670x670",
};

const DEFAULT_ASPECT_RATIO = "1:1";

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      persistSession: false,
    },
  },
);

interface TravelRequestBody {
  project_id: string;
  shot_id?: string;
  image_urls: string[];
  base_prompts: string[];
  negative_prompts?: string[];
  segment_frames: number[];
  frame_overlap: number[];
  resolution?: string;
  model_name?: string;
  seed?: number;
  debug?: boolean;
  apply_reward_lora?: boolean;
  colour_match_videos?: boolean;
  apply_causvid?: boolean;
  use_lighti2x_lora?: boolean;
  fade_in_duration?: any;
  fade_out_duration?: any;
  after_first_post_generation_saturation?: number;
  after_first_post_generation_brightness?: number;
  params_json_str?: string;
  main_output_dir_for_run?: string;
  enhance_prompt?: boolean;
  openai_api_key?: string;
  loras?: Array<{ path: string; strength: number }>;
  show_input_images?: boolean;
}

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

serve(async (req) => {
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: TravelRequestBody;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  console.log("[steerable-motion] Payload:", body);

  // Basic validation
  if (!body.project_id) {
    return jsonResponse({ error: "project_id is required" }, 400);
  }
  if (!body.image_urls || body.image_urls.length === 0) {
    return jsonResponse({ error: "At least one image_url is required" }, 400);
  }
  if (!body.base_prompts || body.base_prompts.length === 0) {
    return jsonResponse({ error: "base_prompts is required (at least one prompt)" }, 400);
  }
  if (!body.segment_frames || body.segment_frames.length === 0) {
    return jsonResponse({ error: "segment_frames is required" }, 400);
  }
  if (!body.frame_overlap || body.frame_overlap.length === 0) {
    return jsonResponse({ error: "frame_overlap is required" }, 400);
  }

  try {
    // Generate IDs & run meta
    const runId = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const orchestratorTaskId = `sm_travel_orchestrator_${runId.substring(2, 10)}_${crypto.randomUUID().slice(0, 6)}`;

    // Determine resolution
    let finalResolution: string | undefined = body.resolution?.trim();
    if (!finalResolution) {
      // Fetch project aspect ratio
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("aspect_ratio")
        .eq("id", body.project_id)
        .single();

      if (projectError) {
        console.warn("[steerable-motion] Project fetch error:", projectError.message);
      }

      const aspectRatioKey: string | undefined = project?.aspect_ratio ?? DEFAULT_ASPECT_RATIO;
      finalResolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatioKey] ?? ASPECT_RATIO_TO_RESOLUTION[DEFAULT_ASPECT_RATIO];
    }

    const numSegments = Math.max(1, body.image_urls.length - 1);
    // Allow single image video generation by ensuring at least 1 segment

    // Expand arrays if they have a single element and numSegments > 1
    const expandArray = (arr: any[] | undefined, count: number) => {
      if (arr && arr.length === 1 && count > 1) {
        return Array(count).fill(arr[0]);
      }
      return arr;
    };

    const basePromptsExpanded = expandArray(body.base_prompts, numSegments) || [];
    const negativePromptsExpanded = expandArray(body.negative_prompts, numSegments) || Array(numSegments).fill("");
    const segmentFramesExpanded = expandArray(body.segment_frames, numSegments) || [];
    const frameOverlapExpanded = expandArray(body.frame_overlap, numSegments) || [];

    // Build orchestrator payload
    const orchestratorPayload: Record<string, unknown> = {
      orchestrator_task_id: orchestratorTaskId,
      run_id: runId,
      input_image_paths_resolved: body.image_urls,
      num_new_segments_to_generate: numSegments,
      base_prompts_expanded: basePromptsExpanded,
      negative_prompts_expanded: negativePromptsExpanded,
      segment_frames_expanded: segmentFramesExpanded,
      frame_overlap_expanded: frameOverlapExpanded,
      parsed_resolution_wh: finalResolution,
      model_name: body.model_name ?? "vace_14B",
      seed_base: body.seed ?? 789,
      apply_reward_lora: body.apply_reward_lora ?? false,
      colour_match_videos: body.colour_match_videos ?? true,
      apply_causvid: body.apply_causvid ?? true,
      use_lighti2x_lora: body.use_lighti2x_lora ?? false,
      fade_in_params_json_str: typeof body.fade_in_duration === "object" && body.fade_in_duration !== null
        ? JSON.stringify(body.fade_in_duration)
        : body.fade_in_duration ?? '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
      fade_out_params_json_str: typeof body.fade_out_duration === "object" && body.fade_out_duration !== null
        ? JSON.stringify(body.fade_out_duration)
        : body.fade_out_duration ?? '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
      after_first_post_generation_saturation: body.after_first_post_generation_saturation ?? 1,
      after_first_post_generation_brightness: body.after_first_post_generation_brightness ?? 0,
      params_json_str_override: typeof body.params_json_str === "object" && body.params_json_str !== null
        ? JSON.stringify(body.params_json_str)
        : body.params_json_str ?? '{"steps":4}',
      debug_mode_enabled: body.debug ?? true,
      shot_id: body.shot_id ?? undefined,
      main_output_dir_for_run: body.main_output_dir_for_run ?? "./outputs/default_travel_output",
      enhance_prompt: body.enhance_prompt ?? false,
      openai_api_key: body.openai_api_key ?? "",
      show_input_images: body.show_input_images ?? false,
    };

    // Attach additional_loras mapping if provided
    if (body.loras && body.loras.length > 0) {
      const additionalLoras: Record<string, number> = body.loras.reduce<Record<string, number>>((acc, lora) => {
        acc[lora.path] = lora.strength;
        return acc;
      }, {});
      orchestratorPayload.additional_loras = additionalLoras;
    }

    // Insert task row
    const { data: insertedTask, error: insertError } = await supabase
      .from("tasks")
      .insert({
        project_id: body.project_id,
        task_type: "travel_orchestrator",
        params: {
          orchestrator_details: orchestratorPayload,
          task_id: orchestratorTaskId,
        },
        status: "Queued",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[steerable-motion] DB insert failed:", insertError.message);
      return jsonResponse({ error: "Failed to create task", details: insertError.message }, 500);
    }

    console.log("[steerable-motion] Task created with ID", insertedTask.id);

    // Response
    return jsonResponse(insertedTask, 201);
  } catch (err: any) {
    console.error("[steerable-motion] Unexpected error:", err?.message);
    return jsonResponse({ error: "Internal server error", details: err?.message }, 500);
  }
}); 