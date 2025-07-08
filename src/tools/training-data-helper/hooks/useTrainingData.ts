import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Database types (snake_case)
interface TrainingDataVideoDB {
  id: string;
  original_filename: string;
  storage_location: string;
  duration: number | null;
  metadata: any;
  created_at: string;
  updated_at: string | null;
  user_id: string;
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
export interface TrainingDataVideo {
  id: string;
  originalFilename: string;
  storageLocation: string;
  duration: number | null;
  metadata: any;
  createdAt: string;
  updatedAt: string | null;
  userId: string;
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
const transformVideo = (video: TrainingDataVideoDB): TrainingDataVideo => ({
  id: video.id,
  originalFilename: video.original_filename,
  storageLocation: video.storage_location,
  duration: video.duration,
  metadata: video.metadata,
  createdAt: video.created_at,
  updatedAt: video.updated_at,
  userId: video.user_id,
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
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch videos on mount
  useEffect(() => {
    fetchVideos();
    fetchSegments();
  }, []);

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('training_data')
        .select('*')
        .order('created_at', { ascending: false });

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

  const uploadVideo = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

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

      // Test both URL generation methods immediately
      const { data: publicUrlData } = supabase.storage
        .from('training-data')
        .getPublicUrl(fileName);
      
      console.log('[Upload] Generated public URL for uploaded video:', publicUrlData.publicUrl);

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('training-data')
        .createSignedUrl(fileName, 3600);
      
      if (signedUrlError) {
        console.error('[Upload] Failed to create signed URL:', signedUrlError);
      } else {
        console.log('[Upload] Generated signed URL for uploaded video:', signedUrlData.signedUrl);
      }

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

  const deleteVideo = async (id: string) => {
    try {
      const video = videos.find(v => v.id === id);
      if (!video) return;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('training-data')
        .remove([video.storageLocation]);

      if (storageError) throw storageError;

      // Delete from database
      const { error } = await supabase
        .from('training_data')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update local state
      setVideos(prev => prev.filter(v => v.id !== id));
      setSegments(prev => prev.filter(s => s.trainingDataId !== id));
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
      const { data, error } = await supabase
        .from('training_data_segments')
        .insert({
          training_data_id: trainingDataId,
          start_time: startTime,
          end_time: endTime,
          description,
          metadata: {
            duration: endTime - startTime,
          },
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setSegments(prev => [transformSegment(data), ...prev]);
      return data.id;
    } catch (error) {
      console.error('Error creating segment:', error);
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
          start_time: updates.startTime,
          end_time: updates.endTime,
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

  // Preload video URLs when videos change
  useEffect(() => {
    const loadVideoUrls = async () => {
      for (const video of videos) {
        if (!videoUrls[video.id]) {
          try {
            // Try signed URL first (works better with RLS policies)
            const { data: signedData, error: signedError } = await supabase.storage
              .from('training-data')
              .createSignedUrl(video.storageLocation, 3600); // 1 hour expiry

            if (signedError) {
              console.error('[VideoURL] Signed URL creation failed:', signedError);
              
              // Fallback to public URL
              const { data: publicData } = supabase.storage
                .from('training-data')
                .getPublicUrl(video.storageLocation);
              
              console.log('[VideoURL] Falling back to public URL:', {
                videoId: video.id,
                originalFilename: video.originalFilename,
                storageLocation: video.storageLocation,
                publicUrl: publicData.publicUrl
              });
              
              setVideoUrls(prev => ({
                ...prev,
                [video.id]: publicData.publicUrl
              }));
            } else {
              console.log('[VideoURL] Signed URL created:', {
                videoId: video.id,
                originalFilename: video.originalFilename,
                storageLocation: video.storageLocation,
                signedUrl: signedData.signedUrl
              });
              
              setVideoUrls(prev => ({
                ...prev,
                [video.id]: signedData.signedUrl
              }));
            }
          } catch (error) {
            console.error('[VideoURL] Error generating URL for video:', video.id, error);
          }
        }
      }
    };

    if (videos.length > 0) {
      loadVideoUrls();
    }
  }, [videos, videoUrls]);

  const getVideoUrl = (video: TrainingDataVideo): string => {
    return videoUrls[video.id] || '';
  };

  return {
    videos,
    segments,
    isUploading,
    isLoading,
    uploadVideo,
    deleteVideo,
    createSegment,
    updateSegment,
    deleteSegment,
    getVideoUrl,
  };
} 