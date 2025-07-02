import { supabase } from '@/integrations/supabase/client';

interface FetchOptions extends RequestInit {
  // Additional options if needed
}

/**
 * Makes an authenticated fetch request to the API
 * Automatically adds the authorization header with the current user's token
 */
export async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
  // Get the current session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('No authentication token available');
  }
  
  // Add the authorization header
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  
  return fetch(url, {
    ...options,
    headers,
  });
} 