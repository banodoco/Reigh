/**
 * Focused hook for timeline frame updates and position management
 * Extracted from useEnhancedShotPositions for better modularity
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PositionMetadata {
  user_positioned?: boolean;
  drag_source?: string;
  drag_session_id?: string;
  frame_spacing?: number;
  auto_initialized?: boolean;
  [key: string]: any;
}

export interface UseTimelineFrameUpdatesOptions {
  shotId: string | null;
  onUpdate?: (reason: string) => void;
}

export function useTimelineFrameUpdates({ shotId, onUpdate }: UseTimelineFrameUpdatesOptions) {
  // Update timeline frame for a specific shot generation
  const updateTimelineFrame = useCallback(async (
    shotGenerationId: string, 
    newTimelineFrame: number, 
    metadata: Partial<PositionMetadata> = {}
  ) => {
    if (!shotId) {
      console.warn('[useTimelineFrameUpdates] No shotId provided for updateTimelineFrame');
      return;
    }

    const dragSessionId = metadata?.drag_session_id || 'no-session';
    console.log(`[TimelineDragFlow] [DB_UPDATE] 🎯 Session: ${dragSessionId} | Updating timeline frame for shot_generation ${shotGenerationId.substring(0, 8)} to frame ${newTimelineFrame}`);

    try {
      const { data, error } = await supabase
        .from('shot_generations')
        .update({ 
          timeline_frame: newTimelineFrame,
          metadata: metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', shotGenerationId)
        .select();

      if (error) {
        console.log(`[TimelineDragFlow] [DB_ERROR] ❌ Session: ${dragSessionId} | Database update failed for shot_generation ${shotGenerationId.substring(0, 8)}:`, error);
        throw error;
      }

      console.log(`[TimelineDragFlow] [DB_SUCCESS] ✅ Session: ${dragSessionId} | Successfully updated shot_generation ${shotGenerationId.substring(0, 8)} to frame ${newTimelineFrame}`);
      
      // Notify parent of update
      if (onUpdate) {
        onUpdate('timeline_frame_update');
      }

      return data;
    } catch (error) {
      console.error('[useTimelineFrameUpdates] Error updating timeline frame:', error);
      throw error;
    }
  }, [shotId, onUpdate]);

  // Exchange timeline frames between two shot generations
  const exchangePositionsNoReload = useCallback(async (shotGenerationIdA: string, shotGenerationIdB: string) => {
    if (!shotId) {
      console.log('[BatchModeReorderFlow] [EXCHANGE_NO_RELOAD] ❌ No shotId provided');
      return;
    }

    console.log('[BatchModeReorderFlow] [EXCHANGE_NO_RELOAD] 🔀 Exchanging timeline frames:', {
      shotGenA: shotGenerationIdA.substring(0, 8),
      shotGenB: shotGenerationIdB.substring(0, 8),
      timestamp: Date.now()
    });

    try {
      console.log('[BatchModeReorderFlow] [SQL_CALL] 📞 Calling exchange_timeline_frames RPC...');
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
      
      // Notify parent of update
      if (onUpdate) {
        onUpdate('position_exchange');
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to exchange positions';
      console.error('[BatchModeReorderFlow] [EXCHANGE_ERROR] ❌ Exchange failed:', errorMessage);
      throw err;
    }
  }, [shotId, onUpdate]);

  return {
    updateTimelineFrame,
    exchangePositionsNoReload,
  };
}
