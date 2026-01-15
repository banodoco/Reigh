/**
 * SegmentOutputStrip - Compact strip showing segment outputs above timeline
 * 
 * Displays generated video segments aligned with their corresponding image pairs.
 * Each segment is positioned to match the timeline pair below it.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Play, Loader2 } from 'lucide-react';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { useSegmentOutputsForShot } from '../../hooks/useSegmentOutputsForShot';
import { InlineSegmentVideo } from './InlineSegmentVideo';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { GenerationRow } from '@/types/shots';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';

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
}) => {
  // ===== ALL HOOKS MUST BE CALLED UNCONDITIONALLY AT THE TOP =====
  const isMobile = useIsMobile();
  
  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isParentLightboxOpen, setIsParentLightboxOpen] = useState(false);
  
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
  
  // Handle opening segment in lightbox
  const handleSegmentClick = useCallback((slotIndex: number) => {
    setLightboxIndex(slotIndex);
  }, []);
  
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
  
  // Don't render if no parent generations
  if (parentGenerations.length === 0) {
    return null;
  }
  
  return (
    <div className="w-full relative">
      {/* Segment output strip - compact height for segment thumbnails */}
      <div
        className="relative h-32 mt-3 mb-0"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          overflow: 'visible',
        }}
      >
        {/* Final output play button - if there's a final joined video, show play icon on right */}
        {hasFinalOutput && parentVideoRow && (
          <button
            className="absolute top-1 right-2 z-30 h-6 px-2 flex items-center gap-1 text-[10px] bg-background/95 hover:bg-background border border-border/50 rounded-md transition-colors"
            onClick={() => setIsParentLightboxOpen(true)}
          >
            <Play className="w-3 h-3" fill="currentColor" />
            <span>Play Full</span>
          </button>
        )}

        {/* Segment thumbnails - positioned to align with timeline pairs */}
        <div className="absolute left-0 right-0 top-5 bottom-1 overflow-hidden">
          {segmentSlots.length > 0 && segmentPositions.length > 0 ? (
            <div className="relative w-full h-full">
              {segmentSlots.map((slot, index) => {
                // Get position for this slot's pair index
                const position = segmentPositions.find(p => p.pairIndex === slot.index);
                
                // Debug: log what position each video is getting
                const videoId = slot.type === 'child' ? slot.child.id.substring(0, 8) : 'placeholder';
                console.log(`[PairSlot] 🎨 RENDER: ${videoId} | slot.index=${slot.index} | position.pairIndex=${position?.pairIndex} | leftPercent=${position?.leftPercent?.toFixed(1)}%`);
                
                if (!position) return null;
                
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
            parent_generation_id: selectedParentId,
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
