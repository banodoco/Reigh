import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

/**
 * Edge function: stripe-checkout
 * 
 * Creates a Stripe checkout session for credit purchases
 * 
 * POST /functions/v1/stripe-checkout
 * Headers: Authorization: Bearer <JWT>
 * Body: { amount: number } // Dollar amount
 * 
 * Returns:
 * - 200 OK with checkout URL
 * - 400 Bad Request if invalid amount
 * - 401 Unauthorized if no valid token
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
  
  const { amount } = body;
  if (!amount || typeof amount !== 'number' || amount < 10 || amount > 100) {
    return new Response("Amount must be a number between 10 and 100", { status: 400 });
  }

  // ─── 2. Extract authorization header ────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Missing or invalid Authorization header", { status: 401 });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing required environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // ─── 3. Create Supabase client with user's JWT ─────────────────
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  });

  // ─── 4. Verify user authentication ──────────────────────────────
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response("Authentication failed", { status: 401 });
  }

  try {
    // ─── 5. Create Stripe checkout session ─────────────────────────
    // For now, return a placeholder response since Stripe integration needs to be set up
    // TODO: Replace with actual Stripe integration
    const checkoutUrl = `https://checkout.stripe.com/placeholder?amount=${amount}&user=${user.id}`;
    
    console.log(`Stripe checkout requested for user ${user.id}: $${amount}`);
    
    return new Response(JSON.stringify({
      checkoutUrl,
      message: `Stripe integration not yet configured. Would create checkout for $${amount}`,
      amount,
      userId: user.id
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
}); 