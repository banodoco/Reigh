/**
 * Processes a style reference image to match project aspect ratio.
 * Uses cropping when the image is larger than needed, or padding when smaller.
 * Padding uses empty (transparent) space to maintain the original image content.
 */

import { parseRatio } from './aspectRatios';

/**
 * Processes a style reference image to match project aspect ratio.
 * Uses cropping when the image is larger than needed, or padding when smaller.
 * Padding uses empty (transparent) space to maintain the original image content.
 * This function works with data URLs for processing - the result should be uploaded to storage.
 * 
 * @param dataURL The base64 data URL of the image
 * @param targetAspectRatio The target aspect ratio as a number (width / height)
 * @returns Promise with the processed image as a data URL (ready for upload)
 */
export const processStyleReferenceForAspectRatio = async (
  dataURL: string,
  targetAspectRatio: number
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

      // Calculate dimensions for the target aspect ratio
      let canvasWidth: number;
      let canvasHeight: number;
      let drawX = 0;
      let drawY = 0;
      let drawWidth = originalWidth;
      let drawHeight = originalHeight;

      if (Math.abs(originalAspectRatio - targetAspectRatio) < 0.001) {
        // Aspect ratios are essentially the same, no processing needed
        resolve(dataURL);
        return;
      }

      if (originalAspectRatio > targetAspectRatio) {
        // Original image is wider than target
        // We need to either crop the width or pad the height
        // Let's use a hybrid approach: if the difference is small, pad; if large, crop
        const aspectRatioDiff = originalAspectRatio / targetAspectRatio;
        
        if (aspectRatioDiff < 1.5) {
          // Small difference: pad the height
          canvasWidth = originalWidth;
          canvasHeight = originalWidth / targetAspectRatio;
          drawX = 0;
          drawY = (canvasHeight - originalHeight) / 2;
        } else {
          // Large difference: crop the width
          canvasHeight = originalHeight;
          canvasWidth = originalHeight * targetAspectRatio;
          drawX = 0;
          drawY = 0;
          drawWidth = canvasWidth;
          drawHeight = originalHeight;
        }
      } else {
        // Original image is taller than target
        // We need to either crop the height or pad the width
        const aspectRatioDiff = targetAspectRatio / originalAspectRatio;
        
        if (aspectRatioDiff < 1.5) {
          // Small difference: pad the width
          canvasHeight = originalHeight;
          canvasWidth = originalHeight * targetAspectRatio;
          drawX = (canvasWidth - originalWidth) / 2;
          drawY = 0;
        } else {
          // Large difference: crop the height
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
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Fill with transparent background for padding
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw the image (cropped or positioned for padding)
      if (originalAspectRatio > targetAspectRatio && (originalAspectRatio / targetAspectRatio) >= 1.5) {
        // Cropping case: draw cropped portion centered
        const cropX = (originalWidth - drawWidth) / 2;
        ctx.drawImage(
          img,
          cropX, 0, drawWidth, drawHeight, // source: cropped from center
          0, 0, canvas.width, canvas.height // destination: full canvas
        );
      } else {
        // Padding case: draw original image at calculated position
        ctx.drawImage(
          img,
          0, 0, originalWidth, originalHeight, // source: full original image
          drawX, drawY, originalWidth, originalHeight // destination: positioned on canvas
        );
      }

      // Convert to data URL
      const processedDataURL = canvas.toDataURL('image/png'); // Use PNG to preserve transparency
      resolve(processedDataURL);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image from data URL"));
    };

    img.src = dataURL;
  });
};

/**
 * Processes a style reference image from aspect ratio string (e.g., "16:9")
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
  
  return processStyleReferenceForAspectRatio(dataURL, targetAspectRatio);
};
