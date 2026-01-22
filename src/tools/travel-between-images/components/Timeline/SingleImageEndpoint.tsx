import React, { useState, useRef } from "react";
import { GripVertical } from "lucide-react";
import { framesToSeconds } from "./utils/time-utils";
import { TIMELINE_PADDING_OFFSET } from "./constants";

interface SingleImageEndpointProps {
  /** Frame position of the endpoint */
  framePosition: number;
  /** Frame position of the image (start of the region) */
  imageFramePosition: number;
  /** Whether this endpoint is currently being dragged */
  isDragging: boolean;
  /** Pixel offset during drag */
  dragOffset: { x: number; y: number } | null;
  /** Mouse down handler - same signature as TimelineItem */
  onMouseDown?: (e: React.MouseEvent, id: string) => void;
  /** Timeline width in pixels */
  timelineWidth: number;
  /** Minimum frame in coordinate system */
  fullMinFrames: number;
  /** Frame range for coordinate system */
  fullRange: number;
  /** Current drag frame (for showing live position during drag) */
  currentDragFrame: number | null;
  /** Gap to the image (for display) */
  gapToImage: number;
  /** Max allowed gap */
  maxAllowedGap: number;
  /** Read-only mode */
  readOnly?: boolean;
  /** Click handler for the duration label - opens settings modal */
  onDurationClick?: () => void;
}

// Constant ID for the endpoint - used in positions map and drag system
export const SINGLE_IMAGE_ENDPOINT_ID = '__single_image_endpoint';

/**
 * SingleImageEndpoint - A draggable marker for single-image timeline duration
 *
 * This component behaves like a TimelineItem but renders as a simple vertical
 * marker with a drag handle. It uses the same drag system and positioning
 * calculations as images.
 */
const SingleImageEndpoint: React.FC<SingleImageEndpointProps> = ({
  framePosition,
  imageFramePosition,
  isDragging,
  dragOffset,
  onMouseDown,
  timelineWidth,
  fullMinFrames,
  fullRange,
  currentDragFrame,
  gapToImage,
  maxAllowedGap,
  readOnly = false,
  onDurationClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate pixel positions (same as TimelineItem/PairRegion)
  const effectiveWidth = timelineWidth - (TIMELINE_PADDING_OFFSET * 2);

  // Calculate image position (start of region)
  const imagePixelPos = TIMELINE_PADDING_OFFSET + ((imageFramePosition - fullMinFrames) / fullRange) * effectiveWidth;
  const imageLeftPercent = (imagePixelPos / timelineWidth) * 100;

  // Calculate endpoint position
  const displayFrame = isDragging && currentDragFrame !== null ? currentDragFrame : framePosition;
  let endpointPixelPos = TIMELINE_PADDING_OFFSET + ((displayFrame - fullMinFrames) / fullRange) * effectiveWidth;

  // Apply drag offset if dragging
  if (isDragging && dragOffset) {
    endpointPixelPos += dragOffset.x;
  }

  const endpointLeftPercent = (endpointPixelPos / timelineWidth) * 100;

  // Display the gap during drag
  const displayGap = isDragging && currentDragFrame !== null
    ? currentDragFrame - imageFramePosition
    : gapToImage;

  const isOverMaxGap = displayGap > maxAllowedGap;

  // Color scheme (blue - matches first pair in PairRegion)
  const colorScheme = {
    regionBg: 'bg-blue-50 dark:bg-blue-950/40',
    regionBorder: 'border-blue-300 dark:border-blue-700',
    line: 'bg-blue-400 dark:bg-blue-600',
    handle: 'bg-blue-500 dark:bg-blue-400',
    handleHover: 'hover:bg-blue-600 dark:hover:bg-blue-300',
    text: 'text-blue-700 dark:text-blue-300',
    labelBg: 'bg-blue-100 dark:bg-blue-900/50',
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly || !onMouseDown) return;
    onMouseDown(e, SINGLE_IMAGE_ENDPOINT_ID);
  };

  return (
    <>
      {/* Highlighted region between image and endpoint (like PairRegion) */}
      <div
        className={`absolute top-0 bottom-0 ${colorScheme.regionBg} ${colorScheme.regionBorder} border-l-2 border-r-2 border-solid pointer-events-none`}
        style={{
          left: `${imageLeftPercent}%`,
          width: `${Math.max(0, endpointLeftPercent - imageLeftPercent)}%`,
          transition: isDragging ? 'none' : 'width 0.1s ease-out, left 0.1s ease-out',
        }}
      />

      {/* Connecting line from image to endpoint */}
      <div
        className={`absolute top-1/2 h-[2px] ${colorScheme.line} pointer-events-none z-5`}
        style={{
          left: `${imageLeftPercent}%`,
          width: `${Math.max(0, endpointLeftPercent - imageLeftPercent)}%`,
          transform: 'translateY(-50%)',
          transition: isDragging ? 'none' : 'width 0.1s ease-out',
        }}
      />

      {/* Duration label (centered in the region) - clickable to open settings */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap z-10
          px-2.5 py-1 rounded-full text-[11px] font-light shadow-sm
          bg-card/90 dark:bg-gray-800/90 ${colorScheme.text} border ${colorScheme.regionBorder}
          ${onDurationClick ? 'cursor-pointer hover:bg-card dark:hover:bg-gray-800 hover:shadow-md transition-all duration-200' : 'pointer-events-none'}
        `}
        style={{
          left: `${(imageLeftPercent + endpointLeftPercent) / 2}%`,
          transform: 'translate(-50%, -50%)',
        }}
        onClick={onDurationClick}
      >
        Duration • {framesToSeconds(displayGap)}
      </div>

      {/* Endpoint marker and drag handle */}
      <div
        className="absolute"
        style={{
          left: `${endpointLeftPercent}%`,
          top: 0,
          bottom: 0,
          transform: 'translateX(-50%)',
          zIndex: isDragging ? 30 : 15,
          transition: isDragging ? 'none' : 'left 0.1s ease-out',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Vertical line at endpoint */}
        <div
          className={`absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 ${colorScheme.line}`}
        />

        {/* Drag handle */}
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
            w-6 h-16 rounded-full flex items-center justify-center cursor-ew-resize
            ${colorScheme.handle} ${!readOnly ? colorScheme.handleHover : ''}
            transition-all duration-150 shadow-md
            ${isDragging ? 'scale-110 shadow-lg' : isHovered ? 'scale-105' : ''}
            ${readOnly ? 'cursor-default opacity-60' : ''}
          `}
          onMouseDown={handleMouseDown}
        >
          <GripVertical className="h-4 w-4 text-white" />
        </div>

      </div>
    </>
  );
};

export default React.memo(SingleImageEndpoint);
