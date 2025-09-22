import { useQuery, useMutation, useQueryClient, MutationFunction, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client'; 
import { Shot, ShotImage, GenerationRow } from '@/types/shots'; 
import { Database } from '@/integrations/supabase/types';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail, uploadImageWithThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import { toast } from 'sonner';
// Removed invalidationRouter - DataFreshnessManager handles all invalidation logic
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
  timeline_frame?: number;
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
    mutationFn: async ({ name, projectId, shouldSelectAfterCreation = true, position }: { 
      name: string; 
      projectId: string; 
      shouldSelectAfterCreation?: boolean;
      position?: number; 
    }) => {
      let newShot;
      
      if (position !== undefined) {
        // Use the new database function to insert at specific position
        const { data, error } = await supabase
          .rpc('insert_shot_at_position', {
            p_project_id: projectId,
            p_shot_name: name,
            p_position: position
          })
          .single();
        
        if (error) throw error;
        
        const result = data as { shot_id: string; success: boolean } | null;
        if (!result?.success) {
          throw new Error('Failed to create shot at position');
        }
        
        // Fetch the created shot
        const { data: shotData, error: fetchError } = await supabase
          .from('shots')
          .select()
          .eq('id', result.shot_id)
          .single();
        
        if (fetchError) throw fetchError;
        newShot = shotData;
      } else {
        // Use regular insertion (triggers auto-position assignment)
        const { data, error } = await supabase
          .from('shots')
          .insert({ 
            name, 
            project_id: projectId,
            position: null  // Explicitly set to NULL to trigger the database function
          })
          .select()
          .single();
        
        if (error) throw error;
        newShot = data;
      }
      
      return { shot: newShot, shouldSelectAfterCreation };
    },
    onSuccess: (result) => {
      // Shot creation events are now handled by DataFreshnessManager via realtime events
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
      
      // Create new shot at position right after the original
      const { shot: newShot } = await createShot.mutateAsync({
        name: newName || originalShot.name + ' Copy',
        projectId: projectId,
        shouldSelectAfterCreation: false,
        position: (originalShot.position || 0) + 1
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
        position: completeShot.position || 1, // Include position field
        images: completeShot.shot_generations?.map((sg: any) => ({
          ...sg.generation,
          shotImageEntryId: sg.id,
          shot_generation_id: sg.id,
          imageUrl: sg.generation?.location || sg.generation?.imageUrl,
          thumbUrl: sg.generation?.location || sg.generation?.thumbUrl,
          timeline_frame: sg.timeline_frame, // Include timeline_frame for filtering and ordering
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
          position: (originalShot.position || 0) + 1, // Position after the original shot
        };

        queryClient.setQueryData<Shot[]>(['shots', projectId], (oldShots = []) => {
          // Insert the duplicate at the correct position in the ordered list
          // Since shots are ordered by position (ascending), find the insertion point
          const insertionIndex = oldShots.findIndex(shot => 
            shot.position > (originalShot.position || 0)
          );
          
          if (insertionIndex === -1) {
            // No shots with higher position found, append at end
            return [...oldShots, optimisticDuplicatedShot];
          } else {
            // Insert at the found position and shift subsequent positions
            const updatedShots = [...oldShots];
            // Update positions of shots that will be shifted
            for (let i = insertionIndex; i < updatedShots.length; i++) {
              updatedShots[i] = {
                ...updatedShots[i],
                position: (updatedShots[i].position || 0) + 1
              };
            }
            // Insert the duplicate at the correct position
            updatedShots.splice(insertionIndex, 0, optimisticDuplicatedShot);
            return updatedShots;
          }
        });
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
        // Shot update events are now handled by DataFreshnessManager via realtime events
      }
    },
  });
};

// List all shots for a specific project (configurable image loading)
export const useListShots = (projectId?: string | null, options: { maxImagesPerShot?: number } = {}) => {
  const { maxImagesPerShot = 0 } = options; // Default to unlimited (0), can be limited for list views
  
  return useQuery({
    queryKey: ['shots', projectId, maxImagesPerShot], // Include maxImagesPerShot in cache key
    queryFn: async () => {
      if (!projectId) {
        return [];
      }
      

        
      // Just get shots simple query - order by position (which defaults to chronological)
      const { data: shots, error: shotsError } = await supabase
        .from('shots')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true, nullsFirst: false });
      
      if (shotsError) {
        throw shotsError;
      }
      
      if (!shots || shots.length === 0) {
        return [];
      }
      
      // Get images per shot based on maxImagesPerShot parameter
      const shotPromises = shots.map(async (shot) => {
        let query = supabase
          .from('shot_generations')
        .select(`
          id,
          timeline_frame,
          generation:generations(
              id,
              location,
              type,
              created_at
            )
          `)
          .eq('shot_id', shot.id)
          .order('timeline_frame', { ascending: true })
          .order('created_at', { ascending: false });
        
        // Only apply limit if specified (allows unlimited when needed)
        if (maxImagesPerShot > 0) {
          query = query.limit(maxImagesPerShot);
        }
        
        const { data: shotGenerations, error: sgError } = await query;
        
        if (sgError) {
          throw sgError;
        }
        
        const transformedImages = (shotGenerations || [])
          .filter(sg => sg.generation) // Filter out any null generations
          .map(sg => ({
            ...sg.generation,
            shotImageEntryId: sg.id,
            imageUrl: (sg.generation as any).location,
            thumbUrl: (sg.generation as any).location,
            timeline_frame: sg.timeline_frame, // Include timeline_frame for filtering and ordering
          }));
        
        return {
          ...shot,
          images: transformedImages,
        };
      });
      
      const result = await Promise.all(shotPromises);
      
      // [ShotReorderDebug] Log actual database positions returned
      console.log('[ShotReorderDebug] Database query returned shots:', {
        projectId,
        shotsCount: result.length,
        timestamp: Date.now()
      });
      
      // [ShotReorderDebug] Log each position individually to avoid array collapse
      result.slice(0, 10).forEach((shot, index) => {
        console.log(`[ShotReorderDebug] Shot ${index}: ${shot.name} (ID: ${shot.id.substring(0, 8)}) - Position: ${shot.position}`);
      });
      
      return result;
    },
    enabled: !!projectId,
    // If CancelledError occurs due to emergency recovery, keep showing last good data
    placeholderData: (previousData) => previousData,
  });
};

// Type for the arguments of useReorderShots mutation
interface ReorderShotsArgs {
  projectId: string;
  shotOrders: { shotId: string; position: number }[];
}

// Hook to reorder shots by updating their position values
export const useReorderShots = () => {
  // [ShotReorderDebug] Debug tag for shot reordering issues
  const REORDER_DEBUG_TAG = '[ShotReorderDebug]';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, shotOrders }: ReorderShotsArgs) => {
      console.log(`${REORDER_DEBUG_TAG} === MUTATION FUNCTION START ===`);
      console.log(`${REORDER_DEBUG_TAG} Mutation input:`, {
        projectId,
        shotOrders,
        shotOrdersCount: shotOrders.length,
        timestamp: Date.now()
      });

      // Update each shot's position in a batch
      const updates = shotOrders.map(({ shotId, position }) => {
        console.log(`${REORDER_DEBUG_TAG} Creating update for shot:`, {
          shotId,
          position,
          projectId
        });
        
        return supabase
          .from('shots')
          .update({ position })
          .eq('id', shotId)
          .eq('project_id', projectId);
      });

      console.log(`${REORDER_DEBUG_TAG} Executing ${updates.length} database updates...`);
      const results = await Promise.all(updates);
      
      console.log(`${REORDER_DEBUG_TAG} Database updates completed:`, {
        results: results.map((result, index) => ({
          shotId: shotOrders[index].shotId,
          position: shotOrders[index].position,
          success: !result.error,
          error: result.error?.message,
          data: result.data
        }))
      });
      
      // Check for any errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        const errorMessage = `Failed to update shot positions: ${errors.map(e => e.error?.message).join(', ')}`;
        console.log(`${REORDER_DEBUG_TAG} Database errors found:`, {
          errorCount: errors.length,
          errors: errors.map(e => e.error),
          errorMessage
        });
        throw new Error(errorMessage);
      }

      console.log(`${REORDER_DEBUG_TAG} All database updates successful`);
      return results;
    },
    onSuccess: (data, { projectId, shotOrders }) => {
      console.log(`${REORDER_DEBUG_TAG} === MUTATION SUCCESS ===`, {
        projectId,
        shotOrders,
        data,
        timestamp: Date.now()
      });
      // Invalidate queries to refresh from database and confirm the actual order
      if (projectId) {
        // Emit domain event for shot reordering
        // Shot reorder events are now handled by DataFreshnessManager via realtime events
        console.log(`${REORDER_DEBUG_TAG} Emitted SHOT_REORDER event for project: ${projectId}`);
      }
    },
    onError: (error, { projectId, shotOrders }) => {
      console.log(`${REORDER_DEBUG_TAG} === MUTATION ERROR ===`, {
        error: error.message,
        errorDetails: error,
        projectId,
        shotOrders,
        timestamp: Date.now()
      });
      console.error('Error reordering shots:', error);
    },
    onMutate: ({ projectId, shotOrders }) => {
      console.log(`${REORDER_DEBUG_TAG} === MUTATION STARTING ===`, {
        projectId,
        shotOrders,
        timestamp: Date.now()
      });
    },
    onSettled: (data, error, { projectId, shotOrders }) => {
      console.log(`${REORDER_DEBUG_TAG} === MUTATION SETTLED ===`, {
        success: !error,
        error: error?.message,
        projectId,
        shotOrders,
        timestamp: Date.now()
      });
    }
  });
};

// Type for the arguments of useAddImageToShot mutation
interface AddImageToShotArgs {
  shot_id: string;
  generation_id: string; 
  project_id: string | null; // For invalidating correct query
  timeline_frame?: number | null; // Allow null for unpositioned associations
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
  projectId: string | null,
  thumbnailUrl?: string
): Promise<Database['public']['Tables']['generations']['Row']> => {
  if (!projectId) {
    throw new Error('Project ID is required to create a generation record.');
  }
  
  const promptForGeneration = `External image: ${fileName || 'untitled'}`;
  
  const { data: newGeneration, error } = await supabase
    .from('generations')
    .insert({
      location: imageUrl,
      thumbnail_url: thumbnailUrl || imageUrl, // Use thumbnail URL if provided, fallback to main image
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
      console.log('[PositionFix] useAddImageToShot starting (regular path):', {
        shot_id,
        generation_id,
        imageUrl: imageUrl?.substring(0, 50) + '...',
        project_id,
        timestamp: Date.now()
      });
      
      const startTime = Date.now();

      // Check what currently exists for this shot-generation combo
      const { data: allExistingRecords, error: checkError } = await supabase
        .from('shot_generations')
        .select('id, shot_id, generation_id, timeline_frame, created_at')
        .eq('shot_id', shot_id)
        .eq('generation_id', generation_id)
        .order('created_at', { ascending: true });

      if (checkError) {
        console.error('[PositionFix] Error checking existing records (regular path):', checkError);
      } else {
        console.log('[PositionFix] ALL existing records (regular path):', {
          shot_id,
          generation_id,
          recordCount: allExistingRecords?.length || 0,
          allRecords: allExistingRecords?.map(record => ({
            id: record.id,
            timeline_frame: record.timeline_frame,
            created_at: record.created_at,
            isTimelineFrameNull: record.timeline_frame === null || record.timeline_frame === undefined
          })) || []
        });
      }
      
      // First create generation if imageUrl is provided
      if (imageUrl && !generation_id) {
        console.log('[PositionFix] Creating new generation from imageUrl');
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
        console.log('[PositionFix] Created new generation:', { newGenerationId: generation_id });
      }
      
      // Use RPC function to atomically add generation to shot with proper position
      console.log('[PositionFix] Calling RPC add_generation_to_shot (regular path) with params:', {
        p_shot_id: shot_id,
        p_generation_id: generation_id,
        p_with_position: 'default (not specified - should be true)'
      });

      const { data: shotGeneration, error: rpcError } = await supabase
        .rpc('add_generation_to_shot', {
          p_shot_id: shot_id,
          p_generation_id: generation_id
        })
        .single();
      
      if (rpcError) {
        log('MobileNetworkDebug', `RPC Error after ${Date.now() - startTime}ms:`, rpcError);
        console.error('[PositionFix] RPC error (regular path):', {
          rpcError,
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint
        });
        throw rpcError;
      }
      
      console.log('[PositionFix] RPC success (regular path), returned data:', {
        shotGeneration,
        newTimelineFrame: (shotGeneration as any)?.timeline_frame,
        timestamp: Date.now()
      });

      // Verify the final state
      const { data: finalRecords, error: verifyError } = await supabase
        .from('shot_generations')
        .select('id, shot_id, generation_id, timeline_frame, created_at')
        .eq('shot_id', shot_id)
        .eq('generation_id', generation_id)
        .order('created_at', { ascending: true });

      if (verifyError) {
        console.error('[PositionFix] Error verifying final records (regular path):', {
          verifyError,
          errorCode: verifyError.code,
          errorMessage: verifyError.message,
          errorDetails: verifyError.details,
          queryParams: { shot_id, generation_id }
        });
      } else {
        console.log('[PositionFix] Final verification (regular path):', {
          shot_id,
          generation_id,
          beforeCount: allExistingRecords?.length || 0,
          afterCount: finalRecords?.length || 0,
          recordsAdded: (finalRecords?.length || 0) - (allExistingRecords?.length || 0),
          finalRecords: finalRecords?.map(record => ({
            id: record.id,
            timeline_frame: record.timeline_frame,
            created_at: record.created_at,
            isTimelineFrameNull: record.timeline_frame === null || record.timeline_frame === undefined
          })) || [],
          rpcReturnedTimelineFrame: (shotGeneration as any)?.timeline_frame,
          rpcReturnedId: (shotGeneration as any)?.id
        });
      }
      
      log('MobileNetworkDebug', `Successfully added image to shot in ${Date.now() - startTime}ms`);
      return shotGeneration;
    },
    onSuccess: (_, variables) => {
      // Emit domain event for shot-generation change
      const { project_id, shot_id } = variables;
      
      if (project_id) {
        // CRITICAL: Invalidate shot generations query so ShotImagesEditor updates immediately
        queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shot_id] });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', project_id] });
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shot_id] });
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

// Add image to shot WITHOUT position VIA API
export const useAddImageToShotWithoutPosition = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ shot_id, generation_id, imageUrl, thumbUrl, project_id }: { 
      shot_id: string; 
      generation_id: string; 
      imageUrl?: string;
      thumbUrl?: string;
      project_id: string;
    }) => {
      log('MobileNetworkDebug', `Starting add image to shot WITHOUT position - ShotID: ${shot_id}, GenerationID: ${generation_id}, ImageURL: ${imageUrl?.substring(0, 100)}...`);
      
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
      
      // Use RPC function to atomically add generation to shot WITHOUT position
      const { data: shotGeneration, error: rpcError } = await supabase
        .rpc('add_generation_to_shot', {
          p_shot_id: shot_id,
          p_generation_id: generation_id,
          p_with_position: false
        })
        .single();
      
      if (rpcError) {
        log('MobileNetworkDebug', `RPC Error after ${Date.now() - startTime}ms:`, rpcError);
        throw rpcError;
      }
      
      log('MobileNetworkDebug', `Successfully added image to shot WITHOUT position in ${Date.now() - startTime}ms`);
      return shotGeneration;
    },
    onSuccess: (_, variables) => {
      // Batch invalidate queries for better performance
      const { project_id, shot_id } = variables;
      
      if (project_id) {
        // CRITICAL: Invalidate shot generations query so ShotImagesEditor updates immediately
        queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shot_id] });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', project_id] });
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shot_id] });
      }
    },
    onError: (error: Error) => {
      console.error('Error adding image to shot without position:', error);
      toast.error(`Failed to add image to shot: ${error.message}`);
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
      console.log('[PositionFix] usePositionExistingGenerationInShot starting:', {
        shot_id,
        generation_id,
        project_id,
        timestamp: Date.now()
      });

      // First, let's check what currently exists for this shot-generation combo
      // Use .select() instead of .maybeSingle() to see ALL records
      const { data: allExistingRecords, error: checkError } = await supabase
        .from('shot_generations')
        .select('id, shot_id, generation_id, timeline_frame, created_at')
        .eq('shot_id', shot_id)
        .eq('generation_id', generation_id)
        .order('created_at', { ascending: true });

      if (checkError) {
        console.error('[PositionFix] Error checking existing records:', checkError);
      } else {
        console.log('[PositionFix] ALL existing shot_generation records for this combo:', {
          shot_id,
          generation_id,
          recordCount: allExistingRecords?.length || 0,
          allRecords: allExistingRecords?.map(record => ({
            id: record.id,
            timeline_frame: record.timeline_frame,
            created_at: record.created_at,
            isTimelineFrameNull: record.timeline_frame === null || record.timeline_frame === undefined
          })) || [],
          hasNullTimelineFrameRecord: allExistingRecords?.some(r => r.timeline_frame === null || r.timeline_frame === undefined) || false,
          hasTimelineFrameRecord: allExistingRecords?.some(r => r.timeline_frame !== null && r.timeline_frame !== undefined) || false
        });
      }
      
      // Use the updated add_generation_to_shot function with positioning enabled
      // This will find existing records with NULL position and assign them a position
      console.log('[PositionFix] Calling RPC add_generation_to_shot with params:', {
        p_shot_id: shot_id,
        p_generation_id: generation_id,
        p_with_position: true
      });

      const { data: shotGeneration, error: rpcError } = await supabase
        .rpc('add_generation_to_shot', {
          p_shot_id: shot_id,
          p_generation_id: generation_id,
          p_with_position: true
        })
        .single();
      
      if (rpcError) {
        console.error('[PositionFix] RPC error:', {
          rpcError,
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint
        });
        throw rpcError;
      }
      
      console.log('[PositionFix] RPC success, returned data:', {
        shotGeneration,
        newTimelineFrame: (shotGeneration as any)?.timeline_frame,
        recordId: (shotGeneration as any)?.id,
        shotId: (shotGeneration as any)?.shot_id,
        generationId: (shotGeneration as any)?.generation_id,
        timestamp: Date.now()
      });

      // Let's verify the final state - get ALL records again to see what happened
      const { data: finalRecords, error: verifyError } = await supabase
        .from('shot_generations')
        .select('id, shot_id, generation_id, timeline_frame, created_at')
        .eq('shot_id', shot_id)
        .eq('generation_id', generation_id)
        .order('created_at', { ascending: true });

      if (verifyError) {
        console.error('[PositionFix] Error verifying final records:', {
          verifyError,
          errorCode: verifyError.code,
          errorMessage: verifyError.message,
          errorDetails: verifyError.details,
          queryParams: { shot_id, generation_id }
        });
      } else {
        console.log('[PositionFix] Final verification - ALL records after RPC:', {
          shot_id,
          generation_id,
          beforeCount: allExistingRecords?.length || 0,
          afterCount: finalRecords?.length || 0,
          recordsAdded: (finalRecords?.length || 0) - (allExistingRecords?.length || 0),
          finalRecords: finalRecords?.map(record => ({
            id: record.id,
            timeline_frame: record.timeline_frame,
            created_at: record.created_at,
            isTimelineFrameNull: record.timeline_frame === null || record.timeline_frame === undefined
          })) || [],
          rpcReturnedTimelineFrame: (shotGeneration as any)?.timeline_frame,
          rpcReturnedId: (shotGeneration as any)?.id
        });
      }
      
      return shotGeneration;
    },
    onSuccess: (_, variables) => {
      // Batch invalidate queries for better performance
      const { project_id, shot_id } = variables;
      
      // Emit domain event for shot-generation change
      if (project_id) {
        // Shot generation change events are now handled by DataFreshnessManager via realtime events
      }
    },
    onError: (error: Error) => {
      console.error('Error positioning existing generation in shot:', error);
      toast.error(`Failed to position generation in shot: ${error.message}`);
    },
  });
};

// Duplicate image in shot at specific position
export const useDuplicateImageInShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      shot_id,
      generation_id,
      project_id,
      silent
    }: {
      shot_id: string;
      generation_id: string;
      project_id: string;
      silent?: boolean;
    }) => {
      // Get all existing images to calculate timeline frame midpoint
      const { data: allImages, error: fetchAllError } = await supabase
        .from('shot_generations')
        .select('id, timeline_frame, generation_id')
        .eq('shot_id', shot_id)
        .order('timeline_frame', { ascending: true });
      
      if (fetchAllError) throw fetchAllError;
      
      // Find the original image and the next image to calculate midpoint
      const originalImage = allImages?.find(img => img.generation_id === generation_id);
      if (!originalImage) throw new Error('Original image not found');
      
      // Find the next image by timeline_frame order (not position order)
      const originalFrame = originalImage.timeline_frame || 0;
      
      // Sort all images by timeline_frame to find the actual next image in timeline order
      const sortedByTimelineFrame = allImages
        ?.filter(img => img.timeline_frame !== null && img.timeline_frame !== undefined)
        .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0)) || [];
      
      // Find the next image after the original in timeline order
      const originalIndex = sortedByTimelineFrame.findIndex(img => img.id === originalImage.id);
      const nextImageInTimeline = originalIndex >= 0 && originalIndex < sortedByTimelineFrame.length - 1 
        ? sortedByTimelineFrame[originalIndex + 1] 
        : null;
        
      // If we're at the end of the timeline, there's no next image
      // The duplicate should go after the original with default spacing
      
      // Calculate timeline frame as midpoint
      const nextFrame = nextImageInTimeline 
        ? (nextImageInTimeline.timeline_frame || (originalFrame + 60))
        : (originalFrame + 60); // Default spacing if no next image
      const duplicateTimelineFrame = Math.floor((originalFrame + nextFrame) / 2);
      
      console.log('[DUPLICATE] Timeline frame calculation:', {
        originalFrame,
        nextFrame,
        duplicateTimelineFrame,
        nextImageInTimeline: nextImageInTimeline ? {
          id: nextImageInTimeline.id.substring(0, 8),
          timeline_frame: nextImageInTimeline.timeline_frame
        } : 'none',
        totalImagesInTimeline: sortedByTimelineFrame.length,
        originalIndexInTimeline: originalIndex
      });
      
      // No need to shift positions manually - they're now computed from timeline_frame!
      // Just insert the duplicate with the calculated timeline frame
      const { data: newShotGeneration, error: insertError } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id,
          // Remove position - it will be computed from timeline_frame
          timeline_frame: duplicateTimelineFrame,
          metadata: {
            duplicated_from: originalImage.id,
            original_timeline_frame: originalFrame,
            calculated_midpoint: duplicateTimelineFrame
          }
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      return newShotGeneration;
    },
    onMutate: async ({ shot_id, generation_id, project_id, silent }) => {
      console.log('[DUPLICATE] onMutate optimistic update', {
        shot_id,
        generation_id,
        timestamp: Date.now()
      });

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['shots', project_id] });
      
      // Snapshot the previous value
      const previousShots = queryClient.getQueryData<Shot[]>(['shots', project_id]);
      
      // Optimistically update
      if (previousShots) {
        const updatedShots = previousShots.map(shot => {
          if (shot.id === shot_id) {
            // Find the generation to duplicate
            const genToDuplicate = shot.images.find(img => img.id === generation_id);
            if (!genToDuplicate) return shot;
            
            console.log('[DUPLICATE] Found generation to duplicate', {
              genToDuplicate: genToDuplicate.shotImageEntryId,
              originalPosition: (genToDuplicate as any).position
            });

            // Create a new shot generation entry
            const duplicatedImage = {
              ...genToDuplicate,
              shotImageEntryId: `temp-${Date.now()}`, // Temporary ID for optimistic update
              shot_generation_id: `temp-${Date.now()}`,
              position: position
            };
            
            console.log('[DUPLICATE] Images before position adjustment', {
              imageCount: shot.images.length,
              positions: shot.images.map(img => (img as any).position)
            });

            // Update positions and insert duplicate
            const updatedImages = shot.images.map(img => {
              const imgPosition = (img as any).position;
              if (imgPosition !== null && imgPosition !== undefined && imgPosition >= position) {
                console.log('[DUPLICATE] Shifting image position', {
                  imageId: img.shotImageEntryId,
                  oldPosition: imgPosition,
                  newPosition: imgPosition + 1
                });
                return { ...img, position: imgPosition + 1 } as any;
              }
              return img;
            });
            
            console.log('[DUPLICATE] About to splice at position', {
              splicePosition: position,
              arrayLength: updatedImages.length
            });

            // Insert the duplicate at the correct position
            updatedImages.splice(position, 0, duplicatedImage);
            
            console.log('[DUPLICATE] Final images after splice', {
              imageCount: updatedImages.length,
              positions: updatedImages.map(img => (img as any).position)
            });

            return { ...shot, images: updatedImages };
          }
          return shot;
        });
        
        queryClient.setQueryData(['shots', project_id], updatedShots);
      }
      
      return { previousShots };
    },
    onError: (err, { project_id, silent }, context) => {
      // Rollback on error
      if (context?.previousShots) {
        queryClient.setQueryData(['shots', project_id], context.previousShots);
      }
      console.error('Error duplicating image in shot:', err);
      if (!silent) {
        toast.error('Failed to duplicate image');
      }
    },
    onSuccess: (_, { project_id, shot_id }) => {
      // Invalidate to get fresh data
      queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
      // CRITICAL: Invalidate the per-shot generations list used by ShotEditor
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shot_id] });
      // Also invalidate unpositioned-count in case duplication affects positions
      queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shot_id] });
    }
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
        // Also invalidate unified generations cache so GenerationsPane updates immediately
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', project_id] });
        // CRITICAL: Invalidate the per-shot generations list used by ShotEditor
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', variables.shot_id] });
        // Ensure unpositioned-count updates after deletion
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', variables.shot_id] });
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
    onSuccess: (_, { projectId, shotId }) => {
      // Emit domain event for shot deletion
      // Shot deletion events are now handled by DataFreshnessManager via realtime events

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
      // Update timeline_frames for all shot_generations in a transaction-like manner
      const updates = orderedShotGenerationIds.map((id, index) => 
        supabase
          .from('shot_generations')
          .update({ timeline_frame: index * 50 })
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
    onSettled: (data, error, { projectId, shotId }) => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
        // Also invalidate unified generations cache so GenerationsPane updates immediately
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
        // CRITICAL: Invalidate the per-shot generations list used by ShotEditor
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
      }
    },
  });
};

// Hook to handle dropping an external image file to create a new shot or add to an existing one
// Type for the RPC response
interface CreateShotWithImageResponse {
  shot_id: string;
  shot_name: string;
  shot_generation_id: string;
  success: boolean;
}

// Create shot with image atomically using database function
export const useCreateShotWithImage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      projectId, 
      shotName, 
      generationId 
    }: { 
      projectId: string; 
      shotName: string; 
      generationId: string; 
    }) => {
      console.log('[CreateShotWithImage] Starting atomic operation:', {
        projectId,
        shotName,
        generationId
      });
      
      const { data, error } = await supabase
        .rpc('create_shot_with_image', {
          p_project_id: projectId,
          p_shot_name: shotName,
          p_generation_id: generationId
        })
        .single();
      
      if (error) {
        console.error('[CreateShotWithImage] RPC Error:', error);
        throw error;
      }
      
      const typedData = data as CreateShotWithImageResponse;
      
      if (!typedData?.success) {
        throw new Error('Failed to create shot with image');
      }
      
      console.log('[CreateShotWithImage] Success:', typedData);
      return {
        shotId: typedData.shot_id,
        shotName: typedData.shot_name,
        shotGenerationId: typedData.shot_generation_id
      };
    },
    onSuccess: (data, variables) => {
      console.log('[CreateShotWithImage] Invalidating queries for project:', variables.projectId);
      
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: ['shots', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', variables.projectId] });
      
      if (data.shotId) {
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', data.shotId] });
      }
    },
    onError: (error: Error) => {
      console.error('[CreateShotWithImage] Error:', error);
      toast.error(`Failed to create shot with image: ${error.message}`);
    },
  });
};

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
          // 2a. Generate client-side thumbnail and upload both images
          console.log(`[ThumbnailGenDebug] Starting client-side thumbnail generation for ${imageFile.name} in useHandleExternalImageDrop`);
          let imageUrl = '';
          let thumbnailUrl = '';
          
          try {
            // Get current user ID for storage path
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) {
              throw new Error('User not authenticated');
            }
            const userId = session.user.id;

            // Generate thumbnail client-side
            const thumbnailResult = await generateClientThumbnail(imageFile, 300, 0.8);
            console.log(`[ThumbnailGenDebug] Generated thumbnail: ${thumbnailResult.thumbnailWidth}x${thumbnailResult.thumbnailHeight} (original: ${thumbnailResult.originalWidth}x${thumbnailResult.originalHeight})`);
            
            // Upload both main image and thumbnail
            const uploadResult = await uploadImageWithThumbnail(imageFile, thumbnailResult.thumbnailBlob, userId);
            imageUrl = uploadResult.imageUrl;
            thumbnailUrl = uploadResult.thumbnailUrl;
            
            console.log(`[ThumbnailGenDebug] Upload complete - Image: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
          } catch (thumbnailError) {
            console.warn(`[ThumbnailGenDebug] Client-side thumbnail generation failed for ${imageFile.name}:`, thumbnailError);
            // Fallback to original upload flow without thumbnail
            imageUrl = await uploadImageToStorage(imageFile);
            thumbnailUrl = imageUrl; // Use main image as fallback
          }
          
          if (!imageUrl) {
            toast.error(`Failed to upload image ${imageFile.name} to storage.`);
            continue; // Skip to next file
          }

          // 2b. Create a generation record for the uploaded image
          try {
            newGeneration = await createGenerationForUploadedImage(imageUrl, imageFile.name, imageFile.type, imageFile.size, projectIdForOperation, thumbnailUrl);
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
            thumbUrl: thumbnailUrl || newGeneration.location || undefined,
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