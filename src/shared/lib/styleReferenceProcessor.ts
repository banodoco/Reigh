/**
 * Processes a style reference image to match project aspect ratio.
 * Always crops the image to fit the target aspect ratio (center-cropping).
 * Images are scaled to 1.5x the project resolution for higher quality style reference.
 */

import { parseRatio, ASPECT_RATIO_TO_RESOLUTION } from './aspectRatios';

/**
 * Gets the scaled dimensions (1.5x) for a given aspect ratio string
 * @param aspectRatioString The aspect ratio string (e.g., "16:9", "1:1")
 * @returns Object with scaled width and height, or null if invalid
 */
const getScaledDimensions = (aspectRatioString: string): { width: number; height: number } | null => {
  );
  
  // Direct lookup first (handles exact matches like "1:1", "16:9", etc.)
  if (ASPECT_RATIO_TO_RESOLUTION[aspectRatioString]) {
    const resolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatioString];
    const [width, height] = resolution.split('x').map(Number);
    const scaled = { width: Math.round(width * 1.5), height: Math.round(height * 1.5) };
    return scaled;
  }
  
  // Find the aspect ratio key that matches our target ratio numerically
  const targetRatio = parseRatio(aspectRatioString);
  if (isNaN(targetRatio)) {
    const resolution = ASPECT_RATIO_TO_RESOLUTION['1:1'] || '670x670';
    const [width, height] = resolution.split('x').map(Number);
    const scaled = { width: Math.round(width * 1.5), height: Math.round(height * 1.5) };
    return scaled;
  }

  const aspectRatioKey = Object.keys(ASPECT_RATIO_TO_RESOLUTION).find(key => {
    const keyRatio = parseRatio(key);
    const matches = !isNaN(keyRatio) && Math.abs(keyRatio - targetRatio) < 0.001;
    return matches;
  });

  if (!aspectRatioKey) {
    // Fallback to 1:1 if we can't find a match
    const resolution = ASPECT_RATIO_TO_RESOLUTION['1:1'] || '670x670';
    const [width, height] = resolution.split('x').map(Number);
    const scaled = { width: Math.round(width * 1.5), height: Math.round(height * 1.5) };
    return scaled;
  }

  const resolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatioKey];
  const [width, height] = resolution.split('x').map(Number);
  const scaled = { width: Math.round(width * 1.5), height: Math.round(height * 1.5) };
  return scaled;
};

/**
 * Processes a style reference image to match project aspect ratio at 1.5x scale.
 * Always crops the image to fit (center-cropping) - no padding/dead space added.
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
      if (aspectRatioString) {
        targetDimensions = getScaledDimensions(aspectRatioString);
        } else {
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
        // Original image is wider than target - crop the width
        if (targetDimensions) {
          canvasWidth = targetDimensions.width;
          canvasHeight = targetDimensions.height;
          // Scale to fill height, crop width (center horizontally)
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
      } else {
        // Original image is taller than target - crop the height
        if (targetDimensions) {
          canvasWidth = targetDimensions.width;
          canvasHeight = targetDimensions.height;
          // Scale to fill width, crop height (center vertically)
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

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(canvasWidth);
      canvas.height = Math.round(canvasHeight);
      });
      
      const ctx = canvas.getContext("2d");
      
      // Verify the context was created successfully
      if (ctx) {
        }

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Clear canvas before drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw the image with calculated dimensions and positioning (center-cropped to fill canvas)
      ctx.drawImage(
        img,
        0, 0, originalWidth, originalHeight, // source: full original image
        drawX, drawY, drawWidth, drawHeight // destination: scaled and positioned to fill canvas
      );

      // Debug: Check canvas dimensions after drawing
      // Convert to data URL
      const processedDataURL = canvas.toDataURL('image/png'); // Use PNG to preserve transparency
      
      // Debug: Check the dataURL dimensions by creating a test image
      const testImg = new Image();
      testImg.onload = () => {
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
