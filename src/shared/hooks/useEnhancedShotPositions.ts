import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { transformForTimeline, type RawShotGeneration } from '@/shared/lib/generationTransformers';
import { timelineDebugger } from '@/tools/travel-between-images/components/Timeline/utils/timeline-debug';


export interface ShotGeneration {
  id: string;
  shot_id: string;
  generation_id: string;
  timeline_frame: number;
  metadata?: PositionMetadata;
  generation?: {
    id: string;
    location?: string;
    type?: string;
    created_at: string;
    upscaled_url?: string; // URL of upscaled version if available
    starred?: boolean; // Whether this generation is starred
  };
}

export interface PositionMetadata {
  frame_spacing?: number;
  is_keyframe?: boolean;
  locked?: boolean;
  context_frames?: number;
  user_positioned?: boolean;
  created_by_mode?: 'timeline' | 'batch';
  auto_initialized?: boolean;
  drag_source?: string;
  drag_session_id?: string;
  // Pair prompts (stored on the first item of each pair)
  pair_prompt?: string;
  pair_negative_prompt?: string;
  enhanced_prompt?: string;
}

const DEFAULT_FRAME_SPACING = 60;

/**
 * Enhanced hook for managing shot positions with unified timeline and batch support
 */
export const useEnhancedShotPositions = (shotId: string | null, isDragInProgress?: boolean) => {
  const [shotGenerations, setShotGenerations] = useState<ShotGeneration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isPersistingPositions, setIsPersistingPositions] = useState(false);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Load all shot_generations data for the shot
  const loadPositions = useCallback(async (opts?: { silent?: boolean; reason?: 'shot_change' | 'invalidation' | 'reorder' }) => {
    if (!shotId) {
      setShotGenerations([]);
      setIsInitialLoad(false);
      return;
    }

    // Show loading unless silent mode is requested
    const shouldShowLoading = !opts?.silent && (
      isInitialLoad || 
      (opts?.reason !== 'reorder' && shotGenerations.length === 0)
    );

    if (shouldShowLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('shot_generations')
        .select(`
          id,
          shot_id,
          generation_id,
          timeline_frame,
          metadata,
          generation:generations(
            id,
            location,
            type,
            created_at,
            upscaled_url,
            starred,
            based_on
          )
        `)
        .eq('shot_id', shotId)
        .not('timeline_frame', 'is', null) // CRITICAL: Only load positioned images (on timeline)
        .order('timeline_frame', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      console.debug('[PositionLoadDebug] Loaded POSITIONED shot_generations from DB:', {
        shotId,
        count: data?.length || 0,
        note: 'Only includes images with timeline_frame set (positioned on timeline)',
        items: (data || []).map((sg: any) => ({
          id: sg.id,
          genId: sg.generation_id,
          timeline_frame: sg.timeline_frame,
          created_at: sg.created_at
        }))
      });

      if (fetchError) throw fetchError;

      // Convert database data to ShotGeneration format and set state
      const shotGenerationsData = (data || []).map(sg => ({
        id: sg.id,
        shot_id: sg.shot_id,
        generation_id: sg.generation_id,
        timeline_frame: sg.timeline_frame,
        metadata: sg.metadata as PositionMetadata,
        generation: sg.generation as any // Type assertion for upscaled_url
      }));

      setShotGenerations(shotGenerationsData as ShotGeneration[]);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load shot positions';
      setError(errorMessage);
      console.error('[useEnhancedShotPositions] Load error:', err);
    } finally {
      if (shouldShowLoading) {
        setIsLoading(false);
      }
      setIsInitialLoad(false);
    }
  }, [shotId, isInitialLoad]);

  // Auto-load on shotId change - but skip during drag operations to prevent overwriting positions
  useEffect(() => {
    // Skip auto-loading during drag operations to prevent overwriting user drag positions
    if (isPersistingPositions || isDragInProgress) {
      return;
    }

    loadPositions({ reason: 'shot_change' });
  }, [shotId, loadPositions, isPersistingPositions, isDragInProgress]);

  // Simple protection against drag conflicts
  useEffect(() => {
    if (!shotId) return;

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.isInvalidated) {
        const queryKey = event.query.queryKey;

        // Detect shot-related queries
        const isUnifiedGenerationsShot = queryKey[0] === 'unified-generations' && queryKey[1] === 'shot' && queryKey[2] === shotId;
        const isShotsProject = queryKey[0] === 'shots' && queryKey.includes(shotId);
        const isShotGenerations = queryKey[0] === 'shot-generations' && queryKey[1] === shotId;

        // Block shot-related invalidations during drag operations
        const shouldReload = (
          (isUnifiedGenerationsShot && !isDragInProgress && !isPersistingPositions) ||
          (isShotsProject && !isDragInProgress && !isPersistingPositions) ||
          (isShotGenerations && !isDragInProgress && !isPersistingPositions) || // 🚀 Listen for shot-generations invalidations (e.g., upscale completion)
          (queryKey[0] === 'unpositioned-count' && queryKey[1] === shotId)
        );

        if (shouldReload) {
          loadPositions({ reason: 'invalidation' });
        }
      }
    });

    return unsubscribe;
  }, [shotId, queryClient, loadPositions, isPersistingPositions, isDragInProgress]);

  // Realtime: force reload when a generation is updated (e.g., upscaled_url added)
  useEffect(() => {
    const handler = (e: any) => {
      if (!shotId) return;
      if (isDragInProgress || isPersistingPositions) return;
      // Be permissive: reload positions when any generation updates arrive
      try {
        const detail = e?.detail;
        const payloads = detail?.payloads || [];
        // If payload contains explicit shot context, ensure it matches, otherwise reload
        const affectsThisShot = payloads.some((p: any) => {
          const newRecord = p?.new;
          const params = newRecord?.params || {};
          const paramShotId = params?.shot_id || params?.shotId;
          return !paramShotId || paramShotId === shotId;
        });
        if (affectsThisShot || payloads.length === 0) {
          loadPositions({ reason: 'invalidation' });
        }
      } catch {
        loadPositions({ reason: 'invalidation' });
      }
    };
    window.addEventListener('realtime:generation-update-batch' as any, handler as any);
    return () => window.removeEventListener('realtime:generation-update-batch' as any, handler as any);
  }, [shotId, isDragInProgress, isPersistingPositions, loadPositions]);

  // Get positions formatted for specific mode
  const getPositionsForMode = useCallback((mode: 'batch' | 'timeline'): Map<string, number> => {
    const positions = new Map<string, number>();
    
    shotGenerations.forEach(sg => {
    if (mode === 'timeline') {
      // Use timeline_frame (no position fallback needed after migration)
      const frame = sg.timeline_frame ?? 0;
      positions.set(sg.generation_id, frame);
    } else {
      // Batch mode now also uses timeline_frame for consistent ordering
      // But we'll use the timeline_frame as the position value for batch display
      const frame = sg.timeline_frame ?? 0;
      positions.set(sg.generation_id, frame);
    }
    });
    
    return positions;
  }, [shotGenerations]);

  // Get images sorted by mode (excludes videos like original system)
  const getImagesForMode = useCallback((mode: 'batch' | 'timeline'): GenerationRow[] => {
    const images = shotGenerations
      .filter(sg => sg.generation)
      .map(sg => transformForTimeline(sg as any as RawShotGeneration))
      .filter(img => {
        // EXACT same video detection as original ShotEditor/ShotsPane logic
        const isVideo = img.type === 'video' ||
                       img.type === 'video_travel_output' ||
                       (img.location && img.location.endsWith('.mp4')) ||
                       (img.imageUrl && img.imageUrl.endsWith('.mp4'));
        
        return !isVideo; // Exclude videos, just like original system
      });

    if (mode === 'timeline') {
      // CRITICAL FIX: For timeline mode, only include items with valid timeline_frame
      // This prevents unpositioned items (timeline_frame = NULL) from appearing on timeline
      const positionedImages = images.filter(img => {
        const hasTimelineFrame = img.timeline_frame !== null && img.timeline_frame !== undefined;
        return hasTimelineFrame;
      });
      
      // Sort positioned images by timeline_frame
      return positionedImages.sort((a, b) => {
        const frameA = a.timeline_frame!; // Safe to use ! since we filtered for non-null
        const frameB = b.timeline_frame!;
        return frameA - frameB;
      });
    } else {
      // Batch mode also filters out unpositioned items for normal display
      // Unpositioned items should only appear in the dedicated unpositioned filter
      const positionedImages = images.filter(img => {
        const hasTimelineFrame = img.timeline_frame !== null && img.timeline_frame !== undefined;
        return hasTimelineFrame;
      });
      
      // Sort positioned images by timeline_frame
      return positionedImages.sort((a, b) => {
        const frameA = a.timeline_frame!; // Safe to use ! since we filtered for non-null
        const frameB = b.timeline_frame!;
        return frameA - frameB;
      });
    }
  }, [shotGenerations]);

  // Helper function to clear enhanced prompts for specific generation IDs
  const clearEnhancedPromptsForGenerations = useCallback(async (shotGenerationIds: string[]) => {
    if (!shotId || shotGenerationIds.length === 0) return;

    try {
      // Get the generations and their metadata
      const { data: generations, error: fetchError } = await supabase
        .from('shot_generations')
        .select('id, metadata')
        .eq('shot_id', shotId)
        .in('id', shotGenerationIds);

      if (fetchError) {
        console.error('[EnhancedPrompts-Position] Error fetching shot generations:', fetchError);
        throw fetchError;
      }

      if (!generations || generations.length === 0) {
        return;
      }

      // Update each generation to clear enhanced_prompt
      const updates = generations.map(async (gen) => {
        const existingMetadata = gen.metadata as Record<string, any> | null;
        const updatedMetadata = {
          ...(existingMetadata || {}),
          enhanced_prompt: ''
        };

        const { error: updateError } = await supabase
          .from('shot_generations')
          .update({ metadata: updatedMetadata })
          .eq('id', gen.id);

        if (updateError) {
          console.error(`[EnhancedPrompts-Position] Error updating generation ${gen.id}:`, updateError);
        }

        return { id: gen.id, success: !updateError };
      });

      await Promise.all(updates);

      // Invalidate cache to refresh UI
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
    } catch (err) {
      console.error('[clearEnhancedPromptsForGenerations] Error:', err);
      // Don't throw - position changes should still succeed even if prompt clearing fails
    }
  }, [shotId, queryClient]);

  // Get generation IDs that are adjacent to a given timeline_frame
  const getAdjacentGenerationIds = useCallback((timelineFrame: number): string[] => {
    if (!timelineFrame) return [];
    
    // Sort all generations by timeline_frame, filtering out videos
    const sorted = [...shotGenerations]
      .filter(sg => {
        if (sg.timeline_frame == null) return false;
        // Filter out videos - check generation type
        const isVideo = sg.generation.type === 'video' ||
                       sg.generation.type === 'video_travel_output' ||
                       (sg.generation.location && sg.generation.location.endsWith('.mp4'));
        return !isVideo;
      })
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    
    // Find the index of the item with this timeline_frame
    const index = sorted.findIndex(sg => sg.timeline_frame === timelineFrame);
    if (index === -1) return [];
    
    const adjacentIds: string[] = [];
    
    // Add the item before (if exists)
    if (index > 0) {
      adjacentIds.push(sorted[index - 1].id);
    }
    
    // Add the item after (if exists)
    if (index < sorted.length - 1) {
      adjacentIds.push(sorted[index + 1].id);
    }
    
    return adjacentIds;
  }, [shotGenerations]);

  // Get only the item BEFORE a given timeline_frame (for pair prompt clearing)
  // Since pair prompts are stored on the first item, we only need to clear
  // items whose NEXT neighbor changed
  const getPreviousGenerationId = useCallback((timelineFrame: number): string | null => {
    if (!timelineFrame) return null;
    
    const sorted = [...shotGenerations]
      .filter(sg => {
        if (sg.timeline_frame == null) return false;
        const isVideo = sg.generation.type === 'video' ||
                       sg.generation.type === 'video_travel_output' ||
                       (sg.generation.location && sg.generation.location.endsWith('.mp4'));
        return !isVideo;
      })
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    
    const index = sorted.findIndex(sg => sg.timeline_frame === timelineFrame);
    if (index === -1 || index === 0) return null;
    
    return sorted[index - 1].id;
  }, [shotGenerations]);

  // Exchange positions between two items
  const exchangePositions = useCallback(async (generationIdA: string, generationIdB: string) => {
    if (!shotId) {
      return;
    }

    // Get current positions before exchange for logging
    const itemA = shotGenerations.find(sg => sg.generation_id === generationIdA);
    const itemB = shotGenerations.find(sg => sg.generation_id === generationIdB);

    const beforeState = {
      itemA: itemA ? {
        id: generationIdA.substring(0, 8),
        timeline_frame: itemA.timeline_frame,
        timelineFrame: itemA.timeline_frame
      } : null,
      itemB: itemB ? {
        id: generationIdB.substring(0, 8),
        timeline_frame: itemB.timeline_frame,
        timelineFrame: itemB.timeline_frame
      } : null
    };


    try {
      // Use exchange_timeline_frames which is designed specifically for swapping two items
      const { error } = await (supabase as any).rpc('exchange_timeline_frames', {
        p_shot_id: shotId,
        p_generation_id_a: generationIdA,
        p_generation_id_b: generationIdB
      });

      if (error) throw error;

      // Reload positions to reflect changes
      await loadPositions({ reason: 'reorder' });

      // Get positions after exchange for verification logging
      const updatedGenerations = await supabase
        .from('shot_generations')
        .select('generation_id, timeline_frame')
        .eq('shot_id', shotId)
        .in('generation_id', [generationIdA, generationIdB]);

      const afterState = {
        itemA: updatedGenerations.data?.find(sg => sg.generation_id === generationIdA),
        itemB: updatedGenerations.data?.find(sg => sg.generation_id === generationIdB)
      };

      // Clear enhanced prompts for both swapped items AND items whose next changed
      if (itemA && itemB) {
        // Since pair prompts are stored on first item, clear items whose NEXT changed
        // When A and B swap, their neighbors' next values change too
        const itemsToClear = new Set<string>([itemA.id, itemB.id]);
        
        // Get items BEFORE A and B at their original positions
        // These items' next changed (from A/B to B/A)
        const itemBeforeA = itemA.timeline_frame ? getPreviousGenerationId(itemA.timeline_frame) : null;
        const itemBeforeB = itemB.timeline_frame ? getPreviousGenerationId(itemB.timeline_frame) : null;
        
        // Only add if it's not the other swapped item (handles adjacent swaps)
        if (itemBeforeA && itemBeforeA !== itemB.id) {
          itemsToClear.add(itemBeforeA);
        }
        if (itemBeforeB && itemBeforeB !== itemA.id) {
          itemsToClear.add(itemBeforeB);
        }
        
        clearEnhancedPromptsForGenerations(Array.from(itemsToClear)).catch(err => {
          console.error('[exchangePositions] Error clearing enhanced prompts:', err);
        });
      }
      
      // Position exchange completed successfully - no toast needed for smooth UX
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exchange positions';
      toast.error(`Failed to exchange positions: ${errorMessage}`);
      throw err;
    }
  }, [shotId, shotGenerations, loadPositions, getPreviousGenerationId, clearEnhancedPromptsForGenerations]);

  // Exchange positions without reloading (for batch operations)
  const exchangePositionsNoReload = useCallback(async (shotGenerationIdA: string, shotGenerationIdB: string) => {
    if (!shotId) {
      return;
    }

    // Get current positions before exchange using shot_generation IDs
    const itemA = shotGenerations.find(sg => sg.id === shotGenerationIdA);
    const itemB = shotGenerations.find(sg => sg.id === shotGenerationIdB);

    const frameA = itemA?.timeline_frame || 0;
    const frameB = itemB?.timeline_frame || 0;

    // Skip no-op exchange (items already have same timeline_frame)
    if (frameA === frameB) {
      return;
    }

    try {
      // Use exchange_timeline_frames with shot_generation IDs for precise targeting
      const { data, error } = await (supabase as any).rpc('exchange_timeline_frames', {
        p_shot_id: shotId,
        p_shot_generation_id_a: shotGenerationIdA,
        p_shot_generation_id_b: shotGenerationIdB
      });

      if (error) {
        throw error;
      }
      
      // Clear enhanced prompts for both swapped items AND items whose next changed
      // Since pair prompts are stored on first item, clear items whose NEXT changed
      // When A and B swap, their neighbors' next values change too
      const itemsToClear = new Set<string>([shotGenerationIdA, shotGenerationIdB]);
      
      // Get items BEFORE A and B at their original positions
      // These items' next changed (from A/B to B/A)
      const itemBeforeA = frameA ? getPreviousGenerationId(frameA) : null;
      const itemBeforeB = frameB ? getPreviousGenerationId(frameB) : null;
      
      // Only add if it's not the other swapped item (handles adjacent swaps)
      if (itemBeforeA && itemBeforeA !== shotGenerationIdB) {
        itemsToClear.add(itemBeforeA);
      }
      if (itemBeforeB && itemBeforeB !== shotGenerationIdA) {
        itemsToClear.add(itemBeforeB);
      }
      
      clearEnhancedPromptsForGenerations(Array.from(itemsToClear)).catch(err => {
        console.error('[exchangePositionsNoReload] Error clearing enhanced prompts:', err);
      });
      
      // No position reload - caller will handle this
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exchange positions';
      console.error('[BatchModeReorderFlow] [EXCHANGE_ERROR] ❌ Exchange failed:', errorMessage);
      throw err;
    }
  }, [shotId, shotGenerations, getPreviousGenerationId, clearEnhancedPromptsForGenerations]);

  // Batch exchange positions - performs multiple exchanges then reloads once
  const batchExchangePositions = useCallback(async (exchanges: Array<{ shotGenerationIdA: string; shotGenerationIdB: string }>) => {
    if (!shotId) {
      return;
    }

    if (exchanges.length === 0) {
      return;
    }

    try {
      // Perform all exchanges without reloading positions each time
      for (let i = 0; i < exchanges.length; i++) {
        const exchange = exchanges[i];
        await exchangePositionsNoReload(exchange.shotGenerationIdA, exchange.shotGenerationIdB);
      }

      // Single reload after all exchanges are done
      await loadPositions({ reason: 'reorder' });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to batch exchange positions';
      console.error('[batchExchangePositions] Error:', err);
      toast.error(`Failed to reorder items: ${errorMessage}`);
      throw err;
    }
  }, [shotId, loadPositions, exchangePositionsNoReload, shotGenerations]);

  // Delete item and its positions by shot_generations.id (not generation_id to avoid deleting duplicates)
  const deleteItem = useCallback(async (shotGenerationId: string) => {
    if (!shotId) {
      return;
    }


    try {
      const { error } = await supabase
        .from('shot_generations')
        .delete()
        .eq('id', shotGenerationId)
        .eq('shot_id', shotId); // Extra safety check

      if (error) throw error;

      // Reload positions to reflect changes
      await loadPositions({ reason: 'reorder' });
      
      // Item deletion completed successfully - no toast needed for smooth UX
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete item';
      console.error('[deleteItem] Error:', err);
      toast.error(`Failed to delete item: ${errorMessage}`);
      throw err;
    }
  }, [shotId, loadPositions]);

  // Add new item with positions
  const addItem = useCallback(async (
    generationId: string, 
    options: {
      position?: number;
      timelineFrame?: number;
      metadata?: Partial<PositionMetadata>;
    } = {}
  ) => {
    if (!shotId) {
      return;
    }

    const { position, timelineFrame, metadata } = options;
    
    // Calculate next available positions if not provided
    const nextPosition = position ?? Math.floor(Math.max(...shotGenerations.map(sg => sg.timeline_frame ?? 0)) / 50) + 1;
    const nextFrame = timelineFrame ?? (nextPosition * DEFAULT_FRAME_SPACING);


    try {
      const { error } = await supabase
        .from('shot_generations')
        .insert({
          shot_id: shotId,
          generation_id: generationId,
          // position removed - using timeline_frame only
          timeline_frame: nextFrame,
          metadata: {
            created_by_mode: 'batch',
            frame_spacing: DEFAULT_FRAME_SPACING,
            ...metadata
          }
        });

      if (error) throw error;

      // Reload positions to reflect changes
      await loadPositions();
      
      // Item addition completed successfully - no toast needed for smooth UX
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add item';
      console.error('[addItem] Error:', err);
      toast.error(`Failed to add item: ${errorMessage}`);
      throw err;
    }
  }, [shotId, shotGenerations, loadPositions]);

  // Update timeline frame for specific item
  const updateTimelineFrame = useCallback(async (
    shotGenerationId: string,
    newTimelineFrame: number,
    metadata?: Partial<PositionMetadata>
  ) => {
    if (!shotId) {
      return;
    }

    const dragSessionId = metadata?.drag_session_id || 'no-session';
    } to frame ${newTimelineFrame}`);

    // Get the item's current state BEFORE the move
    const movedItem = shotGenerations.find(sg => sg.id === shotGenerationId);
    const oldTimelineFrame = movedItem?.timeline_frame;

    // Get the current order of items (excluding videos)
    const oldOrderedItems = shotGenerations
      .filter(sg => {
        if (!sg.generation) return false;
        const isVideo = sg.generation.type === 'video' ||
                       sg.generation.type === 'video_travel_output' ||
                       (sg.generation.location && sg.generation.location.endsWith('.mp4'));
        return !isVideo && sg.timeline_frame !== null && sg.timeline_frame !== undefined;
      })
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    
    const oldIndex = oldOrderedItems.findIndex(sg => sg.id === shotGenerationId);

    setIsPersistingPositions(true);

    try {
      const { error } = await supabase
        .from('shot_generations')
        .update({ 
          timeline_frame: newTimelineFrame,
          metadata: metadata ? { user_positioned: true, drag_source: 'timeline_drag', ...metadata } : { user_positioned: true, drag_source: 'timeline_drag' }
        })
        .eq('id', shotGenerationId);

      if (error) {
        }:`, error);
        throw error;
      }

      } to frame ${newTimelineFrame}`);
      
      // AFTER the database update, fetch the updated state to check if order changed
      const { data: updatedGenerations, error: fetchError } = await supabase
        .from('shot_generations')
        .select('id, generation_id, timeline_frame, generations:generations(type, location)')
        .eq('shot_id', shotId)
        .not('timeline_frame', 'is', null)
        .order('timeline_frame', { ascending: true });

      if (fetchError) {
        console.error('[updateTimelineFrame] Error fetching updated positions:', fetchError);
      }

      // Check if the relative order actually changed
      let orderChanged = false;
      let newAdjacentIds: string[] = [];
      let newIndex = -1; // Declare outside for use later
      
      if (updatedGenerations) {
        // Filter out videos
        const nonVideoGens = updatedGenerations.filter(sg => {
          const gen = (sg as any).generation;
          if (!gen) return false; // Skip if no generation data
          const isVideo = gen.type === 'video' || 
                         gen.type === 'video_travel_output' ||
                         (gen.location && gen.location.endsWith('.mp4'));
          return !isVideo;
        });
        
        newIndex = nonVideoGens.findIndex(sg => sg.id === shotGenerationId);
        
        // Order changed if the item's position in the sequence changed
        if (newIndex !== -1 && oldIndex !== -1 && newIndex !== oldIndex) {
          orderChanged = true;
          // Get new neighbors
          if (newIndex > 0) newAdjacentIds.push(nonVideoGens[newIndex - 1].id);
          if (newIndex < nonVideoGens.length - 1) newAdjacentIds.push(nonVideoGens[newIndex + 1].id);
        } else {
          : ${oldIndex} → ${newIndex}`);
        }
      }
      
      // ONLY clear enhanced prompts if the relative order actually changed
      if (orderChanged) {
        // Since pair prompts are stored on the first item of each pair,
        // we need to clear items whose NEXT neighbor changed:
        // 1. The moved item (its next changed)
        // 2. The item BEFORE the moved item at its OLD position (its next changed from movedItem to something else)
        // 3. The item BEFORE the moved item at its NEW position (its next changed from something to movedItem)
        const itemsToClear: string[] = [shotGenerationId];
        
        // Get the item before the moved item at OLD position
        const oldPrevious = oldTimelineFrame ? getPreviousGenerationId(oldTimelineFrame) : null;
        if (oldPrevious) {
          itemsToClear.push(oldPrevious);
        }
        
        // Get the item before the moved item at NEW position
        let newPrevious: string | null = null;
        if (updatedGenerations && newIndex > 0) {
          const nonVideoGens = updatedGenerations.filter(sg => {
            const gen = (sg as any).generation;
            if (!gen) return false; // Skip if no generation data
            const isVideo = gen.type === 'video' || 
                           gen.type === 'video_travel_output' ||
                           (gen.location && gen.location.endsWith('.mp4'));
            return !isVideo;
          });
          newPrevious = nonVideoGens[newIndex - 1]?.id || null;
          if (newPrevious && newPrevious !== oldPrevious) {
            itemsToClear.push(newPrevious);
          }
        }
        
        :`, {
          movedItem: shotGenerationId.substring(0, 8),
          oldPrevious: oldPrevious?.substring(0, 8) || 'none',
          newPrevious: newPrevious?.substring(0, 8) || 'none',
          totalToClear: itemsToClear.length,
          reason: 'Clearing items whose next neighbor changed'
        });
        
        // Clear prompts and AWAIT it to ensure consistency before UI updates
        await clearEnhancedPromptsForGenerations(itemsToClear);
      } else {
        `);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update timeline frame';
      console.error('[updateTimelineFrame] Error:', errorMessage);
      toast.error(`Failed to update timeline position: ${errorMessage}`);
      throw err;
    } finally {
      setIsPersistingPositions(false);
    }
  }, [shotId, shotGenerations, getPreviousGenerationId, clearEnhancedPromptsForGenerations]);

  // REMOVED: Automatic timeline frame initialization
  // This was causing magic edit items (with add_in_position: false) to be automatically
  // positioned on the timeline, undermining the intentional unpositioned behavior.
  const initializeTimelineFrames = useCallback(async (frameSpacing: number = DEFAULT_FRAME_SPACING) => {
    // This function has been disabled. Items with timeline_frame: NULL are intentionally unpositioned.
    return 0;
  }, []);

  // Apply timeline frame changes atomically - replaces complex client-side exchange logic
  const applyTimelineFrames = useCallback(async (
    changes: Array<{ generationId: string; timelineFrame: number }>,
    updatePositions: boolean = true
  ) => {
    if (!shotId) {
      return;
    }

    if (changes.length === 0) {
      return;
    }

    setIsPersistingPositions(true);
    
    try {
      // Convert to the format expected by the RPC function
      const rpcChanges = changes.map(c => ({
        generation_id: c.generationId,
        timeline_frame: c.timelineFrame
      }));

      const { data, error } = await (supabase as any).rpc('timeline_sync_bulletproof', {
        shot_uuid: shotId,
        frame_changes: rpcChanges,
        should_update_positions: updatePositions
      });

      if (error) {
        console.error('[applyTimelineFrames] RPC Error:', error.message);
        throw error;
      }

      // Optimistically update local state with the returned data
      if (data && Array.isArray(data)) {
        setShotGenerations(prev => {
          const updatedMap = new Map(prev.map(sg => [sg.generation_id, sg]));
          
          // Update with returned data
          data.forEach((updatedRow: any) => {
            const existing = updatedMap.get(updatedRow.generation_id) as ShotGeneration;
            if (existing && updatedRow.generation_id && typeof updatedRow.timeline_frame === 'number') {
              updatedMap.set(updatedRow.generation_id, {
                ...existing,
                timeline_frame: updatedRow.timeline_frame
              });
            }
          });
          
          return Array.from(updatedMap.values());
        });
      }

      // Clear enhanced prompts for all changed items AND their neighbors
      const generationIdsChanged = changes.map(c => c.generationId);
      const changedItems = shotGenerations.filter(sg => generationIdsChanged.includes(sg.generation_id));
      
      // Collect all affected IDs: changed items + their old neighbors
      const allAffectedIds = new Set<string>();
      changedItems.forEach(item => {
        allAffectedIds.add(item.id);
        // Add old neighbors (before the change)
        if (item.timeline_frame) {
          const neighbors = getAdjacentGenerationIds(item.timeline_frame);
          neighbors.forEach(neighborId => allAffectedIds.add(neighborId));
        }
      });
      
      const itemsToClear = Array.from(allAffectedIds);
      
      if (itemsToClear.length > 0) {
        `);
        clearEnhancedPromptsForGenerations(itemsToClear).catch(err => {
          console.error('[applyTimelineFrames] Error clearing enhanced prompts:', err);
        });
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply timeline frames';
      console.error('[applyTimelineFrames] Error:', errorMessage);
      toast.error(`Failed to update timeline positions: ${errorMessage}`);
      throw err;
    } finally {
      setIsPersistingPositions(false);
    }
  }, [shotId, shotGenerations, clearEnhancedPromptsForGenerations]);

  // Update pair prompts for a specific generation (first item in pair)
  const updatePairPrompts = useCallback(async (generationId: string, pairPrompt?: string, pairNegativePrompt?: string) => {
    if (!shotId) return;

    try {
      // Find the current generation
      const generation = shotGenerations.find(sg => sg.id === generationId);
      if (!generation) {
        throw new Error(`Generation ${generationId} not found`);
      }

      // Update metadata with pair prompts
      // CRITICAL: Clear enhanced_prompt when user manually edits pair_prompt
      const updatedMetadata: PositionMetadata = {
        ...generation.metadata,
        pair_prompt: pairPrompt?.trim() || undefined,
        pair_negative_prompt: pairNegativePrompt?.trim() || undefined,
        enhanced_prompt: '', // Clear enhanced prompt when manually editing
      };

      // Update in database
      const { data, error } = await supabase
        .from('shot_generations')
        .update({ 
          metadata: updatedMetadata as any, // Cast to any for JSON compatibility
        })
        .eq('id', generationId)
        .select()
        .single();

      if (error) {
        console.error('[PairPrompts] Error updating pair prompts:', error);
        throw error;
      }


      // Update local state
      setShotGenerations(prev => prev.map(sg =>
        sg.id === generationId
          ? { ...sg, metadata: updatedMetadata }
          : sg
      ));

      // CRITICAL: Invalidate query cache to ensure other components see the update
      // This prevents stale data from being loaded when other operations trigger cache invalidation
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
      
      } catch (err) {
      console.error('[updatePairPrompts] Error:', err);
      throw err;
    }
  }, [shotId, shotGenerations, queryClient]);

  // Get pair prompts in Timeline component format as a reactive value
  const pairPrompts = useMemo((): Record<number, { prompt: string; negativePrompt: string }> => {
    // CRITICAL: Filter out videos AND unpositioned images to match the timeline display
    const filteredGenerations = shotGenerations.filter(sg => {
      // Must have a generation
      if (!sg.generation) return false;
      
      // CRITICAL: Must have a timeline_frame (positioned on timeline)
      // This excludes old/unpositioned images from being considered
      if (sg.timeline_frame == null) return false;
      
      // Filter out videos
      const isVideo = sg.generation.type === 'video' ||
                     sg.generation.type === 'video_travel_output' ||
                     (sg.generation.location && sg.generation.location.endsWith('.mp4'));
      return !isVideo;
    });

    // 🎯 PERFORMANCE: Early return if no generations to process
    if (filteredGenerations.length === 0) {
      return {};
    }

    const sortedGenerations = [...filteredGenerations]
      .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));

    const pairPromptsData: Record<number, { prompt: string; negativePrompt: string }> = {};

    // Each pair is represented by its first item (index in the sorted array)
    for (let i = 0; i < sortedGenerations.length - 1; i++) {
      const firstItem = sortedGenerations[i];
      
      if (firstItem.metadata?.pair_prompt || firstItem.metadata?.pair_negative_prompt) {
        pairPromptsData[i] = {
          prompt: firstItem.metadata.pair_prompt || '',
          negativePrompt: firstItem.metadata.pair_negative_prompt || '',
        };
      }
    }

    return pairPromptsData;
  }, [shotGenerations]);

  // Legacy function for backward compatibility
  const getPairPrompts = useCallback((): Record<number, { prompt: string; negativePrompt: string }> => {
    return pairPrompts;
  }, [pairPrompts]);

  // Update pair prompts for a specific pair index
  const updatePairPromptsByIndex = useCallback(async (pairIndex: number, prompt: string, negativePrompt: string) => {
    // CRITICAL: Filter out videos AND unpositioned images to match the timeline display
    // This ensures pair prompt indexes match the visual pairs in the UI
    const filteredGenerations = shotGenerations.filter(sg => {
      // Must have a generation
      if (!sg.generation) return false;
      
      // CRITICAL: Must have a timeline_frame (positioned on timeline)
      // This excludes old/unpositioned images from being considered
      if (sg.timeline_frame == null) return false;
      
      // Filter out videos
      const isVideo = sg.generation.type === 'video' ||
                     sg.generation.type === 'video_travel_output' ||
                     (sg.generation.location && sg.generation.location.endsWith('.mp4'));
      return !isVideo;
    });

    => ({
        arrayIndex: idx,
        shotGenId: sg.id.substring(0, 8),
        timeline_frame: sg.timeline_frame
      }))
    });

    const sortedGenerations = [...filteredGenerations]
      .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));

    => ({
        arrayIndex: idx,
        shotGenId: sg.id.substring(0, 8),
        timeline_frame: sg.timeline_frame
      }))
    });

    if (pairIndex >= sortedGenerations.length - 1) {
      console.error('[PairPrompts-SAVE] ❌ Invalid pair index:', pairIndex, 'Total non-video images:', sortedGenerations.length, 'Max valid pair index:', sortedGenerations.length - 2);
      return;
    }

    // Get the first item in the pair (the one that stores the prompts)
    const firstItem = sortedGenerations[pairIndex];
    ,
      fullShotGenId: firstItem.id,
      timeline_frame: firstItem.timeline_frame,
      prompt: prompt || '(empty)',
      promptLength: prompt.length,
      negativePrompt: negativePrompt || '(empty)',
      negativePromptLength: negativePrompt.length,
    });
    
    await updatePairPrompts(firstItem.id, prompt, negativePrompt);
    }, [shotGenerations, updatePairPrompts]);

  // Clear enhanced prompt for a specific pair/generation
  const clearEnhancedPrompt = useCallback(async (generationId: string) => {
    if (!shotId) return;

    try {
      );

      // Find the current generation
      const generation = shotGenerations.find(sg => sg.id === generationId);
      if (!generation) {
        throw new Error(`Generation ${generationId} not found`);
      }

      // Update metadata to clear enhanced_prompt
      const updatedMetadata: PositionMetadata = {
        ...generation.metadata,
        enhanced_prompt: '', // Clear enhanced prompt
      };

      // Update in database
      const { data, error } = await supabase
        .from('shot_generations')
        .update({ 
          metadata: updatedMetadata as any, // Cast to any for JSON compatibility
        })
        .eq('id', generationId)
        .select()
        .single();

      if (error) {
        console.error('[clearEnhancedPrompt] Database error:', error);
        throw error;
      }

      // Update local state optimistically
      setShotGenerations(prev => prev.map(sg => 
        sg.id === generationId 
          ? { ...sg, metadata: updatedMetadata }
          : sg
      ));

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['shot_generations', shotId] });
      await queryClient.invalidateQueries({ queryKey: ['shots'] });

    } catch (err) {
      console.error('[clearEnhancedPrompt] Error:', err);
      throw err;
    }
  }, [shotId, shotGenerations, queryClient]);

  // Clear all enhanced prompts for the shot (used when base prompt changes)
  const clearAllEnhancedPrompts = useCallback(async () => {
    if (!shotId) return;

    try {
      );

      // Get all shot_generations for this shot
      const { data: generations, error: fetchError } = await supabase
        .from('shot_generations')
        .select('id, metadata')
        .eq('shot_id', shotId);

      if (fetchError) {
        console.error('[EnhancedPrompts] Error fetching shot generations:', fetchError);
        throw fetchError;
      }

      if (!generations || generations.length === 0) {
        return;
      }

      // Update all generations to clear enhanced_prompt
      const updates = generations.map(async (gen) => {
        const existingMetadata = gen.metadata as Record<string, any> | null;
        const updatedMetadata = {
          ...(existingMetadata || {}),
          enhanced_prompt: ''
        };

        const { error: updateError } = await supabase
          .from('shot_generations')
          .update({ metadata: updatedMetadata })
          .eq('id', gen.id);

        if (updateError) {
          console.error(`[EnhancedPrompts] Error updating generation ${gen.id}:`, updateError);
        }

        return { id: gen.id, success: !updateError };
      });

      const results = await Promise.all(updates);
      const successCount = results.filter(r => r.success).length;
      
      // Invalidate cache to refresh UI
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
    } catch (err) {
      console.error('[clearAllEnhancedPrompts] Error:', err);
      throw err;
    }
  }, [shotId, queryClient]);

  return {
    shotGenerations,
    isLoading,
    error,
    isPersistingPositions,
    setIsPersistingPositions,
    getPositionsForMode,
    getImagesForMode,
    exchangePositions,
    exchangePositionsNoReload,
    batchExchangePositions,
    deleteItem,
    addItem,
    updateTimelineFrame,
    initializeTimelineFrames,
    applyTimelineFrames,
    loadPositions,
    updatePairPrompts,
    getPairPrompts,
    pairPrompts, // Export reactive pairPrompts value
    updatePairPromptsByIndex,
    clearEnhancedPrompt,
    clearAllEnhancedPrompts
  };
};

// Export the return type for use in other components
export type UseEnhancedShotPositionsReturn = ReturnType<typeof useEnhancedShotPositions>;
