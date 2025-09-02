import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toolsManifest } from '@/tools';

// Central list of tool IDs we want to preload. Update when you add more tools.
const TOOL_IDS = [
  'image-generation',
  'travel-between-images',
  'edit-travel',
];

// Tool defaults registry - client-side version matching server
const toolDefaults: Record<string, unknown> = Object.fromEntries(
  toolsManifest.map(toolSettings => [toolSettings.id, toolSettings.defaults])
);

// Deep merge helper (duplicated here to avoid circular imports)
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

// Shared auth cache to reduce duplicate calls (same as useToolSettings)
let prefetchAuthCache: { user: any; timestamp: number } | null = null;
const PREFETCH_AUTH_CACHE_TTL = 30000; // 30 seconds

/**
 * Fetch tool settings using Supabase (for prefetching)
 */
async function fetchToolSettingsSupabase(toolId: string, ctx: { projectId?: string; shotId?: string }): Promise<unknown> {
  try {
    // Check cache first to avoid duplicate auth calls during prefetch
    let user: any;
    if (prefetchAuthCache && Date.now() - prefetchAuthCache.timestamp < PREFETCH_AUTH_CACHE_TTL) {
      user = prefetchAuthCache.user;
    } else {
      // Get current user with shorter timeout for prefetch
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        throw new Error('Authentication required');
      }
      user = authUser;
      
      // Cache the result
      prefetchAuthCache = {
        user: authUser,
        timestamp: Date.now()
      };
    }

    // Fetch all needed data in parallel using Supabase client
    const [userResult, projectResult, shotResult] = await Promise.all([
      // User settings
      supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single(),
      
      // Project settings (if projectId provided)
      ctx.projectId ? 
        supabase
          .from('projects')
          .select('settings')
          .eq('id', ctx.projectId)
          .single() :
        Promise.resolve({ data: null, error: null }),
      
      // Shot settings (if shotId provided)  
      ctx.shotId ?
        supabase
          .from('shots')
          .select('settings')
          .eq('id', ctx.shotId)
          .single() :
        Promise.resolve({ data: null, error: null }),
    ]);

    // Extract tool-specific settings from each scope
    const userSettings = (userResult.data?.settings as any)?.[toolId] ?? {};
    const projectSettings = (projectResult.data?.settings as any)?.[toolId] ?? {};
    const shotSettings = (shotResult.data?.settings as any)?.[toolId] ?? {};

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
    throw error;
  }
}

/**
 * Prefetch tool settings for a project (and optionally its shots) so that
 * individual pages can hydrate synchronously from React-Query cache.
 * Now uses direct Supabase calls for better mobile reliability.
 *
 * @param projectId selected project id
 * @param shotIds  array of shot ids belonging to the project (optional)
 */
export function usePrefetchToolSettings(projectId?: string | null, shotIds: string[] = []) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;

    // Prefetch project-level settings for each tool.
    TOOL_IDS.forEach((toolId) => {
      queryClient.prefetchQuery({
        queryKey: ['toolSettings', toolId, projectId, undefined],
        queryFn: () => fetchToolSettingsSupabase(toolId, { projectId }),
        staleTime: 5 * 60 * 1000, // keep fresh for 5 min (same as useToolSettings)
      });
    });

    // Prefetch shot-level settings when shot IDs are provided.
    if (shotIds.length) {
      shotIds.forEach((shotId) => {
        TOOL_IDS.forEach((toolId) => {
          queryClient.prefetchQuery({
            queryKey: ['toolSettings', toolId, projectId, shotId],
            queryFn: () => fetchToolSettingsSupabase(toolId, { projectId, shotId }),
            staleTime: 5 * 60 * 1000,
          });
        });
      });
    }
  }, [projectId, shotIds.join(','), queryClient]);
} 