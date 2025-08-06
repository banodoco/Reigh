/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Map of common aspect ratios to fixed resolutions (duplicated from src/shared/lib/aspectRatios.ts)
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
  // Legacy key for backwards compatibility
  "Square": "670x670",
};

const DEFAULT_ASPECT_RATIO = "1:1";

// Initialize Supabase client using service role (full access) key automatically injected at runtime.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      persistSession: false,
    },
  },
);

interface SingleImageRequestBody {
  project_id: string;
  prompt: string;
  negative_prompt?: string;
  resolution?: string; // e.g., "512x512"
  model_name?: string;
  seed?: number;
  loras?: Array<{ path: string; strength: number }>;
  shot_id?: string; // Optional: associate generated image with a shot
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

  let body: SingleImageRequestBody;
  try {
    body = await req.json();
  } catch (err) {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  console.log("[single-image-generate] Payload:", body);

  // Basic validation
  if (!body.project_id) {
    return jsonResponse({ error: "project_id is required" }, 400);
  }
  if (!body.prompt || body.prompt.trim() === "") {
    return jsonResponse({ error: "prompt is required" }, 400);
  }

  try {
    // 1. Determine resolution
    let finalResolution: string | undefined = body.resolution?.trim();
    if (!finalResolution) {
      // Fetch project aspect ratio
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("aspect_ratio")
        .eq("id", body.project_id)
        .single();

      if (projectError) {
        console.warn("[single-image-generate] Project fetch error:", projectError.message);
      }

      const aspectRatioKey: string | undefined = project?.aspect_ratio ?? DEFAULT_ASPECT_RATIO;
      finalResolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatioKey] ?? ASPECT_RATIO_TO_RESOLUTION[DEFAULT_ASPECT_RATIO];
    }

    // 2. Convert loras array to mapping expected by orchestrator
    const additionalLoras: Record<string, number> | undefined = body.loras?.length
      ? body.loras.reduce<Record<string, number>>((acc, lora) => {
          acc[lora.path] = lora.strength;
          return acc;
        }, {})
      : undefined;

    // 3. Build orchestrator payload (fairly lean; heavy lifting happens downstream)
    const runId = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const taskId = `single_image_${runId.substring(2, 10)}_${crypto.randomUUID().slice(0, 6)}`;

    const orchestratorPayload: Record<string, unknown> = {
      run_id: runId,
      prompt: body.prompt,
      model: body.model_name ?? "vace_14B",
      resolution: finalResolution,
      seed: body.seed ?? 11111,
      negative_prompt: body.negative_prompt ?? "",
      use_causvid_lora: true,
    };

    if (additionalLoras) {
      orchestratorPayload.additional_loras = additionalLoras;
    }

    // 4. Insert task row
    const { data: insertedTask, error: insertError } = await supabase
      .from("tasks")
      .insert({
        project_id: body.project_id,
        task_type: "single_image",
        params: {
          orchestrator_details: orchestratorPayload,
          task_id: taskId,
          ...(body.shot_id ? { shot_id: body.shot_id } : {}),
        },
        status: "Queued",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[single-image-generate] DB insert failed:", insertError.message);
      return jsonResponse({ error: "Failed to create task", details: insertError.message }, 500);
    }

    console.log("[single-image-generate] Task created with ID", insertedTask.id);

    // 5. Response
    return jsonResponse(insertedTask, 201);
  } catch (err: any) {
    console.error("[single-image-generate] Unexpected error:", err?.message);
    return jsonResponse({ error: "Internal server error", details: err?.message }, 500);
  }
}); 