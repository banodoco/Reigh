import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { GenerationRow } from '@/types/shots';
import { BrushStroke } from '../types';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';

export interface UseInpaintingProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  isVideo: boolean;
  imageDimensions: { width: number; height: number } | null;
  displayCanvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  handleExitInpaintMode: () => void;
}

export interface UseInpaintingReturn {
  isInpaintMode: boolean;
  brushStrokes: BrushStroke[];
  isEraseMode: boolean;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  isGeneratingInpaint: boolean;
  isDrawing: boolean;
  currentStroke: Array<{ x: number; y: number }>;
  setIsInpaintMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInpaintPrompt: (prompt: string) => void;
  setInpaintNumGenerations: (num: number) => void;
  setIsEraseMode: (isErasing: boolean) => void;
  handleEnterInpaintMode: () => void;
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: () => void;
  handleUndo: () => void;
  handleClearMask: () => void;
  handleGenerateInpaint: () => Promise<void>;
  redrawStrokes: (strokes: BrushStroke[]) => void;
}

/**
 * Hook for managing inpainting functionality
 * Handles canvas drawing, mask creation, and inpaint task generation
 */
export const useInpainting = ({
  media,
  selectedProjectId,
  isVideo,
  imageDimensions,
  displayUrl,
}: UseInpaintingProps): UseInpaintingReturn => {
  const [isInpaintMode, setIsInpaintMode] = useState(false);
  const [brushStrokes, setBrushStrokes] = useState<BrushStroke[]>([]);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [inpaintNumGenerations, setInpaintNumGenerations] = useState(1);
  const [isGeneratingInpaint, setIsGeneratingInpaint] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  
  // Refs for inpainting canvases
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Load saved mask from localStorage when entering inpaint mode
  useEffect(() => {
    if (isInpaintMode) {
      try {
        const savedMask = localStorage.getItem(`inpaint-mask-${media.id}`);
        if (savedMask) {
          const parsed = JSON.parse(savedMask);
          setBrushStrokes(parsed.strokes || []);
          setInpaintPrompt(parsed.prompt || '');
          console.log('[Inpaint] Loaded saved mask from localStorage', {
            mediaId: media.id,
            strokeCount: parsed.strokes?.length || 0
          });
          
          // Redraw loaded strokes on next tick
          setTimeout(() => {
            redrawStrokes(parsed.strokes || []);
          }, 100);
        }
      } catch (e) {
        console.error('[Inpaint] Error loading saved mask:', e);
      }
    }
  }, [isInpaintMode, media.id]);

  // Save mask to localStorage when strokes or prompt change
  useEffect(() => {
    if (isInpaintMode && (brushStrokes.length > 0 || inpaintPrompt)) {
      try {
        localStorage.setItem(`inpaint-mask-${media.id}`, JSON.stringify({
          strokes: brushStrokes,
          prompt: inpaintPrompt,
          savedAt: Date.now()
        }));
      } catch (e) {
        console.error('[Inpaint] Error saving mask:', e);
      }
    }
  }, [brushStrokes, inpaintPrompt, isInpaintMode, media.id]);

  // Initialize canvas when entering inpaint mode
  useEffect(() => {
    if (isInpaintMode && displayCanvasRef.current && maskCanvasRef.current && imageContainerRef.current) {
      const container = imageContainerRef.current;
      const img = container.querySelector('img');
      
      if (img) {
        const rect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Set canvas size to match displayed image
        const canvas = displayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        
        canvas.width = rect.width;
        canvas.height = rect.height;
        canvas.style.left = `${rect.left - containerRect.left}px`;
        canvas.style.top = `${rect.top - containerRect.top}px`;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        maskCanvas.width = rect.width;
        maskCanvas.height = rect.height;
        
        console.log('[Inpaint] Canvas initialized', {
          width: rect.width,
          height: rect.height
        });
      }
    }
  }, [isInpaintMode, displayUrl, imageDimensions]);

  // Redraw all strokes on canvas
  const redrawStrokes = useCallback((strokes: BrushStroke[]) => {
    const canvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    
    if (!canvas || !maskCanvas) return;
    
    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    
    if (!ctx || !maskCtx) return;
    
    // Clear both canvases
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    // Redraw all strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      // Draw on display canvas (semi-transparent red for paint, erase for erasing)
      ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
      ctx.lineWidth = stroke.isErasing ? 20 : 20;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      
      // Draw on mask canvas (always white for mask, erase for erasing)
      maskCtx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
      maskCtx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)';
      maskCtx.lineWidth = stroke.isErasing ? 20 : 20;
      maskCtx.lineCap = 'round';
      maskCtx.lineJoin = 'round';
      
      maskCtx.beginPath();
      maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      maskCtx.stroke();
    });
    
    console.log('[Inpaint] Redrawn strokes', { count: strokes.length });
  }, []);

  // Handle mouse/touch drawing
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInpaintMode) return;
    
    e.preventDefault();
    setIsDrawing(true);
    
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentStroke([{ x, y }]);
  }, [isInpaintMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInpaintMode || !isDrawing) return;
    
    e.preventDefault();
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentStroke(prev => [...prev, { x, y }]);
    
    // Draw current stroke on display canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.globalCompositeOperation = isEraseMode ? 'destination-out' : 'source-over';
    ctx.strokeStyle = isEraseMode ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (currentStroke.length > 0) {
      const lastPoint = currentStroke[currentStroke.length - 1];
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [isInpaintMode, isDrawing, isEraseMode, currentStroke]);

  const handlePointerUp = useCallback(() => {
    if (!isInpaintMode || !isDrawing) return;
    
    setIsDrawing(false);
    
    if (currentStroke.length > 1) {
      const newStroke: BrushStroke = {
        id: nanoid(),
        points: currentStroke,
        isErasing: isEraseMode
      };
      
      setBrushStrokes(prev => [...prev, newStroke]);
      console.log('[Inpaint] Stroke added', { strokeId: newStroke.id, pointCount: currentStroke.length });
    }
    
    setCurrentStroke([]);
  }, [isInpaintMode, isDrawing, currentStroke, isEraseMode]);

  // Undo last stroke
  const handleUndo = useCallback(() => {
    if (brushStrokes.length === 0) return;
    
    const newStrokes = brushStrokes.slice(0, -1);
    setBrushStrokes(newStrokes);
    redrawStrokes(newStrokes);
    
    console.log('[Inpaint] Undo stroke', { remainingCount: newStrokes.length });
  }, [brushStrokes, redrawStrokes]);

  // Clear all strokes
  const handleClearMask = useCallback(() => {
    setBrushStrokes([]);
    redrawStrokes([]);
    console.log('[Inpaint] Cleared all strokes');
  }, [redrawStrokes]);

  // Redraw when strokes change
  useEffect(() => {
    if (isInpaintMode) {
      redrawStrokes(brushStrokes);
    }
  }, [brushStrokes, isInpaintMode, redrawStrokes]);

  // Handle entering/exiting inpaint mode
  const handleEnterInpaintMode = useCallback(() => {
    setIsInpaintMode(true);
    console.log('[Inpaint] Entered inpaint mode');
  }, []);

  const handleExitInpaintMode = useCallback(() => {
    setIsInpaintMode(false);
    setBrushStrokes([]);
    setCurrentStroke([]);
    setIsDrawing(false);
    setIsEraseMode(false);
    setInpaintPrompt('');
    setInpaintNumGenerations(1);
    
    // Don't clear localStorage - keep for next time
    console.log('[Inpaint] Exited inpaint mode');
  }, []);

  // Generate inpaint
  const handleGenerateInpaint = useCallback(async () => {
    if (!selectedProjectId || isVideo || brushStrokes.length === 0 || !inpaintPrompt.trim()) {
      toast.error('Please paint on the image and enter a prompt');
      return;
    }

    setIsGeneratingInpaint(true);
    try {
      const canvas = displayCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      
      if (!canvas || !maskCanvas) {
        throw new Error('Canvas not initialized');
      }

      console.log('[Inpaint] Starting inpaint generation...', {
        mediaId: media.id,
        prompt: inpaintPrompt,
        numGenerations: inpaintNumGenerations,
        strokeCount: brushStrokes.length
      });

      // Create green mask image from mask canvas
      const maskImageData = maskCanvas.toDataURL('image/png');
      
      // Upload mask to storage
      const maskFile = await fetch(maskImageData)
        .then(res => res.blob())
        .then(blob => new File([blob], `inpaint_mask_${media.id}_${Date.now()}.png`, { type: 'image/png' }));
      
      const maskUrl = await uploadImageToStorage(maskFile);
      console.log('[Inpaint] Mask uploaded:', maskUrl);

      // Get source image URL (prefer upscaled if available)
      const sourceUrl = (media as any).upscaled_url || media.location || media.imageUrl;

      // Create inpaint task
      await createImageInpaintTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: media.id,
      });

      console.log('[Inpaint] ✅ Inpaint task created successfully');
      toast.success(`Inpaint task created! Generating ${inpaintNumGenerations} image(s)...`);
      
      // Exit inpaint mode
      handleExitInpaintMode();
      
    } catch (error) {
      console.error('[Inpaint] Error creating inpaint task:', error);
      toast.error('Failed to create inpaint task');
    } finally {
      setIsGeneratingInpaint(false);
    }
  }, [selectedProjectId, isVideo, brushStrokes, inpaintPrompt, inpaintNumGenerations, media, handleExitInpaintMode]);

  return {
    isInpaintMode,
    brushStrokes,
    isEraseMode,
    inpaintPrompt,
    inpaintNumGenerations,
    isGeneratingInpaint,
    isDrawing,
    currentStroke,
    displayCanvasRef,
    maskCanvasRef,
    imageContainerRef,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setIsEraseMode,
    handleEnterInpaintMode,
    handleExitInpaintMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClearMask,
    handleGenerateInpaint,
    redrawStrokes,
  };
};

