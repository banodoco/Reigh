/**
 * useSourceImageChanges Hook
 *
 * Detects when source images for video segments no longer match what was used
 * to create the video. This can happen when:
 * - A different variant is promoted on the source image
 * - The source generation is replaced (reordering, deletion)
 * - The source image slot now has a different generation
 *
 * The warning appears for 5 minutes after a source image changes.
 *
 * Detection approach:
 * 1. Look up what generation is CURRENTLY at each pair_shot_generation_id slot
 * 2. Compare that generation's location with the stored URL from when video was created
 * 3. This detects both variant changes AND slot reordering/replacement
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractSegmentImages } from '@/tools/travel-between-images/components/VideoGallery/utils/gallery-utils';

// How long to show the warning after a source change (in milliseconds)
const SOURCE_CHANGE_WARNING_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export interface SourceMismatchInfo {
  segmentId: string;
  hasMismatch: boolean;
  isRecent: boolean;
  startMismatch: boolean;
  endMismatch: boolean;
  changedAt: Date | null;
}

interface SegmentSourceInfo {
  segmentId: string;
  childOrder: number;
  params: Record<string, any>;
  startGenId: string | null;
  endGenId: string | null;
}

/**
 * Check if video segments' source images have changed
 *
 * @param segments - Array of segment info (id, params, childOrder)
 * @param enabled - Whether to run the query
 * @returns Map of segment ID -> mismatch info
 */
export function useSourceImageChanges(
  segments: SegmentSourceInfo[],
  enabled: boolean = true
) {
  // Extract start generation IDs - videos are attached to the start generation,
  // so we need to find where each start gen is and what's next to it
  const startGenIds = useMemo(() => {
    const genIds = new Set<string>();

    segments.forEach(seg => {
      // Get the start generation ID (the generation the video is attached to)
      if (seg.startGenId) {
        genIds.add(seg.startGenId);
      }

      console.log('[SourceChange] 🔍 Segment ' + seg.segmentId.substring(0, 8) +
        ' startGenId=' + (seg.startGenId?.substring(0, 8) || 'none') +
        ' endGenId=' + (seg.endGenId?.substring(0, 8) || 'none'));
    });

    if (genIds.size > 0) {
      console.log('[SourceChange] 🔍 Hook init: ' + segments.length + ' segments, ' +
        genIds.size + ' startGenIds, enabled=' + enabled);
    }

    return Array.from(genIds);
  }, [segments, enabled]);

  // Query current generations at each slot (shot_generations -> generations)
  const { data: slotData, isLoading } = useQuery({
    queryKey: ['source-slot-generations', ...startGenIds.sort()],
    queryFn: async () => {
      if (startGenIds.length === 0) return {};

      console.log('[SourceChange] 📡 Fetching timeline data for ' + startGenIds.length + ' startGenIds');

      // Step 1: Find where each start generation is on the timeline
      const { data: startSlots, error: startError } = await supabase
        .from('shot_generations')
        .select('id, shot_id, generation_id, timeline_frame, updated_at')
        .in('generation_id', startGenIds)
        .not('timeline_frame', 'is', null);

      if (startError) {
        console.error('[SourceChange] ❌ Start slot query error:', startError);
        return {};
      }

      if (!startSlots || startSlots.length === 0) {
        console.log('[SourceChange] ⚠️ No positioned slots found for start generations');
        return {};
      }

      // Get the shot_id (assuming all segments are from same shot)
      const shotId = startSlots[0].shot_id;

      // Step 2: Get ALL positioned slots for this shot to find what's next to each start gen
      const { data: allSlots, error: allError } = await supabase
        .from('shot_generations')
        .select('id, generation_id, timeline_frame, updated_at')
        .eq('shot_id', shotId)
        .not('timeline_frame', 'is', null)
        .order('timeline_frame', { ascending: true });

      if (allError) {
        console.error('[SourceChange] ❌ All slots query error:', allError);
        return {};
      }

      // Build ordered list for finding "next" generation
      const orderedSlots = allSlots || [];
      console.log('[SourceChange] 📡 Shot has ' + orderedSlots.length + ' positioned slots');

      // Build map: startGenId -> { startSlotInfo, nextGenId, nextSlotUpdatedAt }
      const startGenToNext: Record<string, { startSlot: any; nextGenId: string | null; nextSlotUpdatedAt: Date | null }> = {};
      startSlots.forEach(slot => {
        const idx = orderedSlots.findIndex(s => s.generation_id === slot.generation_id);
        const nextSlot = idx >= 0 && idx < orderedSlots.length - 1 ? orderedSlots[idx + 1] : null;
        startGenToNext[slot.generation_id] = {
          startSlot: slot,
          nextGenId: nextSlot?.generation_id || null,
          // Track when the next slot was last updated (for timeline reorder detection)
          nextSlotUpdatedAt: nextSlot?.updated_at ? new Date(nextSlot.updated_at) : null,
        };
        console.log('[SourceChange] 📡 StartGen ' + slot.generation_id.substring(0, 8) +
          ' at frame ' + slot.timeline_frame +
          ' -> nextGen=' + (nextSlot?.generation_id?.substring(0, 8) || 'none') +
          ' nextSlotUpdatedAt=' + (nextSlot?.updated_at || 'none'));
      });

      // Step 3: Get all generation IDs we need (start + next)
      const allGenIds = new Set<string>();
      Object.values(startGenToNext).forEach(({ startSlot, nextGenId }) => {
        allGenIds.add(startSlot.generation_id);
        if (nextGenId) allGenIds.add(nextGenId);
      });

      // Combine slot data for later processing
      const slotData = orderedSlots;
      const slotError = null;

      if (slotError) {
        console.error('[SourceChange] ❌ Slot query error:', slotError);
        return {};
      }

      // Get generation IDs to look up their primary variants
      const genIds = (slotData || []).map(s => s.generation_id).filter(Boolean);
      if (genIds.length === 0) {
        console.log('[SourceChange] ⚠️ No generation IDs found for slots');
        return {};
      }

      // Query generations with their primary variant location
      const { data: genData, error: genError } = await supabase
        .from('generations')
        .select('id, primary_variant_id, updated_at')
        .in('id', genIds);

      if (genError) {
        console.error('[SourceChange] ❌ Generation query error:', genError);
        return {};
      }

      // Get primary variant IDs
      const variantIds = (genData || []).map(g => g.primary_variant_id).filter(Boolean);

      // Query variants for their locations
      let variantLocations: Record<string, { location: string; created_at: string }> = {};
      if (variantIds.length > 0) {
        const { data: variantData, error: variantError } = await supabase
          .from('generation_variants')
          .select('id, location, created_at')
          .in('id', variantIds);

        if (variantError) {
          console.error('[SourceChange] ❌ Variant query error:', variantError);
        } else {
          (variantData || []).forEach(v => {
            variantLocations[v.id] = { location: v.location, created_at: v.created_at };
          });
        }
      }

      // Build gen_id -> variant location map
      const genToVariant: Record<string, { location: string | null; updated_at: Date }> = {};
      (genData || []).forEach(g => {
        const variant = g.primary_variant_id ? variantLocations[g.primary_variant_id] : null;
        genToVariant[g.id] = {
          location: variant?.location || null,
          // Use generation's updated_at since that reflects when primary_variant_id changed
          updated_at: new Date(g.updated_at),
        };
      });


      // Log data summary
      console.log('[SourceChange] 📥 Data: ' + orderedSlots.length + ' slots, ' +
        Object.keys(genToVariant).length + ' gens with variants');

      // Return everything needed for comparison
      return {
        genToVariant, // genId -> { location, updated_at }
        startGenToNext, // startGenId -> { startSlot, nextGenId }
      };
    },
    enabled: enabled && startGenIds.length > 0,
    staleTime: 0, // Always refetch on invalidation for immediate warning updates
    refetchInterval: 60000, // Refetch every minute to update "recent" status
  });

  // Compare stored URLs with current locations
  const mismatchMap = useMemo(() => {
    const map = new Map<string, SourceMismatchInfo>();
    if (!slotData) return map;

    const { genToVariant, startGenToNext } = slotData;
    if (!genToVariant || !startGenToNext) return map;

    const now = Date.now();

    // Helper to normalize URLs for comparison
    const normalizeUrl = (url: string | null | undefined): string => {
      if (!url) return '';
      try {
        const parsed = new URL(url);
        return parsed.pathname;
      } catch {
        return url;
      }
    };

    console.log('[SourceChange] 🔄 Comparing ' + segments.length + ' segments...');

    segments.forEach(seg => {
      // Extract stored URLs from segment params
      const { startUrl, endUrl } = extractSegmentImages(seg.params, seg.childOrder);

      // Get current state by looking up where start gen is and what's next to it
      const startGenInfo = seg.startGenId ? startGenToNext[seg.startGenId] : null;
      const nextGenId = startGenInfo?.nextGenId;

      // Get current URLs for start gen and the generation that's now next to it
      const currentStartInfo = seg.startGenId ? genToVariant[seg.startGenId] : null;
      const currentEndInfo = nextGenId ? genToVariant[nextGenId] : null;

      const currentStartUrl = currentStartInfo?.location || null;
      const currentEndUrl = currentEndInfo?.location || null;

      // Compare stored URLs with current URLs
      const startMismatch = startUrl && currentStartUrl
        ? normalizeUrl(startUrl) !== normalizeUrl(currentStartUrl)
        : false;

      const endMismatch = endUrl && currentEndUrl
        ? normalizeUrl(endUrl) !== normalizeUrl(currentEndUrl)
        : (endUrl && !currentEndUrl); // Also mismatch if there's no next image anymore

      const hasMismatch = startMismatch || endMismatch;

      // Log comparison for each segment
      const startStoredFile = startUrl ? normalizeUrl(startUrl).split('/').pop() : 'none';
      const startCurrentFile = currentStartUrl ? normalizeUrl(currentStartUrl).split('/').pop() : 'none';
      const endStoredFile = endUrl ? normalizeUrl(endUrl).split('/').pop() : 'none';
      const endCurrentFile = currentEndUrl ? normalizeUrl(currentEndUrl).split('/').pop() : 'none';

      console.log('[SourceChange] 📊 COMPARE seg=' + seg.segmentId.substring(0, 8) +
        ' | START stored=' + startStoredFile +
        ' current=' + startCurrentFile +
        ' match=' + !startMismatch +
        ' | END stored=' + endStoredFile +
        ' current=' + endCurrentFile +
        ' (nextGenId=' + (nextGenId?.substring(0, 8) || 'none') + ')' +
        ' match=' + !endMismatch +
        ' | hasMismatch=' + hasMismatch);

      if (hasMismatch) {
        // Find the most recent change
        // For start image: use generation's updated_at (reflects variant changes)
        const startChangedAt = startMismatch && currentStartInfo?.updated_at
          ? currentStartInfo.updated_at
          : null;

        // For end image: check if it's a timeline reorder (different gen) or variant change (same gen)
        let endChangedAt: Date | null = null;
        if (endMismatch) {
          const isReorderMismatch = nextGenId !== seg.endGenId;
          if (isReorderMismatch && startGenInfo?.nextSlotUpdatedAt) {
            // Timeline was reordered - use the slot's updated_at
            endChangedAt = startGenInfo.nextSlotUpdatedAt;
            console.log('[SourceChange] 📅 END mismatch is REORDER (nextGenId=' + nextGenId?.substring(0, 8) +
              ' vs stored endGenId=' + seg.endGenId?.substring(0, 8) + '), using slot updated_at=' + endChangedAt.toISOString());
          } else if (currentEndInfo?.updated_at) {
            // Same generation but different variant - use generation's updated_at
            endChangedAt = currentEndInfo.updated_at;
            console.log('[SourceChange] 📅 END mismatch is VARIANT CHANGE, using gen updated_at=' + endChangedAt.toISOString());
          }
        }

        let changedAt: Date | null = null;
        if (startChangedAt && endChangedAt) {
          changedAt = startChangedAt > endChangedAt ? startChangedAt : endChangedAt;
        } else {
          changedAt = startChangedAt || endChangedAt;
        }

        const isRecent = changedAt
          ? (now - changedAt.getTime()) < SOURCE_CHANGE_WARNING_DURATION_MS
          : false;

        const minutesAgo = changedAt ? Math.round((now - changedAt.getTime()) / 60000) : null;
        if (isRecent) {
          console.log('[SourceChange] ⚠️ RECENT MISMATCH seg=' + seg.segmentId.substring(0, 8) +
            ' start=' + startMismatch + ' end=' + endMismatch + ' changedAt=' + minutesAgo + 'min ago - SHOULD SHOW WARNING');
        } else if (hasMismatch) {
          console.log('[SourceChange] ℹ️ OLD MISMATCH seg=' + seg.segmentId.substring(0, 8) +
            ' changedAt=' + minutesAgo + 'min ago - warning expired');
        }

        map.set(seg.segmentId, {
          segmentId: seg.segmentId,
          hasMismatch,
          isRecent,
          startMismatch,
          endMismatch,
          changedAt,
        });
      }
    });

    if (map.size > 0) {
      const recentCount = Array.from(map.values()).filter(m => m.isRecent).length;
      const warningIds = Array.from(map.entries())
        .filter(([, info]) => info.isRecent)
        .map(([id]) => id.substring(0, 8));
      console.log('[SourceChange] 📋 Summary: ' + map.size + ' mismatches, ' + recentCount + ' recent (warning IDs: ' + warningIds.join(', ') + ')');
    }

    return map;
  }, [segments, slotData]);

  // Helper to check if a specific segment has a recent mismatch
  const hasRecentMismatch = useMemo(() => {
    return (segmentId: string): boolean => {
      const info = mismatchMap.get(segmentId);
      const result = info?.isRecent ?? false;
      if (result) {
        console.log('[SourceChange] ✅ hasRecentMismatch(' + segmentId.substring(0, 8) + ')=TRUE');
      }
      return result;
    };
  }, [mismatchMap]);

  return {
    mismatchMap,
    hasRecentMismatch,
    isLoading,
    hasAnyMismatches: mismatchMap.size > 0,
  };
}
