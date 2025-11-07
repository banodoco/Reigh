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
    mutationFn: async ({ name, projectId, aspectRatio, shouldSelectAfterCreation = true, position }: {
      name: string;
      projectId: string;
      aspectRatio?: string | null;
      shouldSelectAfterCreation?: boolean;
      position?: number;
    }) => {
      let resolvedPosition = position;

      if (resolvedPosition === undefined) {
        const { data: lastShot, error: lastShotError } = await supabase
          .from('shots')
          .select('position')
          .eq('project_id', projectId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle<{ position: number | null }>();

        if (lastShotError && lastShotError.code !== 'PGRST116') {
          throw lastShotError;
        }

        const lastPosition = lastShot?.position ?? 0;
        resolvedPosition = lastPosition + 1;
      }

      const { data, error } = await supabase
        .rpc('insert_shot_at_position', {
          p_project_id: projectId,
          p_shot_name: name,
          p_position: resolvedPosition,
        })
        .single();

      if (error) throw error;

      const result = data as { shot_id: string; success: boolean } | null;
      if (!result?.success || !result.shot_id) {
        throw new Error('Failed to create shot at position');
      }

      // Update shot with aspect ratio if provided
      if (aspectRatio) {
        const { error: updateError } = await supabase
          .from('shots')
          .update({ aspect_ratio: aspectRatio })
          .eq('id', result.shot_id);
        
        if (updateError) {
          console.error('Error updating shot aspect ratio:', updateError);
          // Don't throw - shot was created successfully, aspect ratio is optional
        }
      }

      const { data: shotData, error: fetchError } = await supabase
        .from('shots')
        .select()
        .eq('id', result.shot_id)
        .single();

      if (fetchError) throw fetchError;

      return { shot: shotData, shouldSelectAfterCreation };
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

      // Get the shot to duplicate (basic info only)
      const { data: originalShot, error: fetchError } = await supabase
        .from('shots')
        .select('id, name, position, project_id')
        .eq('id', shotId)
        .single();
      
      if (fetchError || !originalShot) throw new Error('Shot not found');
      
      // Create new shot at position right after the original
      const { shot: newShot } = (await createShot.mutateAsync({
        name: newName || originalShot.name + ' Copy',
        projectId: projectId,
        shouldSelectAfterCreation: false,
        position: ((originalShot as any).position || 0) + 1
      })) as any as { shot: Shot };
      
      // Use server-side function to copy shot_generations (no client data transfer!)
      console.log(`[DuplicateShot] 🚀 Calling server-side duplication function...`);
      const { data: stats, error: duplicateError } = await supabase
        .rpc('duplicate_shot_generations', {
          p_source_shot_id: shotId,
          p_target_shot_id: newShot.id
            });
          
      if (duplicateError) {
        console.error('[DuplicateShot] Server-side duplication failed:', duplicateError);
        throw duplicateError;
          }
      
      console.log(`[DuplicateShot] ✅ Duplication complete:`, {
        inserted: stats?.[0]?.inserted_count || 0,
        skipped_videos: stats?.[0]?.skipped_videos || 0,
        skipped_unpositioned: stats?.[0]?.skipped_unpositioned || 0
      });
      
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
        position: (completeShot as any).position || 1, // Include position field
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
      
      // Cancel all shots queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ['shots', projectId] });
      
      // Get data from the primary cache key used by ShotsContext (maxImagesPerShot: 0)
      const previousShots = queryClient.getQueryData<Shot[]>(['shots', projectId, 0]) || 
                           queryClient.getQueryData<Shot[]>(['shots', projectId]);

      // Create an optimistic shot for immediate UI feedback
      const originalShot = previousShots?.find(s => s.id === shotId);
      if (originalShot) {
        // Filter to only include positioned non-video images (matching the actual duplication logic)
        const positionedNonVideoImages = originalShot.images.filter(img => {
          const isVideo = img.type === 'video_travel_output' || 
                         (img.location && img.location.endsWith('.mp4')) ||
                         (img.imageUrl && img.imageUrl.endsWith('.mp4'));
          const hasTimelineFrame = (img as any).timeline_frame !== null && (img as any).timeline_frame !== undefined;
          return !isVideo && hasTimelineFrame;
        });
        
        const optimisticDuplicatedShot: Shot = {
          id: `optimistic-duplicate-${Date.now()}`,
          name: newName || `${originalShot.name} (Copy)`,
          created_at: new Date().toISOString(),
          images: positionedNonVideoImages, // Only copy positioned non-video images for optimistic update
          project_id: projectId,
          position: ((originalShot as any).position || 0) + 1, // Position after the original shot
        };

        const applyOptimisticUpdate = (oldShots: Shot[] = []) => {
          // Insert the duplicate at the correct position in the ordered list
          // Since shots are ordered by position (ascending), find the insertion point
          const insertionIndex = oldShots.findIndex(shot => 
            shot.position > ((originalShot as any).position || 0)
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
        };
        
        // Update all cache key variants
        queryClient.setQueryData<Shot[]>(['shots', projectId, 0], applyOptimisticUpdate);
        queryClient.setQueryData<Shot[]>(['shots', projectId, 5], applyOptimisticUpdate);
        queryClient.setQueryData<Shot[]>(['shots', projectId], applyOptimisticUpdate);
      }

      return { previousShots, projectId };
    },
    onSuccess: (newShot, { projectId }) => {
      if (projectId) {
        // Update all shot cache variants (with different maxImagesPerShot values)
        // This ensures ShotsContext and other consumers get updated
        const updateShotCache = (oldShots: Shot[] = []) => {
          // Remove ALL optimistic shots (in case there are multiple)
          const shotsWithoutOptimistic = oldShots.filter(shot => 
            !shot.id.startsWith('optimistic-duplicate-') && 
            !shot.id.startsWith('optimistic-')
          );
          
          // Insert the new shot at the correct position based on its position value
          const newShotPosition = (newShot as any).position || 0;
          const insertionIndex = shotsWithoutOptimistic.findIndex(shot => 
            (shot.position || 0) > newShotPosition
          );
          
          if (insertionIndex === -1) {
            // No shots with higher position found, append at end
            return [...shotsWithoutOptimistic, newShot];
          } else {
            // Insert at the correct position
            const updatedShots = [...shotsWithoutOptimistic];
            updatedShots.splice(insertionIndex, 0, newShot);
            return updatedShots;
          }
        };
        
        // Update all common cache key variants to prevent context errors
        queryClient.setQueryData<Shot[]>(['shots', projectId, 0], updateShotCache);
        queryClient.setQueryData<Shot[]>(['shots', projectId, 5], updateShotCache);
        queryClient.setQueryData<Shot[]>(['shots', projectId], updateShotCache);
        
        // Also ensure the shot is properly cached individually
        queryClient.setQueryData(['shot', newShot.id], newShot);
        
        // Emit event for UI to react (switch to Newest First, scroll, highlight)
        // Do this in a microtask to ensure cache updates are complete
        Promise.resolve().then(() => {
          window.dispatchEvent(new CustomEvent('shot-duplicated', {
            detail: { shotId: newShot.id, shotName: newShot.name }
          }));
        });
        
        // Invalidate after a delay to allow UI to update first
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
        }, 100);
      }
    },
    onError: (err, { projectId }, context) => {
      console.error('Optimistic update failed, rolling back for duplicateShot:', err);
      if (context?.previousShots && projectId) {
        // Rollback all cache key variants
        queryClient.setQueryData<Shot[]>(['shots', projectId, 0], context.previousShots);
        queryClient.setQueryData<Shot[]>(['shots', projectId, 5], context.previousShots);
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
        .order('position', { ascending: true }); // This is shots.position, not shot_generations.position
      
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
            generation:generations!inner(
              id,
              location,
              type,
              created_at
            )
          `)
          .eq('shot_id', shot.id)
          .not('generation.type', 'eq', 'video')
          .order('timeline_frame', { ascending: true })
          .order('created_at', { ascending: false });
        
        // Only apply limit if specified (allows unlimited when needed)
        if (maxImagesPerShot > 0) {
          query = query.limit(maxImagesPerShot);
        }
        
        const { data: shotGenerations, error: sgError } = await query;
        
        if (sgError) {
          console.error('[ShotImageDebug] Error loading shot generations:', sgError, { shotId: shot.id });
          throw sgError;
        }
        
        console.log('[ShotImageDebug] Loaded shot generations:', {
          shotId: shot.id.substring(0, 8),
          shotName: shot.name,
          generationsCount: shotGenerations?.length || 0,
          sampleGenerations: shotGenerations?.slice(0, 3).map(sg => ({
            id: sg.generation?.id?.substring(0, 8),
            type: sg.generation?.type,
            timeline_frame: sg.timeline_frame,
            hasLocation: !!sg.generation?.location,
            location: sg.generation?.location?.substring(0, 60) + '...'
          }))
        });
        
        const transformedImages = (shotGenerations || [])
          .filter(sg => sg.generation) // Filter out any null generations
          .map(sg => ({
            ...sg.generation,
            shotImageEntryId: sg.id,
            imageUrl: (sg.generation as any).location,
            thumbUrl: (sg.generation as any).location,
            timeline_frame: sg.timeline_frame, // Include timeline_frame for filtering and ordering
          }));
        
        console.log('[ShotImageDebug] Transformed images for shot:', {
          shotId: shot.id.substring(0, 8),
          shotName: shot.name,
          transformedImagesCount: transformedImages.length,
          sampleTransformed: transformedImages.slice(0, 2).map(img => ({
            shotImageEntryId: img.shotImageEntryId,
            hasImageUrl: !!img.imageUrl,
            hasThumbUrl: !!img.thumbUrl,
            timeline_frame: img.timeline_frame,
            type: img.type
          }))
        });
        
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
        console.log(`[ShotReorderDebug] Shot ${index}: ${shot.name} (ID: ${shot.id.substring(0, 8)}) - Position: ${(shot as any).position}`);
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
          .update({ position } as any)
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
type ShotImageResponse = Database['public']['Tables']['shot_generations']['Row'];

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
    mutationFn: async ({ shot_id, generation_id, imageUrl, thumbUrl, project_id, timelineFrame }: { 
      shot_id: string; 
      generation_id: string; 
      imageUrl?: string;
      thumbUrl?: string;
      project_id: string;
      timelineFrame?: number;
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

      // First create generation if imageUrl is provided and generation_id is empty/missing
      // This must happen BEFORE we query shot_generations to avoid UUID errors
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

      // Now check what currently exists for this shot-generation combo
      // This happens AFTER generation creation to ensure we have a valid UUID
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

      // If explicit timeline_frame was provided, update it
      if (timelineFrame !== undefined && shotGeneration) {
        console.log('[ApplySettings] Setting explicit timeline_frame:', {
          shotGenerationId: (shotGeneration as any).id,
          timelineFrame
        });
        
        const { error: updateError } = await supabase
          .from('shot_generations')
          .update({ timeline_frame: timelineFrame })
          .eq('id', (shotGeneration as any).id);
        
        if (updateError) {
          console.error('[ApplySettings] Error setting timeline_frame:', updateError);
        } else {
          console.log('[ApplySettings] Successfully set timeline_frame to:', timelineFrame);
        }
      }

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
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', project_id] });
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shot_id] });

        // STAGE 2 ENHANCEMENT: Emit custom event so VideoTravelToolPage can detect external mutations
        // This handles the case where GenerationsPane adds an image while user is viewing the shot
        console.log('[OperationTracking] Emitting shot-mutation-complete event:', { shotId: shot_id.substring(0, 8), type: 'add' });
        window.dispatchEvent(new CustomEvent('shot-mutation-complete', { 
          detail: { shotId: shot_id, mutationType: 'add' } 
        }));

        // FIX: Re-enable shot-specific invalidation with minimal delay for React batch updates
        // Query is now disabled during operations via disableRefetch flag in VideoTravelToolPage
        // This prevents both "signal is aborted" errors AND unexpected position resets
        // 100ms is enough for React's automatic batching without user-perceivable lag
        console.log('[PositionFix] ✅ Scheduling shot-specific query invalidation after add operation (100ms delay)');
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shot_id] });
        }, 100); // 100ms delay for React batch updates, query disabled separately
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
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', project_id] });
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shot_id] });

        // STAGE 2 ENHANCEMENT: Emit custom event for external mutations
        console.log('[OperationTracking] Emitting shot-mutation-complete event:', { shotId: shot_id.substring(0, 8), type: 'add-without-position' });
        window.dispatchEvent(new CustomEvent('shot-mutation-complete', { 
          detail: { shotId: shot_id, mutationType: 'add-without-position' } 
        }));

        // FIX: Re-enable shot-specific invalidation with minimal delay for React batch updates
        console.log('[PositionFix] ✅ Scheduling shot-specific query invalidation after add without position operation (100ms delay)');
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shot_id] });
        }, 100);
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
        // CRITICAL: Invalidate queries for immediate UI updates
        queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', project_id] });
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shot_id] });
        
        // STAGE 2 ENHANCEMENT: Emit custom event for external mutations
        console.log('[OperationTracking] Emitting shot-mutation-complete event:', { shotId: shot_id.substring(0, 8), type: 'position-existing' });
        window.dispatchEvent(new CustomEvent('shot-mutation-complete', { 
          detail: { shotId: shot_id, mutationType: 'position-existing' } 
        }));
        
        // FIX: Re-enable shot-specific invalidation with minimal delay
        console.log('[PositionFix] ✅ Scheduling shot-specific query invalidation after position existing operation (100ms delay)');
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shot_id] });
        }, 100);
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
      
      console.log('[DUPLICATE_DEBUG] 📊 ALL IMAGES FROM DATABASE:', {
        shot_id: shot_id.substring(0, 8),
        generation_id: generation_id.substring(0, 8),
        totalImages: allImages?.length || 0,
        allImages: allImages?.map(img => ({
          id: img.id.substring(0, 8),
          generation_id: img.generation_id.substring(0, 8),
          timeline_frame: img.timeline_frame
        })) || []
      });
      
      // Find the original image and the next image to calculate midpoint
      const originalImage = allImages?.find(img => img.generation_id === generation_id);
      if (!originalImage) throw new Error('Original image not found');
      
      console.log('[DUPLICATE_DEBUG] 🚨 UI vs DATABASE COMPARISON:', {
        generation_id: generation_id.substring(0, 8),
        database_timeline_frame: originalImage.timeline_frame,
        note: 'This should match the timeline_frame_from_button in previous logs',
        warning: 'If these don\'t match, there\'s a UI sync issue'
      });
      
      console.log('[DUPLICATE_DEBUG] 🎯 FOUND ORIGINAL IMAGE:', {
        originalImage: {
          id: originalImage.id.substring(0, 8),
          generation_id: originalImage.generation_id.substring(0, 8),
          timeline_frame: originalImage.timeline_frame
        }
      });
      
      // Find the next image by timeline_frame order (not position order)
      const originalFrameValue = originalImage.timeline_frame || 0;
      
      // Sort all images by timeline_frame to find the actual next image in timeline order
      const sortedByTimelineFrame = allImages
        ?.filter(img => img.timeline_frame !== null && img.timeline_frame !== undefined)
        .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0)) || [];
      
      // Check for duplicate timeline_frame values (this indicates previous duplication bugs)
      const timelineFrameCounts = {};
      sortedByTimelineFrame.forEach(img => {
        const frame = img.timeline_frame;
        timelineFrameCounts[frame] = (timelineFrameCounts[frame] || 0) + 1;
      });
      
      const duplicateFrames = Object.entries(timelineFrameCounts)
        .filter(([frame, count]) => (count as number) > 1)
        .map(([frame, count]) => ({ frame: parseInt(frame), count: count as number }));

      console.log('[DUPLICATE_DEBUG] 📋 SORTED BY TIMELINE_FRAME:', {
        sortedImages: sortedByTimelineFrame.map((img, index) => ({
          index,
          id: img.id.substring(0, 8),
          generation_id: img.generation_id.substring(0, 8),
          timeline_frame: img.timeline_frame,
          isOriginal: img.id === originalImage.id
        })),
        duplicateFrames: duplicateFrames.length > 0 ? duplicateFrames : 'none',
        warning: duplicateFrames.length > 0 ? 'DUPLICATE_TIMELINE_FRAMES_DETECTED!' : 'all_frames_unique'
      });
      
      // Find the next image after the original in timeline order with a DIFFERENT timeline_frame
      const originalIndex = sortedByTimelineFrame.findIndex(img => img.id === originalImage.id);
      
      // Look for the next image with a different timeline_frame value
      let nextImageInTimeline = null;
      for (let i = originalIndex + 1; i < sortedByTimelineFrame.length; i++) {
        const candidate = sortedByTimelineFrame[i];
        if (candidate.timeline_frame !== originalFrameValue) {
          nextImageInTimeline = candidate;
          break;
        }
      }
      
      console.log('[DUPLICATE_DEBUG] 🔍 NEXT IMAGE SEARCH:', {
        originalIndex,
        totalSortedImages: sortedByTimelineFrame.length,
        hasNextImage: !!nextImageInTimeline,
        nextImageInTimeline: nextImageInTimeline ? {
          id: nextImageInTimeline.id.substring(0, 8),
          generation_id: nextImageInTimeline.generation_id.substring(0, 8),
          timeline_frame: nextImageInTimeline.timeline_frame
        } : null,
        isLastImage: originalIndex === sortedByTimelineFrame.length - 1
      });
        
      // If we're at the end of the timeline, there's no next image
      // The duplicate should go after the original with default spacing
      
      // Calculate timeline frame as midpoint
      const nextFrame = nextImageInTimeline 
        ? nextImageInTimeline.timeline_frame  // Use the actual timeline_frame value
        : (originalFrameValue + 60); // Default spacing if no next image
      const duplicateTimelineFrame = Math.floor((originalFrameValue + nextFrame) / 2);
      
      console.log('[DUPLICATE_DEBUG] 🔧 FRAME CALCULATION DEBUG:', {
        hasNextImage: !!nextImageInTimeline,
        nextImageTimelineFrame: nextImageInTimeline?.timeline_frame,
        nextFrameUsed: nextFrame,
        originalFrame: originalFrameValue,
        calculatedMidpoint: duplicateTimelineFrame,
        issue: nextFrame === originalFrameValue ? 'NEXT_FRAME_EQUALS_ORIGINAL!' : 'OK'
      });
      
      console.log('[DUPLICATE_DEBUG] 🧮 TIMELINE FRAME CALCULATION:', {
        originalFrame: originalFrameValue,
        nextFrame,
        duplicateTimelineFrame,
        calculationMethod: nextImageInTimeline ? 'midpoint_between_images' : 'default_spacing_after_last',
        midpointFormula: `Math.floor((${originalFrameValue} + ${nextFrame}) / 2) = ${duplicateTimelineFrame}`,
        nextImageInTimeline: nextImageInTimeline ? {
          id: nextImageInTimeline.id.substring(0, 8),
          timeline_frame: nextImageInTimeline.timeline_frame
        } : 'none',
        totalImagesInTimeline: sortedByTimelineFrame.length,
        originalIndexInTimeline: originalIndex
      });
      
      // Step 1: Get the original generation data to duplicate
      console.log('[DUPLICATE_DEBUG] 🔍 FETCHING ORIGINAL GENERATION DATA:', {
        generation_id: generation_id.substring(0, 8)
      });
      
      const { data: originalGeneration, error: fetchGenError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', generation_id)
        .single();
      
      if (fetchGenError || !originalGeneration) {
        throw new Error('Failed to fetch original generation for duplication');
      }
      
      console.log('[DUPLICATE_DEBUG] 📄 ORIGINAL GENERATION DATA:', {
        id: originalGeneration.id.substring(0, 8),
        location: originalGeneration.location?.substring(0, 50) + '...',
        type: originalGeneration.type,
        project_id: originalGeneration.project_id?.substring(0, 8)
      });
      
      // Step 2: Create a new generation record (duplicate the image)
      console.log('[DUPLICATE_DEBUG] 🆕 CREATING NEW GENERATION RECORD:', {
        duplicating_from: originalGeneration.id.substring(0, 8),
        timeline_frame: duplicateTimelineFrame
      });
      
      const { data: newGeneration, error: createGenError } = await supabase
        .from('generations')
        .insert({
          location: originalGeneration.location,
          thumbnail_url: originalGeneration.thumbnail_url,
          type: originalGeneration.type,
          project_id: originalGeneration.project_id,
          params: {
            ...(originalGeneration.params as Record<string, any> || {}),
            duplicated_from: originalGeneration.id,
            duplicate_source: 'timeline_duplicate_button',
            original_timeline_frame: originalFrameValue
          } as any
        })
        .select()
        .single();
      
      if (createGenError || !newGeneration) {
        throw new Error('Failed to create new generation for duplicate');
      }
      
      console.log('[DUPLICATE_DEBUG] ✅ NEW GENERATION CREATED:', {
        new_generation_id: newGeneration.id.substring(0, 8),
        original_generation_id: generation_id.substring(0, 8)
      });
      
      // Step 3: Create shot_generations entry pointing to the NEW generation
      console.log('[DUPLICATE_DEBUG] 💾 INSERTING INTO DATABASE:', {
        shot_id: shot_id.substring(0, 8),
        new_generation_id: newGeneration.id.substring(0, 8),
        timeline_frame: duplicateTimelineFrame,
        originalImageShouldRemainAt: originalFrameValue,
        warning: 'ORIGINAL_IMAGE_SHOULD_NOT_MOVE'
      });
      
      const { data: newShotGeneration, error: insertError } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id: newGeneration.id, // ✅ NOW USING THE NEW GENERATION ID!
          timeline_frame: duplicateTimelineFrame,
          metadata: {
            duplicated_from: originalImage.id,
            original_timeline_frame: originalFrameValue,
            calculated_midpoint: duplicateTimelineFrame,
            original_generation_id: generation_id
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
            
            // Get timeline_frame from the original image
            const originalTimelineFrame = (genToDuplicate as any).timeline_frame || 0;
            
            console.log('[DUPLICATE] Found generation to duplicate', {
              genToDuplicate: genToDuplicate.shotImageEntryId,
              originalTimelineFrame
            });

            console.log('[DUPLICATE_DEBUG] 🎯 OPTIMISTIC UPDATE - Starting calculation:', {
              shot_id: shot_id.substring(0, 8),
              generation_id: generation_id.substring(0, 8),
              originalTimelineFrame,
              totalImagesInShot: shot.images.length
            });

            // Calculate the duplicate's timeline_frame (same logic as in mutationFn)
            // Find all images sorted by timeline_frame
            const sortedByTimelineFrame = shot.images
              .filter(img => (img as any).timeline_frame !== null && (img as any).timeline_frame !== undefined)
              .sort((a, b) => ((a as any).timeline_frame || 0) - ((b as any).timeline_frame || 0));
            
            console.log('[DUPLICATE_DEBUG] 📋 OPTIMISTIC - SORTED BY TIMELINE_FRAME:', {
              sortedImages: sortedByTimelineFrame.map((img, index) => ({
                index,
                shotImageEntryId: img.shotImageEntryId.substring(0, 8),
                id: img.id.substring(0, 8),
                timeline_frame: (img as any).timeline_frame,
                isOriginal: img.id === generation_id
              }))
            });
            
            // Find the next image after the original in timeline order with a DIFFERENT timeline_frame
            const originalIndex = sortedByTimelineFrame.findIndex(img => img.id === generation_id);
            
            // Look for the next image with a different timeline_frame value
            let nextImageInTimeline = null;
            for (let i = originalIndex + 1; i < sortedByTimelineFrame.length; i++) {
              const candidate = sortedByTimelineFrame[i];
              if ((candidate as any).timeline_frame !== originalTimelineFrame) {
                nextImageInTimeline = candidate;
                break;
              }
            }
            
            console.log('[DUPLICATE_DEBUG] 🔍 OPTIMISTIC - NEXT IMAGE SEARCH:', {
              originalIndex,
              totalSortedImages: sortedByTimelineFrame.length,
              hasNextImage: !!nextImageInTimeline,
              nextImageInTimeline: nextImageInTimeline ? {
                shotImageEntryId: nextImageInTimeline.shotImageEntryId.substring(0, 8),
                id: nextImageInTimeline.id.substring(0, 8),
                timeline_frame: (nextImageInTimeline as any).timeline_frame
              } : null,
              isLastImage: originalIndex === sortedByTimelineFrame.length - 1
            });
            
            // Calculate timeline frame as midpoint
            const nextFrame = nextImageInTimeline 
              ? (nextImageInTimeline as any).timeline_frame  // Use the actual timeline_frame value
              : (originalTimelineFrame + 60); // Default spacing if no next image
            const duplicateTimelineFrame = Math.floor((originalTimelineFrame + nextFrame) / 2);
            
            console.log('[DUPLICATE_DEBUG] 🔧 OPTIMISTIC - FRAME CALCULATION DEBUG:', {
              hasNextImage: !!nextImageInTimeline,
              nextImageTimelineFrame: nextImageInTimeline ? (nextImageInTimeline as any).timeline_frame : null,
              nextFrameUsed: nextFrame,
              originalTimelineFrame,
              calculatedMidpoint: duplicateTimelineFrame,
              issue: nextFrame === originalTimelineFrame ? 'NEXT_FRAME_EQUALS_ORIGINAL!' : 'OK'
            });

            console.log('[DUPLICATE_DEBUG] 🧮 OPTIMISTIC - TIMELINE FRAME CALCULATION:', {
              originalTimelineFrame,
              nextFrame,
              duplicateTimelineFrame,
              calculationMethod: nextImageInTimeline ? 'midpoint_between_images' : 'default_spacing_after_last',
              midpointFormula: `Math.floor((${originalTimelineFrame} + ${nextFrame}) / 2) = ${duplicateTimelineFrame}`
            });

            // Create a new shot generation entry with timeline_frame
            const duplicatedImage = {
              ...genToDuplicate,
              shotImageEntryId: `temp-${Date.now()}`, // Temporary ID for optimistic update
              shot_generation_id: `temp-${Date.now()}`,
              timeline_frame: duplicateTimelineFrame
            };
            
            console.log('[DUPLICATE_DEBUG] ✅ OPTIMISTIC - Created duplicate image:', {
              originalTimelineFrame,
              nextFrame,
              duplicateTimelineFrame,
              duplicatedImageId: duplicatedImage.shotImageEntryId,
              nextImageInTimeline: nextImageInTimeline ? (nextImageInTimeline as any).timeline_frame : 'none'
            });

            // Simply add the duplicate to the images array - no position shifting needed
            // The timeline will sort by timeline_frame automatically
            const updatedImages = [...shot.images, duplicatedImage];
            
            console.log('[DUPLICATE] Added duplicate image', {
              imageCount: updatedImages.length,
              duplicateTimelineFrame
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
      // Also invalidate unpositioned-count in case duplication affects positions
      queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shot_id] });

      // FIX: Re-enable shot-specific invalidation with minimal delay for React batch updates
      console.log('[PositionFix] ✅ Scheduling shot-specific query invalidation after duplicate operation (100ms delay)');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shot_id] });
      }, 100);
    }
  });
};

// Type for the arguments of useRemoveImageFromShot mutation
interface RemoveImageFromShotArgs {
  shot_id: string;
  shotImageEntryId: string; // Changed from generation_id
  project_id?: string | null;
}

// Remove an image from a shot's timeline VIA API
// NOTE: This sets timeline_frame to null rather than deleting the shot_generations record,
// effectively removing it from the timeline while preserving the generation association
export const useRemoveImageFromShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ shot_id, shotImageEntryId, project_id }: { shot_id: string; shotImageEntryId: string; project_id?: string | null }) => {
      // Instead of deleting, just remove the timeline_frame to unlink from timeline
      const { error } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: null })
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
        // Ensure unpositioned-count updates after deletion
        queryClient.invalidateQueries({ queryKey: ['unpositioned-count', variables.shot_id] });

        // FIX: Re-enable shot-specific invalidation with minimal delay for React batch updates
        console.log('[PositionFix] ✅ Scheduling shot-specific query invalidation after remove operation (100ms delay)');
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', variables.shot_id] });
        }, 100);
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
      // Immediately invalidate cache to update UI
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      // Also invalidate unified generations cache
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', projectId] });
      // Invalidate project-video-counts since deleting a shot affects counts
      queryClient.invalidateQueries({ queryKey: ['project-video-counts', projectId] });
      
      console.log('[DeleteShot] Invalidated query cache for immediate UI update', { projectId, shotId });
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
// 🚨 DISABLED: This function was overwriting user drag positions with index-based spacing
// Only use for non-drag operations like bulk reorder from ShotsPane
export const useUpdateShotImageOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shotId, orderedShotGenerationIds, projectId }: { shotId: string; orderedShotGenerationIds: string[]; projectId: string }) => {
      console.log('[TimelineDragFix] 🚨 BLOCKED: useUpdateShotImageOrder called - this would overwrite drag positions');
      throw new Error('useUpdateShotImageOrder is disabled to prevent overwriting drag positions. Use timeline drag instead.');

      // OLD CODE - DISABLED TO PREVENT DRAG POSITION OVERWRITES:
      // const updates = orderedShotGenerationIds.map((id, index) =>
      //   supabase
      //     .from('shot_generations')
      //     .update({ timeline_frame: index * 50 })
      //     .eq('id', id)
      //     .eq('shot_id', shotId)
      // );
      // const results = await Promise.all(updates);
      // const error = results.find(r => r.error)?.error;
      // if (error) throw error;
      // return { message: 'Image order updated successfully' };
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

        // FIX: Re-enable shot-specific invalidation with minimal delay for React batch updates
        console.log('[PositionFix] ✅ Scheduling shot-specific query invalidation after create operation (100ms delay)');
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
        }, 100);
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
        // FIX: Re-enable shot-specific invalidation with minimal delay for React batch updates
        console.log('[PositionFix] ✅ Scheduling shot-specific query invalidation after create shot with image operation (100ms delay)');
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', data.shotId] });
        }, 100);
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
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  // IMPORTANT: This hook needs access to the current project_id.
  // This should ideally come from a context, e.g., useProject().
  // For now, I'll assume it's passed as an argument or a higher-level component handles it.
  // Let's modify it to accept projectId.

  const mutation = useMutation({
    mutationFn: async (variables: {
        imageFiles: File[], 
        targetShotId: string | null, 
        currentProjectQueryKey: string | null,
        currentShotCount: number,
        skipAutoPosition?: boolean, // NEW: Flag to skip auto-positioning for timeline uploads
        onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void // NEW: Progress callback
    }) => {
    const { imageFiles, targetShotId, currentProjectQueryKey, currentShotCount, skipAutoPosition, onProgress } = variables;
    
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
      for (let fileIndex = 0; fileIndex < imageFiles.length; fileIndex++) {
        const imageFile = imageFiles[fileIndex];
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
            
            // Upload both main image and thumbnail (with progress tracking)
            const uploadResult = await uploadImageWithThumbnail(
              imageFile, 
              thumbnailResult.thumbnailBlob, 
              userId,
              onProgress ? (progress) => {
                // Calculate overall progress: each file is 1/totalFiles of the overall progress
                const overallProgress = Math.round(((fileIndex + (progress / 100)) / imageFiles.length) * 100);
                onProgress(fileIndex, progress, overallProgress);
              } : undefined
            );
            imageUrl = uploadResult.imageUrl;
            thumbnailUrl = uploadResult.thumbnailUrl;
            
            console.log(`[ThumbnailGenDebug] Upload complete - Image: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
          } catch (thumbnailError) {
            console.warn(`[ThumbnailGenDebug] Client-side thumbnail generation failed for ${imageFile.name}:`, thumbnailError);
            // Fallback to original upload flow without thumbnail (with progress tracking)
            imageUrl = await uploadImageToStorage(
              imageFile,
              3, // maxRetries
              onProgress ? (progress) => {
                const overallProgress = Math.round(((fileIndex + (progress / 100)) / imageFiles.length) * 100);
                onProgress(fileIndex, progress, overallProgress);
              } : undefined
            );
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
          // Use different mutation based on skipAutoPosition flag
          if (skipAutoPosition) {
            // For timeline uploads: create without auto-positioning so caller can set position
            await addImageToShotWithoutPositionMutation.mutateAsync({
              shot_id: shotId,
              generation_id: newGeneration.id as string,
              project_id: projectIdForOperation,
              imageUrl: newGeneration.location || undefined,
              thumbUrl: thumbnailUrl || newGeneration.location || undefined,
            });
          } else {
            // For normal uploads: use default auto-positioning behavior
            await addImageToShotMutation.mutateAsync({
              shot_id: shotId,
              generation_id: newGeneration.id as string,
              project_id: projectIdForOperation,
              imageUrl: newGeneration.location || undefined,
              thumbUrl: thumbnailUrl || newGeneration.location || undefined,
            });
          }
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