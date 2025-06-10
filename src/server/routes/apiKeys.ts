import express, { Request, Response, NextFunction } from 'express';
import { db } from '../../lib/db'; // Drizzle instance
import { users as usersTable } from '../../../db/schema/schema';
import { eq } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';

// Augment the Express Request type to include the 'userId' property
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const apiKeysRouter = express.Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// Apply authentication middleware to all routes
apiKeysRouter.use(authenticate);

// GET /api/api-keys - Get user's API keys
apiKeysRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  
  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  try {
    const user = await db.select({
      apiKeys: usersTable.apiKeys
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return the API keys, or an empty object if none are stored
    const apiKeys = user[0].apiKeys || {};
    res.json(apiKeys);
  } catch (error) {
    console.error('[API Keys] Error fetching API keys:', error);
    res.status(500).json({ message: 'Failed to fetch API keys' });
  }
}));

// PUT /api/api-keys - Update user's API keys
apiKeysRouter.put('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { fal_api_key, openai_api_key, replicate_api_key } = req.body;
  
  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  try {
    // Prepare the API keys object
    const apiKeys: Record<string, string> = {};
    
    if (fal_api_key !== undefined) {
      apiKeys.fal_api_key = fal_api_key;
    }
    if (openai_api_key !== undefined) {
      apiKeys.openai_api_key = openai_api_key;
    }
    if (replicate_api_key !== undefined) {
      apiKeys.replicate_api_key = replicate_api_key;
    }

    // First, check if user exists
    const existingUser = await db.select({
      id: usersTable.id,
      apiKeys: usersTable.apiKeys
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

    if (existingUser.length === 0) {
      // Create user if they don't exist
      await db.insert(usersTable).values({
        id: userId,
        apiKeys: apiKeys
      });
    } else {
      // Update existing user's API keys
      const currentApiKeys = (existingUser[0].apiKeys as Record<string, string>) || {};
      const updatedApiKeys = { ...currentApiKeys, ...apiKeys };
      
      await db.update(usersTable)
        .set({ apiKeys: updatedApiKeys })
        .where(eq(usersTable.id, userId));
    }

    res.json({ message: 'API keys updated successfully', apiKeys });
  } catch (error) {
    console.error('[API Keys] Error updating API keys:', error);
    res.status(500).json({ message: 'Failed to update API keys' });
  }
}));

export default apiKeysRouter; 