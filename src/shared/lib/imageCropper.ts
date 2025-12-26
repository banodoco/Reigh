export interface CropResult {
  croppedFile: File;
  apiImageSize: string;
  croppedImageUrl: string;
}

export interface ProjectCropResult {
  croppedFile: File;
  croppedImageUrl: string;
}

interface TargetAspectRatio {
  name: string; // For UI or internal reference
  apiString: string;
  ratio: number; // width / height
}

// Based on the UI and the example API call (portrait_16_9)
// Corrected apiString values based on Fal AI documentation
const TARGET_ASPECT_RATIOS: TargetAspectRatio[] = [
  { name: "Square", apiString: "square", ratio: 1.0 },
  { name: "Square HD", apiString: "square_hd", ratio: 1.0 }, // Added Square HD as it's a valid API enum
  { name: "Portrait 4:3", apiString: "portrait_4_3", ratio: 3 / 4 }, // Corrected (formerly portrait_3_4, ratio is 3/4 width/height)
  { name: "Portrait 16:9", apiString: "portrait_16_9", ratio: 9 / 16 },// Corrected (formerly portrait_9_16, ratio is 9/16 width/height)
  { name: "Landscape 4:3", apiString: "landscape_4_3", ratio: 4 / 3 },
  { name: "Landscape 16:9", apiString: "landscape_16_9", ratio: 16 / 9 },
];

// Tolerance for aspect ratio matching - if within this, skip re-encoding
const ASPECT_RATIO_TOLERANCE = 0.01;

export const cropImageToClosestAspectRatio = async (
  inputFile: File
): Promise<CropResult | null> => {
  // Mobile browsers (especially iOS) sometimes provide files with an empty MIME type
  // or HEIC/HEIF types. Treat known image extensions as images even if MIME is missing.
  const hasImageMime = typeof inputFile.type === 'string' && inputFile.type.startsWith('image/');
  const looksLikeImageByName = typeof inputFile.name === 'string' && /\.(heic|heif|jpg|jpeg|png|webp|gif|bmp|tif|tiff)$/i.test(inputFile.name);
  if (!hasImageMime && !looksLikeImageByName) {
    console.error("Invalid file type. Only images are allowed.");
    return null;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        const originalAspectRatio = originalWidth / originalHeight;

        let closestTarget: TargetAspectRatio = TARGET_ASPECT_RATIOS[0];
        let minDiff = Infinity;

        for (const target of TARGET_ASPECT_RATIOS) {
          const diff = Math.abs(originalAspectRatio - target.ratio);
          if (diff < minDiff) {
            minDiff = diff;
            closestTarget = target;
          }
        }

        // If aspect ratio already matches within tolerance, skip re-encoding to preserve quality
        if (minDiff < ASPECT_RATIO_TOLERANCE) {
          console.log(`[ImageCropper] Aspect ratio matches ${closestTarget.name} within tolerance, skipping re-encode`);
          const croppedImageUrl = URL.createObjectURL(inputFile);
          resolve({
            croppedFile: inputFile,
            apiImageSize: closestTarget.apiString,
            croppedImageUrl,
          });
          return;
        }

        let cropX = 0;
        let cropY = 0;
        let newCanvasWidth = originalWidth;
        let newCanvasHeight = originalHeight;

        // Calculate new dimensions for cropping, maintaining center
        if (originalAspectRatio > closestTarget.ratio) {
          // Original image is wider than target, crop width
          newCanvasWidth = originalHeight * closestTarget.ratio;
          newCanvasHeight = originalHeight;
          cropX = (originalWidth - newCanvasWidth) / 2;
        } else if (originalAspectRatio < closestTarget.ratio) {
          // Original image is taller than target, crop height
          newCanvasWidth = originalWidth;
          newCanvasHeight = originalWidth / closestTarget.ratio;
          cropY = (originalHeight - newCanvasHeight) / 2;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(newCanvasWidth);
        canvas.height = Math.round(newCanvasHeight);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Use high-quality image smoothing for any scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw the cropped portion of the image onto the canvas
        ctx.drawImage(
          img,
          cropX, // source X
          cropY, // source Y
          newCanvasWidth, // source width
          newCanvasHeight, // source height
          0, // destination X
          0, // destination Y
          canvas.width, // destination width
          canvas.height // destination height
        );

        // Preserve original format, fallback to JPEG for unsupported types
        const outputMime = /^(image\/(jpeg|png|webp))$/i.test(inputFile.type)
          ? inputFile.type
          : 'image/jpeg';

        // Use maximum quality (1.0) for JPEG/WebP to minimize quality loss
        const quality = 1.0;

        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              // Some browsers (especially mobile Safari/Chrome) return null when asked
              // to encode to an unsupported format (e.g. HEIC). Fallback by creating a
              // Data URL and converting that back into a Blob encoded as JPEG.
              try {
                const dataUrl = canvas.toDataURL(outputMime, quality);
                blob = await (await fetch(dataUrl)).blob();
              } catch (err) {
                reject(new Error("Failed to create blob from canvas"));
                return;
              }
            }

            const fileExt = outputMime === 'image/png' ? 'png' : outputMime === 'image/webp' ? 'webp' : 'jpg';
            const safeName = inputFile.name.replace(/\.[^/.]+$/, `.${fileExt}`);
            const croppedFile = new File([blob], safeName, {
              type: outputMime,
              lastModified: Date.now(),
            });
            const croppedImageUrl = URL.createObjectURL(croppedFile);
            resolve({
              croppedFile,
              apiImageSize: closestTarget.apiString,
              croppedImageUrl,
            });
          },
          outputMime,
          quality
        );
      };
      img.onerror = (err) => {
        reject(new Error("Failed to load image: " + err));
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      } else {
        reject(new Error("Failed to read file for cropping."));
      }
    };
    reader.onerror = (err) => {
      reject(new Error("FileReader error: " + err));
    };
    reader.readAsDataURL(inputFile);
  });
};

/**
 * Crops an image to a specific aspect ratio (for project dimensions).
 * Preserves quality by:
 * - Skipping re-encoding if aspect ratio already matches
 * - Using maximum quality (1.0) when re-encoding is necessary
 * - Preserving original format (PNG/WebP stay lossless)
 *
 * @param inputFile The image file to crop
 * @param targetAspectRatio The target aspect ratio as a number (width / height)
 * @returns Promise with the cropped file and image URL
 */
export const cropImageToProjectAspectRatio = async (
  inputFile: File,
  targetAspectRatio: number
): Promise<ProjectCropResult | null> => {
  // Mobile browsers (especially iOS) sometimes provide files with an empty MIME type
  // or HEIC/HEIF types. Treat known image extensions as images even if MIME is missing.
  const hasImageMime = typeof inputFile.type === 'string' && inputFile.type.startsWith('image/');
  const looksLikeImageByName = typeof inputFile.name === 'string' && /\.(heic|heif|jpg|jpeg|png|webp|gif|bmp|tif|tiff)$/i.test(inputFile.name);
  if (!hasImageMime && !looksLikeImageByName) {
    console.error("Invalid file type. Only images are allowed.");
    return null;
  }

  if (isNaN(targetAspectRatio) || targetAspectRatio <= 0) {
    console.error("Invalid target aspect ratio.");
    return null;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        const originalAspectRatio = originalWidth / originalHeight;

        // If aspect ratio already matches within tolerance, skip re-encoding to preserve quality
        const aspectDiff = Math.abs(originalAspectRatio - targetAspectRatio);
        if (aspectDiff < ASPECT_RATIO_TOLERANCE) {
          console.log(`[ImageCropper] Aspect ratio matches target (${targetAspectRatio.toFixed(3)}) within tolerance, skipping re-encode`);
          const croppedImageUrl = URL.createObjectURL(inputFile);
          resolve({
            croppedFile: inputFile,
            croppedImageUrl,
          });
          return;
        }

        let cropX = 0;
        let cropY = 0;
        let newCanvasWidth = originalWidth;
        let newCanvasHeight = originalHeight;

        // Calculate new dimensions for cropping, maintaining center
        if (originalAspectRatio > targetAspectRatio) {
          // Original image is wider than target, crop width
          newCanvasWidth = originalHeight * targetAspectRatio;
          newCanvasHeight = originalHeight;
          cropX = (originalWidth - newCanvasWidth) / 2;
        } else if (originalAspectRatio < targetAspectRatio) {
          // Original image is taller than target, crop height
          newCanvasWidth = originalWidth;
          newCanvasHeight = originalWidth / targetAspectRatio;
          cropY = (originalHeight - newCanvasHeight) / 2;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(newCanvasWidth);
        canvas.height = Math.round(newCanvasHeight);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Use high-quality image smoothing for any scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw the cropped portion of the image onto the canvas
        ctx.drawImage(
          img,
          cropX, // source X
          cropY, // source Y
          newCanvasWidth, // source width
          newCanvasHeight, // source height
          0, // destination X
          0, // destination Y
          canvas.width, // destination width
          canvas.height // destination height
        );

        // Preserve original format, fallback to JPEG for unsupported types
        const outputMime = /^(image\/(jpeg|png|webp))$/i.test(inputFile.type)
          ? inputFile.type
          : 'image/jpeg';

        // Use maximum quality (1.0) for JPEG/WebP to minimize quality loss
        const quality = 1.0;

        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              try {
                const dataUrl = canvas.toDataURL(outputMime, quality);
                blob = await (await fetch(dataUrl)).blob();
              } catch (err) {
                reject(new Error("Failed to create blob from canvas"));
                return;
              }
            }

            const fileExt = outputMime === 'image/png' ? 'png' : outputMime === 'image/webp' ? 'webp' : 'jpg';
            const safeName = inputFile.name.replace(/\.[^/.]+$/, `.${fileExt}`);
            const croppedFile = new File([blob], safeName, {
              type: outputMime,
              lastModified: Date.now(),
            });
            const croppedImageUrl = URL.createObjectURL(croppedFile);
            resolve({
              croppedFile,
              croppedImageUrl,
            });
          },
          outputMime,
          quality
        );
      };
      img.onerror = (err) => {
        reject(new Error("Failed to load image: " + err));
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      } else {
        reject(new Error("Failed to read file for cropping."));
      }
    };
    reader.onerror = (err) => {
      reject(new Error("FileReader error: " + err));
    };
    reader.readAsDataURL(inputFile);
  });
}; 