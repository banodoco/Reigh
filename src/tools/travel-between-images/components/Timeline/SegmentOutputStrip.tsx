/**
 * SegmentOutputStrip - Compact strip showing segment outputs above timeline
 * 
 * Displays generated video segments aligned with their corresponding image pairs.
 * Each segment is positioned to match the timeline pair below it.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useSegmentOutputsForShot } from '../../hooks/useSegmentOutputsForShot';
import { InlineSegmentVideo } from './InlineSegmentVideo';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { usePendingSegmentTasks } from '@/shared/hooks/usePendingSegmentTasks';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';
import { GenerationRow } from '@/types/shots';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getDisplayUrl } from '@/shared/lib/utils';
import { cn } from '@/lib/utils';

import type { PairData } from './TimelineContainer';

interface PairInfo {
  index: number;
  startFrame: number;
  endFrame: number;
  frames: number;
}

interface SegmentOutputStripProps {
  shotId: string;
  projectId: string;
  projectAspectRatio?: string;
  pairInfo: PairInfo[];
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  /** Map from shot_generation_id to position index (0, 1, 2...) - for instant updates during drag */
  localShotGenPositions?: Map<string, number>;
  /** Callback to open pair settings modal for a specific pair index */
  onOpenPairSettings?: (pairIndex: number) => void;
  /** Optional controlled selected parent ID (shared with FinalVideoSection) */
  selectedParentId?: string | null;
  /** Optional callback when selected parent changes (for controlled mode) */
  onSelectedParentChange?: (id: string | null) => void;
  /** Current pair data by index (shared with SegmentSettingsModal for fresh regeneration data) */
  pairDataByIndex?: Map<number, PairData>;
}

export const SegmentOutputStrip: React.FC<SegmentOutputStripProps> = ({
  shotId,
  projectId,
  projectAspectRatio,
  pairInfo,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  zoomLevel,
  localShotGenPositions,
  onOpenPairSettings,
  selectedParentId: controlledSelectedParentId,
  onSelectedParentChange,
  pairDataByIndex,
}) => {
  // ===== ALL HOOKS MUST BE CALLED UNCONDITIONALLY AT THE TOP =====
  const isMobile = useIsMobile();

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isParentLightboxOpen, setIsParentLightboxOpen] = useState(false);

  // Deletion state
  const [deletingSegmentId, setDeletingSegmentId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // ===== SCRUBBING PREVIEW STATE =====
  // Track which segment is being scrubbed (by slot index)
  const [activeScrubbingIndex, setActiveScrubbingIndex] = useState<number | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Video scrubbing hook - controls the preview video
  const scrubbing = useVideoScrubbing({
    enabled: !isMobile && activeScrubbingIndex !== null,
    playOnStopScrubbing: true,
    playDelay: 400,
    resetOnLeave: true,
    onHoverEnd: () => setActiveScrubbingIndex(null),
  });

  // Get the active segment's video URL
  const activeSegmentSlot = activeScrubbingIndex !== null ? segmentSlots[activeScrubbingIndex] : null;
  const activeSegmentVideoUrl = activeSegmentSlot?.type === 'child' ? activeSegmentSlot.child.location : null;

  // Connect preview video to scrubbing hook when it changes
  useEffect(() => {
    if (previewVideoRef.current) {
      scrubbing.setVideoElement(previewVideoRef.current);
    }
  }, [activeScrubbingIndex, scrubbing.setVideoElement]);

  // Reset scrubbing state when video URL changes
  useEffect(() => {
    if (activeSegmentVideoUrl) {
      scrubbing.reset();
    }
  }, [activeSegmentVideoUrl]);
  
  // Fetch segment outputs data - uses controlled state if provided
  const {
    parentGenerations,
    selectedParentId,
    setSelectedParentId,
    selectedParent,
    hasFinalOutput,
    segmentSlots,
    segmentProgress,
    isLoading,
  } = useSegmentOutputsForShot(
    shotId,
    projectId,
    localShotGenPositions,
    controlledSelectedParentId,
    onSelectedParentChange
  );

  // Check for pending segment tasks (Queued/In Progress)
  const { hasPendingTask } = usePendingSegmentTasks(shotId, projectId);
  
  // Log when segmentSlots changes (to track what's being displayed)
  React.useEffect(() => {
    const childSlots = segmentSlots.filter(s => s.type === 'child');
    console.log('[SegmentDisplay] 📺 CURRENT DISPLAY:', {
      totalSlots: segmentSlots.length,
      childSlots: childSlots.length,
      placeholderSlots: segmentSlots.length - childSlots.length,
      displayedIds: childSlots.map(s => s.type === 'child' ? s.child.id : null),
      displayedLocations: childSlots.map(s => s.type === 'child' ? s.child.location?.substring(0, 40) : null),
    });
  }, [segmentSlots]);
  
  // Mark generation as viewed (updates the primary variant's viewed_at)
  const markGenerationViewed = useCallback(async (generationId: string) => {
    try {
      // First check if a variant exists
      const { data: variants, error: checkError } = await supabase
        .from('generation_variants')
        .select('id, viewed_at')
        .eq('generation_id', generationId)
        .eq('is_primary', true);

      console.log('[SegmentOutputStrip] Checking variants for generation:', generationId.substring(0, 8), variants);

      if (checkError) {
        console.error('[SegmentOutputStrip] Error checking variants:', checkError);
        return;
      }

      if (!variants || variants.length === 0) {
        console.log('[SegmentOutputStrip] No primary variant found for generation:', generationId.substring(0, 8));
        return;
      }

      // Update the primary variant's viewed_at
      const { error } = await supabase
        .from('generation_variants')
        .update({ viewed_at: new Date().toISOString() })
        .eq('generation_id', generationId)
        .eq('is_primary', true)
        .is('viewed_at', null); // Only update if not already viewed

      if (error) {
        console.error('[SegmentOutputStrip] Error marking variant as viewed:', error);
      } else {
        console.log('[SegmentOutputStrip] Marked variant as viewed, invalidating queries');
        // Invalidate variant badges to refresh NEW state
        queryClient.invalidateQueries({ queryKey: ['variant-badges'] });
      }
    } catch (error) {
      console.error('[SegmentOutputStrip] Failed to mark as viewed:', error);
    }
  }, [queryClient]);

  // Handle opening segment in lightbox
  const handleSegmentClick = useCallback((slotIndex: number) => {
    const slot = segmentSlots[slotIndex];
    if (slot?.type === 'child') {
      // Mark as viewed when opening lightbox
      markGenerationViewed(slot.child.id);
    }
    setLightboxIndex(slotIndex);
  }, [segmentSlots, markGenerationViewed]);
  
  // Lightbox navigation - get indices of child slots that have locations
  const childSlotIndices = useMemo(() => 
    segmentSlots
      .map((slot, idx) => slot.type === 'child' && slot.child.location ? idx : null)
      .filter((idx): idx is number => idx !== null),
    [segmentSlots]
  );
  
  const handleLightboxNext = useCallback(() => {
    if (lightboxIndex === null || childSlotIndices.length === 0) return;
    const currentPos = childSlotIndices.indexOf(lightboxIndex);
    const nextPos = (currentPos + 1) % childSlotIndices.length;
    setLightboxIndex(childSlotIndices[nextPos]);
  }, [lightboxIndex, childSlotIndices]);
  
  const handleLightboxPrev = useCallback(() => {
    if (lightboxIndex === null || childSlotIndices.length === 0) return;
    const currentPos = childSlotIndices.indexOf(lightboxIndex);
    const prevPos = (currentPos - 1 + childSlotIndices.length) % childSlotIndices.length;
    setLightboxIndex(childSlotIndices[prevPos]);
  }, [lightboxIndex, childSlotIndices]);
  
  const handleLightboxClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);
  
  const getPairShotGenIdFromParams = useCallback((params: Record<string, any> | null | undefined) => {
    if (!params) return null;
    const individualParams = params.individual_segment_params || {};
    return individualParams.pair_shot_generation_id || params.pair_shot_generation_id || null;
  }, []);

  // Handle segment deletion - delete ALL children for the same pair
  const handleDeleteSegment = useCallback(async (generationId: string) => {
    setDeletingSegmentId(generationId);
    try {
      console.log('[SegmentDelete] Start delete:', generationId.substring(0, 8));

      // Fetch the generation to find its parent and pair_shot_generation_id
      const { data: beforeData, error: fetchError } = await supabase
        .from('generations')
        .select('id, type, parent_generation_id, location, params, primary_variant_id')
        .eq('id', generationId)
        .single();
      
      if (!beforeData) {
        console.log('[SegmentDelete] Generation not found before delete');
        return;
      }

      const pairShotGenId = getPairShotGenIdFromParams(beforeData.params as any);
      const parentId = beforeData.parent_generation_id;

      // Delete ALL child generations for this pair (prevents another segment from taking its slot)
      let idsToDelete = [generationId];
      if (pairShotGenId && parentId) {
        const { data: siblings } = await supabase
          .from('generations')
          .select('id, params')
          .eq('parent_generation_id', parentId);

        idsToDelete = (siblings || [])
          .filter(child => getPairShotGenIdFromParams(child.params as any) === pairShotGenId)
          .map(child => child.id);
      }

      console.log('[SegmentDelete] Deleting children for pair:', {
        pairShotGenId: pairShotGenId?.substring(0, 8) || 'none',
        count: idsToDelete.length,
        ids: idsToDelete.map(id => id.substring(0, 8))
      });

      const { error: deleteError } = await supabase
        .from('generations')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        throw new Error(`Failed to delete: ${deleteError.message}`);
      }
      
      // OPTIMISTIC UPDATE: Remove the deleted item from cache immediately
      console.log('[SegmentDelete] Applying optimistic cache update...');
      
      // Find and update the segment-child-generations cache
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === 'segment-child-generations' },
        (oldData: any) => {
          if (!oldData || !Array.isArray(oldData)) return oldData;
          const filtered = oldData.filter((item: any) => !idsToDelete.includes(item.id));
          console.log('[SegmentDelete] Optimistic update: removed from cache', {
            before: oldData.length,
            after: filtered.length,
            removedIds: idsToDelete.map(id => id.substring(0, 8))
          });
          return filtered;
        }
      );
      
      // Then invalidate and refetch to get fresh data from server
      console.log('[SegmentDelete] Invalidating and refetching caches...');
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'segment-child-generations',
        refetchType: 'all'
      });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'segment-parent-generations',
        refetchType: 'all'
      });
      await queryClient.invalidateQueries({ queryKey: ['unified-generations'] });
      await queryClient.invalidateQueries({ queryKey: ['generations'] });
      
      console.log('[SegmentDelete] Delete complete');
    } catch (error) {
      console.error('[SegmentDelete] ❌ FAILED:', error);
      toast.error(`Failed to delete segment: ${(error as Error).message}`);
    } finally {
      setDeletingSegmentId(null);
    }
  }, [getPairShotGenIdFromParams, queryClient]);
  
  // Get current lightbox media
  const currentLightboxSlot = useMemo(() => 
    lightboxIndex !== null ? segmentSlots[lightboxIndex] : null,
    [lightboxIndex, segmentSlots]
  );
  const currentLightboxMedia = useMemo(() => 
    currentLightboxSlot?.type === 'child' ? currentLightboxSlot.child : null,
    [currentLightboxSlot]
  );
  
  // Transform selected parent for VideoItem/Lightbox
  const parentVideoRow = useMemo(() => {
    if (!selectedParent) return null;
    return {
      ...selectedParent,
      type: 'video',
    } as GenerationRow;
  }, [selectedParent]);
  
  // Calculate segment positions based on pair info
  // Uses same coordinate system as timeline for alignment
  const segmentPositions = useMemo(() => {
    if (!pairInfo.length || fullRange <= 0 || containerWidth <= 0) return [];
    
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    
    const positions = pairInfo.map((pair) => {
      // Calculate pixel positions using same formula as timeline
      const startPixel = TIMELINE_PADDING_OFFSET + ((pair.startFrame - fullMin) / fullRange) * effectiveWidth;
      const endPixel = TIMELINE_PADDING_OFFSET + ((pair.endFrame - fullMin) / fullRange) * effectiveWidth;
      const width = endPixel - startPixel;
      
      // Convert to percentages for CSS
      const leftPercent = (startPixel / containerWidth) * 100;
      const widthPercent = (width / containerWidth) * 100;
      
      return {
        pairIndex: pair.index,
        leftPercent,
        widthPercent,
      };
    });
    
    // Debug: log segment positions
    console.log('[PairSlot] 📐 POSITIONS:', positions.map(p => 
      `[${p.pairIndex}]→${p.leftPercent.toFixed(1)}%`
    ).join(' '));
    
    return positions;
  }, [pairInfo, fullMin, fullRange, containerWidth]);
  
  // ===== NOW WE CAN HAVE EARLY RETURNS =====

  // Build placeholder slots from pairInfo when no segment data exists
  // This ensures placeholders show even before any videos are generated
  const displaySlots = useMemo(() => {
    // If we have actual segment slots, use them
    if (segmentSlots.length > 0) {
      return segmentSlots;
    }

    // No segment data - create placeholder slots from pairInfo
    return pairInfo.map((pair) => ({
      type: 'placeholder' as const,
      index: pair.index,
      expectedFrames: undefined,
      expectedPrompt: undefined,
      startImage: undefined,
      endImage: undefined,
    }));
  }, [segmentSlots, pairInfo]);

  // Calculate preview dimensions based on aspect ratio
  // NOTE: This must be before the early return to follow React's rules of hooks
  const previewDimensions = useMemo(() => {
    const maxHeight = 200;
    if (!projectAspectRatio) return { width: Math.round(maxHeight * 16 / 9), height: maxHeight };
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) {
      const aspectRatio = w / h;
      return { width: Math.round(maxHeight * aspectRatio), height: maxHeight };
    }
    return { width: Math.round(maxHeight * 16 / 9), height: maxHeight };
  }, [projectAspectRatio]);

  // Don't render if no pairs (need at least 2 images for a pair)
  if (pairInfo.length === 0) {
    return null;
  }

  return (
    <div className="w-full relative">
      {/* Scrubbing Preview Area - shows above the strip when scrubbing a segment */}
      <div
        className={cn(
          "flex justify-center mb-2 transition-all duration-200",
          activeScrubbingIndex !== null && activeSegmentVideoUrl
            ? "opacity-100 h-auto"
            : "opacity-0 h-0 overflow-hidden pointer-events-none"
        )}
      >
        <div
          className="relative bg-black rounded-lg overflow-hidden shadow-xl border-2 border-primary/50"
          style={{
            width: previewDimensions.width,
            height: previewDimensions.height,
          }}
        >
          {activeSegmentVideoUrl && (
            <video
              ref={previewVideoRef}
              src={getDisplayUrl(activeSegmentVideoUrl)}
              className="w-full h-full object-contain"
              muted
              playsInline
              preload="auto"
              {...scrubbing.videoProps}
            />
          )}

          {/* Scrubber progress bar */}
          {scrubbing.scrubberPosition !== null && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
              <div
                className={cn(
                  "h-full bg-primary transition-opacity duration-200",
                  scrubbing.scrubberVisible ? "opacity-100" : "opacity-50"
                )}
                style={{ width: `${scrubbing.scrubberPosition}%` }}
              />
            </div>
          )}

          {/* Segment label */}
          {activeScrubbingIndex !== null && (
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              Segment {(activeSegmentSlot?.index ?? 0) + 1}
              {scrubbing.duration > 0 && (
                <span className="ml-2 text-white/70">
                  {scrubbing.currentTime.toFixed(1)}s / {scrubbing.duration.toFixed(1)}s
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Segment output strip - compact height for segment thumbnails */}
      <div
        className="relative h-32 mt-3 mb-1"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          overflow: 'visible',
        }}
      >
        {/* Segment thumbnails - positioned to align with timeline pairs */}
        <div className="absolute left-0 right-0 top-5 bottom-1 overflow-hidden">
          {displaySlots.length > 0 && segmentPositions.length > 0 ? (
            <div className="relative w-full h-full">
              {displaySlots.map((slot, index) => {
                // Get position for this slot's pair index
                const position = segmentPositions.find(p => p.pairIndex === slot.index);

                if (!position) return null;

                const isActiveScrubbing = activeScrubbingIndex === index;

                return (
                  <InlineSegmentVideo
                    key={slot.type === 'child' ? slot.child.id : `placeholder-${index}`}
                    slot={slot}
                    pairIndex={slot.index}
                    onClick={() => handleSegmentClick(index)}
                    projectAspectRatio={projectAspectRatio}
                    isMobile={isMobile}
                    leftPercent={position.leftPercent}
                    widthPercent={position.widthPercent}
                    onOpenPairSettings={onOpenPairSettings}
                    onDelete={handleDeleteSegment}
                    isDeleting={slot.type === 'child' && slot.child.id === deletingSegmentId}
                    isPending={hasPendingTask(slot.pairShotGenerationId)}
                    // Scrubbing props - when active, this segment controls the preview
                    isScrubbingActive={isActiveScrubbing}
                    onScrubbingStart={() => setActiveScrubbingIndex(index)}
                    scrubbingContainerRef={isActiveScrubbing ? scrubbing.containerRef : undefined}
                    scrubbingContainerProps={isActiveScrubbing ? scrubbing.containerProps : undefined}
                    scrubbingProgress={isActiveScrubbing ? scrubbing.progress : undefined}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex-1 h-full flex items-center justify-center text-xs text-muted-foreground">
              {isLoading ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading segments...</span>
                </div>
              ) : (
                <span>No segments generated yet</span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Lightbox for segment videos */}
      {currentLightboxMedia && (
        <MediaLightbox
          media={{
            ...currentLightboxMedia,
            // Only override parent_generation_id if selectedParentId is set
            // Otherwise keep the existing parent_generation_id from the child generation row
            // This is critical for childGenerationId calculation in MediaLightbox regenerate mode
            ...(selectedParentId ? { parent_generation_id: selectedParentId } : {}),
          } as GenerationRow}
          onClose={handleLightboxClose}
          onNext={handleLightboxNext}
          onPrevious={handleLightboxPrev}
          showNavigation={true}
          showImageEditTools={false}
          showDownload={true}
          hasNext={childSlotIndices.length > 1}
          hasPrevious={childSlotIndices.length > 1}
          starred={(currentLightboxMedia as any).starred ?? false}
          shotId={shotId}
          showTaskDetails={true}
          showVideoTrimEditor={true}
          fetchVariantsForSelf={true}
          currentSegmentImages={(() => {
            // Derive currentSegmentImages from shared pairDataByIndex (same source as SegmentSettingsModal)
            const pairData = currentLightboxSlot ? pairDataByIndex?.get(currentLightboxSlot.index) : undefined;
            return {
              startShotGenerationId: pairData?.startImage?.id || currentLightboxSlot?.pairShotGenerationId,
              activeChildGenerationId: currentLightboxMedia?.id,
              startUrl: pairData?.startImage?.url,
              endUrl: pairData?.endImage?.url,
              startGenerationId: pairData?.startImage?.generationId,
              endGenerationId: pairData?.endImage?.generationId,
            };
          })()}
        />
      )}
      
      {/* Lightbox for parent video */}
      {isParentLightboxOpen && parentVideoRow && (
        <MediaLightbox
          media={parentVideoRow}
          onClose={() => setIsParentLightboxOpen(false)}
          showNavigation={false}
          showImageEditTools={false}
          showDownload={true}
          hasNext={false}
          hasPrevious={false}
          starred={(parentVideoRow as any).starred ?? false}
          shotId={shotId}
          showTaskDetails={true}
          showVideoTrimEditor={true}
        />
      )}
    </div>
  );
};

export default SegmentOutputStrip;
