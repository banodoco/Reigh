import React from 'react';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';

interface MediaDisplayWithCanvasProps {
  // Media info
  effectiveImageUrl: string;
  thumbUrl?: string;
  isVideo: boolean;
  
  // States
  isFlippedHorizontally: boolean;
  isSaving: boolean;
  isInpaintMode: boolean;
  
  // Refs
  imageContainerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
  
  // Handlers
  onImageLoad?: (dimensions: { width: number; height: number }) => void;
  handlePointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  
  // Styling variants
  variant?: 'desktop-side-panel' | 'mobile-stacked' | 'regular-centered';
  className?: string;
  containerClassName?: string;
  
  // Debug
  debugContext?: string;
}

export const MediaDisplayWithCanvas: React.FC<MediaDisplayWithCanvasProps> = ({
  effectiveImageUrl,
  thumbUrl,
  isVideo,
  isFlippedHorizontally,
  isSaving,
  isInpaintMode,
  imageContainerRef,
  canvasRef,
  displayCanvasRef,
  maskCanvasRef,
  onImageLoad,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  variant = 'regular-centered',
  className = '',
  containerClassName = '',
  debugContext = 'MediaDisplay'
}) => {
  // Variant-specific styling
  const getMediaStyle = () => {
    switch (variant) {
      case 'desktop-side-panel':
        return { maxWidth: '55vw', maxHeight: '98vh' };
      case 'mobile-stacked':
        return { maxWidth: '95vw', maxHeight: '58vh' };
      case 'regular-centered':
        return {}; // Use natural sizing with max-w-full max-h-full
      default:
        return {};
    }
  };

  const mediaStyle = getMediaStyle();

  return (
    <div 
      ref={imageContainerRef} 
      className={`relative flex items-center justify-center ${containerClassName}`}
      style={{ touchAction: 'none' }}
      onTouchMove={(e) => {
        if (isInpaintMode) {
          e.preventDefault();
        }
      }}
    >
      {isVideo ? (
        // Video Player
        <StyledVideoPlayer
          src={effectiveImageUrl}
          poster={thumbUrl}
          loop
          muted
          autoPlay
          playsInline
          preload="auto"
          className={`shadow-wes border border-border/20 ${variant === 'regular-centered' ? 'rounded' : ''}`}
          style={mediaStyle}
        />
      ) : (
        // Image with Canvas Overlays
        <>
          <img 
            src={effectiveImageUrl} 
            alt="Media content"
            draggable={false}
            className={`
              object-contain transition-opacity duration-300 select-none
              ${variant === 'regular-centered' ? 'max-w-full max-h-full rounded' : ''}
              ${isFlippedHorizontally ? 'scale-x-[-1]' : ''}
              ${isSaving ? 'opacity-30' : 'opacity-100'}
              ${isInpaintMode ? 'pointer-events-none' : ''}
              ${className}
            `.trim()}
            style={{ 
              ...mediaStyle,
              transform: isFlippedHorizontally ? 'scaleX(-1)' : 'none',
              pointerEvents: isInpaintMode ? 'none' : 'auto'
            }}
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              onImageLoad?.({
                width: img.naturalWidth,
                height: img.naturalHeight
              });
            }}
          />

          {/* Saving State Overlay */}
          {isSaving && (
            <div className={`absolute inset-0 flex items-center justify-center z-10 bg-black/50 backdrop-blur-sm ${variant === 'regular-centered' ? 'rounded' : ''}`}>
              <div className="text-center text-white bg-black/80 rounded-lg p-4 backdrop-blur-sm border border-white/20">
                <div className={`animate-spin rounded-full border-b-2 border-white mx-auto ${variant === 'mobile-stacked' ? 'h-10 w-10 mb-2' : 'h-12 w-12 mb-3'}`}></div>
                <p className={`font-medium ${variant === 'mobile-stacked' ? 'text-base' : 'text-lg'}`}>Saving flipped image...</p>
                <p className={`text-white/70 mt-1 ${variant === 'mobile-stacked' ? 'text-xs' : 'text-sm'}`}>Please wait</p>
              </div>
            </div>
          )}

          {/* Hidden Canvas for Image Processing */}
          <canvas 
            ref={canvasRef}
            className="hidden"
          />

          {/* Canvas Overlay for Inpainting */}
          {(() => {
            console.log(`[${debugContext}] 🖼️ Canvas render check`, {
              isInpaintMode,
              hasDisplayCanvasRef: !!displayCanvasRef,
              hasDisplayCanvas: !!displayCanvasRef?.current,
              shouldRenderCanvas: isInpaintMode
            });
            return isInpaintMode;
          })() && (
            <>
              {/* Display Canvas - User draws here */}
              <canvas
                ref={displayCanvasRef}
                className="absolute top-0 left-0 pointer-events-auto cursor-crosshair"
                style={{
                  touchAction: 'none',
                  zIndex: 50,
                  userSelect: 'none',
                  WebkitUserSelect: 'none'
                }}
                onPointerDown={(e) => {
                  console.log(`[${debugContext}] 🎨 Canvas onPointerDown`, {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    canvasWidth: displayCanvasRef.current?.width,
                    canvasHeight: displayCanvasRef.current?.height,
                    isInpaintMode,
                    hasHandler: !!handlePointerDown
                  });
                  handlePointerDown?.(e);
                }}
                onPointerMove={(e) => {
                  console.log(`[${debugContext}] 🖌️ Canvas onPointerMove`, {
                    clientX: e.clientX,
                    clientY: e.clientY
                  });
                  handlePointerMove?.(e);
                }}
                onPointerUp={(e) => {
                  console.log(`[${debugContext}] 🛑 Canvas onPointerUp`);
                  handlePointerUp?.(e);
                }}
                onPointerCancel={(e) => {
                  console.log(`[${debugContext}] ⚠️ Canvas onPointerCancel`);
                  handlePointerUp?.(e);
                }}
                onDragStart={(e) => {
                  console.log(`[${debugContext}] 🚫 Preventing drag`);
                  e.preventDefault();
                }}
              />

              {/* Mask Canvas - Hidden, stores the mask */}
              <canvas
                ref={maskCanvasRef}
                className="hidden"
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default MediaDisplayWithCanvas;

