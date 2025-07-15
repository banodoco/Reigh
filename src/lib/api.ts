import { supabase } from '@/integrations/supabase/client';

interface FetchOptions extends RequestInit {
  // Additional options if needed
}

// Cache the session to avoid repeated auth calls
let cachedSession: { token: string; expiresAt: number } | null = null;

/**
 * Constructs the full URL for API requests
 * In development mode, uses relative URLs (proxy handles routing)
 * In production/preview mode, uses the full API server URL
 */
function getApiUrl(path: string): string {
  // If path is already a full URL, return as-is
  if (path.startsWith('http')) {
    return path;
  }
  
  // In development mode, use relative URLs (proxy handles routing)
  const isDev = import.meta.env.DEV;
  if (isDev) {
    return path;
  }
  
  // In production/preview mode, prefer relative URLs unless an explicit target is provided.
  // This ensures the client works correctly when accessed from mobile devices or
  // multiple hosts where the absolute API target may differ (e.g. LAN IP vs localhost).
  const apiBaseUrl = import.meta.env.VITE_API_TARGET_URL;

  // If a custom base URL is configured, use it; otherwise default to a relative path so
  // requests hit the same origin that served the frontend bundle (which is the most
  // reliable behaviour across environments, including mobile Safari/PWA contexts).
  if (apiBaseUrl && apiBaseUrl.trim() !== '') {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${apiBaseUrl}${cleanPath}`;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Makes an authenticated fetch request to the API
 * Automatically adds the authorization header with the current user's token
 */
export async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  
  // Check if we have a cached session that's still valid
  const now = Date.now();
  if (cachedSession && cachedSession.expiresAt > now + 60000) { // 1 minute buffer
    // Use cached token
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${cachedSession.token}`);
    
    return fetch(fullUrl, {
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
  
  return fetch(fullUrl, {
    ...options,
    headers,
  });
}

// Clear cache on auth state change
supabase.auth.onAuthStateChange(() => {
  cachedSession = null;
}); 