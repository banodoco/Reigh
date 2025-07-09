/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

// Calculate cost based on time duration and cost factors
function calculateTaskCost(
  baseCostCentsPerSecond: number,
  durationSeconds: number,
  costFactors: any,
  taskParams: any
): number {
  let totalCost = baseCostCentsPerSecond * durationSeconds;

  if (costFactors) {
    // Resolution-based cost multiplier
    if (costFactors.resolution && taskParams.resolution) {
      const resolutionMultiplier = costFactors.resolution[taskParams.resolution] || 1;
      totalCost *= resolutionMultiplier;
    }

    // Frame count-based additional cost
    if (costFactors.frameCount && taskParams.frame_count) {
      totalCost += costFactors.frameCount * taskParams.frame_count * durationSeconds;
    }

    // Model type-based cost multiplier
    if (costFactors.modelType && taskParams.model_type) {
      const modelMultiplier = costFactors.modelType[taskParams.model_type] || 1;
      totalCost *= modelMultiplier;
    }
  }

  // Round up to nearest cent
  return Math.ceil(totalCost);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { task_id } = await req.json();

    if (!task_id) {
      return jsonResponse({ error: 'task_id is required' }, 400);
    }

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
      console.error('Error fetching task:', taskError);
      return jsonResponse({ error: 'Task not found' }, 404);
    }

    // Check if task has both start and end times
    if (!task.generation_started_at || !task.generation_processed_at) {
      return jsonResponse({ error: 'Task must have both generation_started_at and generation_processed_at timestamps' }, 400);
    }

    // Get task cost configuration
    const { data: costConfig, error: costConfigError } = await supabaseAdmin
      .from('task_cost_configs')
      .select('*')
      .eq('task_type', task.task_type)
      .eq('is_active', true)
      .single();

    if (costConfigError || !costConfig) {
      console.error('Error fetching cost config:', costConfigError);
      // Use default cost if no config found
      const defaultCostPerSecond = 1; // 1 cent per second
      const startTime = new Date(task.generation_started_at);
      const endTime = new Date(task.generation_processed_at);
      const durationSeconds = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 1000));
      const cost = defaultCostPerSecond * durationSeconds;
      
      // Insert cost into credit ledger
      const { error: ledgerError } = await supabaseAdmin
        .from('credits_ledger')
        .insert({
          user_id: task.projects.user_id,
          task_id: task.id,
          amount: -cost, // negative for spending
          type: 'spend',
          metadata: {
            task_type: task.task_type,
            duration_seconds: durationSeconds,
            cost_per_second: defaultCostPerSecond,
            calculated_at: new Date().toISOString(),
            note: 'Default cost used - no configuration found'
          }
        });

      if (ledgerError) {
        console.error('Error inserting into credit ledger:', ledgerError);
        return jsonResponse({ error: 'Failed to record cost in ledger' }, 500);
      }

      return jsonResponse({
        success: true,
        cost: cost,
        duration_seconds: durationSeconds,
        cost_per_second: defaultCostPerSecond,
        note: 'Default cost used - no configuration found'
      });
    }

    // Calculate duration in seconds
    const startTime = new Date(task.generation_started_at);
    const endTime = new Date(task.generation_processed_at);
    const durationSeconds = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 1000));

    // Calculate cost based on configuration
    const cost = calculateTaskCost(
      costConfig.base_cost_cents_per_second,
      durationSeconds,
      costConfig.cost_factors,
      task.params
    );

    // Insert cost into credit ledger
    const { error: ledgerError } = await supabaseAdmin
      .from('credits_ledger')
      .insert({
        user_id: task.projects.user_id,
        task_id: task.id,
        amount: -cost, // negative for spending
        type: 'spend',
        metadata: {
          task_type: task.task_type,
          duration_seconds: durationSeconds,
          base_cost_per_second: costConfig.base_cost_cents_per_second,
          cost_factors: costConfig.cost_factors,
          task_params: task.params,
          calculated_at: new Date().toISOString(),
          cost_config_id: costConfig.id
        }
      });

    if (ledgerError) {
      console.error('Error inserting into credit ledger:', ledgerError);
      return jsonResponse({ error: 'Failed to record cost in ledger' }, 500);
    }

    return jsonResponse({
      success: true,
      cost: cost,
      duration_seconds: durationSeconds,
      base_cost_per_second: costConfig.base_cost_cents_per_second,
      cost_factors: costConfig.cost_factors,
      task_type: task.task_type,
      task_id: task.id
    });

  } catch (error) {
    console.error('Error in calculate-task-cost function:', error.message);
    return jsonResponse({ error: error.message }, 500);
  }
}); 