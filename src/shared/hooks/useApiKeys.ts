import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/api';

interface ApiKeys {
  fal_api_key?: string;
  openai_api_key?: string;
  replicate_api_key?: string;
}

// Fetch API keys from the database
const fetchApiKeys = async (): Promise<ApiKeys> => {
  const response = await fetchWithAuth('/api/api-keys');
  if (!response.ok) {
    throw new Error('Failed to fetch API keys');
  }
  return response.json();
};

// Update API keys in the database
const updateApiKeys = async (apiKeys: ApiKeys): Promise<ApiKeys> => {
  const response = await fetchWithAuth('/api/api-keys', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(apiKeys),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update API keys');
  }
  
  const result = await response.json();
  return result.apiKeys;
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