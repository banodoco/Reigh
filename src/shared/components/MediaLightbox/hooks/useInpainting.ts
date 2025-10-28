import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { createAnnotatedImageEditTask } from '@/shared/lib/tasks/annotatedImageEdit';

export interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>; // 2 points for rectangle, 4 points for free-form quad
  isErasing: boolean;
  brushSize: number;
  shapeType?: 'line' | 'rectangle';
  isFreeForm?: boolean; // True if corners have been independently dragged
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
  annotationMode: 'rectangle' | null;
  selectedShapeId: string | null;
  setIsInpaintMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInpaintPrompt: (prompt: string) => void;
  setInpaintNumGenerations: (num: number) => void;
  setBrushSize: (size: number) => void;
  setIsEraseMode: (isErasing: boolean) => void;
  setIsAnnotateMode: (isAnnotate: boolean | ((prev: boolean) => boolean)) => void;
  setEditMode: (mode: 'text' | 'inpaint' | 'annotate' | ((prev: 'text' | 'inpaint' | 'annotate') => 'text' | 'inpaint' | 'annotate')) => void;
  setAnnotationMode: (mode: 'rectangle' | null | ((prev: 'rectangle' | null) => 'rectangle' | null)) => void;
  handleEnterInpaintMode: () => void;
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (e?: React.PointerEvent<HTMLCanvasElement>) => void;
  handleUndo: () => void;
  handleClearMask: () => void;
  handleGenerateInpaint: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => Promise<void>;
  handleDeleteSelected: () => void;
  handleToggleFreeForm: () => void;
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
    annotationMode: 'rectangle' | null;
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
  const [annotationMode, setAnnotationModeInternal] = useState<'rectangle' | null>(null);
  
  // Computed: backwards compatibility
  const isAnnotateMode = editMode === 'annotate';
  
  // Computed: current brush strokes based on mode
  const brushStrokes = editMode === 'annotate' ? annotationStrokes : editMode === 'inpaint' ? inpaintStrokes : [];
  const setBrushStrokes = editMode === 'annotate' ? setAnnotationStrokes : setInpaintStrokes;
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [isDraggingControlPoint, setIsDraggingControlPoint] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'resize'>('resize'); // Auto-set based on edge/corner click
  const [draggingCornerIndex, setDraggingCornerIndex] = useState<number | null>(null); // For free-form corner dragging
  const lastClickTimeRef = useRef<number>(0);
  const lastClickPositionRef = useRef<{ x: number; y: number } | null>(null); // Default to adjust
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const selectedShapeRef = useRef<BrushStroke | null>(null);
  const prevEditModeRef = useRef<'text' | 'inpaint' | 'annotate'>('inpaint');
  const prevMediaIdRef = useRef(media.id); // Track media ID changes
  const prevModeForSelectionRef = useRef<'text' | 'inpaint' | 'annotate'>(editMode); // Track mode changes for selection

  // Wrapper setters that persist to mediaStateRef
  const setEditMode = useCallback((value: 'text' | 'inpaint' | 'annotate' | ((prev: 'text' | 'inpaint' | 'annotate') => 'text' | 'inpaint' | 'annotate')) => {
    setEditModeInternal(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      const currentState = mediaStateRef.current.get(media.id) || { editMode: 'inpaint', annotationMode: null };
      mediaStateRef.current.set(media.id, { ...currentState, editMode: newValue });
      return newValue;
    });
  }, [media.id]);

  const setAnnotationMode = useCallback((value: 'rectangle' | null | ((prev: 'rectangle' | null) => 'rectangle' | null)) => {
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
    // Only run if media.id actually changed
    if (prevMediaIdRef.current === media.id) {
      return;
    }
    
    console.log('[Media] 🔄 Media changed', { 
      from: prevMediaIdRef.current.substring(0, 8), 
      to: media.id.substring(0, 8) 
    });
    
    prevMediaIdRef.current = media.id;
    
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
    console.log('[Selection] ❌ Clearing selection - switched media');
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

  // Load saved settings from localStorage when entering inpaint mode or changing media
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
          
          // Redraw will happen automatically via the redraw effect
        }
      } catch (e) {
        console.error('[Inpaint] Error loading saved data:', e);
      }
    }
  }, [isInpaintMode, media.id]); // Removed isAnnotateMode and displayCanvasRef - only load on mode entry or media change

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
    
    if (stroke.shapeType === 'rectangle') {
      // Check if point is inside or on the rectangle border
      const minX = Math.min(startPoint.x, endPoint.x);
      const maxX = Math.max(startPoint.x, endPoint.x);
      const minY = Math.min(startPoint.y, endPoint.y);
      const maxY = Math.max(startPoint.y, endPoint.y);
      
      // Check if point is inside the rectangle (with threshold for easier selection)
      return x >= minX - threshold && x <= maxX + threshold && 
             y >= minY - threshold && y <= maxY + threshold;
    }
    
    return false;
  };

  // Helper function to get which corner is clicked (returns index 0-3 or null)
  const getClickedCornerIndex = (x: number, y: number, stroke: BrushStroke, threshold: number = 15): number | null => {
    if (stroke.shapeType !== 'rectangle') return null;
    
    const corners = getRectangleCorners(stroke);
    
    for (let i = 0; i < corners.length; i++) {
      const dist = Math.hypot(x - corners[i].x, y - corners[i].y);
      if (dist <= threshold) {
        return i;
      }
    }
    
    return null;
  };
  
  // Helper function to get the 4 corners of a rectangle (handles both 2-point and 4-point forms)
  const getRectangleCorners = (stroke: BrushStroke): Array<{ x: number; y: number }> => {
    if (stroke.isFreeForm && stroke.points.length === 4) {
      // Free-form quadrilateral - return points as-is
      return stroke.points;
    }
    
    // Standard rectangle - calculate 4 corners from 2 points
    const startPoint = stroke.points[0];
    const endPoint = stroke.points[stroke.points.length - 1];
    
    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);
    
    return [
      { x: minX, y: minY }, // top-left (0)
      { x: maxX, y: minY }, // top-right (1)
      { x: maxX, y: maxY }, // bottom-right (2)
      { x: minX, y: maxY }  // bottom-left (3)
    ];
  };

  // Helper function to detect if click is on edge or corner of rectangle
  // Returns 'corner' if on a corner (for resizing), 'edge' if on an edge (for moving), null if neither
  const getRectangleClickType = (x: number, y: number, stroke: BrushStroke, threshold: number = 15): 'corner' | 'edge' | null => {
    if (stroke.shapeType !== 'rectangle') return null;
    
    // Check corners first
    if (getClickedCornerIndex(x, y, stroke, threshold) !== null) {
      return 'corner';
    }
    
    // Check edges
    const corners = getRectangleCorners(stroke);
    const minX = Math.min(...corners.map(c => c.x));
    const maxX = Math.max(...corners.map(c => c.x));
    const minY = Math.min(...corners.map(c => c.y));
    const maxY = Math.max(...corners.map(c => c.y));
    
    const onLeftEdge = Math.abs(x - minX) <= threshold && y >= minY - threshold && y <= maxY + threshold;
    const onRightEdge = Math.abs(x - maxX) <= threshold && y >= minY - threshold && y <= maxY + threshold;
    const onTopEdge = Math.abs(y - minY) <= threshold && x >= minX - threshold && x <= maxX + threshold;
    const onBottomEdge = Math.abs(y - maxY) <= threshold && x >= minX - threshold && x <= maxX + threshold;
    
    if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
      return 'edge';
    }
    
    return null;
  };

  // drawArrow helper function removed (not needed for rectangles)

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
      
      // Highlight selected shapes with green
      if (isSelected && shapeType === 'rectangle') {
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
      
      if (shapeType === 'rectangle') {
        // Use 8px line for annotations
        ctx.lineWidth = 8;
        maskCtx.lineWidth = 8;
        
        if (stroke.isFreeForm && stroke.points.length === 4) {
          // Draw free-form quadrilateral (4 independent corners)
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < 4; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.closePath();
          ctx.stroke();
          
          maskCtx.beginPath();
          maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < 4; i++) {
            maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          maskCtx.closePath();
          maskCtx.stroke();
        } else {
          // Draw standard rectangle from 2 points
          const x = Math.min(startPoint.x, endPoint.x);
          const y = Math.min(startPoint.y, endPoint.y);
          const width = Math.abs(endPoint.x - startPoint.x);
          const height = Math.abs(endPoint.y - startPoint.y);
          
          ctx.strokeRect(x, y, width, height);
          maskCtx.strokeRect(x, y, width, height);
        }
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

  // Rectangles don't need control points (arrow control point logic removed)

  // Note: Mode separation (preventing cross-over) is now handled during drawing
  // This allows both stroke types to persist in localStorage while only showing the current mode's strokes
  
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
  
  // Clear selection only when actually switching modes (not on re-renders)
  useEffect(() => {
    const prevMode = prevModeForSelectionRef.current;
    
    // Only clear if we're actually switching to a different mode
    if (prevMode !== editMode && prevMode === 'annotate') {
      console.log('[Selection] ❌ Clearing selection due to mode switch from annotate', { prevMode, newMode: editMode });
      setSelectedShapeId(null);
    }
    
    prevModeForSelectionRef.current = editMode;
  }, [editMode]);
  
  // Debug: Log whenever selectedShapeId changes
  useEffect(() => {
    console.log('[Selection] 🔍 selectedShapeId changed:', selectedShapeId);
  }, [selectedShapeId]);

  // Auto-select default tools when switching modes
  useEffect(() => {
    // Only trigger when editMode actually changes
    if (prevEditModeRef.current !== editMode) {
      if (editMode === 'annotate' && annotationMode === null) {
        console.log('[InpaintMode] Switching to annotate mode, auto-selecting rectangle');
        setAnnotationMode('rectangle');
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
    
    // In annotate mode, check if clicking on existing shape
    if (isAnnotateMode && annotationMode === 'rectangle') {
      // Check if we clicked on an existing rectangle shape
      for (let i = brushStrokes.length - 1; i >= 0; i--) {
        const stroke = brushStrokes[i];
        if (stroke.shapeType === 'rectangle' && isPointOnShape(x, y, stroke)) {
          console.log('[DirectAction] Clicked on rectangle:', stroke.id);
          
          // Select it
          setSelectedShapeId(stroke.id);
          
          // Check for corner click (single click if already free-form, double-click to enable)
          const now = Date.now();
          const cornerIndex = getClickedCornerIndex(x, y, stroke);
          const lastClickPos = lastClickPositionRef.current;
          const isDoubleClick = cornerIndex !== null && 
                               now - lastClickTimeRef.current < 300 &&
                               lastClickPos &&
                               Math.hypot(x - lastClickPos.x, y - lastClickPos.y) < 10;
          
          lastClickTimeRef.current = now;
          lastClickPositionRef.current = { x, y };
          
          // If already in free-form mode, single click on corner starts free-form dragging
          if (stroke.isFreeForm && cornerIndex !== null) {
            console.log('[Drag] Single-click on FREE-FORM corner - starting corner dragging');
            setDraggingCornerIndex(cornerIndex);
            setIsDraggingShape(true);
            selectedShapeRef.current = stroke;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
          }
          
          // If NOT in free-form mode, double-click on corner enables free-form mode
          if (isDoubleClick && cornerIndex !== null && !stroke.isFreeForm) {
            console.log('[Drag] DOUBLE-CLICK on corner - enabling FREE-FORM dragging');
            
            // Convert to 4-point free-form
            const corners = getRectangleCorners(stroke);
            const updatedStroke: BrushStroke = {
              ...stroke,
              points: corners,
              isFreeForm: true
            };
            const newStrokes = brushStrokes.map(s => s.id === stroke.id ? updatedStroke : s);
            setBrushStrokes(newStrokes);
            selectedShapeRef.current = updatedStroke;
            redrawStrokes(newStrokes);
            
            setDraggingCornerIndex(cornerIndex);
            setIsDraggingShape(true);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
          }
          
          // Determine if clicking edge (move) or corner (resize) and START IMMEDIATELY
          // Note: For free-form shapes, corner clicks are handled above
          const clickType = getRectangleClickType(x, y, stroke);
          
          if (clickType === 'edge') {
            console.log('[Drag] IMMEDIATELY starting to MOVE rectangle (clicked edge)');
            setDragMode('move');
            setIsDraggingShape(true);
            selectedShapeRef.current = stroke;
            const startPoint = stroke.points[0];
            setDragOffset({ x: x - startPoint.x, y: y - startPoint.y });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
          } else if (clickType === 'corner' && !stroke.isFreeForm) {
            // Standard rectangle resize (only for non-free-form rectangles)
            console.log('[Drag] IMMEDIATELY starting to RESIZE rectangle (clicked corner)');
            setDragMode('resize');
            setIsDraggingShape(true);
            selectedShapeRef.current = stroke;
            const startPoint = stroke.points[0];
            setDragOffset({ x: x - startPoint.x, y: y - startPoint.y });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
          }
          
          // If clicked in the middle (not edge or corner), just keep it selected but don't drag
          return;
        }
      }
      
      // Clicked on empty space, deselect any selected shape
      if (selectedShapeId) {
        console.log('[Selection] ❌ Clearing selection - clicked on empty space');
        setSelectedShapeId(null);
      }
      
      // LIMIT TO ONE RECTANGLE: Clear existing rectangles when starting a new one
      if (annotationStrokes.length > 0) {
        console.log('[Annotate] Clearing existing rectangle to allow only one');
        setAnnotationStrokes([]);
        redrawStrokes([]);
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
  }, [isInpaintMode, isAnnotateMode, annotationMode, brushStrokes, annotationStrokes, selectedShapeId, isPointOnShape, getRectangleClickType, getClickedCornerIndex, getRectangleCorners, redrawStrokes, setBrushStrokes]);

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
    
    // Control point dragging removed (rectangles don't have control points)
    
    // Handle dragging selected shape
    if (isDraggingShape && selectedShapeRef.current) {
      const shape = selectedShapeRef.current;
      
      // FREE-FORM CORNER DRAGGING: Move individual corner
      if (draggingCornerIndex !== null && shape.isFreeForm && shape.points.length === 4) {
        console.log(`[FreeFormDrag] Dragging corner ${draggingCornerIndex}`);
        const newPoints = [...shape.points];
        newPoints[draggingCornerIndex] = { x, y };
        
        const updatedShape: BrushStroke = {
          ...shape,
          points: newPoints,
          isFreeForm: true
        };
        
        const newStrokes = brushStrokes.map(s => 
          s.id === shape.id ? updatedShape : s
        );
        setBrushStrokes(newStrokes);
        selectedShapeRef.current = updatedShape;
        redrawStrokes(newStrokes);
        return;
      }
      
      // MOVE MODE: Move the entire shape (clicked on edge)
      if (dragMode === 'move' && dragOffset) {
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
          isFreeForm: shape.isFreeForm
        };
        
        // Update the shape in the strokes array
        const newStrokes = brushStrokes.map(s => 
          s.id === shape.id ? updatedShape : s
        );
        setBrushStrokes(newStrokes);
        selectedShapeRef.current = updatedShape;
        redrawStrokes(newStrokes);
      } else if (dragMode === 'resize' && dragOffset) {
        // RESIZE MODE: Change the shape itself (clicked on corner)
        const startPoint = shape.points[0];
        
        if (shape.shapeType === 'rectangle') {
          // For rectangles: adjust size by changing the end point
          const updatedShape: BrushStroke = {
            ...shape,
            points: [startPoint, { x, y }],
            isFreeForm: false // Reset to regular rectangle
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
        
        if (annotationMode === 'rectangle') {
          // Draw rectangle preview
          const width = x - startPoint.x;
          const height = y - startPoint.y;
          ctx.strokeRect(startPoint.x, startPoint.y, width, height);
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
  }, [isInpaintMode, isDrawing, isEraseMode, currentStroke, brushSize, isAnnotateMode, annotationMode, brushStrokes, redrawStrokes, isDraggingShape, isDraggingControlPoint, dragOffset, dragMode, draggingCornerIndex, displayCanvasRef, maskCanvasRef, setBrushStrokes]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    // Control point drag handling removed (rectangles don't have control points)
    
    // Handle finishing drag operation
    if (isDraggingShape) {
      console.log('[Drag] Finished dragging shape');
      setIsDraggingShape(false);
      setDragOffset(null);
      setDraggingCornerIndex(null); // Reset free-form corner dragging
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
      
      // For rectangles, require minimum drag distance (prevent accidental clicks from creating shapes)
      if (shapeType === 'rectangle') {
        const startPoint = currentStroke[0];
        const endPoint = currentStroke[currentStroke.length - 1];
        const dragDistance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        const MIN_DRAG_DISTANCE = 10; // pixels
        
        if (dragDistance < MIN_DRAG_DISTANCE) {
          console.log('[Rectangle] Drag too short, not creating rectangle', { dragDistance });
          setCurrentStroke([]);
          return;
        }
      }
      
      const newStroke: BrushStroke = {
        id: nanoid(),
        points: currentStroke,
        isErasing: isEraseMode,
        brushSize: brushSize,
        shapeType
      };
      
      // Clear opposite mode's strokes when starting to draw (prevents cross-over)
      if (isAnnotateMode && inpaintStrokes.length > 0) {
        console.log('[ModeSeparation] Drawing in annotate mode - clearing inpaint strokes');
        setInpaintStrokes([]);
      } else if (!isAnnotateMode && annotationStrokes.length > 0) {
        console.log('[ModeSeparation] Drawing in inpaint mode - clearing annotation strokes');
        setAnnotationStrokes([]);
      }
      
      setBrushStrokes(prev => [...prev, newStroke]);
      
      // Auto-select rectangle after drawing (shows delete button immediately)
      if (isAnnotateMode && shapeType === 'rectangle') {
        setSelectedShapeId(newStroke.id);
        console.log('[Selection] Auto-selecting newly drawn rectangle:', newStroke.id);
      }
      
      console.log('[MobilePaintDebug] ✅ Stroke added', { 
        strokeId: newStroke.id, 
        pointCount: currentStroke.length, 
        brushSize, 
        shapeType: newStroke.shapeType
      });
    }
    
    setCurrentStroke([]);
  }, [isInpaintMode, isDrawing, currentStroke, isEraseMode, brushSize, isAnnotateMode, annotationMode, isDraggingShape, isDraggingControlPoint, setBrushStrokes, inpaintStrokes.length, annotationStrokes.length, setInpaintStrokes, setAnnotationStrokes]);

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

  // Toggle free-form mode for selected rectangle
  const handleToggleFreeForm = useCallback(() => {
    if (!selectedShapeId) return;
    
    const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
    if (!selectedShape || selectedShape.shapeType !== 'rectangle') return;
    
    let updatedShape: BrushStroke;
    
    if (selectedShape.isFreeForm) {
      // Convert back to regular rectangle (use bounding box)
      const corners = getRectangleCorners(selectedShape);
      const minX = Math.min(...corners.map(c => c.x));
      const maxX = Math.max(...corners.map(c => c.x));
      const minY = Math.min(...corners.map(c => c.y));
      const maxY = Math.max(...corners.map(c => c.y));
      
      updatedShape = {
        ...selectedShape,
        points: [{ x: minX, y: minY }, { x: maxX, y: maxY }],
        isFreeForm: false
      };
      console.log('[FreeForm] Converted to regular rectangle');
    } else {
      // Convert to free-form (4 independent corners)
      const corners = getRectangleCorners(selectedShape);
      updatedShape = {
        ...selectedShape,
        points: corners,
        isFreeForm: true
      };
      console.log('[FreeForm] Converted to free-form quadrilateral');
    }
    
    const newStrokes = brushStrokes.map(s => s.id === selectedShapeId ? updatedShape : s);
    
    if (isAnnotateMode) {
      setAnnotationStrokes(newStrokes);
    } else {
      setInpaintStrokes(newStrokes);
    }
    
    redrawStrokes(newStrokes);
  }, [selectedShapeId, brushStrokes, isAnnotateMode, getRectangleCorners, redrawStrokes]);

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
    
    const corners = getRectangleCorners(selectedShape);
    const minY = Math.min(...corners.map(c => c.y));
    const maxY = Math.max(...corners.map(c => c.y));
    const minX = Math.min(...corners.map(c => c.x));
    const maxX = Math.max(...corners.map(c => c.x));
    
    const buttonWidth = 80; // Approximate width of delete button
    const padding = 10;
    
    // Place button at top center of rectangle
    let buttonX = (minX + maxX) / 2;
    let buttonY = minY - 50; // 50px above rectangle
    
    // If button would be above canvas, place it below
    if (buttonY < padding) {
      buttonY = maxY + 50;
    }
    
    // Clamp to canvas boundaries
    buttonX = Math.max(buttonWidth / 2 + padding, Math.min(rect.width - buttonWidth / 2 - padding, buttonX));
    buttonY = Math.max(padding, Math.min(rect.height - padding, buttonY));
    
    // Convert canvas coordinates to screen coordinates
    return {
      x: rect.left + buttonX,
      y: rect.top + buttonY
    };
  }, [selectedShapeId, brushStrokes, displayCanvasRef, getRectangleCorners]);

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
    setIsInpaintMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsEraseMode,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    handleEnterInpaintMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClearMask,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,
    redrawStrokes,
  };
};

