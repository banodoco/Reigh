/**
 * usePromoteVariantToGeneration Hook
 *
 * Creates a new generation record from an existing variant.
 * This allows variants to be promoted to standalone generations that can
 * be added to shots, starred, and treated as first-class gallery items.
 *
 * Used by:
 * - VariantSelector "Make new image" button
 * - ShotSelectorControls "Add as new image to shot" button
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { hasVideoExtension } from '@/shared/lib/typeGuards';

export interface PromoteVariantParams {
  /** ID of the variant to promote */
  variantId: string;
  /** Project ID for the new generation */
  projectId: string;
  /** ID of the generation this variant belongs to (for lineage tracking) */
  sourceGenerationId: string;
}

export interface PromotedGeneration {
  id: string;
  location: string;
  thumbnail_url: string | null;
  type: string;
  project_id: string;
  based_on: string;
  params: Record<string, any>;
}

/**
 * Hook for promoting a variant to a standalone generation
 */
export const usePromoteVariantToGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      variantId,
      projectId,
      sourceGenerationId,
    }: PromoteVariantParams): Promise<PromotedGeneration> => {
      console.log('[PromoteVariant] Starting promotion:', {
        variantId: variantId.substring(0, 8),
        projectId: projectId.substring(0, 8),
        sourceGenerationId: sourceGenerationId.substring(0, 8),
      });

      // 1. Fetch the variant's data
      const { data: variant, error: variantError } = await supabase
        .from('generation_variants')
        .select('*')
        .eq('id', variantId)
        .single();

      if (variantError || !variant) {
        console.error('[PromoteVariant] Failed to fetch variant:', variantError);
        throw new Error(`Failed to fetch variant: ${variantError?.message || 'Not found'}`);
      }

      console.log('[PromoteVariant] Fetched variant:', {
        id: variant.id.substring(0, 8),
        location: variant.location?.substring(0, 50),
        variant_type: variant.variant_type,
      });

      // 2. Determine if this is a video or image based on the URL
      const isVideo = hasVideoExtension(variant.location);
      const mediaType = isVideo ? 'video' : 'image';

      // 3. Create new generation record
      const newGenerationData = {
        location: variant.location,
        thumbnail_url: variant.thumbnail_url,
        project_id: projectId,
        type: mediaType,
        based_on: sourceGenerationId, // Track lineage
        params: {
          ...((variant.params as Record<string, any>) || {}),
          source: 'variant_promotion',
          source_variant_id: variantId,
          source_generation_id: sourceGenerationId,
          tool_type: (variant.params as any)?.tool_type || 'promoted-variant',
          promoted_at: new Date().toISOString(),
        },
      };

      console.log('[PromoteVariant] Creating generation with:', {
        type: newGenerationData.type,
        based_on: newGenerationData.based_on?.substring(0, 8),
        projectId: newGenerationData.project_id.substring(0, 8),
      });

      const { data: newGeneration, error: insertError } = await supabase
        .from('generations')
        .insert(newGenerationData)
        .select()
        .single();

      if (insertError || !newGeneration) {
        console.error('[PromoteVariant] Failed to create generation:', insertError);
        throw new Error(`Failed to create generation: ${insertError?.message || 'Unknown error'}`);
      }

      // Create the original variant
      await supabase.from('generation_variants').insert({
        generation_id: newGeneration.id,
        location: newGenerationData.location,
        thumbnail_url: newGenerationData.thumbnail_url,
        is_primary: true,
        variant_type: 'original',
        name: 'Original',
        params: newGenerationData.params,
      });

      console.log('[PromoteVariant] Successfully created generation:', {
        id: newGeneration.id.substring(0, 8),
        type: newGeneration.type,
      });

      return {
        id: newGeneration.id,
        location: newGeneration.location,
        thumbnail_url: newGeneration.thumbnail_url,
        type: newGeneration.type,
        project_id: newGeneration.project_id,
        based_on: newGeneration.based_on,
        params: newGeneration.params as Record<string, any>,
      };
    },

    onSuccess: (data, variables) => {
      console.log('[PromoteVariant] Mutation success, invalidating caches');

      // Invalidate generations queries to show the new generation in galleries
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['project-generations'] });

      // Invalidate derived generations for the source (new generation will show in "based on this")
      queryClient.invalidateQueries({
        queryKey: ['derived-generations', variables.sourceGenerationId],
      });
    },

    onError: (error) => {
      console.error('[PromoteVariant] Mutation error:', error);
      toast.error('Failed to create new image from variant');
    },
  });
};

export default usePromoteVariantToGeneration;
