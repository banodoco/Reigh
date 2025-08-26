import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

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
 * POST /functions/v1/claim-next-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: {
 *   worker_id?: string,        // Optional worker ID for service role
 *   count?: boolean           // If true, return detailed counts and debugging info
 * }
 * 
 * Returns:
 * - 200 OK with task data (claiming) or detailed counts (count mode)
 * - 204 No Content if no tasks available (claiming only)
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

  const isCountMode = requestBody.count === true;
  const workerId = requestBody.worker_id || `edge_${crypto.randomUUID()}`;

  if (isCountMode) {
    console.log("🧮 Count mode enabled – returning queued, active, and per-user breakdown.");
  }

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
    console.log("Direct service-role key match");
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
          console.log("JWT has service-role/admin role");
        }
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("Token is not a valid JWT, treating as PAT");
    }
  }

  // 3) USER TOKEN PATH - resolve callerId via user_api_token table
  if (!isServiceRole) {
    console.log("Looking up token in user_api_token table...");
    
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
      console.log(`Token resolved to user ID: ${callerId}`);
    } catch (e) {
      console.error("Error querying user_api_token:", e);
      return new Response("Token validation failed", { status: 403 });
    }
  }

  try {
    let result;
    
    if (isServiceRole) {
      // ═══════════════════════════════════════════════════════════════
      // SERVICE ROLE PATH: Use optimized PostgreSQL function
      // ═══════════════════════════════════════════════════════════════
      console.log("Service role: Using optimized PostgreSQL function");
      
      if (isCountMode) {
        // Aggregated counts and per-user breakdown for service role
        // queued_only = count(include_active=false)
        // queued_plus_active = count(include_active=true)
        // active_only = diff (cloud-claimed, orchestrators excluded per migration)
        console.log('[ClaimNextTask:CountDebug] Service-role: starting count computations');
        const [countQueuedOnly, countQueuedPlusActive] = await Promise.all([
          supabaseAdmin.rpc('count_eligible_tasks_service_role', { p_include_active: false }),
          supabaseAdmin.rpc('count_eligible_tasks_service_role', { p_include_active: true })
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
        // Compute active_only directly from cloud In Progress tasks (exclude orchestrators)
        let active_only = 0;
        try {
          const { count: activeCloudNonOrchestrator } = await supabaseAdmin
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'In Progress')
            .not('worker_id', 'is', null);
          active_only = activeCloudNonOrchestrator ?? 0;
        } catch (e) {
          console.log('[ClaimNextTask:CountDebug] Failed to compute active_only directly, falling back to diff method:', (e as any)?.message);
          active_only = Math.max(0, queued_plus_active - queued_only);
        }
        console.log(`[ClaimNextTask:CountDebug] Service-role totals: queued_only=${queued_only}, active_only=${active_only}, queued_plus_active=${queued_plus_active}`);

        // Per-user breakdown (cloud-claimed active only in function; may include orchestrators)
        let user_stats: any[] = [];
        try {
          console.log('[ClaimNextTask:CountDebug] Calling analyze_task_availability_service_role(include_active=true)');
          const { data: analysis } = await supabaseAdmin
            .rpc('analyze_task_availability_service_role', { p_include_active: true });
          if (analysis && Array.isArray(analysis.user_stats) && analysis.user_stats.length > 0) {
            user_stats = analysis.user_stats;
            console.log(`[ClaimNextTask:CountDebug] Analysis user_stats count=${user_stats.length}`);
          }
        } catch (e) {
          console.log('Service role analyze_task_availability failed:', (e as any)?.message);
        }
        // Fallback: always-on per-user capacity stats when analysis provides no breakdown
        if (user_stats.length === 0) {
          console.log('[ClaimNextTask:CountDebug] Analysis returned no user_stats; using per_user_capacity_stats_service_role fallback');
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
              console.log(`[ClaimNextTask:CountDebug] Fallback user_stats count=${user_stats.length}`);
              const preview = user_stats.slice(0, 5).map(u => `${u.user_id}: queued=${u.queued_tasks}, in_progress=${u.in_progress_tasks}, credits=${u.credits}, at_limit=${u.at_limit}`);
              console.log('[ClaimNextTask:CountDebug] Fallback users preview:', preview);
            }
          } catch (e) {
            console.log('per_user_capacity_stats_service_role failed:', (e as any)?.message);
          }
        }

        // Additional debugging data
        const { data: globalStats } = await supabaseAdmin
          .from('tasks')
          .select('status, task_type, worker_id, created_at')
          .in('status', ['Queued', 'In Progress'])
          .order('created_at', { ascending: false })
          .limit(20);

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
        // Claim next eligible task
        const { data: claimResult, error: claimError } = await supabaseAdmin
          .rpc('claim_next_task_service_role', {
            p_worker_id: workerId,
            p_include_active: false
          });

        if (claimError) {
          console.error("Service role claim error:", claimError);
          throw claimError;
        }

        if (!claimResult || claimResult.length === 0) {
          console.log("Service role: No eligible tasks available");
          
          // Add detailed debugging analysis like original
                      try {
            const { data: analysis } = await supabaseAdmin
              .rpc('analyze_task_availability_service_role', {
                p_include_active: false
              });
            
            if (analysis) {
              console.log('\n🔍 DETAILED ANALYSIS:');
              console.log(`Total queued tasks: ${analysis.total_tasks}`);
              console.log(`Eligible tasks: ${analysis.eligible_tasks}`);
              
              if (analysis.total_tasks > 0 && analysis.eligible_tasks === 0) {
                console.log('\n❌ WHY NO TASKS ARE READY:');
                const reasons = analysis.rejection_reasons || {};
                if (reasons.no_credits) console.log(`     • No credits: ${reasons.no_credits} tasks`);
                if (reasons.cloud_disabled) console.log(`     • Cloud disabled: ${reasons.cloud_disabled} tasks`);
                if (reasons.concurrency_limit) console.log(`     • Concurrency limit (≥5 tasks): ${reasons.concurrency_limit} tasks`);
                if (reasons.dependency_blocked) console.log(`     • Dependency not complete: ${reasons.dependency_blocked} tasks`);
                if (reasons.unknown) console.log(`     • Unknown reasons: ${reasons.unknown} tasks`);
                
                console.log('\n  👥 User breakdown:');
                const userStats = analysis.user_stats || [];
                userStats.slice(0, 5).forEach((user: any) => {
                  const status = user.at_limit ? '❌ AT LIMIT' : '✅ Under limit';
                  console.log(`     • User ${user.user_id}: ${user.in_progress_tasks} In Progress, ${user.queued_tasks} Queued, ${user.credits} credits ${status}`);
                });
              }
            }
          } catch (debugError) {
            console.log('Debug analysis failed:', debugError.message);
          }
          
          return new Response(null, { status: 204 });
        }

        const task = claimResult[0];
        console.log(`Service role: Successfully claimed task ${task.task_id}`);
        
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
    } else {
      // ═══════════════════════════════════════════════════════════════
      // USER TOKEN PATH: Use optimized PostgreSQL function for specific user
      // ═══════════════════════════════════════════════════════════════
      console.log(`User token: Using optimized PostgreSQL function for user ${callerId}`);
      
      if (isCountMode) {
        // Aggregated counts and details for a single user
        console.log(`[ClaimNextTask:CountDebug] User ${callerId}: starting count computations`);
        const [countQueuedOnly, countQueuedPlusActive] = await Promise.all([
          supabaseAdmin.rpc('count_eligible_tasks_user', { p_user_id: callerId, p_include_active: false }),
          supabaseAdmin.rpc('count_eligible_tasks_user', { p_user_id: callerId, p_include_active: true })
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
        console.log(`[ClaimNextTask:CountDebug] User ${callerId} totals: queued_only_capacity=${queued_only_capacity}, active_only_capacity=${active_only_capacity}, queued_plus_active_capacity=${queued_plus_active_capacity}`);

        // Get eligible queued count and some context via analysis RPC
        let eligible_queued = 0;
        let user_info: any = {};
        try {
          console.log(`[ClaimNextTask:CountDebug] User ${callerId}: calling analyze_task_availability_user(include_active=true)`);
          const { data: analysis } = await supabaseAdmin
            .rpc('analyze_task_availability_user', { p_user_id: callerId, p_include_active: true });
          if (analysis) {
            eligible_queued = analysis.eligible_count ?? 0;
            user_info = analysis.user_info ?? {};
            console.log(`[ClaimNextTask:CountDebug] User ${callerId}: eligible_queued=${eligible_queued}`);
          }
        } catch (e) {
          console.log('User analyze_task_availability failed:', (e as any)?.message);
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
      } else {
        // Claim next eligible task for this user
        const { data: claimResult, error: claimError } = await supabaseAdmin
          .rpc('claim_next_task_user', {
            p_user_id: callerId,
            p_include_active: false
          });

        if (claimError) {
          console.error("User claim error:", claimError);
          throw claimError;
        }

        if (!claimResult || claimResult.length === 0) {
          console.log(`User ${callerId}: No eligible tasks available`);
          
          // Add detailed debugging analysis for user like original
                      try {
            const { data: analysis } = await supabaseAdmin
              .rpc('analyze_task_availability_user', {
                p_user_id: callerId,
                p_include_active: false
              });
            
            if (analysis) {
              console.log(`\n🔍 USER ANALYSIS for ${callerId}:`);
              const userInfo = analysis.user_info || {};
              console.log(`  Credits: ${userInfo.credits}`);
              console.log(`  Allows local: ${userInfo.allows_local}`);
              console.log(`  Projects: ${(analysis.projects || []).length}`);
              console.log(`  Recent tasks: ${(analysis.recent_tasks || []).length}`);
              console.log(`  Eligible tasks: ${analysis.eligible_count}`);
              
              if (analysis.recent_tasks && analysis.recent_tasks.length > 0) {
                console.log(`\n  📋 Recent tasks:`);
                analysis.recent_tasks.slice(0, 3).forEach((task: any) => {
                  const depInfo = task.dependency_blocking ? ' (blocked by dependency)' : '';
                  console.log(`     • ${task.task_type} - ${task.status}${depInfo}`);
                });
              }
            }
          } catch (debugError) {
            console.log('User debug analysis failed:', debugError.message);
          }
          
          return new Response(null, { status: 204 });
        }

        const task = claimResult[0];
        console.log(`User ${callerId}: Successfully claimed task ${task.task_id}`);
        
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
    }

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
});
