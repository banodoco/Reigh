/**
 * Timeline Position Management Utilities
 * 
 * Provides utilities for managing timeline frame positions without fetching data.
 * This is the "enrichment layer" that adds position management capabilities
 * to already-fetched generation data from useAllShotGenerations.
 * 
 * Extracted from useEnhancedShotPositions to separate data fetching from utilities.
 */

import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { GenerationRow } from '@/types/shots';
import type { ShotGeneration, PositionMetadata } from './useEnhancedShotPositions';
import { readSegmentOverrides, writeSegmentOverrides } from '@/shared/utils/settingsMigration';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { calculateAverageSpacing, DEFAULT_FRAME_SPACING } from '@/shared/utils/timelinePositionCalculator';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';

// Re-export types for convenience
export type { ShotGeneration, PositionMetadata };

interface UseTimelinePositionUtilsOptions {
  shotId: string | null;
  generations: GenerationRow[];
  projectId?: string | null; // Optional: used to invalidate ShotsPane cache
}

export function useTimelinePositionUtils({ shotId, generations, projectId }: UseTimelinePositionUtilsOptions) {
  const queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  console.log('[SWAP_OPTIMISTIC] 🎯 useTimelinePositionUtils initialized:', {
    shotId: shotId?.substring(0, 8),
    projectId: projectId?.substring(0, 8),
    generationsCount: generations.length
  });
  
  console.log('[TimelinePositionUtils] Hook state:', {
    shotId: shotId?.substring(0, 8),
    generationsCount: generations.length,
    isLoading,
    hasError: !!error,
  });

  // Convert GenerationRow[] to ShotGeneration[] format for backward compatibility
  // NOTE: Include both positioned and unpositioned items
  // For unpositioned items, use a sentinel value (-1) instead of null to match type
  // CRITICAL: Filter out videos at the source level using canonical function
  const shotGenerations: ShotGeneration[] = generations
    .filter(gen => !isVideoGeneration(gen))
    .map(gen => ({
      // gen.id is shot_generations.id, gen.generation_id is the actual generation
      id: gen.id || '',
      shot_id: shotId || '',
      generation_id: gen.generation_id || gen.id,
      timeline_frame: gen.timeline_frame ?? -1, // Use -1 as sentinel for unpositioned
      metadata: (gen as any).metadata as PositionMetadata | undefined,
      generation: {
        id: gen.id,
        location: gen.imageUrl || gen.location || undefined,
        type: gen.type || undefined,
        created_at: gen.createdAt || new Date().toISOString(),
        starred: gen.starred ?? undefined,
      }
    }));
  
  console.log('[TimelinePositionUtils] Converted shotGenerations:', {
    shotId: shotId?.substring(0, 8),
    total: shotGenerations.length,
    positioned: shotGenerations.filter(sg => sg.timeline_frame >= 0).length,
    unpositioned: shotGenerations.filter(sg => sg.timeline_frame === -1).length,
  });

  // Extract pair prompts from metadata using migration utility
  // CRITICAL: Filter and sort to match getImagesForMode output (indices must align with displayed images)
  const pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
  const sortedPositionedGenerations = shotGenerations
    .filter(sg => sg.timeline_frame >= 0) // Filter out unpositioned (sentinel value -1)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

  // Each pair is represented by its first item (index in the sorted array)
  for (let i = 0; i < sortedPositionedGenerations.length - 1; i++) {
    const firstItem = sortedPositionedGenerations[i];
    const overrides = readSegmentOverrides(firstItem.metadata as Record<string, any> | null);
    const prompt = overrides.prompt || "";
    const negativePrompt = overrides.negativePrompt || "";
    if (prompt || negativePrompt) {
      pairPrompts[i] = { prompt, negativePrompt };
    }
  }

  /**
   * Load positions from database (refresh)
   */
  // Helper to sync shot_data in generations table
  // NOTE: With the new array format, the database trigger sync_shot_to_generation()
  // rebuilds the entire shot_data array from shot_generations on every change.
  // Manual sync is no longer needed - the trigger handles everything correctly.
  const syncShotData = useCallback(async (_generationId: string, _targetShotId: string, _frame: number) => {
    // No-op: Let database trigger handle shot_data sync
    // The trigger rebuilds the full array from shot_generations, which is the source of truth
    return;
  }, []);

  const loadPositions = useCallback(async (opts?: { silent?: boolean; reason?: string }) => {
    if (!shotId) {
      return;
    }

    if (!opts?.silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Use refetchQueries to WAIT for fresh data (not just invalidate)
      await queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
      
      // Invalidate other related caches (these can be background)
      invalidateGenerations(shotId, {
        reason: 'timeline-position-utils-reload',
        scope: 'all',
        includeShots: !!projectId,
        projectId: projectId ?? undefined
      });

      setIsLoading(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false);
      console.error('[TimelinePositionUtils] Error refreshing positions:', error);
    }
  }, [shotId, queryClient]);

  /**
   * Move items to distributed positions between neighbors (for batch mode drag)
   * Supports both single and multi-item moves
   */
  const moveItemsToMidpoint = useCallback(async (
    draggedItemIds: string[],
    newStartIndex: number,
    allItems: Array<{ id: string; timeline_frame: number | null }>
  ) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    console.log('[DataTrace] 🎯 moveItemsToMidpoint:', {
      draggedItemIds: draggedItemIds.map(id => id.substring(0, 8)),
      newStartIndex,
      totalItems: allItems.length,
      numDragged: draggedItemIds.length,
    });

    const findGeneration = (key?: string | null) => {
      if (!key) return undefined;
      return shotGenerations.find(sg => sg.id === key || sg.generation_id === key);
    };

    // Find shot_generation records for all dragged items
    const draggedShotGens = draggedItemIds.map(id => {
      const sg = findGeneration(id);
      if (!sg?.id) {
        throw new Error(`Shot generation not found for ${id}`);
      }
      return sg;
    });

    // Get predecessor and successor around the insertion point
    const newEndIndex = newStartIndex + draggedItemIds.length - 1;
    const predecessor = newStartIndex > 0 ? allItems[newStartIndex - 1] : null;
    const successor = newEndIndex < allItems.length - 1 ? allItems[newEndIndex + 1] : null;

    console.log('[DataTrace] 🎯 Distribution neighbors:', {
      predecessor: predecessor ? {
        id: predecessor.id?.substring(0, 8),
        frame: predecessor.timeline_frame
      } : null,
      successor: successor ? {
        id: successor.id?.substring(0, 8),
        frame: successor.timeline_frame
      } : null,
      newStartIndex,
      newEndIndex,
    });

    const accumulateUpdates: Array<{ id: string; newFrame: number; reason: string }> = [];

    const pushUpdate = (id: string, frame: number, reason: string) => {
      const normalizedFrame = Math.max(0, Math.floor(frame));
      accumulateUpdates.push({ id, newFrame: normalizedFrame, reason });
    };

    // Calculate frame positions for all dragged items
    if (newStartIndex === 0 && successor) {
      // Special case: dropping at position 0
      // successor is the displaced first item, we need to:
      // 1. Put first dragged item at frame 0
      // 2. Move displaced item to halfway between 0 and the old second item
      // 3. Distribute remaining dragged items between 0 and displaced item's new position
      
      const displacedFirstItem = successor;
      const oldSecondItem = newEndIndex + 2 < allItems.length ? allItems[newEndIndex + 2] : null;
      
      console.log('[DataTrace] 🎯 Drop at position 0 detected:', {
        displacedFirstId: displacedFirstItem.id?.substring(0, 8),
        displacedFirstFrame: displacedFirstItem.timeline_frame,
        oldSecondId: oldSecondItem?.id?.substring(0, 8),
        oldSecondFrame: oldSecondItem?.timeline_frame,
      });
      
      // First dragged item goes to frame 0
      pushUpdate(draggedShotGens[0].id, 0, 'First item at position 0');
      
      // Calculate new position for displaced first item
      let displacedNewFrame: number;
      if (oldSecondItem?.timeline_frame != null) {
        displacedNewFrame = Math.floor((0 + oldSecondItem.timeline_frame) / 2);
      } else if (displacedFirstItem.timeline_frame != null) {
        // No second item, use displaced item's current frame or default spacing
        displacedNewFrame = Math.max(DEFAULT_FRAME_SPACING, displacedFirstItem.timeline_frame);
      } else {
        displacedNewFrame = DEFAULT_FRAME_SPACING;
      }
      
      console.log('[DataTrace] 🎯 Displaced first item new position:', {
        oldFrame: displacedFirstItem.timeline_frame,
        newFrame: displacedNewFrame,
      });
      
      // Update displaced item
      const displacedShotGen = findGeneration(displacedFirstItem.id);
      if (displacedShotGen?.id) {
        pushUpdate(displacedShotGen.id, displacedNewFrame, 'Displaced first item shifted');
      }
      
      // Distribute remaining dragged items between 0 and displaced item's new position
      if (draggedItemIds.length > 1) {
        const numRemaining = draggedItemIds.length - 1;
        const gap = displacedNewFrame;
        const interval = gap / (numRemaining + 1);
        
        console.log('[DataTrace] 🎯 Distributing remaining dragged items:', {
          numRemaining,
          gap,
          interval,
        });
        
        for (let i = 1; i < draggedItemIds.length; i++) {
          const newFrame = interval * i;
          pushUpdate(draggedShotGens[i].id, newFrame, `Distributed after first (${i}/${draggedItemIds.length})`);
        }
      }
      
    } else if (predecessor && successor && predecessor.timeline_frame != null && successor.timeline_frame != null) {
      // Between two items - distribute evenly in the gap
      const gap = successor.timeline_frame - predecessor.timeline_frame;
      const numItems = draggedItemIds.length;
      const interval = gap / (numItems + 1);
      
      console.log('[DataTrace] 🎯 Distribution calculation (between):', {
        predecessorFrame: predecessor.timeline_frame,
        successorFrame: successor.timeline_frame,
        gap,
        numItems,
        interval,
      });
      
      draggedShotGens.forEach((sg, i) => {
        const newFrame = predecessor.timeline_frame! + (interval * (i + 1));
        pushUpdate(sg.id, newFrame, `Distributed in gap (${i + 1}/${numItems})`);
      });
      
    } else if (predecessor && predecessor.timeline_frame != null) {
      // At end - extend timeline using average spacing of existing items
      const existingFrames = allItems
        .filter(item => item.timeline_frame != null)
        .map(item => item.timeline_frame!);
      const spacing = calculateAverageSpacing(existingFrames, DEFAULT_FRAME_SPACING);
      
      console.log('[DataTrace] 🎯 Distribution calculation (at end):', {
        predecessorFrame: predecessor.timeline_frame,
        numItems: draggedItemIds.length,
        spacing,
      });
      
      draggedShotGens.forEach((sg, i) => {
        const newFrame = predecessor.timeline_frame! + (spacing * (i + 1));
        pushUpdate(sg.id, newFrame, `Extend at end (${i + 1}/${draggedItemIds.length})`);
      });
      
    } else if (successor && successor.timeline_frame != null) {
      // At start - distribute between 0 and successor
      const gap = successor.timeline_frame;
      const numItems = draggedItemIds.length;
      const interval = gap / (numItems + 1);
      
      console.log('[DataTrace] 🎯 Distribution calculation (at start):', {
        successorFrame: successor.timeline_frame,
        gap,
        numItems,
        interval,
      });
      
      draggedShotGens.forEach((sg, i) => {
        const newFrame = interval * (i + 1);
        pushUpdate(sg.id, newFrame, `Distributed from start (${i + 1}/${numItems})`);
      });
      
    } else {
      // First items in timeline - start at 0 and space by default
      console.log('[DataTrace] 🎯 Distribution calculation (first items):', {
        numItems: draggedItemIds.length,
        spacing: DEFAULT_FRAME_SPACING,
      });
      
      draggedShotGens.forEach((sg, i) => {
        const newFrame = DEFAULT_FRAME_SPACING * i;
        pushUpdate(sg.id, newFrame, `Initial placement (${i + 1}/${draggedItemIds.length})`);
      });
    }

    // Deduplicate updates
    const uniqueUpdates = new Map<string, { newFrame: number; reason: string }>();
    accumulateUpdates.forEach(entry => {
      const existing = uniqueUpdates.get(entry.id);
      if (!existing || existing.newFrame !== entry.newFrame) {
        uniqueUpdates.set(entry.id, { newFrame: entry.newFrame, reason: entry.reason });
      }
    });

    // Execute all updates in parallel
    const updatePromises = Array.from(uniqueUpdates.entries()).map(async ([id, payload]) => {
      console.log('[DataTrace] 🎯 Updating timeline_frame:', {
        shotGenId: id.substring(0, 8),
        targetFrame: payload.newFrame,
        reason: payload.reason,
      });

      const { error } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: payload.newFrame })
        .eq('id', id)
        .eq('shot_id', shotId);

      if (error) {
        console.error('[DataTrace] 🚫 Update failed:', error);
        throw error;
      }
    });

    await Promise.all(updatePromises);

    console.log('[DataTrace] ✅ All distribution updates complete, refetching in background');
    queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
    queryClient.refetchQueries({ queryKey: ['shot-generations-meta', shotId] });
    if (projectId) {
      queryClient.refetchQueries({ queryKey: ['shots', projectId] });
    }
  }, [shotId, shotGenerations, loadPositions, queryClient, projectId]);

  /**
   * Update timeline frame for a single generation
   */
  const updateTimelineFrame = useCallback(async (generationId: string, frame: number) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    console.log('[TimelinePositionUtils] Updating timeline frame', {
      shotId: shotId.substring(0, 8),
      generationId: generationId.substring(0, 8),
      frame,
      totalGenerations: shotGenerations.length,
    });

    // Find the shot_generation record - try multiple lookup strategies
    let shotGen = shotGenerations.find(sg => sg.generation_id === generationId);
    
    // Fallback: maybe the passed ID is actually the shot_generation ID
    if (!shotGen) {
      shotGen = shotGenerations.find(sg => sg.id === generationId);
      if (shotGen) {
        console.log('[TimelinePositionUtils] ⚠️ Used fallback lookup by shot_generation ID (should not happen with allGenerations prop)');
      }
    }
    
    // If still not found, this is a data consistency error
    if (!shotGen?.id) {
      console.error('[TimelinePositionUtils] ❌ Generation not found in provided data:', {
        lookingFor: generationId.substring(0, 8),
        availableGenIds: shotGenerations.map(sg => sg.generation_id?.substring(0, 8)),
        availableShotGenIds: shotGenerations.map(sg => sg.id?.substring(0, 8)),
      });
      throw new Error(`Shot generation not found for generation ${generationId} - this indicates a data flow issue`);
    }

    const { error } = await supabase
      .from('shot_generations')
      .update({ timeline_frame: frame })
      .eq('id', shotGen.id)
      .eq('shot_id', shotId);

    if (error) {
      throw error;
    }
    
    // Sync shot_data in background for fast loading stability (Phase 1)
    // IMPORTANT: Await this so it completes BEFORE refetchQueries runs
    if (shotGen.generation_id) {
      await syncShotData(shotGen.generation_id, shotId, frame);
    }

    // Refetch instead of invalidate to preserve data
    queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
    queryClient.refetchQueries({ queryKey: ['shot-generations-meta', shotId] });
    if (projectId) {
      queryClient.refetchQueries({ queryKey: ['shots', projectId] });
    }
  }, [shotId, shotGenerations, loadPositions, queryClient, projectId, syncShotData]);

  /**
   * Batch exchange positions between generations
   * Supports both absolute frame updates and pair swaps
   */
  const batchExchangePositions = useCallback(async (
    exchanges: Array<{ id: string; newFrame: number } | { shotGenerationIdA: string; shotGenerationIdB: string }>
  ) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    console.log('[TimelinePositionUtils] Batch exchanging positions', {
      shotId: shotId.substring(0, 8),
      exchangeCount: exchanges.length,
      exchangeType: 'id' in exchanges[0] ? 'absolute' : 'pair-swap'
    });

    // Handle pair swaps (from drag reorder)
    if (exchanges.length > 0 && 'shotGenerationIdA' in exchanges[0]) {
      const pairSwaps = exchanges as Array<{ shotGenerationIdA: string; shotGenerationIdB: string }>;
      
      console.log('[TimelinePositionUtils] Processing pair swaps', {
        swapCount: pairSwaps.length
      });
      
      // Get current frames for all involved items and perform swaps
      const swapUpdates = pairSwaps.map(async (swap) => {
        // Try multiple lookup strategies for both items
        let sgA = shotGenerations.find(sg => sg.id === swap.shotGenerationIdA);
        if (!sgA) {
          sgA = shotGenerations.find(sg => sg.generation_id === swap.shotGenerationIdA);
        }
        
        let sgB = shotGenerations.find(sg => sg.id === swap.shotGenerationIdB);
        if (!sgB) {
          sgB = shotGenerations.find(sg => sg.generation_id === swap.shotGenerationIdB);
        }
        
        if (!sgA || !sgB) {
          console.warn('[TimelinePositionUtils] Shot generation not found for swap:', {
            swapA: swap.shotGenerationIdA.substring(0, 8),
            swapB: swap.shotGenerationIdB.substring(0, 8),
            foundA: !!sgA,
            foundB: !!sgB,
          });
          return;
        }
        
        const frameA = sgA.timeline_frame;
        const frameB = sgB.timeline_frame;
        
        console.log('[TimelinePositionUtils] Swapping frames:', {
          sgA: sgA.id.substring(0, 8),
          sgB: sgB.id.substring(0, 8),
          frameA,
          frameB,
        });
        
        // Swap the frames
        const updateA = supabase
          .from('shot_generations')
          .update({ timeline_frame: frameB })
          .eq('id', sgA.id)
          .eq('shot_id', shotId);
          
        const updateB = supabase
          .from('shot_generations')
          .update({ timeline_frame: frameA })
          .eq('id', sgB.id)
          .eq('shot_id', shotId);
        
        // Sync shot_data for fast loading (Phase 1) - Ensure completion before refetch
        const syncPromises = [];
        if (sgA.generation_id) syncPromises.push(syncShotData(sgA.generation_id, shotId, frameB));
        if (sgB.generation_id) syncPromises.push(syncShotData(sgB.generation_id, shotId, frameA));

        // Await both updates and syncs
        const [resA, resB] = await Promise.all([updateA, updateB, ...syncPromises]);
        
        if (resA.error) throw resA.error;
        if (resB.error) throw resB.error;
      });
      
      await Promise.all(swapUpdates);
      
      console.log('[TimelinePositionUtils] All swaps complete, refetching in background');
      
      // Use refetchQueries instead of invalidate to preserve data during sync
      queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
      queryClient.refetchQueries({ queryKey: ['shot-generations-meta', shotId] });
      if (projectId) {
        queryClient.refetchQueries({ queryKey: ['shots', projectId] });
      }
      return;
    }

    // Handle absolute frame updates (from timeline drag)
    const absoluteUpdates = exchanges as Array<{ id: string; newFrame: number }>;
    const updates = absoluteUpdates.map(async ({ id, newFrame }) => {
      // Try multiple lookup strategies
      let shotGen = shotGenerations.find(sg => sg.generation_id === id);
      
      // Fallback: maybe the passed ID is the shot_generation ID
      if (!shotGen) {
        shotGen = shotGenerations.find(sg => sg.id === id);
        if (shotGen) {
          console.log('[TimelinePositionUtils] ⚠️ Used fallback lookup for batch update');
        }
      }
      
      // If still not found, skip this update
      if (!shotGen?.id) {
        console.error('[TimelinePositionUtils] ❌ Shot generation not found for batch update:', id.substring(0, 8));
        return;
      }

      // Sync shot_data for fast loading (Phase 1) - Start in parallel
      const syncPromise = shotGen.generation_id 
        ? syncShotData(shotGen.generation_id, shotId, newFrame)
        : Promise.resolve();

      const { error } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: newFrame })
        .eq('id', shotGen.id)
        .eq('shot_id', shotId);
        
      // Ensure sync completes before finishing this update promise
      await syncPromise;

      if (error) {
        console.error('[TimelinePositionUtils] Error updating position:', error);
        throw error;
      }
    });

    await Promise.all(updates);

    // Refetch instead of invalidate to preserve data
    console.log('[TimelinePositionUtils] All absolute updates complete, refetching in background');
    queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
    queryClient.refetchQueries({ queryKey: ['shot-generations-meta', shotId] });
    if (projectId) {
      queryClient.refetchQueries({ queryKey: ['shots', projectId] });
    }
  }, [shotId, shotGenerations, loadPositions, queryClient, projectId, syncShotData]);

  /**
   * Initialize timeline frames for unpositioned images
   */
  const initializeTimelineFrames = useCallback(async (
    frameSpacing: number
  ) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    console.log('[TimelinePositionUtils] Initializing timeline frames', {
      shotId: shotId.substring(0, 8),
      frameSpacing
    });

    // Find unpositioned generations
    const unpositioned = shotGenerations.filter(sg => sg.timeline_frame === null);

    if (unpositioned.length === 0) {
      console.log('[TimelinePositionUtils] No unpositioned generations to initialize');
      return;
    }

    // Assign sequential frames
    const updates = unpositioned.map((sg, index) => ({
      id: sg.generation_id,
      newFrame: index * frameSpacing
    }));

    await batchExchangePositions(updates);
  }, [shotId, shotGenerations, batchExchangePositions]);

  /**
   * Update pair prompt for a specific pair
   * @param shotGenerationId - The shot_generation.id (NOT generation_id)
   */
  const updatePairPrompts = useCallback(async (
    shotGenerationId: string,
    prompt: string,
    negativePrompt: string
  ) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    console.log('[PairPromptFlow] 🔧 useTimelinePositionUtils.updatePairPrompts START:', {
      shotGenerationId: shotGenerationId.substring(0, 8),
      shotId: shotId.substring(0, 8),
      promptLength: prompt?.length || 0,
      negativePromptLength: negativePrompt?.length || 0,
      hasPrompt: !!prompt,
      hasNegativePrompt: !!negativePrompt,
    });

    // Look up by shot_generation.id (which is sg.id in our data structure)
    const shotGen = shotGenerations.find(sg => sg.id === shotGenerationId);
    if (!shotGen?.id) {
      console.error('[PairPromptFlow] ❌ Shot generation not found:', {
        lookingForShotGenId: shotGenerationId.substring(0, 8),
        availableShotGenIds: shotGenerations.map(sg => sg.id?.substring(0, 8)),
        availableGenerationIds: shotGenerations.map(sg => sg.generation_id?.substring(0, 8)),
      });
      throw new Error(`Shot generation not found for shot_generation.id ${shotGenerationId}`);
    }

    console.log('[PairPromptFlow] 📝 Found shot_generation, preparing metadata update:', {
      shotGenerationId: shotGen.id.substring(0, 8),
      existingPairPrompt: shotGen.metadata?.pair_prompt?.substring(0, 30) || '(none)',
      newPairPrompt: prompt?.substring(0, 30) || '(empty)',
      existingMetadataKeys: Object.keys(shotGen.metadata || {}),
    });

    // Use new format for writing
    let updatedMetadata = writeSegmentOverrides(
      shotGen.metadata as Record<string, any> | null,
      {
        prompt: prompt,
        negativePrompt: negativePrompt,
      }
    );
    // Clean up old fields (migration cleanup)
    delete updatedMetadata.pair_prompt;
    delete updatedMetadata.pair_negative_prompt;

    console.log('[PairPromptFlow] 💾 Executing Supabase UPDATE on shot_generations table...', {
      table: 'shot_generations',
      shotGenerationId: shotGen.id.substring(0, 8),
      updatingFields: ['metadata.pair_prompt', 'metadata.pair_negative_prompt'],
    });
    
    const { data, error } = await supabase
      .from('shot_generations')
      .update({ metadata: updatedMetadata as any })
      .eq('id', shotGen.id)
      .select();

    if (error) {
      console.error('[PairPromptFlow] ❌ Supabase UPDATE FAILED:', error);
      throw error;
    }

    console.log('[PairPromptFlow] ✅ Supabase UPDATE SUCCESS');
    console.log('[PairPromptFlow] 📊 Updated record returned from DB:', {
      id: data?.[0]?.id?.substring(0, 8),
      metadata: data?.[0]?.metadata,
      metadata_pair_prompt: (data?.[0]?.metadata as any)?.pair_prompt?.substring(0, 50),
      metadata_pair_negative_prompt: (data?.[0]?.metadata as any)?.pair_negative_prompt?.substring(0, 50),
    });
    console.log('[PairPromptFlow] 🔄 Refetching query caches in background...');

    // Refetch instead of invalidate
    queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
    queryClient.refetchQueries({ queryKey: ['shot-generations-meta', shotId] });
    if (projectId) {
      queryClient.refetchQueries({ queryKey: ['shots', projectId] });
    }

    // Also invalidate pair-metadata cache used by useSegmentSettings modal
    queryClient.invalidateQueries({ queryKey: ['pair-metadata', shotGen.id] });

    console.log('[PairPromptFlow] ✅ Refetch queued - UI should refresh with new data');
  }, [shotId, shotGenerations, loadPositions, queryClient, projectId]);

  /**
   * Clear enhanced prompt for a generation
   * @param shotGenerationId - The shot_generation.id (NOT generation_id)
   */
  const clearEnhancedPrompt = useCallback(async (shotGenerationId: string) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    console.log('[PairPromptFlow] 🧹 Clearing enhanced prompt for shot_generation:', shotGenerationId.substring(0, 8));

    // Look up by shot_generation.id
    const shotGen = shotGenerations.find(sg => sg.id === shotGenerationId);
    if (!shotGen?.id) {
      console.error('[PairPromptFlow] ❌ Shot generation not found for clear:', {
        lookingForShotGenId: shotGenerationId.substring(0, 8),
        availableShotGenIds: shotGenerations.map(sg => sg.id?.substring(0, 8)),
      });
      throw new Error(`Shot generation not found for shot_generation.id ${shotGenerationId}`);
    }

    const existingMetadata = shotGen.metadata || {};
    const { enhanced_prompt, ...restMetadata } = existingMetadata;

    console.log('[PairPromptFlow] 💾 Clearing enhanced_prompt from metadata...');

    const { error } = await supabase
      .from('shot_generations')
      .update({ metadata: restMetadata as any })
      .eq('id', shotGen.id);

    if (error) {
      console.error('[PairPromptFlow] ❌ Failed to clear enhanced prompt:', error);
      throw error;
    }

    console.log('[PairPromptFlow] ✅ Enhanced prompt cleared, refetching caches...');
    queryClient.refetchQueries({ queryKey: ['all-shot-generations', shotId] });
    queryClient.refetchQueries({ queryKey: ['shot-generations-meta', shotId] });
    if (projectId) {
      queryClient.refetchQueries({ queryKey: ['shots', projectId] });
    }

    // Also invalidate pair-metadata cache used by useSegmentSettings modal
    queryClient.invalidateQueries({ queryKey: ['pair-metadata', shotGenerationId] });

    console.log('[PairPromptFlow] ✅ Refetch queued');
  }, [shotId, shotGenerations, loadPositions]);

  return {
    // Data (backward compatibility)
    shotGenerations,
    pairPrompts,
    isLoading,
    error,
    
    // Utilities
    loadPositions,
    updateTimelineFrame,
    batchExchangePositions,
    initializeTimelineFrames,
    updatePairPrompts,
    clearEnhancedPrompt,
    moveItemsToMidpoint, // NEW: Midpoint-based reordering (single or multi)
  };
}

