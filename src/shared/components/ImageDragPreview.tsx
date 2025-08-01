import React from 'react';
import { GenerationRow } from '@/types/shots';

const baseUrl = import.meta.env.VITE_API_TARGET_URL || window.location.origin;

const getDisplayUrl = (relativePath: string | undefined): string => {
  if (!relativePath) return '/placeholder.svg'; // Default placeholder if no path
  // If it's already an absolute URL, a blob URL, or a root-relative path (like /placeholder.svg itself), use as is.
  if (relativePath.startsWith('http') || relativePath.startsWith('blob:') || relativePath.startsWith('/')) {
    return relativePath;
  }
  // For other relative paths (like 'files/image.png'), prepend the base URL.
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  // Ensure the relative path doesn't start with a slash if we are prepending base
  const cleanRelative = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  return `${cleanBase}/${cleanRelative}`;
};

interface ImagePreviewProps {
  image: GenerationRow;
}

export const SingleImagePreview: React.FC<ImagePreviewProps> = ({ image }) => {
  return (
    <div className="bg-muted/50 rounded border p-1 flex flex-col items-center justify-center aspect-square overflow-hidden shadow-sm w-32 h-32">
      <img
        src={getDisplayUrl(image.thumbUrl || image.imageUrl)}
        alt={`Image ${image.id}`}
        className="max-w-full max-h-full object-contain rounded-sm"
      />
    </div>
  );
};

interface MultiImagePreviewProps {
  count: number;
  image: GenerationRow; // To show one of the images on top
}

export const MultiImagePreview: React.FC<MultiImagePreviewProps> = ({ count, image }) => {
  return (
    <div className="relative w-32 h-32">
      <div className="absolute top-2 left-2 w-full h-full bg-muted/80 rounded border p-1 shadow-lg" />
      <div className="absolute top-1 left-1 w-full h-full bg-muted/90 rounded border p-1 shadow-md" />
      <div className="absolute top-0 left-0 w-full h-full bg-muted rounded border p-1 flex flex-col items-center justify-center aspect-square overflow-hidden shadow-sm">
        <img
          src={getDisplayUrl(image.thumbUrl || image.imageUrl)}
          alt={`Image ${image.id}`}
          className="max-w-full max-h-full object-contain rounded-sm"
        />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-orange-500 text-white rounded-full h-8 w-8 flex items-center justify-center text-sm font-bold shadow-lg">
          {count}
        </div>
      </div>
    </div>
  );
}; 