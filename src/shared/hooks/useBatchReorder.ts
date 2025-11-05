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
      return;
    }

    if (exchanges.length === 0) {
      return;
    }

    ,
      exchangeCount: exchanges.length,
      exchanges: exchanges.map(ex => ({
        shotGenA: ex.shotGenerationIdA.substring(0, 8),
        shotGenB: ex.shotGenerationIdB.substring(0, 8)
      })),
      timestamp: Date.now()
    });

    try {
      // Perform all exchanges without reloading positions each time
      for (let i = 0; i < exchanges.length; i++) {
        const exchange = exchanges[i];
        ,
          shotGenB: exchange.shotGenerationIdB.substring(0, 8)
        });
        await exchangePositionsNoReload(exchange.shotGenerationIdA, exchange.shotGenerationIdB);
        }

      // Trigger reload after all exchanges are done
      if (onReload) {
        onReload('batch_reorder');
      }
      
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
