import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';
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
// Helper function to add timeout to auth calls - aligned with Supabase global timeout
async function getUserWithTimeout(timeoutMs = 7000) {
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null }, error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout - please check your connection')), timeoutMs)
      )
    ]);
    
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === 'AbortError') {
      throw new Error('Auth request was cancelled - please try again');
    }
    throw error;
  }
}

async function fetchToolSettingsSupabase(toolId: string, ctx: ToolSettingsContext, signal?: AbortSignal): Promise<unknown> {
  try {
    // Check if request was cancelled before starting
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    // Mobile optimization: Cache user info to avoid repeated auth calls
    // Add timeout to prevent hanging on mobile connections (aligned with Supabase global timeout)
    const { data: { user }, error: authError } = await getUserWithTimeout(7000);
    if (authError || !user) {
      throw new Error('Authentication required');
    }
    
    // Check again after auth call
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }

    // Mobile optimization: Use more efficient queries with targeted JSON extraction
    // NOTE: We fetch the entire settings JSON to avoid SQL path issues with tool IDs containing hyphens.
    const [userResult, projectResult, shotResult] = await Promise.all([
      supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .maybeSingle(),

      ctx.projectId
        ? supabase
            .from('projects')
            .select('settings')
            .eq('id', ctx.projectId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      ctx.shotId
        ? supabase
            .from('shots')
            .select('settings')
            .eq('id', ctx.shotId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
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

    // Extract tool-specific settings from the full settings JSON
    const userSettings = (userResult.data?.settings?.[toolId] as any) ?? {};
    const projectSettings = (projectResult.data?.settings?.[toolId] as any) ?? {};
    const shotSettings = (shotResult.data?.settings?.[toolId] as any) ?? {};

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
    // Handle different types of errors appropriately
    if (error?.name === 'AbortError' || error?.message?.includes('Request was cancelled')) {
      console.warn('[fetchToolSettingsSupabase] Request was cancelled - component likely unmounted');
      throw new Error('Request was cancelled');
    }
    if (error?.message?.includes('Failed to fetch')) {
      throw new Error('Network connection issue. Please check your internet connection.');
    }
    if (error?.message?.includes('Auth timeout') || error?.message?.includes('Auth request was cancelled')) {
      console.warn('[fetchToolSettingsSupabase] Auth timeout - continuing with defaults');
      throw new Error('Authentication timeout - using default settings');
    }
    throw error;
  }
}

/**
 * Update tool settings using direct Supabase calls
 */
async function updateToolSettingsSupabase(params: UpdateToolSettingsParams, signal?: AbortSignal): Promise<void> {
  const { scope, id, toolId, patch } = params;

  try {
    // Check if request was cancelled before starting
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
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
    
    // Check if request was cancelled after fetch
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
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
    // Handle abort errors specifically
    if (error?.name === 'AbortError' || error?.message?.includes('Request was cancelled')) {
      console.warn('[updateToolSettingsSupabase] Request was cancelled - component likely unmounted');
      throw new Error('Request was cancelled');
    }
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
  
  // Ref to track active update controllers for cleanup
  const updateControllersRef = useRef<Set<AbortController>>(new Set());

  // Determine parameter shapes
  const projectId: string | undefined = context?.projectId ?? selectedProjectId;
  const shotId: string | undefined = context?.shotId;
  const fetchEnabled: boolean = context?.enabled ?? true;

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      updateControllersRef.current.forEach(controller => {
        controller.abort();
      });
      updateControllersRef.current.clear();
    };
  }, []);

  // Fetch merged settings using Supabase with mobile optimizations
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['toolSettings', toolId, projectId, shotId],
    queryFn: ({ signal }) => fetchToolSettingsSupabase(toolId, { projectId, shotId }, signal),
    enabled: !!toolId && fetchEnabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    // Mobile-specific optimizations
    retry: (failureCount, error) => {
      // Don't retry auth errors or cancelled requests
      if (error?.message?.includes('Authentication required') || 
          error?.message?.includes('Request was cancelled')) {
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
    mutationFn: async ({ scope, settings: newSettings, signal }: { 
      scope: SettingsScope; 
      settings: Partial<T>; 
      signal?: AbortSignal;
    }) => {
      let idForScope: string | undefined;
      
      if (scope === 'user') {
        // Get userId from auth for user scope with timeout protection (aligned with global timeout)
        const { data: { user } } = await getUserWithTimeout(7000);
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
      }, signal);
    },
    onSuccess: () => {
      // Invalidate the query to refetch updated settings
      queryClient.invalidateQueries({ 
        queryKey: ['toolSettings', toolId, projectId, shotId] 
      });
    },
    onError: (error: Error) => {
      console.error('[useToolSettings] Update error:', error);
      // Don't show toast for cancelled requests
      if (!error?.message?.includes('Request was cancelled')) {
        toast.error(`Failed to save ${toolId} settings: ${error.message}`);
      }
    },
  });

  const update = (scope: SettingsScope, settings: Partial<T>) => {
    // Create an AbortController for this update and track it
    const controller = new AbortController();
    updateControllersRef.current.add(controller);
    
    // Clean up controller when mutation completes
    const cleanup = () => {
      updateControllersRef.current.delete(controller);
    };
    
    // Set up cleanup handlers
    controller.signal.addEventListener('abort', cleanup);
    
    return updateMutation.mutate(
      { scope, settings, signal: controller.signal },
      {
        onSettled: cleanup, // Clean up on both success and error
      }
    );
  };

  return {
    settings: settings as T | undefined,
    isLoading,
    update,
    isUpdating: updateMutation.isPending,
  };
} 