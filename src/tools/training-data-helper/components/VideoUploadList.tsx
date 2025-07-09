import { useState, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Video, Trash2, Clock, FileText, Scissors } from 'lucide-react';
import { TrainingDataVideo, TrainingDataSegment } from '../hooks/useTrainingData';
import { useTrainingData } from '../hooks/useTrainingData';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/shared/components/ui/alert-dialog';
import { cropFilename } from '@/shared/lib/utils';
import { formatDistanceToNow, isValid } from 'date-fns';

// Helper to abbreviate distance strings (e.g., "5 minutes ago" -> "5 mins ago")
const abbreviateDistance = (str: string) => {
  // Handle "less than a minute ago" special case
  if (str.includes('less than a minute')) {
    return '<1 min ago';
  }
  
  return str
    .replace(/1 minutes ago/, '1 min ago')
    .replace(/1 hours ago/, '1 hr ago')
    .replace(/1 seconds ago/, '1 sec ago')
    .replace(/1 days ago/, '1 day ago')
    .replace(/minutes?/, 'mins')
    .replace(/hours?/, 'hrs')
    .replace(/seconds?/, 'secs')
    .replace(/days?/, 'days');
};

interface VideoUploadListProps {
  videos: TrainingDataVideo[];
  selectedVideo: string | null;
  onVideoSelect: (videoId: string) => void;
  segments: TrainingDataSegment[];
}

export function VideoUploadList({ videos, selectedVideo, onVideoSelect, segments }: VideoUploadListProps) {
  const { deleteVideo, getVideoUrl } = useTrainingData();
  const [deletingVideo, setDeletingVideo] = useState<string | null>(null);



  // Helper function to get segment count for a video
  const getSegmentCount = (videoId: string) => {
    return segments.filter(segment => segment.trainingDataId === videoId).length;
  };

  const handleDeleteVideo = async (videoId: string) => {
    setDeletingVideo(videoId);
    try {
      await deleteVideo(videoId);
      // The video should disappear immediately due to optimistic updates in useTrainingData
      // If the selected video was deleted, clear the selection
      if (selectedVideo === videoId) {
        onVideoSelect('');
      }
    } catch (error) {
      console.error('Failed to delete video:', error);
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
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
                      // Hide failed video element
                      videoElement.style.display = 'none';
                    }}
                    onLoadStart={() => {
                      // Video loading started
                    }}
                    onLoadedMetadata={() => {
                      // Video metadata loaded
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <div className="text-center">
                      <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-muted-foreground">
                        {getVideoUrl(video) === '' ? 'Video not available' : 'Loading...'}
                      </p>
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
                  {cropFilename(video.originalFilename)}
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
                  <span>Uploaded: {(() => {
                    const date = new Date(video.createdAt);
                    if (!isValid(date)) return 'Unknown';
                    return abbreviateDistance(formatDistanceToNow(date, { addSuffix: true }));
                  })()}</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Scissors className="h-3 w-3" />
                  <span>{getSegmentCount(video.id)} segment{getSegmentCount(video.id) !== 1 ? 's' : ''}</span>
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
                        Are you sure you want to delete "{cropFilename(video.originalFilename)}"? 
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