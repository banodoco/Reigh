import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export type ExternalService = 'huggingface' | 'replicate' | 'civitai';

interface ExternalApiKey {
  id: string;
  service: ExternalService;
  key_value: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface HuggingFaceMetadata {
  username?: string;
  verified?: boolean;
  verifiedAt?: string;
}

/**
 * Fetch an external API key for a specific service
 */
async function fetchExternalApiKey(service: ExternalService): Promise<ExternalApiKey | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('external_api_keys')
    .select('*')
    .eq('user_id', user.id)
    .eq('service', service)
    .maybeSingle();

  if (error) throw error;
  return data as ExternalApiKey | null;
}

/**
 * Save or update an external API key
 */
async function saveExternalApiKey(
  service: ExternalService,
  keyValue: string,
  metadata?: Record<string, unknown>
): Promise<ExternalApiKey> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Upsert: insert or update based on (user_id, service) unique constraint
  const { data, error } = await supabase
    .from('external_api_keys')
    .upsert(
      {
        user_id: user.id,
        service,
        key_value: keyValue,
        metadata: metadata || {},
      },
      {
        onConflict: 'user_id,service',
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data as ExternalApiKey;
}

/**
 * Delete an external API key
 */
async function deleteExternalApiKey(service: ExternalService): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('external_api_keys')
    .delete()
    .eq('user_id', user.id)
    .eq('service', service);

  if (error) throw error;
}

/**
 * Hook to manage external API keys for third-party services
 */
export function useExternalApiKey(service: ExternalService) {
  const queryClient = useQueryClient();
  const queryKey = ['externalApiKey', service];

  // Query to fetch the API key
  const {
    data: apiKey,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => fetchExternalApiKey(service),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation to save/update the API key
  const saveMutation = useMutation({
    mutationFn: ({ keyValue, metadata }: { keyValue: string; metadata?: Record<string, unknown> }) =>
      saveExternalApiKey(service, keyValue, metadata),
    onSuccess: (savedKey) => {
      queryClient.setQueryData(queryKey, savedKey);
    },
    onError: (error: Error) => {
      console.error(`Error saving ${service} API key:`, error);
      toast.error(`Failed to save API key: ${error.message}`);
    },
  });

  // Mutation to delete the API key
  const deleteMutation = useMutation({
    mutationFn: () => deleteExternalApiKey(service),
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null);
    },
    onError: (error: Error) => {
      console.error(`Error deleting ${service} API key:`, error);
      toast.error(`Failed to delete API key: ${error.message}`);
    },
  });

  return {
    apiKey,
    hasKey: !!apiKey?.key_value,
    isLoading,
    error,
    refetch,
    save: (keyValue: string, metadata?: Record<string, unknown>) =>
      saveMutation.mutateAsync({ keyValue, metadata }),
    delete: () => deleteMutation.mutateAsync(),
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Hook specifically for HuggingFace token management
 */
export function useHuggingFaceToken() {
  const {
    apiKey,
    hasKey,
    isLoading,
    error,
    refetch,
    save,
    delete: deleteKey,
    isSaving,
    isDeleting,
  } = useExternalApiKey('huggingface');

  const metadata = apiKey?.metadata as HuggingFaceMetadata | undefined;

  /**
   * Verify the HuggingFace token by calling the HF API
   * This is done client-side just to verify the token works
   */
  const verifyToken = async (token: string): Promise<{ valid: boolean; username?: string; error?: string }> => {
    try {
      const response = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Invalid token' };
        }
        return { valid: false, error: `HuggingFace API error: ${response.status}` };
      }

      const data = await response.json();
      return {
        valid: true,
        username: data.name,
      };
    } catch (err) {
      return { valid: false, error: 'Failed to connect to HuggingFace' };
    }
  };

  /**
   * Save the token after verification
   */
  const saveToken = async (token: string): Promise<{ success: boolean; error?: string }> => {
    // First verify the token
    const verification = await verifyToken(token);
    if (!verification.valid) {
      return { success: false, error: verification.error };
    }

    // Save with metadata
    try {
      await save(token, {
        username: verification.username,
        verified: true,
        verifiedAt: new Date().toISOString(),
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to save token' };
    }
  };

  return {
    hasToken: hasKey,
    isLoading,
    error,
    username: metadata?.username,
    isVerified: metadata?.verified,
    verifyToken,
    saveToken,
    deleteToken: deleteKey,
    isSaving,
    isDeleting,
    refetch,
  };
}
