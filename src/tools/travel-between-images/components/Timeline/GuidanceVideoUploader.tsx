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
    <div className="relative w-full">
      {/* Fixed controls bar at top - sticky to stay in place when scrolling */}
      <div 
        className="sticky left-0 z-20 flex items-center justify-between gap-2 pointer-events-none px-8 py-2"
        style={{ top: 0 }}
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

        {/* Right: Upload button - styled to match Add Images button */}
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

      {/* Placeholder strip */}
      <div 
        className="relative h-28 mb-0"
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          overflow: 'visible',
        }}
      >
        {/* Center message */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Video className="h-10 w-10 text-muted-foreground/30" />
          <span className="text-xs text-muted-foreground">
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
    </div>
  );
};
