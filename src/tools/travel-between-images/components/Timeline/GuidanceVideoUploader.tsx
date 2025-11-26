import React, { useRef, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Upload, Video, ZoomIn, ZoomOut, RotateCcw, AlignStartHorizontal } from 'lucide-react';
import { uploadVideoToStorage, extractVideoMetadata, type VideoMetadata } from '@/shared/lib/videoUploader';
import { toast } from 'sonner';
import { TIMELINE_HORIZONTAL_PADDING } from './constants';

interface GuidanceVideoUploaderProps {
  shotId: string;
  projectId: string;
  onVideoUploaded: (videoUrl: string | null, metadata: VideoMetadata | null) => void;
  currentVideoUrl: string | null;
  compact?: boolean;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomToStart: () => void;
  hasNoImages?: boolean;
}

export const GuidanceVideoUploader: React.FC<GuidanceVideoUploaderProps> = ({
  shotId,
  projectId,
  onVideoUploaded,
  currentVideoUrl,
  compact = false,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToStart,
  hasNoImages = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Extract metadata first
      const metadata = await extractVideoMetadata(file);
      
      // Upload video
      const videoUrl = await uploadVideoToStorage(
        file,
        projectId,
        shotId,
        (progress) => setUploadProgress(progress)
      );

      onVideoUploaded(videoUrl, metadata);
      
      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      toast.error('Failed to upload video');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <>
      {/* Fixed top controls - rendered outside the zoomed content */}
      {/* Note: px-3 because the scroll container already has px-5, totaling px-8 to match bottom controls */}
      <div 
        className="sticky top-2 left-0 right-0 z-30 flex items-center justify-between pointer-events-none px-3 mb-2"
      >
        {/* Left: Zoom controls */}
        <div className={`flex items-center gap-2 pointer-events-auto bg-background/95 backdrop-blur-sm px-2 py-1 rounded shadow-md border border-border/50 ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}>
          <span className="text-xs text-muted-foreground">Zoom: {zoomLevel.toFixed(1)}x</span>
          <Button
            variant="outline"
            size="sm"
            onClick={onZoomToStart}
            disabled={isUploading}
            className="h-7 text-xs px-2"
          >
            ← Start
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onZoomOut}
            disabled={zoomLevel <= 1 || isUploading}
            className="h-7 w-7 p-0"
          >
            −
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onZoomIn}
            disabled={isUploading}
            className="h-7 w-7 p-0"
          >
            +
          </Button>
          <Button
            variant={zoomLevel > 1.5 ? "default" : "outline"}
            size="sm"
            onClick={onZoomReset}
            disabled={zoomLevel <= 1 || isUploading}
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

        {/* Right: Upload button */}
        <div className={`pointer-events-auto ${hasNoImages ? 'opacity-30 blur-[0.5px]' : ''}`}>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleFileSelect}
            disabled={isUploading}
            className="hidden"
            id={`guidance-video-upload-${shotId}`}
          />
          <Label htmlFor={`guidance-video-upload-${shotId}`} className="m-0 cursor-pointer">
            <Button
              variant="outline"
              size="sm"
              disabled={isUploading}
              className="h-8 text-xs px-3 sm:px-2 lg:px-3"
              asChild
            >
              <span className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                <span className="sm:hidden lg:inline">Upload Guidance Video</span>
              </span>
            </Button>
          </Label>
        </div>
      </div>

      {/* Placeholder strip - this zooms with content */}
      <div 
        className="relative h-20 mb-0"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          overflow: 'visible',
        }}
      >
        {/* Center message - fixed position, doesn't zoom */}
        <div 
          className="flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{
            position: 'sticky',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'fit-content',
          }}
        >
          <Video className="h-8 w-8 text-muted-foreground/30" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {isUploading ? `Uploading... ${uploadProgress}%` : 'Add guidance video to control motion'}
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
    </>
  );
};
