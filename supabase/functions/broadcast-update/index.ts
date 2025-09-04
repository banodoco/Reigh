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
    const { project_id, table, record_id, event_type, data } = await req.json();

    if (!project_id || !table || !event_type) {
      return new Response("Missing required fields: project_id, table, event_type", { 
        status: 400 
      });
    }

    // Create Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Create project-specific channel
    const channelName = `project:${project_id}`;
    const broadcastChannel = supabase.channel(channelName);
    
    // Prepare the payload
    const payload = {
      table,
      event_type,
      record_id,
      data,
      timestamp: new Date().toISOString()
    };

    // Send the broadcast message
    const result = await broadcastChannel.send({
      type: 'broadcast',
      event: `${table}_${event_type}`,
      payload: payload
    });

    // Check if broadcast was successful
    if (result === 'ok') {
      console.log(`[BroadcastUpdate] Successfully broadcast ${table}_${event_type} to ${channelName}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    } else {
      console.error(`[BroadcastUpdate] Broadcast failed:`, result);
      return new Response(JSON.stringify({ error: 'Broadcast failed', result }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

  } catch (error) {
    console.error("[BroadcastUpdate] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
