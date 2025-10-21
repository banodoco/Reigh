import React, { useRef } from 'react';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import { UseImageFlipReturn } from '../hooks';
import { UseInpaintingReturn } from '../hooks/useInpainting';

export interface MediaDisplayProps {
  displayUrl: string;
  thumbUrl?: string;
  isVideo: boolean;
  isFlippedHorizontally: boolean;
  isSaving: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  variant: 'desktop' | 'mobile' | 'regular';
  // Inpainting props
  isInpaintMode: boolean;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: () => void;
}

/**
 * Media display component for images and videos
 * Handles rendering with canvas overlays for flip and inpainting
 */
export const MediaDisplay: React.FC<MediaDisplayProps> = ({
  displayUrl,
  thumbUrl,
  isVideo,
  isFlippedHorizontally,
  isSaving,
  canvasRef,
  onImageLoad,
  variant,
  isInpaintMode,
  imageContainerRef,
  displayCanvasRef,
  maskCanvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const isDesktop = variant === 'desktop';
  const isMobile = variant === 'mobile';

  if (isVideo) {
    const videoStyle = isDesktop
      ? { maxWidth: '55vw', maxHeight: '90vh' }
      : isMobile
      ? { maxWidth: '100%', maxHeight: '100%' }
      : { maxHeight: '85vh' };

    return (
      <StyledVideoPlayer
        src={displayUrl}
        poster={thumbUrl}
        loop
        muted
        autoPlay
        playsInline
        preload="auto"
        className={isDesktop || isMobile ? "shadow-wes border border-border/20" : "w-full shadow-wes border border-border/20"}
        style={videoStyle}
      />
    );
  }

  // Image rendering
  const imageStyle = isDesktop
    ? { 
        maxHeight: '90vh',
        maxWidth: '55vw',
        transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none'
      }
    : isMobile
    ? { 
        maxHeight: '50vh',
        maxWidth: '95vw',
        transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none'
      }
    : { 
        maxHeight: '85vh',
        maxWidth: '95vw',
        width: 'auto',
        height: 'auto',
        transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none'
      };

  return (
    <div ref={imageContainerRef} className="relative">
      <img 
        src={displayUrl} 
        alt="Media content"
        className={`object-contain transition-opacity duration-300 ${
          isFlippedHorizontally ? 'scale-x-[-1]' : ''
        } ${
          isSaving ? 'opacity-30' : 'opacity-100'
        }`}
        style={imageStyle}
        onLoad={onImageLoad}
      />
      
      {/* Saving overlay */}
      {isSaving && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 backdrop-blur-sm">
          <div className={`text-center text-white bg-black/80 rounded-lg backdrop-blur-sm border border-white/20 ${
            isMobile ? 'p-4' : 'p-6'
          }`}>
            <div className={`animate-spin rounded-full border-b-2 border-white mx-auto ${
              isMobile ? 'h-10 w-10 mb-2' : 'h-12 w-12 mb-3'
            }`}></div>
            <p className={isMobile ? 'text-base font-medium' : 'text-lg font-medium'}>Saving flipped image...</p>
            <p className={`text-white/70 mt-1 ${isMobile ? 'text-xs' : 'text-sm'}`}>Please wait</p>
          </div>
        </div>
      )}
      
      {/* Hidden canvas for image processing */}
      <canvas 
        ref={canvasRef}
        className="hidden"
      />
      
      {/* Canvas overlay for inpainting */}
      {isInpaintMode && (
        <>
          <canvas
            ref={displayCanvasRef}
            className="absolute pointer-events-auto cursor-crosshair"
            style={{
              touchAction: 'none',
              zIndex: 50
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          <canvas
            ref={maskCanvasRef}
            className="hidden"
          />
        </>
      )}
    </div>
  );
};

