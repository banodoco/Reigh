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
        const { userId, amount } = session.metadata || {};
        
        if (!userId || !amount) {
          console.error('Missing required metadata in checkout session:', session.metadata);
          return jsonResponse({ error: 'Missing required metadata' }, 400);
        }

        // Validate amount matches what was paid
        const dollarAmount = parseFloat(amount);
        const expectedCents = dollarAmount * 100;
        
        if (session.amount_total !== expectedCents) {
          console.error(`Amount mismatch: expected ${expectedCents} cents, got ${session.amount_total} cents`);
          return jsonResponse({ error: 'Amount mismatch' }, 400);
        }

        // Insert budget purchase into ledger
        const { data: ledgerEntry, error: ledgerError } = await supabaseAdmin
          .from('credits_ledger')
          .insert({
            user_id: userId,
            amount: session.amount_total, // Amount in cents
            type: 'stripe',
            metadata: {
              stripe_session_id: session.id,
              amount_paid: session.amount_total,
              currency: session.currency,
              dollar_amount: dollarAmount,
            },
          })
          .select()
          .single();

        if (ledgerError) {
          console.error('Error creating budget ledger entry:', ledgerError);
          return jsonResponse({ error: 'Failed to create budget ledger entry' }, 500);
        }

        console.log('Successfully processed budget purchase:', {
          userId,
          amountCents: session.amount_total,
          dollarAmount,
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