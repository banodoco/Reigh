/**
 * TrimTimelineBar Component
 * 
 * Visual timeline bar with draggable handles for setting start/end trim points.
 * Shows the "keep" region highlighted in the middle.
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import type { TrimTimelineBarProps } from '../types';

export const TrimTimelineBar: React.FC<TrimTimelineBarProps> = ({
  duration,
  startTrim,
  endTrim,
  onStartTrimChange,
  onEndTrimChange,
  currentTime,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  // Calculate percentages for positioning
  const startPercent = duration > 0 ? (startTrim / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTrim / duration) * 100 : 0;
  const keepPercent = 100 - startPercent - endPercent;
  const currentTimePercent = duration > 0 && currentTime !== undefined 
    ? (currentTime / duration) * 100 
    : null;

  // Convert client X position to time in seconds
  const clientXToTime = useCallback(
    (clientX: number): number => {
      if (!containerRef.current || duration <= 0) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      return percent * duration;
    },
    [duration]
  );

  // Handle pointer down on handles
  const handlePointerDown = useCallback(
    (type: 'start' | 'end') => (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(type);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [disabled]
  );

  // Handle pointer move
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || disabled) return;
      e.preventDefault();

      const time = clientXToTime(e.clientX);

      if (isDragging === 'start') {
        // Start handle: time is the new startTrim value
        onStartTrimChange(time);
      } else if (isDragging === 'end') {
        // End handle: calculate endTrim from the right side
        const newEndTrim = duration - time;
        onEndTrimChange(newEndTrim);
      }
    },
    [isDragging, disabled, clientXToTime, duration, onStartTrimChange, onEndTrimChange]
  );

  // Handle pointer up
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // Ignore
        }
        setIsDragging(null);
      }
    },
    [isDragging]
  );

  // Format time as mm:ss.s
  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '0:00.0';
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  };

  return (
    <div className="w-full space-y-2">
      {/* Time labels */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Timeline bar */}
      <div
        ref={containerRef}
        className={cn(
          'relative h-12 rounded-lg overflow-hidden select-none',
          disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
        )}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Background - full bar */}
        <div className="absolute inset-0 bg-muted/50 rounded-lg" />

        {/* Cut region - start (left side, will be removed) */}
        {startPercent > 0 && (
          <div
            className="absolute top-0 bottom-0 left-0 bg-red-500/30 border-r-2 border-red-500"
            style={{ width: `${startPercent}%` }}
          >
            {/* Striped pattern to indicate removal */}
            <div 
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.2) 4px, rgba(0,0,0,0.2) 8px)'
              }}
            />
          </div>
        )}

        {/* Keep region (middle) */}
        <div
          className="absolute top-0 bottom-0 bg-primary/30 border-x-0"
          style={{
            left: `${startPercent}%`,
            width: `${keepPercent}%`,
          }}
        />

        {/* Cut region - end (right side, will be removed) */}
        {endPercent > 0 && (
          <div
            className="absolute top-0 bottom-0 right-0 bg-red-500/30 border-l-2 border-red-500"
            style={{ width: `${endPercent}%` }}
          >
            {/* Striped pattern to indicate removal */}
            <div 
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(0,0,0,0.2) 4px, rgba(0,0,0,0.2) 8px)'
              }}
            />
          </div>
        )}

        {/* Start handle - wider touch target (40px) for touch devices, prevent text selection on iPad */}
        <div
          className={cn(
            'absolute top-0 bottom-0 w-10 cursor-ew-resize z-10 flex items-center justify-center touch-none select-none',
            'hover:bg-primary/20 transition-colors',
            isDragging === 'start' && 'bg-primary/30'
          )}
          style={{ 
            left: `calc(${startPercent}% - 20px)`,
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
          }}
          onPointerDown={handlePointerDown('start')}
        >
          <div className="w-1 h-8 bg-primary rounded-full shadow-md pointer-events-none" />
        </div>

        {/* End handle - wider touch target (40px) for touch devices, prevent text selection on iPad */}
        <div
          className={cn(
            'absolute top-0 bottom-0 w-10 cursor-ew-resize z-10 flex items-center justify-center touch-none select-none',
            'hover:bg-primary/20 transition-colors',
            isDragging === 'end' && 'bg-primary/30'
          )}
          style={{ 
            right: `calc(${endPercent}% - 20px)`,
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
          }}
          onPointerDown={handlePointerDown('end')}
        >
          <div className="w-1 h-8 bg-primary rounded-full shadow-md pointer-events-none" />
        </div>

        {/* Current time indicator */}
        {currentTimePercent !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-20 pointer-events-none"
            style={{ left: `${currentTimePercent}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-yellow-400 rounded-full" />
          </div>
        )}
      </div>

      {/* Trim info */}
      <div className="flex justify-between text-xs">
        <div className="text-red-400">
          Cut: {formatTime(startTrim)}
        </div>
        <div className="text-primary font-medium">
          Keep: {formatTime(duration - startTrim - endTrim)}
        </div>
        <div className="text-red-400">
          Cut: {formatTime(endTrim)}
        </div>
      </div>
    </div>
  );
};

export default TrimTimelineBar;

