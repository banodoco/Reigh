import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Video, Trash2, Clock, FileText } from 'lucide-react';
import { TrainingDataVideo } from '../hooks/useTrainingData';
import { useTrainingData } from '../hooks/useTrainingData';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/shared/components/ui/alert-dialog';

interface VideoUploadListProps {
  videos: TrainingDataVideo[];
  selectedVideo: string | null;
  onVideoSelect: (videoId: string) => void;
}

export function VideoUploadList({ videos, selectedVideo, onVideoSelect }: VideoUploadListProps) {
  const { deleteVideo, getVideoUrl } = useTrainingData();
  const [deletingVideo, setDeletingVideo] = useState<string | null>(null);

  const handleDeleteVideo = async (videoId: string) => {
    setDeletingVideo(videoId);
    try {
      await deleteVideo(videoId);
    } finally {
      setDeletingVideo(null);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (videos.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No videos uploaded yet</p>
        <p className="text-sm">Upload some videos to get started</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {videos.map((video) => (
        <Card
          key={video.id}
          className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
            selectedVideo === video.id 
              ? 'ring-2 ring-primary shadow-lg' 
              : 'hover:shadow-md'
          }`}
          onClick={() => onVideoSelect(video.id)}
        >
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Video thumbnail/preview */}
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                {getVideoUrl(video) ? (
                  <video
                    src={getVideoUrl(video)}
                    className="w-full h-full object-cover"
                    preload="metadata"
                    onError={(e) => {
                      const videoElement = e.target as HTMLVideoElement;
                      console.error('[VideoUploadList] Video load error:', {
                        videoId: video.id,
                        filename: video.originalFilename,
                        src: videoElement.src,
                        error: e,
                        networkState: videoElement.networkState,
                        readyState: videoElement.readyState,
                        currentSrc: videoElement.currentSrc
                      });
                      // Fallback to placeholder
                      videoElement.style.display = 'none';
                    }}
                    onLoadStart={(e) => {
                      console.log('[VideoUploadList] Video load started:', {
                        videoId: video.id,
                        filename: video.originalFilename,
                        src: (e.target as HTMLVideoElement).src
                      });
                    }}
                    onLoadedMetadata={(e) => {
                      console.log('[VideoUploadList] Video metadata loaded:', {
                        videoId: video.id,
                        filename: video.originalFilename,
                        duration: (e.target as HTMLVideoElement).duration
                      });
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <div className="text-center">
                      <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-muted-foreground">Loading...</p>
                    </div>
                  </div>
                )}
                {/* Play icon overlay */}
                {getVideoUrl(video) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Video className="h-8 w-8 text-white opacity-80" />
                  </div>
                )}
              </div>

              {/* Video info */}
              <div className="space-y-2">
                <h3 className="font-medium text-sm truncate" title={video.originalFilename}>
                  {video.originalFilename}
                </h3>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatDuration(video.duration)}</span>
                  
                  {video.metadata?.size && (
                    <>
                      <span>•</span>
                      <FileText className="h-3 w-3" />
                      <span>{formatFileSize(video.metadata.size)}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Uploaded: {new Date(video.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <Badge variant={selectedVideo === video.id ? 'default' : 'secondary'}>
                  {selectedVideo === video.id ? 'Selected' : 'Click to select'}
                </Badge>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Video</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{video.originalFilename}"? 
                        This will also delete all associated segments and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteVideo(video.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deletingVideo === video.id}
                      >
                        {deletingVideo === video.id ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 