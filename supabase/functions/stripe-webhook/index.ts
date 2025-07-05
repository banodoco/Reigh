/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
    },
  });
}

// Verify Stripe webhook signature
async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const elements = signature.split(',');
  const timestamp = elements.find(element => element.startsWith('t='))?.split('=')[1];
  const signatures = elements.filter(element => element.startsWith('v1='));
  
  if (!timestamp || signatures.length === 0) {
    return false;
  }
  
  const payloadForSigning = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature_bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadForSigning));
  const signature_hex = Array.from(new Uint8Array(signature_bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  return signatures.some(sig => sig.split('=')[1] === signature_hex);
}

// Credit packages configuration (must match the backend)
const CREDIT_PACKAGES = {
  'starter': { credits: 100, amount: 999 },
  'professional': { credits: 500, amount: 3999 },
  'enterprise': { credits: 1500, amount: 9999 },
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    
    if (!signature) {
      return jsonResponse({ error: 'Missing stripe-signature header' }, 400);
    }

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set in environment');
      return jsonResponse({ error: 'Webhook secret not configured' }, 500);
    }

    // Verify the webhook signature
    const isValid = await verifyStripeSignature(body, signature, webhookSecret);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return jsonResponse({ error: 'Invalid signature' }, 401);
    }

    const event = JSON.parse(body);
    console.log('Received Stripe event:', event.type);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        
        // Extract metadata from the session
        const { userId, packageId, credits } = session.metadata || {};
        
        if (!userId || !packageId || !credits) {
          console.error('Missing required metadata in checkout session:', session.metadata);
          return jsonResponse({ error: 'Missing required metadata' }, 400);
        }

        // Get package configuration to validate
        const packageConfig = CREDIT_PACKAGES[packageId as keyof typeof CREDIT_PACKAGES];
        if (!packageConfig) {
          console.error('Invalid package ID:', packageId);
          return jsonResponse({ error: 'Invalid package ID' }, 400);
        }

        // Validate credits amount
        const creditsAmount = parseInt(credits, 10);
        if (creditsAmount !== packageConfig.credits) {
          console.error(`Credits mismatch: expected ${packageConfig.credits}, got ${creditsAmount}`);
          return jsonResponse({ error: 'Credits amount mismatch' }, 400);
        }

        // Insert credit purchase into ledger
        const { data: ledgerEntry, error: ledgerError } = await supabaseAdmin
          .from('credits_ledger')
          .insert({
            user_id: userId,
            amount: creditsAmount,
            type: 'stripe',
            metadata: {
              stripe_session_id: session.id,
              package_id: packageId,
              amount_paid: session.amount_total,
              currency: session.currency,
            },
          })
          .select()
          .single();

        if (ledgerError) {
          console.error('Error creating credit ledger entry:', ledgerError);
          return jsonResponse({ error: 'Failed to create credit ledger entry' }, 500);
        }

        console.log('Successfully processed credit purchase:', {
          userId,
          credits: creditsAmount,
          packageId,
          sessionId: session.id,
        });

        break;

      case 'invoice.payment_succeeded':
        // Handle recurring subscription payments if needed in the future
        console.log('Invoice payment succeeded (not implemented yet)');
        break;

      case 'invoice.payment_failed':
        // Handle failed payments if needed
        console.log('Invoice payment failed (not implemented yet)');
        break;

      default:
        console.log('Unhandled event type:', event.type);
        break;
    }

    return jsonResponse({ received: true });

  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}); 