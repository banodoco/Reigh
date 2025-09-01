import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
 * Edge function: trigger-auto-topup
 * 
 * Triggers auto-top-up for users whose balance has dropped below threshold
 * This function is called by database triggers or scheduled jobs
 * 
 * POST /functions/v1/trigger-auto-topup
 * Headers: Authorization: Bearer <service_role_key>
 * Body: { userId?: string } // Optional - if not provided, checks all eligible users
 * 
 * Returns:
 * - 200 OK with processing results
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
  
  const { userId } = body;

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
    let usersToProcess: any[] = [];

    if (userId) {
      // Process specific user
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select(`
          id,
          credits,
          auto_topup_enabled,
          auto_topup_setup_completed,
          auto_topup_amount,
          auto_topup_threshold,
          auto_topup_last_triggered,
          stripe_customer_id,
          stripe_payment_method_id
        `)
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('Error fetching user:', userError);
        return jsonResponse({ error: 'User not found' }, 400);
      }

      if (user) {
        usersToProcess = [user];
      }
    } else {
      // Find all users eligible for auto-top-up
      const { data: users, error: usersError } = await supabaseAdmin
        .from('users')
        .select(`
          id,
          credits,
          auto_topup_enabled,
          auto_topup_setup_completed,
          auto_topup_amount,
          auto_topup_threshold,
          auto_topup_last_triggered,
          stripe_customer_id,
          stripe_payment_method_id
        `)
        .eq('auto_topup_enabled', true)
        .eq('auto_topup_setup_completed', true)
        .not('stripe_customer_id', 'is', null)
        .not('stripe_payment_method_id', 'is', null)
        .not('auto_topup_threshold', 'is', null);

      if (usersError) {
        console.error('Error fetching eligible users:', usersError);
        return jsonResponse({ error: 'Failed to fetch eligible users' }, 500);
      }

      // Filter users whose balance is below threshold
      usersToProcess = (users || []).filter(user => 
        user.credits <= user.auto_topup_threshold
      );
    }

    console.log(`Found ${usersToProcess.length} users eligible for auto-top-up`);

    const results = [];

    // Process each eligible user
    for (const user of usersToProcess) {
      try {
        // Check rate limiting
        if (user.auto_topup_last_triggered) {
          const lastTriggered = new Date(user.auto_topup_last_triggered);
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          
          if (lastTriggered > oneHourAgo) {
            console.log(`Rate limited: User ${user.id} auto-topped up within last hour`);
            results.push({
              userId: user.id,
              status: 'rate_limited',
              message: 'Auto-top-up triggered within last hour'
            });
            continue;
          }
        }

        // Call process-auto-topup function
        const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-auto-topup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ userId: user.id }),
        });

        const processResult = await processResponse.json();

        if (processResponse.ok && processResult.success) {
          results.push({
            userId: user.id,
            status: 'success',
            amount: processResult.amount,
            dollarAmount: processResult.dollarAmount,
            paymentIntentId: processResult.paymentIntentId,
          });
          console.log(`Auto-top-up successful for user ${user.id}: $${processResult.dollarAmount}`);
        } else {
          results.push({
            userId: user.id,
            status: 'failed',
            error: processResult.error || 'Unknown error',
            message: processResult.message,
          });
          console.error(`Auto-top-up failed for user ${user.id}:`, processResult.error);
        }

      } catch (error) {
        results.push({
          userId: user.id,
          status: 'error',
          error: error.message,
        });
        console.error(`Error processing auto-top-up for user ${user.id}:`, error);
      }
    }

    // Summary statistics
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const rateLimitedCount = results.filter(r => r.status === 'rate_limited').length;

    console.log('Auto-top-up processing summary:', {
      totalProcessed: results.length,
      successful: successCount,
      failed: failedCount,
      errors: errorCount,
      rateLimited: rateLimitedCount,
    });

    return jsonResponse({
      success: true,
      summary: {
        totalProcessed: results.length,
        successful: successCount,
        failed: failedCount,
        errors: errorCount,
        rateLimited: rateLimitedCount,
      },
      results: results,
    });

  } catch (error) {
    console.error('Error in trigger-auto-topup:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
