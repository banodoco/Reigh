// @ts-nocheck
/* eslint-disable */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    // Only accept POST requests
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Parse the request body
    const { channel, event, payload } = await req.json();

    if (!channel || !event || !payload) {
      return new Response("Missing required fields: channel, event, payload", { 
        status: 400 
      });
    }

    // Create Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Create a channel and send the broadcast
    const broadcastChannel = supabase.channel(channel);
    
    // Send the broadcast message
    const result = await broadcastChannel.send({
      type: 'broadcast',
      event: event,
      payload: payload
    });

    // Check if broadcast was successful
    if (result === 'ok') {
      console.log(`[BroadcastRealtime] Successfully broadcast to ${channel}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    } else {
      console.error(`[BroadcastRealtime] Broadcast failed:`, result);
      return new Response(JSON.stringify({ error: 'Broadcast failed', result }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

  } catch (error) {
    console.error("[BroadcastRealtime] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
