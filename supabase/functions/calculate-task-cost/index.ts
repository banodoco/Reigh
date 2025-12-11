// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
    }
  });
}

// Calculate cost based on billing type and task configuration
function calculateTaskCost(
  billingType: string,
  baseCostPerSecond: number,
  unitCost: number,
  durationSeconds: number,
  costFactors: any,
  taskParams: any
): number {
  let totalCost;
  if (billingType === 'per_unit') {
    totalCost = unitCost || 0;
  } else {
    totalCost = baseCostPerSecond * durationSeconds;
  }

  // Apply cost factors regardless of billing type
  if (costFactors) {
    if (costFactors.resolution && taskParams.resolution) {
      const resolutionMultiplier = costFactors.resolution[taskParams.resolution] || 1;
      totalCost *= resolutionMultiplier;
    }
    if (costFactors.frameCount && taskParams.frame_count) {
      if (billingType === 'per_unit') {
        totalCost += costFactors.frameCount * taskParams.frame_count;
      } else {
        totalCost += costFactors.frameCount * taskParams.frame_count * durationSeconds;
      }
    }
    if (costFactors.modelType && taskParams.model_type) {
      const modelMultiplier = costFactors.modelType[taskParams.model_type] || 1;
      totalCost *= modelMultiplier;
    }
  }

  return Math.round(totalCost * 1000) / 1000;
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    console.error("[CALCULATE-TASK-COST] Missing required environment variables");
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Create logger (task_id will be set after parsing body)
  const logger = new SystemLogger(supabaseAdmin, 'calculate-task-cost');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (req.method !== 'POST') {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { task_id } = await req.json();

    if (!task_id) {
      logger.error("Missing task_id in request");
      await logger.flush();
      return jsonResponse({ error: 'task_id is required' }, 400);
    }

    // Set task_id for all subsequent logs
    logger.setDefaultTaskId(task_id);
    logger.info("Calculating task cost", { task_id });

    // Get task details
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select(`
        id,
        task_type,
        params,
        status,
        generation_started_at,
        generation_processed_at,
        project_id,
        projects(user_id)
      `)
      .eq('id', task_id)
      .single();

    if (taskError || !task) {
      logger.error("Task not found", { error: taskError?.message });
      await logger.flush();
      return jsonResponse({ error: 'Task not found' }, 404);
    }

    logger.debug("Task found", { 
      task_type: task.task_type, 
      status: task.status,
      has_timestamps: !!(task.generation_started_at && task.generation_processed_at)
    });

    // Check if task has both start and end times
    if (!task.generation_started_at || !task.generation_processed_at) {
      logger.error("Missing timestamps", { 
        has_started_at: !!task.generation_started_at, 
        has_processed_at: !!task.generation_processed_at 
      });
      await logger.flush();
      return jsonResponse({
        error: 'Task must have both generation_started_at and generation_processed_at timestamps'
      }, 400);
    }

    // Check if task is a sub-task of an orchestrator - skip billing if so (parent will be billed)
    // Check multiple possible paths where orchestrator reference might be stored
    // Must match the paths checked by extractOrchestratorTaskId in complete_task
    const orchestratorRef = task.params?.orchestrator_task_id_ref || 
                            task.params?.orchestrator_details?.orchestrator_task_id ||
                            task.params?.originalParams?.orchestrator_details?.orchestrator_task_id ||
                            task.params?.orchestrator_task_id;
    // IMPORTANT: Don't skip if the task references ITSELF as the orchestrator!
    // This happens for orchestrator tasks (like join_clips_orchestrator) that store their own
    // task ID in params.orchestrator_details.orchestrator_task_id for sub-tasks to reference.
    if (orchestratorRef && orchestratorRef !== task.id) {
      logger.info("Skipping cost calculation (sub-task)", { 
        orchestrator_task_id: orchestratorRef 
      });
      await logger.flush();
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'Task is sub-task of orchestrator, parent task will be billed',
        orchestrator_task_id: orchestratorRef,
        task_id: task.id
      });
    }

    // Check if this is an orchestrator task - calculate cost based on sub-task durations
    // Sub-tasks can reference their orchestrator via multiple param paths:
    // - params.orchestrator_task_id_ref (travel_segment)
    // - params.orchestrator_details.orchestrator_task_id (join_clips_segment)
    // - params.originalParams.orchestrator_details.orchestrator_task_id (individual_travel_segment legacy)
    // - params.orchestrator_task_id (some legacy tasks)
    const { data: subTasks, error: subTasksError } = await supabaseAdmin
      .from('tasks')
      .select(`
        id,
        generation_started_at,
        generation_processed_at,
        status
      `)
      .or(`params->>orchestrator_task_id_ref.eq.${task_id},params->orchestrator_details->>orchestrator_task_id.eq.${task_id},params->originalParams->orchestrator_details->>orchestrator_task_id.eq.${task_id},params->>orchestrator_task_id.eq.${task_id}`)
      .eq('status', 'Complete');

    let durationSeconds;
    if (subTasks && subTasks.length > 0) {
      // This is an orchestrator task with sub-tasks - sum their durations
      logger.info("Orchestrator task detected", { sub_task_count: subTasks.length });

      let totalSubTaskDuration = 0;
      for (const subTask of subTasks) {
        if (subTask.generation_started_at && subTask.generation_processed_at) {
          const subStartTime = new Date(subTask.generation_started_at);
          const subEndTime = new Date(subTask.generation_processed_at);
          const subDuration = Math.max(1, Math.ceil((subEndTime.getTime() - subStartTime.getTime()) / 1000));
          totalSubTaskDuration += subDuration;
        }
      }

      durationSeconds = totalSubTaskDuration;
      logger.debug("Orchestrator duration calculated", { 
        sub_task_count: subTasks.length, 
        total_duration_seconds: durationSeconds 
      });
    } else {
      // Regular task - use its own duration
      const startTime = new Date(task.generation_started_at);
      const endTime = new Date(task.generation_processed_at);
      durationSeconds = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 1000));
    }

    // Get task type configuration
    const { data: taskType, error: taskTypeError } = await supabaseAdmin
      .from('task_types')
      .select('*')
      .eq('name', task.task_type)
      .eq('is_active', true)
      .single();

    if (taskTypeError || !taskType) {
      logger.warn("No task type config found, using defaults", { task_type: task.task_type });

      // Use default cost if no config found
      const defaultCostPerSecond = 0.01;
      const cost = defaultCostPerSecond * durationSeconds;

      const { error: ledgerError } = await supabaseAdmin.from('credits_ledger').insert({
        user_id: (task as any).projects.user_id,
        task_id: task.id,
        amount: -cost,
        type: 'spend',
        metadata: {
          task_type: task.task_type,
          duration_seconds: durationSeconds,
          base_cost_per_second: defaultCostPerSecond,
          billing_type: 'per_second',
          calculated_at: new Date().toISOString(),
          note: 'Default cost used - no task type configuration found'
        }
      });

      if (ledgerError) {
        logger.error("Failed to insert into credit ledger (default)", { error: ledgerError.message });
        await logger.flush();
        return jsonResponse({ error: 'Failed to record cost in ledger' }, 500);
      }

      logger.info("Cost calculated (default rates)", { 
        cost,
        duration_seconds: durationSeconds,
        billing_type: 'per_second'
      });
      await logger.flush();

      return jsonResponse({
        success: true,
        cost: cost,
        duration_seconds: durationSeconds,
        base_cost_per_second: defaultCostPerSecond,
        billing_type: 'per_second',
        note: 'Default cost used - no task type configuration found'
      });
    }

    // Calculate cost based on task type configuration
    const cost = calculateTaskCost(
      taskType.billing_type,
      taskType.base_cost_per_second,
      taskType.unit_cost,
      durationSeconds,
      taskType.cost_factors,
      task.params
    );

    // Validate cost calculation
    if (isNaN(cost) || cost < 0) {
      logger.error("Invalid cost calculated", {
        cost,
        billing_type: taskType.billing_type,
        base_cost_per_second: taskType.base_cost_per_second,
        unit_cost: taskType.unit_cost,
        duration: durationSeconds
      });
      await logger.flush();
      return jsonResponse({ error: 'Invalid cost calculation' }, 500);
    }

    // Ensure user exists before inserting credit ledger entry
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', (task as any).projects.user_id)
      .single();

    if (userError || !user) {
      logger.error("User not found for credit ledger", { 
        user_id: (task as any).projects.user_id, 
        error: userError?.message 
      });
      await logger.flush();
      return jsonResponse({ error: 'User not found for credit calculation' }, 400);
    }

    // Insert cost into credit ledger
    const { error: ledgerError } = await supabaseAdmin.from('credits_ledger').insert({
      user_id: (task as any).projects.user_id,
      task_id: task.id,
      amount: -cost,
      type: 'spend',
      metadata: {
        task_type: task.task_type,
        billing_type: taskType.billing_type,
        duration_seconds: durationSeconds,
        base_cost_per_second: taskType.base_cost_per_second,
        unit_cost: taskType.unit_cost,
        cost_factors: taskType.cost_factors,
        task_params: task.params,
        calculated_at: new Date().toISOString(),
        task_type_id: taskType.id
      }
    });

    if (ledgerError) {
      logger.error("Failed to insert into credit ledger", { 
        error: ledgerError.message,
        user_id: (task as any).projects.user_id,
        cost
      });
      await logger.flush();
      return jsonResponse({ error: `Failed to record cost in ledger: ${ledgerError.message}` }, 500);
    }

    logger.info("Cost calculated and recorded", {
      cost,
      billing_type: taskType.billing_type,
      duration_seconds: durationSeconds,
      user_id: (task as any).projects.user_id
    });
    await logger.flush();

    return jsonResponse({
      success: true,
      cost: cost,
      billing_type: taskType.billing_type,
      duration_seconds: durationSeconds,
      base_cost_per_second: taskType.base_cost_per_second,
      unit_cost: taskType.unit_cost,
      cost_factors: taskType.cost_factors,
      task_type: task.task_type,
      task_id: task.id
    });

  } catch (error: any) {
    logger.critical("Unexpected error", { error: error?.message, stack: error?.stack?.substring(0, 500) });
    await logger.flush();
    return jsonResponse({ error: error?.message || 'Unknown error occurred' }, 500);
  }
});
