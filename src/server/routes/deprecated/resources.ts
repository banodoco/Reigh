import express, { Request, Response, NextFunction } from 'express';
import { db } from '../../lib/db/index';
import { resources as resourcesTable, users as usersTable } from '../../../db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';

const resourcesRouter = express.Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// GET /api/resources/public - No authentication required for public resources
resourcesRouter.get('/public', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query;

  if (!type || typeof type !== 'string') {
    return res.status(400).json({ message: 'Resource type is required' });
  }

  try {
    // Fetch all public resources of the specified type
    const publicResources = await db.select()
      .from(resourcesTable)
      .where(eq(resourcesTable.type, type));
    
    // Filter to only include resources marked as public
    const filteredResources = publicResources.filter(resource => 
      resource.metadata && 
      typeof resource.metadata === 'object' && 
      'is_public' in resource.metadata && 
      resource.metadata.is_public === true
    );
    
    res.status(200).json(filteredResources);
  } catch (error) {
    console.error(`[API] Error fetching public resources of type ${type}:`, error);
    res.status(500).json({ message: 'Failed to fetch public resources' });
  }
}));

// Apply authentication middleware to all other routes
resourcesRouter.use(authenticate);

// GET /api/resources
resourcesRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { type } = req.query;

  if (!type || typeof type !== 'string') {
    return res.status(400).json({ message: 'Resource type is required' });
  }

  try {
    const resources = await db.select()
      .from(resourcesTable)
      .where(and(eq(resourcesTable.userId, userId), eq(resourcesTable.type, type)));
    
    res.status(200).json(resources);
  } catch (error) {
    console.error(`[API] Error fetching resources of type ${type}:`, error);
    res.status(500).json({ message: 'Failed to fetch resources' });
  }
}));

// POST /api/resources
resourcesRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { type, metadata } = req.body;

  if (!type || !metadata) {
    return res.status(400).json({ message: 'Type and metadata are required' });
  }

  // Ensure the user exists before creating a resource
  const existingUser = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (existingUser.length === 0) {
    await db.insert(usersTable).values({ id: userId, name: 'Default User' });
  }
  
  try {
    const newResource = await db.insert(resourcesTable).values({
      userId: userId,
      type,
      metadata,
    }).returning();

    res.status(201).json(newResource[0]);
  } catch (error) {
    console.error('[API] Error creating resource:', error);
    res.status(500).json({ message: 'Failed to create resource' });
  }
}));

// DELETE /api/resources/:id
resourcesRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const resourceId = req.params.id;

    if (!resourceId) {
        return res.status(400).json({ message: 'Resource ID is required' });
    }

    try {
        const deletedResource = await db.delete(resourcesTable)
            .where(and(eq(resourcesTable.id, resourceId), eq(resourcesTable.userId, userId)))
            .returning();

        if (deletedResource.length === 0) {
            return res.status(404).json({ message: 'Resource not found or user not authorized' });
        }

        res.status(200).json({ message: 'Resource deleted successfully' });
    } catch (error) {
        console.error('[API] Error deleting resource:', error);
        res.status(500).json({ message: 'Failed to delete resource' });
    }
}));

export default resourcesRouter; 