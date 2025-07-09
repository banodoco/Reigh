import { useState, useRef, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Textarea } from '@/shared/components/ui/textarea';
import { TrainingDataVideo, TrainingDataSegment } from '../hooks/useTrainingData';
import { useTrainingData } from '../hooks/useTrainingData';
import { Play, Pause, RotateCcw, Scissors, Trash2, Clock, Plus, Video, SkipBack, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/shared/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';

interface SegmentFramePreviewProps {
  segment: TrainingDataSegment;
  captureFrameAtTime: (timeInSeconds: number) => Promise<string | null>;
  videoReady: boolean;
}

function SegmentFramePreview({ segment, captureFrameAtTime, videoReady }: SegmentFramePreviewProps) {
  const [startFrame, setStartFrame] = useState<string | null>(null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFrames = async () => {
    if (loading || !videoReady) return;
    setLoading(true);
    
    try {
      // Wait for video to be fully ready
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Capture frames one at a time to avoid overwhelming the video element
      const startImg = await captureFrameAtTime(segment.startTime / 1000);
      setStartFrame(startImg);
      
      // Small delay between captures
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const endImg = await captureFrameAtTime(segment.endTime / 1000);
      setEndFrame(endImg);
    } catch (error) {
      console.error('Error loading frames for segment:', segment.id, error);
      // Set to null so fallback UI shows
      setStartFrame(null);
      setEndFrame(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only load frames when video is ready
    if (!videoReady) return;
    
    // Debounce frame loading to avoid overwhelming the video element
    const timeoutId = setTimeout(() => {
      loadFrames();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [segment.id, videoReady]);

  return (
    <div className="flex gap-2 mt-2">
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">Start Frame</div>
        {loading ? (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <div className="text-xs">Loading...</div>
          </div>
        ) : startFrame ? (
          <img
            src={startFrame}
            alt="Start frame"
            className="w-16 h-12 object-cover rounded border shadow-sm"
          />
        ) : (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <Video className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>
      
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">End Frame</div>
        {loading ? (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <div className="text-xs">Loading...</div>
          </div>
        ) : endFrame ? (
          <img
            src={endFrame}
            alt="End frame"
            className="w-16 h-12 object-cover rounded border shadow-sm"
          />
        ) : (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <Video className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}

interface VideoSegmentEditorProps {
  video: TrainingDataVideo;
  segments: TrainingDataSegment[];
  onCreateSegment: (videoId: string, startTime: number, endTime: number, description?: string) => Promise<string>;
  onDeleteSegment: (segmentId: string) => void;
}

export function VideoSegmentEditor({ video, segments, onCreateSegment, onDeleteSegment }: VideoSegmentEditorProps) {
  const { getVideoUrl, updateSegment, markVideoAsInvalid } = useTrainingData();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segmentStartTime, setSegmentStartTime] = useState<number | null>(null);
  const [segmentEndTime, setSegmentEndTime] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [startFrameImage, setStartFrameImage] = useState<string | null>(null);
  const [endFrameImage, setEndFrameImage] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoReady, setVideoReady] = useState(false);

  // Color palette for segments
  const segmentColors = [
    { bg: 'bg-blue-500/60', border: 'border-blue-500' },
    { bg: 'bg-purple-500/60', border: 'border-purple-500' },
    { bg: 'bg-pink-500/60', border: 'border-pink-500' },
    { bg: 'bg-indigo-500/60', border: 'border-indigo-500' },
    { bg: 'bg-cyan-500/60', border: 'border-cyan-500' },
    { bg: 'bg-teal-500/60', border: 'border-teal-500' },
    { bg: 'bg-emerald-500/60', border: 'border-emerald-500' },
    { bg: 'bg-lime-500/60', border: 'border-lime-500' },
    { bg: 'bg-yellow-500/60', border: 'border-yellow-500' },
    { bg: 'bg-orange-500/60', border: 'border-orange-500' },
    { bg: 'bg-red-500/60', border: 'border-red-500' },
    { bg: 'bg-rose-500/60', border: 'border-rose-500' },
  ];

  const getSegmentColor = (index: number) => {
    return segmentColors[index % segmentColors.length];
  };

  // Find segment that contains current time
  const getCurrentSegment = () => {
    const currentTimeMs = currentTime * 1000;
    const segmentIndex = segments.findIndex(segment => 
      currentTimeMs >= segment.startTime && currentTimeMs <= segment.endTime
    );
    return segmentIndex >= 0 ? { segment: segments[segmentIndex], index: segmentIndex } : null;
  };

  const currentSegmentInfo = getCurrentSegment();

  // Sort segments to show current segment first
  const sortedSegments = (() => {
    const currentSegment = currentSegmentInfo?.segment;
    return currentSegment 
      ? [currentSegment, ...segments.filter(s => s.id !== currentSegment.id)]
      : segments;
  })();

  // Function to capture current frame
  const captureCurrentFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      console.warn('Video not ready for frame capture');
      return null;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2D context from canvas');
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL('image/jpeg', 0.8);
      return dataURL;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        console.warn('CORS issue preventing frame capture. Video may be from a different origin.');
        toast.error('Unable to capture frame due to security restrictions. Frame preview disabled.');
      } else {
        console.error('Error capturing frame:', error);
        toast.error('Failed to capture video frame');
      }
      return null;
    }
  };

  // Function to capture frame at specific time (for existing segments)
  const captureFrameAtTime = (timeInSeconds: number): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      
      // More comprehensive video readiness check
      if (!video || 
          !videoReady ||
          !video.videoWidth || 
          !video.videoHeight || 
          video.readyState < 2 || // HAVE_CURRENT_DATA
          video.networkState === 3) { // NETWORK_NO_SOURCE
        // Don't log the warning here since it's expected during initial loading
        resolve(null);
        return;
      }

      // Check if the requested time is within video duration
      if (timeInSeconds > video.duration) {
        resolve(null);
        return;
      }

      const originalTime = video.currentTime;
      let timeoutId: NodeJS.Timeout;
      
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        clearTimeout(timeoutId);
        
        try {
          const frameImage = captureCurrentFrame();
          video.currentTime = originalTime;
          resolve(frameImage);
        } catch (error) {
          console.error('Error during frame capture at time:', timeInSeconds, error);
          video.currentTime = originalTime;
          resolve(null);
        }
      };

      const onError = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        clearTimeout(timeoutId);
        video.currentTime = originalTime;
        resolve(null);
      };

      // Timeout fallback in case seeking hangs
      timeoutId = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        video.currentTime = originalTime;
        resolve(null);
      }, 3000);

      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      video.currentTime = timeInSeconds;
    });
  };

  useEffect(() => {
    const videoElement = videoRef.current;
     if (!videoElement || !videoReady) return;

    const handleTimeUpdate = () => {
      setCurrentTime(videoElement.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);

    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
    };
  }, [videoReady]); // Re-run when video becomes ready

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Prevent default for all our shortcuts to avoid conflicts
      switch (e.key) {
        case '1':
          e.preventDefault();
          e.stopPropagation();
          jumpBackQuarterSecond();
          break;
        case '2':
          e.preventDefault();
          e.stopPropagation();
          setVideoPlaybackRate(0.25);
          break;
        case '3':
          e.preventDefault();
          e.stopPropagation();
          setVideoPlaybackRate(0.5);
          break;
        case '4':
          e.preventDefault();
          e.stopPropagation();
          jumpForwardQuarterSecond();
          break;
        case '0':
          e.preventDefault();
          e.stopPropagation();
          setVideoPlaybackRate(1);
          break;
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          togglePlayPause();
          break;
        case 's':
        case 'S':
        case '5':
          e.preventDefault();
          e.stopPropagation();
          if (segmentStartTime === null) {
            handleStartSegment();
          } else {
            handleEndSegment();
          }
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (segmentStartTime !== null && segmentEndTime !== null && !isCreating) {
            handleCreateSegment();
          }
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          e.stopPropagation();
          handleDeleteLastSegment();
          break;
      }
    };

    // Use capture phase to ensure we get the event before other handlers
    document.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [segmentStartTime, segmentEndTime, isCreating]); // Dependencies for the handlers

  const togglePlayPause = () => {
    if (!videoRef.current) return;

    try {
      // Check the actual video state, not our React state
      const actuallyPlaying = !videoRef.current.paused;
      
      if (actuallyPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        const playPromise = videoRef.current.play();
        setIsPlaying(true);
        // Handle the promise if browser supports it
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error('Error playing video:', error);
            setIsPlaying(false);
          });
        }
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
      setIsPlaying(false);
    }
  };

  const seekTo = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const setVideoPlaybackRate = (rate: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const jumpToTime = (time: number) => {
    seekTo(time);
    toast.success(`Jumped to ${formatTime(time)}`);
  };

  // Jump back by exactly 0.25 seconds using the *live* video time to avoid stale state
  const jumpBackQuarterSecond = () => {
    const current = videoRef.current ? videoRef.current.currentTime : currentTime;
    const newTime = Math.max(0, current - 0.25);
    seekTo(newTime);
  };

  // Jump forward by exactly 0.25 seconds using the *live* video time to avoid stale state
  const jumpForwardQuarterSecond = () => {
    const current = videoRef.current ? videoRef.current.currentTime : currentTime;
    const newTime = Math.min(duration, current + 0.25);
    seekTo(newTime);
  };

  const handleStartSegment = () => {
    // Use the actual video time instead of React state to avoid timing issues
    const actualTime = videoRef.current ? videoRef.current.currentTime : currentTime;
    
    // If there's already a start time and current time is before it,
    // make current time the new start and old start becomes the end
    if (segmentStartTime !== null && actualTime < segmentStartTime) {
      setSegmentEndTime(segmentStartTime);
      setSegmentStartTime(actualTime);
      setDescription('');
      
      // Capture new start frame
      try {
        const frameImage = captureCurrentFrame();
        setStartFrameImage(frameImage);
        // Keep the existing end frame image since the old start becomes the end
        
        toast.success(`Reordered markers: new start at ${formatTime(actualTime)}, end at ${formatTime(segmentStartTime)}`);
      } catch (error) {
        console.error('Error capturing start frame:', error);
        setStartFrameImage(null);
        toast.success(`Reordered markers: new start at ${formatTime(actualTime)}, end at ${formatTime(segmentStartTime)} (frame preview unavailable)`);
      }
    } else {
      // Normal behavior: set start time
      setSegmentStartTime(actualTime);
      setSegmentEndTime(null);
      setDescription('');
      setEndFrameImage(null);
      
      // Capture start frame (non-blocking)
      try {
        const frameImage = captureCurrentFrame();
        setStartFrameImage(frameImage);
        
        if (frameImage) {
          toast.success('Segment start time set to ' + formatTime(actualTime));
        } else {
          toast.success('Segment start time set to ' + formatTime(actualTime) + ' (frame preview unavailable)');
        }
      } catch (error) {
        console.error('Error capturing start frame:', error);
        setStartFrameImage(null);
        toast.success('Segment start time set to ' + formatTime(actualTime) + ' (frame preview unavailable)');
      }
    }
  };

  const handleEndSegment = () => {
    if (segmentStartTime === null) {
      toast.error('Please set start time first');
      return;
    }
    
    // Use the actual video time instead of React state to avoid timing issues
    const actualTime = videoRef.current ? videoRef.current.currentTime : currentTime;
    
    // If current time is before start time, swap them
    if (actualTime < segmentStartTime) {
      const oldStart = segmentStartTime;
      setSegmentStartTime(actualTime);
      setSegmentEndTime(oldStart);
      
      // Capture new start frame
      try {
        const frameImage = captureCurrentFrame();
        setStartFrameImage(frameImage);
        // Keep existing end frame image since old start becomes end
        
        toast.success(`Reordered markers: start at ${formatTime(actualTime)}, end at ${formatTime(oldStart)}`);
      } catch (error) {
        console.error('Error capturing start frame:', error);
        setStartFrameImage(null);
        toast.success(`Reordered markers: start at ${formatTime(actualTime)}, end at ${formatTime(oldStart)} (frame preview unavailable)`);
      }
    } else if (actualTime <= segmentStartTime + 0.001) { // Add small tolerance for floating point comparison
      toast.error('End time must be after start time');
      return;
    } else {
      // Normal behavior: set end time
      setSegmentEndTime(actualTime);
      
      // Capture end frame (non-blocking)
      try {
        const frameImage = captureCurrentFrame();
        setEndFrameImage(frameImage);
        
        if (frameImage) {
          toast.success('Segment end time set to ' + formatTime(actualTime));
        } else {
          toast.success('Segment end time set to ' + formatTime(actualTime) + ' (frame preview unavailable)');
        }
      } catch (error) {
        console.error('Error capturing end frame:', error);
        setEndFrameImage(null);
        toast.success('Segment end time set to ' + formatTime(actualTime) + ' (frame preview unavailable)');
      }
    }
  };

  const handleCreateSegment = async () => {
    if (segmentStartTime === null || segmentEndTime === null) {
      toast.error('Please set both start and end times');
      return;
    }

    // Creating segment

    setIsCreating(true);
    try {
      // Store the end time before clearing state
      const targetJumpTime = segmentEndTime;
      
      await onCreateSegment(video.id, segmentStartTime * 1000, segmentEndTime * 1000, description);
      
      // Clear state first
      setSegmentStartTime(null);
      setSegmentEndTime(null);
      setDescription('');
      setStartFrameImage(null);
      setEndFrameImage(null);
      
      // Jump to the end of the created segment after state is cleared
      setTimeout(() => {
        jumpToTime(targetJumpTime);
      }, 100);
      
      toast.success('Segment created successfully');
    } catch (error) {
      console.error('[VideoSegmentEditor] Failed to create segment:', error);
      toast.error('Failed to create segment');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelSegment = () => {
    setSegmentStartTime(null);
    setSegmentEndTime(null);
    setDescription('');
    setStartFrameImage(null);
    setEndFrameImage(null);
    toast.info('Segment creation canceled');
  };

  const previewSegment = (segment: TrainingDataSegment) => {
    if (!videoRef.current) return;
    
    const startTime = segment.startTime / 1000;
    
    // Just seek to the start of the segment without auto-playing
    seekTo(startTime);
    toast.success(`Jumped to segment: ${formatDuration(segment.startTime)} - ${formatDuration(segment.endTime)}`);
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

  const handleDeleteLastSegment = () => {
    // Remove the last mark (end time first, then start time)
    if (segmentEndTime !== null) {
      // Remove end time
      setSegmentEndTime(null);
      setEndFrameImage(null);
      toast.success('Removed end time mark');
    } else if (segmentStartTime !== null) {
      // Remove start time
      setSegmentStartTime(null);
      setStartFrameImage(null);
      toast.success('Removed start time mark');
    } else {
      toast.error('No marks to remove');
    }
  };

  const handleEditSegment = (segment: TrainingDataSegment) => {
    setEditingSegment(segment.id);
    setSegmentStartTime(segment.startTime / 1000);
    setSegmentEndTime(segment.endTime / 1000);
    setDescription(segment.description || '');
  };

  const handleUpdateSegment = async () => {
    if (!editingSegment || segmentStartTime === null || segmentEndTime === null) return;

    try {
      await updateSegment(editingSegment, {
        startTime: segmentStartTime * 1000,
        endTime: segmentEndTime * 1000,
        description,
      });
      setEditingSegment(null);
      setSegmentStartTime(null);
      setSegmentEndTime(null);
      setDescription('');
      toast.success('Segment updated successfully');
    } catch (error) {
      toast.error('Failed to update segment');
    }
  };

  const cancelEdit = () => {
    setEditingSegment(null);
    setSegmentStartTime(null);
    setSegmentEndTime(null);
    setDescription('');
  };

  return (
    <div className="space-y-6">
      {/* Video Player and Segment Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Video Player</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {/* Video Player Section - 4/5 width */}
            <div className="w-4/5 space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {getVideoUrl(video) !== '' ? (
                  <video
                    ref={videoRef}
                    src={getVideoUrl(video)}
                    crossOrigin="anonymous"
                    className="w-full h-full object-contain"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={(e) => {
                      const videoElement = e.target as HTMLVideoElement;
                      console.error('Video load error:', {
                        videoId: video.id,
                        src: videoElement.src,
                        error: videoElement.error,
                        networkState: videoElement.networkState,
                        readyState: videoElement.readyState
                      });
                      
                      // Mark this video as invalid so it won't be loaded again
                      markVideoAsInvalid(video.id);
                      setVideoReady(false);
                      
                      // Show a user-friendly error message
                      toast.error(`Video file not available: ${video.originalFilename}. The file may have been moved or deleted.`);
                    }}
                    onLoadStart={() => {
                      setVideoReady(false);
                    }}
                    onLoadedMetadata={(e) => {
                      const videoElement = e.target as HTMLVideoElement;
                      setDuration(videoElement.duration);
                    }}
                    onLoadedData={() => {
                      setVideoReady(true);
                    }}
                    onCanPlay={() => {
                      setVideoReady(true);
                    }}
                    onTimeUpdate={(e) => {
                      const videoElement = e.target as HTMLVideoElement;
                      setCurrentTime(videoElement.currentTime);
                    }}
                    controls={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-white">
                      <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-sm text-red-400 font-medium">Video file not available</p>
                      <p className="text-xs text-gray-400 mt-2 max-w-md">
                        The video file "{video.originalFilename}" could not be loaded. 
                        It may have been moved or deleted from storage.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Video Controls */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Jump Back Control */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={jumpBackQuarterSecond}
                    className="flex items-center gap-1 text-xs px-2"
                    title="Press '1' to jump back 0.25 seconds"
                  >
                    <SkipBack className="h-3 w-3" />
                    -0.25s
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={jumpForwardQuarterSecond}
                    className="flex items-center gap-1 text-xs px-2"
                    title="Press '4' to jump forward 0.25 seconds"
                  >
                    <SkipForward className="h-3 w-3" />
                    +0.25s
                  </Button>

                  {/* Playback Speed Controls */}
                  <Button
                    variant={playbackRate === 0.25 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVideoPlaybackRate(0.25)}
                    className="text-xs px-2"
                    title="Press '2' for 1/4x speed"
                  >
                    1/4×
                  </Button>
                  
                  <Button
                    variant={playbackRate === 0.5 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVideoPlaybackRate(0.5)}
                    className="text-xs px-2"
                    title="Press '3' for 1/2x speed"
                  >
                    1/2×
                  </Button>

                  <Button
                    variant={playbackRate === 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVideoPlaybackRate(1)}
                    className="text-xs px-2"
                    title="Press '0' for normal speed"
                  >
                    1×
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePlayPause}
                    className="flex items-center gap-1 min-w-[200px] px-6"
                    title="Press Space to play/pause"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isPlaying ? 'Pause' : 'Play'}
                    {playbackRate !== 1 && <span className="text-xs ml-1">({playbackRate}×)</span>}
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


                  
                  <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
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
                    onChange={(e) => {
                      // Ensure video is paused when seeking via timeline
                      if (videoRef.current && !videoRef.current.paused) {
                        videoRef.current.pause();
                        setIsPlaying(false);
                      }
                      seekTo(parseFloat(e.target.value));
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />

                  {/* Current segment tooltip */}
                  {currentSegmentInfo && duration > 0 && (
                    <div 
                      className="absolute top-6 transform -translate-x-1/2 z-10"
                      style={{
                        left: `${(currentTime / duration) * 100}%`,
                      }}
                    >
                      <div className="bg-black/90 text-white text-xs rounded-lg p-2 whitespace-nowrap shadow-lg">
                        {/* Arrow pointing up */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-transparent border-b-black/90"></div>
                        <div className="font-medium">Segment {currentSegmentInfo.index + 1}</div>
                        <div className="text-xs opacity-80">
                          {formatDuration(currentSegmentInfo.segment.startTime)} - {formatDuration(currentSegmentInfo.segment.endTime)}
                        </div>
                        {currentSegmentInfo.segment.description && (
                          <div className="text-xs opacity-80 max-w-32 truncate">
                            "{currentSegmentInfo.segment.description}"
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Existing segment markers */}
                  <TooltipProvider>
                    {segments.map((segment, index) => {
                      const color = getSegmentColor(index);
                      const startPercent = (segment.startTime / 1000 / duration) * 100;
                      const widthPercent = ((segment.endTime - segment.startTime) / 1000 / duration) * 100;
                      
                      return (
                        <Tooltip key={segment.id}>
                          <TooltipTrigger asChild>
                            <div
                              className={`absolute top-0 h-2 ${color.bg} rounded cursor-pointer hover:opacity-80 transition-opacity`}
                              style={{
                                left: `${startPercent}%`,
                                width: `${widthPercent}%`,
                              }}
                              onClick={() => previewSegment(segment)}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <div className="font-medium">Segment {index + 1}</div>
                              <div>
                                {formatDuration(segment.startTime)} - {formatDuration(segment.endTime)}
                              </div>
                              <div>
                                Duration: {formatDuration(segment.endTime - segment.startTime)}
                              </div>
                              {segment.description && (
                                <div className="text-xs mt-1 max-w-48">
                                  "{segment.description}"
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </TooltipProvider>
                  
                  {/* Current segment being created */}
                  {segmentStartTime !== null && (
                    <>
                      {/* Start marker */}
                      <div
                        className="absolute top-0 w-1 h-4 bg-green-500 rounded-full transform -translate-y-1"
                        style={{
                          left: `${(segmentStartTime / duration) * 100}%`,
                        }}
                      />
                      
                      {/* End marker and segment preview */}
                      {segmentEndTime !== null && (
                        <>
                          {/* Segment preview */}
                          <div
                            className="absolute top-0 h-2 bg-green-500/40 rounded"
                            style={{
                              left: `${(segmentStartTime / duration) * 100}%`,
                              width: `${((segmentEndTime - segmentStartTime) / duration) * 100}%`,
                            }}
                          />
                          
                          {/* End marker */}
                          <div
                            className="absolute top-0 w-1 h-4 bg-red-500 rounded-full transform -translate-y-1"
                            style={{
                              left: `${(segmentEndTime / duration) * 100}%`,
                            }}
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Segment Controls Sidebar - 1/5 width */}
            <div className="w-1/5 space-y-4">
              {/* Segment Creation Controls */}
              <div className="space-y-3 bg-muted p-3 rounded">
                {segmentStartTime === null ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleStartSegment}
                    className="flex items-center gap-1 w-full"
                    title="Press 'S' or '5' to start segment"
                  >
                    <Scissors className="h-4 w-4" />
                    Start Segment
                  </Button>
                ) : (
                  <div className="space-y-2">
                    {/* Live preview when dragging */}
                    {segmentEndTime === null && currentTime > segmentStartTime && (
                      <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
                        <div className="font-medium">Live Preview</div>
                        <div className="text-xs">
                          Duration: {formatTime(currentTime - segmentStartTime)}
                        </div>
                      </div>
                    )}
                    
                    {/* Description and Create Button - only show when both start and end are set */}
                    {segmentEndTime !== null && (
                      <div className="space-y-2">
                        <div>
                          <Label htmlFor="segment-description" className="text-sm">
                            Description (optional)
                          </Label>
                          <Textarea
                            id="segment-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe this segment..."
                            rows={2}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            onClick={handleCreateSegment}
                            disabled={isCreating}
                            className="flex items-center gap-1 w-full"
                            title="Press Enter to create segment"
                          >
                            <Plus className="h-4 w-4" />
                            {isCreating ? 'Creating...' : 'Create Segment'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleCancelSegment}
                            disabled={isCreating}
                            className="w-full"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Frame Previews */}
              {segmentStartTime !== null && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-700">
                      {segmentEndTime !== null ? 'Segment Frames' : `Start Frame (${formatTime(segmentStartTime)})`}
                    </span>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Start Frame */}
                    <div className="text-center">
                      <div className="text-xs text-green-700 mb-1 font-medium">
                        Start ({formatTime(segmentStartTime)})
                      </div>
                      {startFrameImage ? (
                        <img
                          src={startFrameImage}
                          alt="Start frame"
                          className="w-full h-20 object-cover rounded border shadow-sm"
                        />
                      ) : (
                        <div className="w-full h-20 bg-gray-100 rounded border shadow-sm flex items-center justify-center">
                          <div className="text-center text-gray-500">
                            <Video className="h-4 w-4 mx-auto mb-1" />
                            <div className="text-xs">Unavailable</div>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-1 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => jumpToTime(segmentStartTime)}
                          className="text-xs px-2 py-1 h-6 flex-1"
                        >
                          Jump to here
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSegmentStartTime(null);
                            setStartFrameImage(null);
                          }}
                          className="text-xs px-1 py-1 h-6 text-red-600 hover:text-red-700"
                          title="Remove start time"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* End Here Controls - show when start is set but end is not */}
                    {segmentEndTime === null && (
                      <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="text-center">
                          <div className="text-xs text-red-700 mb-2 font-medium">
                            End at ({formatTime(currentTime)})
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleEndSegment}
                              className="flex items-center gap-1 flex-1"
                              title="Press 'S' or '5' to end segment"
                            >
                              <Scissors className="h-4 w-4" />
                              End Here
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCancelSegment}
                              className="text-xs px-2"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* End Frame */}
                    {segmentEndTime !== null && (
                      <div className="text-center">
                        <div className="text-xs text-red-700 mb-1 font-medium">
                          End ({formatTime(segmentEndTime)})
                        </div>
                        {endFrameImage ? (
                          <img
                            src={endFrameImage}
                            alt="End frame"
                            className="w-full h-20 object-cover rounded border shadow-sm"
                          />
                        ) : (
                          <div className="w-full h-20 bg-gray-100 rounded border shadow-sm flex items-center justify-center">
                            <div className="text-center text-gray-500">
                              <Video className="h-4 w-4 mx-auto mb-1" />
                              <div className="text-xs">Unavailable</div>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-1 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => jumpToTime(segmentEndTime)}
                            className="text-xs px-2 py-1 h-6 flex-1"
                          >
                            Jump to here
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSegmentEndTime(null);
                              setEndFrameImage(null);
                            }}
                            className="text-xs px-1 py-1 h-6 text-red-600 hover:text-red-700"
                            title="Remove end time"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Duration Info */}
                  {segmentEndTime !== null && (
                    <div className="mt-3 text-center">
                      <div className="text-sm text-green-700 font-medium">
                        Duration: {formatTime(segmentEndTime - segmentStartTime)}
                        <span className="ml-2 text-xs">
                          (~{Math.round((segmentEndTime - segmentStartTime) * 30)} frames @ 30fps)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
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
              {sortedSegments.map((segment) => {
                const originalIndex = segments.findIndex(s => s.id === segment.id);
                const color = getSegmentColor(originalIndex);
                const isCurrentSegment = currentSegmentInfo?.segment?.id === segment.id;
                  
                  return (
                    <div
                      key={segment.id}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 ${color.border} ${
                        isCurrentSegment 
                          ? 'bg-yellow-50 border-yellow-400 shadow-md ring-2 ring-yellow-200' 
                          : 'bg-opacity-5'
                      } transition-all duration-200`}
                    >
                                        <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {/* Start time */}
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`${color.border} text-current`}>
                            Start: {formatDuration(segment.startTime)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => jumpToTime(segment.startTime / 1000)}
                            className="h-6 px-2 text-xs"
                          >
                            Jump to
                          </Button>
                        </div>
                        
                        {/* End time */}
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`${color.border} text-current`}>
                            End: {formatDuration(segment.endTime)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => jumpToTime(segment.endTime / 1000)}
                            className="h-6 px-2 text-xs"
                          >
                            Jump to
                          </Button>
                        </div>
                        
                        {/* Duration */}
                        <Badge variant="secondary">
                          Duration: {formatDuration(segment.endTime - segment.startTime)}
                        </Badge>
                        
                        {/* Current segment indicator */}
                        {isCurrentSegment && (
                          <Badge variant="default" className="bg-yellow-500 text-yellow-900">
                            🎯 Currently Playing
                          </Badge>
                        )}
                      </div>
                      {segment.description && (
                        <p className="text-sm text-muted-foreground">
                          {segment.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(segment.createdAt).toLocaleString()}
                      </p>
                      
                      {/* Frame Preview */}
                      <SegmentFramePreview 
                        segment={segment}
                        captureFrameAtTime={captureFrameAtTime}
                        videoReady={videoReady}
                      />
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
                      onClick={() => previewSegment(segment)}
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
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 