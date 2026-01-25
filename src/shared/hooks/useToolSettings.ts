import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useProject } from '@/shared/contexts/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { toolsManifest } from '@/tools';
import { QUERY_PRESETS, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import { 
  enqueueSettingsWrite, 
  setSettingsWriteFunction,
  flushTarget as flushQueueTarget,
  type QueuedWrite 
} from '@/shared/lib/settingsWriteQueue';

export type SettingsScope = 'user' | 'project' | 'shot';

// Single-flight dedupe for settings fetches across components
const inflightSettingsFetches = new Map<string, Promise<unknown>>();
// Single-flight dedupe for getSession calls (it's slow - 600ms to 16s!)
let inflightGetSession: Promise<any> | null = null;
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
    // FIRST: Check cached user to avoid slow getSession calls
    // This is critical because getSession() can take 600ms-16s!
    if (cachedUser && (Date.now() - cachedUserAt) < USER_CACHE_MS) {
      clearTimeout(timeoutId);
      console.log('[GenerationModeDebug] ⚡ Using cached user (skipping getSession)');
      return { data: { user: { id: cachedUser.id } }, error: null } as any;
    }

    // Fast path: use local session (no network) to avoid auth network call in background
    // Single-flight the getSession call - it's slow and multiple components call it simultaneously
    const sessionStart = Date.now();
    
    if (!inflightGetSession) {
      inflightGetSession = supabase.auth.getSession().finally(() => {
        inflightGetSession = null;
      });
    }
    
    const { data: sessionData } = await inflightGetSession;
    const sessionDuration = Date.now() - sessionStart;
    console.log('[GenerationModeDebug] ⏱️ getSession took:', sessionDuration + 'ms');
    
    const sessionUser = sessionData?.session?.user || null;
    if (sessionUser) {
      cachedUser = { id: sessionUser.id };
      cachedUserAt = Date.now();
      clearTimeout(timeoutId);
      return { data: { user: sessionUser }, error: null } as any;
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
    // Check if request was cancelled before starting - throw to signal cancellation
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    // Single-flight dedupe key for concurrent identical requests
    const singleFlightKey = JSON.stringify({ toolId, projectId: ctx.projectId ?? null, shotId: ctx.shotId ?? null });
    const existingPromise = inflightSettingsFetches.get(singleFlightKey);
    if (existingPromise) {
      if (ctx.shotId) {
        console.log('[GenerationModeDebug] ♻️ DEDUPE hit - reusing existing request:', {
          toolId,
          shotId: ctx.shotId?.substring(0, 8),
        });
      }
      return existingPromise;
    }

    const promise = (async () => {
      const fetchStart = Date.now();
      
      // [GenerationModeDebug] Log which tool is making the query
      if (ctx.shotId) {
        console.log('[GenerationModeDebug] 🚀 Query START:', {
          toolId,
          shotId: ctx.shotId?.substring(0, 8),
          singleFlightKey,
          timestamp: Date.now()
        });
      }
      
      // Mobile optimization: Cache user info to avoid repeated auth calls
      // Add timeout to prevent hanging on mobile connections (aligned with Supabase global timeout)
      // Use generous timeout for mobile networks
      const { data: { user }, error: authError } = await getUserWithTimeout();
      const authDuration = Date.now() - fetchStart;
      
      // [GenerationModeDebug] Log auth timing
      if (ctx.shotId) {
        console.log('[GenerationModeDebug] ⏱️ Auth completed:', {
          toolId,
          shotId: ctx.shotId?.substring(0, 8),
          authDuration: `${authDuration}ms`,
          timestamp: Date.now()
        });
      }
      
      if (authError || !user) {
        throw new Error('Authentication required');
      }
      
      // Check again after auth call - throw to signal cancellation
      // React Query's retry logic won't retry cancelled requests
      if (signal?.aborted) {
        throw new Error('Request was cancelled');
      }

      const dbQueryStart = Date.now();
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

      const dbQueryDuration = Date.now() - dbQueryStart;
      const totalDuration = Date.now() - fetchStart;
      
      // [GenerationModeDebug] Log timing
      if (ctx.shotId) {
        console.log('[GenerationModeDebug] ⏱️ DB queries completed:', {
          shotId: ctx.shotId?.substring(0, 8),
          dbQueryDuration: `${dbQueryDuration}ms`,
          totalDuration: `${totalDuration}ms`,
          timestamp: Date.now()
        });
      }

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

      // Check if shot actually had settings stored (not just empty object)
      const hasShotSettings = shotSettings && Object.keys(shotSettings).length > 0;

      // [GenerationModeDebug] Log what we're getting from each source
      if (toolId === 'travel-between-images' && ctx.shotId) {
        console.log('[GenerationModeDebug] 🗄️ useToolSettings raw data:', {
          shotId: ctx.shotId?.substring(0, 8),
          shotRawSettings: shotResult.data?.settings,
          shotToolSettings: shotSettings,
          hasShotSettings,
          shot_generationMode: shotSettings?.generationMode,
          project_generationMode: projectSettings?.generationMode,
          user_generationMode: userSettings?.generationMode,
          defaults_generationMode: (toolDefaults[toolId] as any)?.generationMode,
          timestamp: Date.now()
        });
      }


      // Merge in priority order: defaults → user → project → shot
      const merged = deepMerge(
        {},
        toolDefaults[toolId] ?? {},
        userSettings,
        projectSettings,
        shotSettings
      );

      // [GenerationModeDebug] Log merged result
      if (toolId === 'travel-between-images' && ctx.shotId) {
        console.log('[GenerationModeDebug] 🔀 useToolSettings merged result:', {
          shotId: ctx.shotId?.substring(0, 8),
          merged_generationMode: (merged as any)?.generationMode,
          timestamp: Date.now()
        });
      }

      // Return both the merged settings and metadata about what was found
      return { settings: merged, hasShotSettings };
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
        return { settings: deepMerge({}, toolDefaults[toolId] ?? {}), hasShotSettings: false };
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
 * Raw write function - performs the actual DB update.
 * Used internally by the settings write queue.
 * 
 * @internal Use updateToolSettingsSupabase (queued) for normal usage
 */
async function rawUpdateToolSettings(write: QueuedWrite): Promise<any> {
  const { scope, entityId: id, toolId, patch } = write;
  
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

    // For patch updates, we need to fetch current settings to merge
    // This is necessary because the caller provides a partial update
    // TODO: In the future, consider passing full settings to eliminate this fetch
    const { data: currentEntity, error: fetchError } = await supabase
      .from(tableName)
      .select('settings')
      .eq('id', id)
      .single();

    if (fetchError) {
      // Check for network exhaustion - include the error type in the message for downstream handling
      const errorMessage = fetchError.message || '';
      if (errorMessage.includes('ERR_INSUFFICIENT_RESOURCES') || 
          errorMessage.includes('Failed to fetch') ||
          fetchError.code === 'ERR_INSUFFICIENT_RESOURCES') {
        throw new Error(`Network exhaustion: ${errorMessage}`);
      }
      throw new Error(`Failed to fetch current ${scope} settings: ${errorMessage}`);
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
    
    console.error('[rawUpdateToolSettings] Error:', error);
    throw error;
  }
}

// Initialize the queue with our raw write function
setSettingsWriteFunction(rawUpdateToolSettings);

/**
 * Update tool settings using the global write queue.
 * 
 * This is the main entry point for settings updates. It:
 * - Debounces rapid updates (300ms window)
 * - Coalesces multiple writes to the same target
 * - Serializes writes globally to prevent network exhaustion
 * 
 * @param params - The update parameters
 * @param mode - 'debounced' (default) or 'immediate' for flush-on-unmount
 * @returns The full merged settings after update
 */
export async function updateToolSettingsSupabase(
  params: UpdateToolSettingsParams, 
  _signal?: AbortSignal,
  mode: 'debounced' | 'immediate' = 'debounced'
): Promise<any> {
  const { scope, id, toolId, patch } = params;
  
  return enqueueSettingsWrite({
    scope,
    entityId: id,
    toolId,
    patch: patch as Record<string, unknown>,
  }, mode);
}

/**
 * Flush pending writes for a specific target.
 * Call this on unmount to ensure pending changes are saved.
 */
export function flushToolSettingsTarget(scope: SettingsScope, entityId: string, toolId: string): Promise<any> | undefined {
  return flushQueueTarget(scope, entityId, toolId);
}

// Type overloads
export function useToolSettings<T>(toolId: string, context?: { projectId?: string; shotId?: string; enabled?: boolean }): {
  settings: T | undefined;
  isLoading: boolean;
  error: Error | null;
  update: (scope: SettingsScope, settings: Partial<T>) => Promise<void>;
  isUpdating: boolean;
  /** Whether the shot had settings stored in DB (vs just defaults/project settings) */
  hasShotSettings: boolean;
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

  // Refs to access current values in stable callbacks without recreating them
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const shotIdRef = useRef(shotId);
  shotIdRef.current = shotId;

  // Cleanup abort controllers on unmount
  // NOTE: We intentionally do NOT abort active update mutations on unmount.
  // Settings saves should complete even if the component unmounts (e.g., during navigation).
  // The mutation will complete in the background and update the cache correctly.
  useEffect(() => {
    return () => {
      // Just clear the tracking set - mutations will complete on their own
      updateControllersRef.current.clear();
    };
  }, []);

  // Fetch merged settings using Supabase with mobile optimizations
  const { data: queryResult, isLoading, error, fetchStatus, dataUpdatedAt } = useQuery({
    queryKey: ['toolSettings', toolId, projectId, shotId],
    queryFn: async ({ signal }) => {
      console.log('[ShotNavPerf] 🔍 useToolSettings queryFn START', {
        toolId,
        shotId: shotId?.substring(0, 8) || 'none',
        timestamp: Date.now()
      });
      try {
        const result = await fetchToolSettingsSupabase(toolId, { projectId, shotId }, signal);
        console.log('[ShotNavPerf] ✅ useToolSettings queryFn COMPLETE', {
          toolId,
          shotId: shotId?.substring(0, 8) || 'none',
          timestamp: Date.now()
        });
        return result;
      } catch (err: any) {
        // For cancelled requests, return undefined to let React Query use cached/placeholder data
        // This prevents "Uncaught (in promise)" errors and allows the UI to remain functional
        if (err?.message?.includes('Request was cancelled') ||
            err?.name === 'AbortError' ||
            err?.message?.includes('signal is aborted')) {
          console.log('[ShotNavPerf] ⏹️ useToolSettings request cancelled (returning undefined)', {
            toolId,
            shotId: shotId?.substring(0, 8) || 'none',
          });
          return undefined;
        }
        console.log('[ShotNavPerf] ❌ useToolSettings queryFn FAILED', {
          toolId,
          shotId: shotId?.substring(0, 8) || 'none',
          error: err.message,
          timestamp: Date.now()
        });
        throw err;
      }
    },
    enabled: !!toolId && fetchEnabled,
    // Use static preset - tool settings rarely change, mutation invalidates on save
    ...QUERY_PRESETS.static,
    staleTime: 10 * 60 * 1000, // Override: 10 minutes (longer than static default)
    // Mobile-specific optimizations
    retry: (failureCount, error) => {
      // Don't retry auth errors, cancelled requests, or abort errors
      if (error?.message?.includes('Authentication required') || 
          error?.message?.includes('Request was cancelled') ||
          error?.name === 'AbortError' ||
          error?.message?.includes('signal is aborted')) {
        return false;
      }
      // Don't retry on network exhaustion - retrying just makes it worse
      if (error?.message?.includes('ERR_INSUFFICIENT_RESOURCES') ||
          error?.message?.includes('Network exhaustion')) {
        console.warn('[useToolSettings] Network exhaustion - not retrying');
        return false;
      }
      // Retry up to 3 times for network errors on mobile
      return failureCount < 3;
    },
    retryDelay: STANDARD_RETRY_DELAY,
    networkMode: 'online',
  });

  // Extract settings and hasShotSettings from the query result
  // Handle both formats: { settings: T, hasShotSettings } (new) and T directly (legacy cache)
  const hasSettingsWrapper = queryResult && 'settings' in queryResult && 'hasShotSettings' in queryResult;
  const settings = hasSettingsWrapper ? queryResult?.settings : queryResult;
  const hasShotSettings = hasSettingsWrapper ? (queryResult?.hasShotSettings ?? false) : false;


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
        hasShotSettings,
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
      // CRITICAL: The cache stores { settings: T, hasShotSettings: boolean } shape
      // Handle legacy format where settings are directly on the object (no wrapper)
      queryClient.setQueryData(
        ['toolSettings', toolId, projectId, shotId],
        (oldData: any) => {
          // Check if old data has the new wrapper format
          const hasWrapper = oldData && 'settings' in oldData && 'hasShotSettings' in oldData;
          const oldSettings = hasWrapper ? (oldData?.settings ?? {}) : (oldData ?? {});
          const mergedSettings = deepMerge({}, oldSettings, fullMergedSettings);
          return {
            settings: mergedSettings,
            hasShotSettings: hasWrapper ? (oldData?.hasShotSettings ?? false) : false
          };
        }
      );

      // Also refetch shot-batch-settings cache used by useSegmentSettings
      // This ensures "restore defaults" in segment settings picks up latest shot settings
      // Use refetchQueries (not just invalidate) to force immediate update
      if (shotId) {
        queryClient.refetchQueries({ queryKey: ['shot-batch-settings', shotId] });
      }
    },
    onError: (error: Error) => {
      // Don't log or show errors for cancelled requests during task cancellation
      if (error?.name === 'AbortError' || 
          error?.message?.includes('Request was cancelled') ||
          error?.message?.includes('signal is aborted')) {
        return; // Silent handling for expected cancellations
      }
      
      // Check if this is a network exhaustion error - don't invalidate or show toast
      // as this would just create more requests and spam the user
      const isNetworkExhaustion = error?.message?.includes('ERR_INSUFFICIENT_RESOURCES') ||
                                   error?.message?.includes('Network exhaustion') ||
                                   error?.message?.includes('Failed to fetch');
      
      if (isNetworkExhaustion) {
        console.warn('[useToolSettings] Network exhaustion detected - backing off, not invalidating');
        return; // Don't invalidate - that would just make more requests
      }
      
      console.error('[useToolSettings] Update error:', error);
      toast.error(`Failed to save ${toolId} settings: ${error.message}`);
      
      // On error, invalidate to refetch correct state from server
      // But only for non-network errors (auth issues, server errors, etc.)
      queryClient.invalidateQueries({ 
        queryKey: ['toolSettings', toolId, projectId, shotId] 
      });
    },
  });

  // Get stable reference to mutateAsync - useMutation returns a new object each render
  // but mutateAsync itself is stable
  const mutateAsyncRef = useRef(updateMutation.mutateAsync);
  mutateAsyncRef.current = updateMutation.mutateAsync;
  
  // CRITICAL: Wrap in useCallback with stable deps to prevent cascading re-renders.
  // Use refs to access current projectId/shotId without recreating this function.
  // The entityId is snapshotted at call time via refs for correctness.
  const update = useCallback(async (scope: SettingsScope, settings: Partial<T>): Promise<void> => {
    // Snapshot the target entity id NOW to prevent cross-project/shot overwrites
    // Use refs to get current values without causing callback recreation
    const entityId = scope === 'project' ? projectIdRef.current : (scope === 'shot' ? shotIdRef.current : undefined);

    // Create an AbortController for this update and track it
    const controller = new AbortController();
    updateControllersRef.current.add(controller);
    
    // Clean up controller when mutation completes
    const cleanup = () => {
      updateControllersRef.current.delete(controller);
    };
    
    // Set up cleanup handlers
    controller.signal.addEventListener('abort', cleanup);

    try {
      // NOTE: No debounce here - callers (like useShotSettings) are responsible for debouncing.
      // Using mutateAsync so callers can await the actual DB write completion.
      // Use ref to access stable mutateAsync without recreating this callback
      await mutateAsyncRef.current(
        { scope, settings, signal: controller.signal, entityId }
      );
    } finally {
      cleanup();
    }
  }, []); // Empty deps - all values accessed via refs for stability

  return {
    settings: settings as T | undefined,
    isLoading,
    error: error as Error | null,
    update,
    isUpdating: updateMutation.isPending,
    hasShotSettings,
  };
} 