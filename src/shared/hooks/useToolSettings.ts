import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useProject } from '@/shared/contexts/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { toolsManifest } from '@/tools';

export type SettingsScope = 'user' | 'project' | 'shot';

// Tool defaults registry - client-side version matching server
const toolDefaults: Record<string, unknown> = Object.fromEntries(
  toolsManifest.map(toolSettings => [toolSettings.id, toolSettings.defaults])
);

// Deep merge helper (client-side version)
function deepMerge(target: any, ...sources: any[]): any {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

interface ToolSettingsContext {
  projectId?: string;
  shotId?: string;
}

interface UpdateToolSettingsParams {
  scope: SettingsScope;
  id: string;
  toolId: string;
  patch: unknown;
}

/**
 * Fetch and merge tool settings from all scopes using direct Supabase calls
 * This replaces the Express API approach for better mobile reliability
 */
async function fetchToolSettingsSupabase(toolId: string, ctx: ToolSettingsContext): Promise<unknown> {
  try {
    // Mobile optimization: Cache user info to avoid repeated auth calls
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Mobile optimization: Use more efficient queries with targeted JSON extraction
    // Instead of fetching entire settings objects, extract only the tool-specific data
    const [userResult, projectResult, shotResult] = await Promise.all([
      // User settings - extract only the tool-specific settings
      supabase
        .from('users')
        .select(`settings->${toolId}`)
        .eq('id', user.id)
        .maybeSingle(), // More mobile-friendly than .single()
      
      // Project settings (if projectId provided)
      ctx.projectId ? 
        supabase
          .from('projects')
          .select(`settings->${toolId}`)
          .eq('id', ctx.projectId)
          .maybeSingle() : // More mobile-friendly than .single()
        Promise.resolve({ data: null, error: null }),
      
      // Shot settings (if shotId provided)  
      ctx.shotId ?
        supabase
          .from('shots')
          .select(`settings->${toolId}`)
          .eq('id', ctx.shotId)
          .maybeSingle() : // More mobile-friendly than .single()
        Promise.resolve({ data: null, error: null }),
    ]);

    // Handle errors more gracefully for mobile
    if (userResult.error && !userResult.error.message.includes('No rows found')) {
      console.warn('[fetchToolSettingsSupabase] User settings error:', userResult.error);
    }
    if (projectResult.error && !projectResult.error.message.includes('No rows found')) {
      console.warn('[fetchToolSettingsSupabase] Project settings error:', projectResult.error);
    }
    if (shotResult.error && !shotResult.error.message.includes('No rows found')) {
      console.warn('[fetchToolSettingsSupabase] Shot settings error:', shotResult.error);
    }

    // Extract tool-specific settings (already targeted by query)
    const userSettings = (userResult.data?.[`settings->${toolId}`] as any) ?? {};
    const projectSettings = (projectResult.data?.[`settings->${toolId}`] as any) ?? {};
    const shotSettings = (shotResult.data?.[`settings->${toolId}`] as any) ?? {};

    // Merge in priority order: defaults → user → project → shot
    return deepMerge(
      {},
      toolDefaults[toolId] ?? {},
      userSettings,
      projectSettings,
      shotSettings
    );

  } catch (error) {
    console.error('[fetchToolSettingsSupabase] Error:', error);
    // Mobile-friendly error handling - provide more context
    if (error?.message?.includes('Failed to fetch')) {
      throw new Error('Network connection issue. Please check your internet connection.');
    }
    throw error;
  }
}

/**
 * Update tool settings using direct Supabase calls
 */
async function updateToolSettingsSupabase(params: UpdateToolSettingsParams): Promise<void> {
  const { scope, id, toolId, patch } = params;

  try {
    let tableName: string;
    switch (scope) {
      case 'user':
        tableName = 'users';
        break;
      case 'project':
        tableName = 'projects';
        break;
      case 'shot':
        tableName = 'shots';
        break;
      default:
        throw new Error(`Invalid scope: ${scope}`);
    }

    // Get current settings for this entity
    const { data: currentEntity, error: fetchError } = await supabase
      .from(tableName)
      .select('settings')
      .eq('id', id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch current ${scope} settings: ${fetchError.message}`);
    }

    const currentSettings = (currentEntity?.settings as any) ?? {};
    const currentToolSettings = currentSettings[toolId] ?? {};
    const updatedToolSettings = deepMerge({}, currentToolSettings, patch);

    // Update the settings
    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        settings: {
          ...currentSettings,
          [toolId]: updatedToolSettings
        }
      })
      .eq('id', id);

    if (updateError) {
      throw new Error(`Failed to update ${scope} settings: ${updateError.message}`);
    }

  } catch (error) {
    console.error('[updateToolSettingsSupabase] Error:', error);
    throw error;
  }
}

// Type overloads
export function useToolSettings<T>(toolId: string, context?: { projectId?: string; shotId?: string; enabled?: boolean }): {
  settings: T | undefined;
  isLoading: boolean;
  update: (scope: SettingsScope, settings: Partial<T>) => void;
  isUpdating: boolean;
};

/**
 * Hook for managing tool settings with direct Supabase integration
 * This replaces the Express API approach for better mobile reliability
 */
export function useToolSettings<T>(
  toolId: string,
  context?: { projectId?: string; shotId?: string; enabled?: boolean }
) {
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();

  // Determine parameter shapes
  const projectId: string | undefined = context?.projectId ?? selectedProjectId;
  const shotId: string | undefined = context?.shotId;
  const fetchEnabled: boolean = context?.enabled ?? true;

  // Fetch merged settings using Supabase with mobile optimizations
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['toolSettings', toolId, projectId, shotId],
    queryFn: () => fetchToolSettingsSupabase(toolId, { projectId, shotId }),
    enabled: !!toolId && fetchEnabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    // Mobile-specific optimizations
    retry: (failureCount, error) => {
      // Don't retry auth errors
      if (error?.message?.includes('Authentication required')) {
        return false;
      }
      // Retry up to 3 times for network errors on mobile
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => {
      // Faster retry schedule for settings: 500ms, 1s, 2s
      return Math.min(500 * Math.pow(2, attemptIndex), 2000);
    },
    // Shorter timeout for critical settings data
    networkMode: 'online',
  });

  // Log errors for debugging
  if (error) {
    console.error('[useToolSettings] Query error:', error);
  }

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async ({ scope, settings: newSettings }: { scope: SettingsScope; settings: Partial<T> }) => {
      let idForScope: string | undefined;
      
      if (scope === 'user') {
        // Get userId from auth for user scope
        const { data: { user } } = await supabase.auth.getUser();
        idForScope = user?.id;
      } else if (scope === 'project') {
        idForScope = projectId;
      } else if (scope === 'shot') {
        idForScope = shotId;
      }
      
      if (!idForScope) {
        throw new Error(`Missing identifier for ${scope} tool settings update`);
      }

      await updateToolSettingsSupabase({
          scope,
          id: idForScope,
          toolId,
          patch: newSettings,
      });
    },
    onSuccess: () => {
      // Invalidate the query to refetch updated settings
      queryClient.invalidateQueries({ 
        queryKey: ['toolSettings', toolId, projectId, shotId] 
      });
    },
    onError: (error: Error) => {
      console.error('[useToolSettings] Update error:', error);
      toast.error(`Failed to save ${toolId} settings: ${error.message}`);
    },
  });

  const update = (scope: SettingsScope, settings: Partial<T>) => {
    return updateMutation.mutate({ scope, settings });
  };

  return {
    settings: settings as T | undefined,
    isLoading,
    update,
    isUpdating: updateMutation.isPending,
  };
} 