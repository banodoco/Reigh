import { useState, useEffect } from 'react';
import { PageFadeIn } from '@/shared/components/transitions';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import FileInput from '@/shared/components/FileInput';
import { VideoUploadList } from '../components/VideoUploadList';
import { VideoSegmentEditor } from '../components/VideoSegmentEditor';
import { useTrainingData } from '../hooks/useTrainingData';
import { Upload, Video, Scissors } from 'lucide-react';
import { toast } from 'sonner';

export default function TrainingDataHelperPage() {
  const { videos, uploadVideo, isUploading, segments, createSegment, deleteSegment } = useTrainingData();
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  const handleFileSelect = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select at least one video file');
      return;
    }

    try {
      for (const file of files) {
        await uploadVideo(file);
      }
      setFiles([]);
      toast.success(`Successfully uploaded ${files.length} video(s)`);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload videos');
    }
  };

  const selectedVideoData = selectedVideo ? videos.find(v => v.id === selectedVideo) : null;
  const videoSegments = selectedVideo ? segments.filter(s => s.training_data_id === selectedVideo) : [];

  return (
    <PageFadeIn className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Training Data Helper</h1>
          <p className="text-muted-foreground">
            Upload videos and extract training segments for AI model development
          </p>
        </div>

        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Videos
            </CardTitle>
            <CardDescription>
              Upload video files to extract training segments from
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileInput
              acceptTypes={['video']}
              multiple
              onFileChange={handleFileSelect}
              label="Select video files to upload"
            />
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {files.length} file(s) selected
                </p>
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <div key={index} className="bg-secondary px-3 py-1 rounded-md text-sm">
                      {file.name}
                    </div>
                  ))}
                </div>
                <Button 
                  onClick={handleUpload} 
                  disabled={isUploading}
                  className="w-full"
                >
                  {isUploading ? 'Uploading...' : 'Upload Videos'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Video Library */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Video Library ({videos.length})
            </CardTitle>
            <CardDescription>
              Your uploaded videos. Click on a video to extract segments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VideoUploadList 
              videos={videos}
              selectedVideo={selectedVideo}
              onVideoSelect={setSelectedVideo}
            />
          </CardContent>
        </Card>

        {/* Segment Editor */}
        {selectedVideoData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scissors className="h-5 w-5" />
                Segment Editor - {selectedVideoData.originalFilename}
              </CardTitle>
              <CardDescription>
                Create and manage training segments from the selected video
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VideoSegmentEditor
                video={selectedVideoData}
                segments={videoSegments}
                onCreateSegment={createSegment}
                onDeleteSegment={deleteSegment}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </PageFadeIn>
  );
} 