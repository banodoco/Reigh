/**
 * useSegmentOutputsForShot Hook
 * 
 * Manages segment outputs for inline display above the timeline.
 * Handles multiple parent generations (different "runs"), their children,
 * and the slot system for partial results.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GenerationRow } from '@/types/shots';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';

// Slot type - either a real child or a placeholder for a processing segment
export type SegmentSlot =
  | { type: 'child'; child: GenerationRow; index: number; pairShotGenerationId?: string }
  | { type: 'placeholder'; index: number; expectedFrames?: number; expectedPrompt?: string; startImage?: string; endImage?: string; pairShotGenerationId?: string };

export interface ExpectedSegmentData {
  count: number;
  frames: number[];
  prompts: string[];
  inputImages: string[];
  inputImageGenIds: string[];
  pairShotGenIds: string[];
}

export interface UseSegmentOutputsReturn {
  // Multiple parent generations (different "runs")
  parentGenerations: GenerationRow[];
  selectedParentId: string | null;
  setSelectedParentId: (id: string | null) => void;
  
  // Currently selected parent's data
  selectedParent: GenerationRow | null;
  hasFinalOutput: boolean; // parent.location exists
  
  // Segment slots for current parent
  segmentSlots: SegmentSlot[];
  segments: GenerationRow[]; // Actual segment children (not placeholders)
  segmentProgress: { completed: number; total: number };
  expectedSegmentData: ExpectedSegmentData | null;
  
  // Loading states
  isLoading: boolean;
  isRefetching: boolean;
  
  // Actions
  refetch: () => void;
}

/**
 * Extract expected segment data from parent's orchestrator_details
 */
function extractExpectedSegmentData(parentParams: Record<string, any> | null): ExpectedSegmentData | null {
  if (!parentParams) return null;
  
  const orchestratorDetails = parentParams.orchestrator_details;
  if (!orchestratorDetails) return null;
  
  const segmentCount = orchestratorDetails.num_new_segments_to_generate 
    || orchestratorDetails.segment_frames_expanded?.length 
    || 0;
  
  if (segmentCount === 0) return null;
  
  return {
    count: segmentCount,
    frames: orchestratorDetails.segment_frames_expanded || [],
    prompts: orchestratorDetails.enhanced_prompts_expanded || orchestratorDetails.base_prompts_expanded || [],
    inputImages: orchestratorDetails.input_image_paths_resolved || [],
    // Include IDs for tethering videos to shot_generations
    inputImageGenIds: orchestratorDetails.input_image_generation_ids || [],
    pairShotGenIds: orchestratorDetails.pair_shot_generation_ids || [],
  };
}

/**
 * Extract pair identifiers from a generation (checks column first, then params)
 * @param generation - The generation row (may have pair_shot_generation_id column)
 * @param params - The params JSONB (legacy storage location)
 */
function getPairIdentifiers(
  generation: { pair_shot_generation_id?: string } | null,
  params: Record<string, any> | null
): { pairShotGenId?: string; startGenId?: string } {
  // Check the FK column first (new format with referential integrity)
  const columnValue = generation?.pair_shot_generation_id;
  if (columnValue) {
    return {
      pairShotGenId: columnValue,
      startGenId: params?.individual_segment_params?.start_image_generation_id || params?.start_image_generation_id,
    };
  }

  // Fallback to params JSONB (legacy format)
  if (!params) return {};
  const individualParams = params.individual_segment_params || {};
  return {
    pairShotGenId: individualParams.pair_shot_generation_id || params.pair_shot_generation_id,
    startGenId: individualParams.start_image_generation_id || params.start_image_generation_id,
  };
}

/**
 * Check if a generation is a travel segment (has segment_index in params)
 * vs a join output (no segment_index)
 */
function isSegment(params: Record<string, any> | null): boolean {
  return typeof params?.segment_index === 'number';
}

/**
 * Transform raw generation data to GenerationRow format
 */
function transformToGenerationRow(gen: any): GenerationRow {
  return {
    id: gen.id,
    location: gen.location || '',
    imageUrl: gen.location || '',
    thumbUrl: gen.thumbnail_url || gen.location || '',
    type: gen.type || 'video',
    created_at: gen.updated_at || gen.created_at || new Date().toISOString(),
    createdAt: gen.updated_at || gen.created_at || new Date().toISOString(),
    params: gen.params,
    parent_generation_id: gen.parent_generation_id,
    child_order: gen.child_order,
    starred: gen.starred,
    // Include pair_shot_generation_id column (for FK-based slot matching)
    pair_shot_generation_id: gen.pair_shot_generation_id,
  } as GenerationRow;
}

export function useSegmentOutputsForShot(
  shotId: string | null,
  projectId: string | null,
  /** Local shot_generation positions for instant updates during drag */
  localShotGenPositions?: Map<string, number>,
  /** Optional controlled selected parent ID (lifted state from parent) */
  controlledSelectedParentId?: string | null,
  /** Optional callback when selected parent changes (for controlled mode) */
  onSelectedParentChange?: (id: string | null) => void,
  /** Optional preloaded generations for readOnly mode (bypasses database queries) */
  preloadedGenerations?: GenerationRow[]
): UseSegmentOutputsReturn {
  // Debug: Log when local positions are passed
  if (localShotGenPositions && localShotGenPositions.size > 0) {
    console.log('[PairSlot] 📍 LOCAL POSITIONS received:', 
      [...localShotGenPositions.entries()].map(([id, pos]) => `[${pos}]→${id.substring(0, 8)}`).join(' | ')
    );
  }
  
  // Track selected parent generation - use controlled value if provided, otherwise internal state
  const [internalSelectedParentId, setInternalSelectedParentId] = useState<string | null>(null);
  
  // Determine if we're in controlled mode
  const isControlled = controlledSelectedParentId !== undefined;
  const selectedParentId = isControlled ? controlledSelectedParentId : internalSelectedParentId;
  const setSelectedParentId = useCallback((id: string | null) => {
    if (isControlled && onSelectedParentChange) {
      onSelectedParentChange(id);
    } else {
      setInternalSelectedParentId(id);
    }
  }, [isControlled, onSelectedParentChange]);

  // [BatchModeSelection] Debug: trace controlled state in hook
  console.log('[BatchModeSelection] useSegmentOutputsForShot state:', {
    isControlled,
    controlledSelectedParentId: controlledSelectedParentId?.substring(0, 8) || 'undefined',
    internalSelectedParentId: internalSelectedParentId?.substring(0, 8) || 'null',
    effectiveSelectedParentId: selectedParentId?.substring(0, 8) || 'null',
    shotId: shotId?.substring(0, 8) || 'null',
  });

  // Derive parent generations from preloaded data if available
  // Parent generations are videos that:
  // 1. type = 'video'
  // 2. parent_generation_id IS NULL (not a child itself)
  // 3. Has orchestrator_details OR has children pointing to it
  const preloadedParentGenerations = useMemo(() => {
    if (!preloadedGenerations) return undefined;

    // First, find all generation IDs that are referenced as parents
    const parentIds = new Set<string>();
    preloadedGenerations.forEach(gen => {
      const parentId = (gen as any).parent_generation_id || (gen.based_on as any)?.parent_generation_id;
      if (parentId) parentIds.add(parentId);
    });

    console.log('[PreloadedDebug] All preloaded generations:', preloadedGenerations.map(gen => ({
      id: gen.id?.substring(0, 8),
      generation_id: gen.generation_id?.substring(0, 8),
      type: gen.type,
      parent_generation_id: (gen as any).parent_generation_id?.substring(0, 8),
      hasOrchestratorDetails: !!(gen.params as any)?.orchestrator_details,
    })));

    const parents = preloadedGenerations.filter(gen => {
      const isVideo = gen.type?.includes('video');
      // Check if this is NOT a child (no parent_generation_id)
      const isNotChild = !(gen as any).parent_generation_id;
      // Has orchestrator_details OR is referenced as a parent by other generations
      const hasOrchestratorDetails = !!(gen.params as any)?.orchestrator_details;
      // Use generation_id for parent lookup (shot_generations.generation_id -> generations.id)
      const genId = gen.generation_id || gen.id;
      const hasChildren = parentIds.has(genId);

      return isVideo && isNotChild && (hasOrchestratorDetails || hasChildren);
    });

    // Sort by created_at descending (most recent first) to match actual page behavior
    // This ensures auto-select picks the most recent parent
    parents.sort((a, b) => {
      const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
      const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
      return dateB - dateA; // Descending - most recent first
    });

    console.log('[PreloadedDebug] Found parent generations (sorted by most recent):', parents.length, parents.map(p => ({
      id: p.id?.substring(0, 8),
      generation_id: p.generation_id?.substring(0, 8),
      created_at: p.created_at,
    })));

    return parents;
  }, [preloadedGenerations]);

  // Fetch parent generations using the shot_final_videos view (single query, all filtering server-side)
  // Skip query when preloaded data is available
  const {
    data: parentGenerationsData,
    isLoading: isLoadingParents,
    isFetching: isFetchingParents,
    refetch: refetchParents,
  } = useQuery({
    queryKey: ['segment-parent-generations', shotId, projectId],
    queryFn: async () => {
      if (!shotId || !projectId) return [];

      console.log('[useSegmentOutputsForShot] Fetching parent generations for shot:', shotId.substring(0, 8));

      // Single query using the shot_final_videos view
      // This replaces 3 queries + client-side filtering with 1 indexed query
      const { data, error } = await supabase
        .from('shot_final_videos')
        .select('*')
        .eq('shot_id', shotId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useSegmentOutputsForShot] Error fetching parent generations:', error);
        throw error;
      }

      console.log('[useSegmentOutputsForShot] Found parent generations:', data?.length || 0);

      return (data || []).map(transformToGenerationRow);
    },
    enabled: !!shotId && !!projectId && !preloadedGenerations,
    staleTime: 30000, // 30 seconds
  });

  // Use preloaded data if available, otherwise use query data
  const parentGenerations = (preloadedParentGenerations ?? parentGenerationsData) || [];
  
  // Auto-select the first (most recent) parent if none selected
  // IMPORTANT: Only auto-select when:
  // 1. The query is enabled (shotId exists) - prevents controlled components with disabled queries from clearing selection
  // 2. NOT in controlled mode - parent component manages selection
  // 3. There are parent generations to select from
  useEffect(() => {
    // Don't auto-select if query is disabled (we're just using controlled state passthrough)
    if (!shotId) return;

    // Don't auto-select if in controlled mode - parent component manages selection
    if (isControlled) return;

    if (parentGenerations.length > 0 && !selectedParentId) {
      const toSelect = parentGenerations[0];
      console.log('[ParentAutoSelect] Auto-selecting most recent parent:', {
        id: toSelect.id?.substring(0, 8),
        generation_id: toSelect.generation_id?.substring(0, 8),
        created_at: toSelect.created_at,
        totalParents: parentGenerations.length,
      });
      setSelectedParentId(parentGenerations[0].id);
    } else if (parentGenerations.length > 0 && selectedParentId) {
      // Validate that current selection exists in the list
      const selectionExists = parentGenerations.some(p => p.id === selectedParentId);
      if (!selectionExists) {
        console.log('[ParentAutoSelect] Current selection invalid, switching to most recent');
        setSelectedParentId(parentGenerations[0].id);
      }
    }
    // Note: We don't set to null when parentGenerations is empty - keep last selection
  }, [parentGenerations, selectedParentId, shotId, isControlled, setSelectedParentId]);
  
  // Get the selected parent
  const selectedParent = useMemo(() => {
    if (!selectedParentId) return null;
    return parentGenerations.find(p => p.id === selectedParentId) || null;
  }, [parentGenerations, selectedParentId]);
  
  // Derive children from preloaded data if available
  // Children are generations with parent_generation_id pointing to the selected parent
  const preloadedChildren = useMemo(() => {
    if (!preloadedGenerations || !selectedParentId) return undefined;

    // The selected parent might be a shot_generations.id or a generations.id
    // We need to find the generation_id for the selected parent
    const selectedParent = parentGenerations.find(p => p.id === selectedParentId || p.generation_id === selectedParentId);
    const parentGenId = selectedParent?.generation_id || selectedParentId;

    console.log('[PreloadedDebug] Looking for children of parent:', {
      selectedParentId: selectedParentId?.substring(0, 8),
      parentGenId: parentGenId?.substring(0, 8),
      parentGenerationsCount: parentGenerations.length,
      selectedParentDetails: selectedParent ? {
        id: selectedParent.id?.substring(0, 8),
        generation_id: selectedParent.generation_id?.substring(0, 8),
        type: selectedParent.type,
      } : 'not found',
    });

    // Log all generations with parent_generation_id set (for debugging)
    const generationsWithParent = preloadedGenerations.filter(gen => (gen as any).parent_generation_id);
    console.log('[PreloadedDebug] Generations with parent_generation_id:',
      generationsWithParent.length,
      generationsWithParent.slice(0, 5).map(gen => ({
        id: gen.id?.substring(0, 8),
        generation_id: gen.generation_id?.substring(0, 8),
        parent_generation_id: (gen as any).parent_generation_id?.substring(0, 8),
        type: gen.type,
        hasLocation: !!(gen.location || gen.imageUrl),
      }))
    );

    const children = preloadedGenerations.filter(gen => {
      // Check if this generation's parent_generation_id matches the selected parent
      const parentId = (gen as any).parent_generation_id;
      return parentId === parentGenId || parentId === selectedParentId;
    });

    console.log('[PreloadedDebug] Found children for selected parent:', children.length,
      children.slice(0, 3).map(c => ({
        id: c.id?.substring(0, 8),
        parent_generation_id: (c as any).parent_generation_id?.substring(0, 8),
        child_order: (c as any).child_order,
        hasLocation: !!(c.location || c.imageUrl),
      }))
    );
    return children;
  }, [preloadedGenerations, selectedParentId, parentGenerations]);

  // Smart polling for segment children - allows new segments to appear after task completion
  const childrenQueryKey = ['segment-child-generations', selectedParentId];
  const childrenPollingConfig = useSmartPollingConfig(childrenQueryKey);

  // Fetch children for selected parent - skip if preloaded data available
  const {
    data: childGenerationsData,
    isLoading: isLoadingChildren,
    isFetching: isFetchingChildren,
    refetch: refetchChildren,
  } = useQuery({
    queryKey: childrenQueryKey,
    queryFn: async () => {
      if (!selectedParentId) return [];

      console.log('[useSegmentOutputsForShot] Fetching children for parent:', selectedParentId.substring(0, 8));

      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('parent_generation_id', selectedParentId)
        .order('child_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useSegmentOutputsForShot] Error fetching children:', error);
        throw error;
      }

      console.log('[useSegmentOutputsForShot] Found children:', data?.length || 0);

      return (data || []).map(transformToGenerationRow);
    },
    enabled: !!selectedParentId && !preloadedGenerations,
    // Smart polling config - polls when realtime is unhealthy, otherwise relies on invalidation
    ...childrenPollingConfig,
    refetchOnWindowFocus: false,
  });

  // Use preloaded children if available
  const childGenerations = (preloadedChildren ?? childGenerationsData) || [];
  
  // Filter to only segments (not join outputs)
  const segments = useMemo(() => {
    return childGenerations.filter(child => isSegment(child.params as any));
  }, [childGenerations]);
  
  // Derive timeline data from preloaded generations if available
  const preloadedTimelineData = useMemo(() => {
    if (!preloadedGenerations) return undefined;
    // Filter to positioned items and map to timeline format
    return preloadedGenerations
      .filter(gen => gen.timeline_frame !== null && gen.timeline_frame !== undefined && gen.timeline_frame >= 0)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0))
      .map(gen => ({
        id: gen.id,  // shot_generations.id
        generation_id: gen.generation_id,
        timeline_frame: gen.timeline_frame,
      }));
  }, [preloadedGenerations]);

  // Fetch LIVE shot_generations to get current timeline order
  // This is the source of truth for video positioning - videos move with their images
  // Skip if preloaded data available
  const {
    data: liveTimelineData,
    refetch: refetchTimeline,
  } = useQuery({
    queryKey: ['segment-live-timeline', shotId],
    queryFn: async () => {
      if (!shotId) return [];

      console.log('[PairSlot] 🟡 Fetching LIVE timeline for shot:', shotId.substring(0, 8));

      const { data, error } = await supabase
        .from('shot_generations')
        .select('id, generation_id, timeline_frame')
        .eq('shot_id', shotId)
        .gte('timeline_frame', 0) // Only positioned images
        .order('timeline_frame', { ascending: true });

      if (error) {
        console.error('[PairSlot] Error fetching live timeline:', error);
        throw error;
      }

      console.log('[PairSlot] 🟡 LIVE timeline result:', data?.length, 'images');

      return data || [];
    },
    enabled: !!shotId && !preloadedGenerations,
    staleTime: 10000, // Refresh more frequently to catch timeline changes
  });

  // Use preloaded timeline if available
  const effectiveTimelineData = preloadedTimelineData ?? liveTimelineData;
  
  // Build map of shot_generation.id → current position (live, not snapshot)
  const liveShotGenIdToPosition = useMemo(() => {
    const map = new Map<string, number>();
    (effectiveTimelineData || []).forEach((sg, index) => {
      map.set(sg.id, index);
    });

    // Log the live timeline state
    if (effectiveTimelineData && effectiveTimelineData.length > 0) {
      console.log('[PairSlot] 🟣 LIVE TIMELINE MAP:', effectiveTimelineData.map((sg, i) =>
        `[${i}]→${sg.id} (frame:${sg.timeline_frame})`
      ).join(' | '));
    }

    return map;
  }, [effectiveTimelineData]);
  
  // Extract expected segment data from selected parent
  const expectedSegmentData = useMemo(() => {
    if (!selectedParent) return null;
    return extractExpectedSegmentData(selectedParent.params as any);
  }, [selectedParent]);
  
  // Build segment slots
  // Uses LOCAL positions (instant during drag) or LIVE timeline (from DB) for slot assignment
  const segmentSlots = useMemo((): SegmentSlot[] => {
    // Prefer local positions (instant updates) over live DB query
    const useLocalPositions = localShotGenPositions && localShotGenPositions.size > 0;
    const positionMap = useLocalPositions ? localShotGenPositions : liveShotGenIdToPosition;
    const slotCount = useLocalPositions
      ? localShotGenPositions.size - 1  // N images = N-1 pairs
      : (effectiveTimelineData?.length ? effectiveTimelineData.length - 1 : 0);
    
    const expectedCount = expectedSegmentData?.count || slotCount;
    
    // Summary log: show full state in one place
    const positionSummary = [...positionMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([id, pos]) => `[${pos}]=${id.substring(0, 8)}`)
      .join(' ');
    const videoSummary = segments.map(v => {
      const { pairShotGenId } = getPairIdentifiers(v as any, v.params as any);
      const pos = pairShotGenId ? positionMap.get(pairShotGenId) : undefined;
      return `${v.id.substring(0, 8)}→${pairShotGenId?.substring(0, 8) || 'NULL'}@${pos ?? '?'}`;
    }).join(' | ');
    
    console.log(`[PairSlot] 📊 SUMMARY: slotCount=${slotCount} | positions: ${positionSummary} | videos: ${videoSummary}`);
    
    // Use slotCount (current timeline) for positioning, not expectedCount (original generation)
    if (slotCount === 0) {
      // No position data, just show what we have
      return segments.map((child, index) => ({
        type: 'child' as const,
        child,
        index: (child as any).child_order ?? index,
      }));
    }
    
    // Create slots for all expected segments
    const slots: SegmentSlot[] = [];
    const childrenBySlot = new Map<number, GenerationRow>();
    const usedSlots = new Set<number>();
    const childrenWithoutValidSlot: GenerationRow[] = [];
    
    // Priority chain for slot mapping:
    // 1. pair_shot_generation_id → position (LOCAL for instant, LIVE as fallback)
    // 2. child_order (fallback ONLY for videos without pair_shot_generation_id)
    segments.forEach(child => {
      const { pairShotGenId } = getPairIdentifiers(child as any, child.params as any);
      const childOrder = (child as any).child_order;
      
      let derivedSlot: number | undefined;
      let slotSource = 'NONE';
      let pairShotGenPosition: number | undefined;
      
      // Priority 1: pair_shot_generation_id → look up position (instant from local, or from DB)
      // Videos should move with their images
      if (pairShotGenId && positionMap.has(pairShotGenId)) {
        pairShotGenPosition = positionMap.get(pairShotGenId)!;
        // Only validate against slot count (current timeline)
        // Position N means "start of pair N", but pair N only exists if there's an image at N+1
        if (pairShotGenPosition < slotCount) {
          derivedSlot = pairShotGenPosition;
          slotSource = useLocalPositions ? 'LOCAL_POSITION' : 'PAIR_SHOT_GEN_ID_LIVE';
        } else {
          // Image is at last position - no valid pair starts there
          slotSource = 'PAIR_AT_END_NO_SLOT';
        }
      }
      
      // Priority 2: child_order (fallback ONLY if no pair_shot_generation_id exists)
      // If the video HAS a pair_shot_gen_id but it's at an invalid position (end), don't fallback
      if (derivedSlot === undefined && !pairShotGenId && typeof childOrder === 'number' && 
          childOrder >= 0 && childOrder < slotCount) {
        derivedSlot = childOrder;
        slotSource = 'CHILD_ORDER';
      }
      
      console.log(`[PairSlot] 🟢 Video ${child.id.substring(0, 8)} | pairShotGenId=${pairShotGenId || 'NULL'} | pos=${pairShotGenPosition ?? 'N/A'} | childOrder=${childOrder} | derivedSlot=${derivedSlot} | source=${slotSource}`);
      
      // Skip videos whose pair_shot_gen is at an invalid position (e.g., last image)
      // These videos can't be shown because their start image has no following image
      if (slotSource === 'PAIR_AT_END_NO_SLOT') {
        console.log(`[PairSlot] ⏭️ Skipping video ${child.id.substring(0, 8)} - its pair_shot_gen is at position ${pairShotGenPosition} (last image, no pair)`);
        return; // Skip this video entirely
      }
      
      // Check if slot is valid and not already used
      if (derivedSlot !== undefined && !usedSlots.has(derivedSlot)) {
        childrenBySlot.set(derivedSlot, child);
        usedSlots.add(derivedSlot);
        console.log(`[PairSlot] ✅ Assigned video ${child.id.substring(0, 8)} to slot ${derivedSlot}`);
      } else if (derivedSlot !== undefined && usedSlots.has(derivedSlot)) {
        // Slot collision! Another segment wants the same slot
        const existingChild = childrenBySlot.get(derivedSlot);
        console.log(`[PairSlot] ⚠️ SLOT COLLISION: Video ${child.id.substring(0, 8)} wants slot ${derivedSlot} but it's taken by ${existingChild?.id.substring(0, 8)}`);
        childrenWithoutValidSlot.push(child);
      } else {
        childrenWithoutValidSlot.push(child);
      }
    });
    
    // DON'T assign orphans to available slots - this was causing deleted segments
    // to be replaced by other segments. Orphan segments (without valid pair_shot_generation_id)
    // should NOT be displayed. They'll remain hidden until regenerated for the correct slot.
    if (childrenWithoutValidSlot.length > 0) {
      console.log(`[PairSlot] ⚠️ ${childrenWithoutValidSlot.length} orphan segments will NOT be displayed:`, 
        childrenWithoutValidSlot.map(c => c.id.substring(0, 8)));
    }
    
    // Fill in slots using LIVE timeline data for placeholders
    for (let i = 0; i < slotCount; i++) {
      const child = childrenBySlot.get(i);
      // Use live timeline for pair_shot_generation_id (shot_generations.id of start image)
      const liveStartImage = effectiveTimelineData?.[i];
      const liveEndImage = effectiveTimelineData?.[i + 1];
      // Get pair_shot_generation_id: prefer live data, fall back to expected data
      const pairShotGenerationId = liveStartImage?.id || expectedSegmentData?.pairShotGenIds?.[i];

      if (child) {
        slots.push({ type: 'child', child, index: i, pairShotGenerationId });
      } else {
        slots.push({
          type: 'placeholder',
          index: i,
          expectedFrames: expectedSegmentData?.frames[i],
          expectedPrompt: expectedSegmentData?.prompts[i],
          startImage: liveStartImage?.generation_id || expectedSegmentData?.inputImages[i],
          endImage: liveEndImage?.generation_id || expectedSegmentData?.inputImages[i + 1],
          pairShotGenerationId,
        });
      }
    }

    return slots;
  }, [segments, expectedSegmentData, effectiveTimelineData, liveShotGenIdToPosition, localShotGenPositions]);
  
  // Calculate progress
  const segmentProgress = useMemo(() => {
    const completed = segmentSlots.filter(s => s.type === 'child' && (s.child as any).location).length;
    const total = segmentSlots.length;
    return { completed, total };
  }, [segmentSlots]);
  
  // Combined refetch
  const refetch = useCallback(() => {
    refetchParents();
    refetchChildren();
    refetchTimeline();
  }, [refetchParents, refetchChildren, refetchTimeline]);
  
  return {
    parentGenerations,
    selectedParentId,
    setSelectedParentId,
    selectedParent,
    hasFinalOutput: !!(selectedParent?.location),
    segmentSlots,
    segments, // Actual segment children (for join functionality)
    segmentProgress,
    expectedSegmentData,
    isLoading: isLoadingParents || isLoadingChildren,
    isRefetching: isFetchingParents || isFetchingChildren,
    refetch,
  };
}

