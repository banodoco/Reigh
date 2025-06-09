import express, { Request, Response, NextFunction } from 'express';
import { db } from '@/lib/db';
import { resources as resourcesTable, users as usersTable } from '../../../db/schema/schema';
import { eq, and } from 'drizzle-orm';

const resourcesRouter = express.Router();
const DUMMY_USER_ID = '3e3e3e3e-3e3e-3e3e-3e3e-3e3e3e3e3e3e'; // This should be replaced with actual user session data

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// GET /api/resources
resourcesRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query;

  if (!type || typeof type !== 'string') {
    return res.status(400).json({ message: 'Resource type is required' });
  }

  try {
    const resources = await db.select()
      .from(resourcesTable)
      .where(and(eq(resourcesTable.userId, DUMMY_USER_ID), eq(resourcesTable.type, type)));
    
    res.status(200).json(resources);
  } catch (error) {
    console.error(`[API] Error fetching resources of type ${type}:`, error);
    res.status(500).json({ message: 'Failed to fetch resources' });
  }
}));

// POST /api/resources
resourcesRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { type, metadata } = req.body;

  if (!type || !metadata) {
    return res.status(400).json({ message: 'Type and metadata are required' });
  }

  // Ensure the dummy user exists before creating a resource
  const existingUser = await db.select().from(usersTable).where(eq(usersTable.id, DUMMY_USER_ID));
  if (existingUser.length === 0) {
    await db.insert(usersTable).values({ id: DUMMY_USER_ID, name: 'Default User' });
  }
  
  try {
    const newResource = await db.insert(resourcesTable).values({
      userId: DUMMY_USER_ID,
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
    const resourceId = req.params.id;

    if (!resourceId) {
        return res.status(400).json({ message: 'Resource ID is required' });
    }

    try {
        const deletedResource = await db.delete(resourcesTable)
            .where(and(eq(resourcesTable.id, resourceId), eq(resourcesTable.userId, DUMMY_USER_ID)))
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