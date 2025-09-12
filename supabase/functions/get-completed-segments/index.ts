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
 */ const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405
    });
  }
  try {
    const body = await req.json();
    const { run_id, project_id } = body;
    console.log("[GetCompletedSegments] Request body:", JSON.stringify({ run_id, project_id }));
    
    if (!run_id) {
      return new Response("run_id is required", {
        status: 400
      });
    }
    // ─── Extract & validate Authorization header ──────────────────────────
    const authHeaderFull = req.headers.get("Authorization");
    if (!authHeaderFull?.startsWith("Bearer ")) {
      return new Response("Missing or invalid Authorization header", {
        status: 401
      });
    }
    const token = authHeaderFull.slice(7);
    // ─── Environment vars ─────────────────────────────────────────────────
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error("SUPABASE_URL or SERVICE_KEY missing in env");
      return new Response("Server configuration error", {
        status: 500
      });
    }
    // Admin client (always service role)
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    let isServiceRole = false;
    let callerId = null;
    // 1) Direct key match
    if (token === SERVICE_KEY) {
      isServiceRole = true;
    }
    // 2) JWT role check
    if (!isServiceRole) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payloadB64 = parts[1];
          const padded = payloadB64 + "=".repeat((4 - payloadB64.length % 4) % 4);
          const payload = JSON.parse(atob(padded));
          const role = payload.role || payload.app_metadata?.role;
          if ([
            "service_role",
            "supabase_admin"
          ].includes(role)) {
            isServiceRole = true;
          }
        }
      } catch (_) {
      /* ignore decode errors */ }
    }
    // 3) PAT lookup
    if (!isServiceRole) {
      const { data, error } = await supabaseAdmin.from("user_api_tokens").select("user_id").eq("token", token).single();
      if (error || !data) {
        return new Response("Invalid or expired token", {
          status: 403
        });
      }
      callerId = data.user_id;
    }
    // ─── Authorization for non-service callers ────────────────────────────
    let effectiveProjectId = project_id;
    console.log("[GetCompletedSegments] Auth check - isServiceRole:", isServiceRole, "callerId:", callerId, "effectiveProjectId:", effectiveProjectId);
    
    if (!isServiceRole) {
      if (!effectiveProjectId) {
        return new Response("project_id required for user tokens", {
          status: 400
        });
      }
      // Ensure caller owns the project
      const { data: proj, error: projErr } = await supabaseAdmin.from("projects").select("user_id").eq("id", effectiveProjectId).single();
      if (projErr || !proj) {
        console.log("[GetCompletedSegments] Project lookup failed:", projErr);
        return new Response("Project not found", {
          status: 404
        });
      }
      if (proj.user_id !== callerId) {
        console.log("[GetCompletedSegments] Project ownership mismatch - project.user_id:", proj.user_id, "callerId:", callerId);
        return new Response("Forbidden: You don't own this project", {
          status: 403
        });
      }
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
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({
      error: e.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
