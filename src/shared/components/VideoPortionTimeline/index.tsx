import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
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
  
  useEffect(() => {
    if (!videoUrl || time < 0) return;
    
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.src = videoUrl;
    
    const captureFrame = () => {
      if (video.readyState >= 2 && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setLoaded(true);
        }
      }
      video.remove();
    };
    
    video.onseeked = captureFrame;
    video.currentTime = time;
    
    // Fallback timeout
    const timeout = setTimeout(() => {
      if (!loaded) {
        captureFrame();
      }
    }, 500);
    
    return () => {
      clearTimeout(timeout);
      video.onseeked = null;
      video.remove();
    };
  }, [videoUrl, time, loaded]);
  
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
  
  // Store video playing state before drag
  const wasPlayingRef = useRef(false);
  
  const handleMouseDown = (e: React.MouseEvent, id: string, handle: 'start' | 'end') => {
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
    onSelectionClick(id);
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !trackRef.current) return;
    
    const selection = selections.find(s => s.id === dragging.id);
    if (!selection) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
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
  
  const handleMouseUp = useCallback(() => {
    // Resume playing if it was playing before
    if (wasPlayingRef.current && videoRef.current) {
      videoRef.current.play();
    }
    setDragging(null);
  }, [videoRef]);
  
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);
  
  // Colors for different selections
  const selectionColors = [
    'bg-primary',
    'bg-blue-500',
    'bg-green-500',
    'bg-orange-500',
    'bg-purple-500',
  ];
  
  return (
    <div className="relative pt-12 pb-2">
      {/* Track */}
      <div 
        ref={trackRef}
        className="relative h-6 bg-white/10 rounded cursor-pointer"
        onClick={() => onSelectionClick(null)}
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
              >
                {/* Delete button for non-first selections */}
                {selections.length > 1 && isActive && (
                  <button
                    className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSelection(selection.id);
                    }}
                  >
                    <Trash2 className="w-2.5 h-2.5 text-white" />
                  </button>
                )}
              </div>
              
              {/* Start handle */}
              <div
                className={cn(
                  "absolute top-0 bottom-0 w-3 rounded-l cursor-ew-resize flex items-center justify-center transition-colors z-10",
                  colorClass,
                  isActive ? "opacity-100" : "opacity-70 hover:opacity-100"
                )}
                style={{ left: `${startPercent}%`, transform: 'translateX(-50%)' }}
                onMouseDown={(e) => handleMouseDown(e, selection.id, 'start')}
              >
                <div className="w-0.5 h-3 bg-white/50 rounded" />
              </div>
              
              {/* End handle */}
              <div
                className={cn(
                  "absolute top-0 bottom-0 w-3 rounded-r cursor-ew-resize flex items-center justify-center transition-colors z-10",
                  colorClass,
                  isActive ? "opacity-100" : "opacity-70 hover:opacity-100"
                )}
                style={{ left: `${endPercent}%`, transform: 'translateX(-50%)' }}
                onMouseDown={(e) => handleMouseDown(e, selection.id, 'end')}
              >
                <div className="w-0.5 h-3 bg-white/50 rounded" />
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

