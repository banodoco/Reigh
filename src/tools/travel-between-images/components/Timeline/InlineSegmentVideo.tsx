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
import { useMarkVariantViewed } from '@/shared/hooks/useMarkVariantViewed';
import { cn } from '@/shared/lib/utils';

interface InlineSegmentVideoProps {
  slot: SegmentSlot;
  pairIndex: number;
  onClick: () => void;
  projectAspectRatio?: string;
  isMobile?: boolean;
  // Position props for alignment with timeline (optional - if not provided, uses flow layout)
  leftPercent?: number;
  widthPercent?: number;
  /** Layout mode: 'absolute' for timeline positioning, 'flow' for grid layout */
  layout?: 'absolute' | 'flow';
  /** Height class for flow layout mode (e.g., 'h-16', 'h-18') */
  heightClass?: string;
  /** Compact mode for smaller display in flow layout */
  compact?: boolean;
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
  /** Callback when scrubbing should start (mouse enters this segment) - receives element rect for positioning */
  onScrubbingStart?: (rect: DOMRect) => void;
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
  /** Read-only mode - show empty placeholder instead of generate CTA */
  readOnly?: boolean;
}

export const InlineSegmentVideo: React.FC<InlineSegmentVideoProps> = ({
  slot,
  pairIndex,
  onClick,
  projectAspectRatio,
  isMobile = false,
  leftPercent,
  widthPercent,
  layout = 'absolute',
  heightClass,
  compact = false,
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
  readOnly = false,
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

  // Hook for marking variants as viewed
  const { markAllViewed } = useMarkVariantViewed();

  // Callback to mark all variants for this generation as viewed
  const handleMarkAllVariantsViewed = useCallback(() => {
    if (generationId) {
      markAllViewed(generationId);
    }
  }, [generationId, markAllViewed]);

  // Check if recently created (show NEW for segments created in last 10 minutes)
  const isRecentlyCreated = useMemo(() => {
    if (slot.type !== 'child') return false;
    const createdAt = (slot.child as any).created_at || (slot.child as any).createdAt;
    if (!createdAt) return false;
    const createdTime = new Date(createdAt).getTime();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    return createdTime > tenMinutesAgo;
  }, [slot]);

  // Show NEW badge if: has unviewed variants OR is recently created with no variants yet
  const showNewBadge = badgeData?.hasUnviewedVariants || (isRecentlyCreated && (badgeData?.derivedCount || 0) === 0);
  
  // Calculate preview width and aspect ratio (let height be determined by aspect ratio)
  const previewStyle = useMemo(() => {
    const baseWidth = compact ? 180 : 240;
    if (!projectAspectRatio) return { width: baseWidth, aspectRatio: '16/9' };
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) {
      return { width: baseWidth, aspectRatio: `${w}/${h}` };
    }
    return { width: baseWidth, aspectRatio: '16/9' };
  }, [projectAspectRatio, compact]);

  // Calculate height for positioning (approximate, used for tooltip placement)
  const estimatedPreviewHeight = useMemo(() => {
    const baseWidth = compact ? 180 : 240;
    if (!projectAspectRatio) return Math.round(baseWidth * 9 / 16);
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) return Math.round(baseWidth * h / w);
    return Math.round(baseWidth * 9 / 16);
  }, [projectAspectRatio, compact]);

  // Position style - absolute for timeline, undefined for flow layout
  const positionStyle: React.CSSProperties | undefined = layout === 'absolute' ? {
    position: 'absolute',
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
    top: 0,
    bottom: 0,
  } : undefined;

  // Adjusted position style with gaps (for absolute layout)
  const adjustedPositionStyle: React.CSSProperties | undefined = layout === 'absolute' ? {
    ...positionStyle,
    left: `calc(${leftPercent}% + 2px)`,
    width: `calc(${widthPercent}% - 4px)`,
  } : undefined;

  // Default height class for flow layout
  const flowHeightClass = heightClass || (isMobile ? 'h-12' : (compact ? 'h-16' : 'h-18'));
  
  // Handle mouse events - integrates with external scrubbing system
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setIsHovering(true);

    // Notify parent that scrubbing should start on this segment
    // Pass the element's bounding rect for preview positioning
    const target = e.currentTarget as HTMLElement;
    if (target && onScrubbingStart) {
      onScrubbingStart(target.getBoundingClientRect());
    }

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

  // Container classes for flow layout
  const flowContainerClasses = layout === 'flow' ? cn("w-full", flowHeightClass) : "";

  // Different border/styling for flow layout (matches BatchSegmentVideo's prominent styling)
  const containerBorderClasses = layout === 'flow'
    ? "border-[3px] border-primary ring-2 ring-primary/20 shadow-lg"
    : "border-2 border-primary/30 shadow-md";

  // Rounded corners - flow layout uses rounded-md for compact display
  const roundedClass = layout === 'flow' ? "rounded-md" : "rounded-lg";

  // Placeholder (no video generated yet) state - show CTA to generate or pending indicator
  if (slot.type === 'placeholder') {
    // If a task is pending (Queued/In Progress), show loading state (still clickable to open settings)
    if (isPending) {
      return (
        <button
          className={cn(
            "bg-muted/40 border-2 border-dashed border-primary/40 flex items-center justify-center cursor-pointer transition-all duration-150",
            roundedClass,
            layout === 'flow' && "shadow-sm",
            "hover:bg-muted/60 hover:border-primary/60",
            flowContainerClasses
          )}
          style={adjustedPositionStyle}
          onClick={() => onOpenPairSettings?.(pairIndex)}
        >
          <div className="flex flex-col items-center gap-0.5 text-primary">
            <Loader2 className={cn(layout === 'flow' && compact ? "w-3.5 h-3.5" : "w-4 h-4", "animate-spin")} />
            <span className="text-[10px] font-medium">Pending</span>
          </div>
        </button>
      );
    }

    // In readOnly mode, show empty container instead of generate CTA
    if (readOnly) {
      return (
        <div
          className={cn(
            "border-2 border-dashed",
            roundedClass,
            layout === 'flow'
              ? "bg-muted/30 border-muted-foreground/20"
              : "bg-muted/20 border-border/30",
            flowContainerClasses
          )}
          style={adjustedPositionStyle}
        />
      );
    }

    // Otherwise show generate CTA
    return (
      <button
        className={cn(
          "border-2 border-dashed flex items-center justify-center cursor-pointer transition-all duration-150 group",
          roundedClass,
          layout === 'flow'
            ? "bg-muted/70 border-primary/50 shadow-sm hover:bg-muted hover:border-primary hover:scale-[1.02]"
            : "bg-muted/30 border-border/40 hover:bg-muted/50 hover:border-primary/40",
          flowContainerClasses
        )}
        style={adjustedPositionStyle}
        onClick={() => onOpenPairSettings?.(pairIndex)}
      >
        <div className={cn(
          "flex flex-col items-center transition-colors",
          layout === 'flow'
            ? "gap-0.5 text-foreground group-hover:text-primary"
            : "gap-1 text-muted-foreground group-hover:text-foreground"
        )}>
          <Sparkles className={cn(
            layout === 'flow' && compact ? "w-3.5 h-3.5" : "w-4 h-4",
            layout === 'flow' ? "group-hover:scale-110 transition-transform" : "opacity-60 group-hover:opacity-100"
          )} />
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

  // No output - either still processing (if task pending) or orphaned (source images changed)
  // If isPending is true, show loading state. Otherwise show regenerate CTA.
  if (!hasOutput) {
    if (isPending) {
      return (
        <div
          className={cn(
            "bg-muted/40 border border-dashed border-border/50 flex items-center justify-center",
            roundedClass,
            flowContainerClasses
          )}
          style={adjustedPositionStyle}
        >
          <div className={cn(
            "flex items-center text-muted-foreground",
            layout === 'flow' ? "gap-1.5" : "flex-col gap-2"
          )}>
            <Loader2 className={cn(layout === 'flow' && compact ? "w-3 h-3" : "w-6 h-6", "animate-spin")} />
            <span className={cn(layout === 'flow' && compact ? "text-[9px]" : "text-xs", "font-medium")}>Processing...</span>
          </div>
        </div>
      );
    }

    // No output and no pending task - likely orphaned (source images changed)
    // Show regenerate CTA similar to placeholder state
    return (
      <button
        className={cn(
          "border-2 border-dashed flex items-center justify-center cursor-pointer transition-all duration-150 group",
          roundedClass,
          layout === 'flow'
            ? "bg-amber-500/10 border-amber-500/50 shadow-sm hover:bg-amber-500/20 hover:border-amber-500 hover:scale-[1.02]"
            : "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50",
          flowContainerClasses
        )}
        style={adjustedPositionStyle}
        onClick={() => onOpenPairSettings?.(pairIndex)}
        title="Source images changed - click to regenerate"
      >
        <div className={cn(
          "flex flex-col items-center transition-colors",
          layout === 'flow'
            ? "gap-0.5 text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300"
            : "gap-1 text-amber-600/70 dark:text-amber-400/70 group-hover:text-amber-600 dark:group-hover:text-amber-400"
        )}>
          <Sparkles className={cn(
            layout === 'flow' && compact ? "w-3.5 h-3.5" : "w-4 h-4",
            layout === 'flow' ? "group-hover:scale-110 transition-transform" : "opacity-80 group-hover:opacity-100"
          )} />
          <span className="text-[10px] font-medium">Regenerate</span>
        </div>
      </button>
    );
  }

  // Use scrubbing ref when active, otherwise use local ref
  const containerRefToUse = isScrubbingActive && scrubbingContainerRef ? scrubbingContainerRef : localContainerRef;

  return (
    <>
      <div
        ref={containerRefToUse}
        className={cn(
          "cursor-pointer overflow-hidden bg-muted/20",
          roundedClass,
          "transition-all duration-150 relative",
          containerBorderClasses,
          isHovering && "z-10 border-primary shadow-xl",
          layout === 'flow' && isHovering && "ring-primary/40",
          isScrubbingActive && "ring-2 ring-primary ring-offset-1",
          flowContainerClasses
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
            <ImageOff className={cn(layout === 'flow' && compact ? "w-4 h-4" : "w-8 h-8", "text-muted-foreground")} />
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
            position={layout === 'flow' && compact ? "top-1.5 left-1.5" : "top-2 left-2"}
            onMarkAllViewed={handleMarkAllVariantsViewed}
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
            <div className={cn(
              "rounded-full bg-black/50 flex items-center justify-center",
              layout === 'flow' && compact ? "w-6 h-6" : "w-12 h-12"
            )}>
              <Play
                className={cn(
                  "text-white ml-0.5",
                  layout === 'flow' && compact ? "w-3 h-3" : "w-6 h-6"
                )}
                fill="white"
              />
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
          <div className={cn(
            "absolute bottom-0 left-0 right-0 bg-black/30 pointer-events-none",
            layout === 'flow' && compact ? "h-0.5" : "h-1"
          )}>
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
                    onMarkAllViewed={handleMarkAllVariantsViewed}
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
