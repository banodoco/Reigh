import { useQuery, useMutation, useQueryClient, MutationFunction, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client'; 
import { Shot, ShotImage, GenerationRow } from '@/types/shots'; 
import { Database } from '@/integrations/supabase/types';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { toast } from 'sonner';
import React from 'react';
import { log } from '@/shared/lib/logger';

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
  
  return useMutation({
    mutationFn: async ({ name, projectId, shouldSelectAfterCreation = true }: { name: string; projectId: string; shouldSelectAfterCreation?: boolean }) => {
      const { data: newShot, error } = await supabase
        .from('shots')
        .insert({ 
          name, 
          project_id: projectId 
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return { shot: newShot, shouldSelectAfterCreation };
    },
    onSuccess: (newShot) => {
      queryClient.invalidateQueries({ queryKey: ['shots'] });
      
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
  const createShot = useCreateShot();
  const addImageToShot = useAddImageToShot();
  
  return useMutation<
    Shot,
    Error,
    DuplicateShotArgs,
    { previousShots?: Shot[], projectId?: string | null }
  >({
    mutationFn: async ({ shotId, projectId, newName }: DuplicateShotArgs): Promise<Shot> => {
      if (!projectId) {
        throw new Error('Project ID is required to duplicate a shot.');
      }

      // Get the shot to duplicate
      const { data: originalShot, error: fetchError } = await supabase
        .from('shots')
        .select(`
          *,
          shot_generations(
            *,
            generation:generations(*)
          )
        `)
        .eq('id', shotId)
        .single();
      
      if (fetchError || !originalShot) throw new Error('Shot not found');
      
      // Create new shot
      const { shot: newShot } = await createShot.mutateAsync({
        name: newName || originalShot.name + ' Copy',
        projectId: projectId,
        shouldSelectAfterCreation: false
      }) as { shot: Shot };
      
      // Copy only non-video images to the new shot
      if (originalShot.shot_generations && originalShot.shot_generations.length > 0) {
        for (const sg of originalShot.shot_generations) {
          // Skip video outputs
          const generation = sg.generation;
          if (generation && (
            generation.type === 'video_travel_output' ||
            (generation.location && generation.location.endsWith('.mp4'))
          )) {
            continue; // Skip this video output
          }
          
          await addImageToShot.mutateAsync({
            shot_id: newShot.id,
            generation_id: sg.generation_id,
            project_id: projectId
          });
        }
      }
      
      // Return the new shot with its images
      const { data: completeShot } = await supabase
        .from('shots')
        .select(`
          *,
          shot_generations(
            *,
            generation:generations(*)
          )
        `)
        .eq('id', newShot.id)
        .single();
      
      // Transform to match Shot interface
      return {
        id: completeShot.id,
        name: completeShot.name,
        created_at: completeShot.created_at,
        updated_at: completeShot.updated_at,
        project_id: completeShot.project_id,
        images: completeShot.shot_generations?.map((sg: any) => ({
          ...sg.generation,
          shotImageEntryId: sg.id,
          shot_generation_id: sg.id,
          position: sg.position,
          imageUrl: sg.generation?.location || sg.generation?.imageUrl,
          thumbUrl: sg.generation?.thumb_url || sg.generation?.thumbUrl,
        })) || []
      };
    },
    onMutate: async ({ projectId, newName, shotId }) => {
      if (!projectId) return { previousShots: [], projectId: null };
      await queryClient.cancelQueries({ queryKey: ['shots', projectId] });
      const previousShots = queryClient.getQueryData<Shot[]>(['shots', projectId]);

      // Create an optimistic shot for immediate UI feedback
      const originalShot = previousShots?.find(s => s.id === shotId);
      if (originalShot) {
        // Filter out video outputs for optimistic update
        const nonVideoImages = originalShot.images.filter(img => 
          img.type !== 'video_travel_output' && 
          !(img.location && img.location.endsWith('.mp4')) &&
          !(img.imageUrl && img.imageUrl.endsWith('.mp4'))
        );
        
        const optimisticDuplicatedShot: Shot = {
          id: `optimistic-duplicate-${Date.now()}`,
          name: newName || `${originalShot.name} (Copy)`,
          created_at: new Date().toISOString(),
          images: nonVideoImages, // Only copy non-video images for optimistic update
          project_id: projectId,
        };

        queryClient.setQueryData<Shot[]>(['shots', projectId], (oldShots = []) =>
          [optimisticDuplicatedShot, ...oldShots] // Add at beginning since server orders by newest first
        );
      }

      return { previousShots, projectId };
    },
    onSuccess: (newShot, { projectId }) => {
      if (projectId) {
        // First, explicitly remove any optimistic shots and replace with real data
        queryClient.setQueryData<Shot[]>(['shots', projectId], (oldShots = []) => {
          // Remove ALL optimistic shots (in case there are multiple)
          const shotsWithoutOptimistic = oldShots.filter(shot => 
            !shot.id.startsWith('optimistic-duplicate-') && 
            !shot.id.startsWith('optimistic-')
          );
          return [newShot, ...shotsWithoutOptimistic];
        });
        
        // Also ensure the shot is properly cached individually
        queryClient.setQueryData(['shot', newShot.id], newShot);
      }
    },
    onError: (err, { projectId }, context) => {
      console.error('Optimistic update failed, rolling back for duplicateShot:', err);
      if (context?.previousShots && projectId) {
        queryClient.setQueryData<Shot[]>(['shots', projectId], context.previousShots);
      }
    },
    onSettled: (data, error, { projectId }) => {
      // Only invalidate on error - success case is handled in onSuccess
      if (error && projectId) {
        queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      }
    },
  });
};

// List all shots with their full image details for a specific project VIA API
export const useListShots = (projectId: string | null): UseQueryResult<Shot[], Error> => {
  return useQuery({
    queryKey: ['shots', projectId],
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000, // increased from 30s to 2 minutes - shots don't change very frequently
    gcTime: 5 * 60 * 1000, // keep in cache for 5 minutes
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!projectId) return [];
      
      // First get all shots for the project
      const { data: shots, error: shotsError } = await supabase
        .from('shots')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      if (shotsError) throw shotsError;
      
      // Then get shot_generations with generation details for each shot
      const shotIds = shots.map(s => s.id);
      
      if (shotIds.length === 0) return [];
      
      const { data: shotGenerations, error: sgError } = await supabase
        .from('shot_generations')
        .select(`
          *,
          generation:generations(*)
        `)
        .in('shot_id', shotIds)
        .order('position', { ascending: true });
      
            if (sgError) throw sgError;
      
      // Group generations by shot_id
      const generationsByShot = shotGenerations.reduce((acc, sg) => {
        if (!acc[sg.shot_id]) acc[sg.shot_id] = [];
        if (sg.generation) {
          acc[sg.shot_id].push({
            ...sg.generation,
            shotImageEntryId: sg.id,
            shot_generation_id: sg.id,
            position: sg.position,
            imageUrl: sg.generation?.location || sg.generation?.imageUrl,
            thumbUrl: sg.generation?.thumb_url || sg.generation?.thumbUrl,
          });
        }
        return acc;
      }, {} as Record<string, any[]>);
      
      // Transform to match Shot interface
      const transformedShots = shots.map(shot => ({
        id: shot.id,
        name: shot.name,
        created_at: shot.created_at,
        updated_at: shot.updated_at,
        project_id: shot.project_id,
        images: generationsByShot[shot.id] || []
      }));
      
      return transformedShots;
    },
  });
};

// Type for the arguments of useAddImageToShot mutation
interface AddImageToShotArgs {
  shot_id: string;
  generation_id: string; 
  project_id: string | null; // For invalidating correct query
  position?: number | null; // Allow null for unpositioned associations
  imageUrl?: string; // For optimistic update
  thumbUrl?: string; // For optimistic update
}

// Type for the response from adding an image to a shot
type ShotImageResponse = Database['public']['Tables']['shot_images']['Row'];

// Helper function to create a generation record for an externally uploaded image
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
  
  const { data: newGeneration, error } = await supabase
    .from('generations')
    .insert({
      location: imageUrl,
      type: fileType,
      project_id: projectId,
      params: {
        fileName,
        fileSize,
        prompt: promptForGeneration
      }
    })
    .select()
    .single();
  
  if (error) {
    console.error('[useShots] createGenerationForUploadedImage: Error creating generation:', error);
    throw error;
  }
  
  return newGeneration;
};

// Helper function to detect server overload or rate limiting issues
const isQuotaOrServerError = (error: any): boolean => {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code || error?.status;
  return message.includes('quota') || 
         message.includes('rate limit') || 
         message.includes('too many requests') ||
         code === 429 || 
         code === 503 || 
         code === 502;
};

// Add image to shot VIA API
export const useAddImageToShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ shot_id, generation_id, imageUrl, thumbUrl, project_id }: { 
      shot_id: string; 
      generation_id: string; 
      imageUrl?: string;
      thumbUrl?: string;
      project_id: string;
    }) => {
      log('MobileNetworkDebug', `Starting add image to shot - ShotID: ${shot_id}, GenerationID: ${generation_id}, ImageURL: ${imageUrl?.substring(0, 100)}...`);
      
      const startTime = Date.now();
      
      // First create generation if imageUrl is provided
      if (imageUrl && !generation_id) {
        const { data: newGeneration, error: genError } = await supabase
          .from('generations')
          .insert({
            location: imageUrl,
            type: 'image',
            project_id: project_id,
            params: {}
          })
          .select()
          .single();
        
        if (genError) throw genError;
        generation_id = newGeneration.id;
      }
      
      // Use RPC function to atomically add generation to shot with proper position
      const { data: shotGeneration, error: rpcError } = await supabase
        .rpc('add_generation_to_shot', {
          p_shot_id: shot_id,
          p_generation_id: generation_id
        })
        .single();
      
      if (rpcError) {
        log('MobileNetworkDebug', `RPC Error after ${Date.now() - startTime}ms:`, rpcError);
        throw rpcError;
      }
      
      log('MobileNetworkDebug', `Successfully added image to shot in ${Date.now() - startTime}ms`);
      return shotGeneration;
    },
    onSuccess: (_, variables) => {
      // Use the project_id from variables directly
      const project_id = variables.project_id;
      
      if (project_id) {
        queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
        // Also invalidate generations cache so GenerationsPane updates immediately
        queryClient.invalidateQueries({ queryKey: ['generations', project_id] });
      }      
    },
    onError: (error: Error) => {
      console.error('Error adding image to shot:', error);
      
      // Provide more helpful error messages for common mobile issues
      let userMessage = error.message;
      if (error.message.includes('Load failed') || error.message.includes('TypeError')) {
        userMessage = 'Network connection issue. Please check your internet connection and try again.';
      } else if (error.message.includes('fetch')) {
        userMessage = 'Unable to connect to server. Please try again in a moment.';
      } else if (isQuotaOrServerError(error)) {
        userMessage = 'Server is temporarily busy. Please wait a moment before trying again.';
      }
      
      toast.error(`Failed to add image to shot: ${userMessage}`);
    },
  });
};

// Position existing generation with NULL position in shot
export const usePositionExistingGenerationInShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ shot_id, generation_id, project_id }: { 
      shot_id: string; 
      generation_id: string; 
      project_id: string;
    }) => {
      // Use the updated add_generation_to_shot function with positioning enabled
      // This will find existing records with NULL position and assign them a position
      const { data: shotGeneration, error: rpcError } = await supabase
        .rpc('add_generation_to_shot', {
          p_shot_id: shot_id,
          p_generation_id: generation_id,
          p_with_position: true
        })
        .single();
      
      if (rpcError) throw rpcError;
      
      return shotGeneration;
    },
    onSuccess: (_, variables) => {
      // Use the project_id from variables directly
      const project_id = variables.project_id;
      
      if (project_id) {
        queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
        // Also invalidate generations cache so GenerationsPane updates immediately
        queryClient.invalidateQueries({ queryKey: ['generations', project_id] });
      }      
    },
    onError: (error: Error) => {
      console.error('Error positioning existing generation in shot:', error);
      toast.error(`Failed to position generation in shot: ${error.message}`);
    },
  });
};

// Type for the arguments of useRemoveImageFromShot mutation
interface RemoveImageFromShotArgs {
  shot_id: string;
  shotImageEntryId: string; // Changed from generation_id
  project_id?: string | null;
}

// Remove an image from a shot VIA API
export const useRemoveImageFromShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ shot_id, shotImageEntryId, project_id }: { shot_id: string; shotImageEntryId: string; project_id?: string | null }) => {
      const { error } = await supabase
        .from('shot_generations')
        .delete()
        .eq('id', shotImageEntryId)
        .eq('shot_id', shot_id);
      
      if (error) throw error;
      
      return { shot_id, shotImageEntryId };
    },
    onMutate: async ({ shot_id, shotImageEntryId, project_id }) => {
      // Use project_id from arguments if provided
      if (!project_id) return { previousShots: undefined, project_id: undefined };

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
    onSettled: (data, error, variables) => {
      // Use project_id from variables
      const project_id = variables.project_id;
      
      if (project_id) {
        queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
        // Also invalidate generations cache so GenerationsPane updates immediately
        queryClient.invalidateQueries({ queryKey: ['generations', project_id] });
      }
    },
  });
};

// Delete a shot VIA API
export const useDeleteShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ shotId, projectId }: { shotId: string; projectId: string }) => {
      const { error } = await supabase
        .from('shots')
        .delete()
        .eq('id', shotId);
      
      if (error) throw error;
      
      return shotId;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });

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
  
  return useMutation({
    mutationFn: async ({ shotId, newName, projectId }: { shotId: string; newName: string; projectId: string }) => {
      const { data: updatedShot, error } = await supabase
        .from('shots')
        .update({ 
          name: newName,
          updated_at: new Date().toISOString()
        })
        .eq('id', shotId)
        .select()
        .single();
      
      if (error) throw error;
      
      return updatedShot;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });

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
  
  return useMutation({
    mutationFn: async ({ shotId, orderedShotGenerationIds, projectId }: { shotId: string; orderedShotGenerationIds: string[]; projectId: string }) => {
      // Update positions for all shot_generations in a transaction-like manner
      const updates = orderedShotGenerationIds.map((id, index) => 
        supabase
          .from('shot_generations')
          .update({ position: index })
          .eq('id', id)
          .eq('shot_id', shotId)
      );
      
      // Execute all updates
      const results = await Promise.all(updates);
      
      // Check for errors
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
      
      return { message: 'Image order updated successfully' };
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
        // Also invalidate generations cache so GenerationsPane updates immediately
        queryClient.invalidateQueries({ queryKey: ['generations', projectId] });
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
        const result = await createShotMutation.mutateAsync({ 
          name: newShotName, 
          projectId: projectIdForOperation,
          shouldSelectAfterCreation: true
        });
        if (result && result.shot && result.shot.id) {
          shotId = result.shot.id;
    
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