import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

  const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';
  
  let finalUrl: string;
  
  // No base URL configured – ensure we have a root-relative path
  if (!baseUrl) {
    finalUrl = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  } else {
    // Base URL is configured – combine properly
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    if (relativePath.startsWith('/')) {
      finalUrl = `${cleanBase}${relativePath}`;
    } else {
      finalUrl = `${cleanBase}/${relativePath}`;
    }
  }
  
  // Add cache-busting parameter if requested or for recently flipped images
  if (forceRefresh || (relativePath.includes('flipped_') && !relativePath.includes('?t='))) {
    const separator = finalUrl.includes('?') ? '&' : '?';
    finalUrl = `${finalUrl}${separator}t=${Date.now()}`;
  }
  
  return finalUrl;
};
