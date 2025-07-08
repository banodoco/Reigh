import { useState, useRef, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Textarea } from '@/shared/components/ui/textarea';
import { TrainingDataVideo, TrainingDataSegment } from '../hooks/useTrainingData';
import { useTrainingData } from '../hooks/useTrainingData';
import { Play, Pause, RotateCcw, Scissors, Trash2, Clock, Plus, Video } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/shared/components/ui/alert-dialog';

interface VideoSegmentEditorProps {
  video: TrainingDataVideo;
  segments: TrainingDataSegment[];
  onCreateSegment: (videoId: string, startTime: number, endTime: number, description?: string) => Promise<string>;
  onDeleteSegment: (segmentId: string) => void;
}

export function VideoSegmentEditor({ video, segments, onCreateSegment, onDeleteSegment }: VideoSegmentEditorProps) {
  const { getVideoUrl, updateSegment } = useTrainingData();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(10);
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleTimeUpdate = () => {
      setCurrentTime(videoElement.currentTime);
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, []);

  const togglePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seekTo = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const setCurrentAsStart = () => {
    setStartTime(currentTime);
    if (endTime <= currentTime) {
      setEndTime(Math.min(currentTime + 10, duration));
    }
  };

  const setCurrentAsEnd = () => {
    setEndTime(currentTime);
    if (startTime >= currentTime) {
      setStartTime(Math.max(currentTime - 10, 0));
    }
  };

  const previewSegment = () => {
    if (!videoRef.current) return;
    
    seekTo(startTime);
    videoRef.current.play();
    setIsPlaying(true);

    // Stop at end time
    const checkTime = () => {
      if (videoRef.current && videoRef.current.currentTime >= endTime) {
        videoRef.current.pause();
        setIsPlaying(false);
        return;
      }
      if (isPlaying) {
        requestAnimationFrame(checkTime);
      }
    };
    
    requestAnimationFrame(checkTime);
  };

  const handleCreateSegment = async () => {
    if (startTime >= endTime) {
      toast.error('End time must be after start time');
      return;
    }

    setIsCreating(true);
    try {
      await onCreateSegment(video.id, startTime * 1000, endTime * 1000, description);
      setDescription('');
      toast.success('Segment created successfully');
    } catch (error) {
      toast.error('Failed to create segment');
    } finally {
      setIsCreating(false);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  };

  const formatDuration = (ms: number) => {
    const seconds = ms / 1000;
    return formatTime(seconds);
  };

  const handleDeleteSegment = (segmentId: string) => {
    onDeleteSegment(segmentId);
    toast.success('Segment deleted');
  };

  const handleEditSegment = (segment: TrainingDataSegment) => {
    setEditingSegment(segment.id);
    setStartTime(segment.startTime / 1000);
    setEndTime(segment.endTime / 1000);
    setDescription(segment.description || '');
  };

  const handleUpdateSegment = async () => {
    if (!editingSegment) return;

    try {
      await updateSegment(editingSegment, {
        startTime: startTime * 1000,
        endTime: endTime * 1000,
        description,
      });
      setEditingSegment(null);
      setDescription('');
      toast.success('Segment updated successfully');
    } catch (error) {
      toast.error('Failed to update segment');
    }
  };

  const cancelEdit = () => {
    setEditingSegment(null);
    setDescription('');
    setStartTime(0);
    setEndTime(10);
  };

  return (
    <div className="space-y-6">
      {/* Video Player */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Video Player</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              {getVideoUrl(video) ? (
                <video
                  ref={videoRef}
                  src={getVideoUrl(video)}
                  className="w-full h-full object-contain"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                                  onError={(e) => {
                  const videoElement = e.target as HTMLVideoElement;
                  console.error('[VideoSegmentEditor] Video load error:', {
                    videoId: video.id,
                    filename: video.originalFilename,
                    src: videoElement.src,
                    error: e,
                    networkState: videoElement.networkState,
                    readyState: videoElement.readyState,
                    currentSrc: videoElement.currentSrc
                  });
                }}
                onLoadStart={(e) => {
                  console.log('[VideoSegmentEditor] Video load started:', {
                    videoId: video.id,
                    filename: video.originalFilename,
                    src: (e.target as HTMLVideoElement).src
                  });
                }}
                onLoadedMetadata={(e) => {
                  const videoElement = e.target as HTMLVideoElement;
                  console.log('[VideoSegmentEditor] Video metadata loaded:', {
                    videoId: video.id,
                    filename: video.originalFilename,
                    duration: videoElement.duration
                  });
                  setDuration(videoElement.duration);
                  setEndTime(Math.min(10, videoElement.duration));
                }}
                  controls={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center text-white">
                    <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">Loading video...</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Video Controls */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePlayPause}
                  className="flex items-center gap-1"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => seekTo(0)}
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>
              
              {/* Timeline */}
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max={duration}
                  step="0.1"
                  value={currentTime}
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                
                {/* Segment markers */}
                {segments.map((segment) => {
                  const startPercent = (segment.startTime / 1000 / duration) * 100;
                  const endPercent = (segment.endTime / 1000 / duration) * 100;
                  return (
                    <div
                      key={segment.id}
                      className="absolute top-0 h-2 bg-primary/60 rounded"
                      style={{
                        left: `${startPercent}%`,
                        width: `${endPercent - startPercent}%`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Segment Creator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            {editingSegment ? 'Edit Segment' : 'Create Segment'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start-time">Start Time (seconds)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="start-time"
                    type="number"
                    value={startTime.toFixed(1)}
                    onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                    step="0.1"
                    min="0"
                    max={duration}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={setCurrentAsStart}
                  >
                    Use Current
                  </Button>
                </div>
              </div>
              
              <div>
                <Label htmlFor="end-time">End Time (seconds)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="end-time"
                    type="number"
                    value={endTime.toFixed(1)}
                    onChange={(e) => setEndTime(parseFloat(e.target.value) || 0)}
                    step="0.1"
                    min="0"
                    max={duration}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={setCurrentAsEnd}
                  >
                    Use Current
                  </Button>
                </div>
              </div>
            </div>
            
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this segment..."
                rows={2}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={previewSegment}
                variant="outline"
                className="flex items-center gap-1"
              >
                <Play className="h-4 w-4" />
                Preview Segment
              </Button>
              
              <Badge variant="secondary">
                Duration: {formatTime(endTime - startTime)}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {editingSegment ? (
                <>
                  <Button
                    onClick={handleUpdateSegment}
                    disabled={isCreating}
                    className="flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Update Segment
                  </Button>
                  <Button
                    onClick={cancelEdit}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleCreateSegment}
                  disabled={isCreating}
                  className="flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  {isCreating ? 'Creating...' : 'Create Segment'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Segments List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Segments ({segments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {segments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Scissors className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No segments created yet</p>
              <p className="text-sm">Create your first segment using the controls above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {segments.map((segment) => (
                <div
                  key={segment.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">
                        {formatDuration(segment.startTime)} - {formatDuration(segment.endTime)}
                      </Badge>
                      <Badge variant="secondary">
                        {formatDuration(segment.endTime - segment.startTime)}
                      </Badge>
                    </div>
                    {segment.description && (
                      <p className="text-sm text-muted-foreground">
                        {segment.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(segment.createdAt).toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditSegment(segment)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        seekTo(segment.startTime / 1000);
                        previewSegment();
                      }}
                    >
                      Preview
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Segment</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this segment? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteSegment(segment.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 