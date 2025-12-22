// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: claim-next-task
 * 
 * OPTIMIZED VERSION - Performance improvements over original:
 * - Single database query instead of N+1 queries
 * - Database-level filtering instead of JavaScript filtering
 * - Atomic operations to prevent race conditions
 * - Dramatically reduced network round trips
 * - Enhanced debugging capabilities
 * 
 * Claims the next queued task atomically using optimized PostgreSQL functions.
 * - Service-role key: claims any task across all users (cloud processing)
 * - User token: claims only tasks for that specific user (local processing)
 * 
 * NOTE: For task counts and statistics, use the separate task-counts function.
 * 
 * POST /functions/v1/claim-next-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: {
 *   worker_id?: string,        // Optional worker ID for service role
 *   run_type?: 'gpu' | 'api', // Optional: filter tasks by execution environment
 *   same_model_only?: boolean // Optional: only claim tasks matching worker's current_model (for model affinity)
 * }
 * 
 * Returns:
 * - 200 OK with task data if task claimed successfully
 * - 204 No Content if no tasks available
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not found
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[CLAIM-NEXT-TASK] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  
  // Create logger
  const logger = new SystemLogger(supabaseAdmin, 'claim-next-task');

  // Only accept POST requests
  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return new Response("Method not allowed", { status: 405 });
  }

  // Extract authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logger.error("Missing or invalid Authorization header");
    await logger.flush();
    return new Response("Missing or invalid Authorization header", { status: 401 });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  // Parse request body
  let requestBody: any = {};
  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch (e) {
    logger.debug("No valid JSON body provided, using defaults");
  }

  const workerId = requestBody.worker_id || `edge_${crypto.randomUUID()}`;
  const runType = requestBody.run_type || null; // 'gpu', 'api', or null (no filtering)
  const sameModelOnly = requestBody.same_model_only || false; // Only claim tasks matching worker's current model

  let callerId: string | null = null;
  let isServiceRole = false;

  // 1) Check if token matches service-role key directly
  if (token === serviceKey) {
    isServiceRole = true;
    logger.info("Authenticated via service-role key", { worker_id: workerId, run_type: runType });
  }

  // 2) If not service key, try to decode as JWT and check role
  if (!isServiceRole) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        // It's a JWT - decode and check role
        const payloadB64 = parts[1];
        const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));

        // Check for service role in various claim locations
        const role = payload.role || payload.app_metadata?.role;
        if (["service_role", "supabase_admin"].includes(role)) {
          isServiceRole = true;
          logger.info("Authenticated via JWT service-role", { worker_id: workerId, run_type: runType });
        }
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      logger.debug("Token is not a valid JWT, treating as PAT");
    }
  }

  // 3) USER TOKEN PATH - resolve callerId via user_api_token table
  if (!isServiceRole) {
    logger.debug("Looking up token in user_api_token table");
    
    try {
      // Query user_api_tokens table to find user
      const { data, error } = await supabaseAdmin
        .from("user_api_tokens")
        .select("user_id")
        .eq("token", token)
        .single();

      if (error || !data) {
        logger.error("Token lookup failed", { error: error?.message });
        await logger.flush();
        return new Response("Invalid or expired token", { status: 403 });
      }

      callerId = data.user_id;
      logger.info("Authenticated via PAT", { user_id: callerId });
    } catch (e: any) {
      logger.error("Error querying user_api_token", { error: e?.message });
      await logger.flush();
      return new Response("Token validation failed", { status: 403 });
    }
  }

  try {
    if (isServiceRole) {
      // ═══════════════════════════════════════════════════════════════
      // SERVICE ROLE PATH: Use optimized PostgreSQL function
      // ═══════════════════════════════════════════════════════════════
      const pathType = runType === 'api' ? 'API' : 'GPU';
      logger.info(`Claiming task (service-role, ${pathType} path)`, { 
        worker_id: workerId, 
        run_type: runType,
        same_model_only: sameModelOnly
      });
      
      let claimResult, claimError;
      try {
        const rpcResponse = await supabaseAdmin
          .rpc('claim_next_task_service_role', {
            p_worker_id: workerId,
            p_include_active: false,
            p_run_type: runType,
            p_same_model_only: sameModelOnly
          });
        
        claimResult = rpcResponse.data;
        claimError = rpcResponse.error;
        
      } catch (e: any) {
        logger.error("Exception during RPC call", { error: e?.message });
        throw e;
      }

      if (claimError) {
        logger.error("Claim RPC error", { 
          error: claimError.message,
          code: claimError.code 
        });
        throw claimError;
      }

      if (!claimResult || claimResult.length === 0) {
        logger.info("No eligible tasks available", { 
          worker_id: workerId, 
          run_type: runType,
          same_model_only: sameModelOnly
        });
        
        // Add detailed debugging analysis
        try {
          const { data: analysis } = await supabaseAdmin
            .rpc('analyze_task_availability_service_role', {
              p_include_active: false,
              p_run_type: runType
            });
          
          if (analysis && analysis.total_tasks > 0 && analysis.eligible_tasks === 0) {
            const reasons = analysis.rejection_reasons || {};
            logger.debug("Task availability analysis", {
              total_tasks: analysis.total_tasks,
              eligible_tasks: analysis.eligible_tasks,
              no_credits: reasons.no_credits,
              cloud_disabled: reasons.cloud_disabled,
              concurrency_limit: reasons.concurrency_limit,
              dependency_blocked: reasons.dependency_blocked
            });
          }
        } catch (debugError: any) {
          logger.debug("Debug analysis failed", { error: debugError?.message });
        }
        
        await logger.flush();
        return new Response(null, { status: 204 });
      }
      
      const task = claimResult[0];
      
      // Now we have a task_id - set it for this log entry
      logger.setDefaultTaskId(task.task_id);
      logger.info("Task claimed successfully", {
        task_id: task.task_id,
        task_type: task.task_type,
        worker_id: workerId,
        project_id: task.project_id
      });
      
      await logger.flush();
      return new Response(JSON.stringify({
        task_id: task.task_id,
        params: task.params,
        task_type: task.task_type,
        project_id: task.project_id
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      // ═══════════════════════════════════════════════════════════════
      // USER TOKEN PATH: Use optimized PostgreSQL function for specific user
      // ═══════════════════════════════════════════════════════════════
      logger.info("Claiming task (user PAT path)", { user_id: callerId });
      
      // Claim next eligible task for this user using PAT-friendly function
      const { data: claimResult, error: claimError } = await supabaseAdmin
        .rpc('claim_next_task_user_pat', {
          p_user_id: callerId,
          p_include_active: false
        });

      if (claimError) {
        logger.error("Claim RPC error (user path)", { 
          user_id: callerId,
          error: claimError.message 
        });
        throw claimError;
      }

      if (!claimResult || claimResult.length === 0) {
        logger.info("No eligible tasks for user", { user_id: callerId });
        
        // Add detailed debugging analysis for user
        try {
          const { data: analysis } = await supabaseAdmin
            .rpc('analyze_task_availability_user_pat', {
              p_user_id: callerId,
              p_include_active: false
            });
          
          if (analysis) {
            const userInfo = analysis.user_info || {};
            logger.debug("User task availability analysis", {
              user_id: callerId,
              credits: userInfo.credits,
              allows_local: userInfo.allows_local,
              projects_count: (analysis.projects || []).length,
              recent_tasks_count: (analysis.recent_tasks || []).length,
              eligible_count: analysis.eligible_count
            });
          }
        } catch (debugError: any) {
          logger.debug("User debug analysis failed", { error: debugError?.message });
        }
        
        await logger.flush();
        return new Response(null, { status: 204 });
      }
      
      const task = claimResult[0];
      
      // Now we have a task_id - set it for this log entry
      logger.setDefaultTaskId(task.task_id);
      logger.info("Task claimed successfully (user)", {
        task_id: task.task_id,
        task_type: task.task_type,
        user_id: callerId,
        project_id: task.project_id
      });
      
      await logger.flush();
      return new Response(JSON.stringify({
        task_id: task.task_id,
        params: task.params,
        task_type: task.task_type,
        project_id: task.project_id
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error: any) {
    logger.critical("Unexpected error", { error: error?.message });
    await logger.flush();
    return new Response(`Internal server error: ${error?.message}`, { status: 500 });
  }
});
