import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export interface ShotGenerationMetadata {
  magicEditPrompts?: Array<{
    prompt: string;
    timestamp: string;
    numImages?: number;
  }>;
  lastMagicEditPrompt?: string;
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
    if (!enabled || !shotGenerationId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadMetadata = async () => {
      try {
        const { data, error } = await supabase
          .from('shot_generations')
          .select('metadata')
          .eq('id', shotGenerationId)
          .single();

        if (error) {
          console.warn('[useShotGenerationMetadata] Error loading metadata:', error);
          if (!cancelled) {
            setMetadata({});
            setIsLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setMetadata(data?.metadata || {});
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[useShotGenerationMetadata] Unexpected error:', err);
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
    if (!shotGenerationId || isUpdating) {
      return;
    }

    setIsUpdating(true);

    try {
      const newMetadata = { ...metadata, ...updates };
      
      const { error } = await supabase
        .from('shot_generations')
        .update({ metadata: newMetadata })
        .eq('id', shotGenerationId);

      if (error) {
        console.error('[useShotGenerationMetadata] Error updating metadata:', error);
        throw error;
      }

      // Update local state
      setMetadata(newMetadata);

      // Invalidate related queries to trigger UI updates (only if shotId is available)
      if (shotId) {
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', shotId] });
        queryClient.invalidateQueries({ queryKey: ['shot-generations', shotId] });
      }

      console.log('[useShotGenerationMetadata] Successfully updated metadata for generation:', {
        shotId: shotId ? shotId.substring(0, 8) : 'N/A',
        shotGenerationId: shotGenerationId.substring(0, 8),
        updates
      });

    } catch (error) {
      console.error('[useShotGenerationMetadata] Failed to update metadata:', error);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, [shotId, shotGenerationId, metadata, isUpdating, queryClient]);

  // Convenience method to add a magic edit prompt
  const addMagicEditPrompt = useCallback(async (prompt: string, numImages?: number) => {
    const newPromptEntry = {
      prompt,
      timestamp: new Date().toISOString(),
      numImages
    };

    const existingPrompts = metadata.magicEditPrompts || [];
    const updatedPrompts = [...existingPrompts, newPromptEntry];

    // Keep only the last 10 prompts to prevent unbounded growth
    const trimmedPrompts = updatedPrompts.slice(-10);

    await updateMetadata({
      magicEditPrompts: trimmedPrompts,
      lastMagicEditPrompt: prompt
    });
  }, [metadata, updateMetadata]);

  // Get the most recent magic edit prompt
  const getLastMagicEditPrompt = useCallback((): string => {
    return metadata.lastMagicEditPrompt || '';
  }, [metadata]);

  // Get all magic edit prompts
  const getMagicEditPrompts = useCallback(() => {
    return metadata.magicEditPrompts || [];
  }, [metadata]);

  return {
    metadata,
    isLoading,
    isUpdating,
    updateMetadata,
    addMagicEditPrompt,
    getLastMagicEditPrompt,
    getMagicEditPrompts
  };
}
