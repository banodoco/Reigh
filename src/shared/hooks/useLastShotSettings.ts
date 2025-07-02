import { useQuery } from '@tanstack/react-query';

const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';

async function fetchLastShotSettings(toolId: string, projectId: string): Promise<unknown> {
  const params = new URLSearchParams({ toolId, projectId });

  const response = await fetch(`${baseUrl}/api/tool-settings/last-shot?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null; // No previous settings
    }
    const error = await response.json().catch(() => ({ error: 'Failed to fetch last shot settings' }));
    throw new Error(error.error || 'Failed to fetch last shot settings');
  }

  return response.json();
}

export function useLastShotSettings<T = unknown>(
  toolId: string,
  projectId: string | null | undefined,
  enabled = true
) {
  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['last-shot-settings', toolId, projectId],
    queryFn: () => fetchLastShotSettings(toolId, projectId!),
    enabled: enabled && !!projectId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  return {
    lastShotSettings: settings as T | null,
    isLoading,
    error,
    refetch,
  };
} 