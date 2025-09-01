import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Edge function: complete-auto-topup-setup
 * 
 * Completes auto-top-up setup by extracting payment method from checkout session
 * Called after successful checkout with auto-top-up enabled
 * 
 * POST /functions/v1/complete-auto-topup-setup
 * Headers: Authorization: Bearer <service_role_key>
 * Body: { sessionId: string, userId: string }
 * 
 * Returns:
 * - 200 OK with payment method details
 * - 400 Bad Request if invalid parameters
 * - 500 Internal Server Error
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
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
  
  const { sessionId, userId } = body;

  if (!sessionId || !userId) {
    return jsonResponse({ error: "sessionId and userId are required" }, 400);
  }

  // ─── 2. Verify service role authentication ──────────────────────
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== serviceRoleKey) {
    return jsonResponse({ error: "Unauthorized - service role required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing required environment variables");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  // ─── 3. Create Supabase admin client ────────────────────────────
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // ─── 4. Initialize Stripe ───────────────────────────────────────
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY not set in environment");
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
    });

    // ─── 5. Retrieve checkout session and payment intent ────────────
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'setup_intent']
    });

    if (!session.payment_intent) {
      return jsonResponse({ error: "No payment intent found in session" }, 400);
    }

    // Get the payment intent with payment method details
    const paymentIntent = await stripe.paymentIntents.retrieve(
      session.payment_intent as string,
      { expand: ['payment_method'] }
    );

    if (!paymentIntent.customer) {
      return jsonResponse({ error: "No customer associated with payment intent" }, 400);
    }

    if (!paymentIntent.payment_method) {
      return jsonResponse({ error: "No payment method found" }, 400);
    }

    // ─── 6. Update user with complete Stripe information ─────────────
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        stripe_customer_id: paymentIntent.customer as string,
        stripe_payment_method_id: paymentIntent.payment_method.id,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user with payment method:', updateError);
      return jsonResponse({ error: 'Failed to save payment method' }, 500);
    }

    console.log('Auto-top-up setup completed:', {
      userId,
      sessionId,
      customerId: paymentIntent.customer,
      paymentMethodId: paymentIntent.payment_method.id,
      paymentMethodType: paymentIntent.payment_method.type,
    });

    return jsonResponse({
      success: true,
      customerId: paymentIntent.customer,
      paymentMethodId: paymentIntent.payment_method.id,
      paymentMethodType: paymentIntent.payment_method.type,
      message: 'Auto-top-up setup completed successfully'
    });

  } catch (error) {
    console.error('Error in complete-auto-topup-setup:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      return jsonResponse({
        error: 'Invalid Stripe request',
        message: error.message,
      }, 400);
    }

    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
