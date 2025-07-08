import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for server-side operations
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[WebSocket] Missing Supabase configuration for realtime broadcasts');
}

const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

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

export const broadcast = async (message: BroadcastMessage) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[WebSocket] Cannot broadcast message: Supabase configuration missing');
    return;
  }

  try {
    // Always use project-specific channel
    const channelName = `task-updates:${message.payload.projectId}`;
    
    const response = await supabase
      .channel(channelName)
      .send({
        type: 'broadcast',
        event: 'task-update',
        payload: message
      });

    if (response === 'ok') {
      // console.log(`[WebSocket] Broadcasting message via Supabase Realtime on channel ${channelName}`);
    } else {
      console.error('[WebSocket] Error broadcasting message via Supabase Realtime:', response);
    }
  } catch (error) {
    console.error('[WebSocket] Error broadcasting message via Supabase Realtime:', error);
  }
}; 