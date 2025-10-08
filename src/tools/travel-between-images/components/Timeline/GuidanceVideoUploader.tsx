import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Video } from 'lucide-react';
import { toast } from 'sonner';
import { uploadVideoToStorage, extractVideoMetadata, VideoMetadata } from '@/shared/lib/videoUploader';

interface GuidanceVideoUploaderProps {
  shotId: string;
  projectId: string;
  onVideoUploaded: (videoUrl: string | null, metadata: VideoMetadata | null) => void;
  currentVideoUrl?: string | null;
  compact?: boolean; // When true, only shows the upload button (no empty state placeholder)
  // Zoom controls (only used in full mode)
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onZoomToStart?: () => void;
}

export const GuidanceVideoUploader: React.FC<GuidanceVideoUploaderProps> = ({
  shotId,
  projectId,
  onVideoUploaded,
  currentVideoUrl,
  compact = false,
  zoomLevel = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToStart
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
      
      // 1. Extract metadata
      console.log('[GuidanceVideo] Extracting metadata...');
      const metadata = await extractVideoMetadata(file);
      console.log('[GuidanceVideo] Metadata extracted:', metadata);
      setUploadProgress(25);
      
      // 2. Upload to storage
      console.log('[GuidanceVideo] Uploading to storage...');
      const videoUrl = await uploadVideoToStorage(file, projectId);
      console.log('[GuidanceVideo] Upload complete:', videoUrl);
      setUploadProgress(100);
      
      // 3. Notify parent
      onVideoUploaded(videoUrl, metadata);
    } catch (error) {
      console.error('[GuidanceVideo] Upload failed:', error);
      toast.error(`Failed to upload video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveVideo = () => {
    onVideoUploaded(null, null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  if (currentVideoUrl) {
    // Don't show uploader if video is already uploaded (settings are in the strip)
    return null;
  }

  // Compact mode: just the upload button (for top-right corner)
  if (compact) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleFileSelect}
          disabled={isUploading}
          className="hidden"
          id={`video-upload-${shotId}`}
        />
        <Label htmlFor={`video-upload-${shotId}`} className="m-0 cursor-pointer">
          <Button
            variant="outline"
            size="sm"
            disabled={isUploading}
            className="h-6 text-[10px] px-2 py-0"
            asChild
          >
            <span className="flex items-center gap-1.5">
              <Video className="h-3 w-3" />
              {isUploading ? `${uploadProgress}%` : 'Upload guidance video'}
            </span>
          </Button>
        </Label>
      </>
    );
  }

  // Full mode: placeholder strip with centered message (for empty state)
  return (
    <div className="relative w-full">
      {/* Placeholder strip with controls overlaid */}
      <div className="relative h-28 bg-gradient-to-b from-muted/30 to-muted/10 border-l border-r border-t rounded-t overflow-hidden mb-0">
        {/* Controls bar at top - zoom on left, upload on right */}
        <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between gap-2">
          {/* Left: Zoom controls */}
          {onZoomIn && onZoomOut && onZoomReset && onZoomToStart && (
            <div className="flex items-center gap-2 bg-background/95 backdrop-blur-sm px-2 py-1 rounded shadow-md border border-border/50">
              <span className="text-xs text-muted-foreground">Zoom: {zoomLevel.toFixed(1)}x</span>
              <Button
                variant="outline"
                size="sm"
                onClick={onZoomToStart}
                className="h-7 text-xs px-2"
              >
                ← Start
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onZoomOut}
                disabled={zoomLevel <= 1}
                className="h-7 w-7 p-0"
              >
                −
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onZoomIn}
                className="h-7 w-7 p-0"
              >
                +
              </Button>
              <Button
                variant={zoomLevel > 1.5 ? "default" : "outline"}
                size="sm"
                onClick={onZoomReset}
                disabled={zoomLevel <= 1}
                className={`h-7 text-xs px-2 transition-all ${
                  zoomLevel > 3 ? 'animate-pulse ring-2 ring-primary' : 
                  zoomLevel > 1.5 ? 'ring-1 ring-primary/50' : ''
                }`}
                style={{
                  transform: zoomLevel > 1.5 ? `scale(${Math.min(1 + (zoomLevel - 1.5) * 0.08, 1.3)})` : 'scale(1)',
                }}
              >
                Reset
              </Button>
            </div>
          )}

          {/* Right: Upload button */}
          <div className="flex items-center gap-1.5 bg-background/95 backdrop-blur-sm px-2 py-1 rounded shadow-md border border-border/50">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="hidden"
              id={`video-upload-${shotId}`}
            />
            <Label htmlFor={`video-upload-${shotId}`} className="m-0 cursor-pointer">
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading}
                className="h-6 text-[10px] px-2 py-0"
                asChild
              >
                <span className="flex items-center gap-1.5">
                  <Video className="h-3 w-3" />
                  {isUploading ? 'Uploading...' : 'Upload guidance video'}
                </span>
              </Button>
            </Label>
          </div>
        </div>

        {/* Center message */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Video className="h-10 w-10 text-muted-foreground/30" />
          <span className="text-xs text-muted-foreground">
            {isUploading ? `Uploading... ${uploadProgress}%` : 'Add a motion guidance video to control the animation'}
          </span>
          {isUploading && (
            <div className="w-48 bg-muted rounded-full h-1.5">
              <div 
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

