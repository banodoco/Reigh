// deno-lint-ignore-file
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

/**
 * Edge Function: get-completed-segments
 * Retrieves all completed travel_segment tasks for a given run_id.
 *
 * Auth rules:
 * - Service-role key: full access.
 * - JWT with service/admin role: full access.
 * - Personal access token (PAT): must resolve via user_api_tokens and caller must own the project_id supplied.
 *
 * Request (POST):
 * {
 *   "run_id": "string",            // required
 *   "project_id": "uuid"           // required for PAT / user JWT tokens
 * }
 *
 * Returns 200 with: [{ segment_index, output_location }]
 */
serve(async (req) => {
  // FIRST LOG - to see if function is even reached
  console.log("[CompletedSegmentsAuth] 🚀 FUNCTION ENTRY - Request received!");
  
  // Only accept POST requests (matching claim-next-task exactly)
  if (req.method !== "POST") {
    console.log("[CompletedSegmentsAuth] Non-POST request:", req.method);
    return new Response("Method not allowed", { status: 405 });
  }
  // Extract authorization header (matching claim-next-task exactly)
  const authHeader = req.headers.get("Authorization");
  console.log("[CompletedSegmentsAuth] Raw Authorization header:", authHeader ? `${authHeader.substring(0, 20)}...` : "null/undefined");
  
  if (!authHeader?.startsWith("Bearer ")) {
    console.log("[CompletedSegmentsAuth] ❌ Missing or invalid Authorization header format");
    return new Response("Missing or invalid Authorization header", { status: 401 });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  console.log("[CompletedSegmentsAuth] Extracted token length:", token.length, "prefix:", token.substring(0, 10) + "...");
  
  // Parse request body (keeping original JSON parsing for compatibility)
  let requestBody: any = {};
  try {
    requestBody = await req.json();
  } catch (e) {
    console.log("[CompletedSegmentsAuth] No valid JSON body provided, using defaults");
  }

  const { run_id, project_id } = requestBody;
  console.log("[CompletedSegmentsAuth] Request body:", JSON.stringify({ run_id, project_id }));
  
  if (!run_id) {
    return new Response("run_id is required", { status: 400 });
  }

  // Get environment variables (matching claim-next-task pattern)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[CompletedSegmentsAuth] Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // Create admin client for database operations
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let callerId: string | null = null;
  let isServiceRole = false;

  // 1) Check if token matches service-role key directly (matching claim-next-task pattern)
  console.log(`🔍 DEBUG: Comparing tokens...`);
  console.log(`🔍 DEBUG: Received token: ${token.substring(0, 10)}... (length: ${token.length})`);
  console.log(`🔍 DEBUG: Service key exists: ${!!serviceKey}`);
  console.log(`🔍 DEBUG: Service key length: ${serviceKey?.length || 0}`);
  console.log(`🔍 DEBUG: Tokens match: ${token === serviceKey}`);
  
  if (token === serviceKey) {
    isServiceRole = true;
    console.log("[CompletedSegmentsAuth] [SERVICE_ROLE] Direct service-role key match");
  }

  // 2) If not service key, try to decode as JWT and check role (matching claim-next-task pattern)
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
          console.log("[CompletedSegmentsAuth] [SERVICE_ROLE] JWT has service-role/admin role");
        }
      }
    } catch (e) {
      // Not a valid JWT - will be treated as PAT
      console.log("[CompletedSegmentsAuth] [PERSONAL_ACCESS_TOKEN] Token is not a valid JWT, treating as PAT");
    }
  }

  // 3) USER TOKEN PATH - resolve callerId via user_api_token table (matching claim-next-task pattern)
  if (!isServiceRole) {
    console.log("[CompletedSegmentsAuth] [PERSONAL_ACCESS_TOKEN] Looking up token in user_api_token table...");
    
    try {
      // Query user_api_tokens table to find user
      const { data, error } = await supabaseAdmin
        .from("user_api_tokens")
        .select("user_id")
        .eq("token", token)
        .single();

      if (error || !data) {
        console.error("[CompletedSegmentsAuth] Token lookup failed:", error);
        return new Response("Invalid or expired token", { status: 403 });
      }

      callerId = data.user_id;
      console.log(`[CompletedSegmentsAuth] [PERSONAL_ACCESS_TOKEN] Token resolved to user ID: ${callerId}`);
    } catch (e) {
      console.error("[CompletedSegmentsAuth] Error querying user_api_token:", e);
      return new Response("Token validation failed", { status: 403 });
    }
  }

  try {
    // ─── Authorization for non-service callers ────────────────────────────
    let effectiveProjectId = project_id;
    console.log("[CompletedSegmentsAuth] === Authentication Summary ===");
    console.log("[CompletedSegmentsAuth] isServiceRole:", isServiceRole, "callerId:", callerId, "effectiveProjectId:", effectiveProjectId);
    
    if (!isServiceRole) {
      console.log("[CompletedSegmentsAuth] Non-service role - checking project ownership...");
      if (!effectiveProjectId) {
        console.log("[CompletedSegmentsAuth] ❌ Missing project_id for user token");
        return new Response("project_id required for user tokens", {
          status: 400
        });
      }
      // Ensure caller owns the project
      console.log("[CompletedSegmentsAuth] Looking up project ownership for project_id:", effectiveProjectId);
      const { data: proj, error: projErr } = await supabaseAdmin.from("projects").select("user_id").eq("id", effectiveProjectId).single();
      console.log("[CompletedSegmentsAuth] Project lookup result - error:", projErr, "project data:", proj);
      
      if (projErr || !proj) {
        console.log("[CompletedSegmentsAuth] ❌ Project lookup failed:", projErr);
        return new Response("Project not found", {
          status: 404
        });
      }
      if (proj.user_id !== callerId) {
        console.log("[CompletedSegmentsAuth] ❌ Project ownership mismatch - project.user_id:", proj.user_id, "callerId:", callerId);
        return new Response("Forbidden: You don't own this project", {
          status: 403
        });
      }
      console.log("[CompletedSegmentsAuth] ✅ Project ownership verified");
    } else {
      console.log("[CompletedSegmentsAuth] ✅ Service role - skipping project ownership check");
    }
    // ─── Query completed segments ─────────────────────────────────────────
    let query = supabaseAdmin.from("tasks")
      .select("params, output_location")
      .eq("task_type", "travel_segment")
      .eq("status", "Complete")
      .eq("params->>orchestrator_run_id", run_id)
      .limit(1000); // Safeguard against extremely large result sets
    
    if (!isServiceRole) {
      query = query.eq("project_id", effectiveProjectId);
    }
    
    console.log("[GetCompletedSegments] Query filters - task_type: travel_segment, status: Complete, orchestrator_run_id:", run_id, "project_id:", !isServiceRole ? effectiveProjectId : "(no project filter - service role)");
    console.log("[GetCompletedSegments] run_id type:", typeof run_id, "run_id value:", JSON.stringify(run_id));
    console.log("[GetCompletedSegments] Exact query being executed:");
    console.log("[GetCompletedSegments] - .eq('task_type', 'travel_segment')");
    console.log("[GetCompletedSegments] - .eq('status', 'Complete')");
    console.log("[GetCompletedSegments] - .eq('params->orchestrator_run_id',", JSON.stringify(run_id), ")");
    console.log("[GetCompletedSegments] - .limit(1000)");
    
    // Let's also test a broader query to see what's actually in the database
    console.log("[GetCompletedSegments] Testing broader query first...");
    const testQuery = supabaseAdmin.from("tasks")
      .select("params, output_location, task_type, status, project_id")
      .eq("task_type", "travel_segment")
      .limit(5);
    
    if (!isServiceRole) {
      testQuery.eq("project_id", effectiveProjectId);
    }
    
    const { data: testRows, error: testErr } = await testQuery;
    console.log("[GetCompletedSegments] Test query results - found", testRows?.length || 0, "travel_segment rows");
    if (testErr) {
      console.error("[GetCompletedSegments] Test query error:", testErr);
    } else {
      console.log("[GetCompletedSegments] Sample travel_segment rows:", JSON.stringify(testRows?.slice(0, 2), null, 2));
    }
    
    const { data: rows, error: qErr } = await query;
    if (qErr) {
      console.error("[GetCompletedSegments] Database query error:", qErr);
      return new Response("Database query error", {
        status: 500
      });
    }
    
    console.log("[GetCompletedSegments] Raw query results - found", rows?.length || 0, "rows");
    console.log("[GetCompletedSegments] Raw rows:", JSON.stringify(rows, null, 2));
    
    // If no rows found, let's check what orchestrator_run_ids actually exist
    if (!rows || rows.length === 0) {
      console.log("[GetCompletedSegments] No rows found, checking what exists for this run_id...");
      
      // Check if ANY tasks exist for this run_id (any status)
      const anyTasksQuery = supabaseAdmin.from("tasks")
        .select("task_type, status, params")
        .eq("task_type", "travel_segment")
        .eq("params->>orchestrator_run_id", run_id)
        .limit(10);
        
      // Let's test the exact same query but without the status filter
      console.log("[GetCompletedSegments] Testing same query without status filter...");
      const testExactQuery = supabaseAdmin.from("tasks")
        .select("task_type, status, params, output_location")
        .eq("task_type", "travel_segment")
        .eq("params->>orchestrator_run_id", run_id)
        .limit(5);
        
      const { data: testExactData, error: testExactErr } = await testExactQuery;
      if (testExactErr) {
        console.error("[GetCompletedSegments] Test exact query error:", testExactErr);
      } else {
        console.log("[GetCompletedSegments] Test exact query found", testExactData?.length || 0, "tasks");
        console.log("[GetCompletedSegments] Test exact query results:", JSON.stringify(testExactData, null, 2));
      }
      
      const { data: anyTasks, error: anyTasksErr } = await anyTasksQuery;
      if (anyTasksErr) {
        console.error("[GetCompletedSegments] Any tasks check error:", anyTasksErr);
      } else {
        console.log("[GetCompletedSegments] Found", anyTasks?.length || 0, "travel_segment tasks for run_id:", run_id);
        if (anyTasks && anyTasks.length > 0) {
          const statusCounts = anyTasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          console.log("[GetCompletedSegments] Status breakdown for run_id:", run_id, "->", JSON.stringify(statusCounts));
        } else {
          console.log("[GetCompletedSegments] No travel_segment tasks found at all for run_id:", run_id);
        }
      }
      
      // Also show what completed run_ids exist
      const runIdCheckQuery = supabaseAdmin.from("tasks")
        .select("params")
        .eq("task_type", "travel_segment")
        .eq("status", "Complete")
        .limit(10);
      
      const { data: runIdRows, error: runIdErr } = await runIdCheckQuery;
      if (runIdErr) {
        console.error("[GetCompletedSegments] RunID check query error:", runIdErr);
      } else {
        console.log("[GetCompletedSegments] Found", runIdRows?.length || 0, "completed travel_segment tasks");
        const runIds = runIdRows?.map(row => {
          const params = typeof row.params === "string" ? JSON.parse(row.params) : row.params;
          return params?.orchestrator_run_id;
        }).filter(Boolean);
        console.log("[GetCompletedSegments] Available orchestrator_run_ids:", JSON.stringify([...new Set(runIds)])); // Remove duplicates
        console.log("[GetCompletedSegments] Looking for run_id:", run_id);
        console.log("[GetCompletedSegments] Match found:", runIds?.includes(run_id));
      }
    }
    const results: { segment_index: number; output_location: string }[] = [];
    console.log("[GetCompletedSegments] Processing rows for run_id:", run_id);
    
    for (const row of rows ?? []){
      const paramsObj = typeof row.params === "string" ? JSON.parse(row.params) : row.params;
      console.log("[GetCompletedSegments] Processing row - params:", JSON.stringify(paramsObj), "output_location:", row.output_location);
      
      const hasValidSegmentIndex = typeof paramsObj.segment_index === "number";
      const hasOutputLocation = !!row.output_location;
      
      console.log("[GetCompletedSegments] Row checks - valid segment_index:", hasValidSegmentIndex, 
                  "(got:", paramsObj.segment_index, "type:", typeof paramsObj.segment_index, ")",
                  "has output_location:", hasOutputLocation);
      
      if (hasValidSegmentIndex && hasOutputLocation) {
        console.log("[GetCompletedSegments] ✓ Adding row to results");
        results.push({
          segment_index: paramsObj.segment_index,
          output_location: row.output_location
        });
      } else {
        console.log("[GetCompletedSegments] ✗ Skipping row - failed conditions");
      }
    }
    
    console.log("[GetCompletedSegments] Final results before sorting:", JSON.stringify(results));
    results.sort((a, b)=>a.segment_index - b.segment_index);
    console.log("[GetCompletedSegments] Final sorted results:", JSON.stringify(results));
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("[CompletedSegmentsAuth] ❌ UNEXPECTED ERROR occurred:", e);
    console.error("[CompletedSegmentsAuth] Error stack:", e.stack);
    console.error("[CompletedSegmentsAuth] Error name:", e.name);
    console.error("[CompletedSegmentsAuth] Error message:", e.message);
    
    // If this is an auth-related error that might cause 401, let's be specific
    if (e.message && (e.message.includes("auth") || e.message.includes("token") || e.message.includes("unauthorized"))) {
      console.error("[CompletedSegmentsAuth] This appears to be an auth-related error!");
      return new Response(JSON.stringify({
        error: "Authentication error: " + e.message
      }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response(JSON.stringify({
      error: e.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

