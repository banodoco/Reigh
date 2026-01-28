/**
 * createLineageGif
 *
 * Creates an animated GIF from an array of image URLs.
 * Uses a server-side edge function to avoid CORS issues with canvas pixel reading.
 */

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
 * Create an animated GIF from an array of image URLs.
 * Calls a server-side edge function to avoid CORS issues.
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

  onProgress?.({
    stage: 'loading',
    current: 0,
    total: imageUrls.length,
    message: 'Sending images to server...',
  });

  // Get the Supabase URL and anon key
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration missing');
  }

  const functionUrl = `${supabaseUrl}/functions/v1/generate-lineage-gif`;

  console.log('[createLineageGif] Calling edge function with', imageUrls.length, 'images');

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      imageUrls,
      frameDelay,
      width,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[createLineageGif] Edge function error:', response.status, errorText);
    throw new Error(`Failed to generate GIF: ${response.status} ${errorText}`);
  }

  onProgress?.({
    stage: 'encoding',
    current: imageUrls.length,
    total: imageUrls.length,
    message: 'Processing on server...',
  });

  const blob = await response.blob();

  onProgress?.({
    stage: 'complete',
    current: imageUrls.length,
    total: imageUrls.length,
    message: 'Complete!',
  });

  console.log('[createLineageGif] GIF received:', blob.size, 'bytes');

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
