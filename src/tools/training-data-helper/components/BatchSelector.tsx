import React, { useState } from 'react';
import { Plus, FolderOpen, Download, Edit3, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { TrainingDataBatch, TrainingDataVideo, TrainingDataSegment } from '../hooks/useTrainingData';
import { toast } from 'sonner';
import { formatDistanceToNow, isValid } from 'date-fns';
import { useUpdatingTimestamp } from '@/shared/hooks/useUpdatingTimestamp';

interface BatchSelectorProps {
  batches: TrainingDataBatch[];
  selectedBatchId: string | null;
  onSelectBatch: (batchId: string) => void;
  onCreateBatch: (name: string, description?: string) => Promise<string>;
  onUpdateBatch: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
  onDeleteBatch: (id: string) => Promise<void>;
  videos: TrainingDataVideo[];
  segments: TrainingDataSegment[];
  getVideoUrl: (video: TrainingDataVideo) => string;
}

// Add abbreviateDistance function
const abbreviateDistance = (str: string) => {
  return str
    .replace(/about\s+/g, '')
    .replace(/\s+minutes?\s+/g, ' mins ')
    .replace(/\s+hours?\s+/g, ' hrs ')
    .replace(/\s+days?\s+/g, ' days ')
    .replace(/\s+months?\s+/g, ' mos ')
    .replace(/\s+years?\s+/g, ' yrs ')
    .replace(/less than a minute/g, '<1 min');
};

// Component for live-updating batch created timestamp
const BatchCreatedTimestamp: React.FC<{ createdAt: string }> = ({ createdAt }) => {
  const timeAgo = useUpdatingTimestamp({
    date: createdAt,
    abbreviate: abbreviateDistance
  });
  
  return <>Created {timeAgo}</>;
};

export function BatchSelector({ batches, selectedBatchId, onSelectBatch, onCreateBatch, onUpdateBatch, onDeleteBatch, videos, segments, getVideoUrl }: BatchSelectorProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDescription, setNewBatchDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [editingBatch, setEditingBatch] = useState<TrainingDataBatch | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<TrainingDataBatch | null>(null);

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) return;
    
    setIsCreating(true);
    try {
      await onCreateBatch(newBatchName.trim(), newBatchDescription.trim() || undefined);
      setNewBatchName('');
      setNewBatchDescription('');
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error('Error creating batch:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditBatch = (batch: TrainingDataBatch) => {
    setEditingBatch(batch);
    setEditName(batch.name);
    setEditDescription(batch.description || '');
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch || !editName.trim()) return;
    
    setIsUpdating(true);
    try {
      await onUpdateBatch(editingBatch.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setEditingBatch(null);
      setEditName('');
      setEditDescription('');
    } catch (error) {
      console.error('Error updating batch:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;
    
    try {
      await onDeleteBatch(batchToDelete.id);
      setIsDeleteDialogOpen(false);
      setBatchToDelete(null);
    } catch (error) {
      console.error('Error deleting batch:', error);
    }
  };

  const openDeleteDialog = (batch: TrainingDataBatch) => {
    setBatchToDelete(batch);
    setIsDeleteDialogOpen(true);
  };

  const handlePrepareDownload = async () => {
    if (!selectedBatchId) {
      toast.error('Please select a batch first');
      return;
    }

    // Get videos in the selected batch
    const batchVideos = videos.filter(v => v.batchId === selectedBatchId);
    if (batchVideos.length === 0) {
      toast.error('No videos found in this batch');
      return;
    }

    // Get segments for these videos
    const batchSegments = segments.filter(s => 
      batchVideos.some(v => v.id === s.trainingDataId)
    );
    if (batchSegments.length === 0) {
      toast.error('No segments found for videos in this batch');
      return;
    }

    setIsDownloading(true);
    
    try {
      // Dynamic import JSZip only
      const JSZipModule = await import('jszip');
      const zip = new JSZipModule.default();
      let processedSegments = 0;

      toast.info(`Starting to process ${batchSegments.length} segments...`);

      // Helper function to extract video segment using MediaRecorder API
      const extractVideoSegment = async (videoUrl: string, startTime: number, endTime: number, videoName: string): Promise<Blob> => {
        return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          video.crossOrigin = 'anonymous';
          video.muted = true;
          video.preload = 'metadata';
          
          let mediaRecorder: MediaRecorder;
          let chunks: BlobPart[] = [];
          let isRecording = false;
          
          video.onloadedmetadata = () => {
            // Set canvas size to match video
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            
            // Create stream from canvas
            const stream = canvas.captureStream(30); // 30 FPS
            
            // Try to use MP4 first, fall back to WebM if needed
            let mimeType = 'video/mp4';
            let fileExtension = 'mp4';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm;codecs=vp9';
              fileExtension = 'webm';
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm;codecs=vp8';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                  mimeType = 'video/webm';
                }
              }
            }
            
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
              }
            };
            
            mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: mimeType });
              // Attach file extension info to blob for later use
              (blob as any).fileExtension = fileExtension;
              resolve(blob);
            };
            
            // Seek to start time
            video.currentTime = startTime;
          };
          
          video.onseeked = () => {
            if (!isRecording && Math.abs(video.currentTime - startTime) < 0.1) {
              // Start recording
              isRecording = true;
              chunks = [];
              mediaRecorder.start();
              
              const renderFrame = () => {
                if (video.currentTime >= endTime || video.ended || video.paused) {
                  mediaRecorder.stop();
                  return;
                }
                
                // Draw current frame to canvas
                if (ctx && !video.paused && !video.ended) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                }
                
                // Continue to next frame
                requestAnimationFrame(renderFrame);
              };
              
              // Start rendering loop
              video.play().then(() => {
                renderFrame();
              }).catch(reject);
              
              // Stop recording when we reach end time
              const checkEndTime = () => {
                if (video.currentTime >= endTime) {
                  video.pause();
                  mediaRecorder.stop();
                } else {
                  requestAnimationFrame(checkEndTime);
                }
              };
              checkEndTime();
            }
          };
          
          video.onerror = () => reject(new Error(`Failed to load video: ${videoName}`));
          video.onabort = () => reject(new Error(`Video loading aborted: ${videoName}`));
          
          // Set video source and load
          video.src = videoUrl;
          video.load();
        });
      };

      // Process each segment individually
      for (const segment of batchSegments) {
        const video = batchVideos.find(v => v.id === segment.trainingDataId);
        if (!video) continue;

        try {
          // Get video URL
          const videoUrl = getVideoUrl(video);
          if (!videoUrl) {
            console.warn(`No URL available for video ${video.id}`);
            continue;
          }

          // Calculate times in seconds
          const startTimeSeconds = segment.startTime / 1000;
          const endTimeSeconds = segment.endTime / 1000;
          const duration = endTimeSeconds - startTimeSeconds;

          toast.info(`Processing segment ${processedSegments + 1}/${batchSegments.length}: ${video.originalFilename} (${startTimeSeconds.toFixed(1)}s-${endTimeSeconds.toFixed(1)}s)`);

          // Extract segment using browser APIs
          const segmentBlob = await extractVideoSegment(videoUrl, startTimeSeconds, endTimeSeconds, video.originalFilename);
          
          // Generate filename with correct extension
          const videoBaseName = video.originalFilename.replace(/\.[^/.]+$/, '');
          const fileExt = (segmentBlob as any).fileExtension || 'mp4';
          const segmentFileName = `${videoBaseName}_${Math.floor(startTimeSeconds)}s-${Math.floor(endTimeSeconds)}s.${fileExt}`;
          
          // Add segment to zip
          zip.file(segmentFileName, segmentBlob);
          
          // Add segment metadata
          const metadataContent = `Video: ${video.originalFilename}
Start Time: ${startTimeSeconds.toFixed(2)}s
End Time: ${endTimeSeconds.toFixed(2)}s
Duration: ${duration.toFixed(2)}s
Description: ${segment.description || 'No description'}
Created: ${new Date(segment.createdAt).toLocaleString()}
Format: ${segmentBlob.type}
File Size: ${segmentBlob.size} bytes`;
          
          zip.file(segmentFileName.replace(`.${fileExt}`, '_metadata.txt'), metadataContent);

          processedSegments++;
          
        } catch (error) {
          console.error(`Error processing segment ${segment.id}:`, error);
          toast.error(`Failed to process segment from ${video.originalFilename}: ${error.message}`);
        }
      }

      if (processedSegments === 0) {
        toast.error('No segments were successfully processed');
        return;
      }

      // Generate zip file
      toast.info('Creating zip file...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Download zip file
      const selectedBatch = batches.find(b => b.id === selectedBatchId);
      const batchName = selectedBatch?.name || 'training_batch';
      const fileName = `${batchName.replace(/[^a-zA-Z0-9]/g, '_')}_segments.zip`;
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      

    } catch (error) {
      console.error('Error preparing download:', error);
      toast.error('Failed to prepare download. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Training Data Batches</CardTitle>
      </CardHeader>
      <CardContent>
        {/* If no batch is selected, only show the New Batch button */}
        {!selectedBatchId ? (
          <div className="text-center py-8">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-1">
                  <Plus className="h-4 w-4" />
                  New Batch
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Batch</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="batch-name">Batch Name</Label>
                    <Input
                      id="batch-name"
                      value={newBatchName}
                      onChange={(e) => setNewBatchName(e.target.value)}
                      placeholder="Enter batch name..."
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="batch-description">Description (optional)</Label>
                    <Textarea
                      id="batch-description"
                      value={newBatchDescription}
                      onChange={(e) => setNewBatchDescription(e.target.value)}
                      placeholder="Describe this batch..."
                      rows={3}
                    />
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                      disabled={isCreating}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateBatch}
                      disabled={!newBatchName.trim() || isCreating}
                    >
                      {isCreating ? 'Creating...' : 'Create Batch'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          /* Show full interface when a batch is selected */
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={selectedBatchId} onValueChange={onSelectBatch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a batch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-1">
                    <Plus className="h-4 w-4" />
                    New Batch
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Batch</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="batch-name">Batch Name</Label>
                      <Input
                        id="batch-name"
                        value={newBatchName}
                        onChange={(e) => setNewBatchName(e.target.value)}
                        placeholder="Enter batch name..."
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="batch-description">Description (optional)</Label>
                      <Textarea
                        id="batch-description"
                        value={newBatchDescription}
                        onChange={(e) => setNewBatchDescription(e.target.value)}
                        placeholder="Describe this batch..."
                        rows={3}
                      />
                    </div>
                    
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(false)}
                        disabled={isCreating}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateBatch}
                        disabled={!newBatchName.trim() || isCreating}
                      >
                        {isCreating ? 'Creating...' : 'Create Batch'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            {selectedBatch && (
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{selectedBatch.name}</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditBatch(selectedBatch)}
                        className="h-6 w-6 p-0"
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                    </div>
                    {selectedBatch.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedBatch.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      <BatchCreatedTimestamp createdAt={selectedBatch.createdAt} />
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{videos.filter(v => v.batchId === selectedBatchId).length} videos</span>
                      <span>{segments.filter(s => videos.some(v => v.id === s.trainingDataId && v.batchId === selectedBatchId)).length} segments</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrepareDownload}
                      disabled={isDownloading}
                      className="flex items-center gap-1"
                    >
                      <Download className="h-4 w-4" />
                      {isDownloading ? 'Preparing...' : 'Prepare Download'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog(selectedBatch)}
                      className="flex items-center gap-1 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Batch
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Edit Batch Dialog */}
        <Dialog open={editingBatch !== null} onOpenChange={(open) => !open && setEditingBatch(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-batch-name">Batch Name</Label>
                <Input
                  id="edit-batch-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter batch name..."
                />
              </div>
              
              <div>
                <Label htmlFor="edit-batch-description">Description (optional)</Label>
                <Textarea
                  id="edit-batch-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Describe this batch..."
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingBatch(null)}
                  disabled={isUpdating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateBatch}
                  disabled={!editName.trim() || isUpdating}
                >
                  {isUpdating ? 'Updating...' : 'Update Batch'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Batch Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete "{batchToDelete?.name}"? This action cannot be undone.
              </p>
              {batchToDelete && videos.filter(v => v.batchId === batchToDelete.id).length > 0 && (
                <p className="text-sm text-red-600 font-medium">
                  This batch contains {videos.filter(v => v.batchId === batchToDelete.id).length} videos. 
                  Please delete all videos first before deleting the batch.
                </p>
              )}
              
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteBatch}
                  disabled={batchToDelete ? videos.filter(v => v.batchId === batchToDelete.id).length > 0 : false}
                >
                  Delete Batch
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
} 