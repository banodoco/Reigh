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
 * Edge function: process-auto-topup
 * 
 * Processes automatic credit top-up using saved payment method
 * 
 * POST /functions/v1/process-auto-topup
 * Headers: Authorization: Bearer <service_role_key>
 * Body: { userId: string }
 * 
 * Returns:
 * - 200 OK with payment details
 * - 400 Bad Request if invalid parameters or user not eligible
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
  
  const { userId } = body;

  if (!userId || typeof userId !== 'string') {
    return jsonResponse({ error: "userId is required and must be a string" }, 400);
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
    // ─── 4. Get user auto-top-up settings ───────────────────────────
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        credits,
        auto_topup_enabled,
        auto_topup_amount,
        auto_topup_threshold,
        auto_topup_last_triggered,
        stripe_customer_id,
        stripe_payment_method_id,
        email
      `)
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userError);
      return jsonResponse({ error: 'User not found' }, 400);
    }

    // ─── 5. Validate eligibility ────────────────────────────────────
    if (!user.auto_topup_enabled) {
      return jsonResponse({ error: 'Auto-top-up not enabled for user' }, 400);
    }

    if (!user.stripe_customer_id || !user.stripe_payment_method_id) {
      return jsonResponse({ error: 'Payment method not configured' }, 400);
    }

    if (!user.auto_topup_amount || !user.auto_topup_threshold) {
      return jsonResponse({ error: 'Auto-top-up amounts not configured' }, 400);
    }

    // Check if balance is still above threshold (may have changed since trigger)
    if (user.credits > user.auto_topup_threshold) {
      return jsonResponse({ 
        message: 'Balance above threshold, auto-top-up not needed',
        currentBalance: user.credits,
        threshold: user.auto_topup_threshold
      });
    }

    // Rate limiting check
    if (user.auto_topup_last_triggered) {
      const timeSinceLastTrigger = Date.now() - new Date(user.auto_topup_last_triggered).getTime();
      const oneHourInMs = 60 * 60 * 1000;
      
      if (timeSinceLastTrigger < oneHourInMs) {
        return jsonResponse({ 
          error: 'Auto-top-up rate limited - too soon since last trigger',
          lastTriggered: user.auto_topup_last_triggered
        }, 400);
      }
    }

    // ─── 6. Initialize Stripe and create Payment Intent ─────────────
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY not set in environment");
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
    });

    // Create off-session payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: user.auto_topup_amount, // Already in cents
      currency: "usd",
      customer: user.stripe_customer_id,
      payment_method: user.stripe_payment_method_id,
      confirmation_method: "automatic",
      confirm: true,
      off_session: true, // This indicates it's an automatic payment
      metadata: {
        userId: user.id,
        autoTopup: "true",
        originalBalance: user.credits.toString(),
        topupAmount: user.auto_topup_amount.toString(),
      },
      description: `Auto-top-up: $${(user.auto_topup_amount / 100).toFixed(2)} credits for ${user.email}`,
    });

    // ─── 7. Handle payment result ───────────────────────────────────
    if (paymentIntent.status === 'succeeded') {
      // Insert successful auto-top-up into ledger
      const { error: ledgerError } = await supabaseAdmin
        .from('credits_ledger')
        .insert({
          user_id: userId,
          amount: user.auto_topup_amount,
          type: 'auto_topup',
          metadata: {
            stripe_payment_intent_id: paymentIntent.id,
            amount_paid: paymentIntent.amount_received,
            currency: paymentIntent.currency,
            dollar_amount: user.auto_topup_amount / 100,
            original_balance: user.credits,
            auto_topup_trigger: true,
          },
        });

      if (ledgerError) {
        console.error('Error creating auto-top-up ledger entry:', ledgerError);
        // Payment succeeded but ledger failed - this is critical
        return jsonResponse({ error: 'Payment succeeded but failed to update credits' }, 500);
      }

      console.log('Auto-top-up succeeded:', {
        userId,
        paymentIntentId: paymentIntent.id,
        amount: user.auto_topup_amount,
        originalBalance: user.credits,
      });

      return jsonResponse({
        success: true,
        paymentIntentId: paymentIntent.id,
        amount: user.auto_topup_amount,
        dollarAmount: user.auto_topup_amount / 100,
        originalBalance: user.credits,
        message: `Auto-topped up $${(user.auto_topup_amount / 100).toFixed(2)}`
      });

    } else {
      // Payment failed
      console.error('Auto-top-up payment failed:', {
        userId,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        lastPaymentError: paymentIntent.last_payment_error,
      });

      // Consider disabling auto-top-up on certain failure types
      if (paymentIntent.last_payment_error?.code === 'card_declined' ||
          paymentIntent.last_payment_error?.code === 'expired_card') {
        
        // Disable auto-top-up to prevent repeated failures
        await supabaseAdmin
          .from('users')
          .update({ auto_topup_enabled: false })
          .eq('id', userId);

        console.log(`Auto-top-up disabled for user ${userId} due to payment failure`);
      }

      return jsonResponse({
        error: 'Auto-top-up payment failed',
        paymentIntentId: paymentIntent.id,
        failureCode: paymentIntent.last_payment_error?.code,
        failureMessage: paymentIntent.last_payment_error?.message,
      }, 400);
    }

  } catch (error) {
    console.error('Error in process-auto-topup:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return jsonResponse({
        error: 'Card error during auto-top-up',
        code: error.code,
        message: error.message,
      }, 400);
    }

    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
