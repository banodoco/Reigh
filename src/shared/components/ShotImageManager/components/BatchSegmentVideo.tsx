/**
 * BatchSegmentVideo - Shows video output above a pair in batch view
 * 
 * Similar to InlineSegmentVideo but designed for CSS grid layout.
 * Displays video thumbnail above the pair indicator, click opens lightbox.
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Play, Loader2, ImageOff, Sparkles } from 'lucide-react';
import { SegmentSlot } from '@/tools/travel-between-images/hooks/useSegmentOutputsForShot';
import { getDisplayUrl } from '@/shared/lib/utils';
import { useVariantBadges } from '@/shared/hooks/useVariantBadges';
import { VariantBadge } from '@/shared/components/VariantBadge';
import { cn } from '@/shared/lib/utils';

interface BatchSegmentVideoProps {
  slot: SegmentSlot;
  pairIndex: number;
  onClick: () => void;
  onOpenPairSettings?: (pairIndex: number) => void;
  projectAspectRatio?: string;
  isMobile?: boolean;
  /** Compact mode for smaller display */
  compact?: boolean;
}

export const BatchSegmentVideo: React.FC<BatchSegmentVideoProps> = ({
  slot,
  pairIndex,
  onClick,
  onOpenPairSettings,
  projectAspectRatio,
  isMobile = false,
  compact = false,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Frame rate for frame number calculation
  const FPS = 24;
  
  // Get variant badge data for child slots
  const generationId = slot.type === 'child' ? slot.child.id : null;
  const { getBadgeData } = useVariantBadges(
    generationId ? [generationId] : [],
    !!generationId
  );
  const badgeData = generationId ? getBadgeData(generationId) : null;
  
  // Check if recently created (show NEW for segments created in last 10 minutes)
  const isRecentlyCreated = useMemo(() => {
    if (slot.type !== 'child') return false;
    const createdAt = slot.child.created_at || slot.child.createdAt;
    if (!createdAt) return false;
    const createdTime = new Date(createdAt).getTime();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    return createdTime > tenMinutesAgo;
  }, [slot]);
  
  // Show NEW badge if: has unviewed variants OR is recently created with no variants yet
  const showNewBadge = badgeData?.hasUnviewedVariants || (isRecentlyCreated && (badgeData?.derivedCount || 0) === 0);
  
  // Calculate preview dimensions
  const previewStyle = useMemo(() => {
    const baseWidth = compact ? 180 : 240;
    if (!projectAspectRatio) return { width: baseWidth, aspectRatio: '16/9' };
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) {
      return { width: baseWidth, aspectRatio: `${w}/${h}` };
    }
    return { width: baseWidth, aspectRatio: '16/9' };
  }, [projectAspectRatio, compact]);
  
  // Calculate height for tooltip placement
  const estimatedPreviewHeight = useMemo(() => {
    const baseWidth = compact ? 180 : 240;
    if (!projectAspectRatio) return Math.round(baseWidth * 9 / 16);
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) return Math.round(baseWidth * h / w);
    return Math.round(baseWidth * 9 / 16);
  }, [projectAspectRatio, compact]);
  
  // Handle mouse events
  const handleMouseEnter = useCallback(() => {
    if (isMobile) return;
    setIsHovering(true);
  }, [isMobile]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setHoverPosition({ x: e.clientX, y: e.clientY });
  }, [isMobile]);
  
  const handleMouseLeave = useCallback(() => {
    if (isMobile) return;
    setIsHovering(false);
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isMobile]);
  
  // Start video and track time when hovering
  useEffect(() => {
    const video = videoRef.current;
    if (!isHovering || !video) return;
    
    if (slot.type === 'child' && slot.child.location) {
      video.play().catch(() => {});
    }
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };
    
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
  
  // Calculate current frame and progress
  const currentFrame = Math.floor(currentTime * FPS);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  // Thumbnail dimensions - consistent sizing for visibility
  const thumbnailHeight = isMobile ? 'h-12' : (compact ? 'h-16' : 'h-18');

  // Placeholder state - show CTA to generate
  if (slot.type === 'placeholder') {
    return (
      <button
        className={cn(
          "w-full bg-muted/70 rounded-md border-2 border-dashed border-primary/50",
          "flex items-center justify-center cursor-pointer shadow-sm",
          "hover:bg-muted hover:border-primary hover:scale-[1.02] transition-all duration-150 group",
          thumbnailHeight
        )}
        onClick={() => onOpenPairSettings?.(pairIndex)}
      >
        <div className="flex items-center gap-1.5 text-foreground group-hover:text-primary transition-colors">
          <Sparkles className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
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
        className={cn(
          "w-full bg-muted/40 rounded border border-dashed border-border/50",
          "flex items-center justify-center",
          thumbnailHeight
        )}
      >
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-[9px] font-medium">Processing...</span>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "w-full cursor-pointer overflow-hidden rounded-md border-[3px] border-primary",
          "shadow-lg bg-background transition-all duration-150 relative ring-2 ring-primary/20",
          isHovering && "z-10 border-primary shadow-xl ring-primary/40",
          thumbnailHeight
        )}
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
            <ImageOff className="w-4 h-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        )}
        
        {/* Variant badge - top left */}
        {(badgeData || showNewBadge) && (
          <VariantBadge
            derivedCount={badgeData?.derivedCount || 0}
            unviewedVariantCount={badgeData?.unviewedVariantCount || 0}
            hasUnviewedVariants={showNewBadge}
            variant="overlay"
            size="lg"
            position="top-1.5 left-1.5"
          />
        )}
        
        {/* Play icon overlay */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center",
          "transition-opacity duration-150",
          isHovering ? "opacity-0" : "opacity-100"
        )}>
          <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-3 h-3 text-white ml-0.5" fill="white" />
          </div>
        </div>
        
        {/* Hover highlight border */}
        {isHovering && (
          <div className="absolute inset-0 ring-2 ring-primary ring-inset pointer-events-none" />
        )}
        
        {/* Progress bar when hovering */}
        {isHovering && duration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/30 pointer-events-none">
            <div 
              className="h-full bg-primary transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
      
      {/* Floating preview - portal to body */}
      {isHovering && !isMobile && videoUrl && createPortal(
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
            {/* Video preview */}
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
                <span className="text-xs text-muted-foreground tabular-nums">
                  Frame {currentFrame}
                </span>
                {(badgeData || showNewBadge) && (
                  <VariantBadge
                    derivedCount={badgeData?.derivedCount || 0}
                    unviewedVariantCount={badgeData?.unviewedVariantCount || 0}
                    hasUnviewedVariants={showNewBadge}
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

export default BatchSegmentVideo;

