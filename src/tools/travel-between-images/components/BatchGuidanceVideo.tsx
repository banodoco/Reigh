import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Slider } from '@/shared/components/ui/slider';
import { Video, X, Images } from 'lucide-react';
import { toast } from 'sonner';
import { uploadVideoToStorage, extractVideoMetadata, VideoMetadata } from '@/shared/lib/videoUploader';
import { DatasetBrowserModal } from '@/shared/components/DatasetBrowserModal';
import { useCreateResource, Resource, StructureVideoMetadata } from '@/shared/hooks/useResources';
import { supabase } from '@/integrations/supabase/client';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

interface BatchGuidanceVideoProps {
  shotId: string;
  projectId: string;
  videoUrl: string | null;
  videoMetadata: VideoMetadata | null;
  treatment: 'adjust' | 'clip';
  motionStrength: number;
  structureType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  onVideoUploaded: (videoUrl: string | null, metadata: VideoMetadata | null, resourceId?: string) => void;
  onTreatmentChange: (treatment: 'adjust' | 'clip') => void;
  onMotionStrengthChange: (strength: number) => void;
  onStructureTypeChange?: (type: 'uni3c' | 'flow' | 'canny' | 'depth') => void;
  /** Uni3C end percent (only shown when structureType is 'uni3c') */
  uni3cEndPercent?: number;
  onUni3cEndPercentChange?: (value: number) => void;
  imageCount?: number; // Number of images in the batch
  timelineFramePositions?: number[]; // Actual frame positions from timeline
  readOnly?: boolean;
  /** Hide structure type and strength controls (when shown elsewhere like Structure section) */
  hideStructureSettings?: boolean;
}

export const BatchGuidanceVideo: React.FC<BatchGuidanceVideoProps> = ({
  shotId,
  projectId,
  videoUrl,
  videoMetadata,
  treatment,
  motionStrength,
  structureType = 'uni3c',
  onVideoUploaded,
  onTreatmentChange,
  onMotionStrengthChange,
  onStructureTypeChange,
  uni3cEndPercent = 0.1,
  onUni3cEndPercentChange,
  imageCount = 0,
  timelineFramePositions = [],
  readOnly = false,
  hideStructureSettings = false,
}) => {
  // ALL HOOKS MUST BE AT THE TOP - before any conditional returns
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showBrowser, setShowBrowser] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dropZoneRef = React.useRef<HTMLDivElement>(null);
  
  // Resource creation hook
  const createResource = useCreateResource();
  
  // Privacy defaults for new resources
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });
  
  // Video scrubbing hooks (always called, even if not used)
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTimelineFrame, setCurrentTimelineFrame] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);

  // Calculate frame range based on timeline positions
  const minFrame = timelineFramePositions.length > 0 ? Math.min(...timelineFramePositions) : 0;
  const maxFrame = timelineFramePositions.length > 0 ? Math.max(...timelineFramePositions) : 0;
  const timelineFrames = maxFrame - minFrame + 1;
  const totalVideoFrames = videoMetadata?.total_frames || 0;
  
  // Calculate video coverage for clip mode
  const videoCoversFrames = treatment === 'clip' ? Math.min(totalVideoFrames, timelineFrames) : timelineFrames;
  const lastCoveredFrame = treatment === 'clip' ? minFrame + videoCoversFrames - 1 : maxFrame;
  const isFrameBeyondVideoCoverage = treatment === 'clip' && currentTimelineFrame > lastCoveredFrame;
  
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

  // Draw a specific timeline frame to the canvas
  const drawTimelineFrame = useCallback((timelineFrame: number) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !videoMetadata) return;

    // Map timeline frame to video frame based on treatment mode
    let videoFrame: number;
    
    if (treatment === 'adjust') {
      // Adjust mode: stretch/compress entire video to match timeline range
      const timelineRange = maxFrame - minFrame;
      const normalizedPosition = timelineRange > 0 ? (timelineFrame - minFrame) / timelineRange : 0;
      videoFrame = Math.floor(normalizedPosition * (videoMetadata.total_frames - 1));
    } else {
      // Clip mode: 1:1 mapping from timeline start, clamped to video length
      const offsetFromStart = timelineFrame - minFrame;
      videoFrame = Math.min(offsetFromStart, videoMetadata.total_frames - 1);
    }

    const fps = videoMetadata.frame_rate;
    
    // Validate frame_rate to prevent NaN/Infinity errors
    if (!fps || fps <= 0 || !isFinite(fps)) {
      console.error('[BatchGuidanceVideo] Invalid frame_rate:', fps);
      return;
    }
    
    const timeInSeconds = videoFrame / fps;
    
    // Additional safety check for currentTime value
    if (!isFinite(timeInSeconds) || timeInSeconds < 0) {
      console.error('[BatchGuidanceVideo] Invalid time value:', { videoFrame, fps, timeInSeconds });
      return;
    }

    video.currentTime = timeInSeconds;

    const handleSeeked = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      video.removeEventListener('seeked', handleSeeked);
    };

    video.addEventListener('seeked', handleSeeked);
  }, [videoMetadata, treatment, minFrame, maxFrame]);

  // Handle slider change
  const handleFrameChange = useCallback((value: number[]) => {
    const newFrame = value[0];
    setCurrentTimelineFrame(newFrame);
    drawTimelineFrame(newFrame);
  }, [drawTimelineFrame]);

  // Load video and draw initial frame
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const handleLoadedMetadata = () => {
      setIsVideoReady(true);
      drawTimelineFrame(minFrame);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [videoUrl, minFrame, drawTimelineFrame]);

  // Process uploaded file (shared by file input and drag-drop)
  const processFile = async (file: File) => {
    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload an MP4, WebM, or MOV file.');
      return;
    }

    // Validate file size (max 200MB)
    const maxSizeMB = 200;
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      toast.error(`File too large. Maximum size is ${maxSizeMB}MB (file is ${fileSizeMB.toFixed(1)}MB)`);
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Extract metadata
      console.log('[BatchGuidanceVideo] Extracting metadata...');
      const metadata = await extractVideoMetadata(file);
      console.log('[BatchGuidanceVideo] Metadata extracted:', metadata);
      setUploadProgress(25);

      // Upload to storage
      console.log('[BatchGuidanceVideo] Uploading to storage...');
      const uploadedVideoUrl = await uploadVideoToStorage(
        file,
        projectId,
        shotId,
        (progress) => setUploadProgress(25 + (progress * 0.65)) // Map 0-100 to 25-90
      );
      console.log('[BatchGuidanceVideo] Upload complete:', uploadedVideoUrl);
      setUploadProgress(90);

      // Create resource for reuse
      console.log('[BatchGuidanceVideo] Creating resource...');
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const resourceMetadata: StructureVideoMetadata = {
        name: `Guidance Video ${new Date().toLocaleString()}`,
        videoUrl: uploadedVideoUrl,
        thumbnailUrl: null, // Could generate a thumbnail later
        videoMetadata: metadata,
        created_by: {
          is_you: true,
          username: user?.email || 'user',
        },
        is_public: privacyDefaults.resourcesPublic,
        createdAt: now,
      };
      
      const resource = await createResource.mutateAsync({
        type: 'structure-video',
        metadata: resourceMetadata,
      });
      console.log('[BatchGuidanceVideo] Resource created:', resource.id);
      setUploadProgress(100);

      // Notify parent with resource ID
      onVideoUploaded(uploadedVideoUrl, metadata, resource.id);
    } catch (error) {
      console.error('[BatchGuidanceVideo] Upload failed:', error);
      toast.error(`Failed to upload video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) {
      setIsDragging(true);
    }
  }, [isUploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isUploading) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  }, [isUploading, processFile]);

  const handleRemoveVideo = () => {
    onVideoUploaded(null, null, undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle selecting a video from the browser
  const handleResourceSelect = useCallback((resource: Resource) => {
    const metadata = resource.metadata as StructureVideoMetadata;
    console.log('[BatchGuidanceVideo] Resource selected from browser:', {
      resourceId: resource.id,
      videoUrl: metadata.videoUrl,
      metadata: metadata.videoMetadata,
    });
    onVideoUploaded(metadata.videoUrl, metadata.videoMetadata, resource.id);
    setShowBrowser(false);
  }, [onVideoUploaded]);

  if (!videoUrl) {
    // Upload prompt - responsive width with drag-drop support
    return (
      <>
        <div className="mb-4">
          <div 
            ref={dropZoneRef}
            className={`w-full sm:w-2/3 md:w-1/2 lg:w-1/3 p-4 border-2 border-dashed rounded-lg transition-colors ${
              isDragging 
                ? 'border-primary bg-primary/10' 
                : 'border-border bg-muted/20 hover:border-muted-foreground/50'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <Video className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-xs text-muted-foreground">
                {isDragging 
                  ? 'Drop video here' 
                  : 'Add a motion guidance video to control the animation'}
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
                id={`batch-video-upload-${shotId}`}
              />
              
              <div className="flex gap-2 w-full">
                <Label htmlFor={`batch-video-upload-${shotId}`} className="m-0 cursor-pointer flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUploading}
                    className="w-full"
                    asChild
                  >
                    <span>
                      {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : 'Upload'}
                    </span>
                  </Button>
                </Label>
                
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => setShowBrowser(true)}
                  className="flex-1"
                >
                  <Images className="h-4 w-4 mr-1" />
                  Browse
                </Button>
              </div>
              
              {isUploading && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.round(uploadProgress)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        
        <DatasetBrowserModal
          isOpen={showBrowser}
          onOpenChange={setShowBrowser}
          resourceType="structure-video"
          title="Browse Guidance Videos"
          onResourceSelect={handleResourceSelect}
        />
      </>
    );
  }

  // Video display with settings
  return (
    <div className="mb-4">
      <div className="border rounded-lg overflow-hidden bg-background">
        <div className="flex flex-col md:flex-row">
        {/* Video preview - top on mobile, left third on desktop */}
        <div className="w-full md:w-1/3 relative bg-black aspect-video flex-shrink-0 flex flex-col">
          {/* Hidden video element for seeking */}
          <video
            ref={videoRef}
            src={videoUrl}
            preload="metadata"
            className="hidden"
            muted
          />
          
          {/* Canvas to display current frame */}
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
          />
          
          {/* Overlay message when beyond video coverage */}
          {isFrameBeyondVideoCoverage && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/80 text-white px-4 py-3 rounded-lg text-center max-w-[80%]">
                <p className="text-sm font-medium">
                  The guidance video only covers {videoCoversFrames} frame{videoCoversFrames === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-white/70 mt-1">
                  (frames {minFrame}-{lastCoveredFrame})
                </p>
              </div>
            </div>
          )}
          
          {/* Frame scrubber at bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-2 space-y-1">
            <div className="flex items-center justify-between text-xs text-white/80">
              <span>Timeline Frame: {currentTimelineFrame}</span>
              <span>{minFrame} - {maxFrame}</span>
            </div>
            <Slider
              value={[currentTimelineFrame]}
              onValueChange={handleFrameChange}
              min={minFrame}
              max={maxFrame}
              step={1}
              className="w-full"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Remove Video button - below video on mobile only */}
        <div className="md:hidden p-3 border-t">
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleRemoveVideo}
            >
              <X className="h-4 w-4 mr-2" />
              Remove Video
            </Button>
          )}
        </div>

        {/* Settings panel - below on mobile, right two thirds on desktop */}
        <div className="flex-1 p-4 bg-muted/20 flex flex-col gap-4">
          {/* Treatment mode */}
          <div className="space-y-2">
            <Label className="text-sm">How would you like to cut the guidance video to match the timeline?</Label>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-shrink-0 w-full md:w-[200px]">
<Select value={treatment} onValueChange={onTreatmentChange} disabled={readOnly}>
                  <SelectTrigger variant="retro" size="sm" className="h-9 w-full">
                    <SelectValue>
                      {treatment === 'adjust'
                        ? (totalVideoFrames > timelineFrames ? 'Compress' : totalVideoFrames < timelineFrames ? 'Stretch' : 'Match') + ' to timeline'
                        : 'Use video as is'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent variant="retro">
                    <SelectItem variant="retro" value="adjust">
                      {totalVideoFrames > timelineFrames ? 'Compress' : totalVideoFrames < timelineFrames ? 'Stretch' : 'Match'} to timeline
                    </SelectItem>
                    <SelectItem variant="retro" value="clip">
                      Use video as is
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 text-xs text-muted-foreground leading-relaxed">
                {treatment === 'adjust' ? adjustModeDescription : clipModeDescription}
              </div>
            </div>
          </div>

          {/* Motion strength - hidden when shown elsewhere (like Structure section) */}
          {!hideStructureSettings && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Motion strength and End Percent (uni3c hardcoded) */}
              <div className="space-y-4">
                {/* Strength slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Strength:</Label>
                    <span className="text-sm font-medium">{motionStrength.toFixed(1)}x</span>
                  </div>
                  <Slider
                    value={[motionStrength]}
                    onValueChange={([value]) => onMotionStrengthChange(value)}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                    disabled={readOnly}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0x</span>
                    <span>1x</span>
                    <span>2x</span>
                  </div>
                </div>

                {/* Uni3C End Percent - shown below strength when uni3c is selected */}
                {structureType === 'uni3c' && onUni3cEndPercentChange && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">End Percent:</Label>
                      <span className="text-sm font-medium">{(uni3cEndPercent * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[uni3cEndPercent]}
                      onValueChange={([value]) => onUni3cEndPercentChange(value)}
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-full"
                      disabled={readOnly}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Delete button at bottom - desktop only */}
          <div className="mt-auto pt-2 hidden md:block">
            {!readOnly && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleRemoveVideo}
              >
                <X className="h-4 w-4 mr-2" />
                Remove Video
              </Button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

