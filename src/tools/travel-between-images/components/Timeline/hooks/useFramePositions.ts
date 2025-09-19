import { useState, useEffect } from "react";
import { GenerationRow } from "@/types/shots";

interface UseFramePositionsProps {
  images: GenerationRow[];
  frameSpacing: number;
  shotId: string;
  pendingPositions?: Map<string, number>;
  onPendingPositionApplied?: (generationId: string) => void;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
}

export const useFramePositions = ({
  images,
  frameSpacing,
  shotId,
  pendingPositions,
  onPendingPositionApplied,
  onFramePositionsChange,
}: UseFramePositionsProps) => {
  const [framePositions, setFramePositions] = useState<Map<string, number>>(new Map());

  // Load positions from localStorage on mount and when shotId changes
  useEffect(() => {
    const stored = localStorage.getItem(`timelineFramePositions_${shotId}`);
    if (stored) {
      try {
        setFramePositions(new Map(JSON.parse(stored)));
      } catch {
        // ignore parsing errors
      }
    } else {
      // If no stored positions, initialize with defaults
      const initial = new Map<string, number>();
      images.forEach((img, idx) => {
        initial.set(img.shotImageEntryId, idx * frameSpacing);
      });
      setFramePositions(initial);
    }
  }, [shotId]);

  // Sync frame positions when images change
  useEffect(() => {
    setFramePositions(prev => {
      const map = new Map(prev);
      let positionsApplied = false;

      images.forEach((img, idx) => {
        const pendingFrame = pendingPositions?.get(img.id);

        if (pendingFrame !== undefined) {
          // A specific position was requested for this new image
          map.set(img.shotImageEntryId, pendingFrame);
          console.log(`[Timeline] Applied pending position for gen ${img.id} to frame ${pendingFrame}`);
          if (onPendingPositionApplied) {
            onPendingPositionApplied(img.id);
          }
          positionsApplied = true;
        } else if (!map.has(img.shotImageEntryId)) {
          // No pending position, assign a default
          const defaultPos = (images.length - 1) * frameSpacing + frameSpacing;
          map.set(img.shotImageEntryId, defaultPos);
          console.log(`[Timeline] Applied default position for new image ${img.shotImageEntryId} to frame ${defaultPos}`);
          positionsApplied = true;
        }
      });

      // Clean up positions for images that no longer exist
      [...map.keys()].forEach(key => {
        if (!images.some(img => img.shotImageEntryId === key)) {
          map.delete(key);
        }
      });
      
      return positionsApplied ? new Map(map) : prev;
    });
  }, [images, frameSpacing, pendingPositions, onPendingPositionApplied]);

  // Save positions to localStorage with increased debounce to reduce cascading updates
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(`timelineFramePositions_${shotId}`, JSON.stringify(Array.from(framePositions.entries())));
      if (onFramePositionsChange) {
        onFramePositionsChange(framePositions);
      }
    }, 500); // Increased from 100ms to 500ms to reduce rapid updates during task cancellation
    return () => clearTimeout(timer);
  }, [framePositions, shotId, onFramePositionsChange]);

  return {
    framePositions,
    setFramePositions,
  };
};
