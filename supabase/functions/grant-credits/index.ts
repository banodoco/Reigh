import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

/**
 * Edge function: grant-credits
 * 
 * Grants credits to a user (admin only, or welcome bonus)
 * 
 * POST /functions/v1/grant-credits
 * Headers: Authorization: Bearer <JWT>
 * Body: { 
 *   userId: string, 
 *   amount: number, 
 *   description?: string,
 *   isWelcomeBonus?: boolean 
 * }
 * 
 * Returns:
 * - 200 OK with transaction details
 * - 400 Bad Request if invalid input or welcome bonus already given
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if not admin (for non-welcome bonus)
 * - 500 Internal Server Error
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405,
      headers: corsHeaders,
    });
  }

  // ─── 1. Parse body ──────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { 
      status: 400,
      headers: corsHeaders,
    });
  }
  
  const { userId, amount, description, isWelcomeBonus = false } = body;
  if (!userId || !amount || typeof amount !== 'number' || amount <= 0) {
    return new Response("userId and positive amount are required", { 
      status: 400,
      headers: corsHeaders,
    });
  }

  // ─── 2. Extract authorization header ────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Missing or invalid Authorization header", { 
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { 
      status: 500,
      headers: corsHeaders,
    });
  }

  // ─── 3. Check authorization based on request type ──────────────
  const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;
  
  // For welcome bonus, allow authenticated users; for admin grants, require service role
  if (!isWelcomeBonus && !isServiceRole) {
    return new Response("Service role access required for admin grants", { 
      status: 403,
      headers: corsHeaders,
    });
  }

  // ─── 4. Create Supabase client ──────────────────────────────────
  const supabase = createClient(supabaseUrl, isServiceRole ? supabaseServiceKey : (Deno.env.get("SUPABASE_ANON_KEY") || ""));

  // Admin client (service role) for unrestricted queries
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ─── 5. Check and handle welcome bonus ──────────────────────────
    if (isWelcomeBonus) {
      // Get current user from JWT for welcome bonus
      let currentUserId: string;
      
      if (isServiceRole) {
        currentUserId = userId;
      } else {
        // Extract user ID from JWT for authenticated users
        const jwt = authHeader.replace("Bearer ", "");
        try {
          const payload = JSON.parse(atob(jwt.split('.')[1]));
          currentUserId = payload.sub;
        } catch (e) {
          return new Response("Invalid JWT token", { 
            status: 401,
            headers: corsHeaders,
          });
        }
      }

      // Ensure the user is requesting welcome bonus for themselves (unless service role)
      if (!isServiceRole && currentUserId !== userId) {
        return new Response("Users can only request welcome bonus for themselves", { 
          status: 403,
          headers: corsHeaders,
        });
      }

      // Check if user has already received welcome credits
      let { data: user, error: userError } = await adminClient
        .from('users')
        .select('given_credits')
        .eq('id', userId)
        .single();

      // If the user row doesn't exist yet, create it with default values
      if (userError && userError.code === 'PGRST116') { // no rows found
        console.log(`[WelcomeBonus] No user row found for ${userId}. Creating default user record...`);

        const { error: insertError } = await adminClient
          .from('users')
          .upsert({
            id: userId,
            name: '',
            email: '',
            credits: 0,
            given_credits: false,
          }, { onConflict: 'id' });

        if (insertError && insertError.code !== '23505') { // ignore duplicate key
          console.error('[WelcomeBonus] Failed to create user row:', insertError);
          return new Response(`Could not create user record: ${insertError.message}`, {
            status: 500,
            headers: corsHeaders,
          });
        }

        // Re-query to proceed with welcome bonus logic
        ({ data: user } = await adminClient
          .from('users')
          .select('given_credits')
          .eq('id', userId)
          .single());
        if (!user) {
          user = { given_credits: false } as any;
        }
      } else if (userError) {
        console.error('Error checking user:', userError);
        return new Response(`User not found: ${userError.message}`, { 
          status: 400,
          headers: corsHeaders,
        });
      }

      if (!user) {
        user = { given_credits: false } as any;
      }

      if (user.given_credits) {
        return new Response("Welcome bonus already given to this user", { 
          status: 400,
          headers: corsHeaders,
        });
      }

      // Grant welcome bonus and mark as given
      
      // Insert credit grant into ledger
      const { data: ledgerEntry, error: ledgerError } = await adminClient
        .from('credits_ledger')
        .insert({
          user_id: userId,
          amount: amount * 100, // Convert dollars to cents
          type: 'manual',
          metadata: {
            description: 'Welcome bonus',
            granted_by: isServiceRole ? 'service_role' : 'system',
            granted_at: new Date().toISOString(),
            is_welcome_bonus: true,
          },
        })
        .select()
        .single();

      if (ledgerError) {
        console.error("Error granting welcome credits:", ledgerError);
        return new Response(`Failed to grant welcome credits: ${ledgerError.message}`, { 
          status: 500,
          headers: corsHeaders,
        });
      }

      // Mark user as having received welcome credits
      const { error: updateError } = await adminClient
        .from('users')
        .update({ given_credits: true })
        .eq('id', userId);

      if (updateError) {
        console.error("Error updating user given_credits:", updateError);
        // Note: Credits were already given, so this is not a critical failure
      }

      console.log(`Welcome bonus granted: $${amount} to user ${userId}`);
      
      return new Response(JSON.stringify({
        success: true,
        transaction: ledgerEntry,
        message: `Welcome bonus of $${amount} granted successfully!`,
        isWelcomeBonus: true,
      }), {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // ─── 6. Handle regular admin credit grant ───────────────────────
    
    const { data: ledgerEntry, error: ledgerError } = await adminClient
      .from('credits_ledger')
      .insert({
        user_id: userId,
        amount: amount * 100, // Convert dollars to cents
        type: 'manual',
        metadata: {
          description: description || 'Admin credit grant',
          granted_by: 'service_role',
          granted_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (ledgerError) {
      console.error("Error granting credits:", ledgerError);
      return new Response(`Failed to grant credits: ${ledgerError.message}`, { 
        status: 500,
        headers: corsHeaders,
      });
    }

    console.log(`Credits granted: $${amount} to user ${userId} by service_role`);
    
    return new Response(JSON.stringify({
      success: true,
      transaction: ledgerEntry,
      message: `Successfully granted $${amount} credits to user ${userId}`,
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { 
      status: 500,
      headers: corsHeaders,
    });
  }
}); 