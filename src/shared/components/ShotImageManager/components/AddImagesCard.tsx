import React from 'react';
import { cn } from '@/shared/lib/utils';
import { getAspectRatioStyle } from '../utils/image-utils';

interface AddImagesCardProps {
  projectAspectRatio?: string;
  onImageUpload: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
}

export const AddImagesCard: React.FC<AddImagesCardProps> = ({
  projectAspectRatio,
  onImageUpload,
  isUploadingImage
}) => {
  const aspectRatioStyle = getAspectRatioStyle(projectAspectRatio);
  
  return (
    <div className="relative" style={aspectRatioStyle}>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            onImageUpload(files);
            e.target.value = ''; // Reset input
          }
        }}
        className="hidden"
        id="grid-image-upload"
        disabled={isUploadingImage}
      />
      <label
        htmlFor="grid-image-upload"
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-2",
          "border-2 border-dashed rounded-lg cursor-pointer",
          "transition-all duration-200",
          isUploadingImage
            ? "border-muted-foreground/30 bg-muted/30 cursor-not-allowed"
            : "border-muted-foreground/40 bg-muted/20 hover:border-primary hover:bg-primary/5"
        )}
      >
        <div className="text-3xl text-muted-foreground">+</div>
        <div className="text-xs text-muted-foreground font-medium sm:hidden lg:block">
          {isUploadingImage ? 'Uploading...' : 'Add Images'}
        </div>
      </label>
    </div>
  );
};

