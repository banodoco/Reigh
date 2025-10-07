/**
 * Dedicated Supabase client for the dataset database
 * This is a separate database with different credentials from the main application database
 * Used specifically for browsing dataset_id = 1 (Midjourney v6 dataset)
 */

import { createClient } from '@supabase/supabase-js';

// Dataset database credentials
// URL confirmed: https://ujlwuvkrxlvoswwkerdf.supabase.co
// API Key: Please provide the correct anon key for this database
const DATASET_SUPABASE_URL = import.meta.env.VITE_DATASET_SUPABASE_URL || 'https://ujlwuvkrxlvoswwkerdf.supabase.co';

// Correct API key provided by user
const DATASET_SUPABASE_ANON_KEY = import.meta.env.VITE_DATASET_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbHd1dmtyeGx2b3N3d2tlcmRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxNjQ5MTYsImV4cCI6MjA2Mzc0MDkxNn0.156-RCR2I9wIbgsrVg6VhEh4WHysS27EB-XR2jLqtAA';

// Validation check
if (DATASET_SUPABASE_ANON_KEY === 'PLACEHOLDER_API_KEY_REPLACE_ME') {
  console.error('[DatasetClient] ❌ API key not configured! Please set VITE_DATASET_SUPABASE_ANON_KEY environment variable or update the hardcoded value.');
}

// Dataset credentials validation removed - not needed in production

/**
 * Supabase client specifically for the dataset database
 * This client should ONLY be used for accessing dataset_contents table
 * 
 * Note: Multiple GoTrueClient warning is expected and safe - we use a separate
 * storage key and auth is disabled for this read-only dataset client
 */

// Suppress the multiple GoTrueClient warning since this is intentional
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Multiple GoTrueClient instances')) {
    return; // Suppress this specific warning
  }
  originalWarn.apply(console, args);
};

export const datasetSupabase = createClient(DATASET_SUPABASE_URL, DATASET_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-dataset-auth',
    debug: false, // Suppress GoTrueClient warnings
  },
  db: {
    schema: 'public'
  }
});

// Restore console.warn after client creation
console.warn = originalWarn;

/**
 * Verify dataset client connection
 * Useful for debugging connection issues
 */
export const verifyDatasetConnection = async () => {
  console.log('[DatasetClient] Verifying connection to:', DATASET_SUPABASE_URL);
  
  // Check if API key is configured
  if (DATASET_SUPABASE_ANON_KEY === 'PLACEHOLDER_API_KEY_REPLACE_ME') {
    const error = 'API key not configured. Please provide the correct anon key.';
    console.error('[DatasetClient]', error);
    return { 
      success: false, 
      error,
      instructions: 'Go to https://app.supabase.com/project/ujlwuvkrxlvoswwkerdf/settings/api to get the anon key'
    };
  }
  
  try {
    // First try a simple select to test basic connectivity
    const { data, error, count } = await datasetSupabase
      .from('dataset_contents')
      .select('id', { count: 'exact' })
      .eq('dataset_id', 1)
      .eq('review_status', 'approved')
      .limit(1);

    console.log('[DatasetClient] Connection test result:', { 
      data, 
      error, 
      count,
      hasData: !!data,
      dataLength: data?.length 
    });

    if (error) {
      console.error('[DatasetClient] Connection error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        possibleSolution: error.message.includes('Invalid API key') 
          ? 'Please check the API key at https://app.supabase.com/project/ujlwuvkrxlvoswwkerdf/settings/api'
          : 'Check database permissions and table existence'
      });
      return { success: false, error: error.message, details: error };
    }

    return { success: true, data, count };
  } catch (error) {
    console.error('[DatasetClient] Connection failed with exception:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};
