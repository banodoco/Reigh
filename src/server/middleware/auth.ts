import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../integrations/supabase/admin';
import { Buffer } from 'buffer';

// Re-augment the Express Request type here as well to be safe
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Authenticate requests using Supabase JWT validation
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract the authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Missing or invalid authorization header' });
      return;
    }
    
    // Extract the token
    const token = authHeader.substring(7);

    // -------------------------------------------------------------
    // Development / fallback mode
    // -------------------------------------------------------------
    // When running locally we often don't have outbound network access
    // or a valid Supabase service role key. In these situations we still
    // want the API server to function, so we provide a lightweight JWT
    // decode fallback. The behaviour is controlled via one of:
    //   1. NODE_ENV !== "production"    (default local dev)
    //   2. process.env.SKIP_SUPABASE_AUTH === 'true'
    // If either condition is true we will *skip* the remote Supabase
    // validation step and simply decode the token locally to grab the
    // user id. The token signature is NOT verified in this mode, so it
    // must never be enabled in production.
    const skipRemoteAuth = process.env.SKIP_SUPABASE_AUTH === 'true' || process.env.NODE_ENV !== 'production';

    if (skipRemoteAuth) {
      try {
        const payloadJson = Buffer.from(token.split('.')[1], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        const userId = payload.sub || payload.user_id || payload.id;
        if (!userId) {
          res.status(401).json({ message: 'Invalid token: missing subject' });
          return;
        }
        req.userId = userId;
        return next();
      } catch (decodeErr) {
        console.error('[Auth Middleware] Failed to decode JWT in skip mode', decodeErr);
        res.status(401).json({ message: 'Malformed JWT' });
        return;
      }
    }

    // -------------------------------------------------------------
    // Standard Supabase validation (production)
    // -------------------------------------------------------------
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }
    
    // Attach the user ID to the request
    req.userId = user.id;
    
    next();
  } catch (error) {
    // If any unexpected error occurs, send a generic server error
    console.error('[Auth Middleware Error]', error);
    res.status(500).json({ message: 'An internal server error occurred during authentication.' });
  }
}; 