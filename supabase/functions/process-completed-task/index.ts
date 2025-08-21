import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
});

/**
 * Safely extracts UUID from JSONB value
 */
function extractUuidFromJsonb(value: any): string | null {
  if (!value) return null;
  
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
 * Validates UUID format
 */
function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Normalizes image paths by removing server IP addresses
 */
function normalizeImagePath(imagePath: any): any {
  if (!imagePath) return imagePath;
  
  const localServerPattern = /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/;
  if (localServerPattern.test(imagePath)) {
    const url = new URL(imagePath);
    return url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
  }
  return imagePath;
}

/**
 * Recursively normalizes image paths in objects/arrays
 */
function normalizeImagePathsInObject(obj: any): any {
  if (typeof obj === 'string') {
    if (obj.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) || obj.includes('/files/')) {
      return normalizeImagePath(obj);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeImagePathsInObject(item));
  }
  
  if (obj && typeof obj === 'object') {
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[key] = normalizeImagePathsInObject(value);
    }
    return normalized;
  }
  
  return obj;
}

/**
 * Processes completed travel_stitch tasks
 */
async function processCompletedStitchTask(task: any) {
  console.log(`[ProcessTask] Processing completed travel_stitch task ${task.id}`);
  
  // Normalize image paths in task params
  const normalizedParams = normalizeImagePathsInObject(task.params);
  
  // Safely extract shot_id with JSONB handling
  const rawShotId = normalizedParams?.full_orchestrator_payload?.shot_id;
  const shotIdString = extractUuidFromJsonb(rawShotId);
  
  let outputLocation = task.output_location;
  const projectId = task.project_id;

  // Validate shot_id format if present
  if (shotIdString && !isValidUuid(shotIdString)) {
    console.warn(`[ProcessTask] Invalid shot_id format for task ${task.id}: ${shotIdString}`);
    // Continue without shot_id rather than failing entirely
  }

  const validShotId = (shotIdString && isValidUuid(shotIdString)) ? shotIdString : null;

  // Keep full public URL. No more host-stripping since proxy server removed.
  if (!outputLocation || !projectId) {
    console.error(`[ProcessTask] Missing critical data for task ${task.id}`, {
      shotId: validShotId,
      outputLocation,
      projectId
    });
    return;
  }

  try {
    // Create generation record
    const newGenerationId = crypto.randomUUID();
    
    const generationParams: any = {
      type: 'travel_stitch',
      projectId,
      outputLocation,
      originalParams: normalizedParams,
      tool_type: 'travel-between-images'
    };

    // Only add shotId if it's valid
    if (validShotId) {
      generationParams.shotId = validShotId;
    }

    const { error: insertError } = await supabase.from('generations').insert({
      id: newGenerationId,
      tasks: [task.id],
      params: generationParams,
      location: outputLocation,
      type: 'video',
      project_id: projectId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (insertError) {
      console.error(`[ProcessTask] Error inserting generation:`, insertError);
      return;
    }

    // Only create shot_generation link if we have a valid shot_id
    if (validShotId) {
      console.log(`[ProcessTask] Creating shot_generation link for shot ${validShotId}`);
      const { error: shotGenError } = await supabase.from('shot_generations').insert({
        shot_id: validShotId,
        generation_id: newGenerationId,
        position: 0
      });

      if (shotGenError) {
        console.error(`[ProcessTask] Error creating shot_generation:`, shotGenError);
        // Don't return here - generation was created successfully
      }
    } else {
      console.log(`[ProcessTask] No valid shot_id for task ${task.id}, skipping shot_generation link`);
    }

    // Mark task as processed
    const { error: updateError } = await supabase.from('tasks').update({
      params: normalizedParams,
      generation_created: true
    }).eq('id', task.id);

    if (updateError) {
      console.error(`[ProcessTask] Error updating task:`, updateError);
      return;
    }

    console.log(`[ProcessTask] Successfully processed task ${task.id}, created generation ${newGenerationId}`);
  } catch (error) {
    console.error(`[ProcessTask] Error processing travel_stitch task ${task.id}:`, error);
  }
}

/**
 * Processes completed single_image tasks
 */
async function processCompletedSingleImageTask(task: any) {
  console.log(`[ProcessTask] Processing completed single_image task ${task.id}`);
  
  // Determine output location
  let outputLocation = task.output_location;
  const params = task.params || {};

  if (!outputLocation) {
    outputLocation = params?.output_location || params?.outputLocation || params?.image_url || params?.imageUrl;
  }

  if (!outputLocation) {
    console.error(`[ProcessTask] No output location found for task ${task.id}`);
    return;
  }

  // Keep full public URL – client now fetches directly from Supabase Storage
  try {
    // Create generation record
    const newGenerationId = crypto.randomUUID();
    
    const { error: insertError } = await supabase.from('generations').insert({
      id: newGenerationId,
      tasks: [task.id],
      params: {
        prompt: params?.orchestrator_details?.prompt || '',
        seed: params?.orchestrator_details?.seed,
        model: params?.orchestrator_details?.model,
        resolution: params?.orchestrator_details?.resolution,
        source: 'wan_single_image_task'
      },
      location: outputLocation,
      type: 'image',
      project_id: task.project_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (insertError) {
      console.error(`[ProcessTask] Error inserting generation:`, insertError);
      return;
    }

    // Check if there's an associated shot - with safe JSONB extraction
    const rawShotId = params?.shot_id;
    const shotIdString = extractUuidFromJsonb(rawShotId);
    
    if (shotIdString && isValidUuid(shotIdString)) {
      console.log(`[ProcessTask] Creating shot_generation link for shot ${shotIdString}`);
      
      // Create shot_generation link with NULL position
      const { error: shotGenError } = await supabase.from('shot_generations').insert({
        shot_id: shotIdString,
        generation_id: newGenerationId,
        position: null
      });

      if (shotGenError) {
        console.error(`[ProcessTask] Error creating shot_generation:`, shotGenError);
        // Don't return here - generation was created successfully, just log the error
      }
    } else if (rawShotId) {
      console.warn(`[ProcessTask] Invalid shot_id format for task ${task.id}: ${rawShotId}`);
    }

    // Mark task as processed
    const { error: updateError } = await supabase.from('tasks').update({
      generation_created: true
    }).eq('id', task.id);

    if (updateError) {
      console.error(`[ProcessTask] Error updating task:`, updateError);
      return;
    }

    console.log(`[ProcessTask] Successfully processed task ${task.id}, created generation ${newGenerationId}`);
  } catch (error) {
    console.error(`[ProcessTask] Error processing single_image task ${task.id}:`, error);
  }
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { task_id } = await req.json();
    if (!task_id) {
      return new Response('Missing task_id', { status: 400 });
    }

    console.log(`[ProcessTask] Processing task ${task_id}`);

    // Fetch task details
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', task_id)
      .eq('status', 'Complete')
      .eq('generation_created', false)
      .single();

    if (taskError || !task) {
      console.log(`[ProcessTask] Task ${task_id} not found or not ready for processing`);
      return new Response('Task not found or already processed', { status: 404 });
    }

    // Process based on task type
    if (task.task_type === 'travel_stitch') {
      await processCompletedStitchTask(task);
    } else if (task.task_type === 'single_image') {
      await processCompletedSingleImageTask(task);
    } else {
      console.log(`[ProcessTask] Unsupported task type: ${task.task_type}`);
      return new Response('Unsupported task type', { status: 400 });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[ProcessTask] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
