import cron from 'node-cron';
import { db } from '@/lib/db';
import { tasks as tasksSchema, generations as generationsSchema, shotGenerations as shotGenerationsSchema } from '../../../db/schema/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Define the structure of a task object more explicitly if possible, for now using 'any'
type Task = typeof tasksSchema.$inferSelect;

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
  const params = task.params as any; // Assuming params is an object
  const shotId = params?.full_orchestrator_payload?.shot_id;
  const outputLocation = task.outputLocation;
  const projectId = task.projectId;

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
      location: outputLocation,
      type: 'video_travel_output',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    if (insertedGenerations.length === 0) {
      console.error(`[VideoStitchGenDebug] Failed to insert generation for task ${task.id}.`);
      return; // Don't mark as processed if generation failed
    }
    
    const newGeneration = insertedGenerations[0];
    console.log(`[VideoStitchGenDebug] Created generation ${newGeneration.id} for task ${task.id}.`);

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

    // Mark the task as processed
    await db.update(tasksSchema)
      .set({ generationProcessedAt: new Date() })
      .where(eq(tasksSchema.id, task.id));
    
    console.log(`[VideoStitchGenDebug] Marked task ${task.id} as generation_processed.`);

  } catch (error: any) {
    console.error(`[VideoStitchGenDebug] Error during generation/shot_generation creation for task ${task.id}:`, error);
    // Don't mark as processed if an error occurred
  }
}

let pollerStarted = false;

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
    console.log('[TaskPoller] Checking for completed travel_stitch tasks...');
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

  pollerStarted = true;
} 