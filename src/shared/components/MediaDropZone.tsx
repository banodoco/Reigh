import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Upload, Film, Play, X, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useUserPreferences } from '@/shared/hooks/useUserPreferences';

// Media container skeleton loader
const MediaContainerSkeleton: React.FC = () => (
  <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted animate-pulse">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
  </div>
);

// Upload loading state
const UploadingMediaState: React.FC<{ type: 'image' | 'video' }> = ({ type }) => (
  <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-muted/50 backdrop-blur-sm">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3"></div>
    <p className="text-sm font-medium text-foreground">
      Uploading {type === 'image' ? 'image' : 'video'}...
    </p>
  </div>
);

export interface MediaDropZoneProps {
  type: 'image' | 'video';
  label: string;
  mediaUrl?: string | null;
  posterUrl?: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
  isUploading?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  acceptedFormats?: string;
  emptyStateIcon?: React.ReactNode;
  emptyStateText?: string;
  settingsLoaded?: boolean;
  className?: string;
}

/**
 * Reusable media drop zone component for images and videos
 * Features:
 * - Drag and drop support with file type validation
 * - Video poster frames with play button
 * - Sound control with app-level preference storage
 * - Delete/replace functionality
 * - Loading states and skeleton screens
 */
export const MediaDropZone: React.FC<MediaDropZoneProps> = ({
  type,
  label,
  mediaUrl,
  posterUrl,
  onUpload,
  onRemove,
  isUploading = false,
  isLoading = false,
  disabled = false,
  acceptedFormats,
  emptyStateIcon,
  emptyStateText,
  settingsLoaded = true,
  className = '',
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const { preferences, setVideoSoundEnabled } = useUserPreferences();
  const [localMuted, setLocalMuted] = useState(!preferences.videoSoundEnabled);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync local muted state with global preference
  useEffect(() => {
    setLocalMuted(!preferences.videoSoundEnabled);
  }, [preferences.videoSoundEnabled]);

  // Track scroll state to prevent drag conflicts
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);
      const timer = setTimeout(() => setIsScrolling(false), 200);
      return () => clearTimeout(timer);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Add timeout fallback for media loading on mobile
  useEffect(() => {
    if (mediaUrl && !mediaLoaded) {
      const timer = setTimeout(() => {
        setMediaLoaded(true);
      }, type === 'image' ? 2000 : 3000);
      return () => clearTimeout(timer);
    }
  }, [mediaUrl, mediaLoaded, type]);

  // Reset loaded state when media changes
  useEffect(() => {
    setMediaLoaded(false);
    setIsPlaying(false);
  }, [mediaUrl]);

  // Prevent autoplay on mobile browsers for videos
  useEffect(() => {
    const video = videoRef.current;
    if (video && type === 'video') {
      const preventPlay = () => video.pause();
      video.addEventListener('play', preventPlay);
      video.pause();
      return () => video.removeEventListener('play', preventPlay);
    }
  }, [mediaUrl, type]);

  // Get accepted file types
  const getAcceptedTypes = () => {
    if (acceptedFormats) return acceptedFormats;
    return type === 'image' ? 'image/png,image/jpeg,image/jpg' : 'video/*';
  };

  const getAcceptedMimeTypes = () => {
    if (type === 'image') return ['image/png', 'image/jpeg', 'image/jpg'];
    return ['video/'];
  };

  const validateFile = (file: File): boolean => {
    const acceptedMimes = getAcceptedMimeTypes();
    if (type === 'video') {
      return file.type.startsWith('video/');
    }
    return acceptedMimes.includes(file.type);
  };

  // Handle file upload
  const handleFileSelect = async (file: File) => {
    if (!validateFile(file)) {
      return;
    }
    await onUpload(file);
  };

  // Drag handlers
  const handleDragOver = (e: React.DragEvent) => {
    if (isScrolling || disabled) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (isScrolling || disabled) return;
    e.preventDefault();
    e.stopPropagation();

    // Check if dragged item matches our type
    const items = Array.from(e.dataTransfer.items);
    const hasValidFile = items.some(item => {
      if (item.kind !== 'file') return false;
      if (type === 'image') {
        return ['image/png', 'image/jpeg', 'image/jpg'].includes(item.type);
      }
      return item.type.startsWith('video/');
    });

    if (hasValidFile) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (isScrolling || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we're actually leaving the drop zone
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (isScrolling || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
  };

  // Handle file input change
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
  };

  // Toggle mute and update global preference
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMutedState = !localMuted;
    setLocalMuted(newMutedState);
    setVideoSoundEnabled(!newMutedState);
    
    // Apply to current video if playing
    if (videoRef.current) {
      videoRef.current.muted = newMutedState;
    }
  };

  const defaultEmptyText = type === 'image' 
    ? 'No input image'
    : 'No input video';

  const defaultAcceptedText = type === 'image'
    ? 'PNG, JPG supported'
    : 'MP4, WebM, MOV supported';

  return (
    <div className={cn('space-y-3', className)}>
      <div className="text-lg font-medium">{label}</div>
      
      <div
        className={cn(
          'aspect-video bg-muted rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors relative',
          isDraggingOver && 'border-primary bg-primary/10',
          !isDraggingOver && 'border-border hover:border-primary/50',
          !mediaUrl && !isUploading && !disabled && 'cursor-pointer'
        )}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !mediaUrl && !isUploading && !disabled && fileInputRef.current?.click()}
      >
        {isUploading || isLoading ? (
          <UploadingMediaState type={type} />
        ) : mediaUrl ? (
          <>
            {!mediaLoaded && <MediaContainerSkeleton />}
            
            {/* Image display */}
            {type === 'image' && (
              <img
                src={mediaUrl}
                alt="Input media"
                className={cn(
                  'absolute inset-0 w-full h-full object-contain transition-opacity duration-300',
                  mediaLoaded ? 'opacity-100' : 'opacity-0'
                )}
                onLoad={() => setMediaLoaded(true)}
                onLoadStart={() => setMediaLoaded(true)}
              />
            )}

            {/* Video display with poster */}
            {type === 'video' && (
              <>
                {!isPlaying && posterUrl ? (
                  <>
                    <img
                      src={posterUrl}
                      alt="Video poster"
                      className={cn(
                        'absolute inset-0 w-full h-full object-contain transition-opacity duration-300 z-0',
                        mediaLoaded ? 'opacity-100' : 'opacity-0'
                      )}
                      onLoad={() => setMediaLoaded(true)}
                    />
                    {/* Play button overlay */}
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/30 transition-colors z-[5]"
                      onClick={() => setIsPlaying(true)}
                    >
                      <div className="bg-black/50 rounded-full p-4 hover:bg-black/70 transition-colors">
                        <Play className="h-12 w-12 text-white" fill="white" />
                      </div>
                    </div>
                  </>
                ) : (
                  <video
                    ref={videoRef}
                    src={mediaUrl}
                    controls
                    autoPlay={isPlaying}
                    preload="metadata"
                    playsInline
                    muted={localMuted}
                    className={cn(
                      'absolute inset-0 w-full h-full object-contain transition-opacity duration-300 z-0',
                      mediaLoaded ? 'opacity-100' : 'opacity-0'
                    )}
                    onLoadedData={() => setMediaLoaded(true)}
                  />
                )}
              </>
            )}

            {/* Delete button */}
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg z-10"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              disabled={disabled || isUploading}
            >
              <X className="h-4 w-4" />
            </Button>

            {/* Sound toggle for video */}
            {type === 'video' && isPlaying && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 left-2 h-8 w-8 rounded-full shadow-lg z-10"
                onClick={handleToggleMute}
                title={localMuted ? 'Unmute (applies to all videos)' : 'Mute (applies to all videos)'}
              >
                {localMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Drop to replace overlay */}
            {isDraggingOver && !isScrolling && (
              <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none z-20">
                <p className="text-lg font-medium text-foreground">Drop to replace</p>
              </div>
            )}
          </>
        ) : !settingsLoaded ? (
          <MediaContainerSkeleton />
        ) : (
          <div className="text-center p-6 pointer-events-none">
            {emptyStateIcon || <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />}
            <p className="text-sm text-muted-foreground mb-2">
              {isDraggingOver ? `Drop ${type} here` : 'Drag & drop or click to upload'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isDraggingOver ? '' : (acceptedFormats || defaultAcceptedText)}
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptedTypes()}
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {mediaUrl && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="w-full"
        >
          <Upload className="h-4 w-4 mr-2" />
          Replace {type === 'image' ? 'Image' : 'Video'}
        </Button>
      )}
    </div>
  );
};

