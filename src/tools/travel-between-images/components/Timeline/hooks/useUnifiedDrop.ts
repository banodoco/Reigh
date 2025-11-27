import { useState, useCallback } from "react";
import { toast } from "sonner";
import { pixelToFrame } from "../utils/timeline-utils";
import { TIMELINE_PADDING_OFFSET } from "../constants";

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
    
    console.log('[BatchDropPositionIssue] 🔍 getDragType - dataTransfer.types:', {
      types,
      hasFiles: types.includes('Files'),
      hasGeneration: types.includes('application/x-generation'),
      timestamp: Date.now()
    });
    
    // Check for generation data first (more specific)
    if (types.includes('application/x-generation')) {
      console.log('[BatchDropPositionIssue] ✅ DETECTED: generation');
      return 'generation';
    }
    
    // Check for files
    if (types.includes('Files')) {
      console.log('[BatchDropPositionIssue] ✅ DETECTED: file');
      return 'file';
    }
    
    console.log('[BatchDropPositionIssue] ❌ DETECTED: none');
    return 'none';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragType = getDragType(e);
    
    console.log('[BatchDropPositionIssue] 🚀 handleDragEnter:', {
      dragType,
      hasImageDropHandler: !!onImageDrop,
      hasGenerationDropHandler: !!onGenerationDrop,
      timestamp: Date.now()
    });
    
    if (dragType === 'file' && onImageDrop) {
      console.log('[BatchDropPositionIssue] 📁 FILE DRAG ENTER - Setting isFileOver=true');
      setIsFileOver(true);
    } else if (dragType === 'generation' && onGenerationDrop) {
      console.log('[BatchDropPositionIssue] 🖼️ GENERATION DRAG ENTER - Setting isGenerationOver=true');
      setIsGenerationOver(true);
    } else {
      console.log('[BatchDropPositionIssue] ⚠️ DRAG ENTER - No handler for this type');
    }
  }, [getDragType, onImageDrop, onGenerationDrop]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, containerRef: React.RefObject<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragType = getDragType(e);
    
    console.log('[BatchDropPositionIssue] 🔄 handleDragOver:', {
      dragType,
      hasContainerRef: !!containerRef.current,
      timestamp: Date.now()
    });
    
    if (dragType !== 'none' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Account for timeline padding offset - same calculation as useTimelineDrag
      const relativeX = e.clientX - rect.left - TIMELINE_PADDING_OFFSET;
      const effectiveWidth = rect.width - (TIMELINE_PADDING_OFFSET * 2);
      const targetFrame = Math.max(0, pixelToFrame(relativeX, effectiveWidth, fullMin, fullRange));
      setDropTargetFrame(targetFrame);
      
      if (dragType === 'file' && onImageDrop) {
        setIsFileOver(true);
        e.dataTransfer.dropEffect = 'copy';
        console.log('[BatchDropPositionIssue] 📁 FILE OVER - dropEffect=copy');
      } else if (dragType === 'generation' && onGenerationDrop) {
        setIsGenerationOver(true);
        e.dataTransfer.dropEffect = 'copy';
        console.log('[BatchDropPositionIssue] 🖼️ GENERATION OVER - dropEffect=copy');
      } else {
        e.dataTransfer.dropEffect = 'none';
        console.log('[BatchDropPositionIssue] ⚠️ NO HANDLER - dropEffect=none');
      }
    } else {
      e.dataTransfer.dropEffect = 'none';
      setDropTargetFrame(null);
      console.log('[BatchDropPositionIssue] ❌ DRAG OVER - Invalid dragType or no container');
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

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, containerRef?: React.RefObject<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragType = getDragType(e);
    
    // Calculate target frame directly from drop coordinates (not stale state)
    // This fixes the "jumping to wrong location" bug caused by stale dropTargetFrame state
    let targetFrame: number | null = dropTargetFrame;
    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left - TIMELINE_PADDING_OFFSET;
      const effectiveWidth = rect.width - (TIMELINE_PADDING_OFFSET * 2);
      targetFrame = Math.max(0, pixelToFrame(relativeX, effectiveWidth, fullMin, fullRange));
      console.log('[BatchDropPositionIssue] 📍 Calculated frame from drop coords:', {
        clientX: e.clientX,
        relativeX,
        effectiveWidth,
        targetFrame,
        staleStateFrame: dropTargetFrame,
        timestamp: Date.now()
      });
    }
    
    console.log('[BatchDropPositionIssue] 💥 DROP EVENT:', {
      dragType,
      targetFrame,
      hasImageDropHandler: !!onImageDrop,
      hasGenerationDropHandler: !!onGenerationDrop,
      timestamp: Date.now()
    });
    
    // Reset state
    setIsFileOver(false);
    setIsGenerationOver(false);
    setDropTargetFrame(null);

    // Handle file drops (from file system)
    if (dragType === 'file' && onImageDrop) {
      const files = Array.from(e.dataTransfer.files);
      
      console.log('[BatchDropPositionIssue] 📁 FILE DROP:', {
        fileCount: files.length,
        fileNames: files.map(f => f.name),
        targetFrame,
        timestamp: Date.now()
      });
      
      if (files.length === 0) {
        console.log('[BatchDropPositionIssue] ⚠️ FILE DROP - Empty files array');
        return;
      }

      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const validFiles = files.filter(file => {
        if (validImageTypes.includes(file.type)) {
          return true;
        }
        console.log('[BatchDropPositionIssue] ❌ FILE DROP - Invalid type:', file.type);
        toast.error(`Invalid file type for ${file.name}. Only JPEG, PNG, and WebP are supported.`);
        return false;
      });

      if (validFiles.length === 0) {
        console.log('[BatchDropPositionIssue] ❌ FILE DROP - No valid files');
        return;
      }

      try {
        console.log('[BatchDropPositionIssue] 📤 FILE DROP - CALLING onImageDrop:', {
          validFileCount: validFiles.length,
          targetFrame,
          timestamp: Date.now()
        });
        await onImageDrop(validFiles, targetFrame ?? undefined);
        console.log('[BatchDropPositionIssue] ✅ FILE DROP - onImageDrop completed');
      } catch (error) {
        console.error('[BatchDropPositionIssue] ❌ FILE DROP - Error:', error);
        toast.error(`Failed to add images: ${(error as Error).message}`);
      }
    }
    
    // Handle generation drops (from GenerationsPane)
    else if (dragType === 'generation' && onGenerationDrop) {
      console.log('[BatchDropPositionIssue] 🖼️ GENERATION DROP - Starting...');
      
      try {
        const dataString = e.dataTransfer.getData('application/x-generation');
        
        console.log('[BatchDropPositionIssue] 🖼️ GENERATION DROP - dataString:', {
          hasData: !!dataString,
          dataLength: dataString?.length,
          timestamp: Date.now()
        });
        
        if (!dataString) {
          console.error('[BatchDropPositionIssue] ❌ GENERATION DROP - No data found');
          return;
        }
        
        const data: GenerationDropData = JSON.parse(dataString);
        
        console.log('[BatchDropPositionIssue] 🖼️ GENERATION DROP - CALLING onGenerationDrop:', {
          generationId: data.generationId?.substring(0, 8),
          targetFrame,
          hasImageUrl: !!data.imageUrl,
          timestamp: Date.now()
        });
        
        await onGenerationDrop(data.generationId, data.imageUrl, data.thumbUrl, targetFrame ?? undefined);
        console.log('[BatchDropPositionIssue] ✅ GENERATION DROP - onGenerationDrop completed');
      } catch (error) {
        console.error('[BatchDropPositionIssue] ❌ GENERATION DROP - Error:', error);
        toast.error(`Failed to add generation: ${(error as Error).message}`);
      }
    } else {
      console.log('[BatchDropPositionIssue] ⚠️ DROP - No handler matched dragType:', dragType);
    }
  }, [getDragType, onImageDrop, onGenerationDrop, dropTargetFrame, fullMin, fullRange]);

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

