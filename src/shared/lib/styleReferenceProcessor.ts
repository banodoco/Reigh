/**
 * Processes a style reference image to match project aspect ratio.
 * Uses cropping when the image is larger than needed, or padding when smaller.
 * Padding uses empty (transparent) space to maintain the original image content.
 * Images are scaled to 1.5x the project resolution for higher quality style reference.
 */

import { parseRatio, ASPECT_RATIO_TO_RESOLUTION } from './aspectRatios';

/**
 * Gets the scaled dimensions (1.5x) for a given aspect ratio string
 * @param aspectRatioString The aspect ratio string (e.g., "16:9", "1:1")
 * @returns Object with scaled width and height, or null if invalid
 */
const getScaledDimensions = (aspectRatioString: string): { width: number; height: number } | null => {
  console.log('[StyleRefDebug] getScaledDimensions called with aspectRatioString:', aspectRatioString);
  console.log('[StyleRefDebug] Available aspect ratios:', Object.keys(ASPECT_RATIO_TO_RESOLUTION));
  
  // Direct lookup first (handles exact matches like "1:1", "16:9", etc.)
  if (ASPECT_RATIO_TO_RESOLUTION[aspectRatioString]) {
    const resolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatioString];
    const [width, height] = resolution.split('x').map(Number);
    const scaled = { width: Math.round(width * 1.5), height: Math.round(height * 1.5) };
    console.log('[StyleRefDebug] Direct match found:', aspectRatioString, resolution, '->', scaled);
    return scaled;
  }
  
  // Find the aspect ratio key that matches our target ratio numerically
  const targetRatio = parseRatio(aspectRatioString);
  console.log('[StyleRefDebug] Target ratio parsed as:', targetRatio);
  
  if (isNaN(targetRatio)) {
    console.log('[StyleRefDebug] Invalid aspect ratio string, using fallback 1:1');
    const resolution = ASPECT_RATIO_TO_RESOLUTION['1:1'] || '670x670';
    const [width, height] = resolution.split('x').map(Number);
    const scaled = { width: Math.round(width * 1.5), height: Math.round(height * 1.5) };
    console.log('[StyleRefDebug] Fallback dimensions:', resolution, '->', scaled);
    return scaled;
  }

  const aspectRatioKey = Object.keys(ASPECT_RATIO_TO_RESOLUTION).find(key => {
    const keyRatio = parseRatio(key);
    const matches = !isNaN(keyRatio) && Math.abs(keyRatio - targetRatio) < 0.001;
    console.log('[StyleRefDebug] Checking key:', key, 'keyRatio:', keyRatio, 'matches:', matches);
    return matches;
  });

  console.log('[StyleRefDebug] Found aspectRatioKey:', aspectRatioKey);

  if (!aspectRatioKey) {
    // Fallback to 1:1 if we can't find a match
    console.log('[StyleRefDebug] No numerical match found, using fallback 1:1');
    const resolution = ASPECT_RATIO_TO_RESOLUTION['1:1'] || '670x670';
    const [width, height] = resolution.split('x').map(Number);
    const scaled = { width: Math.round(width * 1.5), height: Math.round(height * 1.5) };
    console.log('[StyleRefDebug] Fallback dimensions:', resolution, '->', scaled);
    return scaled;
  }

  const resolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatioKey];
  const [width, height] = resolution.split('x').map(Number);
  const scaled = { width: Math.round(width * 1.5), height: Math.round(height * 1.5) };
  console.log('[StyleRefDebug] Matched dimensions:', resolution, '->', scaled);
  return scaled;
};

/**
 * Processes a style reference image to match project aspect ratio at 1.5x scale.
 * Uses cropping when the image is larger than needed, or padding when smaller.
 * Padding uses empty (transparent) space to maintain the original image content.
 * This function works with data URLs for processing - the result should be uploaded to storage.
 * 
 * @param dataURL The base64 data URL of the image
 * @param targetAspectRatio The target aspect ratio as a number (width / height)
 * @param aspectRatioString Optional aspect ratio string for dimension lookup (e.g., "16:9")
 * @returns Promise with the processed image as a data URL (ready for upload)
 */
export const processStyleReferenceForAspectRatio = async (
  dataURL: string,
  targetAspectRatio: number,
  aspectRatioString?: string
): Promise<string | null> => {
  if (isNaN(targetAspectRatio) || targetAspectRatio <= 0) {
    console.error("Invalid target aspect ratio.");
    return null;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const originalWidth = img.width;
      const originalHeight = img.height;
      const originalAspectRatio = originalWidth / originalHeight;

      // Get target dimensions (1.5x project resolution) if aspect ratio string is provided
      let targetDimensions: { width: number; height: number } | null = null;
      console.log('[StyleRefDebug] processStyleReferenceForAspectRatio called with aspectRatioString:', aspectRatioString);
      if (aspectRatioString) {
        targetDimensions = getScaledDimensions(aspectRatioString);
        console.log('[StyleRefDebug] Target dimensions calculated:', targetDimensions);
      } else {
        console.log('[StyleRefDebug] No aspectRatioString provided, will use legacy behavior');
      }

      // Calculate dimensions for the target aspect ratio
      let canvasWidth: number;
      let canvasHeight: number;
      let drawX = 0;
      let drawY = 0;
      let drawWidth = originalWidth;
      let drawHeight = originalHeight;

      if (Math.abs(originalAspectRatio - targetAspectRatio) < 0.001) {
        // Aspect ratios are essentially the same, but still scale to target dimensions if available
        if (targetDimensions) {
          canvasWidth = targetDimensions.width;
          canvasHeight = targetDimensions.height;
          // Scale the original image to fit the target dimensions
          const scaleX = canvasWidth / originalWidth;
          const scaleY = canvasHeight / originalHeight;
          const scale = Math.min(scaleX, scaleY);
          
          drawWidth = originalWidth * scale;
          drawHeight = originalHeight * scale;
          drawX = (canvasWidth - drawWidth) / 2;
          drawY = (canvasHeight - drawHeight) / 2;
        } else {
          resolve(dataURL);
          return;
        }
      }

      else if (originalAspectRatio > targetAspectRatio) {
        // Original image is wider than target
        // We need to either crop the width or pad the height
        // Let's use a hybrid approach: if the difference is small, pad; if large, crop
        const aspectRatioDiff = originalAspectRatio / targetAspectRatio;
        
        if (aspectRatioDiff < 1.5) {
          // Small difference: pad the height
          if (targetDimensions) {
            canvasWidth = targetDimensions.width;
            canvasHeight = targetDimensions.height;
            // Scale and center the image
            const scale = Math.min(canvasWidth / originalWidth, canvasHeight / originalHeight);
            drawWidth = originalWidth * scale;
            drawHeight = originalHeight * scale;
            drawX = (canvasWidth - drawWidth) / 2;
            drawY = (canvasHeight - drawHeight) / 2;
          } else {
            canvasWidth = originalWidth;
            canvasHeight = originalWidth / targetAspectRatio;
            drawX = 0;
            drawY = (canvasHeight - originalHeight) / 2;
          }
        } else {
          // Large difference: crop the width
          if (targetDimensions) {
            canvasWidth = targetDimensions.width;
            canvasHeight = targetDimensions.height;
            // Scale to fill height, crop width
            const scale = canvasHeight / originalHeight;
            drawWidth = originalWidth * scale;
            drawHeight = canvasHeight;
            drawX = (canvasWidth - drawWidth) / 2;
            drawY = 0;
          } else {
            canvasHeight = originalHeight;
            canvasWidth = originalHeight * targetAspectRatio;
            drawX = 0;
            drawY = 0;
            drawWidth = canvasWidth;
            drawHeight = originalHeight;
          }
        }
      } else {
        // Original image is taller than target
        // We need to either crop the height or pad the width
        const aspectRatioDiff = targetAspectRatio / originalAspectRatio;
        
        if (aspectRatioDiff < 1.5) {
          // Small difference: pad the width
          if (targetDimensions) {
            canvasWidth = targetDimensions.width;
            canvasHeight = targetDimensions.height;
            // Scale and center the image
            const scale = Math.min(canvasWidth / originalWidth, canvasHeight / originalHeight);
            drawWidth = originalWidth * scale;
            drawHeight = originalHeight * scale;
            drawX = (canvasWidth - drawWidth) / 2;
            drawY = (canvasHeight - drawHeight) / 2;
          } else {
            canvasHeight = originalHeight;
            canvasWidth = originalHeight * targetAspectRatio;
            drawX = (canvasWidth - originalWidth) / 2;
            drawY = 0;
          }
        } else {
          // Large difference: crop the height
          if (targetDimensions) {
            canvasWidth = targetDimensions.width;
            canvasHeight = targetDimensions.height;
            // Scale to fill width, crop height
            const scale = canvasWidth / originalWidth;
            drawWidth = canvasWidth;
            drawHeight = originalHeight * scale;
            drawX = 0;
            drawY = (canvasHeight - drawHeight) / 2;
          } else {
            canvasWidth = originalWidth;
            canvasHeight = originalWidth / targetAspectRatio;
            drawX = 0;
            drawY = 0;
            drawWidth = originalWidth;
            drawHeight = canvasHeight;
          }
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(canvasWidth);
      canvas.height = Math.round(canvasHeight);
      console.log('[StyleRefDebug] Final canvas dimensions:', canvas.width, 'x', canvas.height);
      console.log('[StyleRefDebug] Browser info:', {
        devicePixelRatio: window.devicePixelRatio,
        maxCanvasSize: 'unknown', // We'll see if this is an issue
        userAgent: navigator.userAgent.slice(0, 100)
      });
      
      const ctx = canvas.getContext("2d");
      
      // Verify the context was created successfully
      if (ctx) {
        console.log('[StyleRefDebug] Canvas context created successfully');
      }

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Fill with transparent background for padding
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw the image with calculated dimensions and positioning
      ctx.drawImage(
        img,
        0, 0, originalWidth, originalHeight, // source: full original image
        drawX, drawY, drawWidth, drawHeight // destination: scaled and positioned on canvas
      );

      // Debug: Check canvas dimensions after drawing
      console.log('[StyleRefDebug] Canvas dimensions after drawing:', canvas.width, 'x', canvas.height);
      console.log('[StyleRefDebug] Draw parameters:', { drawX, drawY, drawWidth, drawHeight });

      // Convert to data URL
      const processedDataURL = canvas.toDataURL('image/png'); // Use PNG to preserve transparency
      
      // Debug: Check the dataURL dimensions by creating a test image
      const testImg = new Image();
      testImg.onload = () => {
        console.log('[StyleRefDebug] DataURL image dimensions:', testImg.width, 'x', testImg.height);
      };
      testImg.src = processedDataURL;
      
      resolve(processedDataURL);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image from data URL"));
    };

    img.src = dataURL;
  });
};

/**
 * Processes a style reference image from aspect ratio string (e.g., "16:9") at 1.5x scale
 * 
 * @param dataURL The base64 data URL of the image
 * @param aspectRatioString The aspect ratio string (e.g., "16:9", "1:1")
 * @returns Promise with the processed image as a data URL
 */
export const processStyleReferenceForAspectRatioString = async (
  dataURL: string,
  aspectRatioString: string
): Promise<string | null> => {
  const targetAspectRatio = parseRatio(aspectRatioString);
  if (isNaN(targetAspectRatio)) {
    console.error("Invalid aspect ratio string:", aspectRatioString);
    return null;
  }
  
  return processStyleReferenceForAspectRatio(dataURL, targetAspectRatio, aspectRatioString);
};
