import React, { createContext, useContext, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GenerationRow } from '@/types/shots';
import { preloadGenerationTaskMappings, enhanceGenerationsWithTaskData } from '@/shared/lib/generationTaskBridge';

// ================================================================
// GENERATION-TASK INTEGRATION CONTEXT
// ================================================================
// This context provides a centralized way for components to work with
// both generation and task data seamlessly. It handles background
// preloading and cache management automatically.

interface GenerationTaskContextValue {
  // Methods for working with generation-task relationships
  preloadTaskMappings: (generationIds: string[]) => Promise<void>;
  enhanceWithTaskData: (generations: GenerationRow[]) => (GenerationRow & { taskId?: string | null; taskData?: any })[];
  
  // Configuration
  isPreloadingEnabled: boolean;
  setPreloadingEnabled: (enabled: boolean) => void;
}

const GenerationTaskContext = createContext<GenerationTaskContextValue | null>(null);

interface GenerationTaskProviderProps {
  children: React.ReactNode;
  
  // Configuration options
  enableBackgroundPreloading?: boolean;
  preloadBatchSize?: number;
  preloadDelay?: number;
}

export function GenerationTaskProvider({ 
  children, 
  enableBackgroundPreloading = true,
  preloadBatchSize = 5,
  preloadDelay = 200 
}: GenerationTaskProviderProps) {
  const queryClient = useQueryClient();
  const [isPreloadingEnabled, setPreloadingEnabled] = React.useState(enableBackgroundPreloading);

  const preloadTaskMappings = React.useCallback(async (generationIds: string[]) => {
    if (!isPreloadingEnabled || generationIds.length === 0) return;

    });
    
    try {
      const result = await preloadGenerationTaskMappings(generationIds, queryClient, {
        batchSize: preloadBatchSize,
        delayBetweenBatches: preloadDelay,
        preloadFullTaskData: true, // Preload full task data for better UX
      });
      });
    } catch (error) {
      console.warn('[VideoGenMissing] Preloader failed', { error });
    }
  }, [queryClient, isPreloadingEnabled, preloadBatchSize, preloadDelay]);

  const enhanceWithTaskData = React.useCallback((generations: GenerationRow[]) => {
    return enhanceGenerationsWithTaskData(generations, queryClient);
  }, [queryClient]);

  const contextValue: GenerationTaskContextValue = {
    preloadTaskMappings,
    enhanceWithTaskData,
    isPreloadingEnabled,
    setPreloadingEnabled,
  };

  return (
    <GenerationTaskContext.Provider value={contextValue}>
      {children}
    </GenerationTaskContext.Provider>
  );
}

// ================================================================
// HOOKS FOR USING THE CONTEXT
// ================================================================

export function useGenerationTaskContext() {
  const context = useContext(GenerationTaskContext);
  if (!context) {
    throw new Error('useGenerationTaskContext must be used within a GenerationTaskProvider');
  }
  return context;
}

/**
 * Hook that automatically preloads task data for a list of generations
 */
export function useGenerationTaskPreloader(generations: GenerationRow[], enabled = true) {
  const { preloadTaskMappings } = useGenerationTaskContext();

  useEffect(() => {
    if (!enabled || generations.length === 0) return;

    const generationIds = generations.map(g => g.id);
    preloadTaskMappings(generationIds);
  }, [generations, preloadTaskMappings, enabled]);
}

/**
 * Hook that provides enhanced generations with task data from cache
 */
export function useEnhancedGenerations(generations: GenerationRow[]) {
  const { enhanceWithTaskData } = useGenerationTaskContext();
  
  return React.useMemo(() => {
    return enhanceWithTaskData(generations);
  }, [generations, enhanceWithTaskData]);
}

/**
 * Hook for components that want to opt into background preloading
 */
export function useBackgroundTaskPreloading(config: {
  enabled?: boolean;
  batchSize?: number;
  delay?: number;
} = {}) {
  const { isPreloadingEnabled, setPreloadingEnabled } = useGenerationTaskContext();
  
  useEffect(() => {
    if (config.enabled !== undefined) {
      setPreloadingEnabled(config.enabled);
    }
  }, [config.enabled, setPreloadingEnabled]);
  
  return {
    isEnabled: isPreloadingEnabled,
    enable: () => setPreloadingEnabled(true),
    disable: () => setPreloadingEnabled(false),
  };
}
