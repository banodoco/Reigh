import React from 'react';
import StyledVideoPlayer from '@/shared/components/StyledVideoPlayer';
import { StrokeOverlay, BrushStroke } from './StrokeOverlay';
import type { KonvaEventObject } from 'konva/lib/Node';

interface MediaDisplayWithCanvasProps {
  // Media info
  effectiveImageUrl: string;
  thumbUrl?: string;
  isVideo: boolean;

  // States
  isFlippedHorizontally: boolean;
  isSaving: boolean;
  isInpaintMode: boolean;
  editMode?: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';

  // Reposition mode transform style
  repositionTransformStyle?: React.CSSProperties;

  // Reposition drag-to-move handlers
  repositionDragHandlers?: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  isRepositionDragging?: boolean;

  // Refs
  imageContainerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;

  // Handlers
  onImageLoad?: (dimensions: { width: number; height: number }) => void;
  onVideoLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  /** Called when clicking on the container background (not on media content) */
  onContainerClick?: () => void;

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

  // === Konva-based stroke overlay props ===
  imageDimensions?: { width: number; height: number } | null;
  brushStrokes?: BrushStroke[];
  currentStroke?: Array<{ x: number; y: number }>;
  isDrawing?: boolean;
  isEraseMode?: boolean;
  brushSize?: number;
  annotationMode?: 'rectangle' | null;
  selectedShapeId?: string | null;
  // Handlers receive coordinates in IMAGE space (Konva handles conversion)
  onStrokePointerDown?: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  onStrokePointerMove?: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  onStrokePointerUp?: (e: KonvaEventObject<PointerEvent>) => void;
  onShapeClick?: (strokeId: string, point: { x: number; y: number }) => void;
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
  repositionDragHandlers,
  isRepositionDragging = false,
  imageContainerRef,
  canvasRef,
  maskCanvasRef,
  onImageLoad,
  onVideoLoadedMetadata,
  onContainerClick,
  variant = 'regular-centered',
  className = '',
  containerClassName = '',
  tasksPaneWidth = 0,
  playbackStart,
  playbackEnd,
  debugContext = 'MediaDisplay',
  // Konva stroke overlay props
  imageDimensions,
  brushStrokes = [],
  currentStroke = [],
  isDrawing = false,
  isEraseMode = false,
  brushSize = 20,
  annotationMode = null,
  selectedShapeId = null,
  onStrokePointerDown,
  onStrokePointerMove,
  onStrokePointerUp,
  onShapeClick,
}) => {
  // Track the display size AND position of the image for Konva overlay
  const [displaySize, setDisplaySize] = React.useState({ width: 0, height: 0 });
  const [imageOffset, setImageOffset] = React.useState({ left: 0, top: 0 });
  const imageWrapperRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [imageLoadError, setImageLoadError] = React.useState(false);
  // Progressive loading: show thumbnail first, then swap to full image when loaded
  const [fullImageLoaded, setFullImageLoaded] = React.useState(() => {
    // If there's no thumbnail (or thumb equals full), we can render full immediately.
    if (!thumbUrl || thumbUrl === effectiveImageUrl) return true;
    // If the full image is already in the browser cache, skip the thumb flash.
    try {
      const img = new Image();
      img.src = effectiveImageUrl;
      return img.complete;
    } catch {
      return false;
    }
  });
  
  // Track component lifecycle
  React.useEffect(() => {
    console.log(`[${debugContext}] 🎬 Component MOUNTED`);
    return () => {
      console.log(`[${debugContext}] 💀 Component UNMOUNTED`);
    };
  }, [debugContext]);
  
  // Reset error/loading state when URL changes, and try to skip the thumbnail
  // if the full image is already cached (prevents "small thumb then normal size" flash).
  React.useLayoutEffect(() => {
    console.log(`[${debugContext}] 🔄 ========== URL CHANGED ==========`);
    console.log(`[${debugContext}] newUrl:`, effectiveImageUrl);
    console.log(`[${debugContext}] hasUrl:`, !!effectiveImageUrl);
    console.log(`[${debugContext}] ========================================`);
    setImageLoadError(false);
    if (!thumbUrl || thumbUrl === effectiveImageUrl) {
      setFullImageLoaded(true);
      return;
    }

    try {
      const img = new Image();
      img.src = effectiveImageUrl;
      if (img.complete) {
        setFullImageLoaded(true);
        onImageLoad?.({ width: img.naturalWidth, height: img.naturalHeight });
      } else {
        setFullImageLoaded(false);
      }
    } catch {
      setFullImageLoaded(false);
    }
  }, [effectiveImageUrl, thumbUrl, debugContext, onImageLoad]);

  // Measure the actual image element for Konva Stage size and position
  // This is more accurate than measuring the wrapper because the image has the
  // actual constrained dimensions applied via max-w-full max-h-full
  React.useEffect(() => {
    const img = imageRef.current;
    const wrapper = imageWrapperRef.current;
    if (!img || !wrapper) return;

    const updateSize = () => {
      const { clientWidth, clientHeight, offsetLeft, offsetTop } = img;
      console.log('[KonvaDebug] Image element:', {
        clientWidth,
        clientHeight,
        offsetLeft,
        offsetTop,
        wrapperWidth: wrapper.clientWidth,
        wrapperHeight: wrapper.clientHeight
      });
      if (clientWidth > 0 && clientHeight > 0) {
        setDisplaySize({ width: clientWidth, height: clientHeight });
        setImageOffset({ left: offsetLeft, top: offsetTop });
      }
    };

    // Update on load and resize
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(img);
    resizeObserver.observe(wrapper);

    return () => resizeObserver.disconnect();
  }, []);

  // Variant-specific styling
  const getMediaStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'desktop-side-panel':
        // Adjust max-width to account for tasks pane if present
        const adjustedMaxWidth = tasksPaneWidth > 0 
          ? `calc(55vw - ${tasksPaneWidth * 0.55}px)` // 55% of remaining space after tasks pane
          : '55vw';
        return { 
          maxWidth: adjustedMaxWidth, 
          maxHeight: '98vh',
          transition: 'max-width 300ms ease', // Smooth resize when tasks pane opens/closes
        };
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
      className={`relative flex items-center justify-center w-full h-full ${containerClassName}`}
      onClick={(e) => {
        // Close if clicking directly on the container background (not on children)
        if (e.target === e.currentTarget && onContainerClick) {
          onContainerClick();
        }
      }}
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
          // Clip transformed image to prevent it from appearing over other UI elements
          overflow: 'hidden',
        } : {})
      }}
    >
      {isVideo ? (
        // Video Player - StyledVideoPlayer handles its own centering
        <StyledVideoPlayer
          src={effectiveImageUrl}
          poster={thumbUrl}
          loop
          muted
          autoPlay
          playsInline
          preload="auto"
          className={`max-w-full max-h-full shadow-wes border border-border/20 ${variant === 'regular-centered' ? 'rounded' : ''}`}
          style={mediaStyle}
          onLoadedMetadata={onVideoLoadedMetadata}
          playbackStart={playbackStart}
          playbackEnd={playbackEnd}
        />
      ) : (
        // Image with Canvas Overlays
        // Use a single relative container with the image and canvas both using same centering/constraints
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{
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
            } : {}),
            // Enable drag-to-move cursor in reposition mode
            cursor: isRepositionMode
              ? (isRepositionDragging ? 'grabbing' : 'grab')
              : undefined,
            // Prevent text selection during drag
            userSelect: isRepositionMode ? 'none' : undefined,
            WebkitUserSelect: isRepositionMode ? 'none' : undefined,
            touchAction: isRepositionMode ? 'none' : undefined,
          }}
          // Apply drag handlers in reposition mode
          {...(isRepositionMode && repositionDragHandlers ? {
            onPointerDown: repositionDragHandlers.onPointerDown,
            onPointerMove: repositionDragHandlers.onPointerMove,
            onPointerUp: repositionDragHandlers.onPointerUp,
            onPointerCancel: repositionDragHandlers.onPointerCancel,
          } : {})}
        >
          {/*
            Wrapper fills available space. Image is constrained within via max-w/h.
            Konva overlay is positioned absolutely at the image's exact location.
          */}
          <div
            ref={imageWrapperRef}
            className="relative w-full h-full flex items-center justify-center overflow-hidden"
          >
            {/* Use thumbnail or full image based on loading state */}
            <img
              ref={imageRef}
              src={thumbUrl && thumbUrl !== effectiveImageUrl && !fullImageLoaded ? thumbUrl : effectiveImageUrl}
              alt="Media content"
              draggable={false}
              className={`
                block max-w-full max-h-full select-none
                ${variant === 'regular-centered' ? 'rounded' : ''}
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
                pointerEvents: isInpaintMode ? 'none' : 'auto',
                // Keep image below settings panel during reposition (z-80 is the panel)
                zIndex: editMode === 'reposition' ? 40 : undefined,
                position: editMode === 'reposition' ? 'relative' : undefined,
              }}
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                // Only call onImageLoad when the full image (not thumbnail) loads
                if (img.src === effectiveImageUrl || !thumbUrl || thumbUrl === effectiveImageUrl) {
                  console.log(`[${debugContext}] ✅ Full image loaded successfully:`, {
                    url: effectiveImageUrl.substring(0, 100),
                    width: img.naturalWidth,
                    height: img.naturalHeight
                  });
                  setFullImageLoaded(true);
                  onImageLoad?.({
                    width: img.naturalWidth,
                    height: img.naturalHeight
                  });
                } else {
                  console.log(`[${debugContext}] 🖼️ Thumbnail loaded, preloading full image...`);
                }
              }}
              onError={(e) => {
                console.error(`[${debugContext}] ❌ Image load error:`, {
                  url: effectiveImageUrl,
                  error: e
                });
                setImageLoadError(true);
              }}
            />

            {/* Overlay container - positioned exactly over the image */}
            {isInpaintMode && (editMode === 'inpaint' || editMode === 'annotate') &&
             imageDimensions && onStrokePointerDown && displaySize.width > 0 && displaySize.height > 0 && (
              <div
                className="absolute overflow-hidden"
                style={{
                  zIndex: 50,
                  // Position exactly over the image element
                  left: imageOffset.left,
                  top: imageOffset.top,
                  width: displaySize.width,
                  height: displaySize.height,
                }}
              >
                <StrokeOverlay
                  imageWidth={imageDimensions.width}
                  imageHeight={imageDimensions.height}
                  displayWidth={displaySize.width}
                  displayHeight={displaySize.height}
                  strokes={brushStrokes}
                  currentStroke={currentStroke}
                  isDrawing={isDrawing}
                  isEraseMode={isEraseMode}
                  brushSize={brushSize}
                  annotationMode={annotationMode}
                  selectedShapeId={selectedShapeId}
                  onPointerDown={onStrokePointerDown}
                  onPointerMove={onStrokePointerMove!}
                  onPointerUp={onStrokePointerUp!}
                  onShapeClick={onShapeClick}
                />
                <canvas ref={maskCanvasRef} className="hidden" />
              </div>
            )}
          </div>

          {/* Preload full image in background when showing thumbnail */}
          {thumbUrl && thumbUrl !== effectiveImageUrl && !fullImageLoaded && (
            <img
              src={effectiveImageUrl}
              alt=""
              className="hidden"
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                console.log(`[${debugContext}] ✅ Full image preloaded, swapping...`);
                setFullImageLoaded(true);
                onImageLoad?.({
                  width: img.naturalWidth,
                  height: img.naturalHeight
                });
              }}
              onError={() => {
                console.error(`[${debugContext}] ❌ Full image preload failed`);
                // Still try to show thumbnail
              }}
            />
          )}

          {/* Original Image Bounds Outline - Shows the canvas boundary in reposition mode */}
          {isRepositionMode && displaySize.width > 0 && displaySize.height > 0 && (
            <div
              className="absolute pointer-events-none z-[45]"
              style={{
                // Position exactly over the image element
                left: imageOffset.left,
                top: imageOffset.top,
                width: displaySize.width,
                height: displaySize.height,
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

          {/* Canvas is now inside the image wrapper above */}
        </div>
      )}
    </div>
  );
};

export default MediaDisplayWithCanvas;

