import React from 'react';
import { createPortal } from 'react-dom';
import { GenerationRow } from '@/types/shots';
import { Badge } from '@/shared/components/ui/badge';
import { SharedTaskDetails } from '../../SharedTaskDetails';

interface VideoHoverPreviewProps {
  hoveredVideo: GenerationRow | null;
  hoverPosition: { x: number; y: number; positioning?: 'above' | 'below' } | null;
  isInitialHover: boolean;
  isLoadingHoverTask: boolean;
  hoverTaskMapping: any;
  hoverTask: any;
  hoverInputImages: string[];
  isMobile: boolean;
  onOpenDetailsFromHover: () => void;
}

export const VideoHoverPreview = React.memo<VideoHoverPreviewProps>(({
  hoveredVideo,
  hoverPosition,
  isInitialHover,
  isLoadingHoverTask,
  hoverTaskMapping,
  hoverTask,
  hoverInputImages,
  isMobile,
  onOpenDetailsFromHover
}) => {
  if (isMobile || !hoveredVideo || !hoverPosition) {
    return null;
  }

  return createPortal(
    (() => {
      console.log('[VideoGenMissing] Rendering hover preview:', {
        hoveredVideoId: hoveredVideo.id,
        hoverTaskId: hoverTaskMapping?.taskId,
        isLoadingHoverTask,
        hoverTask: !!hoverTask,
        hoverTaskKeys: hoverTask ? Object.keys(hoverTask) : []
      });
      
      return (
        <div
          className="fixed z-[10001] pointer-events-auto"
          style={{
            left: hoverPosition.x,
            top: hoverPosition.positioning === 'below' ? hoverPosition.y + 10 : hoverPosition.y - 10,
            transform: hoverPosition.positioning === 'below' 
              ? 'translateX(-50%) translateY(0)' 
              : 'translateX(-50%) translateY(-100%)',
          }}
        >
          <div className="bg-background border border-border shadow-lg rounded-lg p-4 max-w-md min-w-80 relative">
            {/* Arrow pointing to the button */}
            {hoverPosition.positioning === 'below' ? (
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-border"></div>
                <div className="absolute top-px left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-3 border-r-3 border-b-3 border-l-transparent border-r-transparent border-b-background"></div>
              </div>
            ) : (
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border"></div>
                <div className="absolute bottom-px left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-3 border-r-3 border-t-3 border-l-transparent border-r-transparent border-t-background"></div>
              </div>
            )}
            {(isInitialHover || isLoadingHoverTask || (hoverTaskMapping?.taskId && !hoverTask)) ? (
              <div className="flex items-center space-y-2">
                <svg className="animate-spin h-4 w-4 text-primary mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-muted-foreground">Loading task details...</span>
              </div>
            ) : hoverTask ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-light text-sm">Generation Details</h4>
                  <Badge variant="secondary" className="text-xs">Preview</Badge>
                </div>
                
                <SharedTaskDetails
                  task={hoverTask}
                  inputImages={hoverInputImages}
                  variant="hover"
                  isMobile={isMobile}
                />
                
                <button 
                  onClick={onOpenDetailsFromHover}
                  className="w-full text-xs text-muted-foreground hover:text-foreground pt-1 border-t border-border transition-colors cursor-pointer"
                >
                  Click to view full details
                </button>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">No task details available</p>
              </div>
            )}
          </div>
        </div>
      );
    })(),
    document.body
  );
});
