import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GeneratedImageWithMetadata } from '@/shared/components/ImageGallery';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Fetch generations using direct Supabase call
 */
async function fetchGenerations(projectId: string | null, limit?: number): Promise<GeneratedImageWithMetadata[]> {
  if (!projectId) return [];
  
  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit || 1000);
  
  if (error) throw error;

  return data?.map((item: any) => ({
    id: item.id,
    url: item.location,
    prompt: item.params?.prompt || item.metadata?.prompt || 'No prompt',
    metadata: item.params || item.metadata || {},
    createdAt: item.created_at,
    isVideo: item.type?.includes('video'),
  })) || [];
}

/**
 * Update generation location using direct Supabase call
 */
async function updateGenerationLocation(id: string, location: string): Promise<void> {
  const { error } = await supabase
    .from('generations')
    .update({ location })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update generation: ${error.message}`);
  }
}

/**
 * Get task ID for a generation using direct Supabase call
 */
async function getTaskIdForGeneration(generationId: string): Promise<{ taskId: string | null }> {
  const { data, error } = await supabase
    .from('generations')
    .select('task_id')
    .eq('id', generationId)
    .single();

  if (error) {
    throw new Error(`Generation not found or has no task: ${error.message}`);
  }

  return { taskId: data?.task_id || null };
}

/**
 * Create a new generation using direct Supabase call
 */
async function createGeneration(params: {
  imageUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  projectId: string;
  prompt: string;
}): Promise<any> {
  const { data, error } = await supabase
    .from('generations')
    .insert({
      location: params.imageUrl,
      type: params.fileType || 'image',
      project_id: params.projectId,
      params: {
        prompt: params.prompt,
        source: 'external_upload',
        original_filename: params.fileName,
        file_type: params.fileType,
        file_size: params.fileSize,
      },
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create generation: ${error?.message || 'Unknown error'}`);
  }

  return data;
}

export function useGenerations(projectId: string | null, page: number = 1, limit: number = 1000) {
  return useQuery<GeneratedImageWithMetadata[], Error>({
    queryKey: ['generations', projectId],
    staleTime: 30 * 1000,
    queryFn: () => fetchGenerations(projectId, limit),
    enabled: !!projectId,
  });
}

export function useDeleteGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
  const { error } = await supabase
    .from('generations')
    .delete()
        .eq('id', id);
  
      if (error) {
        throw new Error(`Failed to delete generation: ${error.message}`);
      }
    },
    onSuccess: () => {
      // Invalidate the generations query to refetch
      queryClient.invalidateQueries({ queryKey: ['generations'] });      
    },
    onError: (error: Error) => {
      console.error('Error deleting generation:', error);
      toast.error(error.message || 'Failed to delete generation');
    },
  });
}

export function useUpdateGenerationLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, location }: { id: string; location: string }) => {
      return updateGenerationLocation(id, location);
    },
    onSuccess: () => {
      // Invalidate the generations query to refetch
      queryClient.invalidateQueries({ queryKey: ['generations'] });
    },
    onError: (error: Error) => {
      console.error('Error updating generation location:', error);
      toast.error(error.message || 'Failed to update generation');
    },
  });
}

export function useGetTaskIdForGeneration() {
  return useMutation({
    mutationFn: getTaskIdForGeneration,
    onError: (error: Error) => {
      console.error('Error getting task ID for generation:', error);
    },
  });
}

export function useCreateGeneration() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createGeneration,
        onSuccess: () => {
      // Invalidate the generations query to refetch
            queryClient.invalidateQueries({ queryKey: ['generations'] });
        },
        onError: (error: Error) => {
      console.error('Error creating generation:', error);
      toast.error(error.message || 'Failed to create generation');
    },
            });
        }