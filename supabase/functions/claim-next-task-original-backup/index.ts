import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { createHash } from "https://deno.land/std@0.224.0/crypto/mod.ts";

/**
 * Edge function: claim-next-task
 * 
 * Claims the next queued task atomically.
 * - Service-role key: claims any task across all users
 * - User token: claims only tasks for that specific user
 * 
 * POST /functions/v1/claim-next-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * Body: {} (empty JSON)
 * 
 * Returns:
 * - 200 OK with task data
 * - 204 No Content if no tasks available
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

  // Parse request body to get worker_id if provided
  let requestBody: any = {};
  try {
    const bodyText = await req.text();
    if (bodyText) {
      requestBody = JSON.parse(bodyText);
    }
  } catch (e) {
    console.log("No valid JSON body provided, using default worker_id");
  }

  // ─── Dry-run flag ───────────────────────────────────────────────
  // If dry_run === true we DON’T update the DB – we only compute how
  // many tasks *could* be claimed given the current constraints.
  const isDryRun = requestBody.dry_run === true;
  const includeActive = requestBody.include_active === true;
  if (isDryRun) {
    console.log("⚙️  Dry-run mode enabled – no tasks will be claimed, only counted.");
  }
  if (includeActive) {
    console.log("⚙️  Include active mode – counting both Queued AND In Progress tasks.");
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let callerId: string | null = null;
  let isServiceRole = false;

  // 1) Check if token matches service-role key directly
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
        // Don't extract user ID from JWT - always look it up in user_api_token table
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("Token is not a valid JWT, treating as PAT");
    }
  }

  // 3) USER TOKEN PATH - ALWAYS resolve callerId via user_api_token table
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
      
      // Debug: Check user's projects and tasks
      const { data: userProjects } = await supabaseAdmin
        .from("projects")
        .select("id, name")
        .eq("user_id", callerId);
      
      console.log(`DEBUG: User ${callerId} owns ${userProjects?.length || 0} projects`);
      
      if (userProjects && userProjects.length > 0) {
        const projectIds = userProjects.map(p => p.id);
        const { data: userTasks } = await supabaseAdmin
          .from("tasks")
          .select("id, status, project_id, task_type, created_at")
          .in("project_id", projectIds);
        
        console.log(`DEBUG: Found ${userTasks?.length || 0} tasks across user's projects`);
        if (userTasks && userTasks.length > 0) {
          const queuedTasks = userTasks.filter(t => t.status === "Queued");
          console.log(`DEBUG: ${queuedTasks.length} tasks are in 'Queued' status`);
          console.log("DEBUG: Sample tasks:", JSON.stringify(userTasks.slice(0, 3), null, 2));
          
          // Show unique status values to debug enum
          const uniqueStatuses = [...new Set(userTasks.map(t => t.status))];
          console.log(`DEBUG: Unique status values: ${JSON.stringify(uniqueStatuses)}`);
        }
      } else {
        console.log(`DEBUG: User ${callerId} has no projects - cannot claim any tasks`);
      }
    } catch (e) {
      console.error("Error querying user_api_token:", e);
      return new Response("Token validation failed", { status: 403 });
    }
  }

  // Handle worker_id based on token type
  let workerId: string | null = null;
  if (isServiceRole) {
    // Service role: use provided worker_id or generate one
    workerId = requestBody.worker_id || `edge_${crypto.randomUUID()}`;
    console.log(`Service role using worker_id: ${workerId}`);
  } else {
    // User/PAT: no worker_id needed (individual users don't have worker IDs)
    console.log(`User token: not using worker_id`);
  }

  try {
    // Call the appropriate RPC function based on token type
    let rpcResponse;
    
    if (isServiceRole) {
      // Service role: claim any available task from any project atomically
      console.log("Service role: Executing atomic find-and-claim for all tasks");
      
      const serviceUpdatePayload = {
        status: "In Progress" as const,
        worker_id: workerId,  // Service role gets worker_id for tracking
        updated_at: new Date().toISOString(),
        generation_started_at: new Date().toISOString() // ADD THIS - needed for cost calculation
      };

      // ─────────────────────────────────────────────────────────────
      // Per-user concurrency limit helpers (max 5 tasks In Progress)
      // ─────────────────────────────────────────────────────────────
      const MAX_CONCURRENT_TASKS_PER_USER = 5;
      // Cache project IDs and in-progress counts to avoid duplicate DB hits
      const userProjectCache = new Map<string, string[]>();
      const userInProgressCountCache = new Map<string, number>();
      const userCreditsCache = new Map<string, number>(); // Cache user credit balances

      async function getProjectIdsForUser(userId: string): Promise<string[]> {
        if (userProjectCache.has(userId)) return userProjectCache.get(userId)!;
        const { data } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("user_id", userId);
        const ids = data?.map((p: any) => p.id) ?? [];
        userProjectCache.set(userId, ids);
        return ids;
      }

      async function getInProgressCount(userId: string): Promise<number> {
        if (userInProgressCountCache.has(userId)) return userInProgressCountCache.get(userId)!;
        const projectIds = await getProjectIdsForUser(userId);
        if (projectIds.length === 0) {
          userInProgressCountCache.set(userId, 0);
          return 0;
        }
        const { count } = await supabaseAdmin
          .from("tasks")
          .select("id", { head: true, count: "exact" })
          .in("project_id", projectIds)
          .eq("status", "In Progress");
        const cnt = count ?? 0;
        userInProgressCountCache.set(userId, cnt);
        return cnt;
      }

      async function getUserCredits(userId: string): Promise<number> {
        if (userCreditsCache.has(userId)) return userCreditsCache.get(userId)!;
        const { data } = await supabaseAdmin
          .from("users")
          .select("credits")
          .eq("id", userId)
          .single();
        const credits = data?.credits ?? 0;
        userCreditsCache.set(userId, credits);
        return credits;
      }

      // Cache for user generation preferences
      const userGenerationPrefsCache = new Map<string, { onComputer: boolean; inCloud: boolean }>();
      
      async function getUserGenerationPreferences(userId: string): Promise<{ onComputer: boolean; inCloud: boolean }> {
        if (userGenerationPrefsCache.has(userId)) return userGenerationPrefsCache.get(userId)!;
        
        const { data } = await supabaseAdmin
          .from("users")
          .select("settings")
          .eq("id", userId)
          .single();
        
        const generationMethods = data?.settings?.ui?.generationMethods;
        const prefs = {
          onComputer: generationMethods?.onComputer ?? true,  // Default to true
          inCloud: generationMethods?.inCloud ?? true        // Default to true
        };
        
        userGenerationPrefsCache.set(userId, prefs);
        return prefs;
      }

      // Get all queued tasks and manually check dependencies
      const statusFilter = includeActive ? ["Queued", "In Progress"] : ["Queued"];
      const { data: eligibleTasks, error: findError } = await supabaseAdmin
        .from("tasks")
        .select("id, params, task_type, project_id, created_at, dependant_on, status")
        .in("status", statusFilter)
        .order("created_at", { ascending: true });

      if (findError) {
        throw findError;
      }

      // Manual dependency checking for service role
      const readyTasks: any[] = [];
      const userClaimedCounts = new Map<string, number>(); // Track how many we're adding per user
      const projectOwnerCache = new Map<string, string>(); // Cache project→owner mapping

      for (const task of (eligibleTasks || [])) {
        // For include_active mode, "In Progress" tasks are already active - count them directly
        if (includeActive && task.status === "In Progress") {
          let taskOwnerId: string | null = null;
          try {
            // Look up owning user via the task's project (with caching)
            if (projectOwnerCache.has(task.project_id)) {
              taskOwnerId = projectOwnerCache.get(task.project_id)!;
            } else {
              const { data: projRow } = await supabaseAdmin
                .from("projects")
                .select("user_id")
                .eq("id", task.project_id)
                .single();
              if (projRow?.user_id) {
                taskOwnerId = projRow.user_id;
                projectOwnerCache.set(task.project_id, projRow.user_id);
              }
            }
            
            if (taskOwnerId) {
              const userCredits = await getUserCredits(taskOwnerId);
              console.log(`✅ In Progress task ${task.id} counted - user ${taskOwnerId} has ${userCredits} credits (counting regardless of credit balance since already active)`);
            } else {
              console.log(`⚠️ In Progress task ${task.id} skipped - no owner found`);
            }
            
            // In Progress tasks are already active - count them regardless of concurrency limits
            // (concurrency limits only apply to claiming new tasks, not counting active ones)
            readyTasks.push(task);
          } catch (error) {
            console.log(`❌ In Progress task ${task.id} skipped - lookup error:`, error);
            // In case of lookup errors, skip task to be safe
            continue;
          }
          continue;
        }

        // For Queued tasks, apply the full claiming logic
        let taskOwnerId: string | null = null;
        try {
          // Look up owning user via the task's project (with caching)
          if (projectOwnerCache.has(task.project_id)) {
            taskOwnerId = projectOwnerCache.get(task.project_id)!;
          } else {
            const { data: projRow } = await supabaseAdmin
              .from("projects")
              .select("user_id")
              .eq("id", task.project_id)
              .single();
            if (projRow?.user_id) {
              taskOwnerId = projRow.user_id;
              projectOwnerCache.set(task.project_id, projRow.user_id);
            }
          }
          
          if (taskOwnerId) {
            // Check if user allows cloud processing (service role path)
            const userPrefs = await getUserGenerationPreferences(taskOwnerId);
            if (!userPrefs.inCloud) {
              // Skip this task – user doesn't allow cloud processing
              console.log(`⚠️ Skipping task ${task.id} - user ${taskOwnerId} doesn't allow cloud processing`);
              continue;
            }

            // Check if user has credits
            const userCredits = await getUserCredits(taskOwnerId);
            if (userCredits <= 0) {
              // Skip this task – user has no credits
              continue;
            }

            const currentTotal = await getInProgressCount(taskOwnerId);
            const alreadyAdded = userClaimedCounts.get(taskOwnerId) || 0;
            
            if (currentTotal + alreadyAdded >= MAX_CONCURRENT_TASKS_PER_USER) {
              // Skip this task – user already at concurrency limit
              continue;
            }
          }
        } catch (_) {
          // In case of lookup errors, skip task to be safe
          continue;
        }

        if (!task.dependant_on) {
          // No dependency - task is ready
          readyTasks.push(task);
          // Track that we're adding this task for the user
          if (taskOwnerId) {
            userClaimedCounts.set(taskOwnerId, (userClaimedCounts.get(taskOwnerId) || 0) + 1);
          }
        } else {
          // Check if dependency is complete
          const { data: depData } = await supabaseAdmin
            .from("tasks")
            .select("status")
            .eq("id", task.dependant_on)
            .single();
          
          if (depData?.status === "Complete") {
            readyTasks.push(task);
            // Track that we're adding this task for the user
            if (taskOwnerId) {
              userClaimedCounts.set(taskOwnerId, (userClaimedCounts.get(taskOwnerId) || 0) + 1);
            }
          }
        }
      }
      
      const statusLabel = includeActive ? "queued + in progress" : "queued";
      console.log(`Service role dependency check: ${eligibleTasks?.length || 0} ${statusLabel}, ${readyTasks.length} ready`);
      
      if (includeActive && eligibleTasks) {
        const inProgressCount = eligibleTasks.filter(t => t.status === "In Progress").length;
        const queuedCount = eligibleTasks.filter(t => t.status === "Queued").length;
        console.log(`📊 Status breakdown: ${queuedCount} Queued, ${inProgressCount} In Progress`);
      }

      // ── Detailed logging for debugging ──
      console.log(`\n🔍 DETAILED ANALYSIS:`);
      console.log(`Found ${eligibleTasks?.length || 0} ${statusLabel} tasks total`);
      console.log(`After filtering: ${readyTasks.length} tasks are ready to claim`);
      
      if (readyTasks.length === 0 && eligibleTasks && eligibleTasks.length > 0) {
        console.log(`\n❌ WHY NO TASKS ARE READY:`);
        
        // Count reasons for rejection
        let concurrencyBlocked = 0;
        let dependencyBlocked = 0;
        let lookupErrors = 0;
        let creditsBlocked = 0;
        const userStats = new Map<string, {inProgress: number, queued: number, total: number}>();
        
        for (const task of eligibleTasks) {
          try {
            let taskOwnerId: string | null = null;
            if (projectOwnerCache.has(task.project_id)) {
              taskOwnerId = projectOwnerCache.get(task.project_id)!;
            } else {
              const { data: projRow } = await supabaseAdmin
                .from("projects")
                .select("user_id")
                .eq("id", task.project_id)
                .single();
              if (projRow?.user_id) {
                taskOwnerId = projRow.user_id;
                projectOwnerCache.set(task.project_id, projRow.user_id);
              }
            }
            
            if (taskOwnerId) {
              // Check credits first
              const userCredits = await getUserCredits(taskOwnerId);
              if (userCredits <= 0) {
                creditsBlocked++;
                continue;
              }

              const currentTotal = await getInProgressCount(taskOwnerId);
              const alreadyAdded = userClaimedCounts.get(taskOwnerId) || 0;
              
              // Track user stats
              if (!userStats.has(taskOwnerId)) {
                const projectIds = await getProjectIdsForUser(taskOwnerId);
                const { count: inProg } = await supabaseAdmin
                  .from("tasks")
                  .select("id", { head: true, count: "exact" })
                  .in("project_id", projectIds)
                  .eq("status", "In Progress");
                const { count: queued } = await supabaseAdmin
                  .from("tasks")
                  .select("id", { head: true, count: "exact" })
                  .in("project_id", projectIds)
                  .eq("status", "Queued");
                
                userStats.set(taskOwnerId, {
                  inProgress: inProg || 0,
                  queued: queued || 0,
                  total: inProg || 0
                });
              }
              
              if (currentTotal + alreadyAdded >= MAX_CONCURRENT_TASKS_PER_USER) {
                concurrencyBlocked++;
              } else {
                // Check dependency
                if (task.dependant_on) {
                  const { data: depData } = await supabaseAdmin
                    .from("tasks")
                    .select("status")
                    .eq("id", task.dependant_on)
                    .single();
                  
                  if (depData?.status !== "Complete") {
                    dependencyBlocked++;
                  }
                } else if (!includeActive && task.status === "In Progress") {
                  // Task is already in progress - not an error in include_active mode
                  console.log(`ℹ️  Task ${task.id} is already In Progress`);
                } else {
                  // This should have been added to readyTasks - something went wrong
                  console.log(`⚠️  Task ${task.id} should be ready but wasn't added!`);
                }
              }
            } else {
              lookupErrors++;
            }
          } catch (_) {
            lookupErrors++;
          }
        }
        
        console.log(`  📊 Rejection reasons:`);
        console.log(`     • No credits: ${creditsBlocked} tasks`);
        console.log(`     • Concurrency limit (≥5 tasks): ${concurrencyBlocked} tasks`);
        console.log(`     • Dependency not complete: ${dependencyBlocked} tasks`);
        console.log(`     • User lookup errors: ${lookupErrors} tasks`);
        
        console.log(`\n  👥 User breakdown:`);
        for (const [userId, stats] of userStats.entries()) {
          const credits = await getUserCredits(userId);
          const status = stats.total >= MAX_CONCURRENT_TASKS_PER_USER ? '❌ AT LIMIT' : '✅ Under limit';
          console.log(`     • User ${userId}: ${stats.inProgress} In Progress, ${stats.queued} Queued, ${credits} credits ${status}`);
        }
      }

      // ── Dry-run early return (service role) ─────────────────────
      if (isDryRun) {
        return new Response(JSON.stringify({ available_tasks: readyTasks.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      let updateData: any = null;
      let updateError: any = null;

      if (readyTasks.length > 0) {
        const taskToTake = readyTasks[0];
        
        // Atomically claim the first eligible task
        const result = await supabaseAdmin
          .from("tasks")
          .update(serviceUpdatePayload)
          .eq("id", taskToTake.id)
          .eq("status", "Queued") // Double-check it's still queued
          .select()
          .single();
          
        updateData = result.data;
        updateError = result.error;
      } else {
        // No eligible tasks found - set error to indicate no rows
        updateError = { code: "PGRST116", message: "No eligible tasks found" };
      }

      console.log(`Service role atomic claim result - error: ${updateError?.message || updateError?.code || 'none'}, data: ${updateData ? 'claimed task ' + updateData.id : 'no data'}`);

      if (updateError && updateError.code !== "PGRST116") { // PGRST116 = no rows
        console.error("Service role atomic claim failed:", updateError);
        throw updateError;
      }

      if (updateData) {
        console.log(`Service role successfully claimed task ${updateData.id} atomically`);
        rpcResponse = {
          data: [{
            task_id_out: updateData.id,
            params_out: updateData.params,
            task_type_out: updateData.task_type,
            project_id_out: updateData.project_id
          }],
          error: null
        };
      } else {
        console.log("Service role: No queued tasks available for atomic claiming");
        rpcResponse = { data: [], error: null };
      }
    } else {
      // User token: use the user-specific claim function
      console.log(`Claiming task for user ${callerId}...`);
      
      try {
        // Try the user-specific function first
        // First get user's project IDs, then query tasks
        const { data: userProjects } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("user_id", callerId);

        if (!userProjects || userProjects.length === 0) {
          console.log("User has no projects");
          rpcResponse = { data: [], error: null };
        } else {
          const projectIds = userProjects.map(p => p.id);
          console.log(`DEBUG: Claiming from ${projectIds.length} project IDs: [${projectIds.slice(0, 3).join(', ')}...]`);
          
          // User-specific concurrency limit
          const MAX_CONCURRENT_TASKS_PER_USER = 5;

          if (projectIds.length === 0) {
            console.log("No project IDs to search - user has projects but they have no IDs?");
            rpcResponse = { data: [], error: null };
          } else {
            // ── Enforce per-user concurrency limit (max 5 In Progress) ──
            const { count: inProgressCount } = await supabaseAdmin
              .from("tasks")
              .select("id", { head: true, count: "exact" })
              .in("project_id", projectIds)
              .eq("status", "In Progress");

            if ((inProgressCount ?? 0) >= MAX_CONCURRENT_TASKS_PER_USER) {
              console.log(`User ${callerId} already has ${inProgressCount} tasks In Progress – at limit.`);
              rpcResponse = { data: [], error: null };
            } else {
              // Check if user allows local processing (PAT path)
              const { data: userData } = await supabaseAdmin
                .from("users")
                .select("settings")
                .eq("id", callerId)
                .single();
              
              const generationMethods = userData?.settings?.ui?.generationMethods;
              const userPrefs = {
                onComputer: generationMethods?.onComputer ?? true,  // Default to true
                inCloud: generationMethods?.inCloud ?? true        // Default to true
              };
              
              if (!userPrefs.onComputer) {
                console.log(`⚠️ User ${callerId} doesn't allow local processing - no tasks for PAT path`);
                rpcResponse = { data: [], error: null };
              } else {
              // Get queued tasks for user projects and manually check dependencies
              console.log(`DEBUG: Finding eligible tasks with dependency checking for ${projectIds.length} projects`);
              
              const userStatusFilter = includeActive ? ["Queued", "In Progress"] : ["Queued"];
              const { data: userEligibleTasks, error: userFindError } = await supabaseAdmin
                .from("tasks")
                .select("id, params, task_type, project_id, created_at, dependant_on, status")
                .in("status", userStatusFilter)
                .in("project_id", projectIds)
                .order("created_at", { ascending: true });

              if (userFindError) {
                throw userFindError;
              }

              // Manual dependency checking for user tasks
              const userReadyTasks: any[] = [];
              for (const task of (userEligibleTasks || [])) {
                if (!task.dependant_on) {
                  // No dependency - task is ready
                  userReadyTasks.push(task);
                } else {
                  // Check if dependency is complete
                  const { data: depData } = await supabaseAdmin
                    .from("tasks")
                    .select("status")
                    .eq("id", task.dependant_on)
                    .single();
                  
                  if (depData?.status === "Complete") {
                    userReadyTasks.push(task);
                  }
                }
              }

              const userStatusLabel = includeActive ? "eligible" : "queued";
              console.log(`DEBUG: User dependency check: ${userEligibleTasks?.length || 0} ${userStatusLabel}, ${userReadyTasks.length} ready`);

              // ── Dry-run early return (user path) ──────────────────
              if (isDryRun) {
                return new Response(JSON.stringify({ available_tasks: userReadyTasks.length }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
                });
              }

              const updatePayload: any = {
                status: "In Progress",
                updated_at: new Date().toISOString(),
                generation_started_at: new Date().toISOString() // ADD THIS - needed for cost calculation
                // Note: No worker_id for user claims - individual users don't have worker IDs
              };
              
              let updateData: any = null;
              let updateError: any = null;

              if (userReadyTasks.length > 0) {
                const taskToTake = userReadyTasks[0];
                
                // Atomically claim the first eligible task
                const result = await supabaseAdmin
                  .from("tasks")
                  .update(updatePayload)
                  .eq("id", taskToTake.id)
                  .eq("status", "Queued") // Double-check it's still queued
                  .select()
                  .single();
                  
                updateData = result.data;
                updateError = result.error;
              } else {
                // No eligible tasks found
                updateError = { code: "PGRST116", message: "No eligible tasks found for user" };
              }

              console.log(`DEBUG: User atomic claim result - error: ${updateError?.message || updateError?.code || 'none'}, data: ${updateData ? 'claimed task ' + updateData.id : 'no data'}`);
              
              if (updateError && updateError.code !== "PGRST116") { // PGRST116 = no rows
                console.error("User atomic claim failed:", updateError);
                throw updateError;
              }

              if (updateData) {
                // Successfully claimed atomically
                console.log(`Successfully claimed task ${updateData.id} atomically for user`);
                rpcResponse = {
                  data: [{
                    task_id_out: updateData.id,
                    params_out: updateData.params,
                    task_type_out: updateData.task_type,
                    project_id_out: updateData.project_id
                  }],
                  error: null
                };
              } else {
                // No tasks available or all were claimed by others
                console.log("No queued tasks available for user atomic claiming");
                rpcResponse = { data: [], error: null };
              }
            }
          }
        }
        } // Close the generation preference check
      } catch (e) {
        console.error("Error claiming user task:", e);
        rpcResponse = { data: [], error: null };
      }
    }

    // Check RPC response
    if (rpcResponse.error) {
      console.error("RPC error:", rpcResponse.error);
      return new Response(`Database error: ${rpcResponse.error.message}`, { status: 500 });
    }

    // Check if we got a task
    if (!rpcResponse.data || rpcResponse.data.length === 0) {
      console.log("No queued tasks available");
      return new Response(null, { status: 204 });
    }

    const task = rpcResponse.data[0];
    console.log(`Successfully claimed task ${task.task_id_out}`);

    // Return the task data
    return new Response(JSON.stringify({
      task_id: task.task_id_out,
      params: task.params_out,
      task_type: task.task_type_out,
      project_id: task.project_id_out
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
}); 