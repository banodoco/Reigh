/**
 * createLineageGif
 *
 * Creates an animated GIF from an array of image URLs.
 * Uses the gifenc library for efficient client-side GIF encoding.
 */

import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface CreateGifOptions {
  /** Milliseconds between frames (default: 800) */
  frameDelay?: number;
  /** Output width in pixels (default: 512) */
  width?: number;
  /** Output height in pixels - if not specified, calculated from aspect ratio */
  height?: number;
}

export interface CreateGifProgress {
  stage: 'loading' | 'encoding' | 'complete';
  current: number;
  total: number;
  message: string;
}

/**
 * Load an image from URL and return an HTMLImageElement.
 * Handles CORS by setting crossOrigin attribute.
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Set crossOrigin to allow canvas operations on the image
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      console.log('[createLineageGif] Image loaded:', {
        url: url.substring(0, 50) + '...',
        width: img.width,
        height: img.height,
      });
      resolve(img);
    };
    img.onerror = (e) => {
      console.error('[createLineageGif] Failed to load image:', url);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
}

/**
 * Draw an image to a canvas, scaling to fit the target dimensions while maintaining aspect ratio.
 * Centers the image and fills any gaps with black.
 */
function drawImageToCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number
): void {
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
    // Image is wider - fit to width
    drawWidth = width;
    drawHeight = width / imgAspect;
    drawX = 0;
    drawY = (height - drawHeight) / 2;
  } else {
    // Image is taller - fit to height
    drawHeight = height;
    drawWidth = height * imgAspect;
    drawX = (width - drawWidth) / 2;
    drawY = 0;
  }

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
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
  let { height } = options;

  if (imageUrls.length === 0) {
    throw new Error('No images provided for GIF creation');
  }

  // Report loading stage
  onProgress?.({
    stage: 'loading',
    current: 0,
    total: imageUrls.length,
    message: 'Loading images...',
  });

  // Load all images in parallel, tracking count separately since they complete out of order
  let loadedCount = 0;
  const loadPromises = imageUrls.map((url) =>
    loadImage(url).then((img) => {
      loadedCount++;
      onProgress?.({
        stage: 'loading',
        current: loadedCount,
        total: imageUrls.length,
        message: `Loading images ${loadedCount}/${imageUrls.length}`,
      });
      return img;
    })
  );

  const images = await Promise.all(loadPromises);

  // If height not specified, calculate from first image's aspect ratio
  if (!height && images[0]) {
    const aspect = images[0].width / images[0].height;
    height = Math.round(width / aspect);
  }
  height = height || 512;

  // Create canvas for rendering frames
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Initialize GIF encoder
  const gif = GIFEncoder();

  // Report encoding stage
  onProgress?.({
    stage: 'encoding',
    current: 0,
    total: images.length,
    message: 'Encoding frames...',
  });

  // Process each image
  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    // Validate image has dimensions
    if (!img.width || !img.height) {
      console.warn('[createLineageGif] Image has no dimensions, skipping:', i);
      continue;
    }

    // Draw image to canvas
    drawImageToCanvas(ctx, img, width, height);

    // Get image data (will throw if canvas is tainted by CORS)
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (err) {
      console.error('[createLineageGif] CORS error getting image data for frame', i, err);
      throw new Error(`CORS error: Cannot process image. The image server may not allow cross-origin access.`);
    }
    const { data } = imageData;

    // Convert RGBA to RGB array for gifenc
    const rgbData = new Uint8Array((width * height * 3));
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
      delay: frameDelay / 10, // Convert ms to centiseconds
    });

    onProgress?.({
      stage: 'encoding',
      current: i + 1,
      total: images.length,
      message: `Encoding frames ${i + 1}/${images.length}`,
    });
  }

  // Finish encoding
  gif.finish();

  // Get the GIF data as a Blob
  const bytes = gif.bytes();
  const blob = new Blob([bytes], { type: 'image/gif' });

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
