import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ApiToken {
  id: string;
  user_id: string;
  jti_hash: string;
  token: string;
  label: string;
  created_at: string;
  expires_at: string;
  last_used: string | null;
}

interface GenerateTokenResponse {
  token: string;
  expires_at: string;
  jti: string;
}

// Fetch user's API tokens
const fetchApiTokens = async (): Promise<ApiToken[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('user_api_tokens')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  return data || [];
};

// Generate a new API token
const generateApiToken = async (params: { label: string; expiresInDays: number }): Promise<GenerateTokenResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await supabase.functions.invoke('generate-pat', {
    body: params
  });
  
  if (response.error) throw response.error;
  
  return response.data;
};

// Revoke an API token
const revokeApiToken = async (tokenId: string): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await supabase.functions.invoke('revoke-pat', {
    body: { tokenId }
  });
  
  if (response.error) throw response.error;
};

export const useApiTokens = () => {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  
  // Query to fetch API tokens
  const {
    data: tokens,
    isLoading,
    error
  } = useQuery({
    queryKey: ['apiTokens'],
    queryFn: fetchApiTokens,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation to generate a new API token
  const generateMutation = useMutation({
    mutationFn: generateApiToken,
    onMutate: () => {
      setIsGenerating(true);
    },
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      queryClient.invalidateQueries({ queryKey: ['apiTokens'] });      
    },
    onError: (error: Error) => {
      console.error('Error generating API token:', error);
      toast.error(`Failed to generate API token: ${error.message}`);
    },
    onSettled: () => {
      setIsGenerating(false);
    }
  });

  // Mutation to revoke an API token
  const revokeMutation = useMutation({
    mutationFn: revokeApiToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiTokens'] });
      toast.success('API token revoked successfully');
    },
    onError: (error: Error) => {
      console.error('Error revoking API token:', error);
      toast.error(`Failed to revoke API token: ${error.message}`);
    },
  });

  const generateToken = (label: string, expiresInDays: number = 90) => {
    generateMutation.mutate({ label, expiresInDays });
  };

  const revokeToken = (tokenId: string) => {
    revokeMutation.mutate(tokenId);
  };

  const clearGeneratedToken = () => {
    setGeneratedToken(null);
  };

  return {
    tokens: tokens || [],
    isLoading,
    error,
    generateToken,
    revokeToken,
    isGenerating,
    generatedToken,
    clearGeneratedToken,
    isRevoking: revokeMutation.isPending,
  };
}; 