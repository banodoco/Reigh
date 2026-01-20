/**
 * InlineSegmentVideo - Individual segment thumbnail in the output strip
 * 
 * Shows a thumbnail positioned to align with its corresponding timeline pair.
 * Hover triggers a larger preview, click opens lightbox.
 * Uses standard VariantBadge for variant count and NEW indicator.
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Play, Loader2, ImageOff, Sparkles, Trash2 } from 'lucide-react';
import { SegmentSlot } from '../../hooks/useSegmentOutputsForShot';
import { getDisplayUrl } from '@/shared/lib/utils';
import { useVariantBadges } from '@/shared/hooks/useVariantBadges';
import { VariantBadge } from '@/shared/components/VariantBadge';
import { cn } from '@/shared/lib/utils';

interface InlineSegmentVideoProps {
  slot: SegmentSlot;
  pairIndex: number;
  onClick: () => void;
  projectAspectRatio?: string;
  isMobile?: boolean;
  // Position props for alignment with timeline
  leftPercent: number;
  widthPercent: number;
  /** Callback to open pair settings modal */
  onOpenPairSettings?: (pairIndex: number) => void;
  /** Callback to delete this segment */
  onDelete?: (generationId: string) => void;
  /** Whether deletion is in progress for this segment */
  isDeleting?: boolean;
  /** Whether a task is pending (Queued/In Progress) for this segment */
  isPending?: boolean;
  // Scrubbing props - for external preview control
  /** Whether this segment is actively being scrubbed */
  isScrubbingActive?: boolean;
  /** Callback when scrubbing should start (mouse enters this segment) */
  onScrubbingStart?: () => void;
  /** Ref to attach to container for scrubbing (from useVideoScrubbing) */
  scrubbingContainerRef?: React.RefObject<HTMLDivElement>;
  /** Props to spread on container for scrubbing (from useVideoScrubbing) */
  scrubbingContainerProps?: {
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  /** Current scrubbing progress (0-1) for visual feedback */
  scrubbingProgress?: number;
}

export const InlineSegmentVideo: React.FC<InlineSegmentVideoProps> = ({
  slot,
  pairIndex,
  onClick,
  projectAspectRatio,
  isMobile = false,
  leftPercent,
  widthPercent,
  onOpenPairSettings,
  onDelete,
  isDeleting = false,
  isPending = false,
  // Scrubbing props
  isScrubbingActive = false,
  onScrubbingStart,
  scrubbingContainerRef,
  scrubbingContainerProps,
  scrubbingProgress,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const localContainerRef = useRef<HTMLDivElement>(null);
  
  // Frame rate for frame number calculation (Wan model outputs 16fps)
  const FPS = 16;
  
  // Get variant badge data for child slots
  const generationId = slot.type === 'child' ? slot.child.id : null;
  const { getBadgeData } = useVariantBadges(
    generationId ? [generationId] : [],
    !!generationId
  );
  const badgeData = generationId ? getBadgeData(generationId) : null;
  
  // Show NEW badge if: generation has any unviewed variants (including the auto-created primary)
  // The DB trigger auto-creates a primary variant with viewed_at=null when a generation is inserted
  const showNewBadge = badgeData?.hasUnviewedVariants || false;
  
  // Calculate preview width and aspect ratio (let height be determined by aspect ratio)
  const previewStyle = useMemo(() => {
    const baseWidth = 240;
    if (!projectAspectRatio) return { width: baseWidth, aspectRatio: '16/9' };
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) {
      return { width: baseWidth, aspectRatio: `${w}/${h}` };
    }
    return { width: baseWidth, aspectRatio: '16/9' };
  }, [projectAspectRatio]);
  
  // Calculate height for positioning (approximate, used for tooltip placement)
  const estimatedPreviewHeight = useMemo(() => {
    if (!projectAspectRatio) return Math.round(240 * 9 / 16);
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) return Math.round(240 * h / w);
    return Math.round(240 * 9 / 16);
  }, [projectAspectRatio]);
  
  // Position style for absolute positioning
  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
    top: 0,
    bottom: 0,
  };
  
  // Handle mouse events - integrates with external scrubbing system
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setIsHovering(true);

    // Notify parent that scrubbing should start on this segment
    onScrubbingStart?.();

    // If we have external scrubbing props, call their handler
    if (scrubbingContainerProps?.onMouseEnter) {
      scrubbingContainerProps.onMouseEnter();
    }
  }, [isMobile, onScrubbingStart, scrubbingContainerProps]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setHoverPosition({ x: e.clientX, y: e.clientY });

    // If we have external scrubbing props, call their handler
    if (scrubbingContainerProps?.onMouseMove) {
      scrubbingContainerProps.onMouseMove(e);
    }
  }, [isMobile, scrubbingContainerProps]);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setIsHovering(false);
    setCurrentTime(0);

    // If we have external scrubbing props, call their handler
    if (scrubbingContainerProps?.onMouseLeave) {
      scrubbingContainerProps.onMouseLeave();
    }

    // Also reset local video if not using external scrubbing
    if (videoRef.current && !isScrubbingActive) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isMobile, scrubbingContainerProps, isScrubbingActive]);
  
  // Start video and track time when hovering
  useEffect(() => {
    const video = videoRef.current;
    if (!isHovering || !video) return;
    
    // Start playback
    if (slot.type === 'child' && slot.child.location) {
      video.play().catch(() => {});
    }
    
    // Set up time tracking
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };
    
    // If metadata already loaded, get duration immediately
    if (video.duration) {
      setDuration(video.duration);
    }
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [isHovering, slot]);
  
  // Calculate current frame number and progress percentage
  const currentFrame = Math.floor(currentTime * FPS);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  // Adjusted position style with gaps
  const adjustedPositionStyle: React.CSSProperties = {
    ...positionStyle,
    left: `calc(${leftPercent}% + 2px)`,
    width: `calc(${widthPercent}% - 4px)`,
  };

  // Placeholder (no video generated yet) state - show CTA to generate or pending indicator
  if (slot.type === 'placeholder') {
    // If a task is pending (Queued/In Progress), show loading state
    if (isPending) {
      return (
        <div
          className="bg-muted/40 rounded-lg border-2 border-dashed border-primary/40 flex items-center justify-center"
          style={adjustedPositionStyle}
        >
          <div className="flex flex-col items-center gap-1 text-primary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[10px] font-medium">Pending</span>
          </div>
        </div>
      );
    }

    // Otherwise show generate CTA
    return (
      <button
        className="bg-muted/30 rounded-lg border-2 border-dashed border-border/40 flex items-center justify-center cursor-pointer hover:bg-muted/50 hover:border-primary/40 transition-colors group"
        style={adjustedPositionStyle}
        onClick={() => onOpenPairSettings?.(pairIndex)}
      >
        <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-foreground transition-colors">
          <Sparkles className="w-4 h-4 opacity-60 group-hover:opacity-100" />
          <span className="text-[10px] font-medium">Generate</span>
        </div>
      </button>
    );
  }
  
  // Child slot
  const child = slot.child;
  const hasOutput = !!child.location;
  const thumbUrl = child.thumbUrl || child.location;
  const videoUrl = child.location;
  
  // No output yet (processing)
  if (!hasOutput) {
    return (
      <div 
        className="bg-muted/40 rounded-lg border-2 border-dashed border-border/50 flex items-center justify-center"
        style={adjustedPositionStyle}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-xs font-medium">Processing...</span>
        </div>
      </div>
    );
  }
  
  // Use scrubbing ref when active, otherwise use local ref
  const containerRefToUse = isScrubbingActive && scrubbingContainerRef ? scrubbingContainerRef : localContainerRef;

  return (
    <>
      <div
        ref={containerRefToUse}
        className={cn(
          "cursor-pointer overflow-hidden rounded-lg border-2 border-primary/30 shadow-md bg-muted/20",
          "transition-all duration-150",
          isHovering && "z-10 border-primary",
          isScrubbingActive && "ring-2 ring-primary ring-offset-1"
        )}
        style={adjustedPositionStyle}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Thumbnail image */}
        {thumbUrl && !imageError ? (
          <img
            src={getDisplayUrl(thumbUrl)}
            alt={`Segment ${pairIndex + 1}`}
            className={cn(
              "absolute inset-0 w-full h-full object-cover",
              isHovering && "brightness-110"
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        ) : imageError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <ImageOff className="w-8 h-8 text-muted-foreground" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        )}
        
        {/* Variant badge - top left (uses standard VariantBadge component) */}
        {/* Shows NEW for: unviewed variants OR recently created segments with no variants */}
        {(badgeData || showNewBadge) && (
          <VariantBadge
            derivedCount={badgeData?.derivedCount || 0}
            unviewedVariantCount={showNewBadge ? 1 : (badgeData?.unviewedVariantCount || 0)}
            hasUnviewedVariants={showNewBadge}
            alwaysShowNew={showNewBadge}
            variant="overlay"
            size="lg"
            position="top-2 left-2"
          />
        )}
        
        {/* Delete button - top right, appears on hover */}
        {onDelete && (
          <button
            className={cn(
              "absolute top-1 right-1 z-20 w-6 h-6 rounded-md flex items-center justify-center",
              "bg-destructive/90 hover:bg-destructive text-destructive-foreground",
              "transition-opacity duration-150",
              isDeleting ? "opacity-100" : isHovering ? "opacity-100" : "opacity-0"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDeleting) {
                onDelete(child.id);
              }
            }}
            disabled={isDeleting}
            title="Delete segment"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        
        {/* Play icon overlay - center (hidden when pending) */}
        {!isPending && (
          <div className={cn(
            "absolute inset-0 flex items-center justify-center",
            "transition-opacity duration-150",
            isHovering ? "opacity-0" : "opacity-100"
          )}>
            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}

        {/* Pending indicator - shows on top when a new task is queued/in progress */}
        {isPending && (
          <div
            className="absolute bottom-1 right-1 z-20 flex items-center justify-center bg-background/95 p-1.5 rounded-md border shadow-sm cursor-default"
            title="A generation is pending"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          </div>
        )}
        
        {/* Hover highlight border */}
        {isHovering && (
          <div className="absolute inset-0 ring-2 ring-primary ring-inset pointer-events-none" />
        )}
        
        {/* Progress bar / scrubber when hovering */}
        {isHovering && (scrubbingProgress !== undefined || duration > 0) && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 pointer-events-none">
            <div
              className="h-full bg-primary transition-all duration-75"
              style={{
                width: `${scrubbingProgress !== undefined ? scrubbingProgress * 100 : progressPercent}%`
              }}
            />
          </div>
        )}
      </div>

      {/* Floating preview - portal to body (hidden when using external scrubbing preview) */}
      {isHovering && !isMobile && videoUrl && !isScrubbingActive && createPortal(
        <div 
          className="fixed pointer-events-none"
          style={{
            left: `${hoverPosition.x}px`,
            top: `${hoverPosition.y - estimatedPreviewHeight - 40}px`,
            transform: 'translateX(-50%)',
            zIndex: 999999,
          }}
        >
          <div className="bg-background border-2 border-primary rounded-lg shadow-2xl overflow-hidden">
            {/* Video preview - aspect ratio determined by project settings */}
            <div 
              className="relative bg-black"
              style={{ width: previewStyle.width, aspectRatio: previewStyle.aspectRatio }}
            >
              <video
                ref={videoRef}
                src={getDisplayUrl(videoUrl)}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                preload="auto"
              />
            </div>
            
            {/* Label with frame number */}
            <div className="px-3 py-1.5 bg-background/95 border-t border-primary/40 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Segment {pairIndex + 1}
              </span>
              <div className="flex items-center gap-2">
                {/* Current frame indicator */}
                <span className="text-xs text-muted-foreground tabular-nums">
                  Frame {currentFrame}
                </span>
                {/* Variant badge in preview tooltip */}
                {(badgeData || showNewBadge) && (
                  <VariantBadge
                    derivedCount={badgeData?.derivedCount || 0}
                    unviewedVariantCount={showNewBadge ? 1 : (badgeData?.unviewedVariantCount || 0)}
                    hasUnviewedVariants={showNewBadge}
                    alwaysShowNew={showNewBadge}
                    variant="inline"
                    size="md"
                    tooltipSide="top"
                  />
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default InlineSegmentVideo;
