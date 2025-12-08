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
import { cropImageToProjectAspectRatio } from '@/shared/lib/imageCropper';
import { parseRatio } from '@/shared/lib/aspectRatios';

// Define the type for the new shot data returned by Supabase
// This should align with your 'shots' table structure from `supabase/types.ts`
type ShotResponse = Database['public']['Tables']['shots']['Row'];

// Add this new type definition near the top, after other type definitions
export interface ShotGenerationRow {
  id: string;
  generation_id: string;
  timeline_frame: number;
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

      // Ensure the returned shot matches the Shot interface by adding the empty images array
      return { shot: { ...shotData, images: [] }, shouldSelectAfterCreation };
    },
    onSuccess: (result, variables) => {
      // Manually update cache for immediate UI feedback (don't wait for realtime events)
      if (variables.projectId && result.shot) {
        const newShot = result.shot;
        
        const updateShotCache = (oldShots: Shot[] = []) => {
          // Check if shot already exists (from realtime or previous update)
          if (oldShots.some(shot => shot.id === newShot.id)) {
            return oldShots;
          }
          
          // Insert the new shot at the correct position based on its position value
          const newShotPosition = (newShot as any).position || 0;
          const insertionIndex = oldShots.findIndex(shot => 
            (shot.position || 0) > newShotPosition
          );
          
          if (insertionIndex === -1) {
            // No shots with higher position found, append at end
            return [...oldShots, newShot];
          } else {
            // Insert at the correct position
            const updatedShots = [...oldShots];
            updatedShots.splice(insertionIndex, 0, newShot);
            return updatedShots;
          }
        };
        
        // Update all common cache key variants to prevent context errors
        queryClient.setQueryData<Shot[]>(['shots', variables.projectId, 0], updateShotCache);
        queryClient.setQueryData<Shot[]>(['shots', variables.projectId, 5], updateShotCache);
        queryClient.setQueryData<Shot[]>(['shots', variables.projectId], updateShotCache);
        
        // Also ensure the shot is properly cached individually
        queryClient.setQueryData(['shot', newShot.id], newShot);
        
        console.log('[useCreateShot] ✅ Manually updated cache for immediate UI feedback');
      }
      
      // Realtime events will also update the cache, but this ensures immediate feedback
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
  projectId: string;
}
export const useDuplicateShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ shotId, projectId }: DuplicateShotArgs) => {
      // Call database function to duplicate shot
      const { data, error } = await supabase.rpc('duplicate_shot', {
        original_shot_id: shotId,
        project_id: projectId
      });
      
      if (error) throw error;
      
      const newShotId = data;
      
      // Fetch the new shot data to return
      const { data: shotData, error: fetchError } = await supabase
          .from('shots')
        .select()
        .eq('id', newShotId)
        .single();
        
      if (fetchError) throw fetchError;
      
      return shotData;
    },
    onSuccess: (data, variables) => {
      toast.success('Shot duplicated successfully');
      // Invalidate queries to refresh list
      queryClient.invalidateQueries({ queryKey: ['shots', variables.projectId] });
    },
    onError: (error) => {
      console.error('Error duplicating shot:', error);
      toast.error(`Failed to duplicate shot: ${error.message}`);
    }
  });
};

// Delete a shot
export const useDeleteShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ shotId, projectId }: { shotId: string; projectId: string }) => {
      const { error } = await supabase
        .from('shots')
        .delete()
        .eq('id', shotId);

      if (error) throw error;
      return { shotId, projectId };
    },
    onSuccess: ({ projectId }) => {
      toast.success('Shot deleted successfully');
      // Invalidate queries to refresh list
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      // Also invalidate shot-specific queries
      queryClient.invalidateQueries({ queryKey: ['all-shot-generations'] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta'] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
    },
    onError: (error) => {
      console.error('Error deleting shot:', error);
      toast.error(`Failed to delete shot: ${error.message}`);
    }
  });
};

// Reorder shots by updating their positions
export const useReorderShots = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      projectId, 
      shotOrders 
    }: { 
      projectId: string; 
      shotOrders: Array<{ shotId: string; position: number }> 
    }) => {
      // Update each shot's position
      const promises = shotOrders.map(({ shotId, position }) =>
        supabase
          .from('shots')
          .update({ position })
          .eq('id', shotId)
          .eq('project_id', projectId) // Extra safety check
      );

      const results = await Promise.all(promises);
      
      // Check for any errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        const errorMessages = errors.map(e => e.error?.message).join(', ');
        throw new Error(`Failed to update some shot positions: ${errorMessages}`);
      }

      return { projectId, shotOrders };
    },
    onMutate: async (variables) => {
      const { projectId } = variables;
      
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['shots', projectId] });
      
      // Get previous shots data for rollback
      const previousShots = queryClient.getQueryData<Shot[]>(['shots', projectId]);
      
      // Optimistically update shots with new positions
      if (previousShots) {
        const updatedShots = previousShots.map(shot => {
          const order = variables.shotOrders.find(o => o.shotId === shot.id);
          if (order) {
            return { ...shot, position: order.position };
          }
          return shot;
        });
        
        // Sort by new positions
        updatedShots.sort((a, b) => (a.position || 0) - (b.position || 0));
        
        // Update all cache variants
        const shotsCacheKeys = [
          ['shots', projectId],
          ['shots', projectId, 0],
          ['shots', projectId, 2],
          ['shots', projectId, 5],
        ];
        shotsCacheKeys.forEach(cacheKey => {
          queryClient.setQueryData(cacheKey, updatedShots);
        });
      }
      
      return { previousShots, projectId };
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates on error
      if (context?.previousShots && context.projectId) {
        const shotsCacheKeys = [
          ['shots', context.projectId],
          ['shots', context.projectId, 0],
          ['shots', context.projectId, 2],
          ['shots', context.projectId, 5],
        ];
        shotsCacheKeys.forEach(cacheKey => {
          queryClient.setQueryData(cacheKey, context.previousShots);
        });
      }
      console.error('Error reordering shots:', error);
      toast.error(`Failed to reorder shots: ${error.message}`);
    },
    onSuccess: ({ projectId }) => {
      // Invalidate queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    }
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
      
      // Fetch images for each shot individually, batched to avoid overwhelming the database
      // This avoids hitting Supabase's 1000 row limit and allows per-shot limiting at DB level
      const BATCH_SIZE = 10; // Process 10 shots at a time to avoid connection limits
      const imagesPerShot: { shotId: string; images: GenerationRow[] }[] = [];
      
      // Process shots in batches
      for (let i = 0; i < shots.length; i += BATCH_SIZE) {
        const batch = shots.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (shot) => {
          // Build query for this shot's images
          let query = supabase
            .from('shot_generations')
            .select(`
              id,
              shot_id,
              timeline_frame,
              generation_id,
              generations (
                id,
                location,
                thumbnail_url,
                type,
                created_at,
                starred,
                name,
                based_on,
                params
              )
            `)
            .eq('shot_id', shot.id)
            .order('timeline_frame', { ascending: true, nullsFirst: false });
          
          // Apply limit at database level if specified (more efficient than fetching all and slicing)
          if (maxImagesPerShot > 0) {
            query = query.limit(maxImagesPerShot);
          }
          
          const { data: shotGenerations, error: sgError } = await query;
          
          if (sgError) {
            console.error(`Error fetching generations for shot ${shot.id}:`, sgError);
            return { shotId: shot.id, images: [] };
          }
          
          // Transform to GenerationRow format
          const images: GenerationRow[] = (shotGenerations || [])
            .filter((sg: any) => sg.generations)
            .map((sg: any) => {
              const gen = sg.generations;
              return {
                id: sg.id, // shot_generations.id - unique per entry in shot
                generation_id: gen.id, // generations.id - the actual generation
                shotImageEntryId: sg.id, // Deprecated (kept for backwards compat)
                imageUrl: gen.location,
                thumbUrl: gen.thumbnail_url || gen.location,
                type: gen.type || 'image',
                createdAt: gen.created_at,
                starred: gen.starred || false,
                name: gen.name,
                based_on: gen.based_on,
                params: gen.params,
                timeline_frame: sg.timeline_frame,
              } as GenerationRow;
            });
          
          return { shotId: shot.id, images };
          })
        );
        imagesPerShot.push(...batchResults);
      }
      
      // Build lookup map
      const imagesByShot: Record<string, GenerationRow[]> = {};
      imagesPerShot.forEach(({ shotId, images }) => {
        imagesByShot[shotId] = images;
      });
      
      // Attach images to shots
      return shots.map(shot => ({
        ...shot,
        images: imagesByShot[shot.id] || []
      }));
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Keep previous data while fetching new data to prevent flashing
    placeholderData: (previousData) => previousData,
  });
};

// Update shot name
export const useUpdateShotName = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shotId, name, newName, projectId }: { shotId: string; name?: string; newName?: string; projectId: string }) => {
      // Support both 'name' and 'newName' for backward compatibility
      const shotName = newName || name;
      if (!shotName) {
        throw new Error('Shot name is required');
      }

      const { error } = await supabase
          .from('shots')
        .update({ name: shotName })
        .eq('id', shotId);

      if (error) throw error;
      return { shotId, name: shotName, projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    },
    onError: (error) => {
      console.error('Error updating shot name:', error);
      toast.error(`Failed to update shot name: ${error.message}`);
    },
  });
};

// Update shot aspect ratio
export const useUpdateShotAspectRatio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shotId, aspectRatio, projectId }: { shotId: string; aspectRatio: string; projectId: string }) => {
      const { error } = await supabase
        .from('shots')
        .update({ aspect_ratio: aspectRatio })
        .eq('id', shotId);

      if (error) throw error;
      return { shotId, aspectRatio, projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    },
  });
};

// Add image to shot (new simplified version)
export const useAddImageToShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      shot_id, 
      generation_id, 
      project_id,
      imageUrl, // For optimistic updates
      thumbUrl, // For optimistic updates
      timelineFrame, // Optional: specify explicit frame position
      skipOptimistic // NEW: Flag to skip optimistic updates
    }: { 
      shot_id: string; 
      generation_id: string; 
      project_id: string;
      imageUrl?: string;
      thumbUrl?: string;
      timelineFrame?: number;
      skipOptimistic?: boolean;
    }) => {
      // Get all existing frames for collision detection
      const { data: existingGens, error: fetchError } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id)
        .not('timeline_frame', 'is', null);
        
      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching existing frames:', fetchError);
      }
      
      const existingFrames = (existingGens || [])
        .map(g => g.timeline_frame)
        .filter((f): f is number => f != null && f !== -1);
      
      // Calculate frame with collision detection
      let resolvedFrame: number;
      
      if (timelineFrame !== undefined) {
        // Explicit frame provided - ensure it's unique
        resolvedFrame = timelineFrame;
        while (existingFrames.includes(resolvedFrame)) {
          resolvedFrame += 1;
        }
        if (resolvedFrame !== timelineFrame) {
          console.log('[UniqueFrame] 🔄 Adjusted provided frame:', {
            original: timelineFrame,
            resolved: resolvedFrame,
            reason: 'collision'
          });
        }
      } else {
        // No frame specified - append at end
        const maxFrame = existingFrames.length > 0 ? Math.max(...existingFrames) : -60;
        resolvedFrame = maxFrame + 60;
      }

      // Insert into shot_generations
      // NOTE: If there's a unique constraint on (shot_id, generation_id), this will fail
      // when trying to add the same generation to the shot multiple times.
      // Each shot_generations row should have a unique ID, but the same generation_id
      // CAN appear multiple times (as duplicate instances).
      
      // First, check if this generation is already on the timeline (for debugging)
      // Skip this check if generation_id is empty (e.g., when adding URL-only images)
      let existingRecords: { id: string; timeline_frame: number | null }[] | null = null;
      if (generation_id) {
        const { data } = await supabase
          .from('shot_generations')
          .select('id, timeline_frame')
          .eq('shot_id', shot_id)
          .eq('generation_id', generation_id);
        existingRecords = data;
      }
      
      console.log('[DuplicateGenDebug] 📤 Inserting into shot_generations:', {
        shot_id: shot_id.substring(0, 8),
        generation_id: generation_id ? generation_id.substring(0, 8) : '(empty)',
        timeline_frame: resolvedFrame,
        existingRecordsCount: existingRecords?.length ?? 0,
        existingRecords: existingRecords?.map(r => ({ id: r.id.substring(0, 8), frame: r.timeline_frame })),
        timestamp: Date.now()
      });
      
      const { data, error } = await supabase
          .from('shot_generations')
        .insert({
          shot_id,
          generation_id,
          timeline_frame: resolvedFrame
        })
        .select()
        .single();

      if (error) {
        console.error('[DuplicateGenDebug] ❌ Insert failed:', {
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
          shot_id: shot_id.substring(0, 8),
          generation_id: generation_id ? generation_id.substring(0, 8) : '(empty)',
          timestamp: Date.now()
        });
        throw error;
      }
      
      // After insert, verify what records exist now
      // Skip this check if generation_id is empty
      let afterInsertRecords: { id: string; timeline_frame: number | null }[] | null = null;
      if (generation_id) {
        const { data: verifyData } = await supabase
          .from('shot_generations')
          .select('id, timeline_frame')
          .eq('shot_id', shot_id)
          .eq('generation_id', generation_id);
        afterInsertRecords = verifyData;
      }
      
      console.log('[DuplicateGenDebug] ✅ Insert succeeded:', {
        newId: data?.id?.substring(0, 8),
        shot_id: shot_id.substring(0, 8),
        generation_id: generation_id ? generation_id.substring(0, 8) : '(empty)',
        timeline_frame: data?.timeline_frame,
        totalRecordsAfterInsert: afterInsertRecords?.length ?? 0,
        allRecords: afterInsertRecords?.map(r => ({ id: r.id.substring(0, 8), frame: r.timeline_frame })),
        timestamp: Date.now()
      });
      
      return { ...data, project_id, imageUrl, thumbUrl };
    },
    onMutate: async (variables) => {
      const { shot_id, generation_id, project_id, imageUrl, thumbUrl, timelineFrame, skipOptimistic } = variables;
      
      console.log('[PATH_COMPARE] ⚡ MUTATION onMutate START - addImageToShotMutation:', {
        shot_id: shot_id?.substring(0, 8),
        generation_id: generation_id?.substring(0, 8),
        imageUrl: imageUrl ? imageUrl.substring(0, 80) : '❌ MISSING',
        thumbUrl: thumbUrl ? thumbUrl.substring(0, 80) : '❌ MISSING',
        timelineFrame: timelineFrame !== undefined ? timelineFrame : '❌ UNDEFINED (will calculate)',
        willCreateOptimistic: !!(imageUrl || thumbUrl) && !skipOptimistic,
        skipOptimistic,
        timestamp: Date.now()
      });

      if (!project_id) return { previousShots: undefined, previousFastGens: undefined, project_id: undefined, shot_id: undefined };

      await queryClient.cancelQueries({ queryKey: ['shots', project_id] });
      await queryClient.cancelQueries({ queryKey: ['all-shot-generations', shot_id] });

      const previousShots = queryClient.getQueryData<Shot[]>(['shots', project_id]);
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(['all-shot-generations', shot_id]);

      // Only perform optimistic update if we have image URL to show AND not skipped
      let tempId: string | undefined;
      
      if ((imageUrl || thumbUrl) && !skipOptimistic) {
        tempId = `temp-${Date.now()}-${Math.random()}`;
        
        const createOptimisticItem = (currentImages: any[]) => {
          // Get existing frames for collision detection
          const existingFrames = currentImages
            .filter(img => img.timeline_frame != null && img.timeline_frame !== -1)
            .map(img => img.timeline_frame as number);
          
          let resolvedFrame: number;
          if (timelineFrame !== undefined) {
            // Explicit frame provided - ensure it's unique
            resolvedFrame = timelineFrame;
            while (existingFrames.includes(resolvedFrame)) {
              resolvedFrame += 1;
            }
          } else {
            // No frame provided - append at end
            const maxFrame = existingFrames.length > 0 
              ? Math.max(...existingFrames) 
              : -60; // Start at 0 ( -60 + 60 )
            resolvedFrame = maxFrame + 60;
          }

          // CRITICAL: Use tempId for the item's id, NOT generation_id!
          // If we use generation_id, dropping the same generation twice will "move" 
          // the existing item instead of creating a duplicate (React sees same id = update)
          return {
            id: tempId!,  // Unique ID for this shot_generations entry
            generation_id: generation_id, // Store the actual generation_id separately
            shotImageEntryId: tempId!,
            shot_generation_id: tempId!,
            // Match phase1Query structure
            location: imageUrl,
            thumbnail_url: thumbUrl || imageUrl,
            imageUrl: imageUrl,
            thumbUrl: thumbUrl || imageUrl,
            timeline_frame: resolvedFrame,
            type: 'image',
            created_at: new Date().toISOString(),
            starred: false,
            name: null,
            based_on: null,
            params: {},
            shot_data: { [shot_id]: resolvedFrame },  // Include shot_data for consistency
            _optimistic: true
          };
        };

        // Update 'all-shot-generations' (Timeline)
        if (previousFastGens) {
          const optimisticItem = createOptimisticItem(previousFastGens);
          const newCacheData = [...previousFastGens, optimisticItem];
          console.log('[AddFlicker] 1️⃣ onMutate - SETTING optimistic cache:', {
            shot_id: shot_id?.substring(0, 8),
            previousCount: previousFastGens.length,
            newCount: newCacheData.length,
            optimisticItem: {
              id: optimisticItem.id?.substring(0, 8),
              timeline_frame: optimisticItem.timeline_frame,
              imageUrl: optimisticItem.imageUrl?.substring(0, 50),
              _optimistic: true
            },
            timestamp: Date.now()
          });
          queryClient.setQueryData(['all-shot-generations', shot_id], newCacheData);
          
          // Verify the cache was actually set
          const verifyCache = queryClient.getQueryData<any[]>(['all-shot-generations', shot_id]);
          console.log('[AddFlicker] 1️⃣ onMutate - VERIFY cache after set:', {
            shot_id: shot_id?.substring(0, 8),
            cacheCount: verifyCache?.length,
            hasOptimistic: verifyCache?.some((g: any) => g._optimistic),
            timestamp: Date.now()
          });

          // NOTE: Skeleton event is now emitted BEFORE mutation in useGenerationsPageLogic
          // This ensures the skeleton appears immediately, not after onMutate runs
        } else {
          console.log('[AddFlicker] 1️⃣ onMutate - ⚠️ NO CACHE to update!', {
            shot_id: shot_id?.substring(0, 8),
            timestamp: Date.now()
          });
        }

        // Update ALL 'shots' cache variants (Sidebar/Context)
        const shotsCacheKeys = [
          ['shots', project_id],
          ['shots', project_id, 0],
          ['shots', project_id, 2],
          ['shots', project_id, 5],
        ];
        shotsCacheKeys.forEach(cacheKey => {
          const cachedShots = queryClient.getQueryData<Shot[]>(cacheKey);
          if (cachedShots) {
            const updatedShots = cachedShots.map(shot => {
              if (shot.id === shot_id) {
                const currentImages = shot.images || [];
                const optimisticItem = createOptimisticItem(currentImages);
                return { ...shot, images: [...currentImages, optimisticItem] };
              }
              return shot;
            });
            queryClient.setQueryData(cacheKey, updatedShots);
          }
        });
      }

      return { previousShots, previousFastGens, project_id, shot_id, tempId };
    },
    onError: (error: Error, variables, context) => {
      console.error('Error adding image to shot:', error);
      
      // Rollback ALL cache variants
      if (context?.previousShots && context.project_id) {
        const shotsCacheKeys = [
          ['shots', context.project_id],
          ['shots', context.project_id, 0],
          ['shots', context.project_id, 2],
          ['shots', context.project_id, 5],
        ];
        shotsCacheKeys.forEach(cacheKey => {
          queryClient.setQueryData(cacheKey, context.previousShots);
        });
      }
      if (context?.previousFastGens && context.shot_id) {
        console.log('[AddToShot:onError] 🔄 Rolling back cache to previous state', {
          shot_id: context.shot_id?.substring(0, 8),
          previousCount: context.previousFastGens.length,
          error: error.message,
          timestamp: Date.now()
        });
        queryClient.setQueryData(['all-shot-generations', context.shot_id], context.previousFastGens);
      }
      
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
    onSuccess: (data, variables, context) => {
      const { project_id, shot_id, generation_id } = variables;

      console.log('[AddFlicker] 3️⃣ onSuccess - Mutation complete', {
        shot_id: shot_id?.substring(0, 8),
        generation_id: generation_id?.substring(0, 8),
        newShotGenId: data?.id?.substring(0, 8),
        tempId: context?.tempId?.substring(0, 8),
        timeline_frame: data?.timeline_frame,
        timestamp: Date.now()
      });

      // Update cache to replace optimistic item with real item
      // This prevents the item from disappearing if an invalidation happens before the DB is consistent
      if (context?.tempId) {
        const beforeUpdate = queryClient.getQueryData<any[]>(['all-shot-generations', shot_id]);
        console.log('[AddFlicker] 3️⃣ onSuccess - BEFORE replacing optimistic:', {
          shot_id: shot_id?.substring(0, 8),
          cacheCount: beforeUpdate?.length,
          hasOptimistic: beforeUpdate?.some((g: any) => g._optimistic),
          tempIdInCache: beforeUpdate?.some((g: any) => g.id === context.tempId),
          timestamp: Date.now()
        });
        
        const updateCache = (oldData: GenerationRow[] | undefined) => {
          if (!oldData) {
            console.log('[AddFlicker] 3️⃣ onSuccess - updateCache: NO OLD DATA!');
            return oldData;
          }
          return oldData.map(item => {
            // item.id is the tempId we created for the optimistic item
            if (item.id === context.tempId) {
              console.log('[AddFlicker] 3️⃣ onSuccess - Replacing optimistic with real:', {
                tempId: context.tempId?.substring(0, 8),
                realId: data.id?.substring(0, 8),
                timeline_frame: data.timeline_frame
              });
              
              // Merge real DB data with optimistic data to preserve image URLs etc
              // that might not be in the 'data' return (which is just shot_generations row)
              // data.id = shot_generations.id, data.generation_id = generations.id
              return {
                ...item,
                id: data.id, // shot_generations.id (CRITICAL - unique per entry)
                generation_id: data.generation_id, // generations.id
                // Deprecated (backwards compat)
                shotImageEntryId: data.id,
                shot_generation_id: data.id,
                timeline_frame: data.timeline_frame, // The authoritative frame
                _optimistic: undefined // Clear optimistic flag
              };
            }
            return item;
          });
        };

        console.log('[PATH_COMPARE] ⚡ onSuccess - REPLACING temp ID with real ID:', {
          tempId: context?.tempId?.substring(0, 12),
          realId: data.id?.substring(0, 8),
          timeline_frame: data.timeline_frame,
          timestamp: Date.now()
        });
        
        queryClient.setQueryData(['all-shot-generations', shot_id], updateCache);
        
        const afterUpdate = queryClient.getQueryData<any[]>(['all-shot-generations', shot_id]);
        console.log('[PATH_COMPARE] ⚡ onSuccess - AFTER cache update:', {
          shot_id: shot_id?.substring(0, 8),
          cacheCount: afterUpdate?.length,
          hasOptimistic: afterUpdate?.some((g: any) => g._optimistic),
          hasRealId: afterUpdate?.some((g: any) => g.id === data.id),
          timestamp: Date.now()
        });
      }

      // Only invalidate shots list (for sidebar) - this doesn't cause flicker
      // because it's a different cache key with different timing
      queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
      
      // Also invalidate metadata for pair prompts (different data, won't cause flicker)
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', shot_id] });
    }
  });
};

// Add image to shot WITHOUT position (associates the image but doesn't place it on timeline)
// This creates a shot_generations record with timeline_frame = null
// The image appears in the shot's "unpositioned" section until user places it on timeline
export const useAddImageToShotWithoutPosition = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      shot_id, 
      generation_id, 
      project_id,
      imageUrl,
      thumbUrl
    }: { 
      shot_id: string; 
      generation_id: string; 
      project_id: string;
      imageUrl?: string;
      thumbUrl?: string;
    }) => {
      console.log('[AddWithoutPosDebug] 💾 MUTATION FUNCTION CALLED');
      console.log('[AddWithoutPosDebug] shot_id:', shot_id?.substring(0, 8));
      console.log('[AddWithoutPosDebug] generation_id:', generation_id?.substring(0, 8));
      console.log('[AddWithoutPosDebug] project_id:', project_id?.substring(0, 8));

      console.log('[AddWithoutPosDebug] 📝 Inserting into shot_generations with timeline_frame: null');
      
      const { data, error } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id,
          timeline_frame: null  // No position - will show in "unpositioned" section
        })
        .select()
        .single();
        
      if (error) {
        console.error('[AddWithoutPosDebug] ❌ Supabase insert error:', error);
        console.error('[AddWithoutPosDebug] Error code:', error.code);
        console.error('[AddWithoutPosDebug] Error message:', error.message);
        console.error('[AddWithoutPosDebug] Error details:', error.details);
        throw error;
      }
      
      console.log('[AddWithoutPosDebug] ✅ Insert successful!');
      console.log('[AddWithoutPosDebug] Inserted row id:', data.id?.substring(0, 8));
      console.log('[AddWithoutPosDebug] timeline_frame:', data.timeline_frame);
      
      return { ...data, project_id, imageUrl, thumbUrl };
    },
    onSuccess: (data, variables) => {
      console.log('[AddWithoutPosDebug] 🎉 onSuccess callback fired');
      console.log('[AddWithoutPosDebug] Invalidating queries for project:', variables.project_id?.substring(0, 8));
      // Don't invalidate all-shot-generations - realtime will handle it
      queryClient.invalidateQueries({ queryKey: ['shots', variables.project_id] });
    },
    onError: (error, variables) => {
      console.error('[AddWithoutPosDebug] 💥 onError callback fired');
      console.error('[AddWithoutPosDebug] Error:', error);
      console.error('[AddWithoutPosDebug] Variables:', variables);
    }
  });
};

// Remove image from shot's timeline (sets timeline_frame = NULL, keeps image in shot)
// CRITICAL: This does NOT delete the shot_generations record - it just removes the timeline position
// The image remains associated with the shot and can be re-added to the timeline later
export const useRemoveImageFromShot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shotId, shotGenerationId, projectId }: { shotId: string; shotGenerationId: string; projectId: string }) => {
      console.log('[DeleteDebug] 🎯 STEP 4: Mutation function called (setting timeline_frame = NULL)', {
        shotId: shotId?.substring(0, 8),
        shotGenerationId: shotGenerationId?.substring(0, 8),
        projectId: projectId?.substring(0, 8),
        shotIdType: typeof shotId,
        shotGenerationIdType: typeof shotGenerationId,
        projectIdType: typeof projectId
      });

      if (!shotId || !shotGenerationId || !projectId) {
        console.error('[DeleteDebug] ❌ Missing required parameters', {
          hasShotId: !!shotId,
          hasShotGenerationId: !!shotGenerationId,
          hasProjectId: !!projectId
        });
        throw new Error(`Missing required parameters: shotId=${shotId}, shotGenerationId=${shotGenerationId}, projectId=${projectId}`);
      }

      console.log('[DeleteDebug] 🗄️ STEP 5: Setting timeline_frame = NULL (keeps image in shot)', {
        shotId: shotId.substring(0, 8),
        shotGenerationId: shotGenerationId.substring(0, 8)
      });

      // Set timeline_frame = NULL instead of deleting
      // This removes the image from the timeline but keeps it associated with the shot
      // The image will appear in the "unpositioned" section and can be re-added to timeline
      const { error } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: null })
        .eq('id', shotGenerationId);

      if (error) {
        console.error('[DeleteDebug] ❌ Database update failed', {
          error: error.message,
          errorCode: error.code,
          errorDetails: error.details,
          shotId: shotId.substring(0, 8),
          shotGenerationId: shotGenerationId.substring(0, 8)
        });
        throw error;
      }

      console.log('[DeleteDebug] ✅ STEP 6: Database update successful (timeline_frame = NULL)', {
        shotId: shotId.substring(0, 8),
        shotGenerationId: shotGenerationId.substring(0, 8)
      });

      return { shotId, shotGenerationId, projectId };
    },
    onMutate: async (variables) => {
      console.log('[DeleteDebug] 🔄 STEP 3.5: onMutate called', {
        variables: {
          shotId: variables.shotId?.substring(0, 8),
          shotGenerationId: variables.shotGenerationId?.substring(0, 8),
          projectId: variables.projectId?.substring(0, 8)
        }
      });

      const { shotId, shotGenerationId, projectId } = variables;
      await queryClient.cancelQueries({ queryKey: ['shots', projectId] });
      await queryClient.cancelQueries({ queryKey: ['all-shot-generations', shotId] });

      const previousShots = queryClient.getQueryData<Shot[]>(['shots', projectId]);
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(['all-shot-generations', shotId]);

      console.log('[DeleteDebug] 📦 onMutate: Cache state', {
        previousShotsCount: previousShots?.length ?? 0,
        previousFastGensCount: previousFastGens?.length ?? 0
      });

      // Optimistically update fast gens - set timeline_frame = null instead of removing
      // This moves the item to "unpositioned" section rather than removing it entirely
      if (previousFastGens) {
        queryClient.setQueryData(
          ['all-shot-generations', shotId],
          previousFastGens.map(g => 
            g.id === shotGenerationId 
              ? { ...g, timeline_frame: null } 
              : g
          )
        );
      }

      // Optimistically update shots list - set timeline_frame = null
      if (previousShots) {
        queryClient.setQueryData(
          ['shots', projectId],
          previousShots.map(shot => {
            if (shot.id === shotId) {
              return {
                ...shot,
                images: shot.images.map(img => 
                  img.id === shotGenerationId 
                    ? { ...img, timeline_frame: null } 
                    : img
                )
              };
            }
            return shot;
          })
        );
      }

      return { previousShots, previousFastGens, projectId, shotId };
    },
    onError: (err, variables, context) => {
      console.error('[DeleteDebug] ❌ STEP ERROR: onError called', {
        errorMessage: err.message,
        errorStack: err.stack,
        variables: {
          shotId: variables.shotId?.substring(0, 8),
          shotGenerationId: variables.shotGenerationId?.substring(0, 8),
          projectId: variables.projectId?.substring(0, 8)
        },
        hasContext: !!context
      });

      if (context?.previousShots) {
        queryClient.setQueryData(['shots', context.projectId], context.previousShots);
      }
      if (context?.previousFastGens) {
        queryClient.setQueryData(['all-shot-generations', context.shotId], context.previousFastGens);
      }
      toast.error(`Failed to remove image from timeline: ${err.message}`);
    },
    onSuccess: (data) => {
      console.log('[DeleteDebug] ✅ STEP 7: onSuccess called', {
        shotId: data.shotId?.substring(0, 8),
        shotGenerationId: data.shotGenerationId?.substring(0, 8),
        projectId: data.projectId?.substring(0, 8)
      });

      // Invalidate queries to refresh the view
      // The image is now unpositioned but still in the shot
      queryClient.invalidateQueries({ queryKey: ['shots', data.projectId] });
      queryClient.invalidateQueries({ queryKey: ['all-shot-generations', data.shotId] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shotId] });
    },
  });
};

// Update shot image order/position
export const useUpdateShotImageOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      updates, 
      projectId,
      shotId 
    }: { 
      updates: { shot_id: string; generation_id: string; timeline_frame: number }[],
      projectId: string,
      shotId: string
    }) => {
      // We need to update each record. Supabase upsert matches on primary key.
      // shot_generations PK is (shot_id, generation_id) usually? 
      // Actually it has an 'id' column usually.
      // But upserting with shot_id/generation_id should work if there's a unique constraint.
      
      // Since we might not have the ID, let's try calling an RPC or doing individual updates.
      // Individual updates are safer if we don't know the PK ID.
      
      const promises = updates.map(update => 
        supabase
        .from('shot_generations')
          .update({ timeline_frame: update.timeline_frame })
          .eq('shot_id', update.shot_id)
          .eq('generation_id', update.generation_id)
      );

      await Promise.all(promises);
      return { projectId, shotId, updates };
    },
    onMutate: async (variables) => {
      const { updates, projectId, shotId } = variables;
      
      // Cancel queries
      await queryClient.cancelQueries({ queryKey: ['all-shot-generations', shotId] });
      
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(['all-shot-generations', shotId]);
      
      // Optimistic update
      if (previousFastGens) {
        const updatedGens = previousFastGens.map(gen => {
          const update = updates.find(u => u.generation_id === gen.id);
          if (update) {
            return { ...gen, timeline_frame: update.timeline_frame };
          }
          return gen;
        });
        
        // Sort by new frames
        updatedGens.sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));
        
        queryClient.setQueryData(['all-shot-generations', shotId], updatedGens);
      }
      
      return { previousFastGens, shotId };
    },
    onError: (err, variables, context) => {
      if (context?.previousFastGens) {
        queryClient.setQueryData(['all-shot-generations', context.shotId], context.previousFastGens);
      }
      toast.error("Failed to reorder images");
    },
    onSuccess: (data) => {
      // Don't invalidate all-shot-generations - the optimistic update already applied the changes
      // and realtime will confirm. Invalidating here causes flicker.
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shotId] });
    }
  });
};

// Position an existing generation that already has NULL position in a shot
// Used when viewing a shot with "Exclude items with a position" filter and adding one of those unpositioned items
// Uses add_generation_to_shot with p_with_position=true (replaces deprecated position_existing_generation_in_shot)
export const usePositionExistingGenerationInShot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
          shot_id,
          generation_id,
      project_id
    }: { 
      shot_id: string; 
      generation_id: string; 
      project_id: string;
    }) => {
      // Use add_generation_to_shot with p_with_position=true to assign a position
      // to an existing generation that has NULL timeline_frame
      const { data, error } = await supabase
        .rpc('add_generation_to_shot', {
          p_shot_id: shot_id,
          p_generation_id: generation_id,
          p_with_position: true
        });

      if (error) throw error;
      return { shot_id, generation_id, project_id, data };
    },
    onSuccess: (data) => {
      // Don't invalidate all-shot-generations - realtime will handle it
      queryClient.invalidateQueries({ queryKey: ['shots', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shot_id] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', data.shot_id] });
    },
    onError: (error: Error) => {
      console.error('Error positioning existing generation in shot:', error);
      toast.error(`Failed to position image: ${error.message}`);
    }
  });
};

// Duplicate an image in a shot by creating a new shot_generations entry for the SAME generation
// This is more efficient than creating a new generation - just adds another timeline position
export const useDuplicateImageInShot = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      shot_id,
      generation_id,
      project_id,
      shot_generation_id,
      timeline_frame,
      next_timeline_frame
    }: {
      shot_id: string;
      generation_id: string;
      project_id: string;
      shot_generation_id?: string; // Optional: if provided, used for precise lookup
      timeline_frame?: number; // Optional: if provided, used directly instead of querying
      next_timeline_frame?: number; // Optional: if provided, used for midpoint calculation instead of querying
    }) => {
      // 1. Get the original timeline_frame (if not provided)
      let originalTimelineFrame: number;
      
      if (timeline_frame !== undefined) {
        // Use provided timeline_frame directly (most efficient)
        originalTimelineFrame = timeline_frame;
      } else if (shot_generation_id) {
        // Query by shot_generation_id (unique, guaranteed single result)
        const { data: shotGen, error: shotGenError } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('id', shot_generation_id)
          .single();

        if (shotGenError || !shotGen) {
          throw new Error(`Failed to fetch shot_generation: ${shotGenError?.message || 'Not found'}`);
        }
        originalTimelineFrame = shotGen.timeline_frame ?? 0;
      } else {
        // Fallback: query by generation_id (may have multiple, take first)
        const { data: shotGenResults, error: shotGenError } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('shot_id', shot_id)
          .eq('generation_id', generation_id)
          .order('timeline_frame', { ascending: true, nullsFirst: false })
          .limit(1);

        if (shotGenError || !shotGenResults || shotGenResults.length === 0) {
          throw new Error(`Failed to fetch original shot_generation: ${shotGenError?.message || 'Not found'}`);
        }
        originalTimelineFrame = shotGenResults[0].timeline_frame ?? 0;
      }

      // 2. Get all existing frames for collision detection
      const { data: existingGens } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id)
        .not('timeline_frame', 'is', null);
      
      const existingFrames = (existingGens || [])
        .map(g => g.timeline_frame)
        .filter((f): f is number => f != null && f !== -1);
      
      // 3. Calculate midpoint timeline_frame for the duplicate
      let targetTimelineFrame: number;
      
      if (next_timeline_frame !== undefined) {
        // Use provided next_timeline_frame from UI (most accurate, avoids stale DB data)
        targetTimelineFrame = Math.floor((originalTimelineFrame + next_timeline_frame) / 2);
        console.log('[DUPLICATE] Using UI-provided next_timeline_frame for midpoint:', {
          originalTimelineFrame,
          next_timeline_frame,
          targetTimelineFrame
        });
      } else {
        // Fallback: Query database for next image's timeline_frame
        const { data: nextShotGen } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('shot_id', shot_id)
          .gt('timeline_frame', originalTimelineFrame)
          .order('timeline_frame', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (nextShotGen?.timeline_frame !== null && nextShotGen?.timeline_frame !== undefined) {
          // Midpoint between original and next
          targetTimelineFrame = Math.floor((originalTimelineFrame + nextShotGen.timeline_frame) / 2);
        } else {
          // No next image, place it 30 frames after the original (consistent with UI skeleton)
          targetTimelineFrame = originalTimelineFrame + 30;
        }
        
        console.log('[DUPLICATE] Using DB-queried next frame for midpoint:', {
          originalTimelineFrame,
          dbNextFrame: nextShotGen?.timeline_frame,
          targetTimelineFrame
        });
      }
      
      // 4. Ensure the calculated frame is unique (collision detection)
      let newTimelineFrame = Math.max(0, Math.round(targetTimelineFrame));
      
      // If collision, find nearest available position
      if (existingFrames.includes(newTimelineFrame)) {
        let offset = 1;
        while (offset < 1000) {
          // Try higher first
          const higher = newTimelineFrame + offset;
          if (!existingFrames.includes(higher)) {
            console.log('[DUPLICATE] 🔄 Collision resolved:', {
              original: targetTimelineFrame,
              resolved: higher,
              direction: 'higher',
              offset
            });
            newTimelineFrame = higher;
            break;
          }
          // Then try lower (but not below 0)
          const lower = newTimelineFrame - offset;
          if (lower >= 0 && !existingFrames.includes(lower)) {
            console.log('[DUPLICATE] 🔄 Collision resolved:', {
              original: targetTimelineFrame,
              resolved: lower,
              direction: 'lower',
              offset
            });
            newTimelineFrame = lower;
            break;
          }
          offset += 1;
        }
      }

      // 5. Create a new shot_generations entry pointing to the SAME generation
      // This is more efficient - we're just adding another timeline position for the same image
      const { data: newShotGen, error: addError } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id, // Same generation_id - just a new position on the timeline
          timeline_frame: newTimelineFrame
        })
        .select()
        .single();
      
      if (addError || !newShotGen) {
        throw new Error(`Failed to create duplicate: ${addError?.message || 'Unknown error'}`);
      }

      console.log('[DUPLICATE] Created new shot_generations entry:', {
        shot_generation_id: newShotGen.id,
        generation_id,
        timeline_frame: newTimelineFrame
      });

      return {
        shot_id, 
        original_generation_id: generation_id,
        new_generation_id: generation_id, // Same generation - kept for backwards compat
        new_shot_generation_id: newShotGen.id, // The unique ID for the new shot_generation entry
        timeline_frame: newTimelineFrame,
        project_id 
      };
    },
    onSuccess: (data) => {
      // Invalidate all relevant caches to ensure UI updates immediately
      queryClient.invalidateQueries({ queryKey: ['shots', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shot_id] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', data.shot_id] });
      // CRITICAL: Also invalidate all-shot-generations - this is what ShotEditor uses!
      queryClient.invalidateQueries({ queryKey: ['all-shot-generations', data.shot_id] });
    },
    onError: (error: Error) => {
      console.error('Error duplicating image in shot:', error);
      toast.error(`Failed to duplicate image: ${error.message}`);
    }
  });
};

// Function to create a generation from an uploaded image
export const createGenerationForUploadedImage = async (
  imageUrl: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  projectId: string,
  thumbnailUrl?: string
) => {
      const { data, error } = await supabase
    .from('generations')
    .insert({
      project_id: projectId,
      type: 'image',
      location: imageUrl,
      thumbnail_url: thumbnailUrl || imageUrl, // Use separate thumbnail if available
      params: {
        source: 'upload',
        original_filename: fileName,
        file_type: fileType,
        file_size: fileSize
      }
    })
        .select()
        .single();
      
      if (error) throw error;
  return data;
};

// Helper function to check for quota or server errors
const isQuotaOrServerError = (error: Error): boolean => {
  const msg = error.message?.toLowerCase() || '';
  return (
    msg.includes('500') || 
    msg.includes('502') || 
    msg.includes('503') || 
    msg.includes('504') ||
    msg.includes('quota') ||
    msg.includes('limit') ||
    msg.includes('capacity')
  );
};

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
          queryClient.invalidateQueries({ queryKey: ['all-shot-generations', data.shotId] });
          queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shotId] });
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
  const queryClient = useQueryClient();
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
        positions?: number[], // NEW: Optional explicit positions for the images
        onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void // NEW: Progress callback
        skipOptimistic?: boolean // NEW: Flag to skip individual optimistic updates (handled by batch)
    }) => {
    const { imageFiles, targetShotId, currentProjectQueryKey, currentShotCount, skipAutoPosition, positions, onProgress, skipOptimistic } = variables;
    
    if (!currentProjectQueryKey) { // Should be actual projectId
        toast.error("Cannot add image(s): current project is not identified.");
        return null;
    }
    const projectIdForOperation = currentProjectQueryKey; // Use the passed projectId

    let shotId = targetShotId;
    const generationIds: string[] = [];

    // --- NEW: CROP IMAGES TO SHOT ASPECT RATIO ---
    
    // 1. Get Project and Shot details to determine target aspect ratio
    // We need to fetch the project to check its aspect ratio settings
    // and if we have a target shot, we check its aspect ratio too.
    
    let targetAspectRatio: number | null = null;
    let aspectRatioSource = 'none';

    try {
        // Fetch project details
        const { data: projectData } = await supabase
            .from('projects')
            .select('aspect_ratio')
            .eq('id', projectIdForOperation)
            .single();
            
        // If we have a target shot, fetch its details
        let shotData = null;
        if (shotId) {
            const { data } = await supabase
                .from('shots')
                .select('aspect_ratio')
                .eq('id', shotId)
                .single();
            shotData = data;
        }

        // Determine aspect ratio: Shot > Project > Default
        const shotRatioStr = shotData?.aspect_ratio;
        const projectRatioStr = projectData?.aspect_ratio;
        
        const effectiveRatioStr = shotRatioStr || projectRatioStr;
        
        if (effectiveRatioStr) {
            targetAspectRatio = parseRatio(effectiveRatioStr);
            aspectRatioSource = shotRatioStr ? 'shot' : 'project';
        }
    } catch (err) {
        console.warn('Error fetching aspect ratio settings:', err);
    }

    // 2. Crop images if we have a valid aspect ratio
    let processedFiles = imageFiles;
    if (targetAspectRatio && !isNaN(targetAspectRatio)) {
        console.log(`[ImageDrop] Cropping ${imageFiles.length} images to ${aspectRatioSource} aspect ratio: ${targetAspectRatio}`);
        
        try {
            const cropPromises = imageFiles.map(async (file) => {
                try {
                    // Skip if not an image
                    if (!file.type.startsWith('image/')) return file;
                    
                    const result = await cropImageToProjectAspectRatio(file, targetAspectRatio as number);
                    if (result) {
                        return result.croppedFile;
                    }
                    return file;
                } catch (e) {
                    console.warn(`Failed to crop image ${file.name}:`, e);
                    return file;
                }
            });
            
            processedFiles = await Promise.all(cropPromises);
        } catch (e) {
            console.error('Error during batch cropping:', e);
            // Fallback to original files on catastrophic error
            processedFiles = imageFiles;
        }
    }
    
    // --- END CROPPING ---

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

      // 2. Process each file (using processed/cropped files)
      for (let fileIndex = 0; fileIndex < processedFiles.length; fileIndex++) {
        const imageFile = processedFiles[fileIndex];
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
                const overallProgress = Math.round(((fileIndex + (progress / 100)) / processedFiles.length) * 100);
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
                const overallProgress = Math.round(((fileIndex + (progress / 100)) / processedFiles.length) * 100);
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
          const explicitPosition = positions && positions.length > fileIndex ? positions[fileIndex] : undefined;

          if (explicitPosition !== undefined) {
             // Use explicit position if provided
             await addImageToShotMutation.mutateAsync({
              shot_id: shotId,
              generation_id: newGeneration.id as string,
              project_id: projectIdForOperation,
              imageUrl: newGeneration.location || undefined,
              thumbUrl: thumbnailUrl || newGeneration.location || undefined,
              timelineFrame: explicitPosition,
              skipOptimistic // Pass the flag
            });
          } else if (skipAutoPosition) {
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
              skipOptimistic // Pass the flag
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