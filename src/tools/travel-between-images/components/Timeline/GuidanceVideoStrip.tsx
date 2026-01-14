import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VideoMetadata, extractVideoMetadataFromUrl } from '@/shared/lib/videoUploader';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Slider } from '@/shared/components/ui/slider';
import { X } from 'lucide-react';

interface GuidanceVideoStripProps {
  videoUrl: string;
  videoMetadata: VideoMetadata | null; // Can be null - will be extracted from video
  treatment: 'adjust' | 'clip';
  motionStrength: number;
  onTreatmentChange: (treatment: 'adjust' | 'clip') => void;
  onMotionStrengthChange: (strength: number) => void;
  onRemove: () => void;
  onMetadataExtracted?: (metadata: VideoMetadata) => void; // Callback when metadata is extracted (so it can be saved to DB)
  // Timeline coordinate system
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  // Timeline dimensions
  timelineFrameCount: number;
  frameSpacing: number;
  readOnly?: boolean; // Hide interactive controls in read-only mode
  
  // NEW: Output range - where in timeline this video is positioned
  outputStartFrame?: number; // Default: fullMin (legacy behavior)
  outputEndFrame?: number; // Default: fullMax (legacy behavior)
  
  // NEW: Source range - which frames from source video to use
  sourceStartFrame?: number; // Default: 0
  sourceEndFrame?: number | null; // Default: null (end of video)
  
  // NEW: Callbacks for range changes
  onRangeChange?: (startFrame: number, endFrame: number) => void;
  onSourceRangeChange?: (sourceStartFrame: number, sourceEndFrame: number | null) => void;
  
  // NEW: Position absolutely within parent (for multi-video same-row layout)
  useAbsolutePosition?: boolean;
  
  // NEW: Sibling video ranges for collision detection (prevents overlap)
  siblingRanges?: Array<{ start: number; end: number }>;
}

/**
 * Calculate which video frame to display based on cursor position and treatment mode
 */
const calculateAdjustModeFrame = (
  cursorPixelX: number,
  containerWidth: number,
  fullMin: number,
  fullMax: number,
  videoMetadata: VideoMetadata | null
): number => {
  if (!videoMetadata) return 0;
  
  // 1. Calculate cursor position in timeline coordinate space
  // Use the same coordinate system as images/ruler to ensure alignment
  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const normalizedX = Math.max(0, Math.min(1, (cursorPixelX - TIMELINE_PADDING_OFFSET) / effectiveWidth));
  
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
  videoMetadata: VideoMetadata | null
): number => {
  if (!videoMetadata) return 0;
  
  // Direct 1:1 mapping - timeline frame = video frame
  // Use the same coordinate system as images/ruler to ensure alignment
  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const normalizedX = Math.max(0, Math.min(1, (cursorPixelX - TIMELINE_PADDING_OFFSET) / effectiveWidth));
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
  onMetadataExtracted,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  zoomLevel,
  timelineFrameCount,
  frameSpacing,
  readOnly = false,
  // NEW: Output range props (defaults for legacy behavior)
  outputStartFrame,
  outputEndFrame,
  // NEW: Source range props
  sourceStartFrame,
  sourceEndFrame,
  // NEW: Range change callbacks
  onRangeChange,
  onSourceRangeChange,
  useAbsolutePosition = false,
  siblingRanges = [],
}) => {
  // Calculate effective output range (use props or fall back to fullMin/fullMax for legacy)
  const effectiveOutputStart = outputStartFrame ?? fullMin;
  const effectiveOutputEnd = outputEndFrame ?? fullMax;
  const outputFrameCount = effectiveOutputEnd - effectiveOutputStart;
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
  
  // Drag state for moving/resizing the strip
  const [isDragging, setIsDragging] = useState<'move' | 'left' | 'right' | null>(null);
  const [dragPreviewRange, setDragPreviewRange] = useState<{ start: number; end: number } | null>(null);
  const dragStartRef = useRef<{ mouseX: number; startFrame: number; endFrame: number } | null>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  
  // Use drag preview range during drag, otherwise use actual props
  const displayOutputStart = dragPreviewRange?.start ?? effectiveOutputStart;
  const displayOutputEnd = dragPreviewRange?.end ?? effectiveOutputEnd;
  const displayOutputFrameCount = displayOutputEnd - displayOutputStart;
  
  // Extract metadata if not provided
  const [extractedMetadata, setExtractedMetadata] = useState<VideoMetadata | null>(null);
  const [isExtractingMetadata, setIsExtractingMetadata] = useState(false);
  
  // Use provided metadata or extracted metadata
  const effectiveMetadata = videoMetadata || extractedMetadata;
  
  // Extract metadata from URL if not provided
  useEffect(() => {
    if (!videoMetadata && !isExtractingMetadata && !extractedMetadata) {
      setIsExtractingMetadata(true);
      console.log('[GuidanceVideoStrip] 🎬 Extracting metadata from URL:', videoUrl.substring(0, 100) + '...');
      extractVideoMetadataFromUrl(videoUrl)
        .then(metadata => {
          console.log('[GuidanceVideoStrip] ✅ Metadata extracted successfully:', {
            duration: metadata.duration_seconds,
            frameRate: metadata.frame_rate,
            totalFrames: metadata.total_frames,
            dimensions: `${metadata.width}x${metadata.height}`
          });
          setExtractedMetadata(metadata);
          
          // Save extracted metadata back to database via callback
          if (onMetadataExtracted) {
            console.log('[GuidanceVideoStrip] 💾 Calling onMetadataExtracted to save metadata to database');
            onMetadataExtracted(metadata);
          }
        })
        .catch(error => {
          console.error('[GuidanceVideoStrip] ❌ Failed to extract metadata:', error);
        })
        .finally(() => {
          setIsExtractingMetadata(false);
        });
    }
  }, [videoUrl, videoMetadata, isExtractingMetadata, extractedMetadata, onMetadataExtracted]);
  
  // Calculate timeline duration and frames
  const ASSUMED_TIMELINE_FPS = 24;
  const timelineDuration = (fullMax - fullMin) / ASSUMED_TIMELINE_FPS;
  const timelineFrames = fullMax - fullMin + 1;
  const totalVideoFrames = effectiveMetadata?.total_frames || 0;
  
  // NEW: Calculate effective source range
  const effectiveSourceStart = sourceStartFrame ?? 0;
  const effectiveSourceEnd = sourceEndFrame ?? totalVideoFrames;
  const sourceFrameCount = Math.max(0, effectiveSourceEnd - effectiveSourceStart);
  
  // Calculate video coverage for clip mode (using source range, not full video)
  const videoCoversFrames = treatment === 'clip' ? Math.min(sourceFrameCount, outputFrameCount) : outputFrameCount;
  const videoCoverageRatio = outputFrameCount > 0 ? videoCoversFrames / outputFrameCount : 1;
  
  // NEW: Calculate position on timeline (for multi-video support)
  // Use the same coordinate system as SegmentOutputStrip for alignment
  const stripEffectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  // Calculate pixel positions using same formula as timeline
  const startPixel = fullRange > 0 
    ? TIMELINE_PADDING_OFFSET + ((displayOutputStart - fullMin) / fullRange) * stripEffectiveWidth
    : TIMELINE_PADDING_OFFSET;
  const endPixel = fullRange > 0
    ? TIMELINE_PADDING_OFFSET + ((displayOutputEnd - fullMin) / fullRange) * stripEffectiveWidth
    : TIMELINE_PADDING_OFFSET + stripEffectiveWidth;
  const widthPixel = Math.max(0, endPixel - startPixel);
  
  // Convert to percentages of containerWidth (same approach as SegmentOutputStrip)
  const stripLeftPercent = (startPixel / containerWidth) * 100;
  const stripWidthPercent = (widthPixel / containerWidth) * 100;
  
  // Legacy percentage-based positioning (for non-absolute/relative mode)
  const legacyPositionPercent = fullRange > 0 ? ((displayOutputStart - fullMin) / fullRange) * 100 : 0;
  const legacyWidthPercent = fullRange > 0 ? (displayOutputFrameCount / fullRange) * 100 : 100;
  
  // Calculate playback speed for adjust mode
  const playbackSpeed = treatment === 'adjust' 
    ? (effectiveMetadata?.duration_seconds || 0) / timelineDuration 
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
  // NOTE: Only re-extract when video URL, metadata, or treatment changes
  // Do NOT re-extract on zoom (containerWidth) or timeline expansion (fullMin/fullMax)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // Skip extraction during drag - will re-extract when drag ends
    if (isDragging) {
      return;
    }
    
    // CRITICAL: Don't start extraction until we have metadata!
    if (!effectiveMetadata) {
      console.log('[GuidanceVideoStrip] ⏳ Waiting for metadata before extracting frames...');
      return;
    }

    const extractFrames = async () => {
      console.log('[GuidanceVideoStrip] 🎞️ Starting frame extraction:', {
        treatment,
        totalFrames: effectiveMetadata.total_frames,
        frameRate: effectiveMetadata.frame_rate,
        duration: effectiveMetadata.duration_seconds,
        // NEW: Log source range
        sourceRange: { start: effectiveSourceStart, end: effectiveSourceEnd, count: sourceFrameCount },
        outputRange: { start: effectiveOutputStart, end: effectiveOutputEnd, count: outputFrameCount },
      });
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
        // NEW: Use source range instead of full video
        // In adjust mode: source range is stretched/compressed to fit output range
        // In clip mode: source frames map 1:1 to output frames
        
        // Use a FIXED number of thumbnails based on source range, not container width
        // This prevents re-extraction on zoom
        const maxThumbnails = treatment === 'adjust' 
          ? Math.min(outputFrameCount, 80) // Fixed max for adjust mode
          : Math.min(sourceFrameCount, 80); // Fixed max for clip mode
        
        const numFrames = Math.max(1, maxThumbnails);
        
        // Validate inputs before extraction to prevent NaN/Infinity errors
        if (numFrames < 1) {
          console.error('[GuidanceVideoStrip] Invalid numFrames:', numFrames);
          setIsExtractingFrames(false);
          return;
        }
        
        if (!effectiveMetadata.total_frames || effectiveMetadata.total_frames < 1) {
          console.error('[GuidanceVideoStrip] Invalid total_frames:', effectiveMetadata.total_frames);
          setIsExtractingFrames(false);
          return;
        }
        
        const timelineFrameCount = fullMax - fullMin;
        if (!isFinite(timelineFrameCount) || timelineFrameCount < 0) {
          console.error('[GuidanceVideoStrip] Invalid timelineFrameCount:', { fullMax, fullMin, timelineFrameCount });
          setIsExtractingFrames(false);
          return;
        }
        
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
        // NEW: Use source range instead of full video
        for (let i = 0; i < numFrames; i++) {
          let frameIndex: number;
          
          // Handle edge case: if only extracting 1 frame, use the first source frame
          if (numFrames === 1) {
            frameIndex = effectiveSourceStart;
          } else if (treatment === 'adjust') {
            // Adjust mode: sample across entire source range, stretched/compressed to fit output
            // Maps evenly across sourceStartFrame to sourceEndFrame
            frameIndex = effectiveSourceStart + Math.floor((i / (numFrames - 1)) * (sourceFrameCount - 1));
          } else {
            // Clip mode: 1:1 mapping from source to output
            // Map thumbnail index to source frame within source range
            const sourcePosition = (i / (numFrames - 1)) * (sourceFrameCount - 1);
            frameIndex = effectiveSourceStart + Math.floor(sourcePosition);
          }
          
          // Clamp to valid source range
          frameIndex = Math.max(effectiveSourceStart, Math.min(frameIndex, effectiveSourceEnd - 1));
          
          // Validate frameIndex after calculation
          if (!isFinite(frameIndex) || frameIndex < 0) {
            console.error('[GuidanceVideoStrip] Invalid frameIndex calculated:', { 
              i, 
              numFrames, 
              treatment, 
              timelineFrameCount, 
              totalFrames: effectiveMetadata.total_frames,
              frameIndex 
            });
            throw new Error(`Invalid frame index calculated: ${frameIndex}`);
          }
          
          // Validate frame_rate to prevent NaN/Infinity errors
          if (!effectiveMetadata.frame_rate || effectiveMetadata.frame_rate <= 0 || !isFinite(effectiveMetadata.frame_rate)) {
            console.error('[GuidanceVideoStrip] Invalid frame_rate:', effectiveMetadata.frame_rate);
            throw new Error(`Invalid video frame rate: ${effectiveMetadata.frame_rate}`);
          }
          
          const timeInSeconds = frameIndex / effectiveMetadata.frame_rate;
          
          // Additional safety check for currentTime value
          if (!isFinite(timeInSeconds) || timeInSeconds < 0) {
            console.error('[GuidanceVideoStrip] Invalid time value:', { frameIndex, frame_rate: effectiveMetadata.frame_rate, timeInSeconds });
            throw new Error(`Invalid time value calculated: ${timeInSeconds}`);
          }
          
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
          // Use lower quality (0.6 instead of 0.8) for faster processing
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          extractedFrames.push(dataUrl);
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
// Include source/output range in deps so thumbnails update when ranges change
// BUT skip extraction during drag operations to prevent stuttering
}, [videoUrl, effectiveMetadata, treatment, effectiveSourceStart, effectiveSourceEnd, effectiveOutputStart, effectiveOutputEnd, outputFrameCount, sourceFrameCount, isDragging]);
  
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
        
        // Only log as warning if truly problematic (no metadata)
        if (video.readyState < 1) {
          console.warn('[GuidanceVideoStrip] Video timeout with no metadata (readyState:', video.readyState, '), retrying...');
          video.load(); // Force reload
          resolve(false);
        } else {
          // Has metadata (readyState >= 1), proceed - this is acceptable for slow networks
          resolve(true);
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
    // Skip hover preview updates during drag - it's not useful and causes performance issues
    if (isDragging) return;
    if (!videoRef.current || !isVideoReady) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    
    // Update hover position for preview box
    setHoverPosition({ x: e.clientX, y: e.clientY });
    
    // Calculate timeline frame from cursor position
    // Use the same coordinate system as images/ruler to ensure alignment
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    const normalizedX = Math.max(0, Math.min(1, (cursorX - TIMELINE_PADDING_OFFSET) / effectiveWidth));
    const timelineFrame = Math.round(fullMin + (normalizedX * (fullMax - fullMin)));
    setCurrentTimelineFrame(timelineFrame);
    
    // Calculate video frame based on treatment mode
    const videoFrame = treatment === 'adjust'
      ? calculateAdjustModeFrame(cursorX, containerWidth, fullMin, fullMax, effectiveMetadata)
      : calculateClipModeFrame(cursorX, containerWidth, fullMin, fullMax, effectiveMetadata);
    
    if (videoFrame !== currentFrame && effectiveMetadata) {
      setCurrentFrame(videoFrame);
      
      // Seek to frame for preview canvas
      if (videoRef.current) {
        seekToFrame(videoRef.current, videoFrame, effectiveMetadata.frame_rate);
      }
    }
  }, [treatment, containerWidth, fullMin, fullMax, effectiveMetadata, currentFrame, isVideoReady, seekToFrame, isDragging]);
  
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    // Don't reset here - causes issues when preview appears/disappears
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    // Don't reset here - causes issues when preview appears/disappears
  }, []);

  // Drag handlers for moving/resizing the strip
  const handleDragStart = useCallback((type: 'move' | 'left' | 'right', e: React.MouseEvent) => {
    if (readOnly || !onRangeChange) return;
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(type);
    dragStartRef.current = {
      mouseX: e.clientX,
      startFrame: effectiveOutputStart,
      endFrame: effectiveOutputEnd,
    };
  }, [readOnly, onRangeChange, effectiveOutputStart, effectiveOutputEnd]);

  // Handle drag move and end via document events
  useEffect(() => {
    if (!isDragging || !dragStartRef.current || !onRangeChange) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      
      // Use containerWidth prop (adjusted for zoom) for reliable frame calculations
      // This is the same width used for positioning, so drag movement will match
      const effectiveWidth = (containerWidth * (zoomLevel > 1 ? zoomLevel : 1)) - (TIMELINE_PADDING_OFFSET * 2);
      if (effectiveWidth <= 0) return; // Safety check
      
      const pixelDelta = e.clientX - dragStartRef.current.mouseX;
      const frameDelta = Math.round((pixelDelta / effectiveWidth) * fullRange);
      
      const { startFrame, endFrame } = dragStartRef.current;
      const duration = endFrame - startFrame;
      
      let newStart = startFrame;
      let newEnd = endFrame;
      const MIN_DURATION_FRAMES = 10;
      
      if (isDragging === 'move') {
        // Generalized "drag into obstacle reduces the side you hit" rule.
        //
        // Phase 1: Normal translation until we hit an obstacle (wall or sibling)
        // Phase 2: The non-contact side STAYS FIXED (where it was at first contact),
        //          the contact side REDUCES (moves inward, away from obstacle)
        //
        // Example: Clip at 0-90, wall at 90, push 5 frames into wall
        //   → start stays at 0 (fixed at contact position)
        //   → end reduces from 90 to 85 (moves away from wall)
        //   → Clip shrinks from the RIGHT side (the side you dragged into)
        
        // Find obstacle limits
        const prevNeighborEnd = Math.max(
          0,
          ...siblingRanges
            .filter((s) => s.end <= startFrame)
            .map((s) => s.end)
        );
        const nextNeighborStart = Math.min(
          fullMax,
          ...siblingRanges
            .filter((s) => s.start >= endFrame)
            .map((s) => s.start)
        );

        const startLimit = Math.max(0, prevNeighborEnd);
        const endLimit = Math.min(fullMax, nextNeighborStart);

        if (frameDelta >= 0) {
          // Dragging RIGHT
          const maxTranslateDelta = endLimit - endFrame; // furthest we can translate right

          if (frameDelta <= maxTranslateDelta) {
            // Phase 1: pure translate (no obstacle hit yet)
            newStart = startFrame + frameDelta;
            newEnd = endFrame + frameDelta;
          } else {
            // Phase 2: hit right obstacle
            // - End stays PINNED at the wall
            // - Start keeps moving right at the drag rate
            // This shrinks the clip proportionally to how far you drag
            newEnd = endLimit; // pinned at wall
            newStart = startFrame + frameDelta; // keeps moving at drag rate
            
            // Cap start so we maintain minimum duration
            if (newStart > newEnd - MIN_DURATION_FRAMES) {
              newStart = newEnd - MIN_DURATION_FRAMES;
            }
          }
        } else {
          // Dragging LEFT
          const minTranslateDelta = startLimit - startFrame; // most negative delta

          if (frameDelta >= minTranslateDelta) {
            // Phase 1: pure translate (no obstacle hit yet)
            newStart = startFrame + frameDelta;
            newEnd = endFrame + frameDelta;
          } else {
            // Phase 2: hit left obstacle
            // - Start stays PINNED at the wall (0 or sibling end)
            // - End keeps moving left at the drag rate
            // This shrinks the clip proportionally to how far you drag
            newStart = startLimit; // pinned at wall
            newEnd = endFrame + frameDelta; // keeps moving at drag rate
            
            // Cap end so we maintain minimum duration
            if (newEnd < newStart + MIN_DURATION_FRAMES) {
              newEnd = newStart + MIN_DURATION_FRAMES;
            }
          }
        }

        // Clamp to limits
        newStart = Math.max(startLimit, newStart);
        newEnd = Math.min(endLimit, newEnd);
      } else if (isDragging === 'left') {
        // Resize from left - change start, keep end fixed
        newStart = Math.max(0, Math.min(endFrame - MIN_DURATION_FRAMES, startFrame + frameDelta)); // Min duration
        newEnd = endFrame;
        
        // Collision detection - can't resize past a sibling's end
        for (const sibling of siblingRanges) {
          if (sibling.end <= newEnd && newStart < sibling.end) {
            newStart = sibling.end;
          }
        }
      } else if (isDragging === 'right') {
        // Resize from right - keep start, change end
        newStart = startFrame;
        newEnd = Math.max(startFrame + MIN_DURATION_FRAMES, endFrame + frameDelta); // Min duration
        
        // Collision detection - can't resize past a sibling's start
        for (const sibling of siblingRanges) {
          if (sibling.start >= newStart && newEnd > sibling.start) {
            newEnd = sibling.start;
          }
        }
      }
      
      // Clamp to timeline boundaries for resize operations
      if (newEnd > fullMax) {
        newEnd = fullMax;
      }
      if (newStart < 0) {
        newStart = 0;
      }
      
      // Ensure minimum duration
      if (newEnd - newStart < MIN_DURATION_FRAMES) {
        if (isDragging === 'left') {
          newStart = newEnd - MIN_DURATION_FRAMES;
        } else if (isDragging === 'right') {
          newEnd = newStart + MIN_DURATION_FRAMES;
        }
      }
      
      // Update local preview state only - don't save to database during drag
      setDragPreviewRange({ start: newStart, end: newEnd });
    };

    const handleMouseUp = () => {
      // Commit the final range to parent (saves to database)
      if (dragPreviewRange) {
        const newDuration = dragPreviewRange.end - dragPreviewRange.start;
        const videoFrames = effectiveMetadata?.total_frames || 0;
        
        // Auto-switch to "Fit to range" if dragging made range longer than video in 1:1 mode
        if (treatment === 'clip' && videoFrames > 0 && newDuration > videoFrames) {
          onTreatmentChange('adjust');
        }
        
        onRangeChange(dragPreviewRange.start, dragPreviewRange.end);
      }
      setIsDragging(null);
      setDragPreviewRange(null);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onRangeChange, fullRange, fullMax, dragPreviewRange, containerWidth, zoomLevel, siblingRanges, treatment, effectiveMetadata, onTreatmentChange]);

  // Close hover state when treatment changes
  useEffect(() => {
    setIsHovering(false);
  }, [treatment]);
  
  return (
    <div className={useAbsolutePosition ? 'contents' : 'w-full relative'}>
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
            display: isHovering && isVideoReady && !isDragging ? 'block' : 'none'
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

      {/* Structure video strip - outer container with positioning for multi-video support */}
      <div
        ref={outerContainerRef}
        className={`${useAbsolutePosition ? 'absolute' : 'relative'} h-20 mb-0 group ${isDragging ? 'select-none' : ''}`}
        data-tour="structure-video"
        style={{
          // Position strip at its output range on timeline
          // Use absolute positioning when in multi-video mode, otherwise use margins
          ...(useAbsolutePosition ? {
            // Absolute positioning: use percentages of containerWidth (same as SegmentOutputStrip)
            left: `${stripLeftPercent}%`,
            width: `${stripWidthPercent}%`,
            top: 0,
            bottom: 0,
          } : {
            // Relative positioning (legacy): use margin/width with padding
            width: outputStartFrame !== undefined 
              ? `${legacyWidthPercent * (zoomLevel > 1 ? zoomLevel : 1)}%`
              : (zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%'),
            marginLeft: outputStartFrame !== undefined 
              ? `${legacyPositionPercent}%`
              : 0,
            minWidth: outputStartFrame !== undefined ? 0 : '100%',
            paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
            paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          }),
          overflow: 'visible',
          cursor: isDragging === 'move' ? 'grabbing' : undefined,
        }}
      >
        {/* Left resize handle */}
        {!readOnly && onRangeChange && (
          <div
            className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleDragStart('left', e)}
            style={{ marginLeft: useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING - 6}px` }}
          >
            <div className="w-1 h-12 bg-primary/60 rounded-full hover:bg-primary" />
          </div>
        )}
        
        {/* Right resize handle */}
        {!readOnly && onRangeChange && (
          <div
            className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleDragStart('right', e)}
            style={{ marginRight: useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING - 6}px` }}
          >
            <div className="w-1 h-12 bg-primary/60 rounded-full hover:bg-primary" />
          </div>
        )}
        {/* Inner container for video content - shortened in clip mode when source < output */}
        <div
          ref={stripContainerRef}
          className="absolute left-0 top-0 bottom-0"
          style={{
            // In clip mode with source shorter than output, shrink to show "no guidance" zone
            width: treatment === 'clip' && sourceFrameCount < outputFrameCount
              ? `${videoCoverageRatio * 100}%`
              : '100%',
            // No internal padding for absolute positioning (edge-to-edge videos)
            paddingLeft: useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING}px`,
            paddingRight: useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING}px`,
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
        

          {/* Delete button - top right (hidden in readOnly) */}
          {!readOnly && (
            <Button
              variant="destructive"
              size="sm"
              className="absolute top-1 right-1 z-30 h-6 w-6 p-0 opacity-90 hover:opacity-100 shadow-lg rounded-full"
              onClick={onRemove}
              title="Remove guidance video"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {/* Frame strip - showing frames side by side with padding to align with timeline */}
        {displayFrameImages.length > 0 ? (
          <div 
            className={`absolute top-5 bottom-1 flex border-2 rounded overflow-hidden shadow-md ${
              isDragging === 'move' ? 'border-primary cursor-grabbing' : 'border-primary/40 cursor-grab'
            } ${!readOnly && onRangeChange ? 'hover:border-primary/70' : ''}`}
            style={{
              left: useAbsolutePosition ? '2px' : '16px',
              right: useAbsolutePosition ? '2px' : '16px',
            }}
            onMouseDown={(e) => {
              // Only start move drag if not clicking on controls
              if ((e.target as HTMLElement).closest('button, select, [role="listbox"]')) return;
              handleDragStart('move', e);
            }}
          >
            {/* Blur overlay when extracting new frames - only show if strip is wide enough and NOT dragging */}
            {isExtractingFrames && !isDragging && videoCoverageRatio > 0.3 && (
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
          <div 
            className={`absolute top-5 bottom-1 flex items-center justify-center bg-muted/50 dark:bg-muted-foreground/15 border rounded-sm ${
              !readOnly && onRangeChange ? 'cursor-grab hover:border-primary/50' : 'border-border/30'
            }`}
            style={{
              left: useAbsolutePosition ? '2px' : '16px',
              right: useAbsolutePosition ? '2px' : '16px',
            }}
            onMouseDown={(e) => handleDragStart('move', e)}
          >
            <span className="text-xs text-muted-foreground font-medium">
              {isVideoReady ? 'Loading frames...' : 'Loading video...'}
            </span>
          </div>
        )}
        </div>
        {/* End inner container */}
        
        {/* Frame range indicator - bottom of strip */}
        {outputStartFrame !== undefined && !readOnly && (
          <div 
            className="absolute bottom-0 flex justify-between items-center text-[9px] text-muted-foreground font-mono"
            style={{
              left: useAbsolutePosition ? '2px' : '16px',
              right: useAbsolutePosition ? '2px' : '16px',
            }}
          >
            <div className="flex items-center gap-1">
              <span className={`px-1 rounded bg-background/80 pointer-events-none ${isDragging ? 'ring-1 ring-primary' : ''}`}>f{displayOutputStart}</span>
              {/* Treatment selector - inline with frame count */}
              <Select value={treatment} onValueChange={(newTreatment: 'adjust' | 'clip') => {
                // When switching to 1:1 mapping, shrink range to match video duration
                if (newTreatment === 'clip' && onRangeChange) {
                  const videoFrames = effectiveMetadata?.total_frames || 0;
                  const currentDuration = displayOutputEnd - displayOutputStart;
                  
                  if (videoFrames > 0 && currentDuration > videoFrames) {
                    // Shrink the end to match video duration
                    onRangeChange(displayOutputStart, displayOutputStart + videoFrames);
                  }
                }
                onTreatmentChange(newTreatment);
              }}>
                <SelectTrigger variant="retro" size="sm" className="h-4 w-[72px] text-[8px] px-1 py-0 bg-background/90 font-sans [&>span]:line-clamp-none [&>span]:whitespace-nowrap">
                  <SelectValue>
                    {treatment === 'adjust' ? 'Fit to range' : '1:1 mapping'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent variant="retro">
                  <SelectItem variant="retro" value="adjust">
                    <div className="flex flex-col gap-0.5 py-1">
                      <span className="text-xs font-medium">Fit to range</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        Stretch or compress video to fill the entire range
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem variant="retro" value="clip">
                    <div className="flex flex-col gap-0.5 py-1">
                      <span className="text-xs font-medium">1:1 mapping</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        Each video frame maps to one output frame
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className={`px-1 rounded bg-background/80 pointer-events-none ${isDragging ? 'ring-1 ring-primary' : ''}`}>f{displayOutputEnd}</span>
          </div>
        )}
        
      </div>
      {/* End outer container */}
    </div>
  );
};

