/**
 * Focused hook for batch reordering operations
 * Extracted from useEnhancedShotPositions for better modularity
 */

import { useCallback } from 'react';
import { useTimelineFrameUpdates } from './useTimelineFrameUpdates';

export interface UseBatchReorderOptions {
  shotId: string | null;
  onReload?: (reason: string) => void;
}

export function useBatchReorder({ shotId, onReload }: UseBatchReorderOptions) {
  const { exchangePositionsNoReload } = useTimelineFrameUpdates({ 
    shotId,
    onUpdate: onReload 
  });

  // Batch exchange positions - performs multiple exchanges then triggers reload
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

      console.log('[BatchModeReorderFlow] [RELOAD_POSITIONS] 🔄 All exchanges complete, triggering reload...');
      
      // Trigger reload after all exchanges are done
      if (onReload) {
        onReload('batch_reorder');
      }
      
      console.log('[BatchModeReorderFlow] [RELOAD_COMPLETE] ✅ Batch exchange completed');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to batch exchange positions';
      console.error('[BatchModeReorderFlow] [BATCH_EXCHANGE_ERROR] ❌ Batch exchange failed:', err);
      throw err;
    }
  }, [shotId, exchangePositionsNoReload, onReload]);

  return {
    batchExchangePositions,
    exchangePositionsNoReload,
  };
}
