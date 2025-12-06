import React, { useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';

// Type for a portion selection
export interface PortionSelection {
  id: string;
  start: number;  // Start time in seconds
  end: number;    // End time in seconds
  gapFrameCount?: number;  // Per-segment gap frame count (defaults to global setting)
  prompt?: string;  // Per-segment prompt (defaults to global prompt)
}

// Format seconds to MM:SS.ms
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
}

// Component to show a mini thumbnail at a specific video time
function FrameThumbnail({ videoUrl, time }: { videoUrl: string; time: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  
  useEffect(() => {
    // Reset loaded state when videoUrl or time changes
    setLoaded(false);
    loadedRef.current = false;
  }, [videoUrl, time]);
  
  useEffect(() => {
    if (!videoUrl || time < 0) return;
    // Skip if already loaded
    if (loadedRef.current) return;
    
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true; // Important for iOS
    video.src = videoUrl;
    
    const captureFrame = () => {
      if (loadedRef.current) return; // Prevent double capture
      if (video.readyState >= 2 && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          loadedRef.current = true;
          setLoaded(true);
        }
      }
      video.remove();
    };
    
    video.onseeked = captureFrame;
    video.onloadeddata = () => {
      // Seek to time once video data is ready
      video.currentTime = time;
    };
    
    // Fallback timeout - increased for mobile
    const timeout = setTimeout(() => {
      if (!loadedRef.current) {
        captureFrame();
      }
    }, 1000);
    
    return () => {
      clearTimeout(timeout);
      video.onseeked = null;
      video.onloadeddata = null;
      video.remove();
    };
  }, [videoUrl, time]);
  
  return (
    <canvas 
      ref={canvasRef}
      width={48}
      height={27}
      className={cn(
        "rounded border border-white/30 shadow-lg",
        !loaded && "bg-white/10"
      )}
    />
  );
}

export interface MultiPortionTimelineProps {
  duration: number;
  selections: PortionSelection[];
  activeSelectionId: string | null;
  onSelectionChange: (id: string, start: number, end: number) => void;
  onSelectionClick: (id: string | null) => void;
  onRemoveSelection: (id: string) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoUrl: string;
  fps: number | null;
}

// Timeline with multiple portion selections, thumbnails, and time labels
export function MultiPortionTimeline({
  duration,
  selections,
  activeSelectionId,
  onSelectionChange,
  onSelectionClick,
  onRemoveSelection,
  videoRef,
  videoUrl,
  fps,
}: MultiPortionTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: string; handle: 'start' | 'end' } | null>(null);
  
  // Tap-to-move mode: tap a handle to select it, tap track to move it
  const [selectedHandle, setSelectedHandle] = useState<{ id: string; handle: 'start' | 'end' } | null>(null);
  
  // Store video playing state before drag
  const wasPlayingRef = useRef(false);
  
  // Get position from mouse or touch event
  const getClientX = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent): number => {
    if ('touches' in e) {
      return e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX ?? 0;
    }
    return (e as MouseEvent).clientX;
  };
  
  // Start dragging (mouse or touch)
  const startDrag = (e: React.MouseEvent | React.TouchEvent, id: string, handle: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    
    // Pause video and remember state
    if (videoRef.current) {
      wasPlayingRef.current = !videoRef.current.paused;
      videoRef.current.pause();
      
      // Seek to current handle position
      const selection = selections.find(s => s.id === id);
      if (selection) {
        videoRef.current.currentTime = handle === 'start' ? selection.start : selection.end;
      }
    }
    
    setDragging({ id, handle });
    setSelectedHandle({ id, handle }); // Also select for tap-to-move mode
    onSelectionClick(id);
  };
  
  // Handle tap on handle (for tap-to-move mode on mobile)
  const handleHandleTap = (e: React.MouseEvent | React.TouchEvent, id: string, handle: 'start' | 'end') => {
    // If already selected, deselect
    if (selectedHandle?.id === id && selectedHandle?.handle === handle) {
      setSelectedHandle(null);
      return;
    }
    
    // Select this handle
    setSelectedHandle({ id, handle });
    onSelectionClick(id);
    
    // Seek to handle position
    const selection = selections.find(s => s.id === id);
    if (selection && videoRef.current) {
      videoRef.current.currentTime = handle === 'start' ? selection.start : selection.end;
    }
  };
  
  // Handle tap on track to move selected handle
  const handleTrackTap = (e: React.MouseEvent | React.TouchEvent) => {
    if (!selectedHandle || !trackRef.current) {
      onSelectionClick(null);
      return;
    }
    
    const selection = selections.find(s => s.id === selectedHandle.id);
    if (!selection) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = getClientX(e);
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (percent / 100) * duration;
    
    let newTime: number;
    if (selectedHandle.handle === 'start') {
      newTime = Math.min(time, selection.end - 0.1);
      onSelectionChange(selectedHandle.id, newTime, selection.end);
    } else {
      newTime = Math.max(time, selection.start + 0.1);
      onSelectionChange(selectedHandle.id, selection.start, newTime);
    }
    
    // Seek video to show current frame
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    
    // Clear selection after moving
    setSelectedHandle(null);
  };
  
  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging || !trackRef.current) return;
    
    const selection = selections.find(s => s.id === dragging.id);
    if (!selection) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = getClientX(e);
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (percent / 100) * duration;
    
    let newTime: number;
    if (dragging.handle === 'start') {
      newTime = Math.min(time, selection.end - 0.1);
      onSelectionChange(dragging.id, newTime, selection.end);
    } else {
      newTime = Math.max(time, selection.start + 0.1);
      onSelectionChange(dragging.id, selection.start, newTime);
    }
    
    // Seek video to show current frame
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  }, [dragging, duration, selections, onSelectionChange, videoRef]);
  
  const handleEnd = useCallback(() => {
    // Resume playing if it was playing before
    if (wasPlayingRef.current && videoRef.current) {
      videoRef.current.play();
    }
    setDragging(null);
  }, [videoRef]);
  
  useEffect(() => {
    if (dragging) {
      // Mouse events
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      // Touch events
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('touchcancel', handleEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
        window.removeEventListener('touchcancel', handleEnd);
      };
    }
  }, [dragging, handleMove, handleEnd]);
  
  // Colors for different selections
  const selectionColors = [
    'bg-primary',
    'bg-blue-500',
    'bg-green-500',
    'bg-orange-500',
    'bg-purple-500',
  ];
  
  return (
    <div className="relative pt-14 pb-2 select-none">
      {/* Tap-to-move hint */}
      {selectedHandle && (
        <div className="absolute top-0 left-0 right-0 text-center text-xs text-primary animate-pulse">
          Tap on timeline to move {selectedHandle.handle} point
        </div>
      )}
      
      {/* Track */}
      <div 
        ref={trackRef}
        className="relative h-8 md:h-6 bg-white/10 rounded cursor-pointer touch-none select-none"
        onClick={handleTrackTap}
        onTouchEnd={handleTrackTap}
      >
        {/* Render each selection */}
        {selections.map((selection, index) => {
          const startPercent = (selection.start / duration) * 100;
          const endPercent = (selection.end / duration) * 100;
          const isActive = selection.id === activeSelectionId;
          const colorClass = selectionColors[index % selectionColors.length];
          
          return (
            <React.Fragment key={selection.id}>
              {/* Thumbnail and time above start handle */}
              <div
                className="absolute flex flex-col items-center pointer-events-none"
                style={{ 
                  left: `${startPercent}%`, 
                  transform: 'translateX(-50%)',
                  bottom: '100%',
                  marginBottom: '4px'
                }}
              >
                <FrameThumbnail videoUrl={videoUrl} time={selection.start} />
                <div className="flex flex-col items-center mt-0.5">
                  <span className="text-[10px] font-mono text-white/80 whitespace-nowrap">
                    {formatTime(selection.start)}
                  </span>
                  {fps && (
                    <span className="text-[9px] font-mono text-white/50 whitespace-nowrap">
                      f{Math.round(selection.start * fps)}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Thumbnail and time above end handle */}
              <div
                className="absolute flex flex-col items-center pointer-events-none"
                style={{ 
                  left: `${endPercent}%`, 
                  transform: 'translateX(-50%)',
                  bottom: '100%',
                  marginBottom: '4px'
                }}
              >
                <FrameThumbnail videoUrl={videoUrl} time={selection.end} />
                <div className="flex flex-col items-center mt-0.5">
                  <span className="text-[10px] font-mono text-white/80 whitespace-nowrap">
                    {formatTime(selection.end)}
                  </span>
                  {fps && (
                    <span className="text-[9px] font-mono text-white/50 whitespace-nowrap">
                      f{Math.round(selection.end * fps)}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Selected portion highlight */}
              <div 
                className={cn(
                  "absolute top-0 bottom-0 rounded cursor-pointer transition-opacity",
                  isActive ? `${colorClass}/50` : `${colorClass}/30`,
                  !isActive && "hover:opacity-80"
                )}
                style={{ 
                  left: `${startPercent}%`, 
                  width: `${endPercent - startPercent}%` 
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectionClick(selection.id);
                }}
              />
              
              {/* Start handle - larger touch target on mobile */}
              <div
                className={cn(
                  "absolute top-0 bottom-0 w-5 md:w-3 rounded-l cursor-ew-resize flex items-center justify-center transition-all z-10 touch-none",
                  colorClass,
                  isActive ? "opacity-100" : "opacity-70 hover:opacity-100",
                  selectedHandle?.id === selection.id && selectedHandle?.handle === 'start' && "ring-2 ring-white ring-offset-1 ring-offset-black scale-110"
                )}
                style={{ left: `${startPercent}%`, transform: 'translateX(-50%)' }}
                onMouseDown={(e) => startDrag(e, selection.id, 'start')}
                onTouchStart={(e) => startDrag(e, selection.id, 'start')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleHandleTap(e, selection.id, 'start');
                }}
              >
                <div className="w-0.5 h-4 md:h-3 bg-white/50 rounded" />
              </div>
              
              {/* End handle - larger touch target on mobile */}
              <div
                className={cn(
                  "absolute top-0 bottom-0 w-5 md:w-3 rounded-r cursor-ew-resize flex items-center justify-center transition-all z-10 touch-none",
                  colorClass,
                  isActive ? "opacity-100" : "opacity-70 hover:opacity-100",
                  selectedHandle?.id === selection.id && selectedHandle?.handle === 'end' && "ring-2 ring-white ring-offset-1 ring-offset-black scale-110"
                )}
                style={{ left: `${endPercent}%`, transform: 'translateX(-50%)' }}
                onMouseDown={(e) => startDrag(e, selection.id, 'end')}
                onTouchStart={(e) => startDrag(e, selection.id, 'end')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleHandleTap(e, selection.id, 'end');
                }}
              >
                <div className="w-0.5 h-4 md:h-3 bg-white/50 rounded" />
              </div>
            </React.Fragment>
          );
        })}
      </div>
      
      {/* Timeline markers */}
      <div className="flex justify-between text-[10px] text-white/40 mt-1 px-1">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

export default MultiPortionTimeline;

