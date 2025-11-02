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
    
    console.log('[BasedOnDebug] 🔍 useSourceGeneration hook checking media:');
    console.log('  mediaId:', media.id.substring(0, 8));
    console.log('  hasBasedOnField:', !!basedOnId);
    console.log('  basedOnValue:', basedOnId);
    console.log('  hasBasedOnInMetadata:', !!basedOnFromMetadata);
    console.log('  basedOnInMetadata:', basedOnFromMetadata);
    console.log('  hasOnOpenExternalGeneration:', !!onOpenExternalGeneration);
    console.log('  mediaType:', media.type);
    console.log('  mediaKeys:', effectMediaKeys);
    console.log('  hasBasedOnInKeys:', effectMediaKeys.includes('based_on'));
    console.log('  willFetchSource:', !!basedOnId || !!basedOnFromMetadata);
    console.log('  timestamp:', Date.now());
    
    // Check both direct field and metadata
    const effectiveBasedOnId = basedOnId || basedOnFromMetadata;
    
    if (!effectiveBasedOnId) {
      console.log('[BasedOnDebug] ⚠️ No based_on ID found, setting sourceGenerationData to null');
      setSourceGenerationData(null);
      return;
    }
    
    const fetchSourceGeneration = async () => {
      console.log('[BasedOnDebug] 📥 Fetching source generation:', {
        currentMediaId: media.id.substring(0, 8),
        basedOnId: effectiveBasedOnId.substring(0, 8),
        timestamp: Date.now()
      });
      
      try {
        // Fetch source generation with shot associations to check timeline position
        // Use left join (no !inner) so we get the generation even if it's not in any shot
        const { data, error } = await supabase
          .from('generations')
          .select(`
            *,
            shot_generations(
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
          
          console.log('[BasedOnDebug] ✅ Fetched source generation:', {
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
          console.log('[BasedOnDebug] ⚠️ No data returned from query');
          setSourceGenerationData(null);
        }
      } catch (error) {
        console.error('[BasedOnDebug] ❌ Failed to fetch source generation:', error);
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

