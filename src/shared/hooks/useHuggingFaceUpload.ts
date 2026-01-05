import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

interface LoraDetails {
  name: string;
  description?: string;
  baseModel: string;
  triggerWord?: string;
  creatorName?: string;
}

/**
 * LoRA files structure supporting both single-stage and multi-stage uploads
 */
export interface LoraFiles {
  single?: File;      // For single-stage LoRAs
  highNoise?: File;   // For multi-stage: high noise phase file
  lowNoise?: File;    // For multi-stage: low noise phase file
}

interface UploadProgress {
  stage:
    | 'idle'
    | 'uploading-lora'        // Single-stage upload
    | 'uploading-high-noise'  // Multi-stage: uploading high noise file
    | 'uploading-low-noise'   // Multi-stage: uploading low noise file
    | 'uploading-samples'
    | 'processing'
    | 'complete'
    | 'error';
  message: string;
  progress?: number; // 0-100
}

interface UploadResult {
  success: boolean;
  repoId?: string;
  repoUrl?: string;
  loraUrl?: string;         // For single-stage
  highNoiseUrl?: string;    // For multi-stage
  lowNoiseUrl?: string;     // For multi-stage
  videoUrls?: string[];
  error?: string;
}

/**
 * Hook to handle uploading LoRA files to HuggingFace via our Edge Function
 */
export function useHuggingFaceUpload() {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: 'idle',
    message: '',
  });

  /**
   * Upload a file to the temporary storage bucket
   */
  const uploadToTempStorage = async (file: File, userId: string): Promise<string> => {
    const fileName = `${uuidv4()}-${file.name}`;
    const filePath = `${userId}/${fileName}`;

    const { error } = await supabase.storage
      .from('temporary')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    return filePath;
  };

  /**
   * Upload LoRA file(s) and optionally sample videos to HuggingFace
   * Supports both single-stage (one file) and multi-stage (high_noise + low_noise) LoRAs
   */
  const uploadToHuggingFace = async (
    loraFiles: LoraFiles,
    loraDetails: LoraDetails,
    sampleVideos: File[] = [],
    options: {
      isPrivate?: boolean;
      repoName?: string;
    } = {}
  ): Promise<UploadResult> => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Determine if this is a multi-stage upload
      const isMultiStage = !!(loraFiles.highNoise || loraFiles.lowNoise);
      const storagePaths: { single?: string; highNoise?: string; lowNoise?: string } = {};

      // 1. Upload LoRA file(s) to temporary storage
      if (isMultiStage) {
        // Multi-stage: upload high noise and/or low noise files
        if (loraFiles.highNoise) {
          setUploadProgress({
            stage: 'uploading-high-noise',
            message: 'Uploading high noise LoRA file...',
            progress: 10,
          });
          storagePaths.highNoise = await uploadToTempStorage(loraFiles.highNoise, user.id);
        }

        if (loraFiles.lowNoise) {
          setUploadProgress({
            stage: 'uploading-low-noise',
            message: 'Uploading low noise LoRA file...',
            progress: loraFiles.highNoise ? 20 : 10,
          });
          storagePaths.lowNoise = await uploadToTempStorage(loraFiles.lowNoise, user.id);
        }
      } else if (loraFiles.single) {
        // Single-stage: upload single file
        setUploadProgress({
          stage: 'uploading-lora',
          message: 'Uploading LoRA file...',
          progress: 10,
        });
        storagePaths.single = await uploadToTempStorage(loraFiles.single, user.id);
      } else {
        return { success: false, error: 'No LoRA file provided' };
      }

      // 2. Upload sample videos to temporary storage
      const sampleVideoMeta: { storagePath: string; originalFileName: string }[] = [];

      if (sampleVideos.length > 0) {
        setUploadProgress({
          stage: 'uploading-samples',
          message: `Uploading sample videos (0/${sampleVideos.length})...`,
          progress: 30,
        });

        for (let i = 0; i < sampleVideos.length; i++) {
          const video = sampleVideos[i];
          setUploadProgress({
            stage: 'uploading-samples',
            message: `Uploading sample videos (${i + 1}/${sampleVideos.length})...`,
            progress: 30 + (i / sampleVideos.length) * 20,
          });

          const videoPath = await uploadToTempStorage(video, user.id);
          sampleVideoMeta.push({
            storagePath: videoPath,
            originalFileName: video.name,
          });
        }
      }

      // 3. Call Edge Function to upload to HuggingFace
      setUploadProgress({
        stage: 'processing',
        message: 'Uploading to HuggingFace...',
        progress: 60,
      });

      const formData = new FormData();
      // Use new multi-file format
      formData.append('loraStoragePaths', JSON.stringify(storagePaths));
      formData.append('loraDetails', JSON.stringify(loraDetails));
      formData.append('sampleVideos', JSON.stringify(sampleVideoMeta));
      if (options.isPrivate !== undefined) {
        formData.append('isPrivate', String(options.isPrivate));
      }
      if (options.repoName) {
        formData.append('repoName', options.repoName);
      }

      const { data, error } = await supabase.functions.invoke('huggingface-upload', {
        body: formData,
      });

      if (error) {
        throw new Error(error.message || 'Edge function error');
      }

      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadProgress({
        stage: 'complete',
        message: 'Upload complete!',
        progress: 100,
      });

      return {
        success: true,
        repoId: data.repoId,
        repoUrl: data.repoUrl,
        loraUrl: data.loraUrl,
        highNoiseUrl: data.highNoiseUrl,
        lowNoiseUrl: data.lowNoiseUrl,
        videoUrls: data.videoUrls,
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setUploadProgress({
        stage: 'error',
        message: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  };

  const resetProgress = () => {
    setUploadProgress({ stage: 'idle', message: '' });
  };

  return {
    uploadToHuggingFace,
    uploadProgress,
    resetProgress,
    isUploading: [
      'uploading-lora',
      'uploading-high-noise',
      'uploading-low-noise',
      'uploading-samples',
      'processing'
    ].includes(uploadProgress.stage),
  };
}
