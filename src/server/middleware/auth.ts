import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../integrations/supabase/admin';

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
    
    // Validate the token with Supabase
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