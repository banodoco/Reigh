import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client'; 
import { Shot, ShotImage, GenerationRow } from '@/types/shots'; 
import { Database } from '@/integrations/supabase/types';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/api';

// Define the type for the new shot data returned by Supabase
// This should align with your 'shots' table structure from `supabase/types.ts`
type ShotResponse = Database['public']['Tables']['shots']['Row'];

// Add this new type definition near the top, after other type definitions
export interface ShotGenerationRow {
  id: string;
  shotId: string;
  generationId: string;
  position?: number;
}

// CRUD functions will go here 

// Create a new shot VIA API
interface CreateShotArgs {
  shotName: string;
  projectId: string | null;
}
export const useCreateShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation<Shot, Error, { shotName: string, projectId: string }>({
    mutationFn: async ({ shotName, projectId }) => {
      const response = await fetchWithAuth('/api/shots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: shotName, projectId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to create shot: ${response.statusText}`);
      }

      const newShot: Shot = await response.json();
      return newShot;
    },
    onSuccess: (newShot) => {
      queryClient.invalidateQueries({ queryKey: ['shots', newShot.project_id] });
      toast.success(`Shot "${newShot.name}" created`);
    },
    onError: (error: Error) => {
      console.error('Error creating shot:', error);
      toast.error(`Failed to create shot: ${error.message}`);
    },
  });
};

// Duplicate a shot with all its images VIA API
interface DuplicateShotArgs {
  shotId: string;
  projectId: string | null;
  newName?: string;
}

export const useDuplicateShot = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Shot,
    Error,
    DuplicateShotArgs,
    { previousShots?: Shot[], projectId?: string | null }
  >({
    mutationFn: async ({ shotId, projectId, newName }: DuplicateShotArgs): Promise<Shot> => {
      if (!projectId) {
        console.error('Error duplicating shot: Project ID is missing');
        throw new Error('Project ID is required to duplicate a shot.');
      }

      const response = await fetch(`/api/shots/${shotId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to duplicate shot: ${response.statusText}`);
      }

      const duplicatedShot: Shot = await response.json();
      return duplicatedShot;
    },
    onMutate: async ({ projectId, newName, shotId }) => {
      if (!projectId) return { previousShots: [], projectId: null };
      await queryClient.cancelQueries({ queryKey: ['shots', projectId] });
      const previousShots = queryClient.getQueryData<Shot[]>(['shots', projectId]);

      // Create an optimistic shot for immediate UI feedback
      const originalShot = previousShots?.find(s => s.id === shotId);
      if (originalShot) {
        const optimisticDuplicatedShot: Shot = {
          id: `optimistic-duplicate-${Date.now()}`,
          name: newName || `${originalShot.name} (Copy)`,
          created_at: new Date().toISOString(),
          images: originalShot.images, // Copy images reference for optimistic update
          project_id: projectId,
        };

        queryClient.setQueryData<Shot[]>(['shots', projectId], (oldShots = []) =>
          [optimisticDuplicatedShot, ...oldShots] // Add at beginning since server orders by newest first
        );
      }

      return { previousShots, projectId };
    },
    onError: (err, { projectId }, context) => {
      console.error('Optimistic update failed, rolling back for duplicateShot:', err);
      if (context?.previousShots && projectId) {
        queryClient.setQueryData<Shot[]>(['shots', projectId], context.previousShots);
      }
    },
    onSettled: (data, error, { projectId }) => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      }
      if (!error && data) {
        toast.success(`Shot "${data.name}" duplicated successfully!`);
      }
    },
  });
};

// List all shots with their full image details for a specific project VIA API
export const useListShots = (projectId: string | null | undefined): {
  data: Shot[] | undefined,
  isLoading: boolean,
  isError: boolean,
  error: Error | null,
  refetch: () => void
} => {
  return useQuery<Shot[], Error>({
    queryKey: ['shots', projectId],
    queryFn: async () => {
      if (!projectId) {
        throw new Error('Project ID is required to fetch shots');
      }
      
      const response = await fetchWithAuth(`/api/shots?projectId=${projectId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        console.error('[API Error UseListShots] Error fetching shots for project:', projectId, errorData.message || response.statusText);
        throw new Error(errorData.message || `Failed to fetch shots: ${response.statusText}`);
      }
      
      const data: Shot[] = await response.json();
      return data;
    },
    enabled: !!projectId,
    refetchOnWindowFocus: false,
  });
};

// Type for the arguments of useAddImageToShot mutation
interface AddImageToShotArgs {
  shot_id: string;
  generation_id: string; 
  project_id: string | null; // For invalidating correct query
  position?: number; 
  imageUrl?: string; // For optimistic update
  thumbUrl?: string; // For optimistic update
}

// Type for the response from adding an image to a shot
type ShotImageResponse = Database['public']['Tables']['shot_images']['Row'];

// Helper function to create a generation record for an externally uploaded image VIA API
const createGenerationForUploadedImage = async (
  imageUrl: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  projectId: string | null
): Promise<Database['public']['Tables']['generations']['Row']> => {
  if (!projectId) {
    throw new Error('Project ID is required to create a generation record.');
  }
  
  const promptForGeneration = `External image: ${fileName || 'untitled'}`;
  
  const response = await fetchWithAuth('/api/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl,
      fileName,
      fileType,
      fileSize,
      projectId,
      prompt: promptForGeneration,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    console.error('[useShots] createGenerationForUploadedImage (API): Error creating generation:', errorData);
    throw new Error(errorData.message || `Failed to create generation record: ${response.statusText}`);
  }
  
  const newGeneration: Database['public']['Tables']['generations']['Row'] = await response.json();
  return newGeneration;
};

// Add image to shot VIA API
export const useAddImageToShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation<
    Database['public']['Tables']['shot_images']['Row'], 
    Error, 
    AddImageToShotArgs
  >({
    mutationFn: async ({ shot_id, generation_id, imageUrl, thumbUrl, project_id }: AddImageToShotArgs) => {
      const response = await fetchWithAuth('/api/shots/shot_generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotId: shot_id, generationId: generation_id, imageUrl, thumbUrl, projectId: project_id }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to add image to shot: ${response.statusText}`);
      }

      const result: Database['public']['Tables']['shot_images']['Row'] = await response.json();
      return result;
    },
    onSuccess: (_, { project_id }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
      toast.success('Image added to shot');
    },
    onError: (error: Error) => {
      console.error('Error adding image to shot:', error);
      toast.error(`Failed to add image to shot: ${error.message}`);
    },
  });
};

// Type for the arguments of useRemoveImageFromShot mutation
interface RemoveImageFromShotArgs {
  shot_id: string;
  shotImageEntryId: string; // Changed from generation_id
  project_id: string | null;
}

// Remove an image from a shot VIA API
export const useRemoveImageFromShot = () => {
  const queryClient = useQueryClient();
  return useMutation<
    void, 
    Error,
    RemoveImageFromShotArgs,
    { previousShots?: Shot[], project_id?: string | null }
  >({
    mutationFn: async ({ shot_id, shotImageEntryId }: RemoveImageFromShotArgs) => {
      const response = await fetchWithAuth(`/api/shots/${shot_id}/generations/${shotImageEntryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to remove image from shot: ${response.statusText}`);
      }
    },
    onMutate: async ({ shot_id, shotImageEntryId, project_id }) => {
      if (!project_id) return { previousShots: [], project_id: null };
      await queryClient.cancelQueries({ queryKey: ['shots', project_id] });
      const previousShots = queryClient.getQueryData<Shot[]>(['shots', project_id]);

      queryClient.setQueryData<Shot[]>(['shots', project_id], (oldShots = []) =>
        oldShots.map(shot => {
          if (shot.id === shot_id) {
            return {
              ...shot,
              images: shot.images.filter(image => image.shotImageEntryId !== shotImageEntryId),
            };
          }
          return shot;
        })
      );
      
      return { previousShots, project_id };
    },
    onError: (err, args, context) => {
      console.error('Optimistic update failed for removeImageFromShot:', err);
      if (context?.previousShots && context.project_id) {
        queryClient.setQueryData<Shot[]>(['shots', context.project_id], context.previousShots);
      }
      toast.error(`Failed to remove image: ${err.message}`);
    },
    onSettled: (data, error, { project_id }) => {
      if (project_id) {
        queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
      }
    },
  });
};

// Delete a shot VIA API
export const useDeleteShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation<void, Error, { shotId: string, projectId: string }>({
    mutationFn: async ({ shotId }) => {
      const response = await fetchWithAuth(`/api/shots/${shotId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to delete shot: ${response.statusText}`);
      }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      toast.success('Shot deleted');
    },
    onError: (error: Error) => {
      console.error('Error deleting shot:', error);
      toast.error(`Failed to delete shot: ${error.message}`);
    },
  });
};

// Type for updating shot name
interface UpdateShotNameArgs {
  shotId: string;
  newName: string;
  projectId: string | null;
}

// Update shot name VIA API
export const useUpdateShotName = () => {
  const queryClient = useQueryClient();
  
  return useMutation<void, Error, { shotId: string, newName: string, projectId: string }>({
    mutationFn: async ({ shotId, newName }) => {
      const response = await fetchWithAuth(`/api/shots/${shotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Failed to update shot name: ${response.statusText}`);
      }
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      toast.success('Shot name updated');
    },
    onError: (error: Error) => {
      console.error('Error updating shot name:', error);
      toast.error(`Failed to update shot name: ${error.message}`);
    },
  });
};

// Type for the arguments of useUpdateShotImageOrder mutation
interface UpdateShotImageOrderArgs {
  shotId: string;
  orderedShotGenerationIds: string[]; // Changed from orderedGenerationIds
  projectId: string | null;
}

// Update the order of images in a shot VIA API
export const useUpdateShotImageOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    UpdateShotImageOrderArgs,
    { previousShots?: Shot[], projectId: string | null }
  >({
    mutationFn: async ({ shotId, orderedShotGenerationIds }: UpdateShotImageOrderArgs) => {
      const response = await fetchWithAuth(`/api/shots/${shotId}/generations/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedShotGenerationIds }), // Changed payload key
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || 'Failed to update image order');
      }
    },
    onMutate: async ({ shotId, orderedShotGenerationIds, projectId }) => {
      if (!projectId) return { previousShots: [], projectId: null };
      await queryClient.cancelQueries({ queryKey: ['shots', projectId] });
      const previousShots = queryClient.getQueryData<Shot[]>(['shots', projectId]);
      
      queryClient.setQueryData<Shot[]>(['shots', projectId], (oldShots = []) => {
        return oldShots.map(shot => {
          if (shot.id === shotId) {
            const imageMap = new Map(shot.images.map(img => [img.shotImageEntryId, img]));
            const reorderedImages = orderedShotGenerationIds
              .map(id => imageMap.get(id))
              .filter((img): img is GenerationRow => !!img);
            
            return { ...shot, images: reorderedImages };
          }
          return shot;
        });
      });

      return { previousShots, projectId };
    },
    onError: (err, args, context) => {
      console.error('Optimistic update failed for updateShotImageOrder:', err);
      if (context?.previousShots && context.projectId) {
        queryClient.setQueryData(['shots', context.projectId], context.previousShots);
      }
      toast.error(`Failed to reorder images: ${err.message}`);
    },
    onSettled: (data, error, { projectId }) => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      }
    },
  });
};

// Hook to handle dropping an external image file to create a new shot or add to an existing one
export const useHandleExternalImageDrop = () => {
  const createShotMutation = useCreateShot();
  const addImageToShotMutation = useAddImageToShot();
  // IMPORTANT: This hook needs access to the current project_id.
  // This should ideally come from a context, e.g., useProject().
  // For now, I'll assume it's passed as an argument or a higher-level component handles it.
  // Let's modify it to accept projectId.

  const mutation = useMutation({
    mutationFn: async (variables: {
        imageFiles: File[], 
        targetShotId: string | null, 
        currentProjectQueryKey: string | null,
        currentShotCount: number
    }) => {
    const { imageFiles, targetShotId, currentProjectQueryKey, currentShotCount } = variables;
    
    if (!currentProjectQueryKey) { // Should be actual projectId
        toast.error("Cannot add image(s): current project is not identified.");
        return null;
    }
    const projectIdForOperation = currentProjectQueryKey; // Use the passed projectId

    let shotId = targetShotId;
    const generationIds: string[] = [];

    try {
      // 1. Create a new shot if targetShotId is null
      if (!shotId) {
        const newShotName = `Shot ${currentShotCount + 1}`;
        const createdShot = await createShotMutation.mutateAsync({ shotName: newShotName, projectId: projectIdForOperation });
        if (createdShot && createdShot.id) {
          shotId = createdShot.id;
          toast.success(`New shot "${newShotName}" created!`);
        } else {
          toast.error("Failed to create new shot.");
          return null;
        }
      }
      
      if (!shotId) {
        toast.error("Cannot add images to an unknown shot.");
        return null;
      }

      // 2. Process each file
      for (const imageFile of imageFiles) {
        let newGeneration: Database['public']['Tables']['generations']['Row'] | null = null;
        try {
          // 2a. Upload the image to Supabase Storage
          const imageUrl = await uploadImageToStorage(imageFile);
          if (!imageUrl) {
            toast.error(`Failed to upload image ${imageFile.name} to storage.`);
            continue; // Skip to next file
          }
          toast.success(`Image ${imageFile.name} uploaded to storage!`);

          // 2b. Create a generation record for the uploaded image
          try {
            newGeneration = await createGenerationForUploadedImage(imageUrl, imageFile.name, imageFile.type, imageFile.size, projectIdForOperation);
          } catch (generationError) {
            toast.error(`Failed to create generation data for ${imageFile.name}: ${(generationError as Error).message}`);
            continue; // Skip to next file
          }

          if (!newGeneration || !newGeneration.id) {
            toast.error(`Failed to create generation record for ${imageFile.name} or ID is missing.`);
            continue; // Skip to next file
          }

          // 2c. Add the generation to the shot (either new or existing)
          await addImageToShotMutation.mutateAsync({
            shot_id: shotId,
            generation_id: newGeneration.id as string,
            project_id: projectIdForOperation,
            imageUrl: newGeneration.location || undefined,
            thumbUrl: newGeneration.location || undefined,
          });
          generationIds.push(newGeneration.id as string);
          toast.success(`Image ${imageFile.name} added to shot!`);

        } catch (fileError) {
            console.error(`[useShots] Error processing file ${imageFile.name}:`, fileError);
            toast.error(`Failed to process file ${imageFile.name}: ${(fileError as Error).message}`);
        }
      }

      if (generationIds.length > 0) {
        return { shotId, generationIds };
      } else {
        // If no files were successfully processed, but a new shot was created, it will be empty.
        // This might be desired, or we might want to delete it. For now, leave it.
        return null; 
      }

    } catch (error) {
      console.error('[useShots] Error handling external image drop:', error); // [VideoLoadSpeedIssue]
      toast.error(`Failed to process dropped image(s): ${(error as Error).message}`);
      return null;
    }
    }
  });

  return mutation;
}; 