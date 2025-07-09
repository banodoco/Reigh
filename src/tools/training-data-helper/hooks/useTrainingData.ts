import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Database types (snake_case)
interface TrainingDataBatchDB {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  metadata: any;
  created_at: string;
  updated_at: string | null;
}

interface TrainingDataVideoDB {
  id: string;
  original_filename: string;
  storage_location: string;
  duration: number | null;
  metadata: any;
  created_at: string;
  updated_at: string | null;
  user_id: string;
  batch_id: string;
}

interface TrainingDataSegmentDB {
  id: string;
  training_data_id: string;
  start_time: number;
  end_time: number;
  segment_location: string | null;
  description: string | null;
  metadata: any;
  created_at: string;
  updated_at: string | null;
}

// Client types (camelCase)
export interface TrainingDataBatch {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string | null;
}

export interface TrainingDataVideo {
  id: string;
  originalFilename: string;
  storageLocation: string;
  duration: number | null;
  metadata: any;
  createdAt: string;
  updatedAt: string | null;
  userId: string;
  batchId: string;
}

export interface TrainingDataSegment {
  id: string;
  trainingDataId: string;
  startTime: number;
  endTime: number;
  segmentLocation: string | null;
  description: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string | null;
}

// Transform functions
const transformBatch = (batch: TrainingDataBatchDB): TrainingDataBatch => ({
  id: batch.id,
  userId: batch.user_id,
  name: batch.name,
  description: batch.description,
  metadata: batch.metadata,
  createdAt: batch.created_at,
  updatedAt: batch.updated_at,
});

const transformVideo = (video: TrainingDataVideoDB): TrainingDataVideo => ({
  id: video.id,
  originalFilename: video.original_filename,
  storageLocation: video.storage_location,
  duration: video.duration,
  metadata: video.metadata,
  createdAt: video.created_at,
  updatedAt: video.updated_at,
  userId: video.user_id,
  batchId: video.batch_id,
});

const transformSegment = (segment: TrainingDataSegmentDB): TrainingDataSegment => ({
  id: segment.id,
  trainingDataId: segment.training_data_id,
  startTime: segment.start_time,
  endTime: segment.end_time,
  segmentLocation: segment.segment_location,
  description: segment.description,
  metadata: segment.metadata,
  createdAt: segment.created_at,
  updatedAt: segment.updated_at,
});

export function useTrainingData() {
  const [videos, setVideos] = useState<TrainingDataVideo[]>([]);
  const [segments, setSegments] = useState<TrainingDataSegment[]>([]);
  const [batches, setBatches] = useState<TrainingDataBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch videos on mount
  useEffect(() => {
    fetchBatches();
    fetchSegments();
  }, []);

  // Refetch videos when selected batch changes
  useEffect(() => {
    if (selectedBatchId) {
      fetchVideos();
    }
  }, [selectedBatchId]);

  const fetchVideos = async () => {
    try {
      let query = supabase
        .from('training_data')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter by selected batch if one is selected
      if (selectedBatchId) {
        query = query.eq('batch_id', selectedBatchId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setVideos((data || []).map(transformVideo));
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Failed to load videos');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSegments = async () => {
    try {
      const { data, error } = await supabase
        .from('training_data_segments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSegments((data || []).map(transformSegment));
    } catch (error) {
      console.error('Error fetching segments:', error);
      toast.error('Failed to load segments');
    }
  };

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('training_data_batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const batchesData = (data || []).map(transformBatch);
      setBatches(batchesData);
      
      // Set the first batch as selected if none is selected
      if (!selectedBatchId && batchesData.length > 0) {
        setSelectedBatchId(batchesData[0].id);
      }
    } catch (error) {
      console.error('Error fetching batches:', error);
      toast.error('Failed to load batches');
    }
  };

  const createBatch = async (name: string, description?: string): Promise<string> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('training_data_batches')
        .insert({
          user_id: user.id,
          name,
          description,
          metadata: {},
        })
        .select()
        .single();

      if (error) throw error;

      const newBatch = transformBatch(data);
      setBatches(prev => [newBatch, ...prev]);
      setSelectedBatchId(newBatch.id);
      toast.success('Batch created successfully!');
      return newBatch.id;
    } catch (error) {
      console.error('Error creating batch:', error);
      toast.error('Failed to create batch');
      throw error;
    }
  };

  const updateBatch = async (id: string, updates: { name?: string; description?: string }) => {
    try {
      const { data, error } = await supabase
        .from('training_data_batches')
        .update({
          name: updates.name,
          description: updates.description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setBatches(prev => prev.map(b => b.id === id ? transformBatch(data) : b));
      toast.success('Batch updated successfully!');
    } catch (error) {
      console.error('Error updating batch:', error);
      toast.error('Failed to update batch');
      throw error;
    }
  };

  const deleteBatch = async (id: string) => {
    try {
      // Check if batch has videos
      const batchVideos = videos.filter(v => v.batchId === id);
      if (batchVideos.length > 0) {
        toast.error('Cannot delete batch with videos. Please delete all videos first.');
        return;
      }

      const { error } = await supabase
        .from('training_data_batches')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update local state
      setBatches(prev => prev.filter(b => b.id !== id));
      
      // If this was the selected batch, select another one
      if (selectedBatchId === id) {
        const remainingBatches = batches.filter(b => b.id !== id);
        setSelectedBatchId(remainingBatches.length > 0 ? remainingBatches[0].id : null);
      }

      toast.success('Batch deleted successfully');
    } catch (error) {
      console.error('Error deleting batch:', error);
      toast.error('Failed to delete batch');
    }
  };

  const uploadVideo = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!selectedBatchId) {
        throw new Error('Please select a batch first');
      }

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      console.log('[Upload] Starting upload:', {
        originalFilename: file.name,
        storageFileName: fileName,
        fileSize: file.size,
        fileType: file.type
      });

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('training-data')
        .upload(fileName, file);

      if (uploadError) {
        console.error('[Upload] Storage upload error:', uploadError);
        throw uploadError;
      }

      console.log('[Upload] Storage upload successful:', uploadData);

      // Create database record
      const { data, error } = await supabase
        .from('training_data')
        .insert({
          user_id: user.id,
          batch_id: selectedBatchId,
          original_filename: file.name,
          storage_location: fileName,
          metadata: {
            size: file.size,
            type: file.type,
          },
        })
        .select()
        .single();

      if (error) {
        console.error('[Upload] Database insert error:', error);
        throw error;
      }

      console.log('[Upload] Database record created:', data);

      // Test public URL generation
      const { data: publicUrlData } = supabase.storage
        .from('training-data')
        .getPublicUrl(fileName);
      
      console.log('[Upload] Generated public URL for uploaded video:', publicUrlData.publicUrl);

      // Update local state
      setVideos(prev => [transformVideo(data), ...prev]);
      return data.id;
    } catch (error) {
      console.error('[Upload] Error uploading video:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  // New function for multi-video upload with split modes
  const uploadVideosWithSplitModes = async (videoFiles: Array<{
    file: File;
    splitMode: 'take-all' | 'manual' | 'auto-scene';
    detectedScenes?: number[];
  }>): Promise<void> => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!selectedBatchId) {
        throw new Error('Please select a batch first');
      }

      for (const videoFile of videoFiles) {
        // Upload video first
        const videoId = await uploadVideoFile(videoFile.file, user.id);
        
        // Create segments based on split mode
        switch (videoFile.splitMode) {
          case 'take-all':
            // Create one segment from start to end
            await createSegmentForVideo(videoId, 0, null, 'Full video segment');
            break;
            
          case 'auto-scene':
            // Create segments based on detected scenes
            if (videoFile.detectedScenes && videoFile.detectedScenes.length > 1) {
              for (let i = 0; i < videoFile.detectedScenes.length - 1; i++) {
                const startTime = videoFile.detectedScenes[i];
                const endTime = videoFile.detectedScenes[i + 1];
                await createSegmentForVideo(
                  videoId, 
                  Math.round(startTime * 1000), 
                  Math.round(endTime * 1000), 
                  `Auto-detected scene ${i + 1}`
                );
              }
            } else {
              // Fallback to full video if scene detection failed
              await createSegmentForVideo(videoId, 0, null, 'Auto-scene fallback (full video)');
            }
            break;
            
          case 'manual':
            // Don't create any segments - user will do it manually
            break;
        }
             }
       
       // Refresh videos to ensure they're properly loaded
       await Promise.all([fetchVideos(), fetchSegments()]);
       
       // Give a small delay to ensure DB has fully processed
       await new Promise(resolve => setTimeout(resolve, 500));
       
       // Refresh one more time to ensure URLs are generated
       await fetchVideos();
       
       toast.success(`Successfully uploaded ${videoFiles.length} video(s)`);
     } catch (error) {
       console.error('Error uploading videos:', error);
       throw error;
     } finally {
       setIsUploading(false);
     }
  };

  // Helper function to upload just the video file
  const uploadVideoFile = async (file: File, userId: string): Promise<string> => {
    // Get video duration before upload
    const duration = await getVideoDuration(file);
    
    // Upload file to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    console.log('[Upload] Starting upload:', {
      originalFilename: file.name,
      storageFileName: fileName,
      fileSize: file.size,
      fileType: file.type,
      duration,
      userId
    });

    const { error: uploadError, data: uploadData } = await supabase.storage
      .from('training-data')
      .upload(fileName, file);

    if (uploadError) {
      console.error('[Upload] Storage upload error:', uploadError);
      throw uploadError;
    }

    console.log('[Upload] Storage upload successful:', uploadData);

    // Create database record
    const { data, error } = await supabase
      .from('training_data')
      .insert({
        user_id: userId,
        batch_id: selectedBatchId!,
        original_filename: file.name,
        storage_location: fileName,
        duration: Math.round(duration),
        metadata: {
          size: file.size,
          type: file.type,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('[Upload] Database insert error:', error);
      throw error;
    }

    console.log('[Upload] Database record created:', data);

    // Update local state
    setVideos(prev => [transformVideo(data), ...prev]);
    return data.id;
  };

  // Helper function to get video duration
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        console.log(`[GetVideoDuration] File: ${file.name}, Duration: ${video.duration} seconds`);
        resolve(video.duration);
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => {
        console.warn('Could not get video duration for:', file.name);
        resolve(0);
        URL.revokeObjectURL(video.src);
      };
      video.src = URL.createObjectURL(file);
    });
  };

  // Helper function to create segments for a video
  const createSegmentForVideo = async (
    videoId: string, 
    startTimeMs: number, 
    endTimeMs: number | null, 
    description: string
  ) => {
    // If endTimeMs is null, we need to get the video duration
    if (endTimeMs === null) {
      // First try to get duration from local state
      const localVideo = videos.find(v => v.id === videoId);
      if (localVideo?.duration) {
        console.log(`[CreateSegmentForVideo] Using local duration: ${localVideo.duration} seconds`);
        endTimeMs = Math.round(localVideo.duration * 1000);
      } else {
        // Fall back to database
        const { data, error } = await supabase
          .from('training_data')
          .select('duration')
          .eq('id', videoId)
          .single();
        
        if (!error && data?.duration) {
          console.log(`[CreateSegmentForVideo] Using database duration: ${data.duration} seconds`);
          endTimeMs = Math.round(data.duration * 1000);
        } else {
          console.warn(`[CreateSegmentForVideo] Could not get duration for video ${videoId}, using default 10 seconds`);
          // Default to 10 seconds if we can't get duration
          endTimeMs = 10000;
        }
      }
    }

    console.log(`[CreateSegmentForVideo] Final segment times: ${startTimeMs}ms - ${endTimeMs}ms (duration: ${endTimeMs - startTimeMs}ms)`);
    await createSegment(videoId, startTimeMs, endTimeMs, description);
  };

  const deleteVideo = async (id: string) => {
    try {
      const video = videos.find(v => v.id === id);
      if (!video) return;

      // Update local state immediately for instant UI feedback
      setVideos(prev => prev.filter(v => v.id !== id));
      setSegments(prev => prev.filter(s => s.trainingDataId !== id));
      
      // Clean up video URL from cache
      setVideoUrls(prev => {
        const newUrls = { ...prev };
        delete newUrls[id];
        return newUrls;
      });

      // Delete from database first (easier to rollback)
      const { error: dbError } = await supabase
        .from('training_data')
        .delete()
        .eq('id', id);

      if (dbError) {
        console.error('Database deletion error:', dbError);
        // Revert local state if database deletion fails
        await Promise.all([fetchVideos(), fetchSegments()]);
        throw dbError;
      }

      // Delete from storage (if this fails, file was probably already gone)
      const { error: storageError } = await supabase.storage
        .from('training-data')
        .remove([video.storageLocation]);

      if (storageError) {
        // Storage deletion failed - warn but don't fail the whole operation
        // The file might already be gone, which is what we wanted anyway
        console.warn('Storage deletion warning (file may already be deleted):', storageError);
      }

    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('Failed to delete video');
    }
  };

  const createSegment = async (
    trainingDataId: string,
    startTime: number,
    endTime: number,
    description?: string
  ): Promise<string> => {
    try {
      console.log('[CreateSegment] Attempting to create segment with data:', {
        training_data_id: trainingDataId,
        start_time: startTime,
        end_time: endTime,
        start_time_rounded: Math.round(startTime),
        end_time_rounded: Math.round(endTime),
        description,
        duration: endTime - startTime,
        duration_rounded: Math.round(endTime - startTime),
        selectedBatchId
      });

      // Verify the training data exists first
      const { data: trainingDataCheck, error: checkError } = await supabase
        .from('training_data')
        .select('id, batch_id')
        .eq('id', trainingDataId)
        .single();

      if (checkError) {
        console.error('[CreateSegment] Training data not found:', checkError);
        throw new Error(`Training data with ID ${trainingDataId} not found`);
      }

      console.log('[CreateSegment] Training data found:', trainingDataCheck);

      const { data, error } = await supabase
        .from('training_data_segments')
        .insert({
          training_data_id: trainingDataId,
          start_time: Math.round(startTime),
          end_time: Math.round(endTime),
          description,
          metadata: {
            duration: Math.round(endTime - startTime),
          },
        })
        .select()
        .single();

      if (error) {
        console.error('[CreateSegment] Supabase error details:', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      console.log('[CreateSegment] Segment created successfully:', data);

      // Update local state
      setSegments(prev => [transformSegment(data), ...prev]);
      return data.id;
    } catch (error) {
      console.error('[CreateSegment] Error creating segment:', error);
      throw error;
    }
  };

  const updateSegment = async (
    id: string,
    updates: Partial<{
      startTime: number;
      endTime: number;
      description: string;
    }>
  ) => {
    try {
      const { data, error } = await supabase
        .from('training_data_segments')
        .update({
          start_time: updates.startTime ? Math.round(updates.startTime) : undefined,
          end_time: updates.endTime ? Math.round(updates.endTime) : undefined,
          description: updates.description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setSegments(prev => prev.map(s => s.id === id ? transformSegment(data) : s));
    } catch (error) {
      console.error('Error updating segment:', error);
      toast.error('Failed to update segment');
    }
  };

  const deleteSegment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('training_data_segments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update local state
      setSegments(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error deleting segment:', error);
      toast.error('Failed to delete segment');
    }
  };

  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [invalidVideos, setInvalidVideos] = useState<Set<string>>(new Set());

  // Preload video URLs when videos change
  useEffect(() => {
    const loadVideoUrls = async () => {
      // Only process videos that don't have URLs yet
      const videosNeedingUrls = videos.filter(video => !videoUrls[video.id]);
      
      if (videosNeedingUrls.length === 0) return;
      
      const newUrls: Record<string, string> = {};
      
      // Process videos in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < videosNeedingUrls.length; i += batchSize) {
        const batch = videosNeedingUrls.slice(i, i + batchSize);
        
        batch.forEach((video) => {
          console.log(`[VideoURL] Processing video ${video.id} with storage location: ${video.storageLocation}`);
          
          // Generate public URL since bucket is now public
          const { data: publicData } = supabase.storage
            .from('training-data')
            .getPublicUrl(video.storageLocation);
          
          console.log(`[VideoURL] Generated public URL for ${video.id}: ${publicData.publicUrl}`);
          newUrls[video.id] = publicData.publicUrl;
        });
        
        // Update URLs after each batch
        if (Object.keys(newUrls).length > 0) {
          setVideoUrls(prev => ({
            ...prev,
            ...newUrls
          }));
        }
      }
    };

    if (videos.length > 0) {
      loadVideoUrls();
    }
  }, [videos]); // Don't include videoUrls to avoid circular dependency

  const getVideoUrl = (video: TrainingDataVideo): string => {
    // Check if this video is known to be invalid
    if (invalidVideos.has(video.id)) {
      console.log(`[getVideoUrl] Video ${video.id} is marked as invalid`);
      return '';
    }
    
    // Return cached URL if available
    if (videoUrls[video.id]) {
      console.log(`[getVideoUrl] Using cached URL for video ${video.id}: ${videoUrls[video.id]}`);
      return videoUrls[video.id];
    }
    
    // Generate public URL immediately since bucket is public
    const { data } = supabase.storage
      .from('training-data')
      .getPublicUrl(video.storageLocation);
    
    console.log(`[getVideoUrl] Generated public URL for video ${video.id}: ${data.publicUrl}`);
    return data.publicUrl;
  };

  const markVideoAsInvalid = (videoId: string) => {
    setInvalidVideos(prev => new Set([...prev, videoId]));
  };

  return {
    videos,
    segments,
    batches,
    selectedBatchId,
    isUploading,
    isLoading,
    uploadVideo,
    uploadVideosWithSplitModes,
    deleteVideo,
    createSegment,
    updateSegment,
    deleteSegment,
    getVideoUrl,
    markVideoAsInvalid,
    createBatch,
    updateBatch,
    deleteBatch,
    setSelectedBatchId,
  };
} 