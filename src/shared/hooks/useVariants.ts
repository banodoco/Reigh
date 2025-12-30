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

  // Get the active variant (selected or primary)
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
    console.log('[VariantClickDebug] useVariants.activeVariant using primaryVariant');
    return primaryVariant;
  }, [variants, activeVariantId, primaryVariant]);

  // Initialize active variant to primary when variants load
  // (only if no active variant is set)
  useMemo(() => {
    if (!activeVariantId && primaryVariant) {
      setActiveVariantId(primaryVariant.id);
    }
  }, [primaryVariant, activeVariantId]);

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

