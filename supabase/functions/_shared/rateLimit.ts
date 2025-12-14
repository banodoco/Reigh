// deno-lint-ignore-file
// @ts-ignore
declare const Deno: any;

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Identifier type: 'ip', 'user', or 'combined' */
  identifierType: 'ip' | 'user' | 'combined';
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds until reset
}

/**
 * Default rate limit configs for different function types
 */
export const RATE_LIMITS = {
  // Unauthenticated/webhook endpoints - stricter
  webhook: { maxRequests: 100, windowSeconds: 60, identifierType: 'ip' as const },
  
  // Authenticated user actions - moderate  
  userAction: { maxRequests: 60, windowSeconds: 60, identifierType: 'user' as const },
  
  // Expensive operations (AI, payments) - strict
  expensive: { maxRequests: 20, windowSeconds: 60, identifierType: 'user' as const },
  
  // Task creation - moderate (users create many tasks)
  taskCreation: { maxRequests: 30, windowSeconds: 60, identifierType: 'user' as const },
  
  // Read operations - lenient
  read: { maxRequests: 120, windowSeconds: 60, identifierType: 'user' as const },
};

/**
 * Extract client IP from request headers
 * Handles Cloudflare, standard proxies, and direct connections
 */
export function getClientIp(req: Request): string {
  // Cloudflare
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  
  // Standard proxy headers
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take first IP (original client)
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  
  // Fallback - shouldn't happen in production
  return 'unknown';
}

/**
 * Check rate limit for a request
 * Uses database-backed sliding window counter
 * 
 * @param supabaseAdmin - Supabase admin client
 * @param functionName - Name of the function being rate limited
 * @param identifier - User ID or IP address
 * @param config - Rate limit configuration
 * @param logPrefix - Optional log prefix
 * @returns Rate limit check result
 */
export async function checkRateLimit(
  supabaseAdmin: any,
  functionName: string,
  identifier: string,
  config: RateLimitConfig,
  logPrefix: string = "[RATE-LIMIT]"
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000);
  const key = `${functionName}:${identifier}`;
  
  try {
    // Use upsert with atomic increment via RPC function
    // This handles race conditions properly
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: key,
      p_window_seconds: config.windowSeconds,
      p_max_requests: config.maxRequests
    });
    
    if (error) {
      // If the RPC doesn't exist yet, fall through to allow (fail open)
      console.warn(`${logPrefix} Rate limit check failed (allowing request):`, error.message);
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(now.getTime() + config.windowSeconds * 1000)
      };
    }
    
    const result = data as { allowed: boolean; count: number; reset_at: string };
    const resetAt = new Date(result.reset_at);
    const remaining = Math.max(0, config.maxRequests - result.count);
    
    if (!result.allowed) {
      const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
      console.warn(`${logPrefix} Rate limit exceeded for ${key}: ${result.count}/${config.maxRequests}`);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter
      };
    }
    
    return {
      allowed: true,
      remaining,
      resetAt
    };
  } catch (err) {
    // Fail open - don't block requests if rate limiting fails
    console.error(`${logPrefix} Rate limit error (allowing request):`, err);
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now.getTime() + config.windowSeconds * 1000)
    };
  }
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(result: RateLimitResult, config: RateLimitConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.floor(result.resetAt.getTime() / 1000).toString(),
  };
  
  if (result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }
  
  return headers;
}

/**
 * Create a 429 Too Many Requests response
 */
export function rateLimitResponse(result: RateLimitResult, config: RateLimitConfig): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfter: result.retryAfter,
      message: `Rate limit exceeded. Please wait ${result.retryAfter} seconds before retrying.`
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...rateLimitHeaders(result, config)
      }
    }
  );
}



