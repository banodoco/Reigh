/**
 * Utility functions for converting URLs to File objects
 * This allows URL-based image inputs to integrate seamlessly with existing file processing pipelines
 */

/**
 * Fetches an image from a URL and converts it to a File object
 * @param url The URL of the image to fetch
 * @param filename Optional filename for the created File object
 * @returns Promise<File> The image as a File object
 */
export const urlToFile = async (url: string, filename?: string): Promise<File> => {
  // Validate URL format
  if (!isValidImageUrl(url)) {
    throw new Error('Invalid image URL provided');
  }

  try {
    // Fetch the image
    const response = await fetch(url, {
      mode: 'cors', // Handle CORS for external URLs
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    // Get the blob
    const blob = await response.blob();

    // Validate that we got an image
    if (!blob.type.startsWith('image/')) {
      throw new Error(`URL does not point to an image. Content-Type: ${blob.type}`);
    }

    // Generate filename if not provided
    const finalFilename = filename || generateFilenameFromUrl(url, blob.type);

    // Convert blob to File
    const file = new File([blob], finalFilename, {
      type: blob.type,
      lastModified: Date.now(),
    });

    return file;
  } catch (error) {
    if (error instanceof TypeError) {
      // Network errors, CORS issues, etc.
      throw new Error(`Network error fetching image: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Validates if a URL looks like it could be an image URL
 * @param url The URL to validate
 * @returns boolean True if the URL appears to be valid for image fetching
 */
export const isValidImageUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    
    // Must be http or https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }

    // Basic URL validation passed
    return true;
  } catch {
    return false;
  }
};

/**
 * Generates a filename from a URL and MIME type
 * @param url The source URL
 * @param mimeType The MIME type of the image
 * @returns string A suitable filename
 */
const generateFilenameFromUrl = (url: string, mimeType: string): string => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Try to extract filename from URL path
    const segments = pathname.split('/');
    const lastSegment = segments[segments.length - 1];
    
    if (lastSegment && lastSegment.includes('.')) {
      return lastSegment;
    }
    
    // Generate filename based on MIME type
    const extension = getExtensionFromMimeType(mimeType);
    const timestamp = Date.now();
    return `image-from-url-${timestamp}.${extension}`;
  } catch {
    // Fallback filename
    const extension = getExtensionFromMimeType(mimeType);
    const timestamp = Date.now();
    return `image-from-url-${timestamp}.${extension}`;
  }
};

/**
 * Gets file extension from MIME type
 * @param mimeType The MIME type
 * @returns string The file extension
 */
const getExtensionFromMimeType = (mimeType: string): string => {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };
  
  return mimeToExt[mimeType.toLowerCase()] || 'jpg';
};

/**
 * Validates and converts a URL to a File, with user-friendly error messages
 * @param url The URL to process
 * @param filename Optional filename
 * @returns Promise<File> The converted File object
 */
export const processImageUrl = async (url: string, filename?: string): Promise<File> => {
  const trimmedUrl = url.trim();
  
  if (!trimmedUrl) {
    throw new Error('Please enter a valid image URL');
  }

  if (!isValidImageUrl(trimmedUrl)) {
    throw new Error('Please enter a valid HTTP or HTTPS image URL');
  }

  try {
    const file = await urlToFile(trimmedUrl, filename);
    
    // Additional validation: check file size (limit to 10MB for style references)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('Image is too large. Please use an image smaller than 10MB.');
    }

    return file;
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw with user-friendly message if it's already user-friendly
      if (error.message.includes('Network error') || 
          error.message.includes('Failed to fetch') ||
          error.message.includes('does not point to an image')) {
        throw new Error(`Unable to load image from URL: ${error.message}`);
      }
      throw error;
    }
    throw new Error('Failed to load image from URL. Please check the URL and try again.');
  }
};
