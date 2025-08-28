/* eslint-disable */ // @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// Helper for standard JSON responses with CORS headers
function jsonResponse(body, status = 200) {
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
function calculateTaskCost(billingType, baseCostPerSecond, unitCost, durationSeconds, costFactors, taskParams) {
  let totalCost;
  if (billingType === 'per_unit') {
    // For per_unit billing, use the fixed unit_cost
    totalCost = unitCost || 0;
  } else {
    // For per_second billing, multiply time by base_cost_per_second
    totalCost = baseCostPerSecond * durationSeconds;
  }
  // Apply cost factors regardless of billing type
  if (costFactors) {
    // Resolution-based cost multiplier
    if (costFactors.resolution && taskParams.resolution) {
      const resolutionMultiplier = costFactors.resolution[taskParams.resolution] || 1;
      totalCost *= resolutionMultiplier;
    }
    // Frame count-based additional cost
    if (costFactors.frameCount && taskParams.frame_count) {
      if (billingType === 'per_unit') {
        totalCost += costFactors.frameCount * taskParams.frame_count;
      } else {
        totalCost += costFactors.frameCount * taskParams.frame_count * durationSeconds;
      }
    }
    // Model type-based cost multiplier
    if (costFactors.modelType && taskParams.model_type) {
      const modelMultiplier = costFactors.modelType[taskParams.model_type] || 1;
      totalCost *= modelMultiplier;
    }
  }
  // Round to 3 decimal places (fractional cents)
  return Math.round(totalCost * 1000) / 1000;
}
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({
      ok: true
    });
  }
  if (req.method !== 'POST') {
    return jsonResponse({
      error: 'Method not allowed'
    }, 405);
  }
  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    const { task_id } = await req.json();
    if (!task_id) {
      return jsonResponse({
        error: 'task_id is required'
      }, 400);
    }
    // Get task details
    const { data: task, error: taskError } = await supabaseAdmin.from('tasks').select(`
        id,
        task_type,
        params,
        status,
        generation_started_at,
        generation_processed_at,
        project_id,
        projects(user_id)
      `).eq('id', task_id).single();
    if (taskError || !task) {
      console.error('Error fetching task:', taskError);
      return jsonResponse({
        error: 'Task not found'
      }, 404);
    }
    // Check if task has both start and end times
    if (!task.generation_started_at || !task.generation_processed_at) {
      return jsonResponse({
        error: 'Task must have both generation_started_at and generation_processed_at timestamps'
      }, 400);
    }
    // Check if task has orchestrator_task_id_ref - skip billing if present (sub-task of parent)
    if (task.params?.orchestrator_task_id_ref) {
      console.log(`Task ${task_id} has orchestrator_task_id_ref ${task.params.orchestrator_task_id_ref}, skipping credit ledger entry (sub-task)`);
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'Task is sub-task of orchestrator, parent task will be billed',
        orchestrator_task_id: task.params.orchestrator_task_id_ref,
        task_id: task.id
      });
    }
    // Get task type configuration
    const { data: taskType, error: taskTypeError } = await supabaseAdmin.from('task_types').select('*').eq('name', task.task_type).eq('is_active', true).single();
    if (taskTypeError || !taskType) {
      console.error('Error fetching task type config:', taskTypeError);
      // Use default cost if no config found
      const defaultCostPerSecond = 0.01; // 1 cent per second (in dollars)
      const startTime = new Date(task.generation_started_at);
      const endTime = new Date(task.generation_processed_at);
      const durationSeconds = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 1000));
      const cost = defaultCostPerSecond * durationSeconds;
      // Insert cost into credit ledger
      const { error: ledgerError } = await supabaseAdmin.from('credits_ledger').insert({
        user_id: task.projects.user_id,
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
        console.error('Error inserting into credit ledger:', ledgerError);
        return jsonResponse({
          error: 'Failed to record cost in ledger'
        }, 500);
      }
      return jsonResponse({
        success: true,
        cost: cost,
        duration_seconds: durationSeconds,
        base_cost_per_second: defaultCostPerSecond,
        billing_type: 'per_second',
        note: 'Default cost used - no task type configuration found'
      });
    }
    // Calculate duration in seconds
    const startTime = new Date(task.generation_started_at);
    const endTime = new Date(task.generation_processed_at);
    const durationSeconds = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 1000));
    // Calculate cost based on task type configuration
    const cost = calculateTaskCost(taskType.billing_type, taskType.base_cost_per_second, taskType.unit_cost, durationSeconds, taskType.cost_factors, task.params);
    // Validate cost calculation
    if (isNaN(cost) || cost < 0) {
      console.error('Invalid cost calculated:', {
        cost,
        billing_type: taskType.billing_type,
        base_cost_per_second: taskType.base_cost_per_second,
        unit_cost: taskType.unit_cost,
        duration: durationSeconds
      });
      return jsonResponse({
        error: 'Invalid cost calculation'
      }, 500);
    }
    // Ensure user exists before inserting credit ledger entry
    const { data: user, error: userError } = await supabaseAdmin.from('users').select('id').eq('id', task.projects.user_id).single();
    if (userError || !user) {
      console.error('User not found for credit ledger:', {
        user_id: task.projects.user_id,
        error: userError
      });
      return jsonResponse({
        error: 'User not found for credit calculation'
      }, 400);
    }
    // Insert cost into credit ledger
    const { error: ledgerError } = await supabaseAdmin.from('credits_ledger').insert({
      user_id: task.projects.user_id,
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
      console.error('Error inserting into credit ledger:', {
        error: ledgerError,
        user_id: task.projects.user_id,
        task_id: task.id,
        amount: -cost,
        cost_details: {
          cost,
          billing_type: taskType.billing_type,
          base_cost_per_second: taskType.base_cost_per_second,
          unit_cost: taskType.unit_cost,
          duration: durationSeconds
        }
      });
      return jsonResponse({
        error: `Failed to record cost in ledger: ${ledgerError.message}`
      }, 500);
    }
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
  } catch (error) {
    console.error('Error in calculate-task-cost function:', error.message);
    return jsonResponse({
      error: error.message
    }, 500);
  }
});
