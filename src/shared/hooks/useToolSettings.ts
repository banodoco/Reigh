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

export function useToolSettings<T>(toolId: string, userId?: string, shotId?: string) {
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();

  // Fetch merged settings from API
  const { data: settings, isLoading } = useQuery({
    queryKey: ['toolSettings', toolId, userId, selectedProjectId, shotId],
    queryFn: async () => {
      const params = new URLSearchParams({ toolId });
      if (userId) params.append('userId', userId);
      if (selectedProjectId) params.append('projectId', selectedProjectId);
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
      const idForScope = scope === 'user' ? userId : scope === 'project' ? selectedProjectId : shotId;
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
        queryKey: ['toolSettings', toolId, userId, selectedProjectId, shotId] 
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