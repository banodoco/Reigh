import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { createAnnotatedImageEditTask } from '@/shared/lib/tasks/annotatedImageEdit';

export interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  isErasing: boolean;
  brushSize: number;
  shapeType?: 'line' | 'circle' | 'arrow';
  controlPoint?: { x: number; y: number }; // For curved arrows
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
  loras?: Array<{ url: string; strength: number }>;
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
  isAnnotateMode: boolean;
  editMode: 'text' | 'inpaint' | 'annotate';
  annotationMode: 'circle' | 'arrow' | null;
  selectedShapeId: string | null;
  shapeEditMode: 'adjust' | 'move';
  setIsInpaintMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInpaintPrompt: (prompt: string) => void;
  setInpaintNumGenerations: (num: number) => void;
  setBrushSize: (size: number) => void;
  setIsEraseMode: (isErasing: boolean) => void;
  setIsAnnotateMode: (isAnnotate: boolean | ((prev: boolean) => boolean)) => void;
  setEditMode: (mode: 'text' | 'inpaint' | 'annotate' | ((prev: 'text' | 'inpaint' | 'annotate') => 'text' | 'inpaint' | 'annotate')) => void;
  setAnnotationMode: (mode: 'circle' | 'arrow' | null | ((prev: 'circle' | 'arrow' | null) => 'circle' | 'arrow' | null)) => void;
  setShapeEditMode: (mode: 'adjust' | 'move') => void;
  handleEnterInpaintMode: () => void;
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (e?: React.PointerEvent<HTMLCanvasElement>) => void;
  handleUndo: () => void;
  handleClearMask: () => void;
  handleGenerateInpaint: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => Promise<void>;
  handleDeleteSelected: () => void;
  getDeleteButtonPosition: () => { x: number; y: number } | null;
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
  loras,
}: UseInpaintingProps): UseInpaintingReturn => {
  console.log('[InpaintDebug] 🎣 useInpainting hook received props:', {
    shotId: shotId?.substring(0, 8),
    toolTypeOverride,
    selectedProjectId: selectedProjectId?.substring(0, 8),
    mediaId: media.id.substring(0, 8)
  });
  
  // Per-media state storage (persists across media switches)
  const mediaStateRef = useRef<Map<string, {
    editMode: 'text' | 'inpaint' | 'annotate';
    annotationMode: 'circle' | 'arrow' | null;
  }>>(new Map());

  const [isInpaintMode, setIsInpaintMode] = useState(false);
  const [inpaintStrokes, setInpaintStrokes] = useState<BrushStroke[]>([]); // Strokes for inpainting
  const [annotationStrokes, setAnnotationStrokes] = useState<BrushStroke[]>([]); // Strokes for annotations
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [inpaintNumGenerations, setInpaintNumGenerations] = useState(4);
  const [brushSize, setBrushSize] = useState(20);
  const [isGeneratingInpaint, setIsGeneratingInpaint] = useState(false);
  const [inpaintGenerateSuccess, setInpaintGenerateSuccess] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  const [editMode, setEditModeInternal] = useState<'text' | 'inpaint' | 'annotate'>('inpaint');
  const [annotationMode, setAnnotationModeInternal] = useState<'circle' | 'arrow' | null>(null);
  
  // Computed: backwards compatibility
  const isAnnotateMode = editMode === 'annotate';
  
  // Computed: current brush strokes based on mode
  const brushStrokes = editMode === 'annotate' ? annotationStrokes : editMode === 'inpaint' ? inpaintStrokes : [];
  const setBrushStrokes = editMode === 'annotate' ? setAnnotationStrokes : setInpaintStrokes;
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [isDraggingControlPoint, setIsDraggingControlPoint] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [shapeEditMode, setShapeEditMode] = useState<'adjust' | 'move'>('adjust'); // Default to adjust
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const selectedShapeRef = useRef<BrushStroke | null>(null);
  const prevEditModeRef = useRef<'text' | 'inpaint' | 'annotate'>('inpaint');

  // Wrapper setters that persist to mediaStateRef
  const setEditMode = useCallback((value: 'text' | 'inpaint' | 'annotate' | ((prev: 'text' | 'inpaint' | 'annotate') => 'text' | 'inpaint' | 'annotate')) => {
    setEditModeInternal(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      const currentState = mediaStateRef.current.get(media.id) || { editMode: 'inpaint', annotationMode: null };
      mediaStateRef.current.set(media.id, { ...currentState, editMode: newValue });
      return newValue;
    });
  }, [media.id]);

  const setAnnotationMode = useCallback((value: 'circle' | 'arrow' | null | ((prev: 'circle' | 'arrow' | null) => 'circle' | 'arrow' | null)) => {
    setAnnotationModeInternal(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      const currentState = mediaStateRef.current.get(media.id) || { editMode: 'inpaint', annotationMode: null };
      mediaStateRef.current.set(media.id, { ...currentState, annotationMode: newValue });
      return newValue;
    });
  }, [media.id]);
  
  // Backwards compatibility setter
  const setIsAnnotateMode = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const boolValue = typeof value === 'function' ? value(editMode === 'annotate') : value;
    setEditMode(boolValue ? 'annotate' : 'inpaint');
  }, [editMode, setEditMode]);

  // Restore state when media changes
  useEffect(() => {
    const savedState = mediaStateRef.current.get(media.id);
    if (savedState) {
      console.log('[InpaintState] Restoring state for media', { mediaId: media.id.substring(0, 8), savedState });
      setEditModeInternal(savedState.editMode);
      setAnnotationModeInternal(savedState.annotationMode);
    } else {
      console.log('[InpaintState] No saved state for media, using defaults', { mediaId: media.id.substring(0, 8) });
      // Initialize with defaults for new media
      setEditModeInternal('inpaint');
      setAnnotationModeInternal(null);
    }
    
    // Clear selection when switching media
    setSelectedShapeId(null);
  }, [media.id]);
  
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
          // Load both stroke arrays separately
          setInpaintStrokes(parsed.inpaintStrokes || parsed.strokes || []); // Support old format
          setAnnotationStrokes(parsed.annotationStrokes || []);
          setInpaintPrompt(parsed.prompt || '');
          setInpaintNumGenerations(parsed.numGenerations || 4);
          setBrushSize(parsed.brushSize || 20);
          console.log('[Inpaint] Loaded saved data from localStorage', {
            mediaId: media.id,
            inpaintStrokeCount: (parsed.inpaintStrokes || parsed.strokes || []).length,
            annotationStrokeCount: (parsed.annotationStrokes || []).length,
            prompt: parsed.prompt?.substring(0, 30),
            numGenerations: parsed.numGenerations,
            brushSize: parsed.brushSize
          });
          
          // Redraw loaded strokes on next tick (based on current mode)
          // Note: redrawStrokes will be called after it's defined
          setTimeout(() => {
            const canvas = displayCanvasRef.current;
            if (canvas && canvas.getContext('2d')) {
              const strokesToDraw = isAnnotateMode ? (parsed.annotationStrokes || []) : (parsed.inpaintStrokes || parsed.strokes || []);
              // redrawStrokes will be available in the setTimeout callback
              console.log('[Inpaint] Scheduling redraw of loaded strokes', { count: strokesToDraw.length });
            }
          }, 100);
        }
      } catch (e) {
        console.error('[Inpaint] Error loading saved data:', e);
      }
    }
  }, [isInpaintMode, media.id, isAnnotateMode, displayCanvasRef]);

  // Save all settings to localStorage when they change
  useEffect(() => {
    if (isInpaintMode) {
      try {
        localStorage.setItem(`inpaint-data-${media.id}`, JSON.stringify({
          inpaintStrokes: inpaintStrokes,
          annotationStrokes: annotationStrokes,
          prompt: inpaintPrompt,
          numGenerations: inpaintNumGenerations,
          brushSize: brushSize,
          savedAt: Date.now()
        }));
      } catch (e) {
        console.error('[Inpaint] Error saving data:', e);
      }
    }
  }, [inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations, brushSize, isInpaintMode, media.id]);


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

  // Helper function to detect if a point is near a shape
  const isPointOnShape = (x: number, y: number, stroke: BrushStroke, threshold: number = 15): boolean => {
    if (!stroke.shapeType || stroke.shapeType === 'line') return false;
    
    const startPoint = stroke.points[0];
    const endPoint = stroke.points[stroke.points.length - 1];
    
    if (stroke.shapeType === 'circle') {
      // Check if point is on the circle's edge (within threshold)
      const radius = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
      const distFromCenter = Math.hypot(x - startPoint.x, y - startPoint.y);
      return Math.abs(distFromCenter - radius) < threshold;
    } else if (stroke.shapeType === 'arrow') {
      // Check if point is near the arrow line
      // Simple approach: check distance to line segment
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const lineLength = Math.hypot(dx, dy);
      
      if (lineLength === 0) return false;
      
      // Calculate perpendicular distance from point to line
      const t = Math.max(0, Math.min(1, ((x - startPoint.x) * dx + (y - startPoint.y) * dy) / (lineLength * lineLength)));
      const projX = startPoint.x + t * dx;
      const projY = startPoint.y + t * dy;
      const distance = Math.hypot(x - projX, y - projY);
      
      return distance < threshold;
    }
    
    return false;
  };

  // Helper function to draw an arrow (straight or curved)
  const drawArrow = (
    ctx: CanvasRenderingContext2D, 
    fromX: number, 
    fromY: number, 
    toX: number, 
    toY: number, 
    headlen: number,
    controlPoint?: { x: number; y: number }
  ) => {
    // Draw line (curved if control point exists)
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    
    if (controlPoint) {
      // Draw curved line using quadratic bezier
      ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, toX, toY);
    } else {
      // Draw straight line
      ctx.lineTo(toX, toY);
    }
    ctx.stroke();
    
    // Calculate angle for arrow head (tangent at end point)
    let angle: number;
    if (controlPoint) {
      // For curved arrows, calculate tangent at end point
      const dx = toX - controlPoint.x;
      const dy = toY - controlPoint.y;
      angle = Math.atan2(dy, dx);
    } else {
      // For straight arrows, use direct angle
      angle = Math.atan2(toY - fromY, toX - fromX);
    }
    
    // Draw arrow head
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  };

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
      const shapeType = stroke.shapeType || 'line';
      const isSelected = stroke.id === selectedShapeId;
      
      // Set up context for display canvas
      ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'lighten';
      
      // Highlight selected shapes with blue/green
      if (isSelected && (shapeType === 'circle' || shapeType === 'arrow')) {
        ctx.strokeStyle = 'rgba(0, 255, 100, 0.9)';
        ctx.fillStyle = 'rgba(0, 255, 100, 0.2)';
      } else {
        ctx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
        ctx.fillStyle = stroke.isErasing ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 0, 0, 0.2)';
      }
      
      ctx.lineWidth = strokeBrushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Set up context for mask canvas
      maskCtx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
      maskCtx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)';
      maskCtx.fillStyle = stroke.isErasing ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)';
      maskCtx.lineWidth = strokeBrushSize;
      maskCtx.lineCap = 'round';
      maskCtx.lineJoin = 'round';
      
      const startPoint = stroke.points[0];
      const endPoint = stroke.points[stroke.points.length - 1];
      
      if (shapeType === 'circle') {
        // Draw circle - thin outline only
        const radius = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        
        // Use 8px line for annotations
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(startPoint.x, startPoint.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        maskCtx.lineWidth = 8;
        maskCtx.beginPath();
        maskCtx.arc(startPoint.x, startPoint.y, radius, 0, Math.PI * 2);
        maskCtx.stroke();
      } else if (shapeType === 'arrow') {
        // Draw arrow - 8px line (straight or curved)
        const arrowHeadLen = 20;
        
        // Use 8px line for annotations
        ctx.lineWidth = 8;
        maskCtx.lineWidth = 8;
        
        drawArrow(ctx, startPoint.x, startPoint.y, endPoint.x, endPoint.y, arrowHeadLen, stroke.controlPoint);
        drawArrow(maskCtx, startPoint.x, startPoint.y, endPoint.x, endPoint.y, arrowHeadLen, stroke.controlPoint);
      } else {
        // Default: draw line (original behavior)
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
        
        maskCtx.beginPath();
        maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        maskCtx.stroke();
      }
    });
    
    console.log('[Inpaint] Redrawn strokes', { count: strokes.length, selectedId: selectedShapeId });
  }, [selectedShapeId]);

  // Draw control point handle for selected arrow (separate effect to overlay on top)
  useEffect(() => {
    if (!selectedShapeId || !displayCanvasRef.current || !isAnnotateMode) return;
    
    let selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
    if (!selectedShape || selectedShape.shapeType !== 'arrow') return;
    
    // If arrow doesn't have a control point, create one at the midpoint
    if (!selectedShape.controlPoint) {
      const startPoint = selectedShape.points[0];
      const endPoint = selectedShape.points[selectedShape.points.length - 1];
      const midPoint = {
        x: (startPoint.x + endPoint.x) / 2,
        y: (startPoint.y + endPoint.y) / 2
      };
      
      const updatedShape = {
        ...selectedShape,
        controlPoint: midPoint
      };
      
      const newStrokes = brushStrokes.map(s => 
        s.id === selectedShapeId ? updatedShape : s
      );
      setBrushStrokes(newStrokes);
      selectedShape = updatedShape;
    }
    
    const canvas = displayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // First redraw all strokes
    redrawStrokes(brushStrokes);
    
    // Then draw control point handle on top
    if (selectedShape.controlPoint) {
      ctx.fillStyle = 'rgba(0, 255, 100, 0.8)';
      ctx.beginPath();
      ctx.arc(selectedShape.controlPoint.x, selectedShape.controlPoint.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw lines from start/end to control point (visual guide)
      ctx.strokeStyle = 'rgba(0, 255, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      
      const startPoint = selectedShape.points[0];
      const endPoint = selectedShape.points[selectedShape.points.length - 1];
      
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(selectedShape.controlPoint.x, selectedShape.controlPoint.y);
      ctx.lineTo(endPoint.x, endPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [selectedShapeId, brushStrokes, displayCanvasRef, isAnnotateMode, redrawStrokes]);

  // Redraw when switching between annotate and inpaint modes
  useEffect(() => {
    if (isInpaintMode) {
      console.log('[InpaintMode] Mode switched, redrawing', {
        isAnnotateMode,
        strokeCount: brushStrokes.length
      });
      redrawStrokes(brushStrokes);
    }
  }, [isAnnotateMode, isInpaintMode, brushStrokes, redrawStrokes]);
  
  // Clear selection when switching modes (separate effect to avoid clearing on every redraw)
  useEffect(() => {
    setSelectedShapeId(null);
  }, [isAnnotateMode, editMode]);

  // Auto-select default tools when switching modes
  useEffect(() => {
    // Only trigger when editMode actually changes
    if (prevEditModeRef.current !== editMode) {
      if (editMode === 'annotate' && annotationMode === null) {
        console.log('[InpaintMode] Switching to annotate mode, auto-selecting arrow');
        setAnnotationMode('arrow');
      } else if (editMode === 'inpaint') {
        console.log('[InpaintMode] Switching to inpaint mode, auto-selecting paint');
        setIsEraseMode(false);
      }
      prevEditModeRef.current = editMode;
    }
  }, [editMode, annotationMode, setAnnotationMode]);

  // Handle mouse/touch drawing
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    console.log('[MobilePaintDebug] 🔧 handlePointerDown called', {
      isInpaintMode,
      hasCanvas: !!displayCanvasRef.current,
      eventType: e.type,
      pointerType: e.pointerType,
      isAnnotateMode
    });
    
    if (!isInpaintMode) {
      console.log('[MobilePaintDebug] ❌ Not in inpaint mode, returning');
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = displayCanvasRef.current;
    if (!canvas) {
      console.log('[MobilePaintDebug] ❌ No canvas ref, returning');
      return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Store drag start position for tap detection
    dragStartPosRef.current = { x, y };
    
    // In annotate mode, check if clicking on control point or existing shape
    if (isAnnotateMode && (annotationMode === 'circle' || annotationMode === 'arrow')) {
      // First, check if clicking on control point of selected arrow
      if (selectedShapeId) {
        const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
        if (selectedShape && selectedShape.shapeType === 'arrow' && selectedShape.controlPoint) {
          const cp = selectedShape.controlPoint;
          const distToControlPoint = Math.hypot(x - cp.x, y - cp.y);
          
          if (distToControlPoint <= 15) {
            console.log('[ControlPoint] Starting to drag control point');
            setIsDraggingControlPoint(true);
            selectedShapeRef.current = selectedShape;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
          }
        }
      }
      
      // Check if we clicked on an existing annotation shape
      for (let i = brushStrokes.length - 1; i >= 0; i--) {
        const stroke = brushStrokes[i];
        if ((stroke.shapeType === 'circle' || stroke.shapeType === 'arrow') && isPointOnShape(x, y, stroke)) {
          console.log('[Selection] Clicked on shape:', stroke.id);
          
          // If already selected, start dragging it
          if (selectedShapeId === stroke.id) {
            console.log('[Drag] Starting to drag selected shape');
            setIsDraggingShape(true);
            selectedShapeRef.current = stroke;
            const startPoint = stroke.points[0];
            setDragOffset({ x: x - startPoint.x, y: y - startPoint.y });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
          } else {
            // Select this shape
            setSelectedShapeId(stroke.id);
          }
          
          // Don't start drawing
          return;
        }
      }
      
      // Clicked on empty space, deselect any selected shape
      if (selectedShapeId) {
        setSelectedShapeId(null);
      }
    }
    
    // Capture the pointer to receive events even when outside canvas
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    setIsDrawing(true);
    
    console.log('[MobilePaintDebug] ✅ Starting stroke', {
      x,
      y,
      canvasRect: { width: rect.width, height: rect.height, left: rect.left, top: rect.top }
    });
    
    setCurrentStroke([{ x, y }]);
  }, [isInpaintMode, isAnnotateMode, annotationMode, brushStrokes, selectedShapeId, isPointOnShape]);

  // Prevent browser scroll/zoom gestures while actively drawing (iOS Safari)
  useEffect(() => {
    if (!isDrawing) return;
    const preventTouchMove = (e: TouchEvent) => {
      // Only prevent if drawing to avoid breaking normal scroll elsewhere
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventTouchMove);
    };
  }, [isDrawing]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInpaintMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    // Clamp coordinates to canvas boundaries
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    
    // Handle dragging control point
    if (isDraggingControlPoint && selectedShapeRef.current) {
      const shape = selectedShapeRef.current;
      
      // Update control point position
      const updatedShape: BrushStroke = {
        ...shape,
        controlPoint: { x, y }
      };
      
      const newStrokes = brushStrokes.map(s => 
        s.id === shape.id ? updatedShape : s
      );
      setBrushStrokes(newStrokes);
      selectedShapeRef.current = updatedShape;
      redrawStrokes(newStrokes);
      
      return;
    }
    
    // Handle dragging selected shape
    if (isDraggingShape && selectedShapeRef.current && dragOffset) {
      const shape = selectedShapeRef.current;
      
      if (shapeEditMode === 'move') {
        // MOVE MODE: Move the entire shape
        const newStartX = x - dragOffset.x;
        const newStartY = y - dragOffset.y;
        
        // Calculate the offset from old position
        const oldStartPoint = shape.points[0];
        const deltaX = newStartX - oldStartPoint.x;
        const deltaY = newStartY - oldStartPoint.y;
        
        // Update the shape's position
        const updatedPoints = shape.points.map(p => ({
          x: p.x + deltaX,
          y: p.y + deltaY
        }));
        
        const updatedShape: BrushStroke = {
          ...shape,
          points: updatedPoints,
          controlPoint: shape.controlPoint ? {
            x: shape.controlPoint.x + deltaX,
            y: shape.controlPoint.y + deltaY
          } : undefined
        };
        
        // Update the shape in the strokes array
        const newStrokes = brushStrokes.map(s => 
          s.id === shape.id ? updatedShape : s
        );
        setBrushStrokes(newStrokes);
        selectedShapeRef.current = updatedShape;
        redrawStrokes(newStrokes);
      } else {
        // ADJUST MODE: Change the shape itself
        const startPoint = shape.points[0];
        
        if (shape.shapeType === 'circle') {
          // For circles: adjust radius by changing the end point
          const updatedShape: BrushStroke = {
            ...shape,
            points: [startPoint, { x, y }]
          };
          
          const newStrokes = brushStrokes.map(s => 
            s.id === shape.id ? updatedShape : s
          );
          setBrushStrokes(newStrokes);
          selectedShapeRef.current = updatedShape;
          redrawStrokes(newStrokes);
        } else if (shape.shapeType === 'arrow') {
          // For arrows: adjust end point and update control point proportionally
          const oldEndPoint = shape.points[shape.points.length - 1];
          
          // If there was a control point, adjust it proportionally
          let newControlPoint: { x: number; y: number } | undefined = undefined;
          if (shape.controlPoint) {
            // Keep the control point at the same relative position
            const oldMidX = (startPoint.x + oldEndPoint.x) / 2;
            const oldMidY = (startPoint.y + oldEndPoint.y) / 2;
            const newMidX = (startPoint.x + x) / 2;
            const newMidY = (startPoint.y + y) / 2;
            
            const controlOffsetX = shape.controlPoint.x - oldMidX;
            const controlOffsetY = shape.controlPoint.y - oldMidY;
            
            newControlPoint = {
              x: newMidX + controlOffsetX,
              y: newMidY + controlOffsetY
            };
          }
          
          const updatedShape: BrushStroke = {
            ...shape,
            points: [startPoint, { x, y }],
            controlPoint: newControlPoint
          };
          
          const newStrokes = brushStrokes.map(s => 
            s.id === shape.id ? updatedShape : s
          );
          setBrushStrokes(newStrokes);
          selectedShapeRef.current = updatedShape;
          redrawStrokes(newStrokes);
        }
      }
      
      return;
    }
    
    if (!isDrawing) return;
    
    setCurrentStroke(prev => [...prev, { x, y }]);
    
    // Draw current stroke on display canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // In annotation mode, redraw with the updated shape preview
    if (isAnnotateMode && annotationMode) {
      // Redraw all saved strokes first
      redrawStrokes(brushStrokes);
      
      // Then draw the current shape preview
      const startPoint = currentStroke[0];
      if (startPoint) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (annotationMode === 'circle') {
          const radius = Math.hypot(x - startPoint.x, y - startPoint.y);
          ctx.beginPath();
          ctx.arc(startPoint.x, startPoint.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else if (annotationMode === 'arrow') {
          const arrowHeadLen = 20;
          const endPoint = { x, y };
          
          // Calculate control point from the path taken (use middle point if path has multiple points)
          let controlPoint: { x: number; y: number } | undefined;
          if (currentStroke.length > 2) {
            // Use the middle point of the stroke path as control point for curve
            const midIndex = Math.floor(currentStroke.length / 2);
            controlPoint = currentStroke[midIndex];
            
            // Only use control point if it creates a noticeable curve
            const straightLineDist = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
            const controlDist = Math.hypot(controlPoint.x - startPoint.x, controlPoint.y - startPoint.y) +
                               Math.hypot(endPoint.x - controlPoint.x, endPoint.y - controlPoint.y);
            const curveDifference = controlDist - straightLineDist;
            
            // If the path is nearly straight, don't use control point
            if (curveDifference < straightLineDist * 0.1) {
              controlPoint = undefined;
            }
          }
          
          drawArrow(ctx, startPoint.x, startPoint.y, endPoint.x, endPoint.y, arrowHeadLen, controlPoint);
        }
      }
    } else {
      // Original line drawing for inpaint mode
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
    }
  }, [isInpaintMode, isDrawing, isEraseMode, currentStroke, brushSize, isAnnotateMode, annotationMode, brushStrokes, redrawStrokes, isDraggingShape, isDraggingControlPoint, dragOffset, shapeEditMode]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    // Handle finishing control point drag
    if (isDraggingControlPoint) {
      console.log('[ControlPoint] Finished dragging control point');
      setIsDraggingControlPoint(false);
      selectedShapeRef.current = null;
      
      // Release pointer capture
      if (e && e.target) {
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch (err) {
          console.log('[ControlPoint] Could not release pointer capture', err);
        }
      }
      return;
    }
    
    // Handle finishing drag operation
    if (isDraggingShape) {
      console.log('[Drag] Finished dragging shape');
      setIsDraggingShape(false);
      setDragOffset(null);
      selectedShapeRef.current = null;
      
      // Release pointer capture
      if (e && e.target) {
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch (err) {
          console.log('[Drag] Could not release pointer capture', err);
        }
      }
      return;
    }
    
    if (!isInpaintMode || !isDrawing) return;
    
    console.log('[MobilePaintDebug] 🛑 Finishing stroke');
    
    // Release pointer capture if event is provided
    if (e && e.target) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore errors if pointer capture wasn't active
        console.log('[MobilePaintDebug] ⚠️ Could not release pointer capture', err);
      }
    }
    
    setIsDrawing(false);
    
    if (currentStroke.length > 1) {
      const shapeType = isAnnotateMode && annotationMode ? annotationMode : 'line';
      
      // Calculate control point for arrows if the path was curved
      let controlPoint: { x: number; y: number } | undefined;
      if (shapeType === 'arrow' && currentStroke.length > 2) {
        const startPoint = currentStroke[0];
        const endPoint = currentStroke[currentStroke.length - 1];
        const midIndex = Math.floor(currentStroke.length / 2);
        const midPoint = currentStroke[midIndex];
        
        // Check if the path has enough curve to warrant using a control point
        const straightLineDist = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        const controlDist = Math.hypot(midPoint.x - startPoint.x, midPoint.y - startPoint.y) +
                           Math.hypot(endPoint.x - midPoint.x, endPoint.y - midPoint.y);
        const curveDifference = controlDist - straightLineDist;
        
        // If path is curved enough, save the control point
        if (curveDifference >= straightLineDist * 0.1) {
          controlPoint = midPoint;
        }
      }
      
      const newStroke: BrushStroke = {
        id: nanoid(),
        points: currentStroke,
        isErasing: isEraseMode,
        brushSize: brushSize,
        shapeType,
        controlPoint
      };
      
      setBrushStrokes(prev => [...prev, newStroke]);
      console.log('[MobilePaintDebug] ✅ Stroke added', { 
        strokeId: newStroke.id, 
        pointCount: currentStroke.length, 
        brushSize, 
        shapeType: newStroke.shapeType,
        hasCurve: !!controlPoint
      });
    }
    
    setCurrentStroke([]);
  }, [isInpaintMode, isDrawing, currentStroke, isEraseMode, brushSize, isAnnotateMode, annotationMode, isDraggingShape, isDraggingControlPoint]);

  // Undo last stroke
  const handleUndo = useCallback(() => {
    if (brushStrokes.length === 0) return;
    
    const newStrokes = brushStrokes.slice(0, -1);
    // Update the correct array based on mode
    if (isAnnotateMode) {
      setAnnotationStrokes(newStrokes);
    } else {
      setInpaintStrokes(newStrokes);
    }
    redrawStrokes(newStrokes);
    
    console.log('[Inpaint] Undo stroke', { remainingCount: newStrokes.length, mode: isAnnotateMode ? 'annotate' : 'inpaint' });
  }, [brushStrokes, redrawStrokes, isAnnotateMode]);

  // Clear all strokes
  const handleClearMask = useCallback(() => {
    // Clear the correct array based on mode
    if (isAnnotateMode) {
      setAnnotationStrokes([]);
    } else {
      setInpaintStrokes([]);
    }
    setSelectedShapeId(null);
    redrawStrokes([]);
    console.log('[Inpaint] Cleared all strokes', { mode: isAnnotateMode ? 'annotate' : 'inpaint' });
  }, [redrawStrokes, isAnnotateMode]);

  // Delete selected shape
  const handleDeleteSelected = useCallback(() => {
    if (!selectedShapeId) return;
    
    const newStrokes = brushStrokes.filter(s => s.id !== selectedShapeId);
    // Update the correct array based on mode
    if (isAnnotateMode) {
      setAnnotationStrokes(newStrokes);
    } else {
      setInpaintStrokes(newStrokes);
    }
    setSelectedShapeId(null);
    redrawStrokes(newStrokes);
    
    console.log('[Inpaint] Deleted selected shape', { shapeId: selectedShapeId, mode: isAnnotateMode ? 'annotate' : 'inpaint' });
  }, [selectedShapeId, brushStrokes, redrawStrokes, isAnnotateMode]);

  // Keyboard handler for DELETE key
  useEffect(() => {
    if (!isInpaintMode || !isAnnotateMode) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInpaintMode, isAnnotateMode, selectedShapeId, handleDeleteSelected]);

  // Redraw when strokes change
  useEffect(() => {
    if (isInpaintMode) {
      redrawStrokes(brushStrokes);
    }
  }, [brushStrokes, isInpaintMode, redrawStrokes]);

  // Handle entering inpaint mode
  const handleEnterInpaintMode = useCallback(() => {
    console.log('[MobilePaintDebug] 🚀 handleEnterInpaintMode called');
    console.log('[MobilePaintDebug] Before setIsInpaintMode - isInpaintMode:', isInpaintMode);
    setIsInpaintMode(true);
    console.log('[MobilePaintDebug] ✅ Called setIsInpaintMode(true)');
  }, []);

  // Generate inpaint
  const handleGenerateInpaint = useCallback(async () => {
    if (!selectedProjectId || isVideo || inpaintStrokes.length === 0 || !inpaintPrompt.trim()) {
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
        strokeCount: inpaintStrokes.length
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
        loras: loras, // Pass loras if provided (e.g., In-Scene Boost)
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
  }, [selectedProjectId, isVideo, inpaintStrokes, inpaintPrompt, inpaintNumGenerations, media, handleExitInpaintMode]);

  // Generate annotated edit
  const handleGenerateAnnotatedEdit = useCallback(async () => {
    if (!selectedProjectId || isVideo || annotationStrokes.length === 0 || !inpaintPrompt.trim()) {
      toast.error('Please add annotations and enter a prompt');
      return;
    }

    setIsGeneratingInpaint(true);
    try {
      const canvas = displayCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      
      if (!canvas || !maskCanvas) {
        throw new Error('Canvas not initialized');
      }

      console.log('[AnnotatedEdit] Starting annotated edit generation...', {
        mediaId: media.id,
        prompt: inpaintPrompt,
        numGenerations: inpaintNumGenerations,
        annotationCount: annotationStrokes.length
      });

      // Create mask image from mask canvas
      const maskImageData = maskCanvas.toDataURL('image/png');
      
      // Upload mask to storage
      const maskFile = await fetch(maskImageData)
        .then(res => res.blob())
        .then(blob => new File([blob], `annotated_edit_mask_${media.id}_${Date.now()}.png`, { type: 'image/png' }));
      
      const maskUrl = await uploadImageToStorage(maskFile);
      console.log('[AnnotatedEdit] Mask uploaded:', maskUrl);

      // Get source image URL (prefer upscaled if available)
      const sourceUrl = (media as any).upscaled_url || media.location || media.imageUrl;

      // Create annotated image edit task
      console.log('[AnnotatedEdit] 📤 About to call createAnnotatedImageEditTask with:', {
        project_id: selectedProjectId?.substring(0, 8),
        shot_id: shotId?.substring(0, 8),
        tool_type: toolTypeOverride,
        generation_id: media.id.substring(0, 8),
        prompt: inpaintPrompt.substring(0, 30)
      });
      
      await createAnnotatedImageEditTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: media.id,
        shot_id: shotId, // Pass shot_id so complete_task can link results to the shot
        tool_type: toolTypeOverride, // Override tool_type if provided
        loras: loras, // Pass loras if provided (e.g., In-Scene Boost)
      });

      console.log('[AnnotatedEdit] ✅ Annotated edit tasks created successfully');
      
      // Show success state
      setInpaintGenerateSuccess(true);
      
      // Wait 1 second to show success, then exit
      setTimeout(() => {
        setInpaintGenerateSuccess(false);
        handleExitInpaintMode();
      }, 1000);
      
    } catch (error) {
      console.error('[AnnotatedEdit] Error creating annotated edit task:', error);
      toast.error('Failed to create annotated edit task');
    } finally {
      setIsGeneratingInpaint(false);
    }
  }, [selectedProjectId, isVideo, annotationStrokes, inpaintPrompt, inpaintNumGenerations, media, handleExitInpaintMode, shotId, toolTypeOverride, loras, displayCanvasRef, maskCanvasRef]);

  // Get delete button position for selected shape
  const getDeleteButtonPosition = useCallback((): { x: number; y: number } | null => {
    if (!selectedShapeId || !displayCanvasRef.current) return null;
    
    const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
    if (!selectedShape || !selectedShape.shapeType) return null;
    
    const canvas = displayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    const startPoint = selectedShape.points[0];
    const endPoint = selectedShape.points[selectedShape.points.length - 1];
    
    const buttonHeight = 60; // Approximate height of the button group
    const buttonWidth = 200; // Approximate width of the button group
    const padding = 10; // Padding from canvas edges
    
    let buttonX: number, buttonY: number;
    
    if (selectedShape.shapeType === 'circle') {
      // Place button at top of circle
      const radius = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
      buttonX = startPoint.x;
      buttonY = startPoint.y - radius - 50; // 50px above circle
      
      // If button would be above canvas, place it below
      if (buttonY < padding) {
        buttonY = startPoint.y + radius + 50;
      }
    } else if (selectedShape.shapeType === 'arrow') {
      // Place button at midpoint of arrow
      buttonX = (startPoint.x + endPoint.x) / 2;
      buttonY = Math.min(startPoint.y, endPoint.y) - 50; // 50px above arrow
      
      // If button would be above canvas, place it below
      if (buttonY < padding) {
        buttonY = Math.max(startPoint.y, endPoint.y) + 50;
      }
    } else {
      return null;
    }
    
    // Clamp to canvas boundaries
    buttonX = Math.max(buttonWidth / 2 + padding, Math.min(rect.width - buttonWidth / 2 - padding, buttonX));
    buttonY = Math.max(padding, Math.min(rect.height - padding, buttonY));
    
    // Convert canvas coordinates to screen coordinates
    return {
      x: rect.left + buttonX,
      y: rect.top + buttonY
    };
  }, [selectedShapeId, brushStrokes, displayCanvasRef]);

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
    isAnnotateMode,
    editMode,
    annotationMode,
    selectedShapeId,
    shapeEditMode,
    setIsInpaintMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsEraseMode,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    setShapeEditMode,
    handleEnterInpaintMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClearMask,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    getDeleteButtonPosition,
    redrawStrokes,
  };
};

