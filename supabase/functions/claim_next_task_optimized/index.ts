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
 *   dry_run?: boolean,         // If true, only count tasks without claiming
 *   include_active?: boolean   // If true, include In Progress tasks in count
 * }
 * 
 * Returns:
 * - 200 OK with task data or count
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

  const isDryRun = requestBody.dry_run === true;
  const includeActive = requestBody.include_active === true;
  const workerId = requestBody.worker_id || `edge_${crypto.randomUUID()}`;

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
      
      if (isDryRun) {
        // Count eligible tasks without claiming
        const { data: countResult, error: countError } = await supabaseAdmin
          .rpc('count_eligible_tasks_service_role', {
            p_include_active: includeActive
          });

        if (countError) {
          console.error("Service role count error:", countError);
          throw countError;
        }

        console.log(`Service role dry-run: ${countResult} eligible tasks`);
        return new Response(JSON.stringify({ available_tasks: countResult }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } else {
        // Claim next eligible task
        const { data: claimResult, error: claimError } = await supabaseAdmin
          .rpc('claim_next_task_service_role', {
            p_worker_id: workerId,
            p_include_active: includeActive
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
                p_include_active: includeActive
              });
            
            if (analysis) {
              console.log('\n🔍 DETAILED ANALYSIS:');
              console.log(`Total ${includeActive ? 'queued + in progress' : 'queued'} tasks: ${analysis.total_tasks}`);
              console.log(`Eligible tasks: ${analysis.eligible_tasks}`);
              
              if (analysis.total_tasks > 0 && analysis.eligible_tasks === 0) {
                console.log('\n❌ WHY NO TASKS ARE READY:');
                const reasons = analysis.rejection_reasons || {};
                console.log(`  📊 Rejection reasons:`);
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
      
      if (isDryRun) {
        // Count eligible tasks for this user without claiming
        const { data: countResult, error: countError } = await supabaseAdmin
          .rpc('count_eligible_tasks_user', {
            p_user_id: callerId,
            p_include_active: includeActive
          });

        if (countError) {
          console.error("User count error:", countError);
          throw countError;
        }

        console.log(`User ${callerId} dry-run: ${countResult} eligible tasks`);
        return new Response(JSON.stringify({ available_tasks: countResult }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } else {
        // Claim next eligible task for this user
        const { data: claimResult, error: claimError } = await supabaseAdmin
          .rpc('claim_next_task_user', {
            p_user_id: callerId,
            p_include_active: includeActive
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
                p_include_active: includeActive
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
