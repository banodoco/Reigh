import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';
import { transformForTimeline, type RawShotGeneration, calculateDerivedCounts } from '@/shared/lib/generationTransformers';
import { timelineDebugger } from '@/tools/travel-between-images/components/Timeline/utils/timeline-debug';
import { isVideoGeneration, isVideoShotGeneration, isPositioned, type ShotGenerationLike } from '@/shared/lib/typeGuards';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';
import { calculateNextAvailableFrame, extractExistingFrames, DEFAULT_FRAME_SPACING } from '@/shared/utils/timelinePositionCalculator';


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

/**
 * Enhanced hook for managing shot positions with unified timeline and batch support
 */
export const useEnhancedShotPositions = (shotId: string | null, isDragInProgress?: boolean) => {
  const [shotGenerations, setShotGenerations] = useState<ShotGeneration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isPersistingPositions, setIsPersistingPositions] = useState(false);
  const queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();
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
      // CRITICAL: Filter out videos AND items without valid locations at the source level
      // This ensures UI counts match task creation counts (see generateVideoService.ts)
      // Uses canonical isVideoShotGeneration from typeGuards
      const shotGenerationsData = (data || [])
        .filter(sg => {
          const gen = sg.generation as any;
          const hasValidLocation = gen?.location && gen.location !== '/placeholder.svg';
          return sg.generation && !isVideoShotGeneration(sg as ShotGenerationLike) && hasValidLocation;
        })
        .map(sg => ({
          id: sg.id,
          shot_id: sg.shot_id,
          generation_id: sg.generation_id,
          timeline_frame: sg.timeline_frame,
          metadata: sg.metadata as PositionMetadata,
          generation: sg.generation as any
        }));

      // Badge data (derivedCount, hasUnviewedVariants, unviewedVariantCount) is now loaded
      // lazily via useVariantBadges hook to avoid blocking gallery display

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
        const isAllShotGenerations = queryKey[0] === 'all-shot-generations' && queryKey[1] === shotId;

        // Block shot-related invalidations during drag operations
        const shouldReload = (
          (isUnifiedGenerationsShot && !isDragInProgress && !isPersistingPositions) ||
          (isShotsProject && !isDragInProgress && !isPersistingPositions) ||
          (isShotGenerations && !isDragInProgress && !isPersistingPositions) || // 🚀 Listen for shot-generations invalidations (e.g., upscale completion)
          (isAllShotGenerations && !isDragInProgress && !isPersistingPositions) || // 🚀 Listen for all-shot-generations (single query approach)
          (queryKey[0] === 'unpositioned-count' && queryKey[1] === shotId)
        );

        if (shouldReload) {
          loadPositions({ reason: 'invalidation' });
        }
      }
    });

    return unsubscribe;
  }, [shotId, queryClient, loadPositions, isPersistingPositions, isDragInProgress]);

  // Realtime: force reload when a generation is updated (e.g., location changed)
  useEffect(() => {
    const handler = (e: any) => {
      if (!shotId) return;
      if (isDragInProgress || isPersistingPositions) return;
      
      // CRITICAL: Generation updates (location, thumbnail, upscale) don't include shot_id
      // They only have project_id. Since we can't easily determine which shot is affected,
      // we reload ALL shot positions when ANY generation in the project updates.
      // This is safe because:
      // 1. Updates are batched (100ms window) to prevent spam
      // 2. loadPositions is already optimized with query caching
      // 3. Generation updates are relatively rare (only when videos finish processing)
      
      console.log('[SimpleRealtime] 🔄 Generation update detected, reloading shot positions:', {
        shotId: shotId.substring(0, 8),
        reason: 'generation-update',
        timestamp: Date.now()
      });
      
      loadPositions({ reason: 'invalidation', silent: true });
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
  // NOTE: NOT using useCallback here to ensure we always get fresh shotGenerations with derivedCount
  const getImagesForMode = (mode: 'batch' | 'timeline'): GenerationRow[] => {
    // Transform to GenerationRow, then filter videos using canonical function
    const images = shotGenerations
      .filter(sg => sg.generation)
      .map(sg => {
        const transformed = transformForTimeline(sg as any as RawShotGeneration);
        return transformed;
      })
      .filter(img => !isVideoGeneration(img));

    if (mode === 'timeline') {
      // CRITICAL FIX: For timeline mode, only include items with valid timeline_frame
      // This prevents unpositioned items (timeline_frame = NULL or -1) from appearing on timeline
      // NOTE: -1 is used as sentinel value in useTimelinePositionUtils
      const positionedImages = images.filter(img => {
        const hasTimelineFrame = img.timeline_frame !== null && img.timeline_frame !== undefined && img.timeline_frame >= 0;
        
        // [MagicEditTaskDebug] Log filtering decisions for magic edit generations
        if (img.type === 'image_edit' || (img as any).params?.tool_type === 'magic-edit') {
          console.log('[MagicEditTaskDebug] Timeline mode filtering magic edit generation:', {
            id: img.id?.substring(0, 8), // shot_generations.id
            generation_id: img.generation_id?.substring(0, 8),
            timeline_frame: img.timeline_frame,
            hasTimelineFrame,
            willAppearOnTimeline: hasTimelineFrame,
            type: img.type
          });
        }
        
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
      // NOTE: -1 is used as sentinel value in useTimelinePositionUtils
      const positionedImages = images.filter(img => {
        const hasTimelineFrame = img.timeline_frame !== null && img.timeline_frame !== undefined && img.timeline_frame >= 0;
        
        // [MagicEditTaskDebug] Log filtering decisions for magic edit generations in batch mode
        if (img.type === 'image_edit' || (img as any).params?.tool_type === 'magic-edit') {
          console.log('[MagicEditTaskDebug] Batch mode filtering magic edit generation:', {
            id: img.id?.substring(0, 8), // shot_generations.id
            generation_id: img.generation_id?.substring(0, 8),
            timeline_frame: img.timeline_frame,
            hasTimelineFrame,
            willAppearInBatch: hasTimelineFrame,
            type: img.type
          });
        }
        
        return hasTimelineFrame;
      });
      
      // Sort positioned images by timeline_frame
      return positionedImages.sort((a, b) => {
        const frameA = a.timeline_frame!; // Safe to use ! since we filtered for non-null
        const frameB = b.timeline_frame!;
        return frameA - frameB;
      });
    }
  };

  // Helper function to clear enhanced prompts for specific generation IDs
  const clearEnhancedPromptsForGenerations = useCallback(async (shotGenerationIds: string[]) => {
    if (!shotId || shotGenerationIds.length === 0) return;

    try {
      console.log('[PromptClearLog] 🔔 POSITION CHANGE - Starting selective clear', {
        trigger: 'position_change',
        shotId: shotId.substring(0, 8),
        affectedCount: shotGenerationIds.length,
        shotGenerationIds: shotGenerationIds.map(id => id.substring(0, 8))
      });

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
        console.log('[EnhancedPrompts-Position] No generations found to clear');
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

      const results = await Promise.all(updates);
      const successCount = results.filter(r => r.success).length;
      
      console.log(`[PromptClearLog] ✅ POSITION CHANGE - Successfully cleared prompts`, {
        trigger: 'position_change',
        successCount,
        totalCount: generations.length,
        shotId: shotId.substring(0, 8)
      });

      // Invalidate cache to refresh UI
      invalidateGenerations(shotId, { reason: 'clear-enhanced-prompts-for-generations', scope: 'all' });
    } catch (err) {
      console.error('[clearEnhancedPromptsForGenerations] Error:', err);
      // Don't throw - position changes should still succeed even if prompt clearing fails
    }
  }, [shotId, queryClient]);

  // Get generation IDs that are adjacent to a given timeline_frame
  const getAdjacentGenerationIds = useCallback((timelineFrame: number): string[] => {
    if (!timelineFrame) return [];
    
    // Sort all generations by timeline_frame, filtering out videos
    // Uses canonical isVideoShotGeneration from typeGuards
    const sorted = [...shotGenerations]
      .filter(sg => sg.timeline_frame != null && !isVideoShotGeneration(sg))
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
      .filter(sg => sg.timeline_frame != null && !isVideoShotGeneration(sg))
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
        
        console.log(`[PromptClearLog] 🔔 EXCHANGE POSITIONS - Clearing prompts for swapped items`, {
          trigger: 'exchange_positions',
          itemA: itemA.id.substring(0, 8),
          itemB: itemB.id.substring(0, 8),
          itemBeforeA: itemBeforeA?.substring(0, 8) || 'none',
          itemBeforeB: itemBeforeB?.substring(0, 8) || 'none',
          totalToClear: itemsToClear.size,
          shotId: shotId.substring(0, 8)
        });
        
        clearEnhancedPromptsForGenerations(Array.from(itemsToClear)).catch(err => {
          console.error('[PromptClearLog] ❌ EXCHANGE POSITIONS - Error clearing enhanced prompts:', err);
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
      
      console.log(`[PromptClearLog] 🔔 BATCH EXCHANGE - Clearing prompts for swapped items`, {
        trigger: 'batch_exchange',
        itemA: shotGenerationIdA.substring(0, 8),
        itemB: shotGenerationIdB.substring(0, 8),
        itemBeforeA: itemBeforeA?.substring(0, 8) || 'none',
        itemBeforeB: itemBeforeB?.substring(0, 8) || 'none',
        totalToClear: itemsToClear.size,
        shotId: shotId.substring(0, 8)
      });
      
      clearEnhancedPromptsForGenerations(Array.from(itemsToClear)).catch(err => {
        console.error('[PromptClearLog] ❌ BATCH EXCHANGE - Error clearing enhanced prompts:', err);
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
    
    // Calculate next available frame using centralized function if not provided
    let nextFrame: number;
    if (timelineFrame !== undefined) {
      nextFrame = timelineFrame;
    } else if (position !== undefined) {
      // Legacy: convert position to frame
      nextFrame = position * DEFAULT_FRAME_SPACING;
    } else {
      // Use centralized calculator - extracts existing frames and calculates next available
      const existingFrames = extractExistingFrames(shotGenerations);
      nextFrame = calculateNextAvailableFrame(existingFrames);
    }


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

    // Get the item's current state BEFORE the move
    const movedItem = shotGenerations.find(sg => sg.id === shotGenerationId);
    const oldTimelineFrame = movedItem?.timeline_frame;

    // Get the current order of items (excluding videos)
    // Uses canonical isVideoShotGeneration from typeGuards
    const oldOrderedItems = shotGenerations
      .filter(sg => sg.generation && !isVideoShotGeneration(sg) && sg.timeline_frame != null)
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
        console.log(`[TimelineDragFlow] [DB_ERROR] ❌ Session: ${dragSessionId} | Database update failed for shot_generation ${shotGenerationId.substring(0, 8)}:`, error);
        throw error;
      }

      console.log(`[TimelineDragFlow] [DB_SUCCESS] ✅ Session: ${dragSessionId} | Successfully updated shot_generation ${shotGenerationId.substring(0, 8)} to frame ${newTimelineFrame}`);
      
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
        // Filter out videos using canonical function
        const nonVideoGens = updatedGenerations.filter(sg => 
          sg.generation && !isVideoShotGeneration(sg as ShotGenerationLike)
        );
        
        newIndex = nonVideoGens.findIndex(sg => sg.id === shotGenerationId);
        
        // Order changed if the item's position in the sequence changed
        if (newIndex !== -1 && oldIndex !== -1 && newIndex !== oldIndex) {
          orderChanged = true;
          console.log(`[TimelineDragFlow] [ORDER_CHANGE] 📊 Order changed: ${oldIndex} → ${newIndex}`);
          
          // Get new neighbors
          if (newIndex > 0) newAdjacentIds.push(nonVideoGens[newIndex - 1].id);
          if (newIndex < nonVideoGens.length - 1) newAdjacentIds.push(nonVideoGens[newIndex + 1].id);
        } else {
          console.log(`[TimelineDragFlow] [ORDER_SAME] ✓ Order unchanged (frame spacing adjusted): ${oldIndex} → ${newIndex}`);
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
          const nonVideoGens = updatedGenerations.filter(sg => 
            sg.generation && !isVideoShotGeneration(sg as ShotGenerationLike)
          );
          newPrevious = nonVideoGens[newIndex - 1]?.id || null;
          if (newPrevious && newPrevious !== oldPrevious) {
            itemsToClear.push(newPrevious);
          }
        }
        
        console.log(`[PromptClearLog] 🔔 TIMELINE DRAG - Clearing prompts for reordered items`, {
          trigger: 'timeline_drag_reorder',
          movedItem: shotGenerationId.substring(0, 8),
          oldIndex,
          newIndex,
          oldPrevious: oldPrevious?.substring(0, 8) || 'none',
          newPrevious: newPrevious?.substring(0, 8) || 'none',
          totalToClear: itemsToClear.length,
          shotId: shotId.substring(0, 8)
        });
        
        // Clear prompts and AWAIT it to ensure consistency before UI updates
        await clearEnhancedPromptsForGenerations(itemsToClear);
      } else {
        console.log(`[PromptClearLog] ⏭️ TIMELINE DRAG - Skipped (order unchanged, only spacing adjusted)`, {
          trigger: 'timeline_drag_spacing_only',
          movedItem: shotGenerationId.substring(0, 8),
          oldIndex,
          newIndex,
          shotId: shotId.substring(0, 8)
        });
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
        console.log(`[PromptClearLog] 🔔 APPLY TIMELINE FRAMES - Clearing prompts for batch update`, {
          trigger: 'apply_timeline_frames',
          changedItemsCount: changedItems.length,
          totalToClear: itemsToClear.length,
          shotId: shotId.substring(0, 8)
        });
        clearEnhancedPromptsForGenerations(itemsToClear).catch(err => {
          console.error('[PromptClearLog] ❌ APPLY TIMELINE FRAMES - Error clearing enhanced prompts:', err);
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
      // TOP-LEVEL DEBUG: Database UPDATE for pair prompts
      console.error('[updatePairPrompts] DATABASE UPDATE START - generationId:', generationId.substring(0, 8));
      console.error('[updatePairPrompts] DATABASE UPDATE START - pairPrompt:', pairPrompt);
      console.error('[updatePairPrompts] DATABASE UPDATE START - pairNegativePrompt:', pairNegativePrompt);

      // Find the current generation
      const generation = shotGenerations.find(sg => sg.id === generationId);
      if (!generation) {
        console.error('[updatePairPrompts] ERROR - Generation not found:', generationId.substring(0, 8));
        throw new Error(`Generation ${generationId} not found`);
      }

      console.error('[updatePairPrompts] FOUND generation:', generation.id.substring(0, 8));
      console.error('[updatePairPrompts] CURRENT metadata.pair_prompt:', generation.metadata?.pair_prompt);
      console.error('[updatePairPrompts] CURRENT metadata.pair_negative_prompt:', generation.metadata?.pair_negative_prompt);
      console.error('[updatePairPrompts] CURRENT metadata.enhanced_prompt:', generation.metadata?.enhanced_prompt);

      // Check if there was an enhanced_prompt to clear
      const hadEnhancedPrompt = !!generation.metadata?.enhanced_prompt?.trim();
      
      // Log before clearing if there was an enhanced prompt
      if (hadEnhancedPrompt) {
        console.log('[PromptClearLog] 🔔 MANUAL PAIR PROMPT EDIT - Clearing enhanced prompt for this pair', {
          trigger: 'manual_pair_prompt_edit',
          shotGenerationId: generationId.substring(0, 8),
          shotId: shotId.substring(0, 8),
          pairIndex: 'N/A (clearing single pair)',
          hadEnhancedPrompt: true,
          enhancedPromptPreview: generation.metadata?.enhanced_prompt?.substring(0, 50) || ''
        });
      }

      // Update metadata with pair prompts
      // CRITICAL: Clear enhanced_prompt when user manually edits pair_prompt
      const updatedMetadata: PositionMetadata = {
        ...generation.metadata,
        pair_prompt: pairPrompt?.trim() || undefined,
        pair_negative_prompt: pairNegativePrompt?.trim() || undefined,
        enhanced_prompt: '', // Clear enhanced prompt when manually editing
      };

      console.error('[updatePairPrompts] NEW metadata.pair_prompt:', updatedMetadata.pair_prompt);
      console.error('[updatePairPrompts] NEW metadata.pair_negative_prompt:', updatedMetadata.pair_negative_prompt);
      console.error('[updatePairPrompts] NEW metadata.enhanced_prompt:', updatedMetadata.enhanced_prompt);

      // Update in database
      const { data, error } = await supabase
        .from('shot_generations')
        .update({ 
          metadata: updatedMetadata as any, // Cast to any for JSON compatibility
        })
        .eq('id', generationId)
        .select()
        .single();

      console.error('[updatePairPrompts] DATABASE UPDATE RESPONSE - error:', error);
      console.error('[updatePairPrompts] DATABASE UPDATE RESPONSE - hasData:', !!data);
      console.error('[updatePairPrompts] DATABASE UPDATE RESPONSE - data.id:', data?.id?.substring(0, 8));
      const responseMetadata = data?.metadata as PositionMetadata | null;
      console.error('[updatePairPrompts] DATABASE UPDATE RESPONSE - data.metadata.pair_prompt:', responseMetadata?.pair_prompt);
      console.error('[updatePairPrompts] DATABASE UPDATE RESPONSE - data.metadata.pair_negative_prompt:', responseMetadata?.pair_negative_prompt);
      console.error('[updatePairPrompts] DATABASE UPDATE RESPONSE - data.metadata.enhanced_prompt:', responseMetadata?.enhanced_prompt);

      if (error) {
        console.error('[PairPrompts] Error updating pair prompts:', error);
        if (hadEnhancedPrompt) {
          console.error('[PromptClearLog] ❌ MANUAL PAIR PROMPT EDIT - Failed to clear enhanced prompt', {
            trigger: 'manual_pair_prompt_edit',
            error: error.message,
            shotGenerationId: generationId.substring(0, 8)
          });
        }
        throw error;
      }

      // Log success if we cleared an enhanced prompt
      if (hadEnhancedPrompt) {
        console.log('[PromptClearLog] ✅ MANUAL PAIR PROMPT EDIT - Successfully cleared enhanced prompt', {
          trigger: 'manual_pair_prompt_edit',
          shotGenerationId: generationId.substring(0, 8),
          shotId: shotId.substring(0, 8),
          pairPromptSet: !!pairPrompt?.trim(),
          pairNegativePromptSet: !!pairNegativePrompt?.trim()
        });
      }

      console.log('[PairPrompts] ✅ Database updated successfully, now updating local state and invalidating cache');

      // Update local state
      setShotGenerations(prev => prev.map(sg =>
        sg.id === generationId
          ? { ...sg, metadata: updatedMetadata }
          : sg
      ));

      // CRITICAL: Invalidate query cache to ensure other components see the update
      // This prevents stale data from being loaded when other operations trigger cache invalidation
      invalidateGenerations(shotId, { reason: 'update-pair-prompts', scope: 'all' });
    } catch (err) {
      console.error('[updatePairPrompts] Error:', err);
      throw err;
    }
  }, [shotId, shotGenerations, queryClient]);

  // Get pair prompts in Timeline component format as a reactive value
  const pairPrompts = useMemo((): Record<number, { prompt: string; negativePrompt: string }> => {
    // CRITICAL: Filter out videos AND unpositioned images to match the timeline display
    // Uses canonical isVideoShotGeneration from typeGuards
    const filteredGenerations = shotGenerations.filter(sg => 
      sg.generation && sg.timeline_frame != null && !isVideoShotGeneration(sg)
    );

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
    console.log(`[PairPrompts-SAVE] 💾 START updatePairPromptsByIndex for pair ${pairIndex}`);
    
    // CRITICAL: Query fresh shotGenerations from DB to avoid stale data
    // This ensures we're working with the latest data, especially after image replacement
    if (!shotId) {
      console.error('[PairPrompts-SAVE] ❌ No shotId');
      return;
    }
    
    const { data: freshShotGens, error: fetchError } = await supabase
      .from('shot_generations')
      .select(`
        id,
        timeline_frame,
        metadata,
        generation:generations(id, type, location)
      `)
      .eq('shot_id', shotId)
      .not('timeline_frame', 'is', null); // Only positioned images
    
    if (fetchError) {
      console.error('[PairPrompts-SAVE] ❌ Error fetching fresh shotGenerations:', fetchError);
      return;
    }
    
    console.log(`[PairPrompts-SAVE] 🔄 Fetched fresh shotGenerations:`, {
      count: freshShotGens?.length || 0,
      ids: freshShotGens?.map(sg => ({
        id: sg.id.substring(0, 8),
        timeline_frame: sg.timeline_frame
      }))
    });
    
    // CRITICAL: Filter out videos AND unpositioned images to match the timeline display
    // This ensures pair prompt indexes match the visual pairs in the UI
    // Uses canonical isVideoShotGeneration from typeGuards
    const filteredGenerations = (freshShotGens || []).filter(sg => 
      sg.generation && !isVideoShotGeneration(sg)
    );

    console.log(`[PairPrompts-SAVE] 📊 Filtered shotGenerations:`, {
      totalGenerations: freshShotGens?.length || 0,
      afterVideoFilter: filteredGenerations.length,
      filteredIds: filteredGenerations.map((sg, idx) => ({
        arrayIndex: idx,
        shotGenId: sg.id.substring(0, 8),
        timeline_frame: sg.timeline_frame
      }))
    });

    const sortedGenerations = [...filteredGenerations]
      .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));

    console.log(`[PairPrompts-SAVE] 📊 After sorting:`, {
      sortedIds: sortedGenerations.map((sg, idx) => ({
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
    console.log(`[PairPrompts-SAVE] 💾 Saving pair prompt for pair ${pairIndex}:`, {
      shotGenId: firstItem.id.substring(0, 8),
      fullShotGenId: firstItem.id,
      timeline_frame: firstItem.timeline_frame,
      prompt: prompt || '(empty)',
      promptLength: prompt.length,
      negativePrompt: negativePrompt || '(empty)',
      negativePromptLength: negativePrompt.length,
    });
    
    await updatePairPrompts(firstItem.id, prompt, negativePrompt);
    console.log(`[PairPrompts-SAVE] ✅ COMPLETED updatePairPromptsByIndex for pair ${pairIndex}`);
  }, [shotId, updatePairPrompts]);

  // Clear enhanced prompt for a specific pair/generation
  const clearEnhancedPrompt = useCallback(async (generationId: string) => {
    if (!shotId) return;

    try {
      console.log('[EnhancedPrompts] 🧹 Clearing enhanced prompt for generation:', generationId.substring(0, 8));

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

      console.log('[clearEnhancedPrompt] Successfully cleared enhanced prompt');

      // Update local state optimistically
      setShotGenerations(prev => prev.map(sg => 
        sg.id === generationId 
          ? { ...sg, metadata: updatedMetadata }
          : sg
      ));

      // Invalidate queries to refresh data (metadata only)
      invalidateGenerations(shotId, { reason: 'clear-enhanced-prompt', scope: 'metadata' });
      await queryClient.invalidateQueries({ queryKey: ['shots'] });

    } catch (err) {
      console.error('[clearEnhancedPrompt] Error:', err);
      throw err;
    }
  }, [shotId, shotGenerations, queryClient, invalidateGenerations]);

  // Clear all enhanced prompts for the shot (used when base prompt changes)
  const clearAllEnhancedPrompts = useCallback(async () => {
    if (!shotId) return;

    try {
      console.log('[PromptClearLog] 🔔 CLEAR ALL - Starting clear all enhanced prompts', {
        trigger: 'clear_all_enhanced_prompts',
        shotId: shotId.substring(0, 8)
      });

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
        console.log('[EnhancedPrompts] No generations found for shot');
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
      
      console.log(`[PromptClearLog] ✅ CLEAR ALL - Successfully cleared all enhanced prompts`, {
        trigger: 'clear_all_enhanced_prompts',
        successCount,
        totalCount: generations.length,
        shotId: shotId.substring(0, 8)
      });

      // Refresh local state directly - invalidation alone doesn't trigger immediate UI update
      await loadPositions({ silent: true, reason: 'invalidation' });
      
      // Also invalidate cache for other components
      invalidateGenerations(shotId, { reason: 'clear-all-enhanced-prompts', scope: 'all' });
    } catch (err) {
      console.error('[PromptClearLog] ❌ CLEAR ALL - Error clearing enhanced prompts:', err);
      throw err;
    }
  }, [shotId, queryClient, loadPositions]);

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
