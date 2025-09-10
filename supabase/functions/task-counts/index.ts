import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

/**
 * Edge function: task-counts
 * 
 * Extracted from claim-next-task function to provide detailed task count information
 * without claiming any tasks. Returns comprehensive statistics about queued, active,
 * and user-specific task metrics.
 * 
 * - Service-role key: returns global task statistics across all users
 * - User token: returns task statistics for that specific user only
 * 
 * POST /functions/v1/task-counts
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: {
 *   run_type?: 'gpu' | 'api'  // Optional: filter tasks by execution environment
 * }
 * 
 * Returns:
 * - 200 OK with detailed task count data and breakdown
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not found
 * - 500 Internal Server Error
 */
serve(async (req) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Extract authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Missing or invalid Authorization header", { status: 401 });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

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

  console.log("🧮 Task counts function enabled – returning queued, active, and per-user breakdown.");

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let callerId: string | null = null;
  let isServiceRole = false;

  // 1) Check if token matches service-role key directly
  console.log(`🔍 DEBUG: Comparing tokens...`);
  console.log(`🔍 DEBUG: Received token: ${token.substring(0, 10)}... (length: ${token.length})`);
  console.log(`🔍 DEBUG: Service key exists: ${!!serviceKey}`);
  console.log(`🔍 DEBUG: Service key length: ${serviceKey?.length || 0}`);
  console.log(`🔍 DEBUG: Tokens match: ${token === serviceKey}`);
  
  if (token === serviceKey) {
    isServiceRole = true;
    console.log("[SERVICE_ROLE] Direct service-role key match");
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
          console.log("[SERVICE_ROLE] JWT has service-role/admin role");
        }
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("[PERSONAL_ACCESS_TOKEN] Token is not a valid JWT, treating as PAT");
    }
  }

  // 3) USER TOKEN PATH - resolve callerId via user_api_token table
  if (!isServiceRole) {
    console.log("[PERSONAL_ACCESS_TOKEN] Looking up token in user_api_token table...");
    
    try {
      // Query user_api_tokens table to find user
      const { data, error } = await supabaseAdmin
        .from("user_api_tokens")
        .select("user_id")
        .eq("token", token)
        .single();

      if (error || !data) {
        console.error("Token lookup failed:", error);
        return new Response("Invalid or expired token", { status: 403 });
      }

      callerId = data.user_id;
      console.log(`[PERSONAL_ACCESS_TOKEN] Token resolved to user ID: ${callerId}`);
    } catch (e) {
      console.error("Error querying user_api_token:", e);
      return new Response("Token validation failed", { status: 403 });
    }
  }

  try {
    if (isServiceRole) {
      // ═══════════════════════════════════════════════════════════════
      // SERVICE ROLE PATH: Global task statistics across all users
      // ═══════════════════════════════════════════════════════════════
      const pathTag = runType === 'api' ? '[SERVICE_ROLE] [API_PATH]' : '[SERVICE_ROLE] [GPU_PATH]';
      console.log(`${pathTag} Computing global task statistics`);
      
      // Aggregated counts and per-user breakdown for service role
      // queued_only = count(include_active=false)
      // queued_plus_active = count(include_active=true)
      // active_only = diff (cloud-claimed, orchestrators excluded per migration)
      console.log(`${pathTag} [TaskCounts:CountDebug] Starting count computations`);
      const [countQueuedOnly, countQueuedPlusActive] = await Promise.all([
        supabaseAdmin.rpc('count_eligible_tasks_service_role', { p_include_active: false, p_run_type: runType }),
        supabaseAdmin.rpc('count_eligible_tasks_service_role', { p_include_active: true, p_run_type: runType })
      ]);

      if (countQueuedOnly.error) {
        console.error("Service role count (queued only) error:", countQueuedOnly.error);
        throw countQueuedOnly.error;
      }
      if (countQueuedPlusActive.error) {
        console.error("Service role count (queued+active) error:", countQueuedPlusActive.error);
        throw countQueuedPlusActive.error;
      }

      const queued_only = countQueuedOnly.data ?? 0;
      const queued_plus_active = countQueuedPlusActive.data ?? 0;
      
      console.log(`${pathTag} Count results - queued_only: ${queued_only}, queued_plus_active: ${queued_plus_active}`);
      // Compute active_only directly from cloud In Progress tasks (exclude orchestrators)
      let active_only = 0;
      try {
        let query = supabaseAdmin
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'In Progress')
          .not('worker_id', 'is', null)
          .not('task_type', 'ilike', '%orchestrator%');
        
        // Apply run_type filter if specified
        if (runType) {
          // We need to filter by tasks that match the run_type
          // Since we can't join directly in the count query, we'll use a subquery approach
          const { data: taskTypesForRunType } = await supabaseAdmin
            .from('task_types')
            .select('name')
            .eq('run_type', runType)
            .eq('is_active', true);
          
          if (taskTypesForRunType && taskTypesForRunType.length > 0) {
            const taskTypeNames = taskTypesForRunType.map(tt => tt.name);
            query = query.in('task_type', taskTypeNames);
          } else {
            // No task types for this run_type, so 0 tasks
            active_only = 0;
            throw new Error(`No active task types found for run_type: ${runType}`);
          }
        }
        
        const { count: activeCloudNonOrchestrator } = await query;
        active_only = activeCloudNonOrchestrator ?? 0;
      } catch (e) {
        console.log(`${pathTag} [TaskCounts:CountDebug] Failed to compute active_only directly, falling back to diff method:`, (e as any)?.message);
        active_only = Math.max(0, queued_plus_active - queued_only);
      }
      console.log(`${pathTag} [TaskCounts:CountDebug] Service-role totals: queued_only=${queued_only}, active_only=${active_only}, queued_plus_active=${queued_plus_active}`);

      // Per-user breakdown (cloud-claimed active only in function; may include orchestrators)
      let user_stats: any[] = [];
      try {
        console.log(`${pathTag} [TaskCounts:CountDebug] Calling analyze_task_availability_service_role(include_active=true)`);
        const { data: analysis } = await supabaseAdmin
          .rpc('analyze_task_availability_service_role', { p_include_active: true, p_run_type: runType });
        if (analysis && Array.isArray(analysis.user_stats) && analysis.user_stats.length > 0) {
          user_stats = analysis.user_stats;
          console.log(`${pathTag} [TaskCounts:CountDebug] Analysis user_stats count=${user_stats.length}`);
        }
      } catch (e) {
        console.log(`${pathTag} analyze_task_availability failed:`, (e as any)?.message);
      }
      // Fallback: always-on per-user capacity stats when analysis provides no breakdown
      if (user_stats.length === 0) {
        console.log(`${pathTag} [TaskCounts:CountDebug] Analysis returned no user_stats; using per_user_capacity_stats_service_role fallback`);
        try {
          const { data: perUser } = await supabaseAdmin
            .rpc('per_user_capacity_stats_service_role');
          if (Array.isArray(perUser)) {
            user_stats = perUser.map((u: any) => ({
              user_id: u.user_id,
              credits: u.credits,
              queued_tasks: u.queued_tasks,
              in_progress_tasks: u.in_progress_tasks,
              allows_cloud: u.allows_cloud,
              at_limit: u.at_limit
            }));
            console.log(`${pathTag} [TaskCounts:CountDebug] Fallback user_stats count=${user_stats.length}`);
            const preview = user_stats.slice(0, 5).map(u => `${u.user_id}: queued=${u.queued_tasks}, in_progress=${u.in_progress_tasks}, credits=${u.credits}, at_limit=${u.at_limit}`);
            console.log(`${pathTag} [TaskCounts:CountDebug] Fallback users preview:`, preview);
          }
        } catch (e) {
          console.log(`${pathTag} per_user_capacity_stats_service_role failed:`, (e as any)?.message);
        }
      }

      // Additional debugging data - filter by run_type if specified
      let globalStatsQuery = supabaseAdmin
        .from('tasks')
        .select('status, task_type, worker_id, created_at')
        .in('status', ['Queued', 'In Progress'])
        .order('created_at', { ascending: false })
        .limit(20);

      // Apply run_type filter if specified
      if (runType) {
        const { data: taskTypesForRunType } = await supabaseAdmin
          .from('task_types')
          .select('name')
          .eq('run_type', runType)
          .eq('is_active', true);
        
        if (taskTypesForRunType && taskTypesForRunType.length > 0) {
          const taskTypeNames = taskTypesForRunType.map(tt => tt.name);
          globalStatsQuery = globalStatsQuery.in('task_type', taskTypeNames);
        }
      }

      const { data: globalStats } = await globalStatsQuery;

      const taskBreakdown = {
        queued_total: (globalStats || []).filter(t => t.status === 'Queued').length,
        in_progress_total: (globalStats || []).filter(t => t.status === 'In Progress').length,
        in_progress_cloud: (globalStats || []).filter(t => t.status === 'In Progress' && t.worker_id).length,
        in_progress_local: (globalStats || []).filter(t => t.status === 'In Progress' && !t.worker_id).length,
        orchestrator_tasks: (globalStats || []).filter(t => t.task_type?.toLowerCase().includes('orchestrator')).length
      };

      return new Response(JSON.stringify({
        mode: 'count',
        timestamp: new Date().toISOString(),
        run_type_filter: runType,
        totals: {
          queued_only,
          active_only,
          queued_plus_active
        },
        global_task_breakdown: taskBreakdown,
        users: user_stats,
        recent_tasks: (globalStats || []).slice(0, 10).map(t => ({
          status: t.status,
          type: t.task_type,
          is_cloud: !!t.worker_id,
          age_minutes: Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000)
        }))
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      // ═══════════════════════════════════════════════════════════════
      // USER TOKEN PATH: Task statistics for specific user
      // ═══════════════════════════════════════════════════════════════
      const pathTag = runType === 'api' ? '[PERSONAL_ACCESS_TOKEN] [API_PATH]' : '[PERSONAL_ACCESS_TOKEN] [GPU_PATH]';
      console.log(`${pathTag} Computing task statistics for user ${callerId}`);
      
      // Aggregated counts and details for a single user
      console.log(`${pathTag} [TaskCounts:CountDebug] User ${callerId}: starting count computations`);
      const [countQueuedOnly, countQueuedPlusActive] = await Promise.all([
        supabaseAdmin.rpc('count_eligible_tasks_user', { p_user_id: callerId, p_include_active: false, p_run_type: runType }),
        supabaseAdmin.rpc('count_eligible_tasks_user', { p_user_id: callerId, p_include_active: true, p_run_type: runType })
      ]);

      if (countQueuedOnly.error) {
        console.error("User count (queued only) error:", countQueuedOnly.error);
        throw countQueuedOnly.error;
      }
      if (countQueuedPlusActive.error) {
        console.error("User count (queued+active) error:", countQueuedPlusActive.error);
        throw countQueuedPlusActive.error;
      }

      const queued_only_capacity = countQueuedOnly.data ?? 0;
      const queued_plus_active_capacity = countQueuedPlusActive.data ?? 0;
      const active_only_capacity = Math.max(0, queued_plus_active_capacity - queued_only_capacity);
      console.log(`${pathTag} [TaskCounts:CountDebug] User ${callerId} totals: queued_only_capacity=${queued_only_capacity}, active_only_capacity=${active_only_capacity}, queued_plus_active_capacity=${queued_plus_active_capacity}`);

      // Get eligible queued count and some context via analysis RPC
      let eligible_queued = 0;
      let user_info: any = {};
      try {
        console.log(`${pathTag} [TaskCounts:CountDebug] User ${callerId}: calling analyze_task_availability_user(include_active=true)`);
        const { data: analysis } = await supabaseAdmin
          .rpc('analyze_task_availability_user', { p_user_id: callerId, p_include_active: true, p_run_type: runType });
        if (analysis) {
          eligible_queued = analysis.eligible_count ?? 0;
          user_info = analysis.user_info ?? {};
          console.log(`${pathTag} [TaskCounts:CountDebug] User ${callerId}: eligible_queued=${eligible_queued}`);
        }
      } catch (e) {
        console.log(`${pathTag} User analyze_task_availability failed:`, (e as any)?.message);
      }

      // Compute live in-progress metrics for this user
      // 1) Fetch user project ids
      const { data: projects, error: projErr } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('user_id', callerId);
      if (projErr) {
        console.error('Fetch projects error:', projErr);
        throw projErr;
      }
      const projectIds = (projects || []).map((p: any) => p.id);

      let in_progress_any = 0;
      let in_progress_cloud = 0;
      let in_progress_cloud_non_orchestrator = 0;
      if (projectIds.length > 0) {
        const [qAny, qCloud, qCloudNonOrch] = await Promise.all([
          supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projectIds).eq('status', 'In Progress'),
          supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projectIds).eq('status', 'In Progress').not('worker_id', 'is', null),
          supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projectIds).eq('status', 'In Progress').not('worker_id', 'is', null).not('task_type', 'ilike', '%orchestrator%')
        ]);
        in_progress_any = qAny.count ?? 0;
        in_progress_cloud = qCloud.count ?? 0;
        in_progress_cloud_non_orchestrator = qCloudNonOrch.count ?? 0;
      }

      // Get recent tasks for this user for debugging
      let recent_user_tasks: any[] = [];
      if (projectIds.length > 0) {
        const { data: recentTasks } = await supabaseAdmin
          .from('tasks')
          .select('id, status, task_type, worker_id, created_at, dependant_on')
          .in('project_id', projectIds)
          .in('status', ['Queued', 'In Progress', 'Complete'])
          .order('created_at', { ascending: false })
          .limit(15);
        
        recent_user_tasks = (recentTasks || []).map(t => ({
          id: t.id,
          status: t.status,
          type: t.task_type,
          is_cloud: !!t.worker_id,
          has_dependency: !!t.dependant_on,
          age_minutes: Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000)
        }));
      }

      return new Response(JSON.stringify({
        mode: 'count',
        timestamp: new Date().toISOString(),
        user_id: callerId,
        run_type_filter: runType,
        totals: {
          queued_only_capacity,
          active_only_capacity,
          queued_plus_active_capacity,
          eligible_queued,
          in_progress_any,
          in_progress_cloud,
          in_progress_cloud_non_orchestrator
        },
        user_info,
        recent_tasks: recent_user_tasks,
        debug_summary: {
          at_capacity: in_progress_any >= 5,
          capacity_used_pct: Math.round((in_progress_any / 5) * 100),
          orchestrator_count: recent_user_tasks.filter(t => t.type?.toLowerCase().includes('orchestrator')).length,
          queued_with_deps: recent_user_tasks.filter(t => t.status === 'Queued' && t.has_dependency).length,
          can_claim_more: in_progress_any < 5 && eligible_queued > 0
        }
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
