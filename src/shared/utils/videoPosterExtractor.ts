/**
 * Utility for extracting poster images (first frame) from video files
 */

/**
 * Extract the first frame of a video as a Blob
 * @param videoFile The video file to extract from
 * @returns Promise that resolves to a Blob of the poster image (JPEG)
 */
export async function extractVideoPosterFrame(videoFile: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    // When metadata is loaded, we can get dimensions
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Seek to a small time to avoid black frames at the start
      video.currentTime = 0.1;
    });

    // When we've seeked to the right time, capture the frame
    video.addEventListener('seeked', () => {
      try {
        // Draw the video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob from canvas'));
            }
            
            // Cleanup
            video.src = '';
            URL.revokeObjectURL(video.src);
          },
          'image/jpeg',
          0.85 // Quality
        );
      } catch (error) {
        reject(error);
      }
    });

    video.addEventListener('error', (e) => {
      reject(new Error('Failed to load video'));
    });

    // Load the video
    video.src = URL.createObjectURL(videoFile);
  });
}

