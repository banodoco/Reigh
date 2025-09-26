import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
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
            created_at
          )
        `)
        .eq('shot_id', shotId)
        .order('timeline_frame', { ascending: true })
        .order('created_at', { ascending: true });

      console.debug('[PositionLoadDebug] Loaded shot_generations from DB:', {
        shotId,
        count: data?.length || 0,
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
        generation: sg.generation
      }));

      setShotGenerations(shotGenerationsData);

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

        // Block shot-related invalidations during drag operations
        const shouldReload = (
          (isUnifiedGenerationsShot && !isDragInProgress && !isPersistingPositions) ||
          (isShotsProject && !isDragInProgress && !isPersistingPositions) ||
          (queryKey[0] === 'unpositioned-count' && queryKey[1] === shotId)
        );

        if (shouldReload) {
          loadPositions({ reason: 'invalidation' });
        }
      }
    });

    return unsubscribe;
  }, [shotId, queryClient, loadPositions, isPersistingPositions, isDragInProgress]);

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
      .map(sg => ({
        id: sg.generation_id,
        shotImageEntryId: sg.id,
        imageUrl: sg.generation?.location,
        thumbUrl: sg.generation?.location,
        location: sg.generation?.location,
        type: sg.generation?.type,
        createdAt: sg.generation?.created_at,
        timeline_frame: sg.timeline_frame,
        metadata: sg.metadata
      } as GenerationRow & { timeline_frame?: number }))
      .filter(img => {
        // EXACT same video detection as original ShotEditor/ShotsPane logic
        const isVideo = img.type === 'video' ||
                       img.type === 'video_travel_output' ||
                       (img.location && img.location.endsWith('.mp4')) ||
                       (img.imageUrl && img.imageUrl.endsWith('.mp4'));
        
        
        return !isVideo; // Exclude videos, just like original system
      });


    if (mode === 'timeline') {
      // Sort by timeline_frame, fallback to calculated frame
      return images.sort((a, b) => {
        const frameA = a.timeline_frame ?? 0;
        const frameB = b.timeline_frame ?? 0;
        return frameA - frameB;
      });
    } else {
      // Batch mode now also sorts by timeline_frame for consistent ordering
      return images.sort((a, b) => {
        const frameA = a.timeline_frame ?? 0;
        const frameB = b.timeline_frame ?? 0;
        return frameA - frameB;
      });
    }
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

      
      // Position exchange completed successfully - no toast needed for smooth UX
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exchange positions';
      toast.error(`Failed to exchange positions: ${errorMessage}`);
      throw err;
    }
  }, [shotId, shotGenerations, loadPositions]);

  // Exchange positions without reloading (for batch operations)
  const exchangePositionsNoReload = useCallback(async (shotGenerationIdA: string, shotGenerationIdB: string) => {
    if (!shotId) {
      console.log('[BatchModeReorderFlow] [EXCHANGE_NO_RELOAD] ❌ No shotId provided');
      return;
    }

    // Get current positions before exchange using shot_generation IDs
    const itemA = shotGenerations.find(sg => sg.id === shotGenerationIdA);
    const itemB = shotGenerations.find(sg => sg.id === shotGenerationIdB);

    const frameA = itemA?.timeline_frame || 0;
    const frameB = itemB?.timeline_frame || 0;

    console.log('[BatchModeReorderFlow] [EXCHANGE_NO_RELOAD] 🔀 Exchanging timeline frames:', {
      shotGenA: shotGenerationIdA.substring(0, 8),
      shotGenB: shotGenerationIdB.substring(0, 8),
      genA: itemA?.generation_id?.substring(0, 8),
      genB: itemB?.generation_id?.substring(0, 8),
      frameA,
      frameB,
      willSkip: frameA === frameB,
      timestamp: Date.now()
    });

    // Skip no-op exchange (items already have same timeline_frame)
    if (frameA === frameB) {
      console.log('[BatchModeReorderFlow] [EXCHANGE_NO_RELOAD] ⏭️ Skipping - same timeline_frame');
      return;
    }

    try {
      console.log('[BatchModeReorderFlow] [SQL_CALL] 📞 Calling exchange_timeline_frames RPC...');
      // Use exchange_timeline_frames with shot_generation IDs for precise targeting
      const { data, error } = await (supabase as any).rpc('exchange_timeline_frames', {
        p_shot_id: shotId,
        p_shot_generation_id_a: shotGenerationIdA,
        p_shot_generation_id_b: shotGenerationIdB
      });

      if (error) {
        console.log('[BatchModeReorderFlow] [SQL_ERROR] ❌ RPC failed:', error);
        throw error;
      }

      console.log('[BatchModeReorderFlow] [SQL_SUCCESS] ✅ exchange_timeline_frames completed');
      // No position reload - caller will handle this
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exchange positions';
      console.error('[BatchModeReorderFlow] [EXCHANGE_ERROR] ❌ Exchange failed:', errorMessage);
      throw err;
    }
  }, [shotId, shotGenerations]);

  // Batch exchange positions - performs multiple exchanges then reloads once
  const batchExchangePositions = useCallback(async (exchanges: Array<{ shotGenerationIdA: string; shotGenerationIdB: string }>) => {
    if (!shotId) {
      console.log('[BatchModeReorderFlow] [BATCH_EXCHANGE] ❌ No shotId provided');
      return;
    }

    if (exchanges.length === 0) {
      console.log('[BatchModeReorderFlow] [BATCH_EXCHANGE] ❌ No exchanges provided');
      return;
    }

    console.log('[BatchModeReorderFlow] [BATCH_EXCHANGE] 🚀 Starting batch exchange positions:', {
      shotId: shotId.substring(0, 8),
      exchangeCount: exchanges.length,
      exchanges: exchanges.map(ex => ({
        shotGenA: ex.shotGenerationIdA.substring(0, 8),
        shotGenB: ex.shotGenerationIdB.substring(0, 8)
      })),
      timestamp: Date.now()
    });


    // [TimelineItemMoveSummary] - Log batch position exchanges
    const positionsBefore = shotGenerations
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0))
      .map((gen, index) => ({
        id: gen.generation_id.slice(-8),
        shotGenId: gen.id.slice(-8),
        timelineFrame: gen.timeline_frame
      }));

    try {
      // Perform all exchanges without reloading positions each time
      console.log('[BatchModeReorderFlow] [EXCHANGES_START] 🔄 Starting individual exchanges...');
      for (let i = 0; i < exchanges.length; i++) {
        const exchange = exchanges[i];
        console.log('[BatchModeReorderFlow] [EXCHANGE_ITEM] 🔀 Processing exchange', i + 1, 'of', exchanges.length, ':', {
          shotGenA: exchange.shotGenerationIdA.substring(0, 8),
          shotGenB: exchange.shotGenerationIdB.substring(0, 8)
        });
        await exchangePositionsNoReload(exchange.shotGenerationIdA, exchange.shotGenerationIdB);
        console.log('[BatchModeReorderFlow] [EXCHANGE_COMPLETE] ✅ Exchange', i + 1, 'completed');
      }

      console.log('[BatchModeReorderFlow] [RELOAD_POSITIONS] 🔄 All exchanges complete, reloading positions...');
      // Single reload after all exchanges are done
      await loadPositions({ reason: 'reorder' });
      console.log('[BatchModeReorderFlow] [RELOAD_COMPLETE] ✅ Position reload completed');

      // Log the batch exchange summary after reload
      const positionsAfter = shotGenerations
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0))
        .map((gen, index) => ({
          id: gen.generation_id.slice(-8),
          shotGenId: gen.id.slice(-8),
          timelineFrame: gen.timeline_frame
        }));


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
    console.log(`[TimelineDragFlow] [DB_UPDATE] 🎯 Session: ${dragSessionId} | Updating timeline frame for shot_generation ${shotGenerationId.substring(0, 8)} to frame ${newTimelineFrame}`);

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
        console.log(`[TimelineDragFlow] [DB_ERROR] ❌ Session: ${dragSessionId} | Database update failed for shot_generation ${shotGenerationId.substring(0, 8)}:`, error);
        throw error;
      }

      console.log(`[TimelineDragFlow] [DB_SUCCESS] ✅ Session: ${dragSessionId} | Successfully updated shot_generation ${shotGenerationId.substring(0, 8)} to frame ${newTimelineFrame}`);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update timeline frame';
      console.error('[updateTimelineFrame] Error:', errorMessage);
      toast.error(`Failed to update timeline position: ${errorMessage}`);
      throw err;
    } finally {
      setIsPersistingPositions(false);
    }
  }, [shotId]);

  // REMOVED: Automatic timeline frame initialization
  // This was causing magic edit items (with add_in_position: false) to be automatically
  // positioned on the timeline, undermining the intentional unpositioned behavior.
  const initializeTimelineFrames = useCallback(async (frameSpacing: number = DEFAULT_FRAME_SPACING) => {
    console.warn('[initializeTimelineFrames] This function has been disabled. Items with timeline_frame: NULL are intentionally unpositioned.');
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


    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply timeline frames';
      console.error('[applyTimelineFrames] Error:', errorMessage);
      toast.error(`Failed to update timeline positions: ${errorMessage}`);
      throw err;
    } finally {
      setIsPersistingPositions(false);
    }
  }, [shotId]);

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
      const updatedMetadata: PositionMetadata = {
        ...generation.metadata,
        pair_prompt: pairPrompt?.trim() || undefined,
        pair_negative_prompt: pairNegativePrompt?.trim() || undefined,
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
    } catch (err) {
      console.error('[updatePairPrompts] Error:', err);
      throw err;
    }
  }, [shotId, shotGenerations]);

  // Get pair prompts in Timeline component format as a reactive value
  const pairPrompts = useMemo((): Record<number, { prompt: string; negativePrompt: string }> => {
    const sortedGenerations = [...shotGenerations]
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
    const sortedGenerations = [...shotGenerations]
      .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));

    if (pairIndex >= sortedGenerations.length - 1) {
      console.error('[PairPrompts] Invalid pair index:', pairIndex);
      return;
    }

    // Get the first item in the pair (the one that stores the prompts)
    const firstItem = sortedGenerations[pairIndex];
    await updatePairPrompts(firstItem.id, prompt, negativePrompt);
  }, [shotGenerations, updatePairPrompts]);

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
    updatePairPromptsByIndex
  };
};

// Export the return type for use in other components
export type UseEnhancedShotPositionsReturn = ReturnType<typeof useEnhancedShotPositions>;
