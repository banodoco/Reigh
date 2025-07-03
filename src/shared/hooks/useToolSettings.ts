import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRef, useCallback } from 'react';
import { deepMerge } from '../lib/deepEqual';
import { useProject } from '@/shared/contexts/ProjectContext';
import { fetchWithAuth } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';

const baseUrl = import.meta.env.VITE_API_TARGET_URL || window.location.origin;

export type SettingsScope = 'user' | 'project' | 'shot';

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

async function fetchToolSettings(toolId: string, ctx: ToolSettingsContext): Promise<unknown> {
  const params = new URLSearchParams({ toolId });
  if (ctx.projectId) params.append('projectId', ctx.projectId);
  if (ctx.shotId) params.append('shotId', ctx.shotId);

  const response = await fetch(`${baseUrl}/api/tool-settings/resolve?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch tool settings' }));
    throw new Error(error.error || 'Failed to fetch tool settings');
  }

  return response.json();
}

async function updateToolSettings(params: UpdateToolSettingsParams): Promise<void> {
  const response = await fetch(`${baseUrl}/api/tool-settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update tool settings' }));
    throw new Error(error.error || 'Failed to update tool settings');
  }
}

// Overload type definitions
export function useToolSettings<T>(toolId: string, context?: { projectId?: string; shotId?: string; enabled?: boolean }): {
  settings: T | undefined;
  isLoading: boolean;
  update: (scope: SettingsScope, settings: Partial<T>) => void;
  isUpdating: boolean;
};

// Unified implementation
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

  // Fetch merged settings from API
  const { data: settings, isLoading } = useQuery({
    queryKey: ['toolSettings', toolId, projectId, shotId],
    queryFn: async () => {
      const params = new URLSearchParams({ toolId });
      if (projectId) params.append('projectId', projectId);
      if (shotId) params.append('shotId', shotId);
      
      const response = await fetchWithAuth(`${baseUrl}/api/tool-settings/resolve?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch tool settings');
      }
      
      return response.json() as Promise<T>;
    },
    enabled: !!toolId && fetchEnabled,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

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
        throw new Error('Missing identifier for tool settings update');
      }
      const response = await fetchWithAuth(`${baseUrl}/api/tool-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          id: idForScope,
          toolId,
          patch: newSettings,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update tool settings');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate the query to refetch updated settings
      queryClient.invalidateQueries({ 
        queryKey: ['toolSettings', toolId, projectId, shotId] 
      });
    },
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