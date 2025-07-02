import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRef, useCallback } from 'react';
import { deepMerge } from '../lib/deepEqual';
import { useProject } from '@/shared/contexts/ProjectContext';
import { fetchWithAuth } from '@/lib/api';

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
export function useToolSettings<T>(toolId: string, userId?: string, shotId?: string): {
  settings: T | undefined;
  isLoading: boolean;
  update: (scope: SettingsScope, settings: Partial<T>) => void;
  isUpdating: boolean;
};

// Overload: pass a context object containing projectId/shotId
export function useToolSettings<T>(
  toolId: string,
  context: { projectId?: string; shotId?: string }
): {
  settings: T | undefined;
  isLoading: boolean;
  update: (scope: SettingsScope, settings: Partial<T>) => void;
  isUpdating: boolean;
};

// Unified implementation handling both signature styles
export function useToolSettings<T>(
  toolId: string,
  userIdOrContext?: string | { projectId?: string; shotId?: string },
  maybeShotId?: string
) {
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();

  // Determine parameter shapes
  let userId: string | undefined;
  let projectId: string | undefined = selectedProjectId;
  let shotId: string | undefined;

  if (typeof userIdOrContext === 'string' || userIdOrContext === undefined) {
    userId = userIdOrContext;
    shotId = maybeShotId;
  } else if (typeof userIdOrContext === 'object') {
    const ctx = userIdOrContext;
    projectId = ctx.projectId ?? selectedProjectId;
    shotId = ctx.shotId;
  }

  // Fetch merged settings from API
  const { data: settings, isLoading } = useQuery({
    queryKey: ['toolSettings', toolId, userId, projectId, shotId],
    queryFn: async () => {
      const params = new URLSearchParams({ toolId });
      if (userId) params.append('userId', userId);
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
    enabled: !!toolId,
  });

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async ({ scope, settings: newSettings }: { scope: SettingsScope; settings: Partial<T> }) => {
      const idForScope = scope === 'user' ? userId : scope === 'project' ? projectId : shotId;
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
        queryKey: ['toolSettings', toolId, userId, projectId, shotId] 
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