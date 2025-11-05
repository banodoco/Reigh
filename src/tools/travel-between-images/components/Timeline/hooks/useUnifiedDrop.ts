import { useState, useCallback } from "react";
import { toast } from "sonner";
import { pixelToFrame } from "../utils/timeline-utils";

export type DragType = 'file' | 'generation' | 'none';

export interface GenerationDropData {
  generationId: string;
  imageUrl: string;
  thumbUrl?: string;
  metadata?: any;
}

interface UseUnifiedDropProps {
  onImageDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  fullMin: number;
  fullRange: number;
}

/**
 * Unified drop hook that handles both file drops (from file system) and generation drops (from GenerationsPane)
 * Reuses the same coordinate system and visual feedback for consistency
 */
export const useUnifiedDrop = ({ 
  onImageDrop, 
  onGenerationDrop, 
  fullMin, 
  fullRange 
}: UseUnifiedDropProps) => {
  const [isFileOver, setIsFileOver] = useState(false);
  const [isGenerationOver, setIsGenerationOver] = useState(false);
  const [dropTargetFrame, setDropTargetFrame] = useState<number | null>(null);

  /**
   * Detect the type of item being dragged
   */
  const getDragType = useCallback((e: React.DragEvent<HTMLDivElement>): DragType => {
    const types = Array.from(e.dataTransfer.types);
    
    // Check for generation data first (more specific)
    if (types.includes('application/x-generation')) {
      return 'generation';
    }
    
    // Check for files
    if (types.includes('Files')) {
      return 'file';
    }
    
    return 'none';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragType = getDragType(e);
    
    if (dragType === 'file' && onImageDrop) {
      setIsFileOver(true);
    } else if (dragType === 'generation' && onGenerationDrop) {
      setIsGenerationOver(true);
    }
  }, [getDragType, onImageDrop, onGenerationDrop]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, containerRef: React.RefObject<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragType = getDragType(e);
    
    if (dragType !== 'none' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const targetFrame = Math.max(0, pixelToFrame(relativeX, rect.width, fullMin, fullRange));
      setDropTargetFrame(targetFrame);
      
      if (dragType === 'file' && onImageDrop) {
        setIsFileOver(true);
        e.dataTransfer.dropEffect = 'copy';
      } else if (dragType === 'generation' && onGenerationDrop) {
        setIsGenerationOver(true);
        e.dataTransfer.dropEffect = 'copy';
      } else {
        e.dataTransfer.dropEffect = 'none';
      }
    } else {
      e.dataTransfer.dropEffect = 'none';
      setDropTargetFrame(null);
    }
  }, [getDragType, onImageDrop, onGenerationDrop, fullMin, fullRange]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only clear state if we're actually leaving the container
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    
    setIsFileOver(false);
    setIsGenerationOver(false);
    setDropTargetFrame(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragType = getDragType(e);
    const targetFrame = dropTargetFrame;
    
    // Reset state
    setIsFileOver(false);
    setIsGenerationOver(false);
    setDropTargetFrame(null);

    // Handle file drops (from file system)
    if (dragType === 'file' && onImageDrop) {
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
        toast.error(`Failed to add images: ${(error as Error).message}`);
      }
    }
    
    // Handle generation drops (from GenerationsPane)
    else if (dragType === 'generation' && onGenerationDrop) {
      try {
        const dataString = e.dataTransfer.getData('application/x-generation');
        
        if (!dataString) {
          return;
        }
        
        const data: GenerationDropData = JSON.parse(dataString);
        
        await onGenerationDrop(data.generationId, data.imageUrl, data.thumbUrl, targetFrame ?? undefined);
      } catch (error) {
        toast.error(`Failed to add generation: ${(error as Error).message}`);
      }
    }
  }, [getDragType, onImageDrop, onGenerationDrop, dropTargetFrame]);

  // Determine current drag type for consumers
  const currentDragType: DragType = isFileOver ? 'file' : isGenerationOver ? 'generation' : 'none';

  return {
    isFileOver: isFileOver || isGenerationOver, // Combined state for backward compatibility
    dropTargetFrame,
    dragType: currentDragType,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};

