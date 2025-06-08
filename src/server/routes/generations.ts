import express, { Request, Response, NextFunction } from 'express';
import { db } from '../../lib/db'; // Drizzle instance
import { generations as generationsTable, projects } from '../../../db/schema/schema';
import { eq, asc, desc, and, count } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';

// Augment the Express Request type to include the 'userId' property
declare global {
  namespace Express {
    interface Request {
      userId?: string; // or your preferred type
    }
  }
}

const generationsRouter = express.Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// POST /api/generations
generationsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { imageUrl, fileName, fileType, fileSize, projectId, prompt } = req.body;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Project ID is required' });
  }
  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ message: 'Image URL is required' });
  }

  try {
    const newGenerationArray = await db.insert(generationsTable).values({
      location: imageUrl,
      params: {
        prompt: prompt,
        source: 'external_upload',
        original_filename: fileName,
        file_type: fileType,
        file_size: fileSize,
      },
      projectId: projectId,
    }).returning();

    if (!newGenerationArray || newGenerationArray.length === 0) {
      return res.status(500).json({ message: 'Failed to create generation after insert' });
    }

    const newGeneration = newGenerationArray[0];
    res.status(201).json(newGeneration);

  } catch (error: any) {
    console.error('[API Error Creating Generation]', error);
    res.status(500).json({ message: 'Failed to create generation' });
  }
}));

// GET /api/generations?projectId=:projectId&page=:page&limit=:limit
generationsRouter.get('/', authenticate, asyncHandler(async (req, res) => {
    const { projectId, page = '1', limit = '24' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ message: 'Project ID is required' });
    }

    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const project = await db.query.projects.findFirst({
            where: and(eq(projects.id, projectId as string), eq(projects.userId, userId))
        });

        if (!project) {
            return res.status(404).json({ message: 'Project not found or you do not have access' });
        }

        const offset = (pageNum - 1) * limitNum;

        const results = await db.query.generations.findMany({
            where: eq(generationsTable.projectId, projectId as string),
            orderBy: [desc(generationsTable.createdAt)],
            limit: limitNum,
            offset: offset,
        });

        const totalCountResult = await db.select({ value: count() }).from(generationsTable).where(eq(generationsTable.projectId, projectId as string));
        const total = totalCountResult[0].value;

        res.json({
            items: results,
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
        });

    } catch (error) {
        console.error('Failed to fetch generations:', error);
        res.status(500).json({ message: 'Failed to fetch generations' });
    }
}));

// GET /api/generations/:id/task-id
generationsRouter.get('/:id/task-id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Generation ID is required' });
  }

  try {
    const result = await db.select({ tasks: generationsTable.tasks }).from(generationsTable).where(eq(generationsTable.id, id)).limit(1);

    if (result.length === 0) {
      return res.status(404).json({ message: 'Generation not found' });
    }

    const tasks = result[0].tasks as string[] | null;
    if (!tasks || tasks.length === 0) {
      return res.status(404).json({ message: 'No task associated with this generation' });
    }
    
    res.status(200).json({ taskId: tasks[0] });

  } catch (error: any) {
    console.error(`[API Error getting task for generation ${id}]`, error);
    res.status(500).json({ message: 'Failed to retrieve task ID' });
  }
}));

export default generationsRouter; 