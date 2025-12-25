import React from 'react';
import { cn } from '@/lib/utils';
import { AUTO_ADVANCE_ANIMATION_DURATION } from './useTravelAutoAdvance';

// Skeleton component for loading states
const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-muted/50 rounded", className)} />
);

interface TravelExample {
  id: string;
  label: string;
  images: string[];
  video: string;
  poster: string;
}

interface TravelSelectorProps {
  examples: TravelExample[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
  // Animation state
  nextAdvanceIdx: number | null;
  prevAdvanceIdx: number | null;
  drainingIdx: number | null;
  videoProgress: number;
  videoEnded: Set<number>;
  // Image loading
  loadedImages: Set<string>;
  onImageLoad: (src: string) => void;
  // For the 2-image example, we use different images
  twoImageImages?: [string, string];
}

interface SelectorButtonProps {
  example: TravelExample;
  idx: number;
  isSelected: boolean;
  onClick: () => void;
  // Animation state
  isNextWithBorder: boolean;
  isPrevWithBorder: boolean;
  isDraining: boolean;
  videoProgress: number;
  isVideoEnded: boolean;
  // Image loading
  loadedImages: Set<string>;
  onImageLoad: (src: string) => void;
  // Custom images for 2-image example
  thumbImages: string[];
}

/**
 * Individual selector button with animation overlays
 */
const SelectorButton: React.FC<SelectorButtonProps> = ({
  example,
  idx,
  isSelected,
  onClick,
  isNextWithBorder,
  isPrevWithBorder,
  isDraining,
  videoProgress,
  isVideoEnded,
  loadedImages,
  onImageLoad,
  thumbImages,
}) => {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg transition-all duration-200 flex items-center justify-center min-h-[60px] relative overflow-hidden bg-muted/30 hover:bg-muted/50"
    >
      {/* Static border for selected item (not during animation) */}
      {isSelected && !isNextWithBorder && !isPrevWithBorder && (
        <div className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none" />
      )}

      {/* Progress fill on current playing video */}
      {isSelected && !isVideoEnded && (
        <div
          className="absolute inset-0 bg-primary/20 rounded-lg"
          style={{
            clipPath: `inset(0 ${100 - videoProgress}% 0 0)`,
            transition: 'clip-path 500ms ease-out',
          }}
        />
      )}

      {/* Fill stays at 100% during countdown before draining */}
      {isPrevWithBorder && !isDraining && (
        <div className="absolute inset-0 bg-primary/20 rounded-lg" />
      )}

      {/* Draining fill on previous video - shrinks from left as new video plays */}
      {isDraining && (
        <div
          className="absolute inset-0 bg-primary/20 rounded-lg"
          style={{
            clipPath: `inset(0 0 0 ${videoProgress}%)`,
            transition: 'clip-path 500ms ease-out',
          }}
        />
      )}

      {/* Border being removed left-to-right */}
      {isPrevWithBorder && (
        <div
          className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
          style={{
            clipPath: 'inset(0 0% 0 0)',
            animation: `hideBorderLeftToRight ${AUTO_ADVANCE_ANIMATION_DURATION} ease-out forwards`,
          }}
        />
      )}

      {/* Border revealed left-to-right like a wave */}
      {isNextWithBorder && !isSelected && (
        <div
          className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
          style={{
            clipPath: 'inset(0 100% 0 0)',
            animation: `revealBorderLeftToRight ${AUTO_ADVANCE_ANIMATION_DURATION} ease-out forwards`,
          }}
        />
      )}

      {/* Mini preview grid matching the layout */}
      <ThumbnailGrid
        images={thumbImages}
        imageCount={example.images.length}
        exampleId={example.id}
        loadedImages={loadedImages}
        onImageLoad={onImageLoad}
      />
    </button>
  );
};

interface ThumbnailGridProps {
  images: string[];
  imageCount: number;
  exampleId: string;
  loadedImages: Set<string>;
  onImageLoad: (src: string) => void;
}

/**
 * Thumbnail grid preview for selector buttons
 */
const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({
  images,
  imageCount,
  exampleId,
  loadedImages,
  onImageLoad,
}) => {
  // 7 images: two rows (4 on top, 3 centered below)
  if (imageCount === 7) {
    return (
      <div className="flex flex-col gap-0.5 relative z-10">
        <div className="flex gap-0.5">
          {images.slice(0, 4).map((img, imgIdx) => (
            <div key={imgIdx} className="w-6 h-[18px] bg-muted/50 rounded-sm overflow-hidden relative flex-shrink-0">
              {!loadedImages.has(img) && <Skeleton className="absolute inset-0" />}
              <img
                src={img}
                alt=""
                className={cn("w-full h-full object-cover", !loadedImages.has(img) && "opacity-0")}
                onLoad={() => onImageLoad(img)}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-0.5 justify-center">
          {images.slice(4, 7).map((img, imgIdx) => (
            <div key={imgIdx + 4} className="w-6 h-[18px] bg-muted/50 rounded-sm overflow-hidden relative flex-shrink-0">
              {!loadedImages.has(img) && <Skeleton className="absolute inset-0" />}
              <img
                src={img}
                alt=""
                className={cn("w-full h-full object-cover", !loadedImages.has(img) && "opacity-0")}
                onLoad={() => onImageLoad(img)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2 or 4 images: horizontal row
  return (
    <div className={cn(
      "gap-1 relative z-10",
      imageCount === 2 && "flex flex-row",
      imageCount === 4 && "flex flex-row"
    )}>
      {images.map((img, imgIdx) => (
        <div
          key={imgIdx}
          className={cn(
            "bg-muted/50 rounded-sm overflow-hidden relative",
            imageCount === 2 && exampleId === '2-images' && "w-10 h-10 aspect-square",
            imageCount === 2 && exampleId !== '2-images' && "w-6 h-6 aspect-square",
            imageCount === 4 && "w-6 h-10"
          )}
        >
          {!loadedImages.has(img) && <Skeleton className="absolute inset-0" />}
          <img
            src={img}
            alt=""
            className={cn("w-full h-full object-cover", !loadedImages.has(img) && "opacity-0")}
            onLoad={() => onImageLoad(img)}
          />
        </div>
      ))}
    </div>
  );
};

/**
 * Travel example selector with animated transitions between items.
 *
 * Includes CSS keyframes for border animations (must be in parent scope).
 */
export const TravelSelector: React.FC<TravelSelectorProps> = ({
  examples,
  selectedIndex,
  onSelect,
  nextAdvanceIdx,
  prevAdvanceIdx,
  drainingIdx,
  videoProgress,
  videoEnded,
  loadedImages,
  onImageLoad,
  twoImageImages,
}) => {
  return (
    <div className="grid grid-cols-3 gap-2 w-full pt-4">
      {examples.map((example, idx) => {
        // Get thumbnail images for the selector
        const thumbImages = idx === 0 && twoImageImages
          ? twoImageImages
          : example.images;

        return (
          <SelectorButton
            key={example.id}
            example={example}
            idx={idx}
            isSelected={selectedIndex === idx}
            onClick={() => onSelect(idx)}
            isNextWithBorder={nextAdvanceIdx === idx}
            isPrevWithBorder={prevAdvanceIdx === idx}
            isDraining={drainingIdx === idx}
            videoProgress={videoProgress}
            isVideoEnded={videoEnded.has(idx)}
            loadedImages={loadedImages}
            onImageLoad={onImageLoad}
            thumbImages={thumbImages}
          />
        );
      })}
    </div>
  );
};
