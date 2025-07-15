import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for server-side operations
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[WebSocket] Missing Supabase configuration for realtime broadcasts');
}

const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
  realtime: {
    timeout: 10000, // 10 second timeout for realtime operations
    heartbeatIntervalMs: 30000, // Send heartbeat every 30 seconds
  },
});

export function initializeWebSocketServer(): void {
  console.log('[WebSocket] Supabase Realtime broadcast service initialized');
}

interface BroadcastMessage {
  type: string;
  payload: {
    projectId: string;
    [key: string]: any;
  };
}

// Add retry logic and better error handling
export const broadcast = async (message: BroadcastMessage, retries: number = 3) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[WebSocket] Cannot broadcast message: Supabase configuration missing');
    return;
  }

  const channelName = `task-updates:${message.payload.projectId}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Create a new channel instance for each broadcast to avoid stale connections
      const channel = supabase.channel(channelName);
      
      // Use Promise.race to implement timeout
      const broadcastPromise = channel.send({
        type: 'broadcast',
        event: 'task-update',
        payload: message
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Broadcast timeout')), 5000); // 5 second timeout
      });

      const response = await Promise.race([broadcastPromise, timeoutPromise]);

      if (response === 'ok') {
        // console.log(`[WebSocket] Broadcasting message via Supabase Realtime on channel ${channelName}`);
        return; // Success, exit retry loop
      } else {
        throw new Error(`Broadcast failed with response: ${response}`);
      }
    } catch (error) {
      console.error(`[WebSocket] Broadcast attempt ${attempt}/${retries} failed:`, error);
      
      if (attempt === retries) {
        console.error(`[WebSocket] All broadcast attempts failed for channel ${channelName}. Final error:`, error);
        // Don't throw - we don't want to crash the server if broadcasts fail
      } else {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}; 