/**
 * createLineageGif
 *
 * Creates an animated GIF from an array of image URLs.
 * Runs client-side using gifenc library.
 */

import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface CreateGifOptions {
  /** Milliseconds between frames (default: 800) */
  frameDelay?: number;
  /** Output width in pixels (default: 512) */
  width?: number;
}

export interface CreateGifProgress {
  stage: 'loading' | 'encoding' | 'complete';
  current: number;
  total: number;
  message: string;
}

/**
 * Load an image from a blob URL and return an HTMLImageElement.
 */
function loadImageFromBlobUrl(blobUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image from blob'));
    img.src = blobUrl;
  });
}

/**
 * Create an animated GIF from an array of image URLs.
 *
 * @param imageUrls - Array of image URLs to include in the GIF
 * @param options - Configuration options
 * @param onProgress - Optional callback for progress updates
 * @returns Promise<Blob> - The generated GIF as a Blob
 */
export async function createLineageGif(
  imageUrls: string[],
  options: CreateGifOptions = {},
  onProgress?: (progress: CreateGifProgress) => void
): Promise<Blob> {
  const { frameDelay = 800, width = 512 } = options;

  if (imageUrls.length === 0) {
    throw new Error('No images provided for GIF creation');
  }

  console.log('[createLineageGif] Starting with', imageUrls.length, 'images');

  onProgress?.({
    stage: 'loading',
    current: 0,
    total: imageUrls.length,
    message: 'Loading images...',
  });

  // Step 1: Fetch all images as blobs and create blob URLs
  // This avoids CORS issues since blob URLs are same-origin
  const images: HTMLImageElement[] = [];
  const blobUrls: string[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      console.log(`[createLineageGif] Fetching image ${i + 1}/${imageUrls.length}`);

      const response = await fetch(imageUrls[i]);
      if (!response.ok) {
        console.error(`[createLineageGif] Failed to fetch image ${i}: ${response.status}`);
        continue;
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrls.push(blobUrl);

      const img = await loadImageFromBlobUrl(blobUrl);
      images.push(img);

      console.log(`[createLineageGif] Image ${i + 1} loaded: ${img.width}x${img.height}`);

      onProgress?.({
        stage: 'loading',
        current: i + 1,
        total: imageUrls.length,
        message: `Loading images ${i + 1}/${imageUrls.length}`,
      });
    } catch (err) {
      console.error(`[createLineageGif] Error loading image ${i}:`, err);
    }
  }

  if (images.length === 0) {
    // Clean up any blob URLs
    blobUrls.forEach(url => URL.revokeObjectURL(url));
    throw new Error('No images could be loaded');
  }

  // Calculate height based on first image aspect ratio
  const firstImage = images[0];
  const aspectRatio = firstImage.width / firstImage.height;
  const height = Math.round(width / aspectRatio);

  console.log(`[createLineageGif] Output size: ${width}x${height}, ${images.length} frames`);

  // Create canvas for rendering frames
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    blobUrls.forEach(url => URL.revokeObjectURL(url));
    throw new Error('Could not get canvas context');
  }

  // Initialize GIF encoder
  const gif = GIFEncoder();

  onProgress?.({
    stage: 'encoding',
    current: 0,
    total: images.length,
    message: 'Encoding frames...',
  });

  // Process each image
  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    // Fill background with black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Calculate scaling to fit while maintaining aspect ratio
    const imgAspect = img.width / img.height;
    const targetAspect = width / height;

    let drawWidth: number;
    let drawHeight: number;
    let drawX: number;
    let drawY: number;

    if (imgAspect > targetAspect) {
      drawWidth = width;
      drawHeight = width / imgAspect;
      drawX = 0;
      drawY = (height - drawHeight) / 2;
    } else {
      drawHeight = height;
      drawWidth = height * imgAspect;
      drawX = (width - drawWidth) / 2;
      drawY = 0;
    }

    // Draw image to canvas
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    // Get image data - this should work since we're using blob URLs (same-origin)
    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;

    // Convert RGBA to RGB array for gifenc
    const rgbData = new Uint8Array(width * height * 3);
    for (let j = 0; j < width * height; j++) {
      rgbData[j * 3] = data[j * 4];
      rgbData[j * 3 + 1] = data[j * 4 + 1];
      rgbData[j * 3 + 2] = data[j * 4 + 2];
    }

    // Quantize colors to 256-color palette
    const palette = quantize(rgbData, 256);
    const indexedPixels = applyPalette(rgbData, palette);

    // Add frame with specified delay (gifenc uses centiseconds)
    gif.writeFrame(indexedPixels, width, height, {
      palette,
      delay: frameDelay / 10,
    });

    console.log(`[createLineageGif] Encoded frame ${i + 1}/${images.length}`);

    onProgress?.({
      stage: 'encoding',
      current: i + 1,
      total: images.length,
      message: `Encoding frames ${i + 1}/${images.length}`,
    });
  }

  // Clean up blob URLs
  blobUrls.forEach(url => URL.revokeObjectURL(url));

  // Finish encoding
  gif.finish();

  const gifBytes = gif.bytes();
  const blob = new Blob([gifBytes], { type: 'image/gif' });

  console.log(`[createLineageGif] GIF generated: ${blob.size} bytes`);

  onProgress?.({
    stage: 'complete',
    current: images.length,
    total: images.length,
    message: 'Complete!',
  });

  return blob;
}

/**
 * Download a Blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default createLineageGif;
