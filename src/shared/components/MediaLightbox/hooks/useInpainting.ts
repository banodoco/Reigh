import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';

export interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  isErasing: boolean;
  brushSize: number;
}

export interface UseInpaintingProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
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
  brushSize: number;
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isDrawing: boolean;
  currentStroke: Array<{ x: number; y: number }>;
  setIsInpaintMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInpaintPrompt: (prompt: string) => void;
  setInpaintNumGenerations: (num: number) => void;
  setBrushSize: (size: number) => void;
  setIsEraseMode: (isErasing: boolean) => void;
  handleEnterInpaintMode: () => void;
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (e?: React.PointerEvent<HTMLCanvasElement>) => void;
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
  shotId,
  toolTypeOverride,
  isVideo,
  imageDimensions,
  displayCanvasRef,
  maskCanvasRef,
  imageContainerRef,
  handleExitInpaintMode,
}: UseInpaintingProps): UseInpaintingReturn => {
  console.log('[InpaintDebug] 🎣 useInpainting hook received props:', {
    shotId: shotId?.substring(0, 8),
    toolTypeOverride,
    selectedProjectId: selectedProjectId?.substring(0, 8),
    mediaId: media.id.substring(0, 8)
  });
  
  const [isInpaintMode, setIsInpaintMode] = useState(false);
  const [brushStrokes, setBrushStrokes] = useState<BrushStroke[]>([]);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [inpaintNumGenerations, setInpaintNumGenerations] = useState(4);
  const [brushSize, setBrushSize] = useState(20);
  const [isGeneratingInpaint, setIsGeneratingInpaint] = useState(false);
  const [inpaintGenerateSuccess, setInpaintGenerateSuccess] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  
  console.log('[InpaintPaint] 🔍 Hook initialized with refs', {
    hasDisplayCanvasRef: !!displayCanvasRef,
    hasDisplayCanvas: !!displayCanvasRef?.current,
    hasMaskCanvasRef: !!maskCanvasRef,
    hasMaskCanvas: !!maskCanvasRef?.current,
    hasImageContainerRef: !!imageContainerRef,
    hasImageContainer: !!imageContainerRef?.current
  });

  // Load saved settings from localStorage when entering inpaint mode
  useEffect(() => {
    if (isInpaintMode) {
      try {
        const savedData = localStorage.getItem(`inpaint-data-${media.id}`);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          setBrushStrokes(parsed.strokes || []);
          setInpaintPrompt(parsed.prompt || '');
          setInpaintNumGenerations(parsed.numGenerations || 4);
          setBrushSize(parsed.brushSize || 20);
          console.log('[Inpaint] Loaded saved data from localStorage', {
            mediaId: media.id,
            strokeCount: parsed.strokes?.length || 0,
            prompt: parsed.prompt?.substring(0, 30),
            numGenerations: parsed.numGenerations,
            brushSize: parsed.brushSize
          });
          
          // Redraw loaded strokes on next tick
          setTimeout(() => {
            redrawStrokes(parsed.strokes || []);
          }, 100);
        }
      } catch (e) {
        console.error('[Inpaint] Error loading saved data:', e);
      }
    }
  }, [isInpaintMode, media.id]);

  // Save all settings to localStorage when they change
  useEffect(() => {
    if (isInpaintMode) {
      try {
        localStorage.setItem(`inpaint-data-${media.id}`, JSON.stringify({
          strokes: brushStrokes,
          prompt: inpaintPrompt,
          numGenerations: inpaintNumGenerations,
          brushSize: brushSize,
          savedAt: Date.now()
        }));
      } catch (e) {
        console.error('[Inpaint] Error saving data:', e);
      }
    }
  }, [brushStrokes, inpaintPrompt, inpaintNumGenerations, brushSize, isInpaintMode, media.id]);

  // Initialize canvas when entering inpaint mode
  useEffect(() => {
    console.log('[InpaintPaint] 🔄 Canvas initialization effect', {
      isInpaintMode,
      hasDisplayCanvas: !!displayCanvasRef.current,
      hasMaskCanvas: !!maskCanvasRef.current,
      hasImageContainer: !!imageContainerRef.current
    });
    
    if (isInpaintMode && displayCanvasRef.current && maskCanvasRef.current && imageContainerRef.current) {
      const container = imageContainerRef.current;
      const img = container.querySelector('img');
      
      console.log('[InpaintPaint] 🖼️ Found image', { hasImg: !!img });
      
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
        
        console.log('[InpaintPaint] ✅ Canvas initialized', {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          canvasStyleLeft: canvas.style.left,
          canvasStyleTop: canvas.style.top,
          canvasStyleWidth: canvas.style.width,
          canvasStyleHeight: canvas.style.height,
          imgRect: { width: rect.width, height: rect.height, left: rect.left, top: rect.top },
          containerRect: { left: containerRect.left, top: containerRect.top }
        });
      } else {
        console.log('[InpaintPaint] ❌ No image found in container');
      }
    }
  }, [isInpaintMode, media.location, imageDimensions]);

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
    
    // Redraw all strokes using each stroke's stored brush size
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      // Use the stroke's stored brush size (fallback to 20 for legacy strokes)
      const strokeBrushSize = stroke.brushSize || 20;
      
      // Draw on display canvas (semi-transparent red for paint, erase for erasing)
      ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
      ctx.lineWidth = strokeBrushSize;
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
      maskCtx.lineWidth = strokeBrushSize;
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
    console.log('[InpaintPaint] 🔧 handlePointerDown called', {
      isInpaintMode,
      hasCanvas: !!displayCanvasRef.current,
      eventType: e.type,
      pointerType: e.pointerType
    });
    
    if (!isInpaintMode) {
      console.log('[InpaintPaint] ❌ Not in inpaint mode, returning');
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = displayCanvasRef.current;
    if (!canvas) {
      console.log('[InpaintPaint] ❌ No canvas ref, returning');
      return;
    }
    
    // Capture the pointer to receive events even when outside canvas
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    setIsDrawing(true);
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    console.log('[InpaintPaint] ✅ Starting stroke', {
      x,
      y,
      canvasRect: { width: rect.width, height: rect.height, left: rect.left, top: rect.top }
    });
    
    setCurrentStroke([{ x, y }]);
  }, [isInpaintMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInpaintMode || !isDrawing) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    // Clamp coordinates to canvas boundaries
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    
    setCurrentStroke(prev => [...prev, { x, y }]);
    
    // Draw current stroke on display canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.globalCompositeOperation = isEraseMode ? 'destination-out' : 'source-over';
    ctx.strokeStyle = isEraseMode ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (currentStroke.length > 0) {
      const lastPoint = currentStroke[currentStroke.length - 1];
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [isInpaintMode, isDrawing, isEraseMode, currentStroke, brushSize]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInpaintMode || !isDrawing) return;
    
    console.log('[InpaintPaint] 🛑 Finishing stroke');
    
    // Release pointer capture if event is provided
    if (e && e.target) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore errors if pointer capture wasn't active
        console.log('[InpaintPaint] ⚠️ Could not release pointer capture', err);
      }
    }
    
    setIsDrawing(false);
    
    if (currentStroke.length > 1) {
      const newStroke: BrushStroke = {
        id: nanoid(),
        points: currentStroke,
        isErasing: isEraseMode,
        brushSize: brushSize
      };
      
      setBrushStrokes(prev => [...prev, newStroke]);
      console.log('[InpaintPaint] ✅ Stroke added', { strokeId: newStroke.id, pointCount: currentStroke.length, brushSize });
    }
    
    setCurrentStroke([]);
  }, [isInpaintMode, isDrawing, currentStroke, isEraseMode, brushSize]);

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

  // Handle entering inpaint mode
  const handleEnterInpaintMode = useCallback(() => {
    console.log('[InpaintPaint] 🚀 Entering inpaint mode');
    setIsInpaintMode(true);
    console.log('[InpaintPaint] ✅ Inpaint mode state set to true');
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
      console.log('[InpaintDebug] 📤 About to call createImageInpaintTask with:', {
        project_id: selectedProjectId?.substring(0, 8),
        shot_id: shotId?.substring(0, 8),
        tool_type: toolTypeOverride,
        generation_id: media.id.substring(0, 8),
        prompt: inpaintPrompt.substring(0, 30)
      });
      
      await createImageInpaintTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: media.id,
        shot_id: shotId, // Pass shot_id so complete_task can link results to the shot
        tool_type: toolTypeOverride, // Override tool_type if provided (e.g., 'image-generation' when used in different contexts)
      });

      console.log('[Inpaint] ✅ Inpaint tasks created successfully');
      
      // Show success state
      setInpaintGenerateSuccess(true);
      
      // Wait 1 second to show success, then exit
      setTimeout(() => {
        setInpaintGenerateSuccess(false);
        handleExitInpaintMode();
      }, 1000);
      
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
    brushSize,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isDrawing,
    currentStroke,
    setIsInpaintMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsEraseMode,
    handleEnterInpaintMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClearMask,
    handleGenerateInpaint,
    redrawStrokes,
  };
};

