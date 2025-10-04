import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { 
    auth: { 
      persistSession: false,
      storageKey: 'sb-admin-auth' // Use unique storage key to avoid GoTrueClient conflicts
    } 
  }
); 