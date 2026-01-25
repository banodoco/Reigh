/**
 * useVariants Hook
 *
 * Centralized hook for fetching and managing variants for a generation.
 * Allows switching between variants and setting the primary variant.
 * Supports realtime updates via SimpleRealtimeManager.
 *
 * Used by: MediaLightbox, InlineEditView, and other components that display variants.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invalidateVariantChange } from '@/shared/hooks/useGenerationInvalidation';

/**
 * A variant of a generation (from generation_variants table)
 */
export interface GenerationVariant {
  id: string;
  generation_id: string;
  location: string;
  thumbnail_url: string | null;
  params: Record<string, any> | null;
  is_primary: boolean;
  variant_type: string | null;
  name: string | null;
  created_at: string;
  viewed_at: string | null;
}

/**
 * Return type for useVariants hook
 */
export interface UseVariantsReturn {
  variants: GenerationVariant[];
  primaryVariant: GenerationVariant | null;
  activeVariant: GenerationVariant | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  setActiveVariantId: (variantId: string | null) => void;
  setPrimaryVariant: (variantId: string) => Promise<void>;
}

/** Query key for variant queries - use this for cache consistency */
export const VARIANTS_QUERY_KEY = 'generation-variants';

interface UseVariantsProps {
  generationId: string | null;
  enabled?: boolean;
}

export const useVariants = ({
  generationId,
  enabled = true,
}: UseVariantsProps): UseVariantsReturn => {
  const queryClient = useQueryClient();
  const [activeVariantId, setActiveVariantIdInternal] = useState<string | null>(null);
  
  // Wrap setActiveVariantId with logging
  const setActiveVariantId = useCallback((variantId: string | null) => {
    console.log('[VariantClickDebug] useVariants.setActiveVariantId called:', {
      newVariantId: variantId?.substring(0, 8),
      currentActiveVariantId: activeVariantId?.substring(0, 8),
      generationId: generationId?.substring(0, 8),
    });
    setActiveVariantIdInternal(variantId);
  }, [activeVariantId, generationId]);

  // Fetch variants for this generation
  const {
    data: variants = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [VARIANTS_QUERY_KEY, generationId],
    queryFn: async () => {
      if (!generationId) return [];

      console.log('[useVariants] Fetching variants for generation:', generationId.substring(0, 8));

      const { data, error } = await supabase
        .from('generation_variants')
        .select('*')
        .eq('generation_id', generationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useVariants] Error fetching variants:', error);
        throw error;
      }

      console.log('[useVariants] Fetched variants:', {
        count: data?.length || 0,
        generationId: generationId.substring(0, 8),
      });

      return (data || []) as GenerationVariant[];
    },
    enabled: enabled && !!generationId,
    staleTime: 30000, // 30 seconds
  });

  // Listen for realtime variant changes and refetch when our generationId is affected
  useEffect(() => {
    if (!generationId || !enabled) return;

    const handleVariantChange = (event: CustomEvent) => {
      const affectedIds = event.detail?.affectedGenerationIds || [];
      if (affectedIds.includes(generationId)) {
        console.log('[useVariants] 🔄 Realtime: variant change detected for generation:', generationId.substring(0, 8));
        refetch();
      }
    };

    window.addEventListener('realtime:variant-change-batch', handleVariantChange as EventListener);

    return () => {
      window.removeEventListener('realtime:variant-change-batch', handleVariantChange as EventListener);
    };
  }, [generationId, enabled, refetch]);

  // Find the primary variant
  const primaryVariant = useMemo(() => {
    return variants.find((v) => v.is_primary) || null;
  }, [variants]);

  // Get the active variant (selected or primary, fallback to first variant)
  const activeVariant = useMemo(() => {
    console.log('[VariantClickDebug] useVariants.activeVariant computing:', {
      activeVariantId: activeVariantId?.substring(0, 8),
      variantsCount: variants?.length,
      primaryVariantId: primaryVariant?.id?.substring(0, 8),
    });

    if (activeVariantId) {
      const found = variants.find((v) => v.id === activeVariantId);
      if (found) {
        console.log('[VariantClickDebug] useVariants.activeVariant found:', found.id.substring(0, 8));
        return found;
    }
      console.log('[VariantClickDebug] useVariants.activeVariant NOT FOUND in variants list!');
    }
    // Fall back to primary, then first variant if no primary exists
    const fallback = primaryVariant || variants[0] || null;
    console.log('[VariantClickDebug] useVariants.activeVariant using fallback:', fallback?.id?.substring(0, 8));
    return fallback;
  }, [variants, activeVariantId, primaryVariant]);

  // Initialize active variant to primary (or first variant) when variants load
  // (only if no active variant is set)
  useMemo(() => {
    if (!activeVariantId) {
      const variantToSelect = primaryVariant || variants[0];
      if (variantToSelect) {
        setActiveVariantId(variantToSelect.id);
      }
    }
  }, [primaryVariant, variants, activeVariantId]);

  // Mutation to set a variant as primary
  const setPrimaryMutation = useMutation({
    mutationFn: async (variantId: string) => {
      console.log('[useVariants] Setting primary variant:', variantId.substring(0, 8));

      // Update the variant to be primary
      // The database trigger will handle unsetting the old primary
      const { error } = await supabase
        .from('generation_variants')
        .update({ is_primary: true })
        .eq('id', variantId);

      if (error) {
        console.error('[useVariants] Error setting primary variant:', error);
        throw error;
      }

      return variantId;
    },
    onSuccess: async (variantId) => {
      console.log('[useVariants] Successfully set primary variant:', variantId.substring(0, 8));

      // Invalidate caches using centralized function
      if (generationId) {
        await invalidateVariantChange(queryClient, {
          generationId,
          reason: 'set-primary-variant',
        });
      }

      // SINGLE-SEGMENT PROPAGATION: If this is a child of a single-segment parent,
      // also create a variant on the parent so the main generation updates
      try {
        // Get the promoted variant's location and thumbnail
        const { data: promotedVariant } = await supabase
          .from('generation_variants')
          .select('location, thumbnail_url, params')
          .eq('id', variantId)
          .single();

        if (!promotedVariant || !generationId) return;

        // Check if this generation is a child with a parent
        const { data: generation } = await supabase
          .from('generations')
          .select('is_child, parent_generation_id')
          .eq('id', generationId)
          .single();

        if (!generation?.is_child || !generation?.parent_generation_id) return;

        // Count how many children the parent has
        const { count: childCount } = await supabase
          .from('generations')
          .select('id', { count: 'exact', head: true })
          .eq('parent_generation_id', generation.parent_generation_id)
          .eq('is_child', true);

        // Only propagate for single-segment parents
        if (childCount !== 1) {
          console.log('[useVariants] Parent has multiple children, skipping propagation');
          return;
        }

        console.log('[useVariants] Single-segment child - propagating to parent:', generation.parent_generation_id.substring(0, 8));

        // Create a new variant on the parent with the promoted video
        // Exclude task-specific fields that shouldn't propagate to parent
        const {
          source_task_id: _sourceTaskId,
          child_generation_id: _childGenId,
          ...paramsToPropagate
        } = (promotedVariant.params || {}) as Record<string, unknown>;

        const { error: insertError } = await supabase
          .from('generation_variants')
          .insert({
            generation_id: generation.parent_generation_id,
            location: promotedVariant.location,
            thumbnail_url: promotedVariant.thumbnail_url,
            is_primary: true, // DB trigger will unset old primary
            variant_type: 'travel_segment',
            params: {
              ...paramsToPropagate,
              propagated_from_child: generationId,
              propagated_from_variant: variantId,
            },
          });

        if (insertError) {
          console.error('[useVariants] Failed to propagate to parent:', insertError);
        } else {
          console.log('[useVariants] Successfully propagated to parent');
          // Invalidate parent's variant cache
          await invalidateVariantChange(queryClient, {
            generationId: generation.parent_generation_id,
            reason: 'single-segment-propagation',
          });
        }
      } catch (err) {
        console.error('[useVariants] Error in single-segment propagation:', err);
        // Don't throw - this is a nice-to-have, not critical
      }
    },
    onError: (error) => {
      console.error('[useVariants] Failed to set primary variant:', error);
      toast.error('Failed to set primary variant');
    },
  });

  const setPrimaryVariant = useCallback(
    async (variantId: string) => {
      await setPrimaryMutation.mutateAsync(variantId);
    },
    [setPrimaryMutation]
  );

  return {
    variants,
    primaryVariant,
    activeVariant,
    isLoading,
    error: error as Error | null,
    refetch,
    setActiveVariantId,
    setPrimaryVariant,
  };
};

export default useVariants;

