import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GenerationRow } from '@/types/shots';

export interface ShotGeneration {
  id: string;
  shot_id: string;
  generation_id: string;
  position: number;
  timeline_frame?: number;
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
}

const DEFAULT_FRAME_SPACING = 60;

/**
 * Enhanced hook for managing shot positions with unified timeline and batch support
 */
export const useEnhancedShotPositions = (shotId: string | null) => {
  const [shotGenerations, setShotGenerations] = useState<ShotGeneration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Load all shot_generations data for the shot
  const loadPositions = useCallback(async () => {
    if (!shotId) {
      setShotGenerations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('shot_generations')
        .select(`
          id,
          shot_id,
          generation_id,
          position,
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
        .order('position', { ascending: true });

      if (fetchError) throw fetchError;

      setShotGenerations(data || []);
      
      console.log('[useEnhancedShotPositions] Loaded positions:', {
        shotId,
        recordCount: data?.length || 0,
        records: data?.map(sg => ({
          generationId: sg.generation_id?.substring(0, 8),
          position: sg.position,
          timelineFrame: sg.timeline_frame
        }))
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load shot positions';
      setError(errorMessage);
      console.error('[useEnhancedShotPositions] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [shotId]);

  // Auto-load on shotId change
  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  // Listen for query invalidations that should trigger a reload
  useEffect(() => {
    if (!shotId) return;

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.isInvalidated) {
        const queryKey = event.query.queryKey;
        
        // Check if this invalidation affects our shot data
        const shouldReload = (
          // Direct shot-specific invalidation (used by duplicate mutation)
          (queryKey[0] === 'unified-generations' && queryKey[1] === 'shot' && queryKey[2] === shotId) ||
          // Shots context invalidation (affects ShotsPane)
          (queryKey[0] === 'shots' && queryKey.includes(shotId)) ||
          // Unpositioned count invalidation
          (queryKey[0] === 'unpositioned-count' && queryKey[1] === shotId)
        );

        if (shouldReload) {
          console.log('[PositionSystemDebug] 🔄 Query invalidation detected, reloading positions:', {
            shotId: shotId.substring(0, 8),
            invalidatedQueryKey: queryKey,
            timestamp: new Date().toISOString()
          });
          loadPositions();
        }
      }
    });

    return unsubscribe;
  }, [shotId, queryClient, loadPositions]);

  // Get positions formatted for specific mode
  const getPositionsForMode = useCallback((mode: 'batch' | 'timeline'): Map<string, number> => {
    const positions = new Map<string, number>();
    
    shotGenerations.forEach(sg => {
      if (mode === 'timeline') {
        // Use timeline_frame if available, fallback to calculated frame
        const frame = sg.timeline_frame ?? (sg.position * DEFAULT_FRAME_SPACING);
        positions.set(sg.generation_id, frame);
      } else {
        // Batch mode uses sequential position
        positions.set(sg.generation_id, sg.position);
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
        position: sg.position,
        timeline_frame: sg.timeline_frame,
        metadata: sg.metadata
      } as GenerationRow & { position: number; timeline_frame?: number }))
      .filter(img => {
        // EXACT same video detection as original ShotEditor/ShotsPane logic
        const isVideo = img.type === 'video' ||
                       img.type === 'video_travel_output' ||
                       (img.location && img.location.endsWith('.mp4')) ||
                       (img.imageUrl && img.imageUrl.endsWith('.mp4'));
        
        if (isVideo) {
          console.log('[PositionSystemDebug] 🎬 Filtering out video from shot editor:', {
            shotId: shotId?.substring(0, 8),
            generationId: img.id.substring(0, 8),
            type: img.type,
            location: img.location?.substring(0, 20) + '...'
          });
        }
        
        return !isVideo; // Exclude videos, just like original system
      });

    // Log filtering summary
    const originalCount = shotGenerations.filter(sg => sg.generation).length;
    const filteredCount = images.length;
    if (originalCount > filteredCount) {
      console.log('[PositionSystemDebug] 📊 Video filtering summary:', {
        shotId: shotId?.substring(0, 8),
        mode,
        originalCount,
        filteredCount,
        videosFiltered: originalCount - filteredCount
      });
    }

    if (mode === 'timeline') {
      // Sort by timeline_frame, fallback to calculated frame
      return images.sort((a, b) => {
        const frameA = a.timeline_frame ?? (a.position * DEFAULT_FRAME_SPACING);
        const frameB = b.timeline_frame ?? (b.position * DEFAULT_FRAME_SPACING);
        return frameA - frameB;
      });
    } else {
      // Sort by sequential position
      return images.sort((a, b) => a.position - b.position);
    }
  }, [shotGenerations]);

  // Exchange positions between two items
  const exchangePositions = useCallback(async (generationIdA: string, generationIdB: string) => {
    if (!shotId) {
      throw new Error('No shot ID provided for position exchange');
    }

    // Get current positions before exchange for logging
    const itemA = shotGenerations.find(sg => sg.generation_id === generationIdA);
    const itemB = shotGenerations.find(sg => sg.generation_id === generationIdB);

    const beforeState = {
      itemA: itemA ? {
        id: generationIdA.substring(0, 8),
        position: itemA.position,
        timelineFrame: itemA.timeline_frame
      } : null,
      itemB: itemB ? {
        id: generationIdB.substring(0, 8),
        position: itemB.position,
        timelineFrame: itemB.timeline_frame
      } : null
    };

    console.log('[PositionSystemDebug] 🔄 STARTING position exchange:', {
      shotId: shotId.substring(0, 8),
      before: beforeState,
      timestamp: new Date().toISOString()
    });

    try {
      const { error } = await supabase.rpc('exchange_shot_positions', {
        p_shot_id: shotId,
        p_generation_id_a: generationIdA,
        p_generation_id_b: generationIdB
      });

      if (error) throw error;

      // Reload positions to reflect changes
      await loadPositions();

      // Get positions after exchange for verification logging
      const updatedGenerations = await supabase
        .from('shot_generations')
        .select('generation_id, position, timeline_frame')
        .eq('shot_id', shotId)
        .in('generation_id', [generationIdA, generationIdB]);

      const afterState = {
        itemA: updatedGenerations.data?.find(sg => sg.generation_id === generationIdA),
        itemB: updatedGenerations.data?.find(sg => sg.generation_id === generationIdB)
      };

      console.log('[PositionSystemDebug] ✅ COMPLETED position exchange:', {
        shotId: shotId.substring(0, 8),
        after: {
          itemA: afterState.itemA ? {
            id: generationIdA.substring(0, 8),
            position: afterState.itemA.position,
            timelineFrame: afterState.itemA.timeline_frame
          } : null,
          itemB: afterState.itemB ? {
            id: generationIdB.substring(0, 8),
            position: afterState.itemB.position,
            timelineFrame: afterState.itemB.timeline_frame
          } : null
        },
        exchangeVerified: beforeState.itemA && afterState.itemA && beforeState.itemB && afterState.itemB
          ? (beforeState.itemA.position === afterState.itemB?.position && 
             beforeState.itemB.position === afterState.itemA?.position &&
             beforeState.itemA.timelineFrame === afterState.itemB?.timeline_frame &&
             beforeState.itemB.timelineFrame === afterState.itemA?.timeline_frame)
          : false,
        timestamp: new Date().toISOString()
      });
      
      toast.success('Positions exchanged successfully');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exchange positions';
      console.error('[PositionSystemDebug] ❌ FAILED position exchange:', {
        shotId: shotId.substring(0, 8),
        before: beforeState,
        error: errorMessage,
        fullError: err,
        timestamp: new Date().toISOString()
      });
      toast.error(`Failed to exchange positions: ${errorMessage}`);
      throw err;
    }
  }, [shotId, shotGenerations, loadPositions]);

  // Exchange positions without reloading (for batch operations)
  const exchangePositionsNoReload = useCallback(async (generationIdA: string, generationIdB: string) => {
    if (!shotId) {
      throw new Error('No shot ID provided for position exchange');
    }

    try {
      const { error } = await supabase.rpc('exchange_shot_positions', {
        p_shot_id: shotId,
        p_generation_id_a: generationIdA,
        p_generation_id_b: generationIdB
      });

      if (error) throw error;

      // No position reload - caller will handle this
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exchange positions';
      console.error('[useEnhancedShotPositions] ❌ Exchange error (no reload):', err);
      throw err;
    }
  }, [shotId]);

  // Batch exchange positions - performs multiple exchanges then reloads once
  const batchExchangePositions = useCallback(async (exchanges: Array<{ generationIdA: string; generationIdB: string }>) => {
    if (!shotId) {
      throw new Error('No shot ID provided for batch position exchange');
    }

    if (exchanges.length === 0) {
      return;
    }

    console.log('[useEnhancedShotPositions] Batch exchange starting:', {
      shotId: shotId.substring(0, 8),
      exchangeCount: exchanges.length,
      exchanges: exchanges.map(ex => ({
        idA: ex.generationIdA.substring(0, 8),
        idB: ex.generationIdB.substring(0, 8)
      }))
    });

    try {
      // Perform all exchanges without reloading positions each time
      for (const exchange of exchanges) {
        await exchangePositionsNoReload(exchange.generationIdA, exchange.generationIdB);
      }

      console.log('[useEnhancedShotPositions] ✅ All exchanges completed, reloading positions once');

      // Single reload after all exchanges are done
      await loadPositions();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to batch exchange positions';
      console.error('[useEnhancedShotPositions] ❌ Batch exchange error:', err);
      toast.error(`Failed to reorder items: ${errorMessage}`);
      throw err;
    }
  }, [shotId, loadPositions, exchangePositionsNoReload]);

  // Delete item and its positions by shot_generations.id (not generation_id to avoid deleting duplicates)
  const deleteItem = useCallback(async (shotGenerationId: string) => {
    if (!shotId) {
      throw new Error('No shot ID provided for item deletion');
    }

    console.log('[PositionSystemDebug] 🗑️ Deleting specific shot generation record:', {
      shotId: shotId.substring(0, 8),
      shotGenerationId: shotGenerationId.substring(0, 8)
    });

    try {
      const { error } = await supabase
        .from('shot_generations')
        .delete()
        .eq('id', shotGenerationId)
        .eq('shot_id', shotId); // Extra safety check

      if (error) throw error;

      // Reload positions to reflect changes
      await loadPositions();
      
      toast.success('Item deleted successfully');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete item';
      console.error('[PositionSystemDebug] ❌ Delete error:', err);
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
      throw new Error('No shot ID provided for adding item');
    }

    const { position, timelineFrame, metadata } = options;
    
    // Calculate next available positions if not provided
    const nextPosition = position ?? Math.max(...shotGenerations.map(sg => sg.position), -1) + 1;
    const nextFrame = timelineFrame ?? (nextPosition * DEFAULT_FRAME_SPACING);

    console.log('[useEnhancedShotPositions] Adding item:', {
      shotId,
      generationId: generationId.substring(0, 8),
      position: nextPosition,
      timelineFrame: nextFrame
    });

    try {
      const { error } = await supabase
        .from('shot_generations')
        .insert({
          shot_id: shotId,
          generation_id: generationId,
          position: nextPosition,
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
      
      toast.success('Item added successfully');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add item';
      console.error('[useEnhancedShotPositions] Add error:', err);
      toast.error(`Failed to add item: ${errorMessage}`);
      throw err;
    }
  }, [shotId, shotGenerations, loadPositions]);

  // Update timeline frame for specific item
  const updateTimelineFrame = useCallback(async (
    generationId: string, 
    newTimelineFrame: number,
    metadata?: Partial<PositionMetadata>
  ) => {
    if (!shotId) {
      throw new Error('No shot ID provided for timeline frame update');
    }

    // Get current state for logging
    const currentItem = shotGenerations.find(sg => sg.generation_id === generationId);
    const beforeFrame = currentItem?.timeline_frame;

    console.log('[PositionSystemDebug] 🎯 STARTING frame update:', {
      shotId: shotId.substring(0, 8),
      itemId: generationId.substring(0, 8),
      fromFrame: beforeFrame,
      toFrame: newTimelineFrame,
      metadata,
      timestamp: new Date().toISOString()
    });

    try {
      const { error } = await supabase
        .from('shot_generations')
        .update({ 
          timeline_frame: newTimelineFrame,
          metadata: metadata ? { ...metadata } : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('shot_id', shotId)
        .eq('generation_id', generationId);

      if (error) throw error;

      // Optimistically update local state
      setShotGenerations(prev => prev.map(sg => 
        sg.generation_id === generationId 
          ? { ...sg, timeline_frame: newTimelineFrame, metadata: { ...sg.metadata, ...metadata } }
          : sg
      ));

      console.log('[PositionSystemDebug] ✅ COMPLETED frame update:', {
        shotId: shotId.substring(0, 8),
        itemId: generationId.substring(0, 8),
        fromFrame: beforeFrame,
        toFrame: newTimelineFrame,
        updateVerified: true,
        timestamp: new Date().toISOString()
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update timeline frame';
      console.error('[PositionSystemDebug] ❌ FAILED frame update:', {
        shotId: shotId.substring(0, 8),
        itemId: generationId.substring(0, 8),
        fromFrame: beforeFrame,
        toFrame: newTimelineFrame,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      toast.error(`Failed to update timeline position: ${errorMessage}`);
      throw err;
    }
  }, [shotId, shotGenerations]);

  // Initialize timeline frames for existing records without them
  const initializeTimelineFrames = useCallback(async (frameSpacing: number = DEFAULT_FRAME_SPACING) => {
    if (!shotId) {
      throw new Error('No shot ID provided for timeline initialization');
    }

    // Count items that need initialization
    const itemsNeedingFrames = shotGenerations.filter(sg => sg.timeline_frame === null || sg.timeline_frame === undefined);
    
    console.log('[PositionSystemDebug] 🚀 STARTING timeline initialization:', {
      shotId: shotId.substring(0, 8),
      totalItems: shotGenerations.length,
      itemsNeedingFrames: itemsNeedingFrames.length,
      frameSpacing,
      itemsToInitialize: itemsNeedingFrames.map(sg => ({
        id: sg.generation_id.substring(0, 8),
        currentPosition: sg.position,
        calculatedFrame: sg.position * frameSpacing
      })),
      timestamp: new Date().toISOString()
    });

    if (itemsNeedingFrames.length === 0) {
      console.log('[PositionSystemDebug] ✅ No initialization needed - all items have timeline frames');
      return 0;
    }

    try {
      const { data, error } = await supabase.rpc('initialize_timeline_frames_for_shot', {
        p_shot_id: shotId,
        p_frame_spacing: frameSpacing
      });

      if (error) throw error;

      const recordCount = data as number;
      
      if (recordCount > 0) {
        await loadPositions();
        
        console.log('[PositionSystemDebug] ✅ COMPLETED timeline initialization:', {
          shotId: shotId.substring(0, 8),
          recordsInitialized: recordCount,
          frameSpacing,
          timestamp: new Date().toISOString()
        });
        
        toast.success(`Initialized timeline frames for ${recordCount} items`);
      } else {
        console.log('[PositionSystemDebug] ⚠️ No records were initialized (possibly already initialized)');
      }
      
      return recordCount;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize timeline frames';
      console.error('[PositionSystemDebug] ❌ FAILED timeline initialization:', {
        shotId: shotId.substring(0, 8),
        itemsNeedingFrames: itemsNeedingFrames.length,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      toast.error(`Failed to initialize timeline frames: ${errorMessage}`);
      throw err;
    }
  }, [shotId, shotGenerations, loadPositions]);

  return { 
    shotGenerations,
    isLoading,
    error,
    getPositionsForMode,
    getImagesForMode,
    exchangePositions,
    batchExchangePositions,
    deleteItem,
    addItem,
    updateTimelineFrame,
    initializeTimelineFrames,
    loadPositions
  };
};
