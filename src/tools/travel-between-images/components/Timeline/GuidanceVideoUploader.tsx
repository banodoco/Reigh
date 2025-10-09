import React, { useRef, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Upload, Video, ZoomIn, ZoomOut, RotateCcw, AlignStartHorizontal } from 'lucide-react';
import { uploadVideoToStorage, extractVideoMetadata, type VideoMetadata } from '@/shared/lib/videoUploader';
import { toast } from 'sonner';

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
      
      toast.success('Video uploaded successfully');
      
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
    <div className="relative flex items-center justify-between p-2 bg-muted/20 rounded-lg border border-dashed border-border">
      <div className="flex items-center gap-3 flex-1">
        <Video className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">
            {currentVideoUrl ? 'Replace guidance video' : 'Add guidance video to control motion'}
          </p>
          {isUploading && (
            <div className="mt-2">
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomOut}
            disabled={isUploading}
            className="h-8 w-8 p-0"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomIn}
            disabled={isUploading}
            className="h-8 w-8 p-0"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomReset}
            disabled={isUploading}
            className="h-8 w-8 p-0"
            title="Reset zoom"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomToStart}
            disabled={isUploading}
            className="h-8 w-8 p-0"
            title="Zoom to start"
          >
            <AlignStartHorizontal className="h-4 w-4" />
          </Button>
        </div>

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
            asChild
          >
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {isUploading ? 'Uploading...' : currentVideoUrl ? 'Replace' : 'Upload'}
            </span>
          </Button>
        </Label>
      </div>
    </div>
  );
};
