import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRef, useCallback } from 'react';
import { deepMerge } from '../lib/deepEqual';
import { useProject } from '@/shared/contexts/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

export type SettingsScope = 'user' | 'project' | 'shot';

interface ToolSettingsContext {
  projectId?: string;
  shotId?: string;
}

// Define the tool settings from the tools manifest for defaults
const getToolDefaults = (toolId: string): any => {
  // Import the tools manifest to get defaults
  try {
    // Dynamic import to avoid circular dependencies
    return {};
  } catch {
    return {};
  }
};

export async function fetchToolSettingsFromSupabase(toolId: string, ctx: ToolSettingsContext): Promise<unknown> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Fetch user, project, and shot settings in parallel
  const promises = [
    // User settings
    supabase
      .from('users')
      .select('settings')
      .eq('id', user.id)
      .single(),
    
    // Project settings (if projectId provided)
    ctx.projectId ? supabase
      .from('projects')
      .select('settings')
      .eq('id', ctx.projectId)
      .single() : Promise.resolve({ data: null }),
    
    // Shot settings (if shotId provided)
    ctx.shotId ? supabase
      .from('shots')
      .select('settings')
      .eq('id', ctx.shotId)
      .single() : Promise.resolve({ data: null })
  ];

  const [userResult, projectResult, shotResult] = await Promise.all(promises);

  // Extract tool-specific settings from each scope
  const userSettings = userResult.data?.settings?.[toolId] || {};
  const projectSettings = projectResult.data?.settings?.[toolId] || {};
  const shotSettings = shotResult.data?.settings?.[toolId] || {};

  // Get tool defaults
  const defaults = getToolDefaults(toolId);

  // Merge settings: defaults → user → project → shot
  return deepMerge(deepMerge(deepMerge(defaults, userSettings), projectSettings), shotSettings);
}

async function updateToolSettingsInSupabase(toolId: string, scope: SettingsScope, scopeId: string, patch: unknown): Promise<void> {
  let tableName: string;
  let whereClause: any;

  switch (scope) {
    case 'user':
      tableName = 'users';
      whereClause = { id: scopeId };
      break;
    case 'project':
      tableName = 'projects';
      whereClause = { id: scopeId };
      break;
    case 'shot':
      tableName = 'shots';
      whereClause = { id: scopeId };
      break;
    default:
      throw new Error(`Invalid scope: ${scope}`);
  }

  // First, get current settings
  const { data: currentRecord } = await supabase
    .from(tableName)
    .select('settings')
    .match(whereClause)
    .single();

  // Merge new settings with existing ones
  const currentSettings = currentRecord?.settings || {};
  const currentToolSettings = currentSettings[toolId] || {};
  const mergedToolSettings = deepMerge(currentToolSettings, patch);

  // Update the settings column
  const { error } = await supabase
    .from(tableName)
    .update({
      settings: {
        ...currentSettings,
        [toolId]: mergedToolSettings
      }
    })
    .match(whereClause);

  if (error) {
    throw new Error(`Failed to update ${scope} settings: ${error.message}`);
  }
}

export async function extractToolSettingsFromTask(taskId: string): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Fetch the task details from Supabase
  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error || !task) {
    throw new Error('Task not found or unauthorized');
  }

  const params = task.params as any;
  
  // Extract video-travel settings from task params (same logic as Express route)
  const orchestratorDetails = params?.full_orchestrator_payload ?? params?.orchestrator_details;
  
  const settings = {
    videoControlMode: 'batch' as const,
    batchVideoPrompt: orchestratorDetails?.base_prompts?.[0] || params?.prompt || '',
    batchVideoFrames: orchestratorDetails?.segment_frames?.[0] || params?.frames || 24,
    batchVideoContext: orchestratorDetails?.frame_overlap?.[0] || params?.context || 16,
    batchVideoSteps: (() => {
      // Priority: explicit params.steps, override JSON, orchestratorDetails fields, fallback 20
      if (typeof params?.steps === 'number') return params.steps;

      // Parse params_json_str_override if present to extract steps
      let overrideSteps: number | undefined;
      const overrideStr = orchestratorDetails?.params_json_str_override ?? params?.params_json_str_override;
      if (overrideStr && typeof overrideStr === 'string') {
        try {
          const parsed = JSON.parse(overrideStr);
          if (typeof parsed?.steps === 'number') overrideSteps = parsed.steps;
        } catch { /* ignore JSON parse errors */ }
      }

      if (overrideSteps) return overrideSteps;

      if (typeof orchestratorDetails?.steps === 'number') return orchestratorDetails.steps;
      if (typeof orchestratorDetails?.num_inference_steps === 'number') return orchestratorDetails.num_inference_steps;

      return 20;
    })(),
    dimensionSource: 'custom' as const,
    ...(() => {
      // Parse resolution (e.g., "902x508") into width & height numbers
      const res = orchestratorDetails?.parsed_resolution_wh ?? params?.parsed_resolution_wh;
      if (typeof res === 'string' && res.includes('x')) {
        const [w, h] = res.split('x').map((n: string) => parseInt(n, 10));
        return { customWidth: w, customHeight: h };
      }
      if (Array.isArray(res) && res.length === 2) {
        const [w, h] = res;
        return { customWidth: w, customHeight: h };
      }
      return { customWidth: params?.width, customHeight: params?.height };
    })(),
    enhancePrompt: params?.enhance_prompt || false,
    generationMode: 'batch' as const,
    // Expose the LoRAs (url + strength) so the client can attach them
    loras: Object.entries(orchestratorDetails?.additional_loras || {}).map(([url, strength]) => ({ url, strength })),
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

  return settings;
}

// Overload type definitions
export function useToolSettings<T>(toolId: string, context?: { projectId?: string; shotId?: string; enabled?: boolean }): {
  settings: T | undefined;
  isLoading: boolean;
  update: (scope: SettingsScope, settings: Partial<T>) => void;
  isUpdating: boolean;
};

// Unified implementation using Supabase directly
export function useToolSettings<T>(
  toolId: string,
  context?: { projectId?: string; shotId?: string; enabled?: boolean }
) {
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();

  // Determine parameter shapes
  let projectId: string | undefined = context?.projectId ?? selectedProjectId;
  let shotId: string | undefined = context?.shotId;
  const fetchEnabled: boolean = context?.enabled ?? true;

  // Fetch merged settings from Supabase
  const { data: settings, isLoading } = useQuery({
    queryKey: ['toolSettings', toolId, projectId, shotId],
    queryFn: () => fetchToolSettingsFromSupabase(toolId, { projectId, shotId }),
    enabled: !!toolId && fetchEnabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Don't retry if it's an auth error
      if (error.message.includes('not authenticated')) {
        return false;
      }
      return failureCount < 2;
    }
  });

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async ({ scope, settings: newSettings }: { scope: SettingsScope; settings: Partial<T> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let idForScope: string | undefined;
      
      if (scope === 'user') {
        idForScope = user.id;
      } else if (scope === 'project') {
        idForScope = projectId;
      } else if (scope === 'shot') {
        idForScope = shotId;
      }
      
      if (!idForScope) {
        throw new Error('Missing identifier for tool settings update');
      }

      await updateToolSettingsInSupabase(toolId, scope, idForScope, newSettings);
    },
    onSuccess: () => {
      // Invalidate the query to refetch updated settings
      queryClient.invalidateQueries({ 
        queryKey: ['toolSettings', toolId, projectId, shotId] 
      });
    },
    onError: (error) => {
      console.error('Failed to update tool settings:', error);
      toast.error('Failed to save settings');
    }
  });

  const update = (scope: SettingsScope, settings: Partial<T>) => {
    return updateMutation.mutate({ scope, settings });
  };

  return {
    settings,
    isLoading,
    update,
    isUpdating: updateMutation.isPending,
  };
} 