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
 * Edge function: setup-auto-topup
 * 
 * Creates/updates auto-top-up preferences and saves payment method
 * 
 * POST /functions/v1/setup-auto-topup
 * Headers: Authorization: Bearer <JWT>
 * Body: { 
 *   autoTopupEnabled: boolean,
 *   autoTopupAmount: number, // in dollars
 *   autoTopupThreshold: number, // in dollars
 *   stripeCustomerId?: string,
 *   stripePaymentMethodId?: string
 * }
 * 
 * Returns:
 * - 200 OK with success message
 * - 400 Bad Request if invalid parameters
 * - 401 Unauthorized if no valid token
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
  
  const { 
    autoTopupEnabled, 
    autoTopupAmount, 
    autoTopupThreshold,
    stripeCustomerId,
    stripePaymentMethodId 
  } = body;

  // Validate required fields
  if (typeof autoTopupEnabled !== 'boolean') {
    return jsonResponse({ error: "autoTopupEnabled must be a boolean" }, 400);
  }

  if (autoTopupEnabled) {
    if (!autoTopupAmount || typeof autoTopupAmount !== 'number' || autoTopupAmount < 5 || autoTopupAmount > 100) {
      return jsonResponse({ error: "autoTopupAmount must be a number between $5 and $100" }, 400);
    }
    if (!autoTopupThreshold || typeof autoTopupThreshold !== 'number' || autoTopupThreshold < 1) {
      return jsonResponse({ error: "autoTopupThreshold must be a positive number" }, 400);
    }
    if (autoTopupThreshold >= autoTopupAmount) {
      return jsonResponse({ error: "autoTopupThreshold must be less than autoTopupAmount" }, 400);
    }
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
    // ─── 5. Update user auto-top-up preferences ─────────────────────
    const updateData: any = {
      auto_topup_enabled: autoTopupEnabled,
    };

    if (autoTopupEnabled) {
      updateData.auto_topup_amount = Math.round(autoTopupAmount * 100); // Convert to cents
      updateData.auto_topup_threshold = Math.round(autoTopupThreshold * 100); // Convert to cents
      
      // If Stripe data provided, save it
      if (stripeCustomerId) {
        updateData.stripe_customer_id = stripeCustomerId;
      }
      if (stripePaymentMethodId) {
        updateData.stripe_payment_method_id = stripePaymentMethodId;
      }
    } else {
      // When disabling, clear the amounts but keep Stripe data for potential re-enable
      updateData.auto_topup_amount = null;
      updateData.auto_topup_threshold = null;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating user auto-top-up preferences:', updateError);
      return jsonResponse({ error: 'Failed to update preferences' }, 500);
    }

    console.log(`Auto-top-up preferences updated for user ${user.id}:`, {
      enabled: autoTopupEnabled,
      amount: autoTopupEnabled ? autoTopupAmount : null,
      threshold: autoTopupEnabled ? autoTopupThreshold : null,
    });

    return jsonResponse({
      success: true,
      message: autoTopupEnabled 
        ? `Auto-top-up enabled: $${autoTopupAmount} when balance drops below $${autoTopupThreshold}`
        : 'Auto-top-up disabled'
    });

  } catch (error) {
    console.error('Error in setup-auto-topup:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
