import React, { useState } from 'react';
import { GenerationRow } from '@/types/shots';
import MediaLightbox from '@/shared/components/MediaLightbox';
import TaskDetailsContent from '@/tools/travel-between-images/components/TaskDetailsContent';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Button } from '@/shared/components/ui/button';
import { Info, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface MediaLightboxWithTaskDetailsProps {
  media: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onImageSaved?: (newImageUrl: string, createNew?: boolean) => Promise<void>;
  onApplySettings?: (settings: any) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  videoPlayerComponent?: 'hover-scrub' | 'simple-player';
  hasNext?: boolean;
  hasPrevious?: boolean;
  starred?: boolean;
}

const MediaLightboxWithTaskDetails: React.FC<MediaLightboxWithTaskDetailsProps> = ({
  media,
  onClose,
  onNext,
  onPrevious,
  onImageSaved,
  onApplySettings,
  onApplySettingsFromTask,
  showNavigation = true,
  showImageEditTools = false,
  showDownload = true,
  videoPlayerComponent = 'simple-player',
  hasNext = true,
  hasPrevious = true,
  starred = false
}) => {
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const isMobile = useIsMobile();

  const handleClose = () => {
    setShowTaskDetails(false);
    onClose();
  };

  return (
    <>
      {/* Main lightbox overlay */}
      <div className="fixed inset-0 z-[10000] bg-black/80" />
      
      {/* Content container */}
      <div 
        className={cn(
          "fixed inset-0 z-[10001] flex items-center justify-center p-4",
          isMobile && showTaskDetails ? "flex-col" : "",
          !isMobile && showTaskDetails ? "flex-row gap-4" : ""
        )}
      >
        {/* MediaLightbox container */}
        <div 
          className={cn(
            "relative",
            isMobile && showTaskDetails ? "flex-shrink-0 mb-4" : "",
            !isMobile && showTaskDetails ? "flex-shrink-0" : "w-full h-full"
          )}
          style={{
            ...(isMobile && showTaskDetails 
              ? { maxHeight: '50vh', maxWidth: '95vw' }
              : !isMobile && showTaskDetails
              ? { maxHeight: '90vh', maxWidth: '60vw' }
              : {})
          }}
        >
          {/* Task Details Toggle Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowTaskDetails(!showTaskDetails)}
            className="absolute top-4 right-16 z-[10002] bg-black/50 hover:bg-black/70 text-white"
          >
            <Info className="h-4 w-4" />
          </Button>

          {/* Close Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClose}
            className="absolute top-4 right-4 z-[10002] bg-black/50 hover:bg-black/70 text-white"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Media Content */}
          <div className="w-full h-full bg-black rounded-lg overflow-hidden">
            {/* Video Player */}
            <video 
              src={media.location || media.imageUrl}
              poster={media.thumbUrl}
              controls
              className="w-full h-full object-contain"
              style={{
                maxHeight: isMobile && showTaskDetails ? '40vh' : '85vh'
              }}
            />
          </div>

          {/* Navigation Controls */}
          {showNavigation && (
            <>
              {onPrevious && hasPrevious && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onPrevious}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-[10002]"
                >
                  ←
                </Button>
              )}
              {onNext && hasNext && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-[10002]"
                >
                  →
                </Button>
              )}
            </>
          )}
        </div>

        {/* Task Details Panel */}
        {showTaskDetails && (
          <div 
            className={cn(
              "bg-black/90 rounded-lg border border-white/20 overflow-y-auto",
              isMobile ? "w-full max-h-[40vh]" : "w-[35vw] max-h-[90vh]"
            )}
          >
            <TaskDetailsContent
              generationId={media.id}
              onApplySettings={onApplySettings}
              onApplySettingsFromTask={onApplySettingsFromTask}
              onClose={() => setShowTaskDetails(false)}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default MediaLightboxWithTaskDetails;
