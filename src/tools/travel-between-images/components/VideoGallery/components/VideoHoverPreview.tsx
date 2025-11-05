import React from 'react';
import { createPortal } from 'react-dom';
import { GenerationRow } from '@/types/shots';
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
  onPreviewEnter: () => void;
  onPreviewLeave: () => void;
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
  onOpenDetailsFromHover,
  onPreviewEnter,
  onPreviewLeave
}) => {
  if (isMobile || !hoveredVideo || !hoverPosition) {
    return null;
  }

  return createPortal(
    (() => {
      : []
      });
      
      return (
        <div
          className="fixed z-[10001] pointer-events-none"
          style={{
            left: hoverPosition.x,
            top: hoverPosition.positioning === 'below' ? hoverPosition.y + 10 : hoverPosition.y - 10,
            transform: hoverPosition.positioning === 'below' 
              ? 'translateX(-50%) translateY(0)' 
              : 'translateX(-50%) translateY(-100%)',
          }}
        >
          <div 
            className="bg-background border border-border shadow-lg rounded-lg p-0 max-w-md min-w-80 relative pointer-events-auto group cursor-pointer"
            onMouseEnter={onPreviewEnter}
            onMouseLeave={onPreviewLeave}
            onClick={onOpenDetailsFromHover}
          >
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
              <div className="flex items-center space-y-2 p-4">
                <svg className="animate-spin h-4 w-4 text-primary mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-muted-foreground">Loading task details...</span>
              </div>
            ) : hoverTask ? (
              <div className="relative">
                <SharedTaskDetails
                  task={hoverTask}
                  inputImages={hoverInputImages}
                  variant="hover"
                  isMobile={isMobile}
                />
                
                {/* Click to view indicator - appears on hover */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-zinc-900/90 via-zinc-800/60 to-transparent p-2 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-xs text-zinc-100 text-center font-medium drop-shadow-md">
                    Click to view full task info
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-2 p-4">
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
