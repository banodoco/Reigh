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
 * @returns A full, usable URL for display in img/video src tags.
 */
export const getDisplayUrl = (relativePath: string | undefined | null): string => {
  const baseUrl = import.meta.env.VITE_API_TARGET_URL || '';
  if (!relativePath) return '/placeholder.svg'; // Default placeholder
  if (relativePath.startsWith('http') || relativePath.startsWith('blob:') || relativePath.startsWith('data:')) {
    return relativePath;
  }
  // Ensure no double slashes if baseUrl ends with / and relativePath starts with /
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanRelative = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  return `${cleanBase}/${cleanRelative}`;
};
