import { supabase } from '@/integrations/supabase/client';

// This file previously contained Express API utilities (fetchWithAuth) but all API calls
// have been migrated to direct Supabase database calls and Edge Functions.
// 
// The main API functionality is now handled by:
// - Direct supabase.from() calls for database operations
// - supabase.functions.invoke() calls for Edge Functions
// - Real-time subscriptions via supabase.channel()

// Re-export supabase client for convenience
export { supabase }; 