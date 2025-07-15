import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/shared/components/ui/button";
import { GenerationRow } from "@/types/shots";
import { getDisplayUrl } from "@/shared/lib/utils";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  KeyboardSensor,
  closestCenter,
  useDraggable,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import MediaLightbox from "@/shared/components/MediaLightbox";

// TimelineItemProps defines the props for individual draggable timeline thumbnail items
interface TimelineItemProps {
  image: GenerationRow;
  framePosition: number;
  maxFrames: number;
  minFrames: number;
  onImageSaved: (imageId: string, newImageUrl: string) => void;
  onDoubleClick: () => void;
  zoomLevel: number;
  fullMinFrames: number;
  fullRange: number;
}

// Internal thumbnail component for the timeline. Kept inside this file as it is only
// used by the Timeline component below.
const TimelineItem: React.FC<TimelineItemProps> = ({
  image,
  framePosition,
  maxFrames,
  minFrames,
  onImageSaved,
  onDoubleClick,
  zoomLevel,
  fullMinFrames,
  fullRange,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: image.shotImageEntryId,
  });

  const transition = undefined; // Disable automatic transition from sortable

  const leftPercent =
    zoomLevel > 1
      ? ((framePosition - fullMinFrames) / fullRange) * 100
      : ((framePosition - minFrames) / (maxFrames - minFrames)) * 100;

  const baseTransform = "translateX(-50%)";
  const style = {
    transform: isDragging ? `${baseTransform} ${CSS.Transform.toString(transform)}` : baseTransform,
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.3 : 1,
    left: `${leftPercent}%`,
    pointerEvents: isDragging ? ("none" as const) : ("auto" as const),
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={onDoubleClick}
      className={`absolute cursor-move ${isDragging ? "z-10" : ""}`}
    >
      <div className="flex flex-col items-center">
        <div className={`w-20 h-20 border-2 ${isDragging ? "border-primary/50" : "border-primary"} rounded-lg overflow-hidden mb-1`}>
          <img src={getDisplayUrl(image.imageUrl)} alt={`Frame ${framePosition}`} className="w-full h-full object-cover" />
        </div>
        <div className="text-xs text-center bg-background px-2 py-1 rounded border">Frame {framePosition}</div>
      </div>
    </div>
  );
};

// Props accepted by the Timeline component extracted from ShotEditor
export interface TimelineProps {
  images: GenerationRow[];
  frameSpacing: number;
  onImageReorder: (orderedIds: string[]) => void;
  onImageSaved: (imageId: string, newImageUrl: string) => void;
  shotId: string;
}

/**
 * Timeline component – provides an interactive, zoomable timeline for arranging
 * images at specific frame positions. This is a near verbatim extraction of the
 * implementation previously embedded inside ShotEditor, keeping behaviour and
 * internal state management identical.
 */
const Timeline: React.FC<TimelineProps> = ({ images, frameSpacing, onImageReorder, onImageSaved, shotId }) => {
  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Dragging state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragFramePosition, setDragFramePosition] = useState<number | null>(null);

  // Refs & sensors
  const timelineRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    } as any),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Zoom/pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState(0);

  // Persisted frame positions
  const [framePositions, setFramePositions] = useState<Map<string, number>>(() => {
    const stored = localStorage.getItem(`timelineFramePositions_${shotId}`);
    if (stored) {
      try {
        return new Map(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }
    const initial = new Map<string, number>();
    images.forEach((img, idx) => initial.set(img.shotImageEntryId, idx * frameSpacing));
    return initial;
  });

  // Save positions to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`timelineFramePositions_${shotId}`, JSON.stringify(Array.from(framePositions.entries())));
  }, [framePositions, shotId]);

  // Sync frame positions when image list changes
  useEffect(() => {
    setFramePositions(prev => {
      const map = new Map(prev);
      // Ensure every image has a position
      images.forEach((img, idx) => {
        if (!map.has(img.shotImageEntryId)) {
          map.set(img.shotImageEntryId, idx * frameSpacing);
        }
      });
      // Remove stale entries
      [...map.keys()].forEach(key => {
        if (!images.some(img => img.shotImageEntryId === key)) map.delete(key);
      });
      return map;
    });
  }, [images, frameSpacing]);

  // ----- Timeline dimension calculations -----
  const staticMaxFrame = Math.max(...Array.from(framePositions.values()));
  const staticMinFrame = Math.min(...Array.from(framePositions.values()));
  const padding = 30;

  const [stableRange, setStableRange] = useState<{ min: number; max: number } | null>(null);
  let effectiveMaxFrame = staticMaxFrame;
  let effectiveMinFrame = staticMinFrame;

  if (dragFramePosition !== null) {
    if (stableRange === null) {
      effectiveMaxFrame = Math.max(staticMaxFrame, dragFramePosition);
      effectiveMinFrame = Math.min(staticMinFrame, dragFramePosition);
      setStableRange({ min: effectiveMinFrame, max: effectiveMaxFrame });
    } else {
      effectiveMaxFrame = Math.max(stableRange.max, dragFramePosition);
      effectiveMinFrame = Math.min(stableRange.min, dragFramePosition);
      if (effectiveMaxFrame > stableRange.max || effectiveMinFrame < stableRange.min) {
        setStableRange({ min: effectiveMinFrame, max: effectiveMaxFrame });
      } else {
        effectiveMaxFrame = stableRange.max;
        effectiveMinFrame = stableRange.min;
      }
    }
  } else if (stableRange !== null) {
    const withinTolerance =
      stableRange.max - staticMaxFrame <= 30 && staticMinFrame - stableRange.min <= 30;
    if (withinTolerance) {
      setStableRange(null);
    } else {
      effectiveMaxFrame = stableRange.max;
      effectiveMinFrame = stableRange.min;
    }
  }

  const fullMaxFrames = Math.max(60, effectiveMaxFrame + padding);
  const fullMinFrames = Math.min(0, effectiveMinFrame - padding);
  const fullRange = fullMaxFrames - fullMinFrames;

  const zoomedRange = fullRange / zoomLevel;
  const halfZoomedRange = zoomedRange / 2;
  const clampedZoomCenter = Math.max(
    fullMinFrames + halfZoomedRange,
    Math.min(fullMaxFrames - halfZoomedRange, zoomCenter)
  );
  const minFrames = clampedZoomCenter - halfZoomedRange;
  const maxFrames = clampedZoomCenter + halfZoomedRange;

  // Prepare positional data for each image
  const imagePositions = images.map((image, index) => ({
    image,
    framePosition: framePositions.get(image.shotImageEntryId) ?? index * frameSpacing,
  }));

  // ----- Drag handlers -----
  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragMove = (event: any) => {
    if (!timelineRef.current || !activeId) return;

    const timelineContentRect = timelineRef.current
      .querySelector<HTMLDivElement>("#timeline-container")!
      .getBoundingClientRect();

    const mouseX = event.active.rect.current.translated.left + event.active.rect.current.translated.width / 2;
    const relativeX = mouseX - timelineContentRect.left;
    const timelineWidth = timelineContentRect.width;

    const rawFramePos = fullMinFrames + (relativeX / timelineWidth) * fullRange;
    const unconstrained = Math.max(0, Math.min(fullMaxFrames, rawFramePos));

    // Validate gap rule (max 81 frames)
    const validateGaps = (candidate: number) => {
      const frames = [...framePositions.entries()].map(([id, frame]) => (id === activeId ? candidate : frame));
      frames.push(0);
      frames.sort((a, b) => a - b);
      for (let i = 1; i < frames.length; i++) if (frames[i] - frames[i - 1] > 81) return false;
      return true;
    };

    let finalPos = unconstrained;
    if (!validateGaps(finalPos)) {
      const original = framePositions.get(activeId) ?? 0;
      const dir = unconstrained > original ? 1 : -1;
      let low = Math.min(original, unconstrained);
      let high = Math.max(original, unconstrained);
      let best = original;
      while (low <= high) {
        const mid = Math.round((low + high) / 2);
        if (validateGaps(mid)) {
          best = mid;
          dir > 0 ? (low = mid + 1) : (high = mid - 1);
        } else {
          dir > 0 ? (high = mid - 1) : (low = mid + 1);
        }
      }
      finalPos = best;
    }

    setDragFramePosition(Math.round(finalPos));
  };

  const handleDragEnd = (event: any) => {
    if (dragFramePosition === null) {
      setActiveId(null);
      return;
    }
    setFramePositions(prev => {
      const map = new Map(prev);
      map.set(event.active.id, dragFramePosition);
      return map;
    });

    const newOrder = [...images]
      .sort((a, b) => {
        const fa = framePositions.get(a.shotImageEntryId) ?? 0;
        const fb = framePositions.get(b.shotImageEntryId) ?? 0;
        return a.shotImageEntryId === event.active.id ? dragFramePosition - fb : fa - fb;
      })
      .map(img => img.shotImageEntryId);

    onImageReorder(newOrder);
    setActiveId(null);
    setDragFramePosition(null);
  };

  // ----- Zoom helpers -----
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.5, 10));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.5, 1));
  const handleZoomToLeftmost = () => {
    setZoomLevel(2);
    setZoomCenter(fullMinFrames + fullRange / 4);
  };
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (timelineRef.current!.querySelector("#timeline-container") as HTMLDivElement).getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const clickPos = minFrames + (relativeX / rect.width) * (maxFrames - minFrames);
    const fullPos = fullMinFrames + (relativeX / rect.width) * fullRange;
    setZoomLevel(3);
    setZoomCenter(fullPos);
  };
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return;
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!isHorizontal && Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const pan = (e.deltaY * fullRange) / 2000;
      setZoomCenter(z => z + pan);
    }
  };

  // Helpers for lightbox navigation
  const goNext = () => setLightboxIndex(i => (i === null ? null : (i + 1) % images.length));
  const goPrev = () => setLightboxIndex(i => (i === null ? null : (i - 1 + images.length) % images.length));

  // Utility for showing distances while dragging
  const computeDragDistances = () => {
    if (dragFramePosition === null || !activeId) return null;
    const others = [...framePositions.entries()]
      .filter(([id]) => id !== activeId)
      .map(([_, pos]) => pos)
      .sort((a, b) => a - b);
    let prev: number | undefined;
    let next: number | undefined;
    others.forEach(pos => {
      if (pos < dragFramePosition) prev = pos;
      if (pos > dragFramePosition && next === undefined) next = pos;
    });
    return {
      distanceToPrev: prev !== undefined ? dragFramePosition - prev : undefined,
      distanceToNext: next !== undefined ? next - dragFramePosition : undefined,
    } as const;
  };
  const dragDistances = computeDragDistances();

  return (
    <div className="w-full overflow-x-hidden">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoomLevel <= 1} className="flex items-center gap-1">
          <span className="text-xs">−</span> Zoom Out
        </Button>
        <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoomLevel >= 10} className="flex items-center gap-1">
          <span className="text-xs">+</span> Zoom In
        </Button>
        <Button variant="outline" size="sm" onClick={handleZoomToLeftmost} className="flex items-center gap-1">
          <span className="text-xs">⟵</span> Zoom to Start
        </Button>
        <span className="text-sm text-muted-foreground ml-2">{zoomLevel.toFixed(1)}x zoom</span>
      </div>

      {/* Timeline canvas */}
      <div
        ref={timelineRef}
        className="timeline-scroll relative bg-muted/20 border rounded-lg p-4 overflow-x-auto mb-6"
        style={{ minHeight: "200px", paddingBottom: "3rem" }}
        onWheel={handleWheel}
      >
        {/* Ruler */}
        <div
          className="absolute left-0 h-8 border-t"
          style={{
            bottom: "2rem",
            width: zoomLevel > 1 ? `${zoomLevel * 100}%` : "100%",
            minWidth: "100%",
          }}
        >
          <div className="relative h-full">
            {Array.from({ length: Math.floor(effectiveMaxFrame / 30) + 1 }, (_, i) => {
              const frame = i * 30;
              const position = zoomLevel > 1 ? ((frame - fullMinFrames) / fullRange) * 100 : ((frame - minFrames) / (maxFrames - minFrames)) * 100;
              return (
                <div key={frame} className="absolute flex flex-col items-center" style={{ left: `${position}%` }}>
                  <div className="w-px h-4 bg-border"></div>
                  <span className="text-xs text-muted-foreground mt-1">{frame}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Images */}
        <div
          id="timeline-container"
          className="relative h-32 mb-8"
          onDoubleClick={handleDoubleClick}
          style={{ width: zoomLevel > 1 ? `${zoomLevel * 100}%` : "100%", minWidth: "100%" }}
        >
          {/* Guiding vertical lines */}
          {imagePositions.map(({ image, framePosition }) => (
            <div
              key={`line-${image.shotImageEntryId}`}
              className="absolute top-0 bottom-0 w-px bg-border/30 pointer-events-none"
              style={{
                left:
                  zoomLevel > 1
                    ? `${((framePosition - fullMinFrames) / fullRange) * 100}%`
                    : `${((framePosition - minFrames) / (maxFrames - minFrames)) * 100}%`,
              }}
            />
          ))}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
            {imagePositions.map(({ image, framePosition }, idx) => (
              <TimelineItem
                key={image.shotImageEntryId}
                image={image}
                framePosition={framePosition}
                maxFrames={maxFrames}
                minFrames={minFrames}
                onImageSaved={onImageSaved}
                onDoubleClick={() => setLightboxIndex(idx)}
                zoomLevel={zoomLevel}
                fullMinFrames={fullMinFrames}
                fullRange={fullRange}
              />
            ))}

            <DragOverlay>
              {activeId && dragFramePosition !== null && (
                <div className="relative">
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 border-2 border-primary rounded-lg overflow-hidden mb-1 shadow-lg">
                      <img src={getDisplayUrl(images.find(img => img.shotImageEntryId === activeId)!.imageUrl)} alt={`Frame ${dragFramePosition}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-medium mb-1">Frame {dragFramePosition}</div>
                    {dragDistances && (
                      <div className="flex space-x-2 text-xs text-muted-foreground">
                        {dragDistances.distanceToPrev !== undefined && <span className="bg-background/80 px-1 py-0.5 rounded">←{Math.round(dragDistances.distanceToPrev)}f</span>}
                        {dragDistances.distanceToNext !== undefined && <span className="bg-background/80 px-1 py-0.5 rounded">{Math.round(dragDistances.distanceToNext)}f→</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </DragOverlay>

            {lightboxIndex !== null && images[lightboxIndex] && (
              <MediaLightbox
                media={images[lightboxIndex]}
                onClose={() => setLightboxIndex(null)}
                onNext={images.length > 1 ? goNext : undefined}
                onPrevious={images.length > 1 ? goPrev : undefined}
                onImageSaved={(newUrl: string) => onImageSaved(images[lightboxIndex].id, newUrl)}
                showNavigation={true}
              />
            )}
          </DndContext>
        </div>
      </div>
    </div>
  );
};

export default Timeline; 