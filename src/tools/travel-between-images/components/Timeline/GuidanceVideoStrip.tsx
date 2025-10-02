import React, { useRef, useState, useCallback, useEffect } from 'react';
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
  const [isHovering, setIsHovering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [frameImages, setFrameImages] = useState<string[]>([]);
  const [displayFrameImages, setDisplayFrameImages] = useState<string[]>([]); // What's actually shown
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const seekingRef = useRef(false);
  
  // Calculate timeline duration and frames
  const ASSUMED_TIMELINE_FPS = 24;
  const timelineDuration = (fullMax - fullMin) / ASSUMED_TIMELINE_FPS;
  const timelineFrames = fullMax - fullMin + 1;
  const totalVideoFrames = videoMetadata?.total_frames || 0;
  
  // Calculate playback speed for adjust mode
  const playbackSpeed = treatment === 'adjust' 
    ? videoMetadata.duration_seconds / timelineDuration 
    : 1.0;
  
  // Calculate adjust mode description (stretch/compress)
  const adjustModeDescription = (() => {
    if (totalVideoFrames === 0 || timelineFrames === 0) return '';
    
    if (totalVideoFrames > timelineFrames) {
      const framesToDrop = totalVideoFrames - timelineFrames;
      return `We'll drop ${framesToDrop} frame${framesToDrop === 1 ? '' : 's'} to compress your guide video to the ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} your input images cover.`;
    } else if (totalVideoFrames < timelineFrames) {
      const framesToDuplicate = timelineFrames - totalVideoFrames;
      return `We'll duplicate ${framesToDuplicate} frame${framesToDuplicate === 1 ? '' : 's'} to stretch your guide video to the ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} your input images cover.`;
    } else {
      return `Video matches timeline (${timelineFrames} frames)`;
    }
  })();
  
  // Calculate clip mode description (as-is)
  const clipModeDescription = (() => {
    if (totalVideoFrames === 0 || timelineFrames === 0) return '';
    
    if (totalVideoFrames > timelineFrames) {
      return `We'll use the first ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'} of your ${totalVideoFrames}-frame guide video.`;
    } else if (totalVideoFrames < timelineFrames) {
      return `Your guide video has ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'}, but your timeline spans ${timelineFrames} frame${timelineFrames === 1 ? '' : 's'}. The video will guide the first ${totalVideoFrames} frame${totalVideoFrames === 1 ? '' : 's'} only.`;
    } else {
      return `Video matches timeline (${timelineFrames} frames)`;
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
        // Calculate how many frames to extract (one every ~60-80px for good coverage)
        const stripWidth = containerWidth * zoomLevel;
        const frameWidth = 80; // Target width for each frame thumbnail
        const numFrames = Math.max(8, Math.min(30, Math.floor(stripWidth / frameWidth)));
        
        const extractedFrames: string[] = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
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
  }, [videoUrl, videoMetadata, containerWidth, zoomLevel, treatment, fullMin, fullMax]);
  
  const seekToFrame = useCallback(async (video: HTMLVideoElement, frame: number, fps: number) => {
    if (seekingRef.current) return; // Prevent multiple simultaneous seeks
    seekingRef.current = true;
    
    try {
      // Ensure video is ready for seeking
      if (video.readyState < 2) {
        console.warn('[GuidanceVideoStrip] Video not ready for seeking, readyState:', video.readyState);
        seekingRef.current = false;
        return;
      }
      
      const timeInSeconds = frame / fps;
      
      // Only seek if we're not already at this time (within tolerance)
      if (Math.abs(video.currentTime - timeInSeconds) > 0.1) {
        video.currentTime = timeInSeconds;
        
        // Wait for seek complete, then draw to preview canvas
        await new Promise<void>((resolve) => {
          const handleSeeked = () => {
            if (videoRef.current && previewCanvasRef.current) {
              const previewCanvas = previewCanvasRef.current;
              const previewCtx = previewCanvas.getContext('2d');
              
              if (previewCtx && videoRef.current.videoWidth > 0) {
                // Set canvas size to match video
                previewCanvas.width = videoRef.current.videoWidth;
                previewCanvas.height = videoRef.current.videoHeight;
                
                // Clear and draw the current frame
                previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                previewCtx.drawImage(videoRef.current, 0, 0);
                
                console.log('[GuidanceVideoStrip] Drew frame', frame, 'to preview canvas');
              } else {
                console.warn('[GuidanceVideoStrip] Failed to draw - canvas or video not ready', {
                  hasCtx: !!previewCtx,
                  videoWidth: videoRef.current?.videoWidth,
                  videoHeight: videoRef.current?.videoHeight
                });
              }
            }
            video.removeEventListener('seeked', handleSeeked);
            resolve();
          };
          
          video.addEventListener('seeked', handleSeeked);
          
          // Timeout after 500ms
          setTimeout(() => {
            video.removeEventListener('seeked', handleSeeked);
            console.warn('[GuidanceVideoStrip] Seek timeout for frame', frame);
            resolve();
          }, 500);
        });
      }
    } catch (error) {
      console.error('[GuidanceVideoStrip] Seek error:', error);
    } finally {
      seekingRef.current = false;
    }
  }, []);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!videoRef.current || !isVideoReady) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    
    // Update hover position for preview box
    setHoverPosition({ x: e.clientX, y: e.clientY });
    
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
  
  return (
    <div className="w-full">
      {/* Floating preview box above video strip */}
      {isHovering && isVideoReady && (
        <div 
          className="fixed pointer-events-none"
          style={{
            left: `${hoverPosition.x}px`,
            top: `${hoverPosition.y - 200}px`, // Position above cursor (adjusted for taller preview)
            transform: 'translateX(-50%)',
            zIndex: 9999
          }}
        >
          <div className="bg-background border-2 border-primary rounded-lg shadow-2xl overflow-hidden">
            {/* Preview frame */}
            <canvas
              ref={previewCanvasRef}
              className="w-56 h-auto block"
              style={{ imageRendering: 'auto' }}
            />
            {/* Frame info */}
            <div className="bg-black/90 text-white text-xs px-3 py-2 space-y-0.5">
              <div className="font-semibold">Frame {currentFrame} / {videoMetadata.total_frames}</div>
              <div className="flex items-center gap-2 text-[10px] text-white/80">
                <span>Motion: {motionStrength.toFixed(1)}x</span>
                {treatment === 'adjust' && (
                  <span className="border-l border-white/30 pl-2">Speed: {playbackSpeed.toFixed(2)}x</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Structure video strip */}
      <div 
        ref={stripContainerRef}
        className="relative h-28 bg-gradient-to-b from-muted/30 to-muted/10 border-l border-r border-t rounded-t overflow-hidden mb-0 mt-6"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Delete button in top-right corner */}
        <Button
          variant="destructive"
          size="sm"
          className="absolute top-2 right-2 z-20 h-6 w-6 p-0 opacity-80 hover:opacity-100"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
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
        
        {/* Frame strip - showing frames side by side with padding to align with timeline */}
        {displayFrameImages.length > 0 ? (
          <div className="relative flex h-full pt-6 pb-1">
            {/* Blur overlay when extracting new frames */}
            {isExtractingFrames && (
              <div className="absolute top-6 bottom-1 left-0 right-0 flex items-center justify-center bg-background/20 backdrop-blur-sm z-10">
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
          /* Initial loading indicator (only shown when no frames exist yet) */
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
            <span className="text-xs text-muted-foreground">
              {isVideoReady ? 'Loading frames...' : 'Loading video...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

