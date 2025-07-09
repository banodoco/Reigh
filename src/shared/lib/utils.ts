import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cropFilename(filename: string, maxLength: number = 24): string {
  if (filename.length <= maxLength) {
    return filename;
  }
  
  const extension = filename.split('.').pop() || '';
  const nameWithoutExtension = filename.substring(0, filename.length - extension.length - 1);
  const croppedLength = maxLength - extension.length - 4; // -4 for "..." and "."
  
  if (croppedLength <= 0) {
    return `...${extension}`;
  }
  
  return `${nameWithoutExtension.substring(0, croppedLength)}...${extension}`;
}

export const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export const dataURLtoFile = (dataUrl: string, filename: string, fileType?: string): File | null => {
  try {
    const arr = dataUrl.split(',');
    if (arr.length < 2) {
        throw new Error("Invalid Data URL format");
    }
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = fileType || (mimeMatch && mimeMatch[1]) || 'application/octet-stream';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch (error) {
    console.error("Error converting Data URL to File:", error);
    return null;
  }
};

/**
 * Constructs a full URL for display, prepending the API base URL if the path is relative.
 * Handles different types of paths (full URLs, blob URLs, relative paths).
 * @param relativePath The path to a resource (e.g., /files/image.png or a full http URL).
 * @param forceRefresh Optional flag to add cache-busting parameter for immediate refresh
 * @returns A full, usable URL for display in img/video src tags.
 */
export const getDisplayUrl = (relativePath: string | undefined | null, forceRefresh: boolean = false): string => {
  if (!relativePath) return '/placeholder.svg';

  // Already a full or special URL – return unchanged (but add cache-busting if requested)
  if (/^(https?:|blob:|data:)/.test(relativePath)) {
    if (forceRefresh && !relativePath.includes('?t=')) {
      const separator = relativePath.includes('?') ? '&' : '?';
      return `${relativePath}${separator}t=${Date.now()}`;
    }
    return relativePath;
  }

  const baseUrl = import.meta.env.VITE_API_TARGET_URL || window.location.origin;
  
  // If the configured base URL points to localhost but the app is *not* currently being
  // served from localhost (e.g. you are viewing the dev server on a phone/tablet via
  // the LAN IP), use the current origin instead so assets load from the same host.
  let effectiveBaseUrl = baseUrl;
  if (typeof window !== 'undefined' && baseUrl && baseUrl.includes('localhost')) {
    const currentHostIsLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!currentHostIsLocal) {
      // Viewing from a non-localhost device – use current origin instead of localhost
      effectiveBaseUrl = window.location.origin;
    }
  }
  
  let finalUrl: string;
  
  // Combine base URL with relative path
  const cleanBase = effectiveBaseUrl.endsWith('/') ? effectiveBaseUrl.slice(0, -1) : effectiveBaseUrl;
  
  if (relativePath.startsWith('/')) {
    finalUrl = `${cleanBase}${relativePath}`;
  } else {
    finalUrl = `${cleanBase}/${relativePath}`;
  }
  
  // Add cache-busting parameter if requested or for recently flipped images
  if (forceRefresh || (relativePath.includes('flipped_') && !relativePath.includes('?t='))) {
    const separator = finalUrl.includes('?') ? '&' : '?';
    finalUrl = `${finalUrl}${separator}t=${Date.now()}`;
  }
  
  return finalUrl;
};
