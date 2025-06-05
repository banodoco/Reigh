import express, { Request, Response, NextFunction } from 'express';
import { db } from '../../lib/db'; // Drizzle instance
import { generations as generationsTable } from '../../../db/schema/schema';
import { eq, asc, desc, and } from 'drizzle-orm';

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
  // Add other validations as necessary, e.g., for prompt

  try {
    const newGenerationArray = await db.insert(generationsTable).values({
      location: imageUrl, // Using 'location' field for imageUrl as per schema
      // prompt: prompt || `External image: ${fileName || 'untitled'}`,
      prompt: prompt, // The client will construct the prompt string
      params: {
        source: 'external_upload',
        original_filename: fileName,
        file_type: fileType,
        file_size: fileSize,
      },
      // seed: 0, // Schema does not have seed, tasks array, or type for generations table currently
      projectId: projectId,
    }).returning();

    if (!newGenerationArray || newGenerationArray.length === 0) {
      console.error('[API Error Creating Generation]', 'Insert operation did not return the new generation.');
      return res.status(500).json({ message: 'Failed to create generation after insert' });
    }

    const newGeneration = newGenerationArray[0];
    res.status(201).json(newGeneration); // Return the full generation object as created in DB

  } catch (error: any) {
    console.error('[API Error Creating Generation]', error);
    res.status(500).json({ message: 'Failed to create generation' });
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

    const tasks = result[0].tasks;
    if (!tasks || tasks.length === 0) {
      return res.status(404).json({ message: 'No task associated with this generation' });
    }
    
    // Assuming the first task is the relevant one
    res.status(200).json({ taskId: tasks[0] });

  } catch (error: any) {
    console.error(`[API Error getting task for generation ${id}]`, error);
    res.status(500).json({ message: 'Failed to retrieve task ID' });
  }
}));

export default generationsRouter; 