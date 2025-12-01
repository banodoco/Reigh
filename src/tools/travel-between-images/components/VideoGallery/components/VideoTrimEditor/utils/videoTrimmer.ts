/**
 * Video Trimmer Utility
 * 
 * Client-side video trimming using MediaRecorder API.
 * Extracts a portion of a video and generates a thumbnail from the first frame.
 */

import { supabase } from '@/integrations/supabase/client';
import { getDisplayUrl } from '@/shared/lib/utils';

/**
 * Fixes WebM duration metadata
 * MediaRecorder creates WebM files without proper duration, causing browsers to show Infinity
 * This function patches the EBML header with the correct duration
 */
async function fixWebmDuration(blob: Blob, durationSeconds: number): Promise<Blob> {
  const durationMs = durationSeconds * 1000;
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  
  // Find the Segment element and add/fix Duration in Info element
  // This is a simplified fix that works for most MediaRecorder output
  
  // Look for the Info element (ID: 0x1549A966) and Duration (ID: 0x4489)
  const bytes = new Uint8Array(buffer);
  
  // Search for the Info element start
  for (let i = 0; i < bytes.length - 100; i++) {
    // Look for Info element: 0x15 0x49 0xA9 0x66
    if (bytes[i] === 0x15 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0xA9 && bytes[i + 3] === 0x66) {
      // Found Info element, now look for Duration element or TimecodeScale
      for (let j = i + 4; j < Math.min(i + 200, bytes.length - 10); j++) {
        // Look for Duration: 0x44 0x89
        if (bytes[j] === 0x44 && bytes[j + 1] === 0x89) {
          // Found Duration element
          const sizeIdx = j + 2;
          const size = bytes[sizeIdx] & 0x7F; // Assuming 1-byte size indicator with 0x80 flag
          
          if (size === 8 || (bytes[sizeIdx] === 0x88)) {
            // 8-byte float duration
            const durationIdx = sizeIdx + 1;
            const durationView = new DataView(buffer, durationIdx, 8);
            durationView.setFloat64(0, durationMs, false); // Big-endian
            console.log('[VideoTrimmer] Fixed existing Duration at offset', durationIdx);
            return new Blob([buffer], { type: blob.type });
          }
        }
      }
      break;
    }
  }
  
  // If we couldn't find/fix the duration, return original blob
  // The duration will still be Infinity but at least the video works
  console.log('[VideoTrimmer] Could not find Duration element to fix');
  return blob;
}

export interface TrimResult {
  videoBlob: Blob;
  thumbnailBlob: Blob;
  duration: number; // Actual duration in seconds
}

/**
 * Extracts a thumbnail from a video at a specific time
 */
export async function extractThumbnailFromVideo(
  video: HTMLVideoElement,
  timeInSeconds: number = 0
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // Set canvas size to video dimensions (max 1280px width)
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;

    // Seek to the desired time
    const targetTime = Math.min(timeInSeconds, video.duration - 0.1);
    video.currentTime = Math.max(0.001, targetTime);

    const handleSeeked = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            video.removeEventListener('seeked', handleSeeked);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob from canvas'));
            }
          },
          'image/jpeg',
          0.85
        );
      } catch (error) {
        video.removeEventListener('seeked', handleSeeked);
        reject(error);
      }
    };

    video.addEventListener('seeked', handleSeeked);
  });
}

/**
 * Trims a video using canvas recording approach
 * This captures frames and audio (if available) within the specified range
 */
export async function trimVideoClient(
  sourceUrl: string,
  startTime: number,
  endTime: number,
  onProgress?: (progress: number) => void
): Promise<TrimResult> {
  console.log('[VideoTrimmer] Starting trim:', { sourceUrl: sourceUrl.substring(0, 50), startTime, endTime });

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = false; // Keep audio
    video.playsInline = true;

    let mediaRecorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let thumbnailBlob: Blob | null = null;

    const cleanup = () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      video.pause();
      video.src = '';
      video.load();
    };

    video.addEventListener('error', (e) => {
      console.error('[VideoTrimmer] Video load error:', video.error);
      cleanup();
      reject(new Error(`Video loading failed: ${video.error?.message || 'Unknown error'}`));
    });

    video.addEventListener('loadedmetadata', async () => {
      console.log('[VideoTrimmer] Video loaded:', {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });

      try {
        // First, extract thumbnail from the start of the trimmed portion
        video.currentTime = startTime;

        await new Promise<void>((resolveSeek) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolveSeek();
          };
          video.addEventListener('seeked', onSeeked);
        });

        // Capture thumbnail
        thumbnailBlob = await extractThumbnailFromVideo(video, startTime);
        console.log('[VideoTrimmer] Thumbnail extracted:', thumbnailBlob.size);

        // Now set up video capture using canvas + MediaRecorder
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        // Create a stream from the canvas
        const canvasStream = canvas.captureStream(30); // 30 FPS

        // Try to capture audio track from video
        try {
          // Create audio context to capture audio
          const audioContext = new AudioContext();
          const source = audioContext.createMediaElementSource(video);
          const destination = audioContext.createMediaStreamDestination();
          source.connect(destination);
          source.connect(audioContext.destination); // Also play to speakers (muted by default)

          // Add audio track to canvas stream
          const audioTrack = destination.stream.getAudioTracks()[0];
          if (audioTrack) {
            canvasStream.addTrack(audioTrack);
          }
        } catch (audioError) {
          console.warn('[VideoTrimmer] Could not capture audio:', audioError);
          // Continue without audio
        }

        // Set up MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';

        mediaRecorder = new MediaRecorder(canvasStream, {
          mimeType,
          videoBitsPerSecond: 5000000, // 5 Mbps
        });

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          console.log('[VideoTrimmer] Recording stopped, chunks:', chunks.length);
          const videoBlob = new Blob(chunks, { type: mimeType });
          const actualDuration = endTime - startTime;

          if (!thumbnailBlob) {
            reject(new Error('Thumbnail not captured'));
            return;
          }

          // Fix WebM duration metadata
          let fixedVideoBlob = videoBlob;
          if (mimeType.includes('webm')) {
            try {
              fixedVideoBlob = await fixWebmDuration(videoBlob, actualDuration);
              console.log('[VideoTrimmer] WebM duration fixed');
            } catch (fixError) {
              console.warn('[VideoTrimmer] Could not fix WebM duration:', fixError);
              // Continue with unfixed blob
            }
          }

          resolve({
            videoBlob: fixedVideoBlob,
            thumbnailBlob,
            duration: actualDuration,
          });
        };

        // Start recording
        mediaRecorder.start(100); // Collect data every 100ms
        console.log('[VideoTrimmer] Recording started');

        // Play video from start time
        video.currentTime = startTime;
        await video.play();

        // Draw frames to canvas
        const drawFrame = () => {
          if (video.currentTime >= endTime || video.ended || video.paused) {
            // Stop recording
            video.pause();
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Report progress
          if (onProgress) {
            const duration = endTime - startTime;
            const elapsed = video.currentTime - startTime;
            const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));
            onProgress(progress);
          }

          requestAnimationFrame(drawFrame);
        };

        requestAnimationFrame(drawFrame);

        // Stop when we reach the end time
        video.addEventListener('timeupdate', () => {
          if (video.currentTime >= endTime) {
            video.pause();
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                  mediaRecorder.stop();
                }
              }, 100); // Small delay to capture final frames
            }
          }
        });
      } catch (error) {
        console.error('[VideoTrimmer] Processing error:', error);
        cleanup();
        reject(error);
      }
    });

    // Start loading
    video.src = getDisplayUrl(sourceUrl);
  });
}

/**
 * Uploads a blob to Supabase storage
 */
export async function uploadBlobToStorage(
  blob: Blob,
  projectId: string,
  fileName: string,
  folder: string = 'variants'
): Promise<string> {
  const filePath = `${projectId}/${folder}/${fileName}`;

  console.log('[VideoTrimmer] Uploading:', {
    filePath,
    blobSize: blob.size,
    blobType: blob.type,
  });

  const { error } = await supabase.storage
    .from('image_uploads')
    .upload(filePath, blob, {
      contentType: blob.type,
      upsert: true,
    });

  if (error) {
    console.error('[VideoTrimmer] Upload failed:', error);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('image_uploads')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Complete trim workflow: trim video, upload both files, return URLs
 */
export async function trimAndUploadVideo(
  sourceUrl: string,
  startTime: number,
  endTime: number,
  projectId: string,
  generationId: string,
  onProgress?: (progress: number) => void
): Promise<{ videoUrl: string; thumbnailUrl: string; duration: number }> {
  // Step 1: Trim video and extract thumbnail
  onProgress?.(5);
  const { videoBlob, thumbnailBlob, duration } = await trimVideoClient(
    sourceUrl,
    startTime,
    endTime,
    (progress) => onProgress?.(5 + progress * 0.7) // 5-75%
  );

  // Step 2: Upload thumbnail
  onProgress?.(80);
  const timestamp = Date.now();
  const thumbnailFileName = `${generationId}-trimmed-${timestamp}-thumb.jpg`;
  const thumbnailUrl = await uploadBlobToStorage(
    thumbnailBlob,
    projectId,
    thumbnailFileName,
    'thumbnails'
  );

  // Step 3: Upload video
  onProgress?.(90);
  const videoExtension = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const videoFileName = `${generationId}-trimmed-${timestamp}.${videoExtension}`;
  const videoUrl = await uploadBlobToStorage(videoBlob, projectId, videoFileName, 'variants');

  onProgress?.(100);
  console.log('[VideoTrimmer] Trim and upload complete:', {
    videoUrl: videoUrl.substring(0, 50),
    thumbnailUrl: thumbnailUrl.substring(0, 50),
    duration,
  });

  return { videoUrl, thumbnailUrl, duration };
}

