import React, { useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';

// Type for a portion selection
export interface PortionSelection {
  id: string;
  start: number;  // Start time in seconds
  end: number;    // End time in seconds
  gapFrameCount?: number;  // Per-segment gap frame count (defaults to global setting)
  prompt?: string;  // Per-segment prompt (defaults to global prompt)
  name?: string;  // Optional user-defined name for the segment
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
  const [error, setError] = useState(false);
  const loadedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  useEffect(() => {
    // Reset loaded state when videoUrl or time changes
    setLoaded(false);
    setError(false);
    loadedRef.current = false;
    
    // Cleanup previous video
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.load();
      videoRef.current = null;
    }
  }, [videoUrl, time]);
  
  useEffect(() => {
    if (!videoUrl || time < 0) return;
    // Skip if already loaded
    if (loadedRef.current) return;
    
    const video = document.createElement('video');
    videoRef.current = video;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto'; // Use 'auto' for better mobile support
    video.muted = true;
    video.playsInline = true; // Important for iOS
    video.setAttribute('playsinline', ''); // iOS Safari needs this attribute
    video.setAttribute('webkit-playsinline', ''); // Older iOS Safari
    video.src = videoUrl;
    
    const captureFrame = () => {
      if (loadedRef.current) return; // Prevent double capture
      if (video.readyState >= 2 && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            loadedRef.current = true;
            setLoaded(true);
          } catch (e) {
            console.error('[FrameThumbnail] Failed to draw frame:', e);
            setError(true);
          }
        }
      }
    };
    
    const handleSeeked = () => {
      captureFrame();
    };
    
    const handleLoadedData = () => {
      // Seek to time once video data is ready
      if (video.duration && time <= video.duration) {
        video.currentTime = time;
      } else if (video.duration) {
        // If time is beyond duration, use duration
        video.currentTime = Math.max(0, video.duration - 0.1);
      }
    };
    
    const handleCanPlay = () => {
      // Alternative trigger for mobile browsers
      if (video.currentTime === 0 && time > 0) {
        video.currentTime = Math.min(time, video.duration || time);
      }
    };
    
    const handleError = () => {
      console.error('[FrameThumbnail] Video load error for', videoUrl);
      setError(true);
    };
    
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    // Increased timeout for slower mobile connections
    const timeout = setTimeout(() => {
      if (!loadedRef.current && !error) {
        // Try to capture whatever we have
        captureFrame();
      }
    }, 2000);
    
    // Try to trigger loading
    video.load();
    
    return () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      video.src = '';
      video.load();
    };
  }, [videoUrl, time, error]);
  
  return (
    <canvas 
      ref={canvasRef}
      width={48}
      height={27}
      className={cn(
        "rounded border border-white/30 shadow-lg",
        !loaded && !error && "bg-white/10"
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
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  fps: number | null;
  /** Maximum gap frames allowed (to enforce limits from settings) */
  maxGapFrames?: number;
}

// Color palette for segments
const SEGMENT_COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-purple-500',
];

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
  maxGapFrames,
}: MultiPortionTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: string; handle: 'start' | 'end' } | null>(null);
  
  // Playhead state
  const [currentTime, setCurrentTime] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  
  // Tap-to-move mode: tap a handle to select it, tap track to move it
  const [selectedHandle, setSelectedHandle] = useState<{ id: string; handle: 'start' | 'end' } | null>(null);
  
  // Store video playing state before drag
  const wasPlayingRef = useRef(false);
  
  // Store drag offset for immediate visual feedback (avoids React re-render lag on mobile)
  const dragOffsetRef = useRef<{ id: string; handle: 'start' | 'end'; offsetPx: number } | null>(null);
  // Lightweight state to trigger re-render for transform updates
  const [, setDragTick] = useState(0);
  // Store current drag time for video seeking (avoids closure issues)
  const currentDragTimeRef = useRef<number | null>(null);
  
  // Keep a ref to selections so handleMove doesn't need to depend on it
  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;
  
  // Track video time for playhead
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleTimeUpdate = () => {
      if (!isDraggingPlayhead) {
        setCurrentTime(video.currentTime);
      }
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [videoRef, isDraggingPlayhead]);
  
  // Check if a time is in a regeneration zone
  const isInRegenerationZone = useCallback((time: number): { inZone: boolean; segmentIndex: number } => {
    for (let i = 0; i < selections.length; i++) {
      if (time >= selections[i].start && time <= selections[i].end) {
        return { inZone: true, segmentIndex: i };
      }
    }
    return { inZone: false, segmentIndex: -1 };
  }, [selections]);
  
  // Get frame number from time
  const getFrameNumber = useCallback((time: number): number => {
    return fps ? Math.round(time * fps) : 0;
  }, [fps]);
  
  // Handle scrubber click/drag
  const handleScrubberInteraction = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!scrubberRef.current || !videoRef.current) return;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const clientX = 'touches' in e 
      ? (e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX ?? 0)
      : (e as MouseEvent).clientX;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const time = percent * duration;
    
    setCurrentTime(time);
    videoRef.current.currentTime = time;
  }, [duration, videoRef]);
  
  // Start dragging playhead
  const startPlayheadDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (videoRef.current) {
      wasPlayingRef.current = !videoRef.current.paused;
      videoRef.current.pause();
    }
    
    setIsDraggingPlayhead(true);
    handleScrubberInteraction(e);
  }, [videoRef, handleScrubberInteraction]);
  
  // Handle playhead drag move
  useEffect(() => {
    if (!isDraggingPlayhead) return;
    
    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      handleScrubberInteraction(e);
    };
    
    const handleEnd = () => {
      setIsDraggingPlayhead(false);
      if (wasPlayingRef.current && videoRef.current) {
        videoRef.current.play();
      }
    };
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
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
  }, [isDraggingPlayhead, handleScrubberInteraction, videoRef]);
  
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
    
    // Only enforce min gap (2 frames) - allow exceeding max, will show warning
    const minGapTime = fps ? 2 / fps : 0.1;
    
    let newTime: number;
    if (selectedHandle.handle === 'start') {
      const maxStart = selection.end - minGapTime;
      newTime = Math.max(0, Math.min(time, maxStart));
      onSelectionChange(selectedHandle.id, newTime, selection.end);
    } else {
      const minEnd = selection.start + minGapTime;
      newTime = Math.min(duration, Math.max(time, minEnd));
      onSelectionChange(selectedHandle.id, selection.start, newTime);
    }
    
    // Seek video to show current frame
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    
    // Clear selection after moving
    setSelectedHandle(null);
  };
  
  // Throttle state updates using requestAnimationFrame
  const rafIdRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ id: string; handle: 'start' | 'end'; time: number } | null>(null);
  
  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging || !trackRef.current) return;
    
    e.preventDefault(); // Prevent scrolling on mobile
    
    // Use ref to get current selections (avoids dependency on selections array)
    const selection = selectionsRef.current.find(s => s.id === dragging.id);
    if (!selection) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = getClientX(e);
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (percent / 100) * duration;
    
    // Only enforce min gap (2 frames) - allow exceeding max, will show warning
    const minGapTime = fps ? 2 / fps : 0.1;
    
    let newTime: number;
    if (dragging.handle === 'start') {
      // Start can't go past end - minGap
      const maxStart = selection.end - minGapTime;
      newTime = Math.max(0, Math.min(time, maxStart));
    } else {
      // End can't go before start + minGap
      const minEnd = selection.start + minGapTime;
      newTime = Math.min(duration, Math.max(time, minEnd));
    }
    
    // Calculate drag offset based on new position for accurate visual feedback
    const currentPercent = dragging.handle === 'start' 
      ? (selection.start / duration) * 100 
      : (selection.end / duration) * 100;
    const newPercent = (newTime / duration) * 100;
    const currentPx = (currentPercent / 100) * rect.width;
    const newPx = (newPercent / 100) * rect.width;
    const offsetPx = newPx - currentPx;
    
    // Store offset for immediate visual update via CSS transform
    dragOffsetRef.current = { id: dragging.id, handle: dragging.handle, offsetPx };
    
    // Trigger lightweight re-render to apply transform immediately
    setDragTick(t => t + 1);
    pendingUpdateRef.current = { id: dragging.id, handle: dragging.handle, time: newTime };
    currentDragTimeRef.current = newTime;
    
    // Immediately seek video (before RAF throttle)
    if (videoRef?.current) {
      videoRef.current.currentTime = newTime;
    }
    
    // Throttle actual state updates using RAF (reduces re-renders)
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const update = pendingUpdateRef.current;
        if (update && dragging) {
          const sel = selectionsRef.current.find(s => s.id === update.id);
          if (sel) {
            if (update.handle === 'start') {
              onSelectionChange(update.id, update.time, sel.end);
            } else {
              onSelectionChange(update.id, sel.start, update.time);
            }
          }
        }
        pendingUpdateRef.current = null;
      });
    }
  }, [dragging, duration, fps, onSelectionChange, videoRef]);
  
  const handleEnd = useCallback(() => {
    // Clear any pending RAF
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    
    // Apply final pending update if any
    if (pendingUpdateRef.current && dragging) {
      const update = pendingUpdateRef.current;
      const sel = selectionsRef.current.find(s => s.id === update.id);
      if (sel) {
        if (update.handle === 'start') {
          onSelectionChange(update.id, update.time, sel.end);
        } else {
          onSelectionChange(update.id, sel.start, update.time);
        }
      }
      pendingUpdateRef.current = null;
    }
    
    // Clear drag offset
    dragOffsetRef.current = null;
    
    // Resume playing if it was playing before
    if (wasPlayingRef.current && videoRef.current) {
      videoRef.current.play();
    }
    setDragging(null);
  }, [videoRef, dragging, onSelectionChange]);
  
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
  
  // Combined ref handler for both track operations
  const setTrackRefs = useCallback((el: HTMLDivElement | null) => {
    (trackRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (scrubberRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  }, []);
  
  // Check if any selection exceeds the max gap frames limit
  const exceedsMaxWarning = React.useMemo(() => {
    if (!fps || !maxGapFrames) return null;
    
    for (const selection of selections) {
      const gapTime = selection.end - selection.start;
      const gapFrames = Math.round(gapTime * fps);
      if (gapFrames > maxGapFrames) {
        return { gapFrames, maxGapFrames };
      }
    }
    return null;
  }, [selections, fps, maxGapFrames]);
  
  // Handle click on track - differentiate between seeking and handle selection
  const handleTrackClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // If we're not in handle-select mode, seek to position
    if (!selectedHandle) {
      handleScrubberInteraction(e as React.MouseEvent);
    } else {
      handleTrackTap(e);
    }
  }, [selectedHandle, handleScrubberInteraction, handleTrackTap]);
  
  return (
    <div className="relative pt-16 md:pt-12 pb-2 select-none">
      {/* Track */}
      <div 
        ref={setTrackRefs}
        className="relative h-8 md:h-6 bg-white/10 rounded cursor-pointer touch-none select-none"
        onClick={handleTrackClick}
        onTouchEnd={handleTrackClick}
        onMouseDown={(e) => {
          // Start playhead drag if clicking on empty area (not on a handle)
          const target = e.target as HTMLElement;
          if (!target.closest('[data-handle]')) {
            startPlayheadDrag(e);
          }
        }}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-handle]')) {
            startPlayheadDrag(e);
          }
        }}
      >
        {/* Playhead - vertical line showing current position */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-20"
          style={{ 
            left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {/* Playhead top handle */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow" />
        </div>
        
        {/* Render each selection */}
        {selections.map((selection, index) => {
          // Calculate base percentages
          let startPercent = (selection.start / duration) * 100;
          let endPercent = (selection.end / duration) * 100;
          
          // Apply drag offset for immediate visual feedback
          if (dragOffsetRef.current?.id === selection.id && trackRef.current) {
            const rect = trackRef.current.getBoundingClientRect();
            const trackWidth = rect.width;
            const offsetPercent = (dragOffsetRef.current.offsetPx / trackWidth) * 100;
            
            if (dragOffsetRef.current.handle === 'start') {
              startPercent = Math.max(0, Math.min(100, startPercent + offsetPercent));
              // Ensure start doesn't go past end
              startPercent = Math.min(startPercent, endPercent - 0.1);
            } else {
              endPercent = Math.max(0, Math.min(100, endPercent + offsetPercent));
              // Ensure end doesn't go before start
              endPercent = Math.max(endPercent, startPercent + 0.1);
            }
          }
          
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
              
              {/* Selected portion highlight - use colorClass with opacity instead of /50 syntax */}
              <div 
                className={cn(
                  "absolute top-0 bottom-0 rounded cursor-pointer",
                  colorClass,
                  isActive ? "opacity-50" : "opacity-30",
                  !isActive && "hover:opacity-50",
                  // Remove transition during drag for instant feedback
                  dragOffsetRef.current?.id !== selection.id ? "transition-opacity" : ""
                )}
                style={{ 
                  left: `${startPercent}%`, 
                  width: `${endPercent - startPercent}%`,
                  // Remove transition during drag
                  transition: dragOffsetRef.current?.id === selection.id ? 'none' : undefined
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectionClick(selection.id);
                }}
              />
              
              {/* Start handle - larger touch target on mobile, prevent text selection on iPad */}
              <div
                data-handle="start"
                className={cn(
                  "absolute top-0 bottom-0 w-5 md:w-3 rounded-l cursor-ew-resize flex items-center justify-center z-10 touch-none select-none",
                  colorClass,
                  isActive ? "opacity-100" : "opacity-70 hover:opacity-100",
                  selectedHandle?.id === selection.id && selectedHandle?.handle === 'start' && "ring-2 ring-white ring-offset-1 ring-offset-black scale-110",
                  // Remove transition during drag for instant feedback
                  dragging?.id !== selection.id || dragging?.handle !== 'start' ? "transition-all" : ""
                )}
                style={{ 
                  left: `${startPercent}%`, 
                  transform: dragOffsetRef.current?.id === selection.id && dragOffsetRef.current?.handle === 'start'
                    ? `translateX(calc(-50% + ${dragOffsetRef.current.offsetPx}px))`
                    : 'translateX(-50%)',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                }}
                onMouseDown={(e) => startDrag(e, selection.id, 'start')}
                onTouchStart={(e) => {
                  e.preventDefault(); // Prevent text selection on iPad
                  startDrag(e, selection.id, 'start');
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleHandleTap(e, selection.id, 'start');
                }}
              >
                <div className="w-0.5 h-4 md:h-3 bg-white/50 rounded pointer-events-none" />
              </div>
              
              {/* End handle - larger touch target on mobile, prevent text selection on iPad */}
              <div
                data-handle="end"
                className={cn(
                  "absolute top-0 bottom-0 w-5 md:w-3 rounded-r cursor-ew-resize flex items-center justify-center z-10 touch-none select-none",
                  colorClass,
                  isActive ? "opacity-100" : "opacity-70 hover:opacity-100",
                  selectedHandle?.id === selection.id && selectedHandle?.handle === 'end' && "ring-2 ring-white ring-offset-1 ring-offset-black scale-110",
                  // Remove transition during drag for instant feedback
                  dragging?.id !== selection.id || dragging?.handle !== 'end' ? "transition-all" : ""
                )}
                style={{ 
                  left: `${endPercent}%`, 
                  transform: dragOffsetRef.current?.id === selection.id && dragOffsetRef.current?.handle === 'end'
                    ? `translateX(calc(-50% + ${dragOffsetRef.current.offsetPx}px))`
                    : 'translateX(-50%)',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                }}
                onMouseDown={(e) => startDrag(e, selection.id, 'end')}
                onTouchStart={(e) => {
                  e.preventDefault(); // Prevent text selection on iPad
                  startDrag(e, selection.id, 'end');
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleHandleTap(e, selection.id, 'end');
                }}
              >
                <div className="w-0.5 h-4 md:h-3 bg-white/50 rounded pointer-events-none" />
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
      
      {/* Warning when selection exceeds max frames */}
      {exceedsMaxWarning && (
        <div className="mt-2 px-2 py-1.5 bg-amber-500/20 border border-amber-500/40 rounded text-amber-200 text-xs text-center">
          You'll only be able to generate max {exceedsMaxWarning.maxGapFrames} frames in this gap
        </div>
      )}
    </div>
  );
}

export default MultiPortionTimeline;

