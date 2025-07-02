import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';

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

export function useToolSettings<T = unknown>(
  toolId: string,
  ctx: ToolSettingsContext
) {
  const queryClient = useQueryClient();
  const queryKey = ['tool-settings', toolId, ctx];

  const { data: settings, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchToolSettings(toolId, ctx),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  const updateMutation = useMutation({
    mutationFn: (params: { scope: SettingsScope; patch: Partial<T> }) => {
      const id = params.scope === 'project' ? ctx.projectId : 
                 params.scope === 'shot' ? ctx.shotId : 
                 'current-user'; // User ID will be handled server-side
      
      if (!id) {
        throw new Error(`No ${params.scope} ID available for updating settings`);
      }

      return updateToolSettings({
        scope: params.scope,
        id,
        toolId,
        patch: params.patch,
      });
    },
    onMutate: async ({ scope, patch }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousSettings = queryClient.getQueryData(queryKey);

      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (old: any) => ({
        ...old,
        ...patch,
      }));

      // Return a context object with the snapshotted value
      return { previousSettings };
    },
    onError: (err, newData, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKey, context.previousSettings);
      }
      toast.error('Failed to update settings');
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey });
      // Remove the toast to prevent spam
    },
  });

  const update = (patch: Partial<T>, scope: SettingsScope = 'shot') => {
    return updateMutation.mutate({ scope, patch });
  };

  return {
    settings: settings as T | undefined,
    isLoading,
    error,
    update,
    isUpdating: updateMutation.isPending,
  };
} 