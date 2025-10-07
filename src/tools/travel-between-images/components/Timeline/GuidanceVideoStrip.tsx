import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VideoMetadata } from '@/shared/lib/videoUploader';
import { TIMELINE_HORIZONTAL_PADDING } from './constants';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Slider } from '@/shared/components/ui/slider';
import { X } from 'lucide-react';

interface GuidanceVideoStripProps {
  videoUrl: string;
  videoMetadata: VideoMetadata;
  treatment: 'adjust' | 'clip';
  motionStrength: number;
  onTreatmentChange: (treatment: 'adjust' | 'clip') => void;
  onMotionStrengthChange: (strength: number) => void;
  onRemove: () => void;
  // Timeline coordinate system
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  // Timeline dimensions
  timelineFrameCount: number;
  frameSpacing: number;
}

/**
 * Calculate which video frame to display based on cursor position and treatment mode
 */
const calculateAdjustModeFrame = (
  cursorPixelX: number,
  containerWidth: number,
  fullMin: number,
  fullMax: number,
  videoMetadata: VideoMetadata
): number => {
  // 1. Calculate cursor position in timeline coordinate space
  const paddingOffset = TIMELINE_HORIZONTAL_PADDING;
  const effectiveWidth = containerWidth - (paddingOffset * 2);
  const normalizedX = Math.max(0, Math.min(1, (cursorPixelX - paddingOffset) / effectiveWidth));
  
  // 2. Map normalized position to video frame
  const videoFrame = Math.floor(normalizedX * videoMetadata.total_frames);
  
  // 3. Clamp to valid range
  return Math.max(0, Math.min(videoFrame, videoMetadata.total_frames - 1));
};

const calculateClipModeFrame = (
  cursorPixelX: number,
  containerWidth: number,
  fullMin: number,
  fullMax: number,
  videoMetadata: VideoMetadata
): number => {
  // Direct 1:1 mapping - timeline frame = video frame
  const paddingOffset = TIMELINE_HORIZONTAL_PADDING;
  const effectiveWidth = containerWidth - (paddingOffset * 2);
  const normalizedX = Math.max(0, Math.min(1, (cursorPixelX - paddingOffset) / effectiveWidth));
  const timelineFrame = fullMin + (normalizedX * (fullMax - fullMin));
  
  // Direct mapping (assuming timeline and video have same frame rate)
  const videoFrame = Math.floor(timelineFrame);
  
  // May be out of bounds - return clamped value
  if (videoFrame < 0) return 0;
  if (videoFrame >= videoMetadata.total_frames) return videoMetadata.total_frames - 1;
  
  return videoFrame;
};

export const GuidanceVideoStrip: React.FC<GuidanceVideoStripProps> = ({
  videoUrl,
  videoMetadata,
  treatment,
  motionStrength,
  onTreatmentChange,
  onMotionStrengthChange,
  onRemove,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  zoomLevel,
  timelineFrameCount,
  frameSpacing
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripContainerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentTimelineFrame, setCurrentTimelineFrame] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [frameImages, setFrameImages] = useState<string[]>([]);
  const [displayFrameImages, setDisplayFrameImages] = useState<string[]>([]); // What's actually shown
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const seekingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const lastDrawnFrameRef = useRef<number>(-1);
  const lastSeekTimeRef = useRef<number>(0);
  const lastBlankCheckRef = useRef<number>(0);
  const SEEK_THROTTLE_MS = 30; // Minimum time between seeks (reduced for responsiveness)
  const BLANK_CHECK_THROTTLE_MS = 200; // Minimum time between blank checks to avoid infinite resets
  
  // Calculate timeline duration and frames
  const ASSUMED_TIMELINE_FPS = 24;
  const timelineDuration = (fullMax - fullMin) / ASSUMED_TIMELINE_FPS;
  const timelineFrames = fullMax - fullMin + 1;
  const totalVideoFrames = videoMetadata?.total_frames || 0;
  
  // Calculate video coverage for clip mode
  const videoCoversFrames = treatment === 'clip' ? Math.min(totalVideoFrames, timelineFrames) : timelineFrames;
  const videoCoverageRatio = timelineFrames > 0 ? videoCoversFrames / timelineFrames : 1;
  
  // Calculate playback speed for adjust mode
  const playbackSpeed = treatment === 'adjust' 
    ? videoMetadata.duration_seconds / timelineDuration 
    : 1.0;
  
  // Calculate adjust mode description (stretch/compress)
  const adjustModeDescription = (() => {
    if (totalVideoFrames === 0 || timelineFrames === 0) return '';
    
    if (totalVideoFrames > timelineFrames) {
      const framesToDrop = totalVideoFrames - timelineFrames;
      return `Your input video has ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} so we'll drop ${framesToDrop} frame${framesToDrop === 1 ? '' : 's'} to compress your guide video to the ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} your input images cover.`;
    } else if (totalVideoFrames < timelineFrames) {
      const framesToDuplicate = timelineFrames - totalVideoFrames;
      return `Your input video has ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} so we'll duplicate ${framesToDuplicate} frame${framesToDuplicate === 1 ? '' : 's'} to stretch your guide video to the ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} your input images cover.`;
    } else {
      return `Perfect! Your input video has ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'}, matching your timeline exactly.`;
    }
  })();
  
  // Calculate clip mode description (as-is)
  const clipModeDescription = (() => {
    if (totalVideoFrames === 0 || timelineFrames === 0) return '';
    
    if (totalVideoFrames > timelineFrames) {
      const unusedFrames = totalVideoFrames - timelineFrames;
      return `Your video will guide all ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} of your timeline. The last ${unusedFrames} frame${unusedFrames === 1 ? '' : 's'} of your video (frame${unusedFrames === 1 ? '' : 's'} ${timelineFrames + 1}-${totalVideoFrames}) will be ignored.`;
    } else if (totalVideoFrames < timelineFrames) {
      const uncoveredFrames = timelineFrames - totalVideoFrames;
      return `Your video will guide the first ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} of your timeline. The last ${uncoveredFrames} frame${uncoveredFrames === 1 ? '' : 's'} (frame${uncoveredFrames === 1 ? '' : 's'} ${totalVideoFrames + 1}-${timelineFrames}) won't have video guidance.`;
    } else {
      return `Perfect! Your video length matches your timeline exactly (${timelineFrames} frame${timelineFrames === 1 ? '' : 's'}).`;
    }
  })();

  // Extract frames from video when it loads or treatment changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const extractFrames = async () => {
      console.log('[GuidanceVideoStrip] Extracting frames for treatment:', treatment);
      setIsExtractingFrames(true);
      // Don't set isVideoReady to false - keep old frames visible during re-extraction
      
      // Wait for video to be ready
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const handleCanPlay = () => {
            video.removeEventListener('canplay', handleCanPlay);
            resolve();
          };
          video.addEventListener('canplay', handleCanPlay);
          
          // Timeout after 3s
          setTimeout(() => {
            video.removeEventListener('canplay', handleCanPlay);
            resolve();
          }, 3000);
        });
      }
      
      try {
        // Extract frames based on treatment mode
        // In adjust mode: video is stretched/compressed to fit timeline
        // In clip mode: video plays as-is, so extract totalVideoFrames thumbnails (all video frames)
        
        // DYNAMIC: Calculate ideal number of thumbnails based on container width
        // Target ~50px per thumbnail for comfortable viewing
        const targetThumbnailWidth = 50;
        const effectiveWidth = containerWidth - (TIMELINE_HORIZONTAL_PADDING * 2);
        const idealThumbnailCount = Math.floor(effectiveWidth / targetThumbnailWidth);
        
        // Clamp between 20 and 100 thumbnails for performance and visual quality
        const maxThumbnails = Math.max(20, Math.min(idealThumbnailCount, 100));
        
        const numFrames = treatment === 'adjust' 
          ? Math.min(timelineFrames, maxThumbnails)
          : Math.min(totalVideoFrames, maxThumbnails);
        
        const extractedFrames: string[] = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) {
          console.error('[GuidanceVideoStrip] Failed to get canvas context');
          setIsExtractingFrames(false);
          return;
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Calculate which frames to extract based on treatment mode
        const timelineFrameCount = fullMax - fullMin;
        
        for (let i = 0; i < numFrames; i++) {
          let frameIndex: number;
          
          if (treatment === 'adjust') {
            // Adjust mode: show entire video stretched/compressed to fit timeline
            frameIndex = Math.floor((i / (numFrames - 1)) * (videoMetadata.total_frames - 1));
          } else {
            // Clip mode: show only frames within timeline range
            const timelinePosition = (i / (numFrames - 1)) * timelineFrameCount;
            frameIndex = Math.floor(Math.min(timelinePosition, videoMetadata.total_frames - 1));
          }
          
          const timeInSeconds = frameIndex / videoMetadata.frame_rate;
          
          // Seek to frame
          video.currentTime = timeInSeconds;
          
          // Wait for seek to complete
          await new Promise<void>((resolve) => {
            const handleSeeked = () => {
              video.removeEventListener('seeked', handleSeeked);
              resolve();
            };
            video.addEventListener('seeked', handleSeeked);
            
            // Timeout after 1s
            setTimeout(() => {
              video.removeEventListener('seeked', handleSeeked);
              resolve();
            }, 1000);
          });
          
          // Draw frame to canvas and convert to data URL
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          extractedFrames.push(dataUrl);
          
          console.log(`[GuidanceVideoStrip] Extracted frame ${i + 1}/${numFrames} (frame ${frameIndex}) [${treatment} mode]`);
        }
        
        // Only update if we successfully extracted frames
        if (extractedFrames.length > 0) {
          setFrameImages(extractedFrames);
          setDisplayFrameImages(extractedFrames); // Update display with new frames
          setIsVideoReady(true);
        }
        setIsExtractingFrames(false);
        console.log('[GuidanceVideoStrip] Frame extraction complete for', treatment, 'mode');
      } catch (error) {
        console.error('[GuidanceVideoStrip] Error extracting frames:', error);
        // Keep existing frames on error, don't clear them
        setIsExtractingFrames(false);
      }
    };

    const handleLoadedMetadata = () => {
      console.log('[GuidanceVideoStrip] Video metadata loaded');
      extractFrames();
    };

    const handleError = (e: Event) => {
      console.error('[GuidanceVideoStrip] Video load error:', e);
      setIsVideoReady(false);
      setIsExtractingFrames(false);
    };

    if (video.readyState >= 2) {
      // Video already loaded, extract frames immediately
      extractFrames();
    } else {
      // Wait for video to load
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('error', handleError);
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [videoUrl, videoMetadata, containerWidth, treatment, fullMin, fullMax]);
  
  const isCanvasBlank = useCallback((canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width === 0 || canvas.height === 0) return true;
    
    // Sample pixels to see if canvas is completely blank (all transparent or all same color)
    try {
      const imageData = ctx.getImageData(0, 0, Math.min(20, canvas.width), Math.min(20, canvas.height));
      const pixels = imageData.data;
      
      let transparentCount = 0;
      let totalPixels = 0;
      
      // Count transparent pixels
      for (let i = 0; i < pixels.length; i += 4) {
        const a = pixels[i + 3];
        totalPixels++;
        if (a === 0) {
          transparentCount++;
        }
      }
      
      // If more than 95% of pixels are transparent, consider it blank
      const transparentRatio = transparentCount / totalPixels;
      const isBlank = transparentRatio > 0.95;
      
      if (isBlank) {
        console.log('[GuidanceVideoStrip] Canvas detected as blank:', {
          transparentPixels: transparentCount,
          totalPixels,
          ratio: transparentRatio.toFixed(2)
        });
      }
      
      return isBlank;
    } catch (error) {
      console.error('[GuidanceVideoStrip] Error checking canvas blank:', error);
      return true;
    }
  }, []);

  const drawVideoFrame = useCallback((video: HTMLVideoElement, frame: number, forceRetry: boolean = false) => {
    if (!previewCanvasRef.current) {
      console.warn('[GuidanceVideoStrip] No canvas ref for frame', frame);
      return false;
    }
    
    const previewCanvas = previewCanvasRef.current;
    const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
    
    if (!previewCtx) {
      console.warn('[GuidanceVideoStrip] No canvas context for frame', frame);
      return false;
    }
    
    if (video.readyState < 2) {
      console.warn('[GuidanceVideoStrip] Video not ready to draw frame', frame, 'readyState:', video.readyState);
      return false;
    }
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('[GuidanceVideoStrip] Video has no dimensions for frame', frame);
      return false;
    }
    
    try {
      // Set canvas size to match video (only if changed)
      if (previewCanvas.width !== video.videoWidth || previewCanvas.height !== video.videoHeight) {
        previewCanvas.width = video.videoWidth;
        previewCanvas.height = video.videoHeight;
        console.log('[GuidanceVideoStrip] Set canvas size:', video.videoWidth, 'x', video.videoHeight);
      }
      
      // Clear and draw the current frame
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(video, 0, 0);
      
      // Verify the draw succeeded (only check if not forcing retry to avoid infinite loops)
      if (!forceRetry) {
        const blank = isCanvasBlank(previewCanvas);
        if (blank) {
          console.warn('[GuidanceVideoStrip] Canvas appears blank after draw for frame', frame);
          // Reset seeking state to allow retry
          seekingRef.current = false;
          return false;
        }
      }
      
      lastDrawnFrameRef.current = frame;
      console.log('[GuidanceVideoStrip] Successfully drew frame', frame);
      return true;
    } catch (error) {
      console.error('[GuidanceVideoStrip] Error drawing frame', frame, ':', error);
      // On error, reset seeking state to allow recovery
      seekingRef.current = false;
      return false;
    }
  }, [isCanvasBlank]);

  const ensureVideoReady = useCallback(async (video: HTMLVideoElement): Promise<boolean> => {
    // If video is ready, return immediately
    if (video.readyState >= 2) {
      console.log('[GuidanceVideoStrip] Video already ready, readyState:', video.readyState);
      return true;
    }
    
    console.log('[GuidanceVideoStrip] Video not ready (readyState:', video.readyState, '), waiting...');
    
    // Wait for video to become ready
    return new Promise<boolean>((resolve) => {
      const handleCanPlay = () => {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadeddata', handleCanPlay);
        video.removeEventListener('canplaythrough', handleCanPlay);
        console.log('[GuidanceVideoStrip] Video became ready, readyState:', video.readyState);
        resolve(true);
      };
      
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('loadeddata', handleCanPlay);
      video.addEventListener('canplaythrough', handleCanPlay);
      
      // Timeout after 1 second (reduced from 2s)
      setTimeout(() => {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadeddata', handleCanPlay);
        video.removeEventListener('canplaythrough', handleCanPlay);
        console.error('[GuidanceVideoStrip] Video ready timeout after 1s, readyState:', video.readyState);
        // Try once more before giving up
        if (video.readyState >= 1) {
          resolve(true); // Has metadata, try anyway
        } else {
          video.load(); // Force reload
          resolve(false);
        }
      }, 1000);
      
      // Try to trigger load
      if (video.readyState < 2) {
        video.load();
      }
    });
  }, []);
  
  const seekToFrame = useCallback(async (video: HTMLVideoElement, frame: number, fps: number) => {
    // Throttle seeks to prevent overwhelming the video
    const now = Date.now();
    const timeSinceLastSeek = now - lastSeekTimeRef.current;
    
    // If currently seeking or too soon since last seek, queue this frame for later
    if (seekingRef.current || timeSinceLastSeek < SEEK_THROTTLE_MS) {
      pendingSeekRef.current = frame;
      
      // If not currently seeking but just throttled, schedule the pending seek
      if (!seekingRef.current) {
        setTimeout(() => {
          const pending = pendingSeekRef.current;
          if (pending !== null && videoRef.current) {
            pendingSeekRef.current = null;
            seekToFrame(videoRef.current, pending, fps);
          }
        }, SEEK_THROTTLE_MS - timeSinceLastSeek);
      }
      return;
    }
    
    seekingRef.current = true;
    lastSeekTimeRef.current = now;
    
    try {
      // Ensure video is ready for seeking - wait if needed
      const ready = await ensureVideoReady(video);
      if (!ready) {
        console.warn('[GuidanceVideoStrip] Video could not become ready for seeking');
        return;
      }
      
      const timeInSeconds = frame / fps;
      
      // If already at this frame (within small tolerance), just redraw
      if (Math.abs(video.currentTime - timeInSeconds) < 0.05) {
        drawVideoFrame(video, frame);
        return;
      }
      
      // Seek to the frame
        video.currentTime = timeInSeconds;
        
      // Wait for seek complete with increased timeout
        await new Promise<void>((resolve) => {
          const handleSeeked = () => {
          video.removeEventListener('seeked', handleSeeked);
          
          console.log('[GuidanceVideoStrip] Seeked event fired for frame', frame, 'at time', video.currentTime);
          
          // Draw the frame
          const success = drawVideoFrame(video, frame);
          if (!success) {
            console.warn('[GuidanceVideoStrip] Failed to draw frame', frame, 'after seeked event', {
              readyState: video.readyState,
              currentTime: video.currentTime,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight
            });
              } else {
            console.log('[GuidanceVideoStrip] Successfully drew frame', frame);
          }
          
          resolve();
        };
        
        const handleError = (e: Event) => {
          video.removeEventListener('error', handleError);
          console.error('[GuidanceVideoStrip] Video error during seek to frame', frame, e);
            resolve();
          };
          
        video.addEventListener('seeked', handleSeeked, { once: true });
        video.addEventListener('error', handleError, { once: true });
          
        // Timeout after 500ms (increased from 300ms)
          setTimeout(() => {
            video.removeEventListener('seeked', handleSeeked);
          video.removeEventListener('error', handleError);
          
          // Seek timeout - this is normal when scrubbing quickly
          // Try to draw anyway - video might have seeked without firing event
          drawVideoFrame(video, frame, true); // Force retry flag (failures are expected and silent)
          resolve();
          }, 500);
        });
    } catch (error) {
      console.error('[GuidanceVideoStrip] Seek error:', error);
    } finally {
      seekingRef.current = false;
      
      // Process pending seek if one was queued
      const pendingFrame = pendingSeekRef.current;
      if (pendingFrame !== null && pendingFrame !== frame) {
        pendingSeekRef.current = null;
        seekToFrame(video, pendingFrame, fps);
      }
    }
  }, [drawVideoFrame, ensureVideoReady]);
  
  const resetSeekingState = useCallback(() => {
    const now = Date.now();
    const timeSinceLastReset = now - (lastBlankCheckRef.current || 0);
    
    // Prevent rapid-fire resets (must be at least 100ms apart)
    if (timeSinceLastReset < 100) {
      console.warn('[GuidanceVideoStrip] Ignoring reset - too soon after last reset (', timeSinceLastReset, 'ms)');
      return;
    }
    
    seekingRef.current = false;
    pendingSeekRef.current = null;
    lastSeekTimeRef.current = 0;
    lastBlankCheckRef.current = now;
    
    // Log stack trace to see what's calling this
    console.log('[GuidanceVideoStrip] Reset seeking state', new Error().stack);
  }, []);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!videoRef.current || !isVideoReady) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    
    // Update hover position for preview box
    setHoverPosition({ x: e.clientX, y: e.clientY });
    
    // Calculate timeline frame from cursor position
    const paddingOffset = TIMELINE_HORIZONTAL_PADDING;
    const effectiveWidth = containerWidth - (paddingOffset * 2);
    const normalizedX = Math.max(0, Math.min(1, (cursorX - paddingOffset) / effectiveWidth));
    const timelineFrame = Math.round(fullMin + (normalizedX * (fullMax - fullMin)));
    setCurrentTimelineFrame(timelineFrame);
    
    // Calculate video frame based on treatment mode
    const videoFrame = treatment === 'adjust'
      ? calculateAdjustModeFrame(cursorX, containerWidth, fullMin, fullMax, videoMetadata)
      : calculateClipModeFrame(cursorX, containerWidth, fullMin, fullMax, videoMetadata);
    
    if (videoFrame !== currentFrame) {
      setCurrentFrame(videoFrame);
      
      // Seek to frame for preview canvas
      if (videoRef.current) {
        seekToFrame(videoRef.current, videoFrame, videoMetadata.frame_rate);
      }
    }
  }, [treatment, containerWidth, fullMin, fullMax, videoMetadata, currentFrame, isVideoReady, seekToFrame]);
  
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    // Don't reset here - causes issues when preview appears/disappears
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    // Don't reset here - causes issues when preview appears/disappears
  }, []);

  // Close hover state when treatment changes
  useEffect(() => {
    setIsHovering(false);
  }, [treatment]);
  
  return (
    <div className="w-full relative">
      {/* Floating preview box above video strip and header - rendered via portal to document.body */}
      {/* Canvas always mounted but only visible when hovering */}
      {createPortal(
        <div 
          className="fixed pointer-events-none"
          style={{
            left: `${hoverPosition.x}px`,
            top: `${hoverPosition.y - 140}px`, // Position above cursor (adjusted for frame label)
            transform: 'translateX(-50%)',
            zIndex: 999999, // Above GlobalHeader and all other elements
            display: isHovering && isVideoReady ? 'block' : 'none'
          }}
        >
          <div className="bg-background border-2 border-primary rounded-lg shadow-2xl overflow-hidden">
            {/* Preview frame - always mounted so ref is always valid */}
            <canvas
              ref={previewCanvasRef}
              className="w-32 h-auto block"
              style={{ imageRendering: 'auto' }}
            />
            {/* Timeline frame number label */}
            <div className="px-2 py-1 bg-background/95 border-t border-primary/40">
              <span className="text-[10px] font-medium text-foreground">
                Frame {currentTimelineFrame}
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Structure video strip - outer container always full width */}
      <div className="relative h-28 bg-gradient-to-b from-muted/30 to-muted/10 border-l border-r border-t rounded-t mb-0 mt-6"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          overflow: 'visible',
        }}
      >
        {/* Inner container for video content - shortened in clip mode */}
        <div
          ref={stripContainerRef}
          className="absolute left-0 top-0 bottom-0"
          style={{
            width: treatment === 'clip' 
              ? `${videoCoverageRatio * zoomLevel * 100}%`
              : '100%',
            paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
            paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          }}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
        {/* Hidden video element for frame extraction and preview */}
        <video
          ref={videoRef}
          src={videoUrl}
          preload="auto"
          className="hidden"
          crossOrigin="anonymous"
          muted
          playsInline
        />
        
          {/* Treatment selector - top left */}
          <div className="absolute top-3 left-2 z-30">
            <Select value={treatment} onValueChange={(treatment: 'adjust' | 'clip') => {
              onTreatmentChange(treatment);
            }}>
              <SelectTrigger className="h-6 w-[180px] text-[9px] px-2 py-0 bg-background/95 border-muted-foreground/30 text-left [&>span]:line-clamp-none [&>span]:whitespace-nowrap">
                <SelectValue>
                  {treatment === 'adjust' 
                    ? (videoMetadata.total_frames > timelineFrames ? 'Compress' : videoMetadata.total_frames < timelineFrames ? 'Stretch' : 'Match') + ' to timeline'
                    : 'Use video as is'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adjust">
                  <div className="flex flex-col gap-0.5 py-1">
                    <span className="text-xs font-medium">
                      {videoMetadata.total_frames > timelineFrames ? 'Compress' : videoMetadata.total_frames < timelineFrames ? 'Stretch' : 'Match'} to timeline
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {(() => {
                        const totalVideoFrames = videoMetadata.total_frames;
                        const timelineRange = fullMax - fullMin + 1;
                        if (totalVideoFrames === 0 || timelineRange === 0) return '';
                        if (totalVideoFrames > timelineRange) {
                          const framesToDrop = totalVideoFrames - timelineRange;
                          return `Your input video has ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} so we'll drop ${framesToDrop} frame${framesToDrop === 1 ? '' : 's'} to compress your guide video to fit timeline frames ${fullMin}-${fullMax} (${timelineRange} frame${timelineRange === 1 ? '' : 's'}).`;
                        } else if (totalVideoFrames < timelineRange) {
                          const framesToDuplicate = timelineRange - totalVideoFrames;
                          return `Your input video has ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} so we'll duplicate ${framesToDuplicate} frame${framesToDuplicate === 1 ? '' : 's'} to stretch your guide video to fit timeline frames ${fullMin}-${fullMax} (${timelineRange} frame${timelineRange === 1 ? '' : 's'}).`;
                        } else {
                          return `Perfect! Your input video has ${timelineRange} frame${timelineRange === 1 ? '' : 's'}, matching timeline frames ${fullMin}-${fullMax} exactly.`;
                        }
                      })()}
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="clip">
                  <div className="flex flex-col gap-0.5 py-1">
                    <span className="text-xs font-medium">Use video as is</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {(() => {
                        const totalVideoFrames = videoMetadata.total_frames;
                        const timelineRange = fullMax - fullMin + 1;
                        if (totalVideoFrames === 0 || timelineRange === 0) return '';
                        if (totalVideoFrames > timelineRange) {
                          const unusedFrames = totalVideoFrames - timelineRange;
                          return `Your video will guide timeline frames ${fullMin}-${fullMax} (${timelineRange} frame${timelineRange === 1 ? '' : 's'}). The last ${unusedFrames} frame${unusedFrames === 1 ? '' : 's'} of your video (video frame${unusedFrames === 1 ? '' : 's'} ${timelineRange + 1}-${totalVideoFrames}) will be ignored.`;
                        } else if (totalVideoFrames < timelineRange) {
                          const uncoveredFrames = timelineRange - totalVideoFrames;
                          const guidedEnd = fullMin + totalVideoFrames - 1;
                          return `Your video will guide timeline frames ${fullMin}-${guidedEnd} (${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'}). Timeline frames ${guidedEnd + 1}-${fullMax} (${uncoveredFrames} frame${uncoveredFrames === 1 ? '' : 's'}) won't have video guidance.`;
                        } else {
                          return `Perfect! Your video length matches timeline frames ${fullMin}-${fullMax} exactly (${timelineRange} frame${timelineRange === 1 ? '' : 's'}).`;
                        }
                      })()}
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Delete button - top right, but minimum position is to the right of selector (left: 200px = 8px + 180px + 12px gap) */}
          <Button
            variant="destructive"
            size="sm"
            className="absolute top-2 z-30 h-7 w-7 p-0 opacity-90 hover:opacity-100 shadow-lg rounded-full"
            style={{
              right: '8px',
              left: 'max(200px, calc(100% - 36px))' // At least 200px from left, or natural right position
            }}
            onClick={onRemove}
            title="Remove guidance video"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Frame strip - showing frames side by side with padding to align with timeline */}
        {displayFrameImages.length > 0 ? (
          <div className="absolute left-4 right-4 top-6 bottom-2 flex border-2 border-primary/40 rounded overflow-hidden shadow-md">
            {/* Blur overlay when extracting new frames - only show if strip is wide enough */}
            {isExtractingFrames && videoCoverageRatio > 0.3 && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-sm z-10">
                <span className="text-xs font-medium text-foreground bg-background/90 px-3 py-1.5 rounded-md border shadow-sm">
                  Loading updated timeline...
                </span>
              </div>
            )}
            
            {/* Frame images */}
            {displayFrameImages.map((frameUrl, index) => (
              <img
                key={index}
                src={frameUrl}
                alt={`Frame ${index}`}
                className="h-full object-cover flex-1 border-l border-r border-border/20"
                style={{ minWidth: 0 }}
              />
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
            <span className="text-xs text-muted-foreground">
              {isVideoReady ? 'Loading frames...' : 'Loading video...'}
            </span>
          </div>
        )}
        </div>
        {/* End inner container */}
      </div>
      {/* End outer container */}
    </div>
  );
};

