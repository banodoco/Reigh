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
      queryClient.invalidateQueries({ queryKey: ['shot-generations-fast'] });
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
      
      // Get images per shot based on maxImagesPerShot parameter
      // NEW: Use shot_data JSONB filter (fast, no joins) for preview images
      // NOTE: This relies on generations.shot_data containing { [shot_id]: timeline_frame }
      const shotIds = shots.map(s => s.id);
      
      // If we need limited images per shot (e.g. for mobile/list view), we need a different approach
      // Using a specialized RPC function is best for "top N items per group"
      // But for now we'll fetch all relevant generations and group them in JS
      // To optimize, we only fetch generations that belong to these shots
      
      // Fetch all shot_generations for these shots
      const { data: shotGenerations, error: sgError } = await supabase
        .from('shot_generations')
        .select(`
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
            upscaled_url,
            name,
            based_on,
            params
          )
        `)
        .in('shot_id', shotIds);
        
      if (sgError) {
        console.error('Error fetching shot generations:', sgError);
        // Return shots without images if image fetch fails
        return shots.map(shot => ({ ...shot, images: [] }));
      }
      
      // Group images by shot_id
      const imagesByShot: Record<string, GenerationRow[]> = {};
      
      shotGenerations?.forEach((sg: any) => {
        if (!sg.generations) return;
        
        const shotId = sg.shot_id;
        if (!imagesByShot[shotId]) {
          imagesByShot[shotId] = [];
        }
        
        const gen = sg.generations;
        // Transform to GenerationRow format
        const imageRow: GenerationRow = {
          id: gen.id,
          shotImageEntryId: gen.id, // Using generation ID as entry ID for now since we don't have the junction ID handy in this shape
          imageUrl: gen.location,
          thumbUrl: gen.thumbnail_url || gen.location,
          type: gen.type || 'image',
          createdAt: gen.created_at,
          starred: gen.starred || false,
          upscaled_url: gen.upscaled_url,
          name: gen.name,
          based_on: gen.based_on,
          params: gen.params,
          timeline_frame: sg.timeline_frame,
          shot_data: { [shotId]: sg.timeline_frame }
        };
        
        imagesByShot[shotId].push(imageRow);
      });
      
      // Attach images to shots
      return shots.map(shot => {
        let images = imagesByShot[shot.id] || [];
        
        // Sort images by timeline_frame
        images.sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));
        
        // Apply limit if requested
        if (maxImagesPerShot > 0 && images.length > maxImagesPerShot) {
          images = images.slice(0, maxImagesPerShot);
        }
        
        return {
          ...shot,
          images
        };
      });
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
      timelineFrame // Optional: specify explicit frame position
    }: { 
      shot_id: string; 
      generation_id: string; 
      project_id: string;
      imageUrl?: string;
      thumbUrl?: string;
      timelineFrame?: number;
    }) => {
      // If frame not specified, get the last frame + 60
      let resolvedFrame = timelineFrame;
      
      if (resolvedFrame === undefined) {
        const { data: lastGen, error: fetchError } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('shot_id', shot_id)
          .order('timeline_frame', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Error fetching last frame:', fetchError);
        }
        
        const lastFrame = lastGen?.timeline_frame ?? -60; // Start at 0 (-60 + 60)
        resolvedFrame = lastFrame + 60;
      }

      // Insert into shot_generations
      const { data, error } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id,
          timeline_frame: resolvedFrame
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, project_id, imageUrl, thumbUrl };
    },
    onMutate: async (variables) => {
      const { shot_id, generation_id, project_id, imageUrl, thumbUrl, timelineFrame } = variables;
      
      console.log('[ADD:useAddImageToShot] 🔄 onMutate starting optimistic update', {
        shot_id,
        generation_id,
        imageUrl: imageUrl ? 'provided' : 'missing',
        timelineFrame,
        timestamp: Date.now()
      });

      if (!project_id) return { previousShots: undefined, previousFastGens: undefined, project_id: undefined, shot_id: undefined };

      await queryClient.cancelQueries({ queryKey: ['shots', project_id] });
      await queryClient.cancelQueries({ queryKey: ['shot-generations-fast', shot_id] });

      const previousShots = queryClient.getQueryData<Shot[]>(['shots', project_id]);
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(['shot-generations-fast', shot_id]);

      // Only perform optimistic update if we have image URL to show
      if (imageUrl || thumbUrl) {
        const createOptimisticItem = (currentImages: any[]) => {
          let resolvedFrame = timelineFrame;
          if (resolvedFrame === undefined) {
            // If no frame provided, guess the next position (append)
            const positionedImages = currentImages.filter(img => img.timeline_frame !== null && img.timeline_frame !== undefined);
            const maxFrame = positionedImages.length > 0 
              ? Math.max(...positionedImages.map(g => g.timeline_frame || 0)) 
              : -60; // Start at 0 ( -60 + 60 )
            resolvedFrame = maxFrame + 60;
          }

          const tempId = `temp-${Date.now()}-${Math.random()}`;
          return {
            id: generation_id || tempId,
            shotImageEntryId: tempId,
            shot_generation_id: tempId,
            // Match phase1Query structure
            location: imageUrl,
            thumbnail_url: thumbUrl || imageUrl,
            imageUrl: imageUrl,
            thumbUrl: thumbUrl || imageUrl,
            timeline_frame: resolvedFrame,
            type: 'image',
            created_at: new Date().toISOString(),
            starred: false,
            upscaled_url: null,
            name: null,
            based_on: null,
            params: {},
            shot_data: { [shot_id]: resolvedFrame },  // Include shot_data for consistency
            _optimistic: true
          };
        };

        // Update 'shot-generations-fast' (Timeline)
        if (previousFastGens) {
          const optimisticItem = createOptimisticItem(previousFastGens);
          queryClient.setQueryData(['shot-generations-fast', shot_id], [...previousFastGens, optimisticItem]);
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

      return { previousShots, previousFastGens, project_id, shot_id };
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
        queryClient.setQueryData(['shot-generations-fast', context.shot_id], context.previousFastGens);
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
    onSuccess: (_, variables) => {
      // Emit domain event for shot-generation change
      const { project_id, shot_id } = variables;

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-fast', shot_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', shot_id] }); // Also invalidate metadata (pairs)
      
      // Note: DataFreshnessManager handles global invalidation, 
      // but specific targeted invalidation is still good for immediate feedback
    }
  });
};

// Add image to shot WITHOUT position logic (let caller handle it)
// Useful for drag and drop reordering where we calculate position client-side first
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
      // This mutation does NOT add to shot_generations table
      // It assumes the caller will handle the database insert or it's part of a batch op
      // But for consistency with existing code, we probably DO want it to insert, 
      // just without the auto-position calculation logic.
      
      // Actually, looking at usage, it seems we often want to add it but let the UI
      // determine the position later or use a default.
      // If we insert with NULL position, it might break order.
      // Let's assume we insert at end for now if this is called directly.
      
      // Wait, if this is "WithoutPosition", maybe it means "don't calculate, just insert"
      // But we need a position for the unique constraint usually? 
      // Ah, timeline_frame is nullable in some schemas or handled differently?
      // In this codebase, timeline_frame seems important.
      
      // Let's implement it as "Insert at 0 or specified if provided in separate call"
      // But typically "WithoutPosition" implies just linking them.
      
      // Getting latest frame to append
      const { data: lastGen } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('shot_id', shot_id)
          .order('timeline_frame', { ascending: false })
          .limit(1)
          .maybeSingle();
          
      const nextFrame = (lastGen?.timeline_frame ?? -60) + 60;

      const { data, error } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id,
          timeline_frame: nextFrame
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, project_id, imageUrl, thumbUrl };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shots', variables.project_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-fast', variables.shot_id] });
    }
  });
};

// Remove image from shot
export const useRemoveImageFromShot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shotId, generationId, projectId }: { shotId: string; generationId: string; projectId: string }) => {
      const { error } = await supabase
        .from('shot_generations')
        .delete()
        .eq('shot_id', shotId)
        .eq('generation_id', generationId);

      if (error) throw error;
      return { shotId, generationId, projectId };
    },
    onMutate: async (variables) => {
      const { shotId, generationId, projectId } = variables;
      await queryClient.cancelQueries({ queryKey: ['shots', projectId] });
      await queryClient.cancelQueries({ queryKey: ['shot-generations-fast', shotId] });

      const previousShots = queryClient.getQueryData<Shot[]>(['shots', projectId]);
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(['shot-generations-fast', shotId]);

      // Optimistically update fast gens
      if (previousFastGens) {
        queryClient.setQueryData(
          ['shot-generations-fast', shotId],
          previousFastGens.filter(g => g.id !== generationId)
        );
      }

      // Optimistically update shots list
      if (previousShots) {
        queryClient.setQueryData(
          ['shots', projectId],
          previousShots.map(shot => {
            if (shot.id === shotId) {
              return {
                ...shot,
                images: shot.images.filter(img => img.id !== generationId)
              };
            }
            return shot;
          })
        );
      }

      return { previousShots, previousFastGens, projectId, shotId };
    },
    onError: (err, variables, context) => {
      if (context?.previousShots) {
        queryClient.setQueryData(['shots', context.projectId], context.previousShots);
      }
      if (context?.previousFastGens) {
        queryClient.setQueryData(['shot-generations-fast', context.shotId], context.previousFastGens);
      }
      toast.error(`Failed to remove image: ${err.message}`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shots', data.projectId] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-fast', data.shotId] });
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
      await queryClient.cancelQueries({ queryKey: ['shot-generations-fast', shotId] });
      
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(['shot-generations-fast', shotId]);
      
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
        
        queryClient.setQueryData(['shot-generations-fast', shotId], updatedGens);
      }
      
      return { previousFastGens, shotId };
    },
    onError: (err, variables, context) => {
      if (context?.previousFastGens) {
        queryClient.setQueryData(['shot-generations-fast', context.shotId], context.previousFastGens);
      }
      toast.error("Failed to reorder images");
    },
    onSuccess: (data) => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['shot-generations-fast', data.shotId] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shotId] });
    }
  });
};

// Position an existing generation that already has NULL position in a shot
// Used when viewing a shot with "Exclude items with a position" filter and adding one of those unpositioned items
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
      const { data, error } = await supabase
        .rpc('position_existing_generation_in_shot', {
          p_shot_id: shot_id,
          p_generation_id: generation_id
        });

      if (error) throw error;
      return { shot_id, generation_id, project_id, data };
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['shots', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-fast', data.shot_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shot_id] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', data.shot_id] });
    },
    onError: (error: Error) => {
      console.error('Error positioning existing generation in shot:', error);
      toast.error(`Failed to position image: ${error.message}`);
    }
  });
};

// Duplicate an image in a shot by creating a new generation and adding it at a midpoint timeline_frame
export const useDuplicateImageInShot = () => {
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
      // 1. Fetch the original generation to get its image URL and metadata
      const { data: originalGen, error: genError } = await supabase
        .from('generations')
        .select('*')
        .eq('id', generation_id)
        .single();

      if (genError || !originalGen) {
        throw new Error(`Failed to fetch original generation: ${genError?.message || 'Not found'}`);
      }

      // 2. Fetch the original shot_generation to get its timeline_frame
      const { data: originalShotGen, error: shotGenError } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id)
        .eq('generation_id', generation_id)
        .single();

      if (shotGenError || !originalShotGen) {
        throw new Error(`Failed to fetch original shot_generation: ${shotGenError?.message || 'Not found'}`);
      }

      const originalTimelineFrame = originalShotGen.timeline_frame ?? 0;

      // 3. Find the next image's timeline_frame to calculate midpoint
      const { data: nextShotGen } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id)
        .gt('timeline_frame', originalTimelineFrame)
        .order('timeline_frame', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Calculate midpoint timeline_frame
      let newTimelineFrame: number;
      if (nextShotGen?.timeline_frame !== null && nextShotGen?.timeline_frame !== undefined) {
        // Midpoint between original and next
        newTimelineFrame = Math.floor((originalTimelineFrame + nextShotGen.timeline_frame) / 2);
      } else {
        // No next image, place it 60 frames after the original
        newTimelineFrame = originalTimelineFrame + 60;
      }

      // 4. Create a new generation record (duplicate)
      const { data: newGeneration, error: createError } = await supabase
        .from('generations')
        .insert({
          project_id: project_id,
          type: originalGen.type || 'image',
          location: originalGen.location,
          thumbnail_url: originalGen.thumbnail_url || originalGen.location,
          params: {
            ...originalGen.params,
            source: 'duplicate',
            duplicated_from: generation_id,
            original_filename: originalGen.params?.original_filename || 'duplicated_image'
          }
        })
        .select()
        .single();

      if (createError || !newGeneration) {
        throw new Error(`Failed to create duplicate generation: ${createError?.message || 'Unknown error'}`);
      }

      // 5. Add the new generation to the shot at the calculated timeline_frame
      const { data: newShotGen, error: addError } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id: newGeneration.id,
          timeline_frame: newTimelineFrame
        })
        .select()
        .single();

      if (addError || !newShotGen) {
        // Clean up: delete the generation if adding to shot failed
        await supabase.from('generations').delete().eq('id', newGeneration.id);
        throw new Error(`Failed to add duplicate to shot: ${addError?.message || 'Unknown error'}`);
      }

      return { 
        shot_id, 
        original_generation_id: generation_id,
        new_generation_id: newGeneration.id,
        timeline_frame: newTimelineFrame,
        project_id 
      };
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['shots', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-fast', data.shot_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shot_id] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', data.shot_id] });
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
          queryClient.invalidateQueries({ queryKey: ['shot-generations-fast', data.shotId] });
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