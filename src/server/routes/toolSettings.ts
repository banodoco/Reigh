import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { resolveToolSettings, updateToolSettings, SettingsScope } from '../services/toolSettingsService';

// Re-augment the Express Request type
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: { id: string };
    }
  }
}

const router = express.Router();

// Define an asyncHandler to wrap async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// GET /api/tool-settings/resolve
router.get('/resolve', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { toolId, projectId, shotId } = req.query;
    
    if (!toolId || typeof toolId !== 'string') {
      return res.status(400).json({ error: 'toolId is required' });
    }

    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const settings = await resolveToolSettings(toolId, {
      userId,
      projectId: projectId as string | undefined,
      shotId: shotId as string | undefined,
    });

    res.json(settings);
  } catch (error) {
    console.error('[tool-settings] Error resolving settings:', error);
    res.status(500).json({ error: 'Failed to resolve tool settings' });
  }
}));

// GET /api/tool-settings/from-task/:taskId
router.get('/from-task/:taskId', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    // Fetch the task details
    const taskResponse = await fetch(`http://localhost:${process.env.PORT || 8085}/api/tasks/by-task-id/${taskId}`);
    if (!taskResponse.ok) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = await taskResponse.json();
    const params = task.params as any;
    
    // Extract video-travel settings from task params
    const orchestratorDetails = params?.full_orchestrator_payload ?? params?.orchestrator_details;
    
    const settings = {
      videoControlMode: 'batch' as const,
      batchVideoPrompt: orchestratorDetails?.base_prompts?.[0] || params?.prompt || '',
      batchVideoFrames: orchestratorDetails?.segment_frames?.[0] || params?.frames || 24,
      batchVideoContext: orchestratorDetails?.frame_overlap?.[0] || params?.context || 16,
      batchVideoSteps: params?.steps || 20,
      dimensionSource: 'custom' as const,
      customWidth: orchestratorDetails?.parsed_resolution_wh?.[0] || params?.width,
      customHeight: orchestratorDetails?.parsed_resolution_wh?.[1] || params?.height,
      enhancePrompt: params?.enhance_prompt || false,
      generationMode: 'batch' as const,
      steerableMotionSettings: {
        negative_prompt: orchestratorDetails?.negative_prompt || params?.negative_prompt || '',
        model_name: params?.model_name || 'vace_14B',
        seed: params?.seed || 789,
        debug: params?.debug ?? true,
        apply_reward_lora: params?.apply_reward_lora ?? false,
        colour_match_videos: params?.colour_match_videos ?? true,
        apply_causvid: params?.apply_causvid ?? true,
        use_lighti2x_lora: params?.use_lighti2x_lora ?? false,
        fade_in_duration: params?.fade_in_duration || '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
        fade_out_duration: params?.fade_out_duration || '{"low_point":0.0,"high_point":1.0,"curve_type":"ease_in_out","duration_factor":0.0}',
        after_first_post_generation_saturation: params?.after_first_post_generation_saturation ?? 1,
        after_first_post_generation_brightness: params?.after_first_post_generation_brightness ?? 0,
        show_input_images: params?.show_input_images ?? false,
      },
      // Check if this is a by-pair generation
      ...(orchestratorDetails?.base_prompts_expanded && orchestratorDetails.base_prompts_expanded.length > 1 ? {
        generationMode: 'by-pair' as const,
        pairConfigs: orchestratorDetails.base_prompts_expanded.map((prompt: string, i: number) => ({
          id: `pair-${i}`,
          prompt,
          frames: orchestratorDetails.segment_frames_expanded?.[i] || 24,
          negativePrompt: orchestratorDetails.negative_prompts_expanded?.[i] || '',
          context: orchestratorDetails.frame_overlap_expanded?.[i] || 16,
        }))
      } : {})
    };

    res.json(settings);
  } catch (error) {
    console.error('[tool-settings] Error extracting settings from task:', error);
    res.status(500).json({ error: 'Failed to extract settings from task' });
  }
}));

// PATCH /api/tool-settings
router.patch('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { scope, id, toolId, patch } = req.body;

    if (!scope || !id || !toolId || patch === undefined) {
      return res.status(400).json({ error: 'scope, id, toolId, and patch are required' });
    }

    if (!['user', 'project', 'shot'].includes(scope)) {
      return res.status(400).json({ error: 'Invalid scope' });
    }

    // For user scope, ensure the user can only update their own settings
    if (scope === 'user' && id !== req.userId) {
      return res.status(403).json({ error: 'Cannot update settings for another user' });
    }

    await updateToolSettings({
      scope: scope as SettingsScope,
      id,
      toolId,
      patch,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[tool-settings] Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update tool settings' });
  }
}));

export default router; 