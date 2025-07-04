import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/api';

// Fetch generations from the API server
const fetchGenerations = async (projectId: string | null, limit?: number): Promise<GeneratedImageWithMetadata[]> => {
  if (!projectId) return [];
  
  const params = new URLSearchParams({ projectId });
  if (limit) params.append('limit', limit.toString());
  
  const response = await fetchWithAuth(`/api/generations?${params}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch generations');
  }
  
  const data = await response.json();
  
  // Convert API response to GeneratedImageWithMetadata format
  return data.items.map((item: any) => ({
    id: item.id,
    url: item.location || '', // API uses 'location' field
    prompt: item.params?.prompt || '',
    seed: item.params?.seed,
    metadata: item.params || {},
    createdAt: item.createdAt,
    isVideo: item.type?.includes('video'),
  }));
};

export const useListAllGenerations = (projectId: string | null) => {
  return useQuery<GeneratedImageWithMetadata[], Error>({
    queryKey: ['generations', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      
      return data?.map((item: any) => ({
        id: item.id,
        url: item.location,
        prompt: item.params?.prompt || item.metadata?.prompt || 'No prompt',
        metadata: item.params || item.metadata || {}
      })) || [];
    },
    enabled: !!projectId,
  });
};

// 2. Delete Generation
const deleteGeneration = async (generationId: string) => {
  const { error } = await supabase
    .from('generations')
    .delete()
    .eq('id', generationId);
  
  if (error) throw error;
  // The API might return a confirmation message, which we can use or ignore.
  // For this hook, we don't need to return anything on success.
};

export const useDeleteGeneration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteGeneration,
    onSuccess: (_, generationId) => {
      toast.success("Generation deleted successfully.");
      queryClient.invalidateQueries({ queryKey: ['generations'] });
    },
    onError: (error: Error) => {
      toast.error("Failed to delete generation.", {
        description: error.message,
      });
    },
  });
};

// 3. Create Generation (as part of a task)
interface CreateGenerationParams {
    projectId: string;
    imageUrl: string;
    prompt: string;
    metadata?: any;
}

const createGeneration = async ({ projectId, imageUrl, prompt, metadata }: CreateGenerationParams) => {
    const { data, error } = await supabase
        .from('generations')
        .insert({
            location: imageUrl,
            type: 'image',
            project_id: projectId,
            params: metadata || {}
        })
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

export const useCreateGeneration = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createGeneration,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['generations'] });
            toast.success("New generation record created.");
        },
        onError: (error: Error) => {
            toast.error("Failed to create generation record.", {
                description: error.message,
            });
        }
    });
}; 