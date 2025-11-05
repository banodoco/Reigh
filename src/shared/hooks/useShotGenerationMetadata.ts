import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export interface ShotGenerationMetadata {
  magicEditPrompts?: Array<{
    prompt: string;
    timestamp: string;
    numImages?: number;
    isNextSceneBoostEnabled?: boolean;
    isInSceneBoostEnabled?: boolean;
  }>;
  lastMagicEditPrompt?: string;
  lastMagicEditNumImages?: number;
  lastMagicEditNextSceneBoost?: boolean;
  lastMagicEditInSceneBoost?: boolean;
  userPositioned?: boolean;
  frameSpacing?: number;
  autoInitialized?: boolean;
  [key: string]: any; // Allow for future metadata fields
}

interface UseShotGenerationMetadataOptions {
  shotId: string;
  shotGenerationId: string;
  enabled?: boolean;
}

export function useShotGenerationMetadata({
  shotId,
  shotGenerationId,
  enabled = true
}: UseShotGenerationMetadataOptions) {
  const [metadata, setMetadata] = useState<ShotGenerationMetadata>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const queryClient = useQueryClient();

  // Load metadata from database
  useEffect(() => {
    : 'N/A',
      shotGenerationId: shotGenerationId ? shotGenerationId.substring(0, 8) : 'N/A',
      willLoad: !!(enabled && shotGenerationId),
      timestamp: Date.now()
    });

    if (!enabled || !shotGenerationId) {
      });
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadMetadata = async () => {
      try {
        ,
          timestamp: Date.now()
        });
        
        const { data, error } = await supabase
          .from('shot_generations')
          .select('metadata')
          .eq('id', shotGenerationId)
          .maybeSingle();

        if (error) {
          console.error('[MagicEditPromptPersist] ❌ DB LOAD ERROR:', {
            shotGenerationId: shotGenerationId.substring(0, 8),
            error: error.message,
            code: error.code,
            details: error,
            timestamp: Date.now()
          });
          if (!cancelled) {
            setMetadata({});
            setIsLoading(false);
          }
          return;
        }

        const loadedMetadata = (data?.metadata as ShotGenerationMetadata) || {};
        ,
          hasMetadata: !!data?.metadata,
          hasLastMagicEditPrompt: !!loadedMetadata.lastMagicEditPrompt,
          lastMagicEditPromptLength: loadedMetadata.lastMagicEditPrompt?.length || 0,
          lastMagicEditPromptPreview: loadedMetadata.lastMagicEditPrompt 
            ? loadedMetadata.lastMagicEditPrompt.substring(0, 50) + '...' 
            : 'none',
          magicEditPromptsCount: loadedMetadata.magicEditPrompts?.length || 0,
          allPrompts: loadedMetadata.magicEditPrompts?.map(p => ({
            promptPreview: p.prompt.substring(0, 30) + '...',
            timestamp: p.timestamp,
            numImages: p.numImages
          })) || [],
          timestamp: Date.now()
        });

        if (!cancelled) {
          setMetadata(loadedMetadata);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[MagicEditPromptPersist] 💥 UNEXPECTED ERROR:', {
          error: err instanceof Error ? err.message : err,
          stack: err instanceof Error ? err.stack : undefined,
          timestamp: Date.now()
        });
        if (!cancelled) {
          setMetadata({});
          setIsLoading(false);
        }
      }
    };

    loadMetadata();
    return () => { cancelled = true; };
  }, [shotGenerationId, enabled]);

  // Update metadata in database
  const updateMetadata = useCallback(async (updates: Partial<ShotGenerationMetadata>) => {
    : 'N/A',
      shotId: shotId ? shotId.substring(0, 8) : 'N/A',
      isUpdating,
      hasShotGenerationId: !!shotGenerationId,
      willUpdate: !!(shotGenerationId && !isUpdating),
      updateKeys: Object.keys(updates),
      updates: {
        ...updates,
        // Preview prompt if it's being updated
        lastMagicEditPrompt: updates.lastMagicEditPrompt 
          ? updates.lastMagicEditPrompt.substring(0, 50) + '...'
          : undefined
      },
      timestamp: Date.now()
    });
    
    if (!shotGenerationId || isUpdating) {
      });
      return;
    }

    setIsUpdating(true);

    try {
      const newMetadata = { ...metadata, ...updates };
      
      ,
        timestamp: Date.now()
      });
      
      const { error } = await supabase
        .from('shot_generations')
        .update({ metadata: newMetadata })
        .eq('id', shotGenerationId);

      if (error) {
        console.error('[MagicEditPromptPersist] ❌ DB UPDATE ERROR:', {
          shotGenerationId: shotGenerationId.substring(0, 8),
          error: error.message,
          code: error.code,
          details: error,
          timestamp: Date.now()
        });
        throw error;
      }

      // Update local state
      setMetadata(newMetadata);

      // Invalidate related queries to trigger UI updates (only if shotId is available)
      if (shotId) {
        ,
          queryKeys: [
            ['unified-generations', 'shot', shotId],
            ['shot-generations', shotId]
          ],
          timestamp: Date.now()
        });
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
        queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
      }

      : 'N/A',
        shotGenerationId: shotGenerationId.substring(0, 8),
        updateKeys: Object.keys(updates),
        newMetadataKeys: Object.keys(newMetadata),
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('[MagicEditPromptPersist] 💥 UPDATE FAILED:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now()
      });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, [shotId, shotGenerationId, metadata, isUpdating, queryClient]);

  // Convenience method to add a magic edit prompt
  const addMagicEditPrompt = useCallback(async (
    prompt: string, 
    numImages?: number,
    isNextSceneBoostEnabled?: boolean,
    isInSceneBoostEnabled?: boolean
  ) => {
    : 'N/A',
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      numImages,
      isNextSceneBoostEnabled,
      isInSceneBoostEnabled,
      existingPromptsCount: metadata.magicEditPrompts?.length || 0,
      currentLastPrompt: metadata.lastMagicEditPrompt 
        ? metadata.lastMagicEditPrompt.substring(0, 30) + '...'
        : 'none',
      timestamp: Date.now()
    });

    const newPromptEntry = {
      prompt,
      timestamp: new Date().toISOString(),
      numImages,
      isNextSceneBoostEnabled,
      isInSceneBoostEnabled
    };

    const existingPrompts = metadata.magicEditPrompts || [];
    const updatedPrompts = [...existingPrompts, newPromptEntry];

    // Keep only the last 10 prompts to prevent unbounded growth
    const trimmedPrompts = updatedPrompts.slice(-10);

    + '...',
      timestamp: Date.now()
    });

    await updateMetadata({
      magicEditPrompts: trimmedPrompts,
      lastMagicEditPrompt: prompt,
      lastMagicEditNumImages: numImages,
      lastMagicEditNextSceneBoost: isNextSceneBoostEnabled,
      lastMagicEditInSceneBoost: isInSceneBoostEnabled
    });
    
    : 'N/A',
      newPromptsCount: trimmedPrompts.length,
      lastPromptSet: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      timestamp: Date.now()
    });
  }, [metadata, updateMetadata, shotGenerationId]);

  // Get the most recent magic edit prompt
  const getLastMagicEditPrompt = useCallback((): string => {
    const prompt = metadata.lastMagicEditPrompt || '';
    : 'N/A',
      hasPrompt: !!prompt,
      promptLength: prompt.length,
      promptPreview: prompt ? prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '') : 'none',
      allMetadataKeys: Object.keys(metadata),
      magicEditPromptsCount: metadata.magicEditPrompts?.length || 0,
      timestamp: Date.now()
    });
    return prompt;
  }, [metadata, shotGenerationId]);

  // Get all magic edit prompts
  const getMagicEditPrompts = useCallback(() => {
    return metadata.magicEditPrompts || [];
  }, [metadata]);

  // Get last settings
  const getLastSettings = useCallback(() => {
    return {
      numImages: metadata.lastMagicEditNumImages || 4,
      isNextSceneBoostEnabled: metadata.lastMagicEditNextSceneBoost || false,
      isInSceneBoostEnabled: metadata.lastMagicEditInSceneBoost || false
    };
  }, [metadata]);

  return {
    metadata,
    isLoading,
    isUpdating,
    updateMetadata,
    addMagicEditPrompt,
    getLastMagicEditPrompt,
    getMagicEditPrompts,
    getLastSettings
  };
}
