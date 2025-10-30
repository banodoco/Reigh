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
 * {
 *   mode: 'count',
 *   timestamp: string,
 *   run_type_filter?: 'gpu' | 'api' | null,
 *   
 *   // Quick counts for scaling math
 *   totals: {
 *     queued_only: number,        // Tasks waiting to be claimed
 *     active_only: number,         // Tasks being processed
 *     queued_plus_active: number   // Total workload
 *   },
 *   
 *   // Detailed task arrays for logging context
 *   queued_tasks: [{
 *     task_id: string,
 *     task_type: string,
 *     user_id: string,
 *     created_at: string
 *   }],
 *   
 *   active_tasks: [{
 *     task_id: string,
 *     task_type: string,
 *     worker_id: string | null,
 *     user_id: string,
 *     started_at: string
 *   }],
 *   
 *   // Additional breakdown and user stats (service role only)
 *   global_task_breakdown?: {...},
 *   users?: [...],
 *   
 *   // User-specific info (user token only)
 *   user_id?: string,
 *   user_info?: {...},
 *   debug_summary?: {...}
 * }
 * 
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
      // active_only = diff (eligibility-aware)
      console.log(`[TASK_COUNT_DEBUG] [SERVICE_ROLE] [${runType || 'ALL'}] Starting count computations`);
      
      // Add detailed logging for raw task data first
      console.log(`[TASK_COUNT_DEBUG] [RAW_TASKS] [${runType || 'ALL'}] Querying task data...`);
      const { data: rawTasks, error: rawTasksError } = await supabaseAdmin
        .from('tasks')
        .select(`
          id, task_type, status, worker_id, project_id, dependant_on,
          projects!inner(user_id, users!inner(credits, settings))
        `)
        .in('status', ['Queued', 'In Progress'])
        .limit(50);
      
      if (!rawTasksError && rawTasks) {
        console.log(`[TASK_COUNT_DEBUG] [RAW_TASKS] [${runType || 'ALL'}] Found ${rawTasks.length} tasks`);
        rawTasks.forEach(task => {
          const isOrchestrator = task.task_type?.toLowerCase().includes('orchestrator') ? 'ORCH' : 'NORMAL';
          const hasWorker = task.worker_id ? 'CLOUD' : 'LOCAL';
          const inCloudSetting = task.projects.users.settings?.ui?.generationMethods?.inCloud ?? true;
          const hasDep = task.dependant_on ? 'DEP' : 'NODEP';
          console.log(`[TASK_COUNT_DEBUG] [RAW_TASKS] [${runType || 'ALL'}] ${task.id.substring(0, 8)}: ${task.task_type} | ${task.status} | ${isOrchestrator} | ${hasWorker} | ${hasDep} | user=${task.projects.user_id.substring(0, 8)} | credits=${task.projects.users.credits} | inCloud=${inCloudSetting}`);
        });
      } else {
        console.log(`[TASK_COUNT_DEBUG] [RAW_TASKS] [${runType || 'ALL'}] ERROR:`, rawTasksError);
      }

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
      
      console.log(`[TASK_COUNT_DEBUG] [MAIN_FUNCTION] [${runType || 'ALL'}] queued_only=${queued_only}, queued_plus_active=${queued_plus_active}`);
      // Compute active_only from eligibility-aware counts for consistency
      const active_only = Math.max(0, queued_plus_active - queued_only);
      console.log(`[TASK_COUNT_DEBUG] [MAIN_FUNCTION] [${runType || 'ALL'}] FINAL: queued=${queued_only}, active=${active_only}, total=${queued_plus_active}`);
      
      // Add detailed breakdown by task type for debugging
      console.log(`[TASK_COUNT_DEBUG] [BREAKDOWN] [${runType || 'ALL'}] Analyzing task type breakdown...`);
      const { data: taskTypeBreakdown, error: taskTypeError } = await supabaseAdmin
        .from('tasks')
        .select(`
          task_type, status, worker_id,
          projects!inner(user_id, users!inner(credits))
        `)
        .in('status', ['Queued', 'In Progress']);
      
      if (!taskTypeError && taskTypeBreakdown) {
        const breakdown = taskTypeBreakdown.reduce((acc, task) => {
          const key = `${task.task_type}_${task.status}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
        console.log(`[TASK_COUNT_DEBUG] [BREAKDOWN] [${runType || 'ALL'}] Summary:`, JSON.stringify(breakdown));
        
        // Show orchestrator tasks specifically
        const orchestratorTasks = taskTypeBreakdown.filter(t => t.task_type && t.task_type.toLowerCase().includes('orchestrator'));
        console.log(`[TASK_COUNT_DEBUG] [ORCHESTRATORS] [${runType || 'ALL'}] Found ${orchestratorTasks.length} orchestrator tasks`);
        orchestratorTasks.forEach(task => {
          console.log(`[TASK_COUNT_DEBUG] [ORCHESTRATORS] [${runType || 'ALL'}] ${task.task_type} | ${task.status} | worker=${task.worker_id ? 'YES' : 'NO'} | credits=${task.projects.users.credits}`);
        });
      }

      // Per-user breakdown (cloud-claimed active only in function; may include orchestrators)
      let user_stats: any[] = [];
      try {
        console.log(`[TASK_COUNT_DEBUG] [ANALYSIS] [${runType || 'ALL'}] Calling analyze_task_availability_service_role...`);
        const { data: analysis } = await supabaseAdmin
          .rpc('analyze_task_availability_service_role', { p_include_active: true, p_run_type: runType });
        if (analysis && Array.isArray(analysis.user_stats) && analysis.user_stats.length > 0) {
          user_stats = analysis.user_stats;
          console.log(`[TASK_COUNT_DEBUG] [ANALYSIS] [${runType || 'ALL'}] Got ${user_stats.length} user stats from analysis`);
        } else {
          console.log(`[TASK_COUNT_DEBUG] [ANALYSIS] [${runType || 'ALL'}] No user stats from analysis, will use fallback`);
        }
      } catch (e) {
        console.log(`[TASK_COUNT_DEBUG] [ANALYSIS] [${runType || 'ALL'}] ERROR:`, (e as any)?.message);
      }
      // Fallback: always-on per-user capacity stats when analysis provides no breakdown
      if (user_stats.length === 0) {
        console.log(`[TASK_COUNT_DEBUG] [FALLBACK] [${runType || 'ALL'}] Using per_user_capacity_stats_service_role fallback`);
        try {
          const { data: perUser, error: perUserError } = await supabaseAdmin
            .rpc('per_user_capacity_stats_service_role');
          
          if (perUserError) {
            console.log(`[TASK_COUNT_DEBUG] [FALLBACK] [${runType || 'ALL'}] ERROR:`, perUserError);
          }
          
          if (Array.isArray(perUser)) {
            console.log(`[TASK_COUNT_DEBUG] [FALLBACK] [${runType || 'ALL'}] Got ${perUser.length} users from fallback`);
            
            user_stats = perUser.map((u: any) => ({
              user_id: u.user_id,
              credits: u.credits,
              queued_tasks: u.queued_tasks,
              in_progress_tasks: u.in_progress_tasks,
              allows_cloud: u.allows_cloud,
              at_limit: u.at_limit
            }));
            
            // Show users with tasks
            const usersWithTasks = user_stats.filter(u => u.in_progress_tasks > 0 || u.queued_tasks > 0);
            console.log(`[TASK_COUNT_DEBUG] [FALLBACK] [${runType || 'ALL'}] Users with tasks: ${usersWithTasks.length}`);
            usersWithTasks.forEach(u => {
              console.log(`[TASK_COUNT_DEBUG] [FALLBACK] [${runType || 'ALL'}] User ${u.user_id.substring(0, 8)}: queued=${u.queued_tasks}, in_progress=${u.in_progress_tasks}, credits=${u.credits}`);
            });
          }
        } catch (e) {
          console.log(`[TASK_COUNT_DEBUG] [FALLBACK] [${runType || 'ALL'}] EXCEPTION:`, (e as any)?.message);
        }
      }

      // Use function-based counts instead of direct database queries
      // This ensures consistency with our orchestrator exclusion logic
      const taskBreakdown = {
        queued_total: queued_only,
        in_progress_total: active_only,
        in_progress_cloud: active_only, // All active tasks from our function are cloud-claimed
        in_progress_local: 0, // Our service role function only counts cloud tasks
        orchestrator_tasks: 0 // Orchestrators are excluded from our function counts
      };
      
      // Compare main function results with fallback user stats totals
      const fallbackTotalInProgress = user_stats.reduce((sum, u) => sum + (u.in_progress_tasks || 0), 0);
      const fallbackTotalQueued = user_stats.reduce((sum, u) => sum + (u.queued_tasks || 0), 0);
      console.log(`[TASK_COUNT_DEBUG] [COMPARISON] [${runType || 'ALL'}] Main: active=${active_only}, queued=${queued_only}`);
      console.log(`[TASK_COUNT_DEBUG] [COMPARISON] [${runType || 'ALL'}] Fallback: active=${fallbackTotalInProgress}, queued=${fallbackTotalQueued}`);
      
      if (active_only !== fallbackTotalInProgress) {
        console.log(`[TASK_COUNT_DEBUG] [DISCREPANCY] [${runType || 'ALL'}] ⚠️  MISMATCH: Main says ${active_only} active, fallback says ${fallbackTotalInProgress}!`);
      }
      
      if (queued_only !== fallbackTotalQueued) {
        console.log(`[TASK_COUNT_DEBUG] [DISCREPANCY] [${runType || 'ALL'}] ⚠️  MISMATCH: Main says ${queued_only} queued, fallback says ${fallbackTotalQueued}!`);
      }

      // Fetch detailed task information for ELIGIBLE queued and active tasks
      // Must match the same eligibility criteria as count_eligible_tasks_service_role
      console.log(`[TASK_COUNT_DEBUG] [DETAILS] [${runType || 'ALL'}] Fetching eligible task information...`);
      
      // Fetch queued tasks with eligibility criteria:
      // - Status = 'Queued'
      // - NOT orchestrator tasks
      // - User has credits > 0
      // - No dependencies (dependant_on IS NULL)
      // - Optionally filter by run_type via user settings
      const { data: queuedTasksData, error: queuedError } = await supabaseAdmin
        .from('tasks')
        .select(`
          id,
          task_type,
          created_at,
          dependant_on,
          projects!inner(
            user_id,
            users!inner(credits, settings)
          )
        `)
        .eq('status', 'Queued')
        .is('dependant_on', null)  // No dependencies
        .order('created_at', { ascending: true });
      
      if (queuedError) {
        console.error(`[TASK_COUNT_DEBUG] [DETAILS] Error fetching queued tasks:`, queuedError);
      }
      
      // Fetch active/in-progress tasks with eligibility criteria:
      // - Status = 'In Progress'
      // - NOT orchestrator tasks
      // - User has credits > 0
      // - Has worker_id (cloud-claimed)
      // - Optionally filter by run_type via user settings
      const { data: activeTasksData, error: activeError } = await supabaseAdmin
        .from('tasks')
        .select(`
          id,
          task_type,
          worker_id,
          updated_at,
          projects!inner(
            user_id,
            users!inner(credits, settings)
          )
        `)
        .eq('status', 'In Progress')
        .not('worker_id', 'is', null)  // Must have worker_id (cloud-claimed)
        .order('updated_at', { ascending: true });
      
      if (activeError) {
        console.error(`[TASK_COUNT_DEBUG] [DETAILS] Error fetching active tasks:`, activeError);
      }

      // Apply eligibility filters that can't be done in SQL
      const queuedFiltered = (queuedTasksData || []).filter(task => {
        // Exclude orchestrator tasks
        if (task.task_type && task.task_type.toLowerCase().includes('orchestrator')) {
          return false;
        }
        
        // User must have credits > 0
        if (task.projects.users.credits <= 0) {
          return false;
        }
        
        // If run_type filter is specified, check user settings
        if (runType === 'gpu') {
          const inCloud = task.projects.users.settings?.ui?.generationMethods?.inCloud ?? true;
          if (!inCloud) return false;
        } else if (runType === 'api') {
          const inCloud = task.projects.users.settings?.ui?.generationMethods?.inCloud ?? true;
          if (inCloud) return false;
        }
        
        return true;
      });

      const activeFiltered = (activeTasksData || []).filter(task => {
        // Exclude orchestrator tasks
        if (task.task_type && task.task_type.toLowerCase().includes('orchestrator')) {
          return false;
        }
        
        // User must have credits > 0
        if (task.projects.users.credits <= 0) {
          return false;
        }
        
        // If run_type filter is specified, check user settings
        if (runType === 'gpu') {
          const inCloud = task.projects.users.settings?.ui?.generationMethods?.inCloud ?? true;
          if (!inCloud) return false;
        } else if (runType === 'api') {
          const inCloud = task.projects.users.settings?.ui?.generationMethods?.inCloud ?? true;
          if (inCloud) return false;
        }
        
        return true;
      });

      // Format queued tasks
      const queued_tasks = queuedFiltered.map(task => ({
        task_id: task.id,
        task_type: task.task_type,
        user_id: task.projects.user_id,
        created_at: task.created_at
      }));

      // Format active tasks
      const active_tasks = activeFiltered.map(task => ({
        task_id: task.id,
        task_type: task.task_type,
        worker_id: task.worker_id,
        user_id: task.projects.user_id,
        started_at: task.updated_at // Using updated_at as proxy for when task was claimed
      }));

      console.log(`[TASK_COUNT_DEBUG] [DETAILS] [${runType || 'ALL'}] Eligible tasks: ${queued_tasks.length} queued, ${active_tasks.length} active`);
      
      // Validation: arrays should match totals
      if (queued_tasks.length !== queued_only) {
        console.warn(`[TASK_COUNT_DEBUG] [VALIDATION] [${runType || 'ALL'}] ⚠️  MISMATCH: queued_tasks array (${queued_tasks.length}) != queued_only count (${queued_only})`);
      }
      if (active_tasks.length !== active_only) {
        console.warn(`[TASK_COUNT_DEBUG] [VALIDATION] [${runType || 'ALL'}] ⚠️  MISMATCH: active_tasks array (${active_tasks.length}) != active_only count (${active_only})`);
      }

      return new Response(JSON.stringify({
        mode: 'count',
        timestamp: new Date().toISOString(),
        run_type_filter: runType,
        totals: {
          queued_only,
          active_only,
          queued_plus_active
        },
        queued_tasks,
        active_tasks,
        global_task_breakdown: taskBreakdown,
        users: user_stats,
        recent_tasks: [] // Removed direct database query - using function-based counts only
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
      
      // Use PAT-friendly functions that bypass credits and run_type constraints for PAT users
      const [countQueuedOnly, countQueuedPlusActive] = await Promise.all([
        supabaseAdmin.rpc('count_eligible_tasks_user_pat', { p_user_id: callerId, p_include_active: false }),
        supabaseAdmin.rpc('count_eligible_tasks_user_pat', { p_user_id: callerId, p_include_active: true })
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
        console.log(`${pathTag} [TaskCounts:CountDebug] User ${callerId}: calling analyze_task_availability_user_pat(include_active=true)`);
        const { data: analysis } = await supabaseAdmin
          .rpc('analyze_task_availability_user_pat', { p_user_id: callerId, p_include_active: true });
        if (analysis) {
          eligible_queued = analysis.eligible_count ?? 0;
          user_info = analysis.user_info ?? {};
          console.log(`${pathTag} [TaskCounts:CountDebug] User ${callerId}: eligible_queued=${eligible_queued}`);
        }
      } catch (e) {
        console.log(`${pathTag} User analyze_task_availability failed:`, (e as any)?.message);
      }

      // Use function-based counts instead of direct database queries
      // This ensures consistency with our orchestrator exclusion logic
      const in_progress_any = active_only_capacity;
      const in_progress_cloud = active_only_capacity; // Our user function excludes orchestrators
      const in_progress_cloud_non_orchestrator = active_only_capacity; // Already excluded by our function
      
      // Fetch detailed task information for this user's ELIGIBLE queued and active tasks
      // Must match the same eligibility criteria as count_eligible_tasks_user_pat
      console.log(`${pathTag} [TaskCounts:Details] Fetching eligible task information for user ${callerId}...`);
      
      // Get user's project IDs first
      const { data: userProjects } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('user_id', callerId);
      
      const projectIds = userProjects?.map(p => p.id) || [];
      
      let user_queued_tasks: any[] = [];
      let user_active_tasks: any[] = [];
      
      if (projectIds.length > 0) {
        // Fetch queued tasks with eligibility criteria:
        // - Status = 'Queued'
        // - NOT orchestrator tasks
        // - No dependencies (dependant_on IS NULL)
        // Note: PAT functions bypass credits check, so we don't filter by credits here
        const { data: queuedTasksData, error: queuedError } = await supabaseAdmin
          .from('tasks')
          .select(`
            id,
            task_type,
            created_at,
            dependant_on,
            project_id
          `)
          .eq('status', 'Queued')
          .in('project_id', projectIds)
          .is('dependant_on', null)  // No dependencies
          .order('created_at', { ascending: true });
        
        if (queuedError) {
          console.error(`${pathTag} [TaskCounts:Details] Error fetching queued tasks:`, queuedError);
        }
        
        // Fetch active/in-progress tasks with eligibility criteria:
        // - Status = 'In Progress'
        // - NOT orchestrator tasks
        // - Has worker_id (cloud-claimed)
        const { data: activeTasksData, error: activeError } = await supabaseAdmin
          .from('tasks')
          .select(`
            id,
            task_type,
            worker_id,
            updated_at,
            project_id
          `)
          .eq('status', 'In Progress')
          .in('project_id', projectIds)
          .not('worker_id', 'is', null)  // Must have worker_id (cloud-claimed)
          .order('updated_at', { ascending: true });
        
        if (activeError) {
          console.error(`${pathTag} [TaskCounts:Details] Error fetching active tasks:`, activeError);
        }

        // Apply eligibility filters that can't be done in SQL
        const queuedFiltered = (queuedTasksData || []).filter(task => {
          // Exclude orchestrator tasks
          if (task.task_type && task.task_type.toLowerCase().includes('orchestrator')) {
            return false;
          }
          return true;
        });

        const activeFiltered = (activeTasksData || []).filter(task => {
          // Exclude orchestrator tasks
          if (task.task_type && task.task_type.toLowerCase().includes('orchestrator')) {
            return false;
          }
          return true;
        });

        // Format queued tasks
        user_queued_tasks = queuedFiltered.map(task => ({
          task_id: task.id,
          task_type: task.task_type,
          user_id: callerId,
          created_at: task.created_at
        }));

        // Format active tasks
        user_active_tasks = activeFiltered.map(task => ({
          task_id: task.id,
          task_type: task.task_type,
          worker_id: task.worker_id,
          user_id: callerId,
          started_at: task.updated_at // Using updated_at as proxy for when task was claimed
        }));

        console.log(`${pathTag} [TaskCounts:Details] Eligible tasks: ${user_queued_tasks.length} queued, ${user_active_tasks.length} active`);
        
        // Validation: arrays should match totals
        if (user_queued_tasks.length !== queued_only_capacity) {
          console.warn(`${pathTag} [TaskCounts:Validation] ⚠️  MISMATCH: queued_tasks array (${user_queued_tasks.length}) != queued_only count (${queued_only_capacity})`);
        }
        if (user_active_tasks.length !== active_only_capacity) {
          console.warn(`${pathTag} [TaskCounts:Validation] ⚠️  MISMATCH: active_tasks array (${user_active_tasks.length}) != active_only count (${active_only_capacity})`);
        }
      }

      return new Response(JSON.stringify({
        mode: 'count',
        timestamp: new Date().toISOString(),
        user_id: callerId,
        run_type_filter: runType,
        totals: {
          queued_only: queued_only_capacity,
          active_only: active_only_capacity,
          queued_plus_active: queued_plus_active_capacity,
          eligible_queued,
          in_progress_any,
          in_progress_cloud,
          in_progress_cloud_non_orchestrator
        },
        queued_tasks: user_queued_tasks,
        active_tasks: user_active_tasks,
        user_info,
        recent_tasks: [], // Deprecated - using queued_tasks and active_tasks instead
        debug_summary: {
          at_capacity: in_progress_any >= 5,
          capacity_used_pct: Math.round((in_progress_any / 5) * 100),
          orchestrator_count: 0, // Orchestrators excluded from our function counts
          queued_with_deps: 0, // Removed direct query - using function-based approach
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
