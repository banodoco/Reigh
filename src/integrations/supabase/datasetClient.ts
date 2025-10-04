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

// Safe logging with JWT validation
const logCredentials = () => {
  try {
    const logData: any = {
      url: DATASET_SUPABASE_URL,
      keyLength: DATASET_SUPABASE_ANON_KEY?.length,
      keyConfigured: DATASET_SUPABASE_ANON_KEY !== 'PLACEHOLDER_API_KEY_REPLACE_ME'
    };

    // Only decode JWT if it's a valid JWT format
    if (DATASET_SUPABASE_ANON_KEY && 
        DATASET_SUPABASE_ANON_KEY !== 'PLACEHOLDER_API_KEY_REPLACE_ME' &&
        DATASET_SUPABASE_ANON_KEY.includes('.')) {
      try {
        const payload = JSON.parse(atob(DATASET_SUPABASE_ANON_KEY.split('.')[1]));
        logData.keyRef = payload.ref;
        logData.keyPrefix = DATASET_SUPABASE_ANON_KEY.substring(0, 20) + '...';
      } catch (jwtError) {
        logData.keyError = 'Invalid JWT format';
      }
    } else {
      logData.keyStatus = 'Not configured or invalid format';
    }

    console.log('[DatasetClient] Using dataset credentials:', logData);
  } catch (error) {
    console.error('[DatasetClient] Error logging credentials:', error);
  }
};

logCredentials();

/**
 * Supabase client specifically for the dataset database
 * This client should ONLY be used for accessing dataset_contents table
 */
export const datasetSupabase = createClient(DATASET_SUPABASE_URL, DATASET_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // Don't persist auth sessions for dataset browsing
    storageKey: 'sb-dataset-auth', // Use unique storage key to avoid GoTrueClient conflicts
  },
});

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
