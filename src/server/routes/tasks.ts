import express, { Request, Response, Router } from 'express';
import { db } from '@/lib/db'; // Adjusted path assuming db is exported from here
import { tasks as tasksSchema } from '../../../db/schema/schema'; // Adjusted path to schema
import { taskStatusEnum } from '../../../db/schema/enums'; // CORRECTED: Import taskStatusEnum from enums.ts
// import { NewTask } from '../../../db/schema/schema'; // Removed NewTask import
import { sql, eq, and, inArray, max } from 'drizzle-orm'; // Added eq, and, inArray, max
import { generations as generationsSchema, shotGenerations as shotGenerationsSchema } from '../../../db/schema/schema'; // Added generations and shotGenerations schemas
import { randomUUID } from 'crypto'; // Added for generating UUIDs
// import { Static, Type } from '@sinclair/typebox'; // Removed optional TypeBox import

const router = express.Router() as any; // Changed Router to any to resolve overload errors

interface TaskRequestBody {
  project_id: string;
  task_type: string;
  params: Record<string, any>; // Or a more specific TypeBox schema
  status?: string; // Keep as string, will cast to enum type if schema requires
  dependant_on?: string[]; // Optional, snake_case from client
  output_location?: string; // Optional, snake_case from client
}

router.post('/', async (req: Request, res: Response) => {
  const {
    project_id,
    task_type,
    params,
    status = 'Queued',
    dependant_on, // snake_case from client
    output_location // snake_case from client
  } = req.body as TaskRequestBody; // Cast req.body here

  if (!project_id || !task_type || !params) {
    return res.status(400).json({ message: 'Missing required fields: project_id, task_type, params' });
  }

  try {
    // Construct data for Drizzle insert using camelCase schema field names
    const taskInsertData: any = {
      projectId: project_id,
      taskType: task_type,
      params: params, 
      status: status, // Drizzle will map to enum if column is enum
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add optional fields if they were provided in the request body
    if (dependant_on !== undefined) {
      taskInsertData.dependantOn = dependant_on; // camelCase for Drizzle schema field
    }
    if (output_location !== undefined) {
      taskInsertData.outputLocation = output_location; // camelCase for Drizzle schema field
    }

    const insertedTasks = await db
      .insert(tasksSchema)
      .values(taskInsertData) // Drizzle should infer the type or use 'any' if structure is correct
      .returning();

    if (insertedTasks.length === 0) {
      console.error('[API /api/tasks] Task insertion failed, no data returned.');
      return res.status(500).json({ message: 'Task creation failed at database level.' });
    }

    const createdTask = insertedTasks[0];
    console.log('[API /api/tasks] Task created successfully:', createdTask);
    return res.status(201).json(createdTask);

  } catch (error: any) {
    console.error('[API /api/tasks] Error creating task:', error);
    if (error.message.includes('violates not-null constraint') || error.message.includes('CHECK constraint')) {
        return res.status(400).json({ message: `Database constraint violation: ${error.message}` });
    }
    return res.status(500).json({ message: 'Internal server error while creating task', error: error.message });
  }
});

// GET /api/tasks - List tasks for a project, with optional status filtering
router.get('/', async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string;
  let typedStatusFilter: (typeof taskStatusEnum.enumValues[number])[] | undefined;

  console.log('[API /api/tasks] Received GET request. Query params:', req.query);

  const statusQueryParam = req.query.status || req.query['status[]']; // Check both possible param names

  if (statusQueryParam) {
    const rawStatuses = Array.isArray(statusQueryParam) 
        ? statusQueryParam 
        : [statusQueryParam];
    
    const validStatuses = rawStatuses.filter(
        (s: any): s is typeof taskStatusEnum.enumValues[number] => 
            typeof s === 'string' && taskStatusEnum.enumValues.includes(s as any)
    );

    if (validStatuses.length > 0) {
        typedStatusFilter = validStatuses;
    }
  }  

  if (!projectId) {
    return res.status(400).json({ message: 'Missing required query parameter: projectId' });
  }

  try {
    const conditions = [eq(tasksSchema.projectId, projectId)];

    if (typedStatusFilter && typedStatusFilter.length > 0) {
        conditions.push(inArray(tasksSchema.status, typedStatusFilter));
    }

    const tasks = await db
      .select()
      .from(tasksSchema)
      .where(and(...conditions))
      .orderBy(sql`${tasksSchema.createdAt} DESC`);

    return res.status(200).json(tasks);
  } catch (error: any) {
    console.error('[API /api/tasks] Error listing tasks:', error);
    return res.status(500).json({ message: 'Internal server error while listing tasks', error: error.message });
  }
});

// PATCH /api/tasks/:taskId/cancel - Cancel a task
router.patch('/:taskId/cancel', async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;

  if (!taskId) {
    return res.status(400).json({ message: 'Missing required path parameter: taskId' });
  }

  try {
    const updatedTasks = await db
      .update(tasksSchema)
      .set({ 
        status: 'Cancelled' as typeof taskStatusEnum.enumValues[number], 
        updatedAt: new Date() 
      })
      .where(eq(tasksSchema.id, taskId))
      .returning();

    if (updatedTasks.length === 0) {
      return res.status(404).json({ message: 'Task not found or not updated' });
    }

    return res.status(200).json(updatedTasks[0]);
  } catch (error: any) {
    console.error(`[API /api/tasks/${taskId}/cancel] Error cancelling task:`, error);
    // Check for specific Drizzle/DB errors if needed, e.g., invalid enum value if 'Cancelled' wasn't in the enum
    if (error.message.includes('invalid input value for enum')) {
        return res.status(400).json({ message: `Invalid status value. Ensure 'Cancelled' is a valid task status. Error: ${error.message}` });
    }
    return res.status(500).json({ message: 'Internal server error while cancelling task', error: error.message });
  }
});

// New PATCH endpoint to update task status
router.patch('/:taskId/status', async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const { status: newStatus } = req.body;

  if (!taskId) {
    return res.status(400).json({ message: 'Missing required path parameter: taskId' });
  }
  if (!newStatus) {
    return res.status(400).json({ message: 'Missing required body parameter: status' });
  }

  if (!taskStatusEnum.enumValues.includes(newStatus as any)) {
    return res.status(400).json({ message: `Invalid status value: ${newStatus}. Must be one of ${taskStatusEnum.enumValues.join(', ')}` });
  }

  try {
    const updatedTasks = await db
      .update(tasksSchema)
      .set({
        status: newStatus as typeof taskStatusEnum.enumValues[number],
        updatedAt: new Date(),
      })
      .where(eq(tasksSchema.id, taskId))
      .returning();

    if (updatedTasks.length === 0) {
      return res.status(404).json({ message: 'Task not found or not updated' });
    }

    const updatedTask = updatedTasks[0];

    if (updatedTask.taskType === 'travel_stitch' && updatedTask.status === 'Complete') {
      console.log(`[VideoStitchGenDebug] Task ${taskId} is 'travel_stitch' and 'Complete'. Attempting to create generation records.`);
      const params = updatedTask.params as any;
      const shotId = params?.full_orchestrator_payload?.shot_id;
      const outputLocation = params?.final_stitched_output_path;
      const projectId = updatedTask.projectId;

      if (!shotId || !outputLocation || !projectId) {
        console.error(`[VideoStitchGenDebug] Missing critical data for task ${taskId}. Cannot create generation.`, { shotId, outputLocation, projectId, taskParams: params });
      } else {
        try {
          const newGenerationId = randomUUID();
          const insertedGenerations = await db.insert(generationsSchema).values({
            id: newGenerationId,
            projectId: projectId,
            tasks: [updatedTask.id],
            location: outputLocation,
            type: 'video_travel_output',
            createdAt: new Date(),
            updatedAt: new Date(),
          }).returning();

          if (insertedGenerations.length === 0) {
            console.error(`[VideoStitchGenDebug] Failed to insert generation for task ${taskId}.`);
          } else {
            const newGeneration = insertedGenerations[0];
            console.log(`[VideoStitchGenDebug] Created generation ${newGeneration.id} for task ${taskId}.`);

            const maxPositionResult = await db
              .select({ value: max(shotGenerationsSchema.position) })
              .from(shotGenerationsSchema)
              .where(eq(shotGenerationsSchema.shotId, shotId));
            
            const nextPosition = (maxPositionResult[0]?.value ?? -1) + 1;

            const insertedShotGenerations = await db.insert(shotGenerationsSchema).values({
              shotId: shotId,
              generationId: newGeneration.id,
              position: nextPosition,
            }).returning();

            if (insertedShotGenerations.length === 0) {
               console.error(`[VideoStitchGenDebug] Failed to insert shot_generation for generation ${newGeneration.id} (task ${taskId}).`);
            } else {
               console.log(`[VideoStitchGenDebug] Created shot_generation ${insertedShotGenerations[0].id} linking generation ${newGeneration.id} to shot ${shotId} (task ${taskId}).`);
            }
          }
        } catch (genError: any) {
          console.error(`[VideoStitchGenDebug] Error during generation/shot_generation creation for task ${taskId}:`, genError);
        }
      }
    }

    return res.status(200).json(updatedTask);
  } catch (error: any) {
    console.error(`[VideoStitchGenDebug] Error updating task status for ${taskId}:`, error);
    if (error.message.includes('invalid input value for enum')) {
        return res.status(400).json({ message: `Invalid status value. Error: ${error.message}` });
    }
    return res.status(500).json({ message: 'Internal server error while updating task status', error: error.message });
  }
});

// POST /api/tasks/cancel-pending - Cancel all pending tasks for a project
router.post('/cancel-pending', async (req: Request, res: Response) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ message: 'Missing required body parameter: projectId' });
  }

  try {
    const result = await db
      .update(tasksSchema)
      .set({ 
        status: 'Cancelled' as typeof taskStatusEnum.enumValues[number], 
        updatedAt: new Date() 
      })
      .where(and(
        eq(tasksSchema.projectId, projectId),
        eq(tasksSchema.status, 'Pending' as typeof taskStatusEnum.enumValues[number])
      ))
      .returning({ id: tasksSchema.id }); // Only return IDs or a count for efficiency

    // Drizzle update doesn't directly return a count of affected rows easily across all drivers.
    // The number of items in 'result' array is the count of updated (cancelled) tasks.
    const cancelledCount = result.length;

    if (cancelledCount === 0) {
      return res.status(200).json({ message: 'No pending tasks found for this project to cancel.', cancelledCount });
    }

    console.log(`[API /api/tasks/cancel-pending] Cancelled ${cancelledCount} pending tasks for project ${projectId}`);
    return res.status(200).json({ message: `Successfully cancelled ${cancelledCount} pending tasks.`, cancelledCount });

  } catch (error: any) {
    console.error(`[API /api/tasks/cancel-pending] Error cancelling all pending tasks for project ${projectId}:`, error);
    return res.status(500).json({ message: 'Internal server error while cancelling all pending tasks', error: error.message });
  }
});

export default router; 