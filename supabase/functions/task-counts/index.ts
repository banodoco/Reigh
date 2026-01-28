// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest } from "../_shared/auth.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

/**
 * Edge function: task-counts
 *
 * Provides task count information for scaling decisions and monitoring.
 * Optimized for low latency - use debug=true for verbose diagnostics.
 *
 * - Service-role key: returns global task statistics across all users
 * - User token: returns task statistics for that specific user only
 *
 * POST /functions/v1/task-counts
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: {
 *   run_type?: 'gpu' | 'api',  // Optional: filter tasks by execution environment
 *   debug?: boolean            // Optional: enable verbose logging and extra queries
 * }
 *
 * Returns:
 * {
 *   mode: 'count',
 *   timestamp: string,
 *   run_type_filter?: 'gpu' | 'api' | null,
 *
 *   // Quick counts for scaling math (service role only)
 *   totals: {
 *     // Core counts
 *     queued_only: number,        // Immediately claimable tasks (legacy, same as claimable_now)
 *     active_only: number,        // Tasks being processed
 *     queued_plus_active: number, // Total workload
 *
 *     // Breakdown for smarter scaling decisions (service role only)
 *     claimable_now: number,           // Can be claimed immediately
 *     blocked_by_capacity: number,     // Blocked by user's 5-task limit (will free up)
 *     blocked_by_deps: number,         // Blocked by incomplete dependencies
 *     blocked_by_settings: number,     // Blocked because user has cloud disabled
 *     potentially_claimable: number,   // claimable_now + blocked_by_capacity (for scaling)
 *   },
 *
 *   // Detailed task arrays (limited to 100 for service role, 50 for user)
 *   // Note: queued_tasks only includes immediately claimable tasks (matches claimable_now)
 *   queued_tasks: [{...}],
 *   active_tasks: [{...}],
 *
 *   // User stats (service role only)
 *   users?: [...],
 *
 *   // User-specific info (user token only)
 *   user_id?: string,
 *   user_info?: {...}
 * }
 *
 * - 200 OK with task count data
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid
 * - 500 Internal Server Error
 */
serve(async (req) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Parse request body
  let requestBody: any = {};
  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch (e) {
    console.log("No valid JSON body provided, using defaults");
  }

  const runType = requestBody.run_type || null; // 'gpu', 'api', or null (no filtering)
  const debug = requestBody.debug === true; // Enable verbose logging

  const startTime = Date.now();

  // Authenticate using shared auth module
  const auth = await authenticateRequest(req, supabaseAdmin, "[TASK-COUNTS]");

  if (!auth.success) {
    console.error("Authentication failed:", auth.error);
    return new Response(auth.error || "Authentication failed", { status: auth.statusCode || 403 });
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  if (debug) {
    if (isServiceRole) {
      console.log("[SERVICE_ROLE] Authenticated via service-role key");
    } else {
      console.log(`[PERSONAL_ACCESS_TOKEN] Authenticated via PAT, user ID: ${callerId}`);
    }
  }

  try {
    if (isServiceRole) {
      // ═══════════════════════════════════════════════════════════════
      // SERVICE ROLE PATH: Global task statistics across all users
      // ═══════════════════════════════════════════════════════════════

      // ESSENTIAL: Get counts from RPC functions (3 parallel calls)
      const [countQueuedPlusActive, breakdownResult, userStatsResult] = await Promise.all([
        supabaseAdmin.rpc('count_eligible_tasks_service_role', { p_include_active: true, p_run_type: runType }),
        supabaseAdmin.rpc('count_queued_tasks_breakdown_service_role', { p_run_type: runType }),
        supabaseAdmin.rpc('per_user_capacity_stats_service_role')
      ]);

      if (countQueuedPlusActive.error) {
        console.error("Service role count (queued+active) error:", countQueuedPlusActive.error);
        throw countQueuedPlusActive.error;
      }
      if (breakdownResult.error) {
        console.error("Service role breakdown error:", breakdownResult.error);
        throw breakdownResult.error;
      }

      // Extract breakdown (RPC returns a single row)
      const breakdown = breakdownResult.data?.[0] ?? {
        claimable_now: 0,
        blocked_by_capacity: 0,
        blocked_by_deps: 0,
        blocked_by_settings: 0,
        total_queued: 0
      };

      const claimable_now = breakdown.claimable_now ?? 0;
      const blocked_by_capacity = breakdown.blocked_by_capacity ?? 0;
      const blocked_by_deps = breakdown.blocked_by_deps ?? 0;
      const blocked_by_settings = breakdown.blocked_by_settings ?? 0;
      const potentially_claimable = claimable_now + blocked_by_capacity;

      // Legacy fields for backward compatibility
      const queued_only = claimable_now;
      const queued_plus_active = countQueuedPlusActive.data ?? 0;
      const active_only = Math.max(0, queued_plus_active - queued_only);

      // Format user stats
      const user_stats = Array.isArray(userStatsResult.data)
        ? userStatsResult.data.map((u: any) => ({
            user_id: u.user_id,
            credits: u.credits,
            queued_tasks: u.queued_tasks,
            in_progress_tasks: u.in_progress_tasks,
            allows_cloud: u.allows_cloud,
            at_limit: u.at_limit
          }))
        : [];

      // Fetch task_types lookup if run_type filtering is needed
      let taskTypeRunTypeMap: Map<string, string> | null = null;
      if (runType) {
        const { data: taskTypes } = await supabaseAdmin
          .from('task_types')
          .select('name, run_type')
          .eq('is_active', true);

        if (taskTypes) {
          taskTypeRunTypeMap = new Map(taskTypes.map(tt => [tt.name, tt.run_type]));
        }
      }

      // Build map of user in-progress counts for capacity filtering
      const userInProgressMap = new Map<string, number>();
      if (Array.isArray(userStatsResult.data)) {
        for (const u of userStatsResult.data) {
          userInProgressMap.set(u.user_id, u.in_progress_tasks ?? 0);
        }
      }

      // Fetch detailed task lists (parallel, with limits for performance)
      const [queuedResult, activeResult] = await Promise.all([
        supabaseAdmin
          .from('tasks')
          .select(`
            id,
            task_type,
            created_at,
            dependant_on,
            projects!inner(user_id, users!inner(credits, settings))
          `)
          .eq('status', 'Queued')
          .order('created_at', { ascending: true })
          .limit(100),
        supabaseAdmin
          .from('tasks')
          .select(`
            id,
            task_type,
            worker_id,
            updated_at,
            projects!inner(user_id, users!inner(credits, settings))
          `)
          .eq('status', 'In Progress')
          .not('worker_id', 'is', null)
          .order('updated_at', { ascending: true })
          .limit(100)
      ]);

      // Collect all dependency task IDs to check their completion status
      const allDepIds = new Set<string>();
      for (const task of queuedResult.data || []) {
        if (Array.isArray(task.dependant_on)) {
          for (const depId of task.dependant_on) {
            allDepIds.add(depId);
          }
        }
      }

      // Fetch dependency task statuses if any
      const completedDepIds = new Set<string>();
      if (allDepIds.size > 0) {
        const { data: depTasks } = await supabaseAdmin
          .from('tasks')
          .select('id, status')
          .in('id', Array.from(allDepIds));

        if (depTasks) {
          for (const dep of depTasks) {
            if (dep.status === 'Complete') {
              completedDepIds.add(dep.id);
            }
          }
        }
      }

      // Helper to check if all dependencies are complete
      const allDepsComplete = (dependant_on: string[] | null): boolean => {
        if (!dependant_on || dependant_on.length === 0) return true;
        return dependant_on.every(depId => completedDepIds.has(depId));
      };

      // Filter queued tasks to match RPC criteria (only claimable tasks)
      // Criteria: not orchestrator, credits > 0, allows_cloud, deps complete, user not at capacity
      const queued_tasks = (queuedResult.data || [])
        .filter(task => {
          // Exclude orchestrator tasks
          if (task.task_type?.toLowerCase().includes('orchestrator')) return false;
          // Exclude no-credits users
          if (task.projects.users.credits <= 0) return false;
          // Exclude users with cloud disabled
          const allowsCloud = task.projects.users.settings?.ui?.generationMethods?.inCloud ?? true;
          if (!allowsCloud) return false;
          // Exclude tasks with incomplete dependencies
          if (!allDepsComplete(task.dependant_on)) return false;
          // Exclude users at capacity (5+ in progress)
          const userInProgress = userInProgressMap.get(task.projects.user_id) ?? 0;
          if (userInProgress >= 5) return false;
          // Apply run_type filter if specified
          if (runType && taskTypeRunTypeMap) {
            const taskRunType = taskTypeRunTypeMap.get(task.task_type);
            if (!taskRunType || taskRunType !== runType) return false;
          }
          return true;
        })
        .map(task => ({
          task_id: task.id,
          task_type: task.task_type,
          user_id: task.projects.user_id,
          created_at: task.created_at
        }));

      // Filter active tasks (orchestrator, credits, run_type, api-worker exclusion)
      const active_tasks = (activeResult.data || [])
        .filter(task => {
          if (task.task_type?.toLowerCase().includes('orchestrator')) return false;
          if (task.projects.users.credits <= 0) return false;
          if (runType === 'gpu' && task.worker_id === 'api-worker-main') return false;
          if (runType && taskTypeRunTypeMap) {
            const taskRunType = taskTypeRunTypeMap.get(task.task_type);
            if (!taskRunType || taskRunType !== runType) return false;
          }
          return true;
        })
        .map(task => ({
          task_id: task.id,
          task_type: task.task_type,
          worker_id: task.worker_id,
          user_id: task.projects.user_id,
          started_at: task.updated_at
        }));

      // Debug logging (only when debug=true)
      if (debug) {
        console.log(`[TASK-COUNTS] [${runType || 'ALL'}] claimable=${claimable_now}, blocked_capacity=${blocked_by_capacity}, blocked_deps=${blocked_by_deps}, blocked_settings=${blocked_by_settings}`);
        console.log(`[TASK-COUNTS] [${runType || 'ALL'}] potentially_claimable=${potentially_claimable}, active=${active_only}`);
        console.log(`[TASK-COUNTS] [${runType || 'ALL'}] arrays: ${queued_tasks.length} queued, ${active_tasks.length} active`);
        console.log(`[TASK-COUNTS] [${runType || 'ALL'}] users with tasks: ${user_stats.filter(u => u.in_progress_tasks > 0 || u.queued_tasks > 0).length}`);

        // Validation warnings
        if (queued_tasks.length !== claimable_now) {
          console.warn(`[TASK-COUNTS] [VALIDATION] queued_tasks array (${queued_tasks.length}) != claimable_now (${claimable_now}) - possible race condition or limit`);
        }
        if (active_tasks.length !== active_only) {
          console.warn(`[TASK-COUNTS] [VALIDATION] active_tasks array (${active_tasks.length}) != active_only (${active_only})`);
        }
      }

      const elapsed = Date.now() - startTime;
      if (debug) {
        console.log(`[TASK-COUNTS] Completed in ${elapsed}ms`);
      }

      return new Response(JSON.stringify({
        mode: 'count',
        timestamp: new Date().toISOString(),
        run_type_filter: runType,
        totals: {
          // Legacy fields (for backward compatibility)
          queued_only,
          active_only,
          queued_plus_active,
          // New breakdown for smarter scaling
          claimable_now,
          blocked_by_capacity,
          blocked_by_deps,
          blocked_by_settings,
          potentially_claimable  // claimable_now + blocked_by_capacity (for scaling)
        },
        queued_tasks,
        active_tasks,
        users: user_stats,
        elapsed_ms: debug ? elapsed : undefined
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      // ═══════════════════════════════════════════════════════════════
      // USER TOKEN PATH: Task statistics for specific user
      // ═══════════════════════════════════════════════════════════════

      // ESSENTIAL: Get counts, user info, and project IDs (4 parallel calls)
      const [countQueuedOnly, countQueuedPlusActive, analysisResult, projectsResult] = await Promise.all([
        supabaseAdmin.rpc('count_eligible_tasks_user_pat', { p_user_id: callerId, p_include_active: false }),
        supabaseAdmin.rpc('count_eligible_tasks_user_pat', { p_user_id: callerId, p_include_active: true }),
        supabaseAdmin.rpc('analyze_task_availability_user_pat', { p_user_id: callerId, p_include_active: true }),
        supabaseAdmin.from('projects').select('id').eq('user_id', callerId)
      ]);

      if (countQueuedOnly.error) {
        console.error("User count (queued only) error:", countQueuedOnly.error);
        throw countQueuedOnly.error;
      }
      if (countQueuedPlusActive.error) {
        console.error("User count (queued+active) error:", countQueuedPlusActive.error);
        throw countQueuedPlusActive.error;
      }

      const queued_only = countQueuedOnly.data ?? 0;
      const queued_plus_active = countQueuedPlusActive.data ?? 0;
      const active_only = Math.max(0, queued_plus_active - queued_only);

      const analysis = analysisResult.data || {};
      const eligible_queued = analysis.eligible_count ?? 0;
      const user_info = analysis.user_info ?? {};

      const projectIds = projectsResult.data?.map(p => p.id) || [];

      let queued_tasks: any[] = [];
      let active_tasks: any[] = [];

      if (projectIds.length > 0) {
        // Fetch task details (parallel)
        const [queuedResult, activeResult] = await Promise.all([
          supabaseAdmin
            .from('tasks')
            .select('id, task_type, created_at, project_id')
            .eq('status', 'Queued')
            .in('project_id', projectIds)
            .order('created_at', { ascending: true })
            .limit(50),
          supabaseAdmin
            .from('tasks')
            .select('id, task_type, worker_id, updated_at, project_id')
            .eq('status', 'In Progress')
            .in('project_id', projectIds)
            .not('worker_id', 'is', null)
            .order('updated_at', { ascending: true })
            .limit(50)
        ]);

        // Filter and format queued tasks
        queued_tasks = (queuedResult.data || [])
          .filter(task => !task.task_type?.toLowerCase().includes('orchestrator'))
          .map(task => ({
            task_id: task.id,
            task_type: task.task_type,
            user_id: callerId,
            created_at: task.created_at
          }));

        // Filter and format active tasks
        active_tasks = (activeResult.data || [])
          .filter(task => !task.task_type?.toLowerCase().includes('orchestrator'))
          .map(task => ({
            task_id: task.id,
            task_type: task.task_type,
            worker_id: task.worker_id,
            user_id: callerId,
            started_at: task.updated_at
          }));
      }

      if (debug) {
        console.log(`[TASK-COUNTS] [USER] queued=${queued_only}, active=${active_only}, eligible=${eligible_queued}`);
      }

      const elapsed = Date.now() - startTime;

      return new Response(JSON.stringify({
        mode: 'count',
        timestamp: new Date().toISOString(),
        user_id: callerId,
        run_type_filter: runType,
        totals: {
          queued_only,
          active_only,
          queued_plus_active,
          eligible_queued
        },
        queued_tasks,
        active_tasks,
        user_info,
        debug_summary: {
          at_capacity: active_only >= 5,
          capacity_used_pct: Math.round((active_only / 5) * 100),
          can_claim_more: active_only < 5 && eligible_queued > 0
        },
        elapsed_ms: debug ? elapsed : undefined
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
});
