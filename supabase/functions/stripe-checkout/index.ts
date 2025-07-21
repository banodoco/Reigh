import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ─── 1. Parse body ──────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  
  const { amount } = body;
  if (!amount || typeof amount !== 'number' || amount < 5 || amount > 100) {
    return jsonResponse({ error: "Amount must be a number between $5 and $100" }, 400);
  }

  // ─── 2. Extract authorization header ────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing required environment variables");
    return jsonResponse({ error: "Server configuration error" }, 500);
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
    return jsonResponse({ error: "Authentication failed" }, 401);
  }

  try {
    // ─── 5. Initialize Stripe and create checkout session ─────────────────────────
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const frontendUrl = Deno.env.get("FRONTEND_URL");
    
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY not set in environment");
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }

    if (!frontendUrl) {
      console.error("FRONTEND_URL not set in environment");
      return jsonResponse({ error: "Frontend URL not configured" }, 500);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { 
              name: "Reigh Credits",
              description: `${amount} credits for AI generation tasks`
            },
            unit_amount: amount * 100, // Convert dollars to cents
          },
          quantity: 1,
        },
      ],
      metadata: { 
        userId: user.id, 
        amount: amount.toString() 
      },
      success_url: `${frontendUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payments/cancel`,
      customer_email: user.email || undefined,
    });

    console.log(`Stripe checkout session created for user ${user.id}: $${amount} (session: ${session.id})`);
    
    return jsonResponse({
      checkoutUrl: session.url,
      sessionId: session.id,
      amount,
      userId: user.id
    });

  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    return jsonResponse({ error: `Internal server error: ${error.message}` }, 500);
  }
}); 