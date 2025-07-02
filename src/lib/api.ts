import { supabase } from '@/integrations/supabase/client';

interface FetchOptions extends RequestInit {
  // Additional options if needed
}

// Cache the session to avoid repeated auth calls
let cachedSession: { token: string; expiresAt: number } | null = null;

/**
 * Makes an authenticated fetch request to the API
 * Automatically adds the authorization header with the current user's token
 */
export async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
  // Check if we have a cached session that's still valid
  const now = Date.now();
  if (cachedSession && cachedSession.expiresAt > now + 60000) { // 1 minute buffer
    // Use cached token
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${cachedSession.token}`);
    
    return fetch(url, {
      ...options,
      headers,
    });
  }
  
  // Get a fresh session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('No authentication token available');
  }
  
  // Cache the session
  cachedSession = {
    token: session.access_token,
    expiresAt: new Date(session.expires_at! * 1000).getTime()
  };
  
  // Add the authorization header
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  
  return fetch(url, {
    ...options,
    headers,
  });
}

// Clear cache on auth state change
supabase.auth.onAuthStateChange(() => {
  cachedSession = null;
}); 