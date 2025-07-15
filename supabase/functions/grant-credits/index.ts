import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

/**
 * Edge function: grant-credits
 * 
 * Grants credits to a user (admin only)
 * 
 * POST /functions/v1/grant-credits
 * Headers: Authorization: Bearer <JWT>
 * Body: { userId: string, amount: number, description?: string }
 * 
 * Returns:
 * - 200 OK with transaction details
 * - 400 Bad Request if invalid input
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if not admin
 * - 500 Internal Server Error
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ─── 1. Parse body ──────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  
  const { userId, amount, description } = body;
  if (!userId || !amount || typeof amount !== 'number' || amount <= 0) {
    return new Response("userId and positive amount are required", { status: 400 });
  }

  // ─── 2. Extract authorization header ────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Missing or invalid Authorization header", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // ─── 3. Create Supabase client with user's JWT for auth check ───
  const userSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: { Authorization: authHeader },
    },
  });

  // ─── 4. Verify user authentication ──────────────────────────────
  const { data: { user }, error: userError } = await userSupabase.auth.getUser();
  if (userError || !user) {
    return new Response("Authentication failed", { status: 401 });
  }

  // ─── 5. Check admin permissions ─────────────────────────────────
  // TODO: Add proper admin role check
  // For now, only allow in development mode
  const isAdmin = Deno.env.get("NODE_ENV") === 'development';
  if (!isAdmin) {
    return new Response("Admin access required", { status: 403 });
  }

  // ─── 6. Create admin Supabase client ────────────────────────────
  const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ─── 7. Insert credit grant into ledger ────────────────────────
    const { data: ledgerEntry, error: ledgerError } = await adminSupabase
      .from('credits_ledger')
      .insert({
        user_id: userId,
        amount: amount * 100, // Convert dollars to cents
        type: 'manual',
        metadata: {
          description: description || 'Admin credit grant',
          granted_by: user.id,
          granted_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (ledgerError) {
      console.error("Error granting credits:", ledgerError);
      return new Response(`Failed to grant credits: ${ledgerError.message}`, { status: 500 });
    }

    console.log(`Credits granted: ${amount} to user ${userId} by admin ${user.id}`);
    
    return new Response(JSON.stringify({
      success: true,
      transaction: ledgerEntry,
      message: `Successfully granted ${amount} credits to user ${userId}`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
}); 