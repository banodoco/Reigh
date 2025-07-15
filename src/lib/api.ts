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
 * Mobile-aware: detects LAN access and adjusts API target accordingly
 */
function getApiUrl(path: string): string {
  // If path is already a full URL, return as-is
  if (path.startsWith('http')) {
    return path;
  }
  
  // In development mode, use relative URLs (proxy handles routing)
  const isDev = import.meta.env.DEV;
  if (isDev) {
    // Check if we're accessing from a mobile device on LAN
    const currentHost = window.location.hostname;
    const isLocalhost = ['localhost', '127.0.0.1'].includes(currentHost);
    
    if (!isLocalhost) {
      // Mobile/LAN access - construct full URL using current host
      const currentPort = window.location.port;
      const apiPort = '8085'; // Your API server port
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      return `${window.location.protocol}//${currentHost}:${apiPort}${cleanPath}`;
    }
    
    return path; // localhost access - use proxy
  }
  
  // In production/preview mode, use the full API server URL
  const apiBaseUrl = import.meta.env.VITE_API_TARGET_URL || 'http://127.0.0.1:8085';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${cleanPath}`;
}

/**
 * Makes an authenticated fetch request to the API
 * Automatically adds the authorization header with the current user's token
 * Mobile-optimized: shorter cache times and better error handling
 */
export async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  
  // Check if we have a cached session that's still valid
  // Use shorter cache time for mobile reliability
  const now = Date.now();
  const cacheBufferMs = 30000; // 30 seconds buffer (reduced from 60 seconds)
  
  if (cachedSession && cachedSession.expiresAt > now + cacheBufferMs) {
    // Use cached token
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${cachedSession.token}`);
    
    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers,
      });
      
      // If we get 401, clear cache and retry with fresh token
      if (response.status === 401) {
        console.log('[fetchWithAuth] Cached token rejected, clearing cache and retrying');
        cachedSession = null;
        return fetchWithAuth(url, options); // Retry with fresh token
      }
      
      return response;
    } catch (error) {
      console.error('[fetchWithAuth] Network error with cached token:', error);
      // Clear cache and try with fresh token
      cachedSession = null;
      // Fall through to fresh token logic
    }
  }
  
  // Get a fresh session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('No authentication token available');
  }
  
  // Cache the session with shorter expiry for mobile
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