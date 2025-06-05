import express, { Request, Response, NextFunction } from 'express';
import { db } from '../../lib/db'; // Drizzle instance
import { shots as shotsTable, shotGenerations as shotGenerationsTable, generations as generationsTable } from '../../../db/schema/schema';
import { eq, asc, desc, and } from 'drizzle-orm';

const shotsRouter = express.Router();

// Helper for async routes
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// GET /api/shots?projectId=:projectId
shotsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string;

  if (!projectId) {
    return res.status(400).json({ message: 'Project ID is required' });
  }

  try {
    // This query attempts to replicate the structure previously fetched by the client
    // Note: Drizzle's support for deeply nested relations like this in a single query can be complex.
    // It might be simpler to fetch shots, then shot_images, then generations in separate queries
    // or use Drizzle's relational queries more explicitly if schema relations are set up.
    // For now, let's try to match the existing select string's intent.

    const fetchedShots = await db.query.shots.findMany({
      where: eq(shotsTable.projectId, projectId),
      orderBy: [desc(shotsTable.createdAt)],
      with: {
        shotGenerations: {
          orderBy: [asc(shotGenerationsTable.position)],
          with: {
            generation: true, // Assuming 'generation' is the relation name for generationsTable
          },
        },
      },
    });

    // Transform data to match the client's expected Shot[] structure
    const transformedData = fetchedShots.map(shot => ({
      id: shot.id,
      name: shot.name,
      created_at: shot.createdAt ? shot.createdAt.toISOString() : new Date().toISOString(), // Handle potential null createdAt
      project_id: shot.projectId,
      images: shot.shotGenerations.map(sg => {
        if (!sg.generation) return null; 
        return {
          shotImageEntryId: sg.id,
          id: sg.generation.id,
          imageUrl: sg.generation.location, // Corrected: use location field for imageUrl
          thumbUrl: sg.generation.location, // Corrected: use location field for thumbUrl
          metadata: sg.generation.params,   // Corrected: use params field for metadata
          // position is implicitly handled by the orderBy in the query
        };
      }).filter((img): img is NonNullable<typeof img> => img !== null), // Type guard for filter
    }));

    res.status(200).json(transformedData);
  } catch (error) {
    console.error('[API Error Fetching Shots]', error);
    res.status(500).json({ message: 'Failed to fetch shots' });
  }
}));

// POST /api/shots
shotsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name: shotName, projectId } = req.body;

  if (!shotName || typeof shotName !== 'string' || !shotName.trim()) {
    return res.status(400).json({ message: 'Shot name is required and must be a non-empty string' });
  }
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Project ID is required and must be a string' });
  }

  try {
    const newShotArray = await db.insert(shotsTable).values({
      name: shotName.trim(),
      projectId: projectId,
      // `id` and `createdAt` will use default values from the schema
    }).returning(); // Get the newly created shot back

    if (!newShotArray || newShotArray.length === 0) {
      console.error('[API Error Creating Shot]', 'Insert operation did not return the new shot.');
      return res.status(500).json({ message: 'Failed to create shot after insert' });
    }

    const newShot = newShotArray[0];

    // Return the newly created shot, matching the structure client might expect (ShotResponse like)
    // The client-side Shot type includes `images: GenerationRow[]` which will be empty for a new shot.
    // And `created_at` should be stringified.
    const responseShot = {
      id: newShot.id,
      name: newShot.name,
      created_at: newShot.createdAt.toISOString(),
      project_id: newShot.projectId,
      images: [], // New shot has no images initially
    };

    res.status(201).json(responseShot);
  } catch (error: any) {
    console.error('[API Error Creating Shot]', error);
    // Basic error handling, can be enhanced for specific DB errors e.g. unique constraints
    if (error.code === '23505') { // Example for PostgreSQL unique violation on name+projectId if such constraint exists
        return res.status(409).json({ message: `Shot with name "${shotName.trim()}" already exists in this project.` });
    }
    res.status(500).json({ message: 'Failed to create shot' });
  }
}));

// PUT /api/shots/:shotId - Update a shot (e.g., its name)
shotsRouter.put('/:shotId', asyncHandler(async (req: Request, res: Response) => {
  const { shotId } = req.params;
  const { name: newName } = req.body;

  if (!newName || typeof newName !== 'string' || !newName.trim()) {
    return res.status(400).json({ message: 'New shot name is required and must be a non-empty string' });
  }

  try {
    const updatedShotArray = await db.update(shotsTable)
      .set({ name: newName.trim(), updatedAt: new Date() }) // Also update updatedAt timestamp
      .where(eq(shotsTable.id, shotId))
      .returning();

    if (!updatedShotArray || updatedShotArray.length === 0) {
      return res.status(404).json({ message: 'Shot not found or not updated' });
    }
    
    // Drizzle .returning() gives the full updated record. 
    // We might need to fetch relations if the client expects the full Shot with images.
    // For a name update, just returning the updated shot fields is often sufficient.
    const updatedShot = updatedShotArray[0];
    const responseShot = {
        id: updatedShot.id,
        name: updatedShot.name,
        created_at: updatedShot.createdAt.toISOString(),
        updated_at: updatedShot.updatedAt?.toISOString(), // updatedAt can be null if not set on creation
        project_id: updatedShot.projectId,
        images: [], // For a name update, images array isn't typically returned unless explicitly requested
    };

    res.status(200).json(responseShot);
  } catch (error: any) {
    console.error(`[API Error Updating Shot ${shotId}]`, error);
    if (error.code === '23505') { // Example for unique constraint violation
        return res.status(409).json({ message: `A shot with name "${newName.trim()}" might already exist.` });
    }
    res.status(500).json({ message: 'Failed to update shot' });
  }
}));

// DELETE /api/shots/:shotId - Delete a shot and its links
shotsRouter.delete('/:shotId', asyncHandler(async (req: Request, res: Response) => {
  const { shotId } = req.params;

  if (!shotId) {
    return res.status(400).json({ message: 'Shot ID is required' });
  }

  try {
    // Drizzle doesn't automatically cascade deletes in SQLite unless PRAGMA foreign_keys=ON is set
    // and table constraints are defined with ON DELETE CASCADE.
    // It's safer to delete related records explicitly in a transaction if not using PG with cascades.
    // For SQLite, manual deletion of related shot_generations is a good practice.

    db.transaction((tx) => {
      // 1. Delete links in shot_generations table
      tx.delete(shotGenerationsTable)
        .where(eq(shotGenerationsTable.shotId, shotId))
        .run();
      
      // 2. Delete the shot itself
      const deletedShotArray = tx.delete(shotsTable)
        .where(eq(shotsTable.id, shotId))
        .returning({ id: shotsTable.id })
        .all();

      if (!deletedShotArray || deletedShotArray.length === 0) {
        // This means the shot was not found, which might happen if it was already deleted.
        // Depending on desired idempotency, this could be a 404 or still a 200/204.
        // For simplicity, if it didn't delete anything, treat as if not found.
        throw new Error('Shot not found'); // This will be caught and result in a 404 or 500
      }
    });

    res.status(204).send(); // 204 No Content for successful deletion

  } catch (error: any) {
    console.error(`[API Error Deleting Shot ${shotId}]`, error);
    if (error.message === 'Shot not found') {
        return res.status(404).json({ message: 'Shot not found' });
    }
    res.status(500).json({ message: 'Failed to delete shot' });
  }
}));

// POST /api/shots/shot_generations - Link a generation to a shot
shotsRouter.post('/shot_generations', asyncHandler(async (req: Request, res: Response) => {
  const { shotId, generationId, position } = req.body;

  if (!shotId || typeof shotId !== 'string') {
    return res.status(400).json({ message: 'Shot ID is required' });
  }
  if (!generationId || typeof generationId !== 'string') {
    return res.status(400).json({ message: 'Generation ID is required' });
  }
  // Position is optional, will default in DB if not provided or use provided value
  if (position !== undefined && typeof position !== 'number') {
    return res.status(400).json({ message: 'Position must be a number if provided' });
  }

  try {
    let finalPosition: number;
    if (position !== undefined) {
      finalPosition = position;
    } else {
      // Determine the next position (append to end)
      const maxPositionRow = await db
        .select({ position: shotGenerationsTable.position })
        .from(shotGenerationsTable)
        .where(eq(shotGenerationsTable.shotId, shotId))
        .orderBy(desc(shotGenerationsTable.position))
        .limit(1);
      const currentMax = maxPositionRow[0]?.position ?? -1;
      finalPosition = (typeof currentMax === 'number' ? currentMax : parseInt(String(currentMax), 10) || -1) + 1;
    }

    const valuesToInsert: { shotId: string; generationId: string; position: number } = {
      shotId,
      generationId,
      position: finalPosition,
    };

    const newShotGenerationArray = await db.insert(shotGenerationsTable)
      .values(valuesToInsert)
      .returning();

    if (!newShotGenerationArray || newShotGenerationArray.length === 0) {
      console.error('[API Error Linking Generation]', 'Insert operation did not return the new shot_generation link.');
      return res.status(500).json({ message: 'Failed to link generation to shot after insert' });
    }

    res.status(201).json(newShotGenerationArray[0]);
  } catch (error: any) {
    console.error('[API Error Linking Generation to Shot]', error);
    // Add specific error handling e.g. foreign key violations if a shotId or generationId doesn't exist
    res.status(500).json({ message: 'Failed to link generation to shot' });
  }
}));

// DELETE /api/shots/:shotId/generations/:generationId - Unlink a generation from a shot
shotsRouter.delete('/:shotId/generations/:generationId', asyncHandler(async (req: Request, res: Response) => {
  const { shotId, generationId } = req.params;

  if (!shotId || typeof shotId !== 'string') {
    return res.status(400).json({ message: 'Shot ID is required' });
  }
  if (!generationId || typeof generationId !== 'string') {
    return res.status(400).json({ message: 'Generation ID is required' });
  }

  try {
    const deletedLinkArray = await db.delete(shotGenerationsTable)
      .where(and(
        eq(shotGenerationsTable.shotId, shotId),
        eq(shotGenerationsTable.generationId, generationId)
      ))
      .returning({ id: shotGenerationsTable.id });

    if (!deletedLinkArray || deletedLinkArray.length === 0) {
      return res.status(404).json({ message: 'Link between shot and generation not found' });
    }

    res.status(204).send(); // Successfully unlinked
  } catch (error: any) {
    console.error(`[API Error Unlinking Generation ${generationId} from Shot ${shotId}]`, error);
    res.status(500).json({ message: 'Failed to unlink generation from shot' });
  }
}));

// PUT /api/shots/:shotId/generations/order - Update the order of generations in a shot
shotsRouter.put('/:shotId/generations/order', asyncHandler(async (req: Request, res: Response) => {
  const { shotId } = req.params;
  const { orderedGenerationIds } = req.body as { orderedGenerationIds: string[] };

  if (!shotId || typeof shotId !== 'string') {
    return res.status(400).json({ message: 'Shot ID is required' });
  }
  if (!Array.isArray(orderedGenerationIds) || !orderedGenerationIds.every(id => typeof id === 'string')) {
    return res.status(400).json({ message: 'orderedGenerationIds must be an array of strings' });
  }

  try {
    // First, verify the shot exists to provide a better error message if not.
    const shotExists = await db.query.shots.findFirst({
      where: eq(shotsTable.id, shotId),
      columns: { id: true }
    });

    if (!shotExists) {
      return res.status(404).json({ message: 'Shot not found' });
    }

    // Sequentially update each link's position. While this is not a single DB transaction, SQLite
    // executions are still atomic per-statement and this approach avoids Better-SQLite3's
    // limitation that a transaction callback cannot be asynchronous.
    for (let index = 0; index < orderedGenerationIds.length; index++) {
      const generationId = orderedGenerationIds[index];
      const result = await db.update(shotGenerationsTable)
        .set({ position: index })
        .where(and(eq(shotGenerationsTable.shotId, shotId), eq(shotGenerationsTable.generationId, generationId)));

      // In Drizzle (better-sqlite3) the result contains a `rowsAffected` field; fall back to length checks
      // for broader driver compatibility.
      // @ts-ignore – type shapes differ per driver
      const affected = (result?.rowsAffected ?? result?.changes ?? 0);
      if (affected === 0) {
        throw new Error(`Link for generation ${generationId} not found in shot ${shotId}`);
      }
    }

    res.status(200).json({ message: 'Image order updated successfully' });
  } catch (error: any) {
    console.error(`[API Error Updating Generation Order for Shot ${shotId}]`, error);
    // Check for foreign key constraint errors if a generationId doesn't exist
    // This depends on the DB and Drizzle error structure, e.g., error.code or message inspection
    if (error.message && error.message.includes('violates foreign key constraint')) {
        return res.status(400).json({ message: 'Invalid generation ID provided in the order. One or more generations do not exist.' });
    }
    res.status(500).json({ message: 'Failed to update image order' });
  }
}));

export default shotsRouter; 