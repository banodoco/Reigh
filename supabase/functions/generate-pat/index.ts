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

// Base64 URL encode function
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Create JWT manually using Web Crypto API
async function createJWT(payload: any, secret: string): Promise<string> {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${unsignedToken}.${encodedSignature}`;
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

    const now = Math.floor(Date.now() / 1000);
    const exp = now + expiresInDays * 24 * 60 * 60;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const sessionId = crypto.randomUUID();

    // Create JWT payload that exactly matches Supabase's format
    const payload = {
      aud: "authenticated",
      exp: exp,
      iat: now,
      iss: `${supabaseUrl}/auth/v1`,
      sub: user.id,
      email: user.email,
      phone: user.phone || "",
      app_metadata: user.app_metadata || {},
      user_metadata: user.user_metadata || {},
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "password", timestamp: now }],
      session_id: sessionId,
      is_anonymous: false,
      email_verified: user.email_confirmed_at ? true : false,
      phone_verified: user.phone_confirmed_at ? true : false,
    };

    // Get JWT secret
    const jwtSecret = Deno.env.get('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET env var not set in Edge Function secrets');
    }

    // Create JWT using manual implementation
    const jwt = await createJWT(payload, jwtSecret.trim());

    // Store token metadata
    const jti = crypto.randomUUID();
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
        expires_at: new Date(exp * 1000).toISOString()
      });

    if (insertError) {
      console.error('Error storing token metadata:', insertError);
      return jsonResponse({ error: 'Failed to store token metadata', details: insertError.message }, 500);
    }

    return jsonResponse({ 
      token: jwt,
      expires_at: new Date(exp * 1000).toISOString(),
    });

  } catch (error) {
    console.error('Error in generate-pat function:', error.message);
    return jsonResponse({ error: error.message }, 500);
  }
}); 