/**
 * TrimControlsPanel Component
 * 
 * Side panel with trim controls, similar to EditModePanel in MediaLightbox.
 * Contains the timeline bar, duration info, and save button.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Loader2, Check, Scissors, X, RotateCcw, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { TrimTimelineBar } from './TrimTimelineBar';
import type { TrimControlsPanelProps } from '../types';

export const TrimControlsPanel: React.FC<TrimControlsPanelProps> = ({
  trimState,
  onStartTrimChange,
  onEndTrimChange,
  onResetTrim,
  trimmedDuration,
  hasTrimChanges,
  onSave,
  isSaving,
  saveProgress,
  saveError,
  saveSuccess,
  onClose,
  variant,
  videoUrl,
}) => {
  const isMobile = variant === 'mobile';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Frame preview state
  const [startFrame, setStartFrame] = useState<string | null>(null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  // Handle video metadata loaded
  const handleVideoLoaded = useCallback(() => {
    console.log('[TrimControlsPanel] Video metadata loaded');
    setIsVideoReady(true);
  }, []);

  // Reset video ready state when URL changes
  useEffect(() => {
    setIsVideoReady(false);
    setStartFrame(null);
    setEndFrame(null);
  }, [videoUrl]);

  // Extract a frame at a specific time (sequential - must be called one at a time)
  const extractFrame = useCallback(async (time: number): Promise<string | null> => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Validate time is finite and within video duration
    if (!Number.isFinite(time) || time < 0) {
      console.warn('[TrimControlsPanel] Invalid time for frame extraction:', time);
      return null;
    }

    // Clamp time to video duration
    const clampedTime = Math.min(Math.max(0.001, time), video.duration - 0.01);
    
    if (!Number.isFinite(clampedTime)) {
      console.warn('[TrimControlsPanel] Clamped time is not finite:', clampedTime);
      return null;
    }

    return new Promise((resolve) => {
      const handleSeeked = () => {
        video.removeEventListener('seeked', handleSeeked);
        
        // Set canvas size to match video aspect ratio
        const aspectRatio = video.videoWidth / video.videoHeight;
        if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
          resolve(null);
          return;
        }
        
        canvas.width = 160;
        canvas.height = Math.round(160 / aspectRatio);
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };

      video.addEventListener('seeked', handleSeeked);
      video.currentTime = clampedTime;
    });
  }, []);

  // Throttle refs for live updates while dragging
  const lastStartUpdateRef = useRef<number>(0);
  const lastEndUpdateRef = useRef<number>(0);
  const pendingStartUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const pendingEndUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const prevStartTrimRef = useRef<number>(trimState.startTrim);
  const prevEndTrimRef = useRef<number>(trimState.endTrim);

  // Update START frame when startTrim changes
  useEffect(() => {
    if (!videoUrl || !isVideoReady || trimState.videoDuration === 0) return;
    
    // Skip if startTrim hasn't actually changed
    if (prevStartTrimRef.current === trimState.startTrim && startFrame !== null) return;
    prevStartTrimRef.current = trimState.startTrim;

    const updateStartFrame = async () => {
      const keepStartTime = trimState.startTrim;
      
      if (!Number.isFinite(keepStartTime)) return;
      
      const frame = await extractFrame(keepStartTime);
      setStartFrame(frame);
      lastStartUpdateRef.current = Date.now();
    };

    // Clear any pending update
    if (pendingStartUpdateRef.current) {
      clearTimeout(pendingStartUpdateRef.current);
      pendingStartUpdateRef.current = null;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastStartUpdateRef.current;
    const throttleMs = 60;

    if (timeSinceLastUpdate >= throttleMs) {
      updateStartFrame();
    } else {
      pendingStartUpdateRef.current = setTimeout(updateStartFrame, throttleMs - timeSinceLastUpdate);
    }

    return () => {
      if (pendingStartUpdateRef.current) {
        clearTimeout(pendingStartUpdateRef.current);
        pendingStartUpdateRef.current = null;
      }
    };
  }, [videoUrl, isVideoReady, trimState.startTrim, trimState.videoDuration, extractFrame, startFrame]);

  // Update END frame when endTrim changes
  useEffect(() => {
    if (!videoUrl || !isVideoReady || trimState.videoDuration === 0) return;
    
    // Skip if endTrim hasn't actually changed
    if (prevEndTrimRef.current === trimState.endTrim && endFrame !== null) return;
    prevEndTrimRef.current = trimState.endTrim;

    const updateEndFrame = async () => {
      const keepEndTime = trimState.videoDuration - trimState.endTrim;
      
      if (!Number.isFinite(keepEndTime)) return;
      
      const frame = await extractFrame(Math.max(0.001, keepEndTime - 0.1));
      setEndFrame(frame);
      lastEndUpdateRef.current = Date.now();
    };

    // Clear any pending update
    if (pendingEndUpdateRef.current) {
      clearTimeout(pendingEndUpdateRef.current);
      pendingEndUpdateRef.current = null;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastEndUpdateRef.current;
    const throttleMs = 60;

    if (timeSinceLastUpdate >= throttleMs) {
      updateEndFrame();
    } else {
      pendingEndUpdateRef.current = setTimeout(updateEndFrame, throttleMs - timeSinceLastUpdate);
    }

    return () => {
      if (pendingEndUpdateRef.current) {
        clearTimeout(pendingEndUpdateRef.current);
        pendingEndUpdateRef.current = null;
      }
    };
  }, [videoUrl, isVideoReady, trimState.endTrim, trimState.videoDuration, extractFrame, endFrame]);

  // Format seconds to mm:ss.s
  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '0:00.0';
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  };

  // Responsive styles
  const padding = isMobile ? 'p-4' : 'p-6';
  const spacing = isMobile ? 'space-y-4' : 'space-y-6';
  const headerSize = isMobile ? 'text-lg' : 'text-2xl';
  const labelSize = isMobile ? 'text-xs' : 'text-sm';

  return (
    <div className="w-full">
      {/* Hidden video element for frame extraction */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          preload="auto"
          muted
          playsInline
          className="hidden"
          onLoadedMetadata={handleVideoLoaded}
        />
      )}
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header with close button */}
      <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 z-[80] bg-background">
        <div className="flex items-center gap-2">
          <Scissors className="w-5 h-5 text-primary" />
          <h2 className={cn(headerSize, 'font-light')}>Trim Video</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className={cn(padding, spacing)}>
        {/* Instructions */}
        <p className={cn(labelSize, 'text-muted-foreground')}>
          Drag the handles to trim the beginning or end of the video. 
          The red striped areas will be removed.
        </p>

        {/* Debug info - shows if duration is 0 */}
        {trimState.videoDuration === 0 && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-sm text-yellow-500">
              ⚠️ Video duration not loaded yet. Wait for video to load.
            </p>
          </div>
        )}

        {/* Timeline bar */}
        <TrimTimelineBar
          duration={trimState.videoDuration}
          startTrim={trimState.startTrim}
          endTrim={trimState.endTrim}
          onStartTrimChange={onStartTrimChange}
          onEndTrimChange={onEndTrimChange}
          disabled={isSaving}
        />

        {/* Frame previews */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className={cn(labelSize, 'text-muted-foreground block text-center')}>First frame</span>
            <div className="aspect-video bg-muted/30 rounded-lg overflow-hidden border border-border relative">
              {startFrame ? (
                <img src={startFrame} alt="Start frame" className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {isExtractingFrames ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No frame</span>
                  )}
                </div>
              )}
            </div>
            <span className={cn(labelSize, 'text-primary block text-center font-medium')}>
              {formatTime(trimState.startTrim)}
            </span>
          </div>
          <div className="space-y-2">
            <span className={cn(labelSize, 'text-muted-foreground block text-center')}>Last frame</span>
            <div className="aspect-video bg-muted/30 rounded-lg overflow-hidden border border-border relative">
              {endFrame ? (
                <img src={endFrame} alt="End frame" className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {isExtractingFrames ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No frame</span>
                  )}
                </div>
              )}
            </div>
            <span className={cn(labelSize, 'text-primary block text-center font-medium')}>
              {formatTime(trimState.videoDuration - trimState.endTrim)}
            </span>
          </div>
        </div>

        {/* Reset button */}
        {hasTrimChanges && !isSaving && (
          <Button
            variant="outline"
            size="sm"
            onClick={onResetTrim}
            className="w-full"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to original
          </Button>
        )}

        {/* Error message */}
        {saveError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{saveError}</p>
          </div>
        )}

        {/* Save button */}
        <Button
          onClick={onSave}
          disabled={!hasTrimChanges || !trimState.isValid || isSaving || saveSuccess}
          className={cn(
            'w-full',
            saveSuccess && 'bg-green-600 hover:bg-green-600'
          )}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving... {saveProgress}%
            </>
          ) : saveSuccess ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Saved!
            </>
          ) : (
            <>
              <Scissors className="w-4 h-4 mr-2" />
              Save trimmed video
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default TrimControlsPanel;

