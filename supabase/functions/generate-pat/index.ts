/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

// Generate a cryptographically secure random 32-character token
function generateToken(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint8Array(32);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (v) => charset[v % charset.length]).join('');
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
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return jsonResponse({ error: 'No authorization header' }, 401);
    }

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

    const token = authorization.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid authentication token' }, 401);
    }

    const { label } = await req.json();

    // Generate a cryptographically secure 32-character token
    const apiToken = generateToken();

    // Store token metadata
    const { error: insertError } = await supabaseAdmin
      .from('user_api_tokens')
      .insert({
        user_id: user.id,
        token: apiToken,
        label: label || 'API Token',
      });

    if (insertError) {
      console.error('Error storing token metadata:', insertError);
      return jsonResponse({ error: 'Failed to store token metadata', details: insertError.message }, 500);
    }

    return jsonResponse({ 
      token: apiToken,
    });

  } catch (error) {
    console.error('Error in generate-pat function:', error.message);
    return jsonResponse({ error: error.message }, 500);
  }
}); 