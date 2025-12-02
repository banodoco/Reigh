import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useProject } from '@/shared/contexts/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { toolsManifest } from '@/tools';

export type SettingsScope = 'user' | 'project' | 'shot';

// Single-flight dedupe for settings fetches across components
const inflightSettingsFetches = new Map<string, Promise<unknown>>();
// Lightweight user cache to avoid repeated auth calls within a short window
let cachedUser: { id: string } | null = null;
let cachedUserAt: number = 0;
const USER_CACHE_MS = 10_000; // 10 seconds

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
// Mobile networks can be much slower - use a more generous default timeout
// to prevent falling back to defaults when the network is just slow
async function getUserWithTimeout(timeoutMs = 15000) {
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    // Fast path: use local session (no network) to avoid auth network call in background
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData?.session?.user || null;
    if (sessionUser) {
      cachedUser = { id: sessionUser.id };
      cachedUserAt = Date.now();
      clearTimeout(timeoutId);
      return { data: { user: sessionUser }, error: null } as any;
    }

    // Use short-lived cache to avoid duplicate getUser calls during bursts
    if (cachedUser && (Date.now() - cachedUserAt) < USER_CACHE_MS) {
      clearTimeout(timeoutId);
      return { data: { user: { id: cachedUser.id } }, error: null } as any;
    }

    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null }, error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout - please check your connection')), timeoutMs)
      )
    ]);
    
    clearTimeout(timeoutId);
    const fetchedUserId = (result as any)?.data?.user?.id;
    if (fetchedUserId) {
      cachedUser = { id: fetchedUserId };
      cachedUserAt = Date.now();
    }
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === 'AbortError') {
      throw new Error('Auth request was cancelled - please try again');
    }
    throw error;
  }

  // Ensure user profile basics exist (username, avatar_url) after we have a session
  try {
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    if (userId) {
      // Read current users row
      const { data: userRow } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      // Attempt to derive defaults from auth metadata
      const authUser = sess.session.user;
      const md = (authUser as any)?.user_metadata || {};
      const derivedUsername = userRow?.username ?? md?.preferred_username ?? md?.user_name ?? md?.nickname ?? md?.name ?? null;
      const derivedAvatar = userRow?.avatar_url ?? md?.avatar_url ?? md?.picture ?? null;

      if (!userRow || !userRow.username || !userRow.avatar_url) {
        await supabase
          .from('users')
          .upsert({
            id: userId,
            username: derivedUsername,
            avatar_url: derivedAvatar,
          }, { onConflict: 'id' });
      }
    }
  } catch {}
}

async function fetchToolSettingsSupabase(toolId: string, ctx: ToolSettingsContext, signal?: AbortSignal): Promise<unknown> {
  try {
    // Check if request was cancelled before starting
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    // Single-flight dedupe key for concurrent identical requests
    const singleFlightKey = JSON.stringify({ toolId, projectId: ctx.projectId ?? null, shotId: ctx.shotId ?? null });
    const existingPromise = inflightSettingsFetches.get(singleFlightKey);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (async () => {
      // Mobile optimization: Cache user info to avoid repeated auth calls
      // Add timeout to prevent hanging on mobile connections (aligned with Supabase global timeout)
      // Use generous timeout for mobile networks
      const { data: { user }, error: authError } = await getUserWithTimeout();
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
      const merged = deepMerge(
        {},
        toolDefaults[toolId] ?? {},
        userSettings,
        projectSettings,
        shotSettings
      );
      
      return merged;
    })();

    inflightSettingsFetches.set(singleFlightKey, promise);
    promise.finally(() => {
      inflightSettingsFetches.delete(singleFlightKey);
    });
    return promise;

  } catch (error) {
    // Handle abort errors silently to reduce noise during task cancellation
    if (error?.name === 'AbortError' || 
        error?.message?.includes('Request was cancelled') ||
        error?.message?.includes('signal is aborted')) {
      // Don't log these as errors - they're expected during component unmounting
      throw new Error('Request was cancelled');
    }
    // Enrich logging with environment context
    try {
      const { data: sess } = await supabase.auth.getSession();
      const contextInfo = {
        visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
        hidden: typeof document !== 'undefined' ? document.hidden : false,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        hasSession: !!sess?.session,
      } as any;

      if (error?.message?.includes('Auth timeout') || error?.message?.includes('Auth request was cancelled')) {
        console.warn('[ToolSettingsAuth] Auth unavailable/timeout, falling back to defaults', {
          toolId,
          projectId: ctx.projectId,
          shotId: ctx.shotId,
          ...contextInfo,
        });
        // Return defaults rather than erroring, so UI remains usable
        return deepMerge({}, toolDefaults[toolId] ?? {});
      }

      if (error?.message?.includes('Failed to fetch')) {
        console.error('[ToolSettingsAuth] Network issue fetching settings', { error: error?.message, ...contextInfo });
        throw new Error('Network connection issue. Please check your internet connection.');
      }

      console.error('[fetchToolSettingsSupabase] Error:', error, contextInfo);
    } catch (e) {
      // If context gathering fails, still rethrow the original error
      console.error('[fetchToolSettingsSupabase] Error (context unavailable):', error);
    }
    throw error;
  }
}

/**
 * Update tool settings using atomic Supabase function
 * This eliminates the read-modify-write pattern for better performance and consistency
 * 
 * @returns The full merged settings after update (for optimistic cache updates)
 */
export async function updateToolSettingsSupabase(params: UpdateToolSettingsParams, signal?: AbortSignal): Promise<any> {
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

    // For patch updates, we need to fetch current settings to merge
    // This is necessary because the caller provides a partial update
    // TODO: In the future, consider passing full settings to eliminate this fetch
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

    // Merge patch with current tool settings
    const currentSettings = (currentEntity?.settings as any) ?? {};
    const currentToolSettings = currentSettings[toolId] ?? {};
    const updatedToolSettings = deepMerge({}, currentToolSettings, patch);

    // Use atomic PostgreSQL function to update settings
    // This is much faster than update() because it happens in a single DB operation
    const { error: rpcError } = await supabase.rpc('update_tool_settings_atomic', {
      p_table_name: tableName,
      p_id: id,
      p_tool_id: toolId,
      p_settings: updatedToolSettings
    });

    if (rpcError) {
      throw new Error(`Failed to update ${scope} settings: ${rpcError.message}`);
    }

    // CRITICAL: Return the full merged settings, not just the patch
    // This ensures the cache gets the exact same data that was saved to the DB
    // Prevents data loss when cache is stale (e.g., multiple tabs, concurrent edits)
    return updatedToolSettings;

  } catch (error) {
    // Handle abort errors silently to reduce noise during task cancellation
    if (error?.name === 'AbortError' || 
        error?.message?.includes('Request was cancelled') ||
        error?.message?.includes('signal is aborted')) {
      // Don't log these as errors - they're expected during component unmounting
      throw new Error('Request was cancelled');
    }
    
    console.error('[updateToolSettingsSupabase] Error:', error);
    throw error;
  }
}

// Type overloads
export function useToolSettings<T>(toolId: string, context?: { projectId?: string; shotId?: string; enabled?: boolean }): {
  settings: T | undefined;
  isLoading: boolean;
  error: Error | null;
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

  // Cleanup abort controllers and debounce timer on unmount
  useEffect(() => {
    return () => {
      // Cancel any pending debounced updates
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      // Abort all active update controllers
      updateControllersRef.current.forEach(controller => {
        controller.abort();
      });
      updateControllersRef.current.clear();
    };
  }, []);

  // Fetch merged settings using Supabase with mobile optimizations
  const { data: settings, isLoading, error, fetchStatus, dataUpdatedAt } = useQuery({
    queryKey: ['toolSettings', toolId, projectId, shotId],
    queryFn: ({ signal }) => {
      console.log('[ShotNavPerf] 🔍 useToolSettings queryFn START', {
        toolId,
        shotId: shotId?.substring(0, 8) || 'none',
        timestamp: Date.now()
      });
      const result = fetchToolSettingsSupabase(toolId, { projectId, shotId }, signal);
      result.then(() => {
        console.log('[ShotNavPerf] ✅ useToolSettings queryFn COMPLETE', {
          toolId,
          shotId: shotId?.substring(0, 8) || 'none',
          timestamp: Date.now()
        });
      }).catch(err => {
        console.log('[ShotNavPerf] ❌ useToolSettings queryFn FAILED', {
          toolId,
          shotId: shotId?.substring(0, 8) || 'none',
          error: err.message,
          timestamp: Date.now()
        });
      });
      return result;
    },
    enabled: !!toolId && fetchEnabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
      // Mobile-specific optimizations
  retry: (failureCount, error) => {
    // Don't retry auth errors, cancelled requests, or abort errors
    if (error?.message?.includes('Authentication required') || 
        error?.message?.includes('Request was cancelled') ||
        error?.name === 'AbortError' ||
        error?.message?.includes('signal is aborted')) {
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

  // Log errors for debugging (except expected cancellations)
  if (error && !error?.message?.includes('Request was cancelled')) {
    console.error('[useToolSettings] Query error:', error);
  }
  
  // [ShotNavPerf] Log query status ONLY when it changes (not every render)
  const prevStatusRef = React.useRef<string>('');
  React.useEffect(() => {
    const statusKey = `${toolId}-${shotId}-${isLoading}-${fetchStatus}`;
    if (prevStatusRef.current !== statusKey) {
      console.log('[ShotNavPerf] 📊 useToolSettings status CHANGED:', {
        toolId,
        shotId: shotId?.substring(0, 8) || 'none',
        isLoading,
        fetchStatus,
        hasData: !!settings,
        timestamp: Date.now()
      });
      prevStatusRef.current = statusKey;
    }
  }, [toolId, shotId, isLoading, fetchStatus, settings]);

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async ({ scope, settings: newSettings, signal, entityId }: { 
      scope: SettingsScope; 
      settings: Partial<T>; 
      signal?: AbortSignal;
      entityId?: string;
    }) => {
      // Prefer explicitly provided entityId (snapshotted at schedule time) to avoid drift
      let idForScope: string | undefined = entityId;
      
      if (!idForScope) {
        if (scope === 'user') {
          // Get userId from auth for user scope with timeout protection (aligned with global timeout)
          // Use generous timeout for mobile networks
          const { data: { user } } = await getUserWithTimeout();
          idForScope = user?.id;
        } else if (scope === 'project') {
          idForScope = projectId;
        } else if (scope === 'shot') {
          idForScope = shotId;
        }
      }
      
      if (!idForScope) {
        throw new Error(`Missing identifier for ${scope} tool settings update`);
      }
  
      // updateToolSettingsSupabase now returns the full merged settings
      const fullMergedSettings = await updateToolSettingsSupabase({
          scope,
          id: idForScope,
          toolId,
          patch: newSettings,
      }, signal);
      
      // Return the full merged settings (not just the patch) for cache update
      return fullMergedSettings;
    },
    onSuccess: (fullMergedSettings) => {
      // Optimistically update the cache by merging with existing cache
      // CRITICAL: We must merge, not replace, because the cache includes user/project defaults
      // that aren't in fullMergedSettings (which only has shot-level settings)
      queryClient.setQueryData<T>(
        ['toolSettings', toolId, projectId, shotId],
        (oldData) => {
          if (!oldData) return fullMergedSettings as T;
          // Merge the updated shot settings over the existing cache (which includes defaults)
          return deepMerge({}, oldData, fullMergedSettings) as T;
        }
      );
    },
    onError: (error: Error) => {
      // Don't log or show errors for cancelled requests during task cancellation
      if (error?.name === 'AbortError' || 
          error?.message?.includes('Request was cancelled') ||
          error?.message?.includes('signal is aborted')) {
        return; // Silent handling for expected cancellations
      }
      
      console.error('[useToolSettings] Update error:', error);
      toast.error(`Failed to save ${toolId} settings: ${error.message}`);
      
      // On error, invalidate to refetch correct state from server
      queryClient.invalidateQueries({ 
        queryKey: ['toolSettings', toolId, projectId, shotId] 
      });
    },
  });

  // Debounce ref to prevent rapid updates
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const update = (scope: SettingsScope, settings: Partial<T>) => {
    // Clear any existing debounce timer
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Snapshot the target entity id NOW to prevent cross-project/shot overwrites when debounce fires
    const entityId = scope === 'project' ? projectId : (scope === 'shot' ? shotId : undefined);

    // Debounce updates to prevent cascading requests
    debounceTimeoutRef.current = setTimeout(() => {
      // Create an AbortController for this update and track it
      const controller = new AbortController();
      updateControllersRef.current.add(controller);
      
      // Clean up controller when mutation completes
      const cleanup = () => {
        updateControllersRef.current.delete(controller);
      };
      
      // Set up cleanup handlers
      controller.signal.addEventListener('abort', cleanup);

      updateMutation.mutate(
        { scope, settings, signal: controller.signal, entityId },
        {
          onSettled: cleanup, // Clean up on both success and error
        }
      );
    }, 300); // 300ms debounce
  };

  return {
    settings: settings as T | undefined,
    isLoading,
    error: error as Error | null,
    update,
    isUpdating: updateMutation.isPending,
  };
} 