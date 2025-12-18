/**
 * Billing utilities for complete_task
 * Handles cost calculation triggers
 */

import { extractOrchestratorTaskId } from './params.ts';

/**
 * Trigger cost calculation for a task
 * 
 * @param supabaseUrl - The Supabase project URL
 * @param serviceKey - The service role key for authentication
 * @param taskId - The task ID to calculate cost for
 * @param logTag - Optional log tag prefix (default: 'CostCalc')
 */
export async function triggerCostCalculation(
  supabaseUrl: string,
  serviceKey: string,
  taskId: string,
  logTag: string = 'CostCalc'
): Promise<void> {
  try {
    console.log(`[${logTag}] Triggering cost calculation for ${taskId}...`);
    const costResp = await fetch(`${supabaseUrl}/functions/v1/calculate-task-cost`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ task_id: taskId })
    });

    if (costResp.ok) {
      const costData = await costResp.json();
      if (costData && typeof costData.cost === 'number') {
        console.log(`[${logTag}] Cost calculation successful: $${costData.cost.toFixed(3)}`);
      }
    } else {
      const errTxt = await costResp.text();
      console.error(`[${logTag}] Cost calculation failed: ${errTxt}`);
    }
  } catch (costErr) {
    console.error(`[${logTag}] Error triggering cost calculation:`, costErr);
  }
}

/**
 * Trigger cost calculation for a task, but skip if it's a sub-task
 * (Sub-tasks have their costs rolled up into the orchestrator)
 * 
 * @param supabase - Supabase client for fetching task params
 * @param supabaseUrl - The Supabase project URL
 * @param serviceKey - The service role key for authentication
 * @param taskId - The task ID to calculate cost for
 */
export async function triggerCostCalculationIfNotSubTask(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  taskId: string
): Promise<void> {
  try {
    const { data: taskForCostCheck } = await supabase
      .from("tasks")
      .select("params")
      .eq("id", taskId)
      .single();

    const subTaskOrchestratorRef = extractOrchestratorTaskId(taskForCostCheck?.params, 'CostCalc');
    if (subTaskOrchestratorRef) {
      console.log(`[COMPLETE-TASK] Task ${taskId} is a sub-task, skipping cost calculation`);
      return;
    }

    await triggerCostCalculation(supabaseUrl, serviceKey, taskId, 'COMPLETE-TASK');
  } catch (costErr) {
    console.error("[COMPLETE-TASK] Error triggering cost calculation:", costErr);
  }
}



