import { useState, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';

interface UseSourceGenerationParams {
  media: GenerationRow;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

export interface SourceVariantData {
  id: string;
  location: string;
  thumbnail_url: string | null;
  variant_type: string | null;
  is_primary: boolean;
}

interface UseSourceGenerationReturn {
  sourceGenerationData: GenerationRow | null;
  sourcePrimaryVariant: SourceVariantData | null;
}

/**
 * Hook to fetch and manage source generation (based_on) data
 * Fetches the generation that this media was derived from, plus its primary variant
 */
export const useSourceGeneration = ({
  media,
  onOpenExternalGeneration
}: UseSourceGenerationParams): UseSourceGenerationReturn => {
  const [sourceGenerationData, setSourceGenerationData] = useState<GenerationRow | null>(null);
  const [sourcePrimaryVariant, setSourcePrimaryVariant] = useState<SourceVariantData | null>(null);

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
        // Fetch source generation with shot associations and primary variant
        // Use left join (no !inner) so we get the generation even if it's not in any shot
        const { data, error } = await supabase
          .from('generations')
          .select(`
            *,
            shot_generations!shot_generations_generation_id_generations_id_fk(
              shot_id,
              timeline_frame
            ),
            generation_variants!generation_variants_generation_id_fkey(
              id,
              location,
              thumbnail_url,
              variant_type,
              is_primary
            )
          `)
          .eq('id', effectiveBasedOnId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          // Extract shot associations from joined data
          const shotAssociations = (data as any).shot_generations || [];
          const variants = (data as any).generation_variants || [];
          
          // Find primary variant
          const primaryVariant = variants.find((v: any) => v.is_primary) || null;
          
          console.log('[VariantClickDebug] ✅ Fetched source generation:', {
            sourceId: data.id.substring(0, 8),
            type: data.type,
            location: data.location?.substring(0, 50),
            variantsCount: variants.length,
            allVariants: variants.map((v: any) => ({
              id: v.id?.substring(0, 8),
              type: v.variant_type,
              isPrimary: v.is_primary,
              location: v.location?.substring(0, 30),
              thumbnail: v.thumbnail_url?.substring(0, 30),
            })),
            primaryVariantId: primaryVariant?.id?.substring(0, 8),
            primaryVariantType: primaryVariant?.variant_type,
            primaryVariantLocation: primaryVariant?.location?.substring(0, 50),
            primaryVariantThumbnail: primaryVariant?.thumbnail_url?.substring(0, 50),
          });
          
          // Add shot associations to the data for easy access
          const enrichedData = {
            ...data,
            all_shot_associations: shotAssociations
          };
          
          setSourceGenerationData(enrichedData as any);
          setSourcePrimaryVariant(primaryVariant);
        } else {
          console.log('[VariantClickDebug] ⚠️ No data returned from source generation query');
          setSourceGenerationData(null);
          setSourcePrimaryVariant(null);
        }
      } catch (error) {
        console.error('[BasedOnDebug] ❌ Failed to fetch source generation:', error);
        // Don't show toast - this is a non-critical feature
        setSourceGenerationData(null);
        setSourcePrimaryVariant(null);
      }
    };
    
    fetchSourceGeneration();
  }, [media.id, (media as any).based_on, (media.metadata as any)?.based_on, onOpenExternalGeneration]);

  return {
    sourceGenerationData,
    sourcePrimaryVariant
  };
};

