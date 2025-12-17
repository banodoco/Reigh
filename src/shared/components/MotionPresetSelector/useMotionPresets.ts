import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BuiltinPreset, Preset, UseMotionPresetsReturn } from './types';

interface UseMotionPresetsParams {
  builtinPreset: BuiltinPreset;
  featuredPresetIds: string[];
  selectedPhasePresetId: string | null;
  queryKeyPrefix?: string;
}

/**
 * Hook for fetching and managing motion presets.
 * Combines a built-in default preset with optional featured presets from the database.
 */
export function useMotionPresets({
  builtinPreset,
  featuredPresetIds,
  selectedPhasePresetId,
  queryKeyPrefix = 'motion-presets',
}: UseMotionPresetsParams): UseMotionPresetsReturn {
  
  // Fetch additional featured presets from database (optional)
  const { data: additionalPresets, isLoading } = useQuery({
    queryKey: [queryKeyPrefix, 'featured', featuredPresetIds],
    queryFn: async () => {
      if (!featuredPresetIds || featuredPresetIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .in('id', featuredPresetIds);
      
      if (error) {
        console.error('[useMotionPresets] Error fetching featured presets:', error);
        return [];
      }
      
      // Sort by the order in featuredPresetIds
      const sorted = featuredPresetIds
        .map(id => data?.find(p => p.id === id))
        .filter(Boolean) as Preset[];
      
      return sorted;
    },
    enabled: featuredPresetIds.length > 0,
    staleTime: 60000, // Cache for 1 minute
  });

  // Combine built-in default (first) + additional presets from database
  const allPresets = useMemo((): Preset[] => {
    const presets: Preset[] = [builtinPreset];
    if (additionalPresets && additionalPresets.length > 0) {
      presets.push(...additionalPresets);
    }
    return presets;
  }, [builtinPreset, additionalPresets]);

  // All known preset IDs (for determining if selected preset is known)
  const allKnownPresetIds = useMemo(() => {
    return [builtinPreset.id, ...featuredPresetIds];
  }, [builtinPreset.id, featuredPresetIds]);

  // Should we show preset chips? Yes if no selection OR selection is a known preset
  // (If user selected an "unknown" preset from Browse, we show the SelectedPresetCard instead)
  const shouldShowPresetChips = useMemo(() => {
    if (!selectedPhasePresetId) return true; // No selection = show chips
    return allKnownPresetIds.includes(selectedPhasePresetId);
  }, [selectedPhasePresetId, allKnownPresetIds]);

  // Custom mode = no preset selected
  const isCustomConfig = !selectedPhasePresetId;

  // Using built-in default
  const isUsingBuiltinDefault = selectedPhasePresetId === builtinPreset.id;

  return {
    allPresets,
    allKnownPresetIds,
    shouldShowPresetChips,
    isCustomConfig,
    isUsingBuiltinDefault,
    isLoading,
  };
}
