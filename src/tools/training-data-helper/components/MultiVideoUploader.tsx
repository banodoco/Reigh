import { useState, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Label } from '@/shared/components/ui/label';
import { Progress } from '@/shared/components/ui/progress';
import { Video, Upload, Trash2, Clock, FileText, Scissors, Play, Zap } from 'lucide-react';
import FileInput from '@/shared/components/FileInput';
import { toast } from 'sonner';
import { cropFilename } from '@/shared/lib/utils';
import { generateUUID } from '@/shared/lib/taskCreation';

export type SplitMode = 'take-all' | 'manual' | 'auto-scene';

interface VideoFile {
  file: File;
  id: string;
  splitMode: SplitMode;
  preview?: string;
  duration?: number;
  thumbnailUrl?: string;
}

interface MultiVideoUploaderProps {
  onUpload: (videos: VideoFile[]) => Promise<void>;
  isUploading: boolean;
  selectedBatchId: string | null;
}

// Scene detection algorithm based on frame differences
const detectScenes = async (videoFile: File, threshold: number = 0.25): Promise<number[]> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scenes: number[] = [0]; // Always start with 0
    
    video.muted = true;
    video.preload = 'metadata';
    
    let lastFrame: ImageData | null = null;
    let frameCount = 0;
    const sampleRate = 30; // Check every 30 frames for performance
    
    video.onloadedmetadata = () => {
      canvas.width = 160; // Small size for performance
      canvas.height = 90;
      
      const duration = video.duration;
      const fps = 30; // Assume 30fps
      const totalFrames = Math.floor(duration * fps);
      
      const processFrame = () => {
        if (video.currentTime >= duration) {
          scenes.push(duration); // Add end time
          resolve(scenes);
          return;
        }
        
        if (frameCount % sampleRate === 0 && ctx) {
          // Draw current frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          if (lastFrame) {
            // Calculate difference between frames
            let diff = 0;
            const pixels = currentFrame.data.length;
            
            for (let i = 0; i < pixels; i += 4) {
              const rDiff = Math.abs(currentFrame.data[i] - lastFrame.data[i]);
              const gDiff = Math.abs(currentFrame.data[i + 1] - lastFrame.data[i + 1]);
              const bDiff = Math.abs(currentFrame.data[i + 2] - lastFrame.data[i + 2]);
              diff += (rDiff + gDiff + bDiff) / 3;
            }
            
            const percentChange = (diff / pixels) * 100 / 255;
            
            // If change is above threshold, it's likely a scene change
            if (percentChange > threshold * 100) {
              const sceneTime = video.currentTime;
              // Avoid scenes too close together (min 2 seconds apart)
              if (scenes.length === 0 || sceneTime - scenes[scenes.length - 1] > 2) {
                scenes.push(sceneTime);
              }
            }
          }
          
          lastFrame = currentFrame;
        }
        
        frameCount++;
        video.currentTime = Math.min(video.currentTime + 1/fps, duration);
        
        // Continue processing
        setTimeout(processFrame, 10);
      };
      
      processFrame();
    };
    
    video.onerror = () => {
      console.warn('Scene detection failed, using single scene');
      resolve([0, video.duration || 0]);
    };
    
    // Create object URL for the video
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    
    // Cleanup
    video.onload = () => URL.revokeObjectURL(url);
  });
};

export function MultiVideoUploader({ onUpload, isUploading, selectedBatchId }: MultiVideoUploaderProps) {
  const [videoFiles, setVideoFiles] = useState<VideoFile[]>([]);
  const [processingScenes, setProcessingScenes] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileInputKey, setFileInputKey] = useState<number>(0);

  const handleFileSelect = (files: File[]) => {
    // Immediately add files to queue instead of intermediate step
    const newVideoFiles: VideoFile[] = files.map(file => ({
      file,
      id: generateUUID(),
      splitMode: 'manual' as SplitMode
    }));
    
    setVideoFiles(prev => [...prev, ...newVideoFiles]);
    
    // Reset the file input to clear it visually
    setFileInputKey(prev => prev + 1);
    
    // Generate previews and thumbnails for new videos
    newVideoFiles.forEach(videoFile => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      video.muted = true;
      
      video.onloadedmetadata = () => {
        setVideoFiles(prev => 
          prev.map(v => 
            v.id === videoFile.id 
              ? { ...v, duration: video.duration }
              : v
          )
        );
        
        // Generate thumbnail at 1 second into the video
        video.currentTime = 1;
      };
      
      video.onseeked = () => {
        // Create thumbnail
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate dimensions to maintain aspect ratio while fitting in a max size
        const maxWidth = 160;
        const maxHeight = 90;
        const aspectRatio = video.videoWidth / video.videoHeight;
        
        let canvasWidth, canvasHeight;
        if (aspectRatio > maxWidth / maxHeight) {
          // Video is wider, constrain by width
          canvasWidth = maxWidth;
          canvasHeight = maxWidth / aspectRatio;
        } else {
          // Video is taller, constrain by height
          canvasHeight = maxHeight;
          canvasWidth = maxHeight * aspectRatio;
        }
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
          
          setVideoFiles(prev => 
            prev.map(v => 
              v.id === videoFile.id 
                ? { ...v, thumbnailUrl }
                : v
            )
          );
        }
        
        // Clean up
        URL.revokeObjectURL(video.src);
      };
      
      video.src = URL.createObjectURL(videoFile.file);
    });
  };

  const updateSplitMode = (videoId: string, splitMode: SplitMode) => {
    setVideoFiles(prev => 
      prev.map(v => v.id === videoId ? { ...v, splitMode } : v)
    );
  };

  const removeVideo = (videoId: string) => {
    // Clean up any object URLs for the removed video
    const videoToRemove = videoFiles.find(v => v.id === videoId);
    if (videoToRemove?.thumbnailUrl) {
      URL.revokeObjectURL(videoToRemove.thumbnailUrl);
    }
    
    setVideoFiles(prev => prev.filter(v => v.id !== videoId));
  };

  const handleUpload = async () => {
    if (videoFiles.length === 0) {
      toast.error('Please select at least one video file');
      return;
    }

    if (!selectedBatchId) {
      toast.error('Please select or create a batch first');
      return;
    }

    try {
      setUploadProgress(0);
      
      // Process videos with scene detection if needed
      const processedVideos: VideoFile[] = [];
      
      for (let i = 0; i < videoFiles.length; i++) {
        const videoFile = videoFiles[i];
        setUploadProgress((i / videoFiles.length) * 50); // First 50% for processing
        
        if (videoFile.splitMode === 'auto-scene') {
          setProcessingScenes(videoFile.id);
          try {
            const scenes = await detectScenes(videoFile.file);
            console.log(`Detected ${scenes.length} scenes for ${videoFile.file.name}:`, scenes);
            
            // Store scene times in the video file for later use
            (videoFile as any).detectedScenes = scenes;
            processedVideos.push(videoFile);
          } catch (error) {
            console.error('Scene detection failed:', error);
            toast.error(`Scene detection failed for ${videoFile.file.name}, using manual mode`);
            processedVideos.push({ ...videoFile, splitMode: 'manual' });
          } finally {
            setProcessingScenes(null);
          }
        } else {
          processedVideos.push(videoFile);
        }
      }
      
      setUploadProgress(50); // Processing complete
      
      // Upload the videos
      await onUpload(processedVideos);
      
      setUploadProgress(100);
      setVideoFiles([]);
      
      setTimeout(() => setUploadProgress(0), 1000);
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload videos');
      setUploadProgress(0);
    }
  };

  const formatDuration = (seconds: number) => {
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

  const getSplitModeIcon = (mode: SplitMode) => {
    switch (mode) {
      case 'take-all': return <Play className="h-4 w-4" />;
      case 'manual': return <Scissors className="h-4 w-4" />;
      case 'auto-scene': return <Zap className="h-4 w-4" />;
    }
  };

  const getSplitModeDescription = (mode: SplitMode) => {
    switch (mode) {
      case 'take-all': return 'Create one segment from start to end';
      case 'manual': return 'I\'ll create segments manually';
      case 'auto-scene': return 'Automatically detect and create scene segments';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Videos
        </CardTitle>
        <CardDescription>
          Upload multiple videos and choose how to split them into training segments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileInput
          key={fileInputKey}
          acceptTypes={['video']}
          multiple
          onFileChange={handleFileSelect}
          label="Select video files to upload"
        />
        
        {videoFiles.length > 0 && (
          <div className="space-y-4">
            <div className="text-sm font-light">
              Upload Queue ({videoFiles.length} video{videoFiles.length !== 1 ? 's' : ''})
            </div>
            
            {/* Video List with Split Options */}
            <div className="space-y-4">
              {videoFiles.map((videoFile) => (
                <Card key={videoFile.id} className="relative">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Video Thumbnail */}
                      <div className="flex-shrink-0">
                        {videoFile.thumbnailUrl ? (
                          <img 
                            src={videoFile.thumbnailUrl} 
                            alt={`Thumbnail for ${videoFile.file.name}`}
                            className="w-20 h-12 object-contain rounded border bg-black"
                          />
                        ) : (
                          <div className="w-20 h-12 bg-muted rounded border flex items-center justify-center">
                            <Video className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      
                      {/* Video Info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-light text-sm truncate" title={videoFile.file.name}>
                            {cropFilename(videoFile.file.name)}
                          </span>
                          {processingScenes === videoFile.id && (
                            <Badge variant="secondary" className="text-xs">
                              Detecting scenes...
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {videoFile.duration && (
                            <>
                              <Clock className="h-3 w-3" />
                              <span>{formatDuration(videoFile.duration)}</span>
                              <span>•</span>
                            </>
                          )}
                          <FileText className="h-3 w-3" />
                          <span>{formatFileSize(videoFile.file.size)}</span>
                        </div>
                        
                        {/* Split Mode Selection */}
                        <div className="space-y-2">
                          <Label className="text-xs font-light">How would you like to split this?</Label>
                          <RadioGroup
                            value={videoFile.splitMode}
                            onValueChange={(value) => updateSplitMode(videoFile.id, value as SplitMode)}
                            className="grid grid-cols-1 gap-2"
                          >
                            {[
                              { value: 'manual', label: 'I\'ll do it manually', description: 'Create segments manually later' },
                              { value: 'auto-scene', label: 'Automatic scene split', description: 'Detect scenes automatically' },
                              { value: 'take-all', label: 'Take it all', description: 'One segment from start to end' }
                            ].map((option) => (
                              <div key={option.value} className="flex items-center space-x-2">
                                <RadioGroupItem value={option.value} id={`${videoFile.id}-${option.value}`} />
                                <Label
                                  htmlFor={`${videoFile.id}-${option.value}`}
                                  className="flex items-center gap-2 text-xs cursor-pointer"
                                >
                                  {getSplitModeIcon(option.value as SplitMode)}
                                  <span className="font-light">{option.label}</span>
                                  <span className="text-muted-foreground">- {option.description}</span>
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>
                      </div>
                      
                      {/* Remove Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeVideo(videoFile.id)}
                        disabled={isUploading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Upload Progress */}
            {uploadProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
            
            {/* Upload Button */}
            <Button 
              onClick={handleUpload} 
              disabled={isUploading || processingScenes !== null}
              className="w-full"
            >
              {isUploading 
                ? 'Uploading...' 
                : processingScenes 
                  ? 'Processing scenes...'
                  : 'Upload Videos'
              }
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 