import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ApiKeys {
  fal_api_key?: string;
  openai_api_key?: string;
  replicate_api_key?: string;
}

// Fetch API keys from the database
const fetchApiKeys = async (): Promise<ApiKeys> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase
    .from('users')
    .select('api_keys')
    .eq('id', user.id)
    .single();
  
  if (error) {
    // User might not exist yet, return empty keys
    if (error.code === 'PGRST116') {
      return {};
    }
    throw error;
  }
  
  return (data?.api_keys as ApiKeys) || {};
};

// Update API keys in the database
const updateApiKeys = async (apiKeys: ApiKeys): Promise<ApiKeys> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single();
  
  if (!existingUser) {
    // Create user with API keys
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: user.id,
        api_keys: apiKeys
      })
      .select('api_keys')
      .single();
    
    if (error) throw error;
    return (data?.api_keys as ApiKeys) || {};
  } else {
    // Update existing user's API keys
    const { data, error } = await supabase
      .from('users')
      .update({ api_keys: apiKeys })
      .eq('id', user.id)
      .select('api_keys')
      .single();
    
    if (error) throw error;
    return (data?.api_keys as ApiKeys) || {};
  }
};

export const useApiKeys = () => {
  const queryClient = useQueryClient();
  
  // Query to fetch API keys
  const {
    data: apiKeys,
    isLoading,
    error
  } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: fetchApiKeys,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation to update API keys
  const updateMutation = useMutation({
    mutationFn: updateApiKeys,
    onSuccess: (updatedKeys) => {
      queryClient.setQueryData(['apiKeys'], updatedKeys);
      toast.success('API keys updated successfully');
    },
    onError: (error: Error) => {
      console.error('Error updating API keys:', error);
      toast.error(`Failed to update API keys: ${error.message}`);
    },
  });

  const saveApiKeys = (newApiKeys: ApiKeys) => {
    updateMutation.mutate(newApiKeys);
  };

  // Helper function to get a specific API key
  const getApiKey = (keyName: keyof ApiKeys): string => {
    return apiKeys?.[keyName] || '';
  };

  return {
    apiKeys: apiKeys || {},
    isLoading,
    error,
    saveApiKeys,
    getApiKey,
    isUpdating: updateMutation.isPending,
  };
}; 