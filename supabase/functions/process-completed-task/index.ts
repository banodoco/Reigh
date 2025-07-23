import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

/**
 * Normalizes image paths by removing server IP addresses
 */
function normalizeImagePath(imagePath: string): string {
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
    return obj.map(item => normalizeImagePathsInObject(item));
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
async function processCompletedStitchTask(task: any): Promise<void> {
  console.log(`[ProcessTask] Processing completed travel_stitch task ${task.id}`);
  
  // Normalize image paths in task params
  const normalizedParams = normalizeImagePathsInObject(task.params);
  const shotId = normalizedParams?.full_orchestrator_payload?.shot_id;
  let outputLocation = task.output_location;
  const projectId = task.project_id;

  // Keep full public URL. No more host-stripping since proxy server removed.

  if (!shotId || !outputLocation || !projectId) {
    console.error(`[ProcessTask] Missing critical data for task ${task.id}`, { 
      shotId, 
      outputLocation, 
      projectId 
    });
    return;
  }
  
  try {
    // Create generation record
    const newGenerationId = crypto.randomUUID();
    
    const { error: insertError } = await supabase
      .from('generations')
      .insert({
        id: newGenerationId,
        tasks: [task.id],
        params: {
          type: 'travel_stitch',
          shotId,
          projectId,
          outputLocation,
          originalParams: normalizedParams,
          tool_type: 'travel-between-images',
        },
        location: outputLocation,
        type: 'video',
        project_id: projectId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`[ProcessTask] Error inserting generation:`, insertError);
      return;
    }

    // Create shot_generation link
    const { error: shotGenError } = await supabase
      .from('shot_generations')
      .insert({
        shot_id: shotId,
        generation_id: newGenerationId,
        position: 0,
      });

    if (shotGenError) {
      console.error(`[ProcessTask] Error creating shot_generation:`, shotGenError);
      return;
    }

    // Mark task as processed
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        params: normalizedParams,
        generation_created: true,
      })
      .eq('id', task.id);

    if (updateError) {
      console.error(`[ProcessTask] Error updating task:`, updateError);
      return;
    }

    console.log(`[ProcessTask] Successfully processed task ${task.id}, created generation ${newGenerationId}`);

    // Removed duplicate manual broadcasts – realtime messages now sent exclusively via DB triggers.

  } catch (error) {
    console.error(`[ProcessTask] Error processing travel_stitch task ${task.id}:`, error);
  }
}

/**
 * Processes completed single_image tasks
 */
async function processCompletedSingleImageTask(task: any): Promise<void> {
  console.log(`[ProcessTask] Processing completed single_image task ${task.id}`);

  // Determine output location
  let outputLocation = task.output_location;
  const params = task.params || {};
  
  if (!outputLocation) {
    outputLocation = params?.output_location || params?.outputLocation || 
                    params?.image_url || params?.imageUrl;
  }

  if (!outputLocation) {
    console.error(`[ProcessTask] No output location found for task ${task.id}`);
    return;
  }

  // Keep full public URL – client now fetches directly from Supabase Storage

  try {
    // Create generation record
    const newGenerationId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('generations')
      .insert({
        id: newGenerationId,
        tasks: [task.id],
        params: {
          prompt: params?.orchestrator_details?.prompt || '',
          seed: params?.orchestrator_details?.seed,
          model: params?.orchestrator_details?.model,
          resolution: params?.orchestrator_details?.resolution,
          source: 'wan_single_image_task',
          tool_type: 'image-generation',
        },
        location: outputLocation,
        type: 'image',
        project_id: task.project_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`[ProcessTask] Error inserting generation:`, insertError);
      return;
    }

    // Check if there's an associated shot
    const shotId = params?.shot_id;
    if (shotId) {
      console.log(`[ProcessTask] Creating shot_generation link for shot ${shotId}`);
      
      // Create shot_generation link with NULL position
      const { error: shotGenError } = await supabase
        .from('shot_generations')
        .insert({
          shot_id: shotId,
          generation_id: newGenerationId,
          position: null, // NULL position as requested
        });

      if (shotGenError) {
        console.error(`[ProcessTask] Error creating shot_generation:`, shotGenError);
        // Don't return here - generation was created successfully, just log the error
      }
    }

    // Mark task as processed
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ generation_created: true })
      .eq('id', task.id);

    if (updateError) {
      console.error(`[ProcessTask] Error updating task:`, updateError);
      return;
    }

    console.log(`[ProcessTask] Successfully processed task ${task.id}, created generation ${newGenerationId}`);

    // Realtime broadcasts happen via database triggers; no manual broadcast needed.

  } catch (error) {
    console.error(`[ProcessTask] Error processing single_image task ${task.id}:`, error);
  }
}

// broadcastUpdate helper removed (duplicate of DB trigger broadcast)

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