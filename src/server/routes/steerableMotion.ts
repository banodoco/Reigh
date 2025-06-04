import express, { Request, Response } from 'express';
import { db } from '@/lib/db';
import { tasks as tasksSchema } from '../../../db/schema/schema';
import { randomUUID } from 'crypto';

const router = express.Router() as any;

interface TravelRequestBody {
  project_id: string;
  shot_id?: string; // optional for reference
  image_urls: string[]; // ordered list of anchor image URLs (length >= 2)
  base_prompts: string[]; // list of prompts (length 1 or segments)
  negative_prompts?: string[]; // optional list of negative prompts
  segment_frames: number[]; // list length 1 or segments
  frame_overlap: number[]; // list length 1 or segments
  resolution?: string; // e.g., "700x460"
  model_name?: string;
  seed?: number;
  debug?: boolean;
  use_causvid_lora?: boolean;
  fade_in_duration?: any; // JSON value (string or object)
  fade_out_duration?: any; // JSON value (string or object)
  after_first_post_generation_saturation?: number;
  params_json_str?: string;
}

/**
 * POST /api/steerable-motion/travel-between-images
 * Queues a new "travel_orchestrator" task mirroring the behaviour of the Python CLI.
 * Accepts JSON payload defined by TravelRequestBody.
 */
router.post('/travel-between-images', async (req: any, res: any) => {
  const body = req.body as TravelRequestBody;

  // Basic validation
  if (!body.project_id) {
    return res.status(400).json({ message: 'project_id is required.' });
  }
  if (!body.image_urls || body.image_urls.length < 2) {
    return res.status(400).json({ message: 'At least two image_urls are required.' });
  }
  if (!body.base_prompts || body.base_prompts.length === 0) {
    return res.status(400).json({ message: 'base_prompts is required (at least one prompt).' });
  }
  if (!body.segment_frames || body.segment_frames.length === 0) {
    return res.status(400).json({ message: 'segment_frames is required.' });
  }
  if (!body.frame_overlap || body.frame_overlap.length === 0) {
    return res.status(400).json({ message: 'frame_overlap is required.' });
  }

  try {
    // Generate IDs & run meta
    const runId = new Date().toISOString().replace(/[-:.TZ]/g, ''); // compact timestamp
    const orchestratorTaskId = `sm_travel_orchestrator_${runId.substring(2, 10)}_${randomUUID().slice(0, 6)}`;

    // Build orchestrator payload (subset of the huge Python equivalent)
    const orchestratorPayload = {
      orchestrator_task_id: orchestratorTaskId,
      run_id: runId,
      input_image_paths_resolved: body.image_urls,
      base_prompts_expanded: body.base_prompts,
      negative_prompts_expanded: body.negative_prompts ?? [''],
      segment_frames_expanded: body.segment_frames,
      frame_overlap_expanded: body.frame_overlap,
      parsed_resolution_wh: body.resolution ?? '700x460',
      model_name: body.model_name ?? 'vace_14B',
      seed_base: body.seed ?? 789,
      use_causvid_lora: body.use_causvid_lora ?? true,
      fade_in_params_json_str: body.fade_in_duration ?? '{"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}',
      fade_out_params_json_str: body.fade_out_duration ?? '{"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}',
      after_first_post_generation_saturation: body.after_first_post_generation_saturation ?? 0.6,
      params_json_str_override: body.params_json_str ?? '{"steps":4}',
      debug_mode_enabled: body.debug ?? true,
      shot_id: body.shot_id ?? undefined
    };

    // Insert task into SQLite via Drizzle
    const inserted = await db.insert(tasksSchema).values({
      projectId: body.project_id,
      taskType: 'travel_orchestrator',
      params: {
        orchestrator_details: orchestratorPayload,
        task_id: orchestratorTaskId
      },
      status: 'Pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    if (inserted.length === 0) {
      return res.status(500).json({ message: 'Failed to create orchestrator task.' });
    }

    return res.status(201).json(inserted[0]);
  } catch (err: any) {
    console.error('[API /steerable-motion/travel-between-images] Error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err?.message ?? 'unknown' });
  }
});

export default router; 