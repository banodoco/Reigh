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
  editMode?: 'text' | 'inpaint' | 'annotate' | 'reposition';
  
  // Reposition mode transform style
  repositionTransformStyle?: React.CSSProperties;
  
  // Refs
  imageContainerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
  
  // Handlers
  onImageLoad?: (dimensions: { width: number; height: number }) => void;
  onVideoLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  handlePointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  
  // Styling variants
  variant?: 'desktop-side-panel' | 'mobile-stacked' | 'regular-centered';
  className?: string;
  containerClassName?: string;
  
  // Layout adjustments
  tasksPaneWidth?: number; // Width of tasks pane to adjust for (desktop only)
  
  // Playback constraints (for trim preview)
  playbackStart?: number;
  playbackEnd?: number;
  
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
  editMode = 'text',
  repositionTransformStyle,
  imageContainerRef,
  canvasRef,
  displayCanvasRef,
  maskCanvasRef,
  onImageLoad,
  onVideoLoadedMetadata,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  variant = 'regular-centered',
  className = '',
  containerClassName = '',
  tasksPaneWidth = 0,
  playbackStart,
  playbackEnd,
  debugContext = 'MediaDisplay'
}) => {
  const [imageLoadError, setImageLoadError] = React.useState(false);
  
  // Track component lifecycle
  React.useEffect(() => {
    console.log(`[${debugContext}] 🎬 Component MOUNTED`);
    return () => {
      console.log(`[${debugContext}] 💀 Component UNMOUNTED`);
    };
  }, [debugContext]);
  
  // Reset error state when URL changes
  React.useEffect(() => {
    console.log(`[${debugContext}] 🔄 ========== URL CHANGED ==========`);
    console.log(`[${debugContext}] newUrl:`, effectiveImageUrl);
    console.log(`[${debugContext}] hasUrl:`, !!effectiveImageUrl);
    console.log(`[${debugContext}] ========================================`);
    setImageLoadError(false);
  }, [effectiveImageUrl, debugContext]);
  
  // Variant-specific styling
  const getMediaStyle = () => {
    switch (variant) {
      case 'desktop-side-panel':
        // Adjust max-width to account for tasks pane if present
        const adjustedMaxWidth = tasksPaneWidth > 0 
          ? `calc(55vw - ${tasksPaneWidth * 0.55}px)` // 55% of remaining space after tasks pane
          : '55vw';
        return { maxWidth: adjustedMaxWidth, maxHeight: '98vh' };
      case 'mobile-stacked':
        // Use 100% to fit within the container (which is 45dvh in InlineEditView)
        // instead of fixed vh/vw which might overflow
        return { maxWidth: '100%', maxHeight: '100%' };
      case 'regular-centered':
        return {}; // Use natural sizing with max-w-full max-h-full
      default:
        return {};
    }
  };

  const mediaStyle = getMediaStyle();

  // Debug logging for media URL - ALL TOP LEVEL
  console.log(`[${debugContext}] 🎬 ========== RENDERING ==========`);
  console.log(`[${debugContext}] effectiveImageUrl:`, effectiveImageUrl);
  console.log(`[${debugContext}] thumbUrl:`, thumbUrl);
  console.log(`[${debugContext}] isVideo:`, isVideo);
  console.log(`[${debugContext}] variant:`, variant);
  console.log(`[${debugContext}] hasUrl:`, !!effectiveImageUrl);
  console.log(`[${debugContext}] urlLength:`, effectiveImageUrl?.length || 0);
  console.log(`[${debugContext}] ========================================`);

  // Check if URL is missing
  if (!effectiveImageUrl) {
    console.error(`[${debugContext}] ❌ Missing effectiveImageUrl!`);
    return (
      <div className={`relative flex items-center justify-center ${containerClassName}`}>
        <div className="text-center text-white bg-red-900/80 rounded-lg p-6 backdrop-blur-sm border border-red-500/50">
          <p className="font-medium text-lg mb-2">⚠️ Media URL Missing</p>
          <p className="text-white/70 text-sm">The media URL is not available.</p>
          <p className="text-white/50 text-xs mt-2">Check console for details.</p>
        </div>
      </div>
    );
  }
  
  // Show error state if image failed to load
  if (imageLoadError && !isVideo) {
    console.error(`[${debugContext}] ❌ Image failed to load:`, effectiveImageUrl);
    return (
      <div className={`relative flex items-center justify-center ${containerClassName}`}>
        <div className="text-center text-white bg-red-900/80 rounded-lg p-6 backdrop-blur-sm border border-red-500/50 max-w-md">
          <p className="font-medium text-lg mb-2">⚠️ Failed to Load Image</p>
          <p className="text-white/70 text-sm mb-3">The image could not be loaded (HTTP 400 error).</p>
          <p className="text-white/50 text-xs break-all mb-3">{effectiveImageUrl}</p>
          <button
            onClick={() => setImageLoadError(false)}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show checkered background pattern for reposition mode to indicate transparent/dead areas
  const isRepositionMode = editMode === 'reposition' && isInpaintMode;
  
  return (
    <div 
      ref={imageContainerRef} 
      className={`relative flex items-center justify-center ${containerClassName}`}
      style={{ 
        touchAction: 'none',
        // Checkered pattern background for reposition mode
        ...(isRepositionMode ? {
          backgroundImage: `
            linear-gradient(45deg, #1a1a2e 25%, transparent 25%),
            linear-gradient(-45deg, #1a1a2e 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #1a1a2e 75%),
            linear-gradient(-45deg, transparent 75%, #1a1a2e 75%)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          backgroundColor: '#252540',
        } : {})
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
          onLoadedMetadata={onVideoLoadedMetadata}
          playbackStart={playbackStart}
          playbackEnd={playbackEnd}
        />
      ) : (
        // Image with Canvas Overlays
        <>
          <img 
            src={effectiveImageUrl} 
            alt="Media content"
            draggable={false}
            className={`
              object-contain select-none
              ${variant === 'regular-centered' ? 'max-w-full max-h-full rounded' : ''}
              ${isFlippedHorizontally ? 'scale-x-[-1]' : ''}
              ${isSaving ? 'opacity-30' : 'opacity-100'}
              ${isInpaintMode ? 'pointer-events-none' : ''}
              ${editMode === 'reposition' ? 'transition-transform duration-75' : 'transition-opacity duration-300'}
              ${className}
            `.trim()}
            style={{ 
              ...mediaStyle,
              ...(editMode === 'reposition' && repositionTransformStyle ? repositionTransformStyle : {}),
              transform: editMode === 'reposition' && repositionTransformStyle?.transform 
                ? repositionTransformStyle.transform 
                : (isFlippedHorizontally ? 'scaleX(-1)' : 'none'),
              transformOrigin: editMode === 'reposition' ? 'center center' : undefined,
              pointerEvents: isInpaintMode ? 'none' : 'auto'
            }}
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              console.log(`[${debugContext}] ✅ Image loaded successfully:`, {
                url: effectiveImageUrl.substring(0, 100),
                width: img.naturalWidth,
                height: img.naturalHeight
              });
              onImageLoad?.({
                width: img.naturalWidth,
                height: img.naturalHeight
              });
            }}
            onError={(e) => {
              console.error(`[${debugContext}] ❌ Image load error:`, {
                url: effectiveImageUrl,
                error: e
              });
              setImageLoadError(true);
            }}
          />

          {/* Original Image Bounds Outline - Shows the canvas boundary in reposition mode */}
          {isRepositionMode && (
            <div 
              className="absolute pointer-events-none z-[45]"
              style={{
                // This overlay shows the original image boundary
                inset: 0,
                border: '2px dashed rgba(59, 130, 246, 0.7)',
                borderRadius: variant === 'regular-centered' ? '4px' : undefined,
                boxShadow: 'inset 0 0 0 2px rgba(59, 130, 246, 0.2)',
              }}
            >
              {/* Corner indicators */}
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-blue-500" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-blue-500" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-blue-500" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-blue-500" />
              
              {/* Center crosshair */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <div className="w-6 h-0.5 bg-blue-500/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                <div className="w-0.5 h-6 bg-blue-500/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

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
                className={`absolute top-0 left-0 ${editMode === 'text' ? 'pointer-events-none' : 'pointer-events-auto cursor-crosshair'}`}
                style={{
                  touchAction: editMode === 'text' ? 'auto' : variant === 'mobile-stacked' ? 'pan-y pinch-zoom' : 'none',
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

