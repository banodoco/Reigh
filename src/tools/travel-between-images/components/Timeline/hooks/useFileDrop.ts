import { useState, useCallback } from "react";
import { toast } from "sonner";
import { pixelToFrame } from "../utils/timeline-utils";

interface UseFileDropProps {
  onImageDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  fullMin: number;
  fullRange: number;
}

export const useFileDrop = ({ onImageDrop, fullMin, fullRange }: UseFileDropProps) => {
  const [isFileOver, setIsFileOver] = useState(false);
  const [dropTargetFrame, setDropTargetFrame] = useState<number | null>(null);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files') && onImageDrop) {
      setIsFileOver(true);
    }
  }, [onImageDrop]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, containerRef: React.RefObject<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files') && onImageDrop && containerRef.current) {
      setIsFileOver(true);
      e.dataTransfer.dropEffect = 'copy';
      
      // Calculate target frame position based on mouse position
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const targetFrame = Math.max(0, pixelToFrame(relativeX, rect.width, fullMin, fullRange));
      setDropTargetFrame(targetFrame);
    } else {
      e.dataTransfer.dropEffect = 'none';
      setDropTargetFrame(null);
    }
  }, [onImageDrop, fullMin, fullRange]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsFileOver(false);
    setDropTargetFrame(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const targetFrame = dropTargetFrame;
    setIsFileOver(false);
    setDropTargetFrame(null);

    if (!onImageDrop) {
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) {
      return;
    }

    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const validFiles = files.filter(file => {
      if (validImageTypes.includes(file.type)) {
        return true;
      }
      toast.error(`Invalid file type for ${file.name}. Only JPEG, PNG, and WebP are supported.`);
      return false;
    });

    if (validFiles.length === 0) {
      return;
    }

    try {
      await onImageDrop(validFiles, targetFrame ?? undefined);
    } catch (error) {
      console.error('Error handling image drop:', error);
      toast.error(`Failed to add images: ${(error as Error).message}`);
    }
  }, [onImageDrop, dropTargetFrame]);

  return {
    isFileOver,
    dropTargetFrame,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}; 