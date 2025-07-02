/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      persistSession: false,
    },
  },
);

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

serve(async (req) => {
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Parse query parameters
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const statusFilter = url.searchParams.getAll("status[]").length > 0 
    ? url.searchParams.getAll("status[]") 
    : url.searchParams.get("status")?.split(",") || [];

  if (!projectId) {
    return jsonResponse({ error: "projectId is required" }, 400);
  }

  try {
    // Build query
    let query = supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    // Apply status filter if provided
    if (statusFilter.length > 0) {
      query = query.in("status", statusFilter);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("[tasks-list] Query error:", error);
      return jsonResponse({ error: "Failed to fetch tasks", details: error.message }, 500);
    }

    return jsonResponse(tasks || []);
  } catch (err: any) {
    console.error("[tasks-list] Unexpected error:", err?.message);
    return jsonResponse({ error: "Internal server error", details: err?.message }, 500);
  }
}); 