import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Image } from 'lucide-react';

interface EmptyStateProps {
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onImageUpload, isUploadingImage }) => {
  const navigate = useNavigate();
  
  return (
    <div className="space-y-4">
      {onImageUpload && (
        <div className="w-full sm:w-2/3 md:w-1/2 lg:w-1/3 p-4 border rounded-lg bg-muted/20">
          <div className="flex flex-col items-center gap-3 text-center">
            <Image className="h-8 w-8 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Add images to start building your animation
            </p>
            
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
              id="empty-shot-image-upload"
              disabled={isUploadingImage}
            />
            
            <div className="flex gap-2 w-full">
              <Label htmlFor="empty-shot-image-upload" className="m-0 cursor-pointer flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploadingImage}
                  className="w-full"
                  asChild
                >
                  <span>
                    {isUploadingImage ? 'Uploading...' : 'Upload Images'}
                  </span>
                </Button>
              </Label>
              
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate("/tools/image-generation")}
                className="flex-1"
              >
                Start generating
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

