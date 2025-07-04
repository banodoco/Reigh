/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.2/mod.ts";

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

    const { label, expiresInDays = 90 } = await req.json();

    // Debug: List all environment variables
    console.log('Available environment variables:', Object.keys(Deno.env.toObject()));
    
    const jwtSecret = Deno.env.get('JWT_SECRET');
    console.log('JWT_SECRET value:', jwtSecret ? 'SET' : 'NOT SET');
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not set in Edge Function secrets.');
    }

    const jti = crypto.randomUUID();
    const now = new Date();
    const expiryDate = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
    const exp = getNumericDate(expiryDate);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const payload = {
      sub: user.id,
      role: 'authenticated',
      aud: 'authenticated',
      jti: jti,
      exp: exp,
      iss: 'supabase',
      iat: getNumericDate(now),
      email: user.email,
      app_metadata: user.app_metadata || {},
      user_metadata: user.user_metadata || {}
    };

    const jwt = await create({ alg: "HS256", typ: "JWT" }, payload, key);

    const encoder = new TextEncoder();
    const jtiHashBuffer = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(jti)
    );
    const jtiHash = Array.from(new Uint8Array(jtiHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { error: insertError } = await supabaseAdmin
      .from('user_api_tokens')
      .insert({
        user_id: user.id,
        jti_hash: jtiHash,
        token: jwt,
        label: label || 'API Token',
        expires_at: expiryDate.toISOString()
      });

    if (insertError) {
      console.error('Error storing token metadata:', insertError);
      return jsonResponse({ error: 'Failed to store token metadata', details: insertError.message }, 500);
    }

    return jsonResponse({ 
      token: jwt,
      expires_at: expiryDate.toISOString(),
    });

  } catch (error) {
    console.error('Error in generate-pat function:', error.message);
    return jsonResponse({ error: error.message }, 500);
  }
}); 