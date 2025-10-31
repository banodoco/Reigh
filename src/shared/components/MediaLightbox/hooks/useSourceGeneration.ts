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
    const basedOnFromMetadata = (media.metadata as any)?.based_on;
    const effectMediaKeys = Object.keys(media);
    
    console.log('[TasksPane:BasedOn] 🔍 useSourceGeneration hook checking media:', {
      mediaId: media.id.substring(0, 8),
      hasBasedOnField: !!basedOnId,
      basedOnId: basedOnId?.substring(0, 8) || 'null',
      fullBasedOnId: basedOnId || 'null',
      hasBasedOnInMetadata: !!basedOnFromMetadata,
      basedOnFromMetadata: basedOnFromMetadata?.substring(0, 8) || 'null',
      hasOnOpenExternalGeneration: !!onOpenExternalGeneration,
      mediaType: media.type,
      mediaKeysCount: effectMediaKeys.length,
      mediaKeys: effectMediaKeys.slice(0, 10).join(', ') + (effectMediaKeys.length > 10 ? '...' : ''),
      hasBasedOnInKeys: effectMediaKeys.includes('based_on'),
      willFetchSource: !!basedOnId || !!basedOnFromMetadata,
      timestamp: Date.now()
    });
    
    // Check both direct field and metadata
    const effectiveBasedOnId = basedOnId || basedOnFromMetadata;
    
    if (!effectiveBasedOnId) {
      console.log('[TasksPane:BasedOn] ⚠️ No based_on ID found, setting sourceGenerationData to null');
      setSourceGenerationData(null);
      return;
    }
    
    const fetchSourceGeneration = async () => {
      console.log('[TasksPane:BasedOn] 📥 Fetching source generation:', {
        currentMediaId: media.id.substring(0, 8),
        basedOnId: effectiveBasedOnId.substring(0, 8),
        timestamp: Date.now()
      });
      
      try {
        // Fetch source generation with shot associations to check timeline position
        const { data, error } = await supabase
          .from('generations')
          .select(`
            *,
            shot_generations!inner(
              shot_id,
              timeline_frame
            )
          `)
          .eq('id', effectiveBasedOnId)
          .single();
        
        if (error) throw error;
        
        if (data) {
          // Extract shot associations from joined data
          const shotAssociations = (data as any).shot_generations || [];
          
          console.log('[TasksPane:BasedOn] ✅ Fetched source generation:', {
            sourceId: data.id.substring(0, 8),
            type: data.type,
            location: data.location?.substring(0, 50),
            shotAssociationsCount: shotAssociations.length,
            shotAssociations: shotAssociations.map((assoc: any) => ({
              shotId: assoc.shot_id?.substring(0, 8),
              timelineFrame: assoc.timeline_frame
            })),
            timestamp: Date.now()
          });
          
          // Add shot associations to the data for easy access
          const enrichedData = {
            ...data,
            all_shot_associations: shotAssociations
          };
          
          setSourceGenerationData(enrichedData as any);
        } else {
          console.log('[TasksPane:BasedOn] ⚠️ No data returned from query');
          setSourceGenerationData(null);
        }
      } catch (error) {
        console.error('[TasksPane:BasedOn] ❌ Failed to fetch source generation:', error);
        // Don't show toast - this is a non-critical feature
        setSourceGenerationData(null);
      }
    };
    
    fetchSourceGeneration();
  }, [media.id, (media as any).based_on, (media.metadata as any)?.based_on, onOpenExternalGeneration]);

  return {
    sourceGenerationData
  };
};

