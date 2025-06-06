import cron from 'node-cron';
import { db } from '@/lib/db';
import { tasks as tasksSchema, generations as generationsSchema, shotGenerations as shotGenerationsSchema } from '../../../db/schema/schema';
import { eq, and, isNull, sql, inArray, notInArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { broadcast } from './webSocketService';

// Define the structure of a task object more explicitly if possible, for now using 'any'
type Task = typeof tasksSchema.$inferSelect;

/**
 * Strips the server IP address and port from local image paths.
 * Converts "http://213.173.102.76:10368/files/image.png" to "files/image.png"
 * @param imagePath - The image path to normalize
 * @returns The normalized path
 */
function normalizeImagePath(imagePath: string): string {
  if (!imagePath) return imagePath;
  
  // Check if it's a local server URL (has IP address pattern)
  const localServerPattern = /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/;
  
  if (localServerPattern.test(imagePath)) {
    // Extract just the path part after the server address and remove leading slash
    const url = new URL(imagePath);
    return url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
  }
  
  return imagePath;
}

/**
 * Recursively normalizes image paths in an object or array
 * @param obj - The object/array to process
 * @returns The object with normalized image paths
 */
function normalizeImagePathsInObject(obj: any): any {
  if (typeof obj === 'string') {
    // Check if this string looks like an image URL
    if (obj.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) || obj.includes('/files/')) {
      return normalizeImagePath(obj);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeImagePathsInObject(item));
  }
  
  if (obj && typeof obj === 'object') {
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Recursively process all values to find and normalize image paths.
      // The previous if/else block was redundant.
      normalized[key] = normalizeImagePathsInObject(value);
    }
    return normalized;
  }
  
  return obj;
}

/**
 * Processes a completed 'travel_stitch' task to create generation and shot_generation records.
 * @param task - The completed travel_stitch task object.
 */
export async function processCompletedStitchTask(task: Task): Promise<void> {
  if (task.taskType !== 'travel_stitch' || task.status !== 'Complete') {
    console.warn(`[VideoStitchGenDebug] Task ${task.id} is not a completed travel_stitch task. Skipping.`);
    return;
  }

  console.log(`[VideoStitchGenDebug] Processing completed travel_stitch task ${task.id}.`);
  
  // Normalize image paths in task params
  const normalizedParams = normalizeImagePathsInObject(task.params);
  const params = normalizedParams as any;
  
  const shotId = params?.full_orchestrator_payload?.shot_id;
  let outputLocation = task.outputLocation;
  const projectId = task.projectId;

  // Also normalize the output location
  if (outputLocation) {
    outputLocation = normalizeImagePath(outputLocation);
  }

  if (!shotId || !outputLocation || !projectId) {
    console.error(`[VideoStitchGenDebug] Missing critical data for task ${task.id}. Cannot create generation.`, { shotId, outputLocation, projectId, taskParams: params });
    // Optionally, update task with an error status or log to a specific error table
    // For now, we won't update generationProcessedAt so it might be retried, or handle manually
    return;
  }

  try {
    const newGenerationId = randomUUID();
    const insertedGenerations = await db.insert(generationsSchema).values({
      id: newGenerationId,
      projectId: projectId,
      tasks: [task.id],
      location: outputLocation, // This is now normalized
      type: 'video_travel_output',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    if (insertedGenerations.length === 0) {
      console.error(`[VideoStitchGenDebug] Failed to insert generation for task ${task.id}.`);
      return; // Don't mark as processed if generation failed
    }
    
    const newGeneration = insertedGenerations[0];
    console.log(`[VideoStitchGenDebug] Created generation ${newGeneration.id} for task ${task.id} with normalized location: ${outputLocation}.`);

    const maxPositionResult = await db
      .select({ value: sql<number>`max(${shotGenerationsSchema.position})` })
      .from(shotGenerationsSchema)
      .where(eq(shotGenerationsSchema.shotId, shotId));
    
    const nextPosition = (maxPositionResult[0]?.value ?? -1) + 1;

    const insertedShotGenerations = await db.insert(shotGenerationsSchema).values({
      shotId: shotId,
      generationId: newGeneration.id,
      position: nextPosition,
    }).returning();

    if (insertedShotGenerations.length === 0) {
      console.error(`[VideoStitchGenDebug] Failed to insert shot_generation for generation ${newGeneration.id} (task ${task.id}).`);
      return; // Don't mark as processed if shot_generation linking failed
    }

    console.log(`[VideoStitchGenDebug] Created shot_generation ${insertedShotGenerations[0].id} linking generation ${newGeneration.id} to shot ${shotId} (task ${task.id}).`);

    // Mark the task as processed and update its params with the normalized paths
    await db.update(tasksSchema)
      .set({
        generationProcessedAt: new Date(),
        params: normalizedParams,
      })
      .where(eq(tasksSchema.id, task.id));
    
    console.log(`[VideoStitchGenDebug] Marked task ${task.id} as generation_processed and updated its params.`);

    // After creating the generation and shot_generation, notify the client.
    broadcast({ 
      type: 'TASK_COMPLETED', 
      payload: { 
        taskId: task.id, 
        projectId: task.projectId 
      } 
    });
    broadcast({
      type: 'GENERATIONS_UPDATED',
      payload: {
        projectId: task.projectId,
        shotId: shotId,
      }
    });

  } catch (error: any) {
    console.error(`[VideoStitchGenDebug] Error during generation/shot_generation creation for task ${task.id}:`, error);
    // Don't mark as processed if an error occurred
  }
}

/**
 * Polls for active tasks and broadcasts updates.
 */
export async function pollAndBroadcastTaskUpdates(): Promise<void> {
  // console.log('[TaskStatusPoller] Checking for active task updates...');
  try {
    const activeTasks = await db
      .select()
      .from(tasksSchema)
      .where(
        notInArray(tasksSchema.status, ['Complete', 'Failed', 'Cancelled'])
      );

    if (activeTasks.length > 0) {
      // console.log(`[TaskStatusPoller] Found ${activeTasks.length} active tasks.`);
      
      // Group tasks by project ID
      const tasksByProject = activeTasks.reduce((acc, task) => {
        if (task.projectId) {
          if (!acc[task.projectId]) {
            acc[task.projectId] = [];
          }
          acc[task.projectId].push(task);
        }
        return acc;
      }, {} as Record<string, Task[]>);

      // Broadcast updates for each project
      for (const [projectId, tasks] of Object.entries(tasksByProject)) {
        broadcast({
          type: 'TASKS_STATUS_UPDATE',
          payload: {
            projectId,
            tasks,
          },
        });
      }
    } else {
      // console.log('[TaskStatusPoller] No active tasks found.');
    }
  } catch (error) {
    console.error('[TaskStatusPoller] Error polling for task status updates:', error);

    // --- Start Enhanced Error Logging ---
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      console.error('[TaskStatusPoller] A JSON parsing error occurred. This likely means a task has a malformed `params` or `dependantOn` field, possibly written by an external script.');
      console.error('[TaskStatusPoller] Fetching raw task data to identify the problematic row...');
      
      try {
        // Use a raw query to bypass Drizzle's automatic JSON parsing on the field.
        const rawTasks = await db.all(sql`
          SELECT id, params, "dependant_on" as "dependantOn"
          FROM tasks
          WHERE status NOT IN ('Complete', 'Failed', 'Cancelled')
        `);

        console.error(`[TaskStatusPoller] Found ${rawTasks.length} active tasks. Inspecting for bad JSON...`);

        for (const task of rawTasks as any[]) {
          // Check `params` field
          try {
            JSON.parse(task.params);
          } catch (e: any) {
            console.error(`[TaskStatusPoller] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
            console.error(`[TaskStatusPoller] CORRUPTED JSON DETECTED IN TASK ID: ${task.id}`);
            console.error(`[TaskStatusPoller] Offending Column: params`);
            console.error(`[TaskStatusPoller] Raw Content:`, task.params);
            console.error(`[TaskStatusPoller] Parse Error:`, e.message);
            console.error(`[TaskStatusPoller] <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`);
          }
          // Check `dependantOn` field
          if (task.dependantOn) { // It can be null
            try {
              JSON.parse(task.dependantOn);
            } catch (e: any) {
              console.error(`[TaskStatusPoller] >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
              console.error(`[TaskStatusPoller] CORRUPTED JSON DETECTED IN TASK ID: ${task.id}`);
              console.error(`[TaskStatusPoller] Offending Column: dependantOn`);
              console.error(`[TaskStatusPoller] Raw Content:`, task.dependantOn);
              console.error(`[TaskStatusPoller] Parse Error:`, e.message);
              console.error(`[TaskStatusPoller] <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`);
            }
          }
        }
      } catch (rawFetchError) {
        console.error('[TaskStatusPoller] Could not even fetch raw task data. This is a deeper issue.', rawFetchError);
      }
    }
    // --- End Enhanced Error Logging ---
  }
}

let pollerStarted = false;
let statusPollerStarted = false;

/**
 * Starts a cron job to poll for task status updates.
 */
export function startTaskStatusPoller(): void {
  if (statusPollerStarted) {
    console.log('[TaskStatusPoller] Status poller already started.');
    return;
  }
  console.log('[TaskStatusPoller] Started task status poller to run every 5 seconds.');
  cron.schedule('*/5 * * * * *', pollAndBroadcastTaskUpdates);
  statusPollerStarted = true;
}

/**
 * Starts a cron job to poll for completed travel_stitch tasks.
 */
export function startTaskPoller(): void {
  if (pollerStarted) {
    console.log('[TaskPoller] Poller already started.');
    return;
  }

  console.log('[TaskPoller] Starting task poller to run every 10 seconds.');
  
  // Schedule a task to run every 10 seconds.
  cron.schedule('*/10 * * * * *', async () => {
    // console.log('[TaskPoller] Checking for completed travel_stitch tasks...'); // Can be noisy
    try {
      const tasksToProcess = await db
        .select()
        .from(tasksSchema)
        .where(
          and(
            eq(tasksSchema.taskType, 'travel_stitch'),
            eq(tasksSchema.status, 'Complete'),
            isNull(tasksSchema.generationProcessedAt)
          )
        );

      if (tasksToProcess.length > 0) {
        console.log(`[TaskPoller] Found ${tasksToProcess.length} completed travel_stitch tasks to process.`);
        for (const task of tasksToProcess) {
          // Using await here to process tasks one by one within a polling cycle.
          // If one fails, subsequent ones in this batch will still be attempted in the NEXT cycle if not marked.
          // For true parallel processing of many tasks, a more robust queue/worker system would be needed.
          await processCompletedStitchTask(task);
        }
      } else {
        // console.log('[TaskPoller] No new completed travel_stitch tasks found.'); // Can be noisy, enable if needed
      }
    } catch (error) {
      console.error('[TaskPoller] Error querying for tasks to process:', error);
    }
  });

  // Schedule the new status poller to run every 5 seconds
  cron.schedule('*/5 * * * * *', pollAndBroadcastTaskUpdates);
  console.log('[TaskStatusPoller] Started task status poller to run every 5 seconds.');

  pollerStarted = true;
} 