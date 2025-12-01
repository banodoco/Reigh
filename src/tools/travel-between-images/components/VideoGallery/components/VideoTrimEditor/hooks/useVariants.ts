/**
 * useVariants Hook
 * 
 * Fetches and manages variants for a generation.
 * Allows switching between variants and setting the primary variant.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GenerationVariant, UseVariantsReturn } from '../types';

interface UseVariantsProps {
  generationId: string | null;
  enabled?: boolean;
}

export const useVariants = ({
  generationId,
  enabled = true,
}: UseVariantsProps): UseVariantsReturn => {
  const queryClient = useQueryClient();
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);

  // Fetch variants for this generation
  const {
    data: variants = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['generation-variants', generationId],
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

  // Find the primary variant
  const primaryVariant = useMemo(() => {
    return variants.find((v) => v.is_primary) || null;
  }, [variants]);

  // Get the active variant (selected or primary)
  const activeVariant = useMemo(() => {
    if (activeVariantId) {
      const found = variants.find((v) => v.id === activeVariantId);
      if (found) return found;
    }
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
    onSuccess: (variantId) => {
      console.log('[useVariants] Successfully set primary variant:', variantId.substring(0, 8));
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['generation-variants', generationId] });
      queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      queryClient.invalidateQueries({ queryKey: ['generation', generationId] });
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

