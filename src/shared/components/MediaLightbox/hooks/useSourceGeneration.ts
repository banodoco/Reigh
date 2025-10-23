import { useState, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';

interface UseSourceGenerationParams {
  media: GenerationRow;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

interface UseSourceGenerationReturn {
  sourceGenerationData: GenerationRow | null;
}

/**
 * Hook to fetch and manage source generation (based_on) data
 * Fetches the generation that this media was derived from
 */
export const useSourceGeneration = ({
  media,
  onOpenExternalGeneration
}: UseSourceGenerationParams): UseSourceGenerationReturn => {
  const [sourceGenerationData, setSourceGenerationData] = useState<GenerationRow | null>(null);

  useEffect(() => {
    const basedOnId = (media as any).based_on;
    const effectMediaKeys = Object.keys(media);
    
    console.log('[BasedOnLineage] 🔍 useEffect checking for based_on:',
      '\n  mediaId:', media.id.substring(0, 8),
      '\n  hasBasedOn:', !!basedOnId,
      '\n  basedOnId:', basedOnId ? basedOnId.substring(0, 8) : null,
      '\n  fullBasedOnId:', basedOnId,
      '\n  hasOnOpenExternalGeneration:', !!onOpenExternalGeneration,
      '\n  mediaType:', media.type,
      '\n  mediaKeysCount:', effectMediaKeys.length,
      '\n  mediaKeys:', effectMediaKeys.join(', '),
      '\n  hasBasedOnInKeys:', effectMediaKeys.includes('based_on')
    );
    
    if (!basedOnId) {
      setSourceGenerationData(null);
      return;
    }
    
    const fetchSourceGeneration = async () => {
      console.log('[BasedOnLineage] 📥 Fetching source generation:',
        '\n  currentMediaId:', media.id.substring(0, 8),
        '\n  basedOnId:', basedOnId.substring(0, 8)
      );
      
      try {
        const { data, error } = await supabase
          .from('generations')
          .select('*')
          .eq('id', basedOnId)
          .single();
        
        if (error) throw error;
        
        if (data) {
          console.log('[BasedOnLineage] ✅ Fetched source generation:',
            '\n  sourceId:', data.id.substring(0, 8),
            '\n  type:', data.type,
            '\n  location:', data.location?.substring(0, 50)
          );
          setSourceGenerationData(data);
        } else {
          console.log('[BasedOnLineage] ⚠️ No data returned from query');
          setSourceGenerationData(null);
        }
      } catch (error) {
        console.error('[BasedOnLineage] ❌ Failed to fetch source generation:', error);
        // Don't show toast - this is a non-critical feature
        setSourceGenerationData(null);
      }
    };
    
    fetchSourceGeneration();
  }, [media.id, (media as any).based_on, onOpenExternalGeneration]);

  return {
    sourceGenerationData
  };
};

