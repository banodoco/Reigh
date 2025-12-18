import React from 'react';
import { Image } from 'lucide-react';
import { ImageUploadActions } from '@/shared/components/ImageUploadActions';

interface EmptyStateProps {
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  /** Optional shot ID to pre-select in the generation modal */
  shotId?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onImageUpload, isUploadingImage, shotId }) => {
  return (
    <div className="space-y-4">
      {onImageUpload && (
        <div className="w-full sm:w-2/3 md:w-1/2 lg:w-1/3 p-4 border rounded-lg bg-muted/20">
          <div className="flex flex-col items-center gap-3 text-center">
            <Image className="h-8 w-8 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Add images to start building your animation
            </p>
            
            <ImageUploadActions
              onImageUpload={onImageUpload}
              isUploadingImage={isUploadingImage}
              shotId={shotId}
              inputId="empty-shot-image-upload"
              buttonSize="sm"
            />
          </div>
        </div>
      )}
    </div>
  );
};

