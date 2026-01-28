import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { createAnnotatedImageEditTask } from '@/shared/lib/tasks/annotatedImageEdit';
import { supabase } from '@/integrations/supabase/client';
import type { EditAdvancedSettings } from './useGenerationEditSettings';
import { convertToHiresFixApiParams } from './useGenerationEditSettings';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { StrokeOverlayHandle } from '../components/StrokeOverlay';

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
  // Active variant ID - strokes are stored per-variant, not per-generation
  activeVariantId?: string | null;
  // Active variant's image URL - use this instead of media.url when editing a variant
  activeVariantLocation?: string | null;
  // Create as new generation instead of variant
  createAsGeneration?: boolean;
  // Advanced settings for hires fix
  advancedSettings?: EditAdvancedSettings;
  // Image URL for canvas-based rendering (single canvas approach)
  imageUrl?: string;
  // Thumbnail URL for progressive loading
  thumbnailUrl?: string;
  // Initial edit mode from persisted settings (prevents flash from 'text' default)
  initialEditMode?: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';
}

// Canvas display size (matches image exactly with new wrapper approach)
export interface CanvasSize {
  width: number;  // Display width in CSS pixels
  height: number; // Display height in CSS pixels
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
  editMode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';
  annotationMode: 'rectangle' | null;
  selectedShapeId: string | null;
  showTextModeHint: boolean;
  setIsInpaintMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInpaintPrompt: (prompt: string) => void;
  setInpaintNumGenerations: (num: number) => void;
  setBrushSize: (size: number) => void;
  setIsEraseMode: (isErasing: boolean) => void;
  setIsAnnotateMode: (isAnnotate: boolean | ((prev: boolean) => boolean)) => void;
  setEditMode: (mode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img' | ((prev: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img') => 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img')) => void;
  setAnnotationMode: (mode: 'rectangle' | null | ((prev: 'rectangle' | null) => 'rectangle' | null)) => void;
  handleEnterInpaintMode: () => void;
  // Konva-based handlers (receive coordinates in image space)
  handleKonvaPointerDown: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  handleKonvaPointerMove: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  handleKonvaPointerUp: (e: KonvaEventObject<PointerEvent>) => void;
  handleShapeClick: (strokeId: string, point: { x: number; y: number }) => void;
  handleUndo: () => void;
  handleClearMask: () => void;
  handleGenerateInpaint: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => Promise<void>;
  handleDeleteSelected: () => void;
  handleToggleFreeForm: () => void;
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  // Ref for StrokeOverlay to enable mask export
  strokeOverlayRef: React.RefObject<StrokeOverlayHandle>;
  // Canvas-based rendering (single canvas approach)
  isImageLoaded: boolean;
  imageLoadError: string | null;
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
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  imageUrl,
  thumbnailUrl,
  initialEditMode,
}: UseInpaintingProps): UseInpaintingReturn => {
  // Storage key uses variant ID if available, otherwise falls back to generation ID
  // This allows different strokes per variant
  const storageKey = activeVariantId
    ? `inpaint-data-${media.id}-variant-${activeVariantId}`
    : `inpaint-data-${media.id}`;

  // IMPORTANT: media.id may be shot_generations.id (junction table) when viewing from shots.
  // For database operations on the generations table, we need the actual generations.id.
  const actualGenerationId = (media as any).generation_id || media.id;
  
  // Track previous storage key to detect variant changes
  const prevStorageKeyRef = useRef<string>(storageKey);
  
  // Per-media state storage (persists across media switches)
  const mediaStateRef = useRef<Map<string, {
    editMode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';
    annotationMode: 'rectangle' | null;
  }>>(new Map());

  // Per-media stroke cache (prevents cross-media contamination)
  const mediaStrokeCacheRef = useRef<Map<string, {
    inpaintStrokes: BrushStroke[];
    annotationStrokes: BrushStroke[];
    prompt: string;
    numGenerations: number;
    brushSize: number;
  }>>(new Map());

  // Track which media have been hydrated from localStorage (prevent re-hydration)
  const hydratedMediaIdsRef = useRef<Set<string>>(new Set());
  
  // Flag to prevent canvas scaling during media transitions
  const isMediaTransitioningRef = useRef(false);
  
  // Ref to latest redrawStrokes to avoid stale closures
  const redrawStrokesRef = useRef<((strokes: BrushStroke[]) => void) | null>(null);

  // Ref to StrokeOverlay for mask export
  const strokeOverlayRef = useRef<StrokeOverlayHandle>(null);
  
  // [MobileHeatDebug] Throttle canvas redraws during drag operations
  const lastRedrawTimeRef = useRef<number>(0);
  const pendingRedrawRef = useRef<NodeJS.Timeout | null>(null);
  const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // Track if we've initialized the canvas with existing strokes (prevents redrawing on every move)
  const hasInitializedCanvasRef = useRef<boolean>(false);
  const lastDrawnPointRef = useRef<{ x: number; y: number } | null>(null);
  
  // Track when user tries to draw in text mode (for tooltip hint)
  const [showTextModeHint, setShowTextModeHint] = useState(false);
  const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track last used edit mode globally (for inheritance when visiting new media)
  const lastUsedEditModeRef = useRef<'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img'>('text');
  
  // Helper: Load edit mode from database
  const loadEditModeFromDB = useCallback(async (generationId: string): Promise<'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img' | null> => {
    try {
      const { data, error } = await supabase
        .from('generations')
        .select('params')
        .eq('id', generationId)
        .maybeSingle();

      if (error) {
        console.warn('[EditMode] Failed to load edit mode from DB:', error);
        return null;
      }

      if (!data) {
        console.log('[EditMode] Generation not found (may have been deleted)');
        return null;
      }
      
      const savedMode = (data?.params as any)?.ui?.editMode;
      if (savedMode && ['text', 'inpaint', 'annotate', 'reposition', 'img2img'].includes(savedMode)) {
        console.log('[EditMode] ✅ Loaded from DB:', { generationId: generationId.substring(0, 8), mode: savedMode });
        return savedMode as 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';
      }
      
      return null;
    } catch (err) {
      console.warn('[EditMode] Error loading from DB:', err);
      return null;
    }
  }, []);
  
  // Helper: Save edit mode to database
  const saveEditModeToDB = useCallback(async (generationId: string, mode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img') => {
    try {
      // First, fetch current params to merge
      const { data: current, error: fetchError } = await supabase
        .from('generations')
        .select('params')
        .eq('id', generationId)
        .maybeSingle();

      if (fetchError) {
        console.warn('[EditMode] Failed to fetch current params:', fetchError);
        return;
      }

      if (!current) {
        console.log('[EditMode] Generation not found (may have been deleted), skipping save');
        return;
      }
      
      // Merge with existing params
      const currentParams = (current?.params || {}) as Record<string, any>;
      const updatedParams = {
        ...currentParams,
        ui: {
          ...(currentParams.ui || {}),
          editMode: mode
        }
      };
      
      const { error: updateError } = await supabase
        .from('generations')
        .update({ params: updatedParams })
        .eq('id', generationId);
      
      if (updateError) {
        console.warn('[EditMode] Failed to save edit mode to DB:', updateError);
      } else {
        console.log('[EditMode] 💾 Saved to DB:', { generationId: generationId.substring(0, 8), mode });
      }
    } catch (err) {
      console.warn('[EditMode] Error saving to DB:', err);
    }
  }, []);

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
  const [editMode, setEditModeInternal] = useState<'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img'>(initialEditMode || 'text');
  const [annotationMode, setAnnotationModeInternal] = useState<'rectangle' | null>(null);

  // Canvas-based image rendering state
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const loadedImageUrlRef = useRef<string | null>(null); // Track which URL is loaded

  // Debug state for production
  // Debug logging removed - no longer needed
  
  // Computed: backwards compatibility
  const isAnnotateMode = editMode === 'annotate';
  
  // Computed: current brush strokes based on mode (memoized to prevent redraw loops)
  const brushStrokes = useMemo(() => {
    return editMode === 'annotate' ? annotationStrokes : editMode === 'inpaint' ? inpaintStrokes : [];
  }, [editMode, annotationStrokes, inpaintStrokes]);

  // Memoize setBrushStrokes to prevent callback recreation on every render
  const setBrushStrokes = useMemo(() => {
    return editMode === 'annotate' ? setAnnotationStrokes : setInpaintStrokes;
  }, [editMode]);
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
  const prevEditModeRef = useRef<'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img'>('text');
  const prevMediaIdRef = useRef(media.id); // Track media ID changes
  const prevModeForSelectionRef = useRef<'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img'>(editMode); // Track mode changes for selection
  const prevCanvasSizeRef = useRef<{ width: number; height: number } | null>(null); // Track canvas size for scaling

  // ============================================
  // Coordinate conversion helpers
  // With the new wrapper approach, canvas matches image exactly.
  // Conversion is just scaling between image pixels and canvas display pixels.
  // ============================================

  /**
   * Convert image pixel coordinates to canvas display coordinates
   * Simple scaling since canvas matches image exactly (no offset)
   */
  const imageToCanvas = useCallback((imageX: number, imageY: number): { x: number; y: number } => {
    if (!canvasSize || !imageDimensions) {
      return { x: imageX, y: imageY }; // Fallback: no scaling
    }
    return {
      x: (imageX / imageDimensions.width) * canvasSize.width,
      y: (imageY / imageDimensions.height) * canvasSize.height
    };
  }, [canvasSize, imageDimensions]);

  /**
   * Convert canvas display coordinates to image pixel coordinates
   * Simple scaling since canvas matches image exactly (no offset)
   */
  const canvasToImage = useCallback((canvasX: number, canvasY: number): { x: number; y: number } => {
    if (!canvasSize || !imageDimensions) {
      return { x: canvasX, y: canvasY }; // Fallback: no scaling
    }
    return {
      x: (canvasX / canvasSize.width) * imageDimensions.width,
      y: (canvasY / canvasSize.height) * imageDimensions.height
    };
  }, [canvasSize, imageDimensions]);

  /**
   * Load an image from URL and return it as an HTMLImageElement
   */
  const loadImageFromUrl = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }, []);

  // ============================================
  // End canvas-based image rendering helpers
  // ============================================

  // Wrapper setters that persist to mediaStateRef and database
  const setEditMode = useCallback((value: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img' | ((prev: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img') => 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img')) => {
    setEditModeInternal(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      const currentState = mediaStateRef.current.get(media.id) || { editMode: 'text', annotationMode: null };
      mediaStateRef.current.set(media.id, { ...currentState, editMode: newValue });

      // Update global last-used mode (for inheritance)
      lastUsedEditModeRef.current = newValue;

      // Save to database (async, non-blocking)
      // Use actualGenerationId (generations.id) not media.id (may be shot_generations.id)
      saveEditModeToDB(actualGenerationId, newValue);

      return newValue;
    });
  }, [media.id, actualGenerationId, saveEditModeToDB]);

  const setAnnotationMode = useCallback((value: 'rectangle' | null | ((prev: 'rectangle' | null) => 'rectangle' | null)) => {
    setAnnotationModeInternal(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      const currentState = mediaStateRef.current.get(media.id) || { editMode: 'text', annotationMode: null };
      mediaStateRef.current.set(media.id, { ...currentState, annotationMode: newValue });
      return newValue;
    });
  }, [media.id]);
  
  // Backwards compatibility setter
  const setIsAnnotateMode = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const boolValue = typeof value === 'function' ? value(editMode === 'annotate') : value;
    setEditMode(boolValue ? 'annotate' : 'inpaint');
  }, [editMode, setEditMode]);

  // Track pending rAF to cancel on rapid media switches
  const transitionRafRef = useRef<number | null>(null);

  // Synchronously swap state when media changes (prevents flicker)
  useLayoutEffect(() => {
    // Only run if media.id actually changed
    if (prevMediaIdRef.current === media.id) {
      return;
    }
    
    const oldMediaId = prevMediaIdRef.current;
    const newMediaId = media.id;
    // For database operations, use the actual generations.id (not shot_generations.id)
    const newActualGenerationId = (media as any).generation_id || media.id;

    console.log('[Media] 🔄 Media switching (synchronous)', {
      from: oldMediaId.substring(0, 8),
      to: newMediaId.substring(0, 8),
      actualGenId: newActualGenerationId.substring(0, 8)
    });
    
    // Cancel any pending transition completion callback from previous switch
    if (transitionRafRef.current !== null) {
      cancelAnimationFrame(transitionRafRef.current);
      transitionRafRef.current = null;
      console.log('[Media] ⚠️ Cancelled pending transition callback (rapid switching)');
    }
    
    // Set transition flag to prevent canvas scaling mid-swap
    isMediaTransitioningRef.current = true;
    
    // Cancel any pending save (prevent saving during media transition)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      console.log('[Media] ⚠️ Cancelled pending save (media switching)');
    }
    
    // 1. Save current media's state to cache before switching
    if (oldMediaId) {
      // Capture stroke state at this exact moment (before any state updates)
      const currentInpaintStrokes = inpaintStrokes;
      const currentAnnotationStrokes = annotationStrokes;
      const currentPrompt = inpaintPrompt;
      const currentNumGenerations = inpaintNumGenerations;
      const currentBrushSize = brushSize;
      
      mediaStrokeCacheRef.current.set(oldMediaId, {
        inpaintStrokes: currentInpaintStrokes,
        annotationStrokes: currentAnnotationStrokes,
        prompt: currentPrompt,
        numGenerations: currentNumGenerations,
        brushSize: currentBrushSize,
      });
      console.log('[Media] 💾 Cached state for old media', { 
        mediaId: oldMediaId.substring(0, 8),
        inpaintCount: currentInpaintStrokes.length,
        annotationCount: currentAnnotationStrokes.length
      });
    }
    
    // 2. Clear stroke state immediately (prevents stale strokes from rendering)
    setInpaintStrokes([]);
    setAnnotationStrokes([]);
    setSelectedShapeId(null);
    console.log('[Media] 🧹 Cleared stroke state');
    
    // 3. Try to load from in-memory cache first (instant, no flicker)
    const cached = mediaStrokeCacheRef.current.get(newMediaId);
    if (cached) {
      console.log('[Media] ✅ Loaded from in-memory cache', { 
        mediaId: newMediaId.substring(0, 8),
        inpaintCount: cached.inpaintStrokes.length,
        annotationCount: cached.annotationStrokes.length
      });
      setInpaintStrokes(cached.inpaintStrokes);
      setAnnotationStrokes(cached.annotationStrokes);
      setInpaintPrompt(cached.prompt);
      setInpaintNumGenerations(cached.numGenerations);
      setBrushSize(cached.brushSize);
    } else if (isInpaintMode && !hydratedMediaIdsRef.current.has(storageKey)) {
      // 4. Load from localStorage if not in cache (only once per media/variant combo)
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          const loadedInpaintStrokes = parsed.inpaintStrokes || parsed.strokes || [];
          const loadedAnnotationStrokes = parsed.annotationStrokes || [];
          
          setInpaintStrokes(loadedInpaintStrokes);
          setAnnotationStrokes(loadedAnnotationStrokes);
          setInpaintPrompt(parsed.prompt || '');
          setInpaintNumGenerations(parsed.numGenerations || 1);
          setBrushSize(parsed.brushSize || 20);
          
          hydratedMediaIdsRef.current.add(storageKey);
          
          console.log('[Media] ✅ Loaded from localStorage (variant-aware)', { 
            storageKey: storageKey.substring(0, 30),
            inpaintCount: loadedInpaintStrokes.length,
            annotationCount: loadedAnnotationStrokes.length
          });
        } else {
          console.log('[Media] ℹ️ No localStorage data for storage key', { storageKey: storageKey.substring(0, 30) });
        }
      } catch (e) {
        console.warn('[Media] ⚠️ Failed to load from localStorage, starting fresh', e);
        // Continue with empty arrays (already set above)
      }
    } else {
      console.log('[Media] ℹ️ No cached data, starting with empty state', { 
        mediaId: newMediaId.substring(0, 8),
        isInpaintMode,
        alreadyHydrated: hydratedMediaIdsRef.current.has(newMediaId)
      });
    }
    
    // 5. Restore UI state (mode, annotation mode)
    // Load edit mode: cache → database → inherit from last used → default to 'text'
    const savedState = mediaStateRef.current.get(newMediaId);
    if (savedState) {
      // Found in memory cache
      console.log('[Media] Restoring UI state from cache', { mediaId: newMediaId.substring(0, 8), savedState });
      setEditModeInternal(savedState.editMode);
      setAnnotationModeInternal(savedState.annotationMode);
      lastUsedEditModeRef.current = savedState.editMode; // Update last used
    } else {
      // Not in cache - try loading from database
      // Use newActualGenerationId for DB operations (generations.id, not shot_generations.id)
      console.log('[Media] No cached UI state, loading from database', { mediaId: newMediaId.substring(0, 8), actualGenId: newActualGenerationId.substring(0, 8) });

      // Load asynchronously to avoid blocking UI
      loadEditModeFromDB(newActualGenerationId).then(dbMode => {
        // Only apply if we're still on the same media (prevent race conditions)
        if (prevMediaIdRef.current === newMediaId) {
          if (dbMode) {
            // Found in database
            console.log('[Media] ✅ Loaded edit mode from DB', { mediaId: newMediaId.substring(0, 8), mode: dbMode });
            setEditModeInternal(dbMode);
            lastUsedEditModeRef.current = dbMode;
            mediaStateRef.current.set(newMediaId, { editMode: dbMode, annotationMode: null });
          } else {
            // Not in database - inherit from last used or default to 'text'
            const inheritedMode = lastUsedEditModeRef.current;
            console.log('[Media] 🔄 Inheriting edit mode', {
              mediaId: newMediaId.substring(0, 8),
              mode: inheritedMode,
              source: 'last-used'
            });
            setEditModeInternal(inheritedMode);
            mediaStateRef.current.set(newMediaId, { editMode: inheritedMode, annotationMode: null });
            // Save to DB for next time (use actualGenerationId)
            saveEditModeToDB(newActualGenerationId, inheritedMode);
          }
        }
      }).catch(err => {
        console.warn('[Media] Failed to load edit mode from DB:', err);
        // Fallback to inherited mode
        if (prevMediaIdRef.current === newMediaId) {
          const inheritedMode = lastUsedEditModeRef.current;
          setEditModeInternal(inheritedMode);
          mediaStateRef.current.set(newMediaId, { editMode: inheritedMode, annotationMode: null });
        }
      });
      
      // Set initial mode immediately (will be updated by DB response)
      const initialMode = lastUsedEditModeRef.current;
      setEditModeInternal(initialMode);
      setAnnotationModeInternal(null);
    }
    
    prevMediaIdRef.current = newMediaId;
    
    // Clear transition flag after a frame (allows canvas to reinitialize safely)
    // Store rAF ID so we can cancel it on rapid switches
    transitionRafRef.current = requestAnimationFrame(() => {
      // Double-check we're still on the same media (prevent race with rapid switching)
      if (prevMediaIdRef.current === newMediaId) {
        isMediaTransitioningRef.current = false;
        console.log('[Media] ✅ Transition complete', { mediaId: newMediaId.substring(0, 8) });
      } else {
        console.log('[Media] ⚠️ Media changed during rAF, keeping transition flag', {
          expected: newMediaId.substring(0, 8),
          current: prevMediaIdRef.current.substring(0, 8)
        });
      }
      transitionRafRef.current = null;
    });
  }, [media.id, isInpaintMode, loadEditModeFromDB, saveEditModeToDB]); // FIXED: Removed stroke state from deps (only trigger on media.id/mode changes)

  // Load saved settings from localStorage ONLY when entering inpaint mode for the first time
  // (media changes are handled by useLayoutEffect above, which uses cache first)
  useEffect(() => {
    // Only hydrate if:
    // 1. Just entered inpaint mode
    // 2. Haven't hydrated this storage key yet
    // 3. Not already in cache
    if (isInpaintMode && 
        !hydratedMediaIdsRef.current.has(storageKey) && 
        !mediaStrokeCacheRef.current.has(storageKey)) {
      
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          const loadedInpaintStrokes = parsed.inpaintStrokes || parsed.strokes || [];
          const loadedAnnotationStrokes = parsed.annotationStrokes || [];
          
          setInpaintStrokes(loadedInpaintStrokes);
          setAnnotationStrokes(loadedAnnotationStrokes);
          setInpaintPrompt(parsed.prompt || '');
          setInpaintNumGenerations(parsed.numGenerations || 1);
          setBrushSize(parsed.brushSize || 20);
          
          hydratedMediaIdsRef.current.add(storageKey);
          
          console.log('[Inpaint] ✅ Hydrated on mode enter (variant-aware)', { 
            storageKey: storageKey.substring(0, 30),
            inpaintCount: loadedInpaintStrokes.length,
            annotationCount: loadedAnnotationStrokes.length
          });
          
          // Redraw strokes immediately after hydration
          // Use a timeout to ensure canvas is ready
          setTimeout(() => {
            if (redrawStrokesRef.current) {
              redrawStrokesRef.current(loadedInpaintStrokes);
            }
          }, 50);
        } else {
          console.log('[Inpaint] ℹ️ No localStorage data on mode enter', { storageKey: storageKey.substring(0, 30) });
        }
      } catch (e) {
        console.warn('[Inpaint] ⚠️ Hydration failed on mode enter, starting fresh', e);
        // Continue with current state (don't crash)
      }
    }
  }, [isInpaintMode, storageKey]); // Only runs when entering inpaint mode or storage key changes (gated by refs)

  // Ref to hold save timeout for debouncing
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to save to localStorage (with error handling)
  const saveToLocalStorage = useCallback(() => {
    if (!isInpaintMode) return;
    
    // Capture storage key at the moment of save (prevent race if variant changes during timeout)
    const storageKeyAtSaveTime = storageKey;
    const inpaintStrokesAtSaveTime = inpaintStrokes;
    const annotationStrokesAtSaveTime = annotationStrokes;
    const promptAtSaveTime = inpaintPrompt;
    const numGenerationsAtSaveTime = inpaintNumGenerations;
    const brushSizeAtSaveTime = brushSize;
    
    try {
      const data = {
        inpaintStrokes: inpaintStrokesAtSaveTime,
        annotationStrokes: annotationStrokesAtSaveTime,
        prompt: promptAtSaveTime,
        numGenerations: numGenerationsAtSaveTime,
        brushSize: brushSizeAtSaveTime,
        savedAt: Date.now()
      };
      localStorage.setItem(storageKeyAtSaveTime, JSON.stringify(data));
      console.log('[Inpaint] 💾 Saved to localStorage (variant-aware)', { 
        storageKey: storageKeyAtSaveTime.substring(0, 30),
        inpaintCount: inpaintStrokesAtSaveTime.length,
        annotationCount: annotationStrokesAtSaveTime.length
      });
    } catch (e) {
      console.warn('[Inpaint] ⚠️ Save failed (localStorage full or disabled?)', e);
      // Don't crash, just log the error
    }
  }, [inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations, brushSize, isInpaintMode, storageKey]);

  // Handle variant switching - reload strokes when variant changes
  // We use refs to access current values without triggering re-runs
  const inpaintStrokesRef = useRef(inpaintStrokes);
  const annotationStrokesRef = useRef(annotationStrokes);
  const inpaintPromptRef = useRef(inpaintPrompt);
  const inpaintNumGenerationsRef = useRef(inpaintNumGenerations);
  const brushSizeRef = useRef(brushSize);
  const isInpaintModeRef = useRef(isInpaintMode);
  
  // Keep refs in sync
  useEffect(() => {
    inpaintStrokesRef.current = inpaintStrokes;
    annotationStrokesRef.current = annotationStrokes;
    inpaintPromptRef.current = inpaintPrompt;
    inpaintNumGenerationsRef.current = inpaintNumGenerations;
    brushSizeRef.current = brushSize;
    isInpaintModeRef.current = isInpaintMode;
  }, [inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations, brushSize, isInpaintMode]);
  
  useEffect(() => {
    if (prevStorageKeyRef.current !== storageKey) {
      console.log('[Inpaint] 🔄 Variant changed, reloading strokes', {
        oldKey: prevStorageKeyRef.current.substring(0, 30),
        newKey: storageKey.substring(0, 30)
      });
      
      // Save current strokes to old key before switching (using refs to get current values)
      if (isInpaintModeRef.current && (inpaintStrokesRef.current.length > 0 || annotationStrokesRef.current.length > 0)) {
        try {
          const data = {
            inpaintStrokes: inpaintStrokesRef.current,
            annotationStrokes: annotationStrokesRef.current,
            prompt: inpaintPromptRef.current,
            numGenerations: inpaintNumGenerationsRef.current,
            brushSize: brushSizeRef.current,
            savedAt: Date.now()
          };
          localStorage.setItem(prevStorageKeyRef.current, JSON.stringify(data));
          console.log('[Inpaint] 💾 Saved strokes for previous variant before switching');
        } catch (e) {
          console.warn('[Inpaint] ⚠️ Failed to save strokes before variant switch', e);
        }
      }
      
      // Load strokes from new variant's key
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          const loadedInpaintStrokes = parsed.inpaintStrokes || parsed.strokes || [];
          const loadedAnnotationStrokes = parsed.annotationStrokes || [];
          
          setInpaintStrokes(loadedInpaintStrokes);
          setAnnotationStrokes(loadedAnnotationStrokes);
          // Keep prompt and settings from current session
          
          console.log('[Inpaint] ✅ Loaded strokes for new variant', {
            storageKey: storageKey.substring(0, 30),
            inpaintCount: loadedInpaintStrokes.length,
            annotationCount: loadedAnnotationStrokes.length
          });
          
          // Redraw strokes after variant switch
          setTimeout(() => {
            if (redrawStrokesRef.current) {
              redrawStrokesRef.current(loadedInpaintStrokes);
            }
          }, 50);
        } else {
          // No saved strokes for this variant - clear canvas
          setInpaintStrokes([]);
          setAnnotationStrokes([]);
          console.log('[Inpaint] ℹ️ No strokes saved for new variant, starting fresh');
          
          // Clear the canvas
          setTimeout(() => {
            if (redrawStrokesRef.current) {
              redrawStrokesRef.current([]);
            }
          }, 50);
        }
      } catch (e) {
        console.warn('[Inpaint] ⚠️ Failed to load strokes for new variant', e);
        setInpaintStrokes([]);
        setAnnotationStrokes([]);
      }
      
      prevStorageKeyRef.current = storageKey;
    }
  }, [storageKey]); // Only re-run when storageKey changes

  // Debounced auto-save (500ms delay to avoid thrashing)
  useEffect(() => {
    if (!isInpaintMode) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Schedule save after 500ms of no changes
    saveTimeoutRef.current = setTimeout(() => {
      saveToLocalStorage();
    }, 500);
    
    // Cleanup on unmount or before next save
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [inpaintStrokes, annotationStrokes, inpaintPrompt, inpaintNumGenerations, brushSize, isInpaintMode, media.id, saveToLocalStorage]);

  // Immediate save on mode exit or unmount (don't lose unsaved changes)
  useEffect(() => {
    return () => {
      // If we're in inpaint mode when unmounting, save immediately
      if (isInpaintMode) {
        // Cancel any pending debounced save
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        // Save immediately
        saveToLocalStorage();
      }
    };
  }, [isInpaintMode, saveToLocalStorage]);


  // Helper function to scale strokes proportionally
  const scaleStrokes = useCallback((strokes: BrushStroke[], oldWidth: number, oldHeight: number, newWidth: number, newHeight: number): BrushStroke[] => {
    const scaleX = newWidth / oldWidth;
    const scaleY = newHeight / oldHeight;
    
    console.log('[InpaintResize] Scaling strokes', {
      oldSize: { width: oldWidth, height: oldHeight },
      newSize: { width: newWidth, height: newHeight },
      scale: { x: scaleX, y: scaleY },
      strokeCount: strokes.length
    });
    
    return strokes.map(stroke => ({
      ...stroke,
      points: stroke.points.map(point => ({
        x: point.x * scaleX,
        y: point.y * scaleY
      })),
      // Keep brush size the same (it's relative to drawing, not image size)
    }));
  }, []);

  // Track last initialized media to avoid redundant effect runs
  const lastInitializedMediaRef = useRef<string | null>(null);

  // Track if we're currently loading to prevent duplicate loads
  const isLoadingImageRef = useRef(false);

  // ============================================
  // Canvas-based image loading effect
  // ============================================
  useEffect(() => {
    // Only load image if we have a URL and are in a drawing mode
    if (!imageUrl || !isInpaintMode) {
      return;
    }

    // Skip if already loaded this URL (check both thumbnail and full image URLs)
    const urlToLoad = thumbnailUrl || imageUrl;
    if (loadedImageUrlRef.current === imageUrl || loadedImageUrlRef.current === urlToLoad) {
      return;
    }

    // Skip if already loading
    if (isLoadingImageRef.current) {
      return;
    }

    isLoadingImageRef.current = true;
    setIsImageLoaded(false);
    setImageLoadError(null);

    loadImageFromUrl(urlToLoad)
      .then((img) => {
        setLoadedImage(img);
        setIsImageLoaded(true);
        loadedImageUrlRef.current = urlToLoad;

        // If we loaded thumbnail, preload full image
        if (thumbnailUrl && thumbnailUrl !== imageUrl) {
          loadImageFromUrl(imageUrl)
            .then((fullImg) => {
              setLoadedImage(fullImg);
              loadedImageUrlRef.current = imageUrl;
              isLoadingImageRef.current = false;
            })
            .catch(() => {
              // Keep thumbnail if full image fails
              isLoadingImageRef.current = false;
            });
        } else {
          isLoadingImageRef.current = false;
        }
      })
      .catch((err) => {
        setImageLoadError(err.message || 'Failed to load image');
        setIsImageLoaded(false);
        isLoadingImageRef.current = false;
      });
  }, [imageUrl, thumbnailUrl, isInpaintMode, loadImageFromUrl]);
  // NOTE: Removed loadedImage from deps - it was causing a render loop!

  // ============================================
  // Canvas sizing effect
  // ============================================
  useEffect(() => {
    // Need imageDimensions and canvas ref to size the canvas
    if (!imageDimensions || !isInpaintMode || !displayCanvasRef.current) {
      console.log('[CanvasImage] ⏳ Waiting for dimensions or canvas ref...', {
        hasImageDimensions: !!imageDimensions,
        isInpaintMode,
        hasCanvas: !!displayCanvasRef.current,
      });
      return;
    }

    const imageWidth = imageDimensions.width;
    const imageHeight = imageDimensions.height;

    const canvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;

    // NEW APPROACH: Canvas is inside a wrapper that sizes to fit the image exactly.
    // Canvas has absolute inset-0, so it matches the wrapper/image size.
    // Use canvas.getBoundingClientRect() to get the actual display size.
    const canvasRect = canvas.getBoundingClientRect();
    const canvasWidth = Math.round(canvasRect.width);
    const canvasHeight = Math.round(canvasRect.height);

    if (canvasWidth === 0 || canvasHeight === 0) {
      console.log('[CanvasImage] ⏳ Canvas has no size yet, waiting...');
      return;
    }

    const newCanvasSize: CanvasSize = { width: canvasWidth, height: canvasHeight };

    // Account for devicePixelRatio for sharp stroke rendering
    const dpr = window.devicePixelRatio || 1;
    const physicalWidth = Math.round(canvasWidth * dpr);
    const physicalHeight = Math.round(canvasHeight * dpr);

    console.log('[CanvasImage] 📐 Canvas sizing:', {
      canvasDisplay: newCanvasSize,
      physical: { width: physicalWidth, height: physicalHeight },
      dpr,
      imageNatural: { width: imageWidth, height: imageHeight },
      source: imageDimensions ? 'imageDimensions' : 'loadedImage'
    });

    // Update canvas pixel buffer size (CSS size is handled by inset-0)
    const needsResize = canvas.width !== physicalWidth || canvas.height !== physicalHeight;
    if (needsResize) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;

      // Scale canvas context for devicePixelRatio
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      if (maskCanvas) {
        maskCanvas.width = imageWidth;
        maskCanvas.height = imageHeight;
      }

      // Store canvas CSS size for stroke scaling
      prevCanvasSizeRef.current = newCanvasSize;
    }

    setCanvasSize(newCanvasSize);
  }, [imageDimensions, isInpaintMode, displayCanvasRef, maskCanvasRef]);

  // ============================================
  // Draw scene (strokes only - image is rendered by <img> element for quality)
  // ============================================
  const drawScene = useCallback(() => {
    const canvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;

    if (!canvas || !canvasSize || !imageDimensions) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get devicePixelRatio and calculate CSS dimensions
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;

    // Reset transform and apply dpr scale (ensures clean state even after multiple redraws)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear the entire canvas
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // NOTE: We no longer draw the image on the canvas.
    // The <img> element handles image display for better quality.
    // Canvas is positioned as an overlay and only draws strokes.

    // Get current strokes based on mode
    const currentStrokes = editMode === 'annotate' ? annotationStrokes : editMode === 'inpaint' ? inpaintStrokes : [];

    // Draw strokes on top of image
    if (currentStrokes.length > 0 && maskCanvas) {
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        // Clear mask canvas
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskCtx.imageSmoothingEnabled = false;
      }

      currentStrokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;

        const strokeBrushSize = stroke.brushSize || 20;
        const shapeType = stroke.shapeType || 'line';
        const isSelected = stroke.id === selectedShapeId;

        // Scale brush size from image coords to canvas coords
        const scaledBrushSize = (strokeBrushSize / imageDimensions.width) * canvasSize.width;

        // Set up context for display canvas
        ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';

        if (isSelected && shapeType === 'rectangle') {
          ctx.strokeStyle = 'rgba(0, 255, 100, 0.9)';
        } else {
          ctx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
        }

        ctx.lineWidth = shapeType === 'rectangle' ? 8 : scaledBrushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Set up mask canvas context (in image coordinates)
        if (maskCtx) {
          maskCtx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
          maskCtx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)';
          maskCtx.fillStyle = stroke.isErasing ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)';
          maskCtx.lineWidth = shapeType === 'rectangle' ? 8 : strokeBrushSize;
          maskCtx.lineCap = 'round';
          maskCtx.lineJoin = 'round';
        }

        // Convert points from image coords to canvas coords for display
        const canvasPoints = stroke.points.map(p => imageToCanvas(p.x, p.y));

        if (shapeType === 'rectangle') {
          if (stroke.isFreeForm && stroke.points.length === 4) {
            // Free-form quadrilateral
            ctx.beginPath();
            ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
            for (let i = 1; i < 4; i++) {
              ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
            }
            ctx.closePath();
            // Only stroke the outline for display (no fill)
            ctx.stroke();

            if (maskCtx) {
              maskCtx.beginPath();
              maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
              for (let i = 1; i < 4; i++) {
                maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
              }
              maskCtx.closePath();
              // Mask still needs fill for inpainting
              maskCtx.fill();
              maskCtx.stroke();
            }
          } else {
            // Standard rectangle
            const x = Math.min(canvasPoints[0].x, canvasPoints[1].x);
            const y = Math.min(canvasPoints[0].y, canvasPoints[1].y);
            const width = Math.abs(canvasPoints[1].x - canvasPoints[0].x);
            const height = Math.abs(canvasPoints[1].y - canvasPoints[0].y);

            // Only stroke the outline for display (no fill)
            ctx.strokeRect(x, y, width, height);

            if (maskCtx) {
              const mx = Math.min(stroke.points[0].x, stroke.points[1].x);
              const my = Math.min(stroke.points[0].y, stroke.points[1].y);
              const mw = Math.abs(stroke.points[1].x - stroke.points[0].x);
              const mh = Math.abs(stroke.points[1].y - stroke.points[0].y);
              maskCtx.fillRect(mx, my, mw, mh);
              maskCtx.strokeRect(mx, my, mw, mh);
            }
          }
        } else {
          // Line/freeform stroke
          ctx.beginPath();
          ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
          for (let i = 1; i < canvasPoints.length; i++) {
            ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
          }
          ctx.stroke();

          if (maskCtx) {
            maskCtx.beginPath();
            maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
              maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            maskCtx.stroke();
          }
        }
      });
    }

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }, [imageDimensions, canvasSize, editMode, annotationStrokes, inpaintStrokes, selectedShapeId, displayCanvasRef, maskCanvasRef, imageToCanvas]);

  // Trigger redraw when relevant state changes
  useEffect(() => {
    if (imageUrl && loadedImage && canvasSize && isInpaintMode) {
      drawScene();
    }
  }, [imageUrl, loadedImage, canvasSize, isInpaintMode, drawScene, annotationStrokes, inpaintStrokes, selectedShapeId]);

  // Handle container resize for canvas-based rendering
  useEffect(() => {
    // Only need imageDimensions and canvas ref - don't require loadedImage
    // since canvas sizing is independent of the internal image load
    if (!imageDimensions || !isInpaintMode || !displayCanvasRef.current) {
      return;
    }

    const canvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;

    const handleCanvasResize = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const canvasWidth = Math.round(canvasRect.width);
      const canvasHeight = Math.round(canvasRect.height);

      if (canvasWidth === 0 || canvasHeight === 0) return;

      const newCanvasSize: CanvasSize = { width: canvasWidth, height: canvasHeight };

      // Account for devicePixelRatio for sharp rendering
      const dpr = window.devicePixelRatio || 1;
      const physicalWidth = Math.round(canvasWidth * dpr);
      const physicalHeight = Math.round(canvasHeight * dpr);

      // Only update if size actually changed
      if (canvas.width === physicalWidth && canvas.height === physicalHeight) return;

      console.log('[CanvasImage] 📏 Canvas resized:', {
        canvasDisplay: newCanvasSize,
        physical: { width: physicalWidth, height: physicalHeight },
        dpr,
      });

      // Update canvas pixel buffer size (CSS size is handled by inset-0)
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;

      // Scale context for devicePixelRatio
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      setCanvasSize(newCanvasSize);
      prevCanvasSizeRef.current = newCanvasSize;
    };

    // Call immediately to handle initial sizing, with retry for layout timing
    handleCanvasResize();
    // Also retry after a frame in case layout hasn't completed
    const initialRetry = requestAnimationFrame(() => {
      handleCanvasResize();
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(handleCanvasResize);
    });

    // Observe the canvas itself since it sizes to fit the image
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(initialRetry);
      resizeObserver.disconnect();
    };
  }, [imageDimensions, isInpaintMode, displayCanvasRef]);

  // Initialize canvas when entering inpaint mode OR when media changes while in inpaint mode
  // LEGACY: This effect is for backward compatibility when imageUrl is not provided
  useEffect(() => {
    // Skip if using new canvas-based rendering
    if (imageUrl) return;
    // Early bailouts for performance
    if (!isInpaintMode) {
      // Reset tracking when leaving inpaint mode
      lastInitializedMediaRef.current = null;
      return;
    }
    
    // Skip if we're in the middle of a media transition
    if (isMediaTransitioningRef.current) return;
    
    // Skip if we've already initialized this media (prevents redundant runs)
    if (lastInitializedMediaRef.current === media.id) return;
    
    // All required refs must be ready
    if (!displayCanvasRef.current || !maskCanvasRef.current || !imageContainerRef.current) return;
    
      const container = imageContainerRef.current;
      const img = container.querySelector('img');
      
    if (!img) return;

        const imgElement = img as HTMLImageElement;

        // Wait for image to have natural dimensions before initializing canvas
        // This prevents initializing with wrong dimensions during loading state
        if (!imgElement.naturalWidth || !imgElement.naturalHeight) {
          console.log('[AnnotateDebug] ⏳ Image not loaded yet, waiting for natural dimensions');
          return;
        }

        const rect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Find the wrapper div (direct parent of the img)
        const wrapper = img.parentElement;
        const wrapperRect = wrapper?.getBoundingClientRect();

        const canvas = displayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;

        const newWidth = Math.round(rect.width);
        const newHeight = Math.round(rect.height);

        // [AnnotateDebug] Log all dimensions for debugging
        console.log('[AnnotateDebug] Canvas initialization:', {
          container: { width: containerRect.width, height: containerRect.height },
          wrapper: wrapperRect ? { width: wrapperRect.width, height: wrapperRect.height } : 'N/A',
          imgElement: { width: rect.width, height: rect.height },
          imgNatural: { width: (img as HTMLImageElement).naturalWidth, height: (img as HTMLImageElement).naturalHeight },
          imgClientSize: { width: img.clientWidth, height: img.clientHeight },
          canvasCurrent: { width: canvas.width, height: canvas.height },
          canvasNew: { width: newWidth, height: newHeight },
          imgClasses: img.className,
          wrapperClasses: wrapper?.className,
        });

        // Skip if canvas is already the right size (prevents constant reinits during layout settling)
        if (canvas.width === newWidth && canvas.height === newHeight) {
      lastInitializedMediaRef.current = media.id;
          return;
        }
        
        // If canvas size is changing and we have existing strokes, scale them
        const prevSize = prevCanvasSizeRef.current;
        if (prevSize && (prevSize.width !== newWidth || prevSize.height !== newHeight)) {
          // Scale both inpaint and annotation strokes
          if (inpaintStrokes.length > 0) {
            const scaledInpaintStrokes = scaleStrokes(inpaintStrokes, prevSize.width, prevSize.height, newWidth, newHeight);
            setInpaintStrokes(scaledInpaintStrokes);
          }
          
          if (annotationStrokes.length > 0) {
            const scaledAnnotationStrokes = scaleStrokes(annotationStrokes, prevSize.width, prevSize.height, newWidth, newHeight);
            setAnnotationStrokes(scaledAnnotationStrokes);
          }
        }
        
        // Update canvas dimensions
        canvas.width = newWidth;
        canvas.height = newHeight;
        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;

        // Position canvas to align with the centered image
        // The image is centered by flex, so we need to calculate offset from wrapper
        if (wrapperRect) {
          const offsetLeft = rect.left - wrapperRect.left;
          const offsetTop = rect.top - wrapperRect.top;
          canvas.style.left = `${offsetLeft}px`;
          canvas.style.top = `${offsetTop}px`;
          console.log('[AnnotateDebug] Canvas positioned at:', { offsetLeft, offsetTop });
        }

        maskCanvas.width = newWidth;
        maskCanvas.height = newHeight;
        
        // Store new size for future comparisons
        prevCanvasSizeRef.current = { width: newWidth, height: newHeight };
        
        // Redraw all strokes after resizing/initializing
        // This ensures strokes are visible immediately
        if (inpaintStrokes.length > 0 || annotationStrokes.length > 0) {
          // Use timeout to ensure canvas DOM updates have settled
          setTimeout(() => {
            const strokesToRedraw = [...inpaintStrokes, ...annotationStrokes];
            if (redrawStrokesRef.current && strokesToRedraw.length > 0) {
              redrawStrokesRef.current(strokesToRedraw);
            }
          }, 50);
        }
        
    // Mark this media as initialized
    lastInitializedMediaRef.current = media.id;
  }, [isInpaintMode, media.id]); // Only re-run when mode or media changes

  // LEGACY: Handle window resize to keep canvas aligned with image
  // Skip when using canvas-based rendering (has its own resize handler)
  const handleResize = useCallback(() => {
    // Skip if using canvas-based rendering
    if (imageUrl) return;

    if (!isInpaintMode || isMediaTransitioningRef.current) return;

    if (displayCanvasRef.current && imageContainerRef.current) {
      const container = imageContainerRef.current;
      const img = container.querySelector('img') as HTMLImageElement | null;

      if (img) {
        // Wait for image to have natural dimensions
        if (!img.naturalWidth || !img.naturalHeight) {
          console.log('[AnnotateDebug] ⏳ handleResize: Image not loaded yet');
          return;
        }

        const rect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const wrapper = img.parentElement;
        const wrapperRect = wrapper?.getBoundingClientRect();
        const canvas = displayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;

        if (!maskCanvas) return;

        const newWidth = rect.width;
        const newHeight = rect.height;

        console.log('[AnnotateDebug] handleResize called:', {
          imgRect: { width: rect.width, height: rect.height },
          imgNatural: { width: img.naturalWidth, height: img.naturalHeight },
          canvasCurrent: { width: canvas.width, height: canvas.height },
          willUpdate: canvas.width !== newWidth || canvas.height !== newHeight,
        });

        // Always update canvas position to align with centered image
        if (wrapperRect) {
          const offsetLeft = rect.left - wrapperRect.left;
          const offsetTop = rect.top - wrapperRect.top;
          canvas.style.left = `${offsetLeft}px`;
          canvas.style.top = `${offsetTop}px`;
        }

        if (canvas.width !== newWidth || canvas.height !== newHeight) {
          const prevSize = prevCanvasSizeRef.current;

          if (prevSize && (prevSize.width !== newWidth || prevSize.height !== newHeight)) {
            console.log('[InpaintResize] Scaling strokes on resize', {
              from: prevSize,
              to: { width: newWidth, height: newHeight },
            });

            const scaleAndSet = (setStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>) => {
              setStrokes(currentStrokes =>
                scaleStrokes(currentStrokes, prevSize.width, prevSize.height, newWidth, newHeight)
              );
            };
            
            scaleAndSet(setInpaintStrokes);
            scaleAndSet(setAnnotationStrokes);
          }

          // Update canvas dimensions
          canvas.width = newWidth;
          canvas.height = newHeight;
          canvas.style.width = `${newWidth}px`;
          canvas.style.height = `${newHeight}px`;

          maskCanvas.width = newWidth;
          maskCanvas.height = newHeight;

          prevCanvasSizeRef.current = { width: newWidth, height: newHeight };
        }
      }
    }
  }, [isInpaintMode, displayCanvasRef, imageContainerRef, maskCanvasRef, scaleStrokes, setInpaintStrokes, setAnnotationStrokes]);

  // LEGACY: Resize observer for img-based rendering
  // Skip when using canvas-based rendering (has its own resize handler)
  useEffect(() => {
    // Skip if using canvas-based rendering
    if (imageUrl) return;

    if (!isInpaintMode || isMediaTransitioningRef.current) return;

    // Use ResizeObserver for better performance and accuracy
    let resizeObserver: ResizeObserver | null = null;

    if (imageContainerRef.current) {
      const container = imageContainerRef.current;
      const img = container.querySelector('img');

      resizeObserver = new ResizeObserver(() => {
        // Debounce with requestAnimationFrame for smooth resizing
        requestAnimationFrame(handleResize);
      });

      // Observe the container
      resizeObserver.observe(container);

      // Also observe the image directly - its size can change independently
      // (e.g., when TasksPane opens and maxWidth CSS changes)
      if (img) {
        resizeObserver.observe(img);
      }
    }

    // Fallback to window resize event
    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [isInpaintMode, handleResize, imageContainerRef, imageUrl]);

  // Helper function to get the 4 corners of a rectangle (handles both 2-point and 4-point forms)
  // Defined first since other helpers depend on it
  const getRectangleCorners = useCallback((stroke: BrushStroke): Array<{ x: number; y: number }> => {
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
  }, []);

  // Helper function to detect if a point is near a shape
  const isPointOnShape = useCallback((x: number, y: number, stroke: BrushStroke, threshold: number = 15): boolean => {
    if (!stroke.shapeType || stroke.shapeType === 'line') return false;

    if (stroke.shapeType === 'rectangle') {
      // For free-form rectangles, calculate bounding box from all corners
      if (stroke.isFreeForm && stroke.points.length === 4) {
        const minX = Math.min(...stroke.points.map(p => p.x));
        const maxX = Math.max(...stroke.points.map(p => p.x));
        const minY = Math.min(...stroke.points.map(p => p.y));
        const maxY = Math.max(...stroke.points.map(p => p.y));

        return x >= minX - threshold && x <= maxX + threshold &&
               y >= minY - threshold && y <= maxY + threshold;
      }

      // Standard rectangle - use first and last points
      const startPoint = stroke.points[0];
      const endPoint = stroke.points[stroke.points.length - 1];
      const minX = Math.min(startPoint.x, endPoint.x);
      const maxX = Math.max(startPoint.x, endPoint.x);
      const minY = Math.min(startPoint.y, endPoint.y);
      const maxY = Math.max(startPoint.y, endPoint.y);

      // Check if point is inside the rectangle (with threshold for easier selection)
      return x >= minX - threshold && x <= maxX + threshold &&
             y >= minY - threshold && y <= maxY + threshold;
    }

    return false;
  }, []);

  // Helper function to get which corner is clicked (returns index 0-3 or null)
  const getClickedCornerIndex = useCallback((x: number, y: number, stroke: BrushStroke, threshold: number = 15): number | null => {
    if (stroke.shapeType !== 'rectangle') return null;

    const corners = getRectangleCorners(stroke);

    for (let i = 0; i < corners.length; i++) {
      const dist = Math.hypot(x - corners[i].x, y - corners[i].y);
      if (dist <= threshold) {
        return i;
      }
    }

    return null;
  }, [getRectangleCorners]);

  // Helper function to detect if click is on edge or corner of rectangle
  // Returns 'corner' if on a corner (for resizing), 'edge' if on an edge (for moving), null if neither
  const getRectangleClickType = useCallback((x: number, y: number, stroke: BrushStroke, threshold: number = 15): 'corner' | 'edge' | null => {
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
  }, [getClickedCornerIndex, getRectangleCorners]);

  // drawArrow helper function removed (not needed for rectangles)

  // Redraw all strokes on canvas
  const redrawStrokes = useCallback((strokes: BrushStroke[], immediate = false) => {
    // When using canvas-based rendering, delegate to drawScene which draws image + strokes
    if (imageUrl && loadedImage && canvasSize) {
      // [MobileHeatDebug] Throttle redraws
      if (!immediate) {
        const now = Date.now();
        const throttleMs = isMobileDevice ? 33 : 16;
        const timeSinceLastRedraw = now - lastRedrawTimeRef.current;

        if (timeSinceLastRedraw < throttleMs) {
          if (pendingRedrawRef.current) {
            clearTimeout(pendingRedrawRef.current);
          }
          pendingRedrawRef.current = setTimeout(() => {
            redrawStrokes(strokes, true);
          }, throttleMs - timeSinceLastRedraw);
          return;
        }
        lastRedrawTimeRef.current = now;
      }

      // Call drawScene which handles image + strokes rendering
      drawScene();
      return;
    }

    // Legacy path: only draw strokes (image is rendered by <img> element)
    // [MobileHeatDebug] Throttle redraws to max 30fps (33ms) on mobile, 60fps (16ms) on desktop
    // Skip throttling if immediate is true (for finishing strokes)
    if (!immediate) {
      const now = Date.now();
      const throttleMs = isMobileDevice ? 33 : 16; // 30fps mobile, 60fps desktop
      const timeSinceLastRedraw = now - lastRedrawTimeRef.current;

      if (timeSinceLastRedraw < throttleMs) {
        // Too soon - schedule a deferred redraw
        if (pendingRedrawRef.current) {
          clearTimeout(pendingRedrawRef.current);
        }
        pendingRedrawRef.current = setTimeout(() => {
          redrawStrokes(strokes, true); // Execute immediately when timer fires
        }, throttleMs - timeSinceLastRedraw);
        return;
      }

      lastRedrawTimeRef.current = now;
    }

    const canvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;

    if (!canvas || !maskCanvas) {
      console.warn('[InpaintDraw] ⚠️ Missing canvas refs, skipping redraw');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    
    if (!ctx || !maskCtx) {
      console.warn('[InpaintDraw] ⚠️ Missing canvas contexts, skipping redraw');
      return;
    }
    
    // Disable image smoothing for crisp, sharp edges on mask canvas
    maskCtx.imageSmoothingEnabled = false;
    
    // Clear both canvases
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    // Redraw all strokes using each stroke's stored brush size
    console.log('[AnnotateDebug] 🎨 redrawStrokes called', {
      strokeCount: strokes.length,
      canvasSize: { width: canvas.width, height: canvas.height },
      strokes: strokes.map(s => ({
        id: s.id.substring(0, 8),
        shapeType: s.shapeType,
        pointCount: s.points.length,
        points: s.points.slice(0, 4).map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      })),
    });

    strokes.forEach((stroke, index) => {
      if (stroke.points.length < 2) {
        console.log('[AnnotateDebug] ⚠️ Skipping stroke with < 2 points', { strokeId: stroke.id });
        return;
      }

      // Use the stroke's stored brush size (fallback to 20 for legacy strokes)
      const strokeBrushSize = stroke.brushSize || 20;
      const shapeType = stroke.shapeType || 'line';
      const isSelected = stroke.id === selectedShapeId;
      
      // Set up context for display canvas
      ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'lighten';
      
      // Highlight selected shapes with green (stroke only, no fill)
      if (isSelected && shapeType === 'rectangle') {
        ctx.strokeStyle = 'rgba(0, 255, 100, 0.9)';
      } else {
        ctx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
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
        
        // For rectangles, use source-over instead of lighten (makes them always visible)
        ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
        
        if (stroke.isFreeForm && stroke.points.length === 4) {
          // Draw free-form quadrilateral (4 independent corners)
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < 4; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.closePath();
          // Only stroke the outline for display (no fill)
          ctx.stroke();

          // Mask still needs fill for inpainting
          maskCtx.beginPath();
          maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < 4; i++) {
            maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          maskCtx.closePath();
          maskCtx.fill(); // Fill first
          maskCtx.stroke(); // Then stroke
        } else {
          // Draw standard rectangle from 2 points
          const x = Math.min(startPoint.x, endPoint.x);
          const y = Math.min(startPoint.y, endPoint.y);
          const width = Math.abs(endPoint.x - startPoint.x);
          const height = Math.abs(endPoint.y - startPoint.y);

          console.log('[AnnotateDebug] 📐 Drawing rectangle', {
            strokeId: stroke.id.substring(0, 8),
            startPoint: { x: Math.round(startPoint.x), y: Math.round(startPoint.y) },
            endPoint: { x: Math.round(endPoint.x), y: Math.round(endPoint.y) },
            rect: { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) },
            canvasSize: { width: canvas.width, height: canvas.height },
            strokeStyle: ctx.strokeStyle,
            lineWidth: ctx.lineWidth,
            compositeOp: ctx.globalCompositeOperation,
          });

          // Only stroke the outline for display (no fill)
          ctx.strokeRect(x, y, width, height);

          // Mask still needs fill for inpainting
          maskCtx.fillRect(x, y, width, height);
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
  }, [selectedShapeId, imageUrl, loadedImage, canvasSize, drawScene]);
  
  // Store latest redrawStrokes in ref to avoid stale closures in effects
  useEffect(() => {
    redrawStrokesRef.current = redrawStrokes;
  }, [redrawStrokes]);
  
  // [MobileHeatDebug] Cleanup pending redraw timeout on unmount
  useEffect(() => {
    return () => {
      if (pendingRedrawRef.current) {
        clearTimeout(pendingRedrawRef.current);
        pendingRedrawRef.current = null;
      }
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
    };
  }, []);

  // Rectangles don't need control points (arrow control point logic removed)

  // Note: Mode separation (preventing cross-over) is now handled during drawing
  // This allows both stroke types to persist in localStorage while only showing the current mode's strokes
  
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

  // =============================================================================
  // KONVA HANDLERS
  // These receive coordinates already converted to image space by StrokeOverlay
  // =============================================================================

  const handleKonvaPointerDown = useCallback((point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => {
    const { x, y } = point;

    console.log('[AnnotateDebug] 🔧 handleKonvaPointerDown', {
      isInpaintMode,
      isAnnotateMode,
      point,
      editMode,
      annotationMode
    });

    // Allow both inpaint mode and annotate mode
    if (!isInpaintMode && !isAnnotateMode) return;

    // Prevent drawing in text edit mode
    if (editMode === 'text') {
      setShowTextModeHint(true);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => {
        setShowTextModeHint(false);
        hintTimeoutRef.current = null;
      }, 2000);
      return;
    }

    // Store drag start position for tap detection
    dragStartPosRef.current = { x, y };

    // In annotate mode, check if clicking on existing shape
    if (isAnnotateMode && annotationMode === 'rectangle') {
      for (let i = brushStrokes.length - 1; i >= 0; i--) {
        const stroke = brushStrokes[i];
        if (stroke.shapeType === 'rectangle' && isPointOnShape(x, y, stroke)) {
          console.log('[AnnotateDebug] Clicked on rectangle:', stroke.id);
          setSelectedShapeId(stroke.id);

          // Check for corner click (for free-form dragging)
          const now = Date.now();
          const cornerIndex = getClickedCornerIndex(x, y, stroke);
          const lastClickPos = lastClickPositionRef.current;
          const isDoubleClick = cornerIndex !== null &&
            now - lastClickTimeRef.current < 300 &&
            lastClickPos &&
            Math.hypot(x - lastClickPos.x, y - lastClickPos.y) < 10;

          lastClickTimeRef.current = now;
          lastClickPositionRef.current = { x, y };

          // Free-form corner dragging
          if (stroke.isFreeForm && cornerIndex !== null) {
            setDraggingCornerIndex(cornerIndex);
            setIsDraggingShape(true);
            selectedShapeRef.current = stroke;
            return;
          }

          // Double-click to enable free-form mode
          if (isDoubleClick && cornerIndex !== null && !stroke.isFreeForm) {
            const corners = getRectangleCorners(stroke);
            const updatedStroke: BrushStroke = {
              ...stroke,
              points: corners,
              isFreeForm: true
            };
            const newStrokes = brushStrokes.map(s => s.id === stroke.id ? updatedStroke : s);
            setBrushStrokes(newStrokes);
            selectedShapeRef.current = updatedStroke;
            setDraggingCornerIndex(cornerIndex);
            setIsDraggingShape(true);
            return;
          }

          // Determine if clicking edge (move) or corner (resize)
          const clickType = getRectangleClickType(x, y, stroke);

          if (clickType === 'edge') {
            setDragMode('move');
            setIsDraggingShape(true);
            selectedShapeRef.current = stroke;
            const startPoint = stroke.points[0];
            setDragOffset({ x: x - startPoint.x, y: y - startPoint.y });
            return;
          } else if (clickType === 'corner' && !stroke.isFreeForm) {
            setDragMode('resize');
            setIsDraggingShape(true);
            selectedShapeRef.current = stroke;
            const startPoint = stroke.points[0];
            setDragOffset({ x: x - startPoint.x, y: y - startPoint.y });
            return;
          }

          return; // Clicked in middle, just keep selected
        }
      }

      // Clicked on empty space, deselect
      if (selectedShapeId) {
        setSelectedShapeId(null);
      }
    }

    // Start new stroke
    console.log('[AnnotateDebug] 🎯 STARTING NEW STROKE (Konva)', { x, y, isAnnotateMode, annotationMode });
    setIsDrawing(true);
    hasInitializedCanvasRef.current = false;
    lastDrawnPointRef.current = null;
    setCurrentStroke([{ x, y }]);
  }, [isInpaintMode, isAnnotateMode, annotationMode, brushStrokes, selectedShapeId, editMode, isPointOnShape, getRectangleClickType, getClickedCornerIndex, getRectangleCorners, setBrushStrokes]);

  const handleKonvaPointerMove = useCallback((point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => {
    // Allow both inpaint mode and annotate mode
    if (!isInpaintMode && !isAnnotateMode) return;
    if (editMode === 'text' && !isDraggingShape) return;

    // Check if the pointer button was released outside the canvas and user returned
    // e.evt.buttons === 0 means no buttons are pressed
    if ((isDrawing || isDraggingShape) && e.evt.buttons === 0) {
      console.log('[Inpaint] Pointer returned with no button pressed - canceling drawing/drag');
      if (isDrawing) {
        setIsDrawing(false);
        hasInitializedCanvasRef.current = false;
        lastDrawnPointRef.current = null;
        setCurrentStroke([]);
      }
      if (isDraggingShape) {
        setIsDraggingShape(false);
        setDragOffset(null);
        setDraggingCornerIndex(null);
        selectedShapeRef.current = null;
      }
      return;
    }

    const { x, y } = point;

    // Handle dragging selected shape
    if (isDraggingShape && selectedShapeRef.current) {
      const shape = selectedShapeRef.current;

      // Free-form corner dragging
      if (draggingCornerIndex !== null && shape.isFreeForm && shape.points.length === 4) {
        const newPoints = [...shape.points];
        newPoints[draggingCornerIndex] = { x, y };

        const updatedShape: BrushStroke = {
          ...shape,
          points: newPoints,
          isFreeForm: true
        };

        const newStrokes = brushStrokes.map(s => s.id === shape.id ? updatedShape : s);
        setBrushStrokes(newStrokes);
        selectedShapeRef.current = updatedShape;
        return;
      }

      // Move mode
      if (dragMode === 'move' && dragOffset) {
        const newStartX = x - dragOffset.x;
        const newStartY = y - dragOffset.y;
        const oldStartPoint = shape.points[0];
        const deltaX = newStartX - oldStartPoint.x;
        const deltaY = newStartY - oldStartPoint.y;

        const updatedPoints = shape.points.map(p => ({
          x: p.x + deltaX,
          y: p.y + deltaY
        }));

        const updatedShape: BrushStroke = {
          ...shape,
          points: updatedPoints,
          isFreeForm: shape.isFreeForm
        };

        const newStrokes = brushStrokes.map(s => s.id === shape.id ? updatedShape : s);
        setBrushStrokes(newStrokes);
        selectedShapeRef.current = updatedShape;
        return;
      }

      // Resize mode
      if (dragMode === 'resize' && !shape.isFreeForm) {
        const endPoint = shape.points[1];
        const updatedShape: BrushStroke = {
          ...shape,
          points: [{ x, y }, endPoint]
        };

        const newStrokes = brushStrokes.map(s => s.id === shape.id ? updatedShape : s);
        setBrushStrokes(newStrokes);
        selectedShapeRef.current = updatedShape;
        return;
      }
    }

    // Continue drawing stroke
    if (!isDrawing) return;

    setCurrentStroke(prev => [...prev, { x, y }]);
  }, [isInpaintMode, isAnnotateMode, editMode, isDrawing, isDraggingShape, dragMode, dragOffset, draggingCornerIndex, brushStrokes, setBrushStrokes]);

  const handleKonvaPointerUp = useCallback((e: KonvaEventObject<PointerEvent>) => {
    console.log('[AnnotateDebug] 🛑 handleKonvaPointerUp', {
      isDraggingShape,
      isDrawing,
      currentStrokeLength: currentStroke.length
    });

    // Handle finishing drag operation
    if (isDraggingShape) {
      setIsDraggingShape(false);
      setDragOffset(null);
      setDraggingCornerIndex(null);
      selectedShapeRef.current = null;
      return;
    }

    // Allow both inpaint mode and annotate mode
    if ((!isInpaintMode && !isAnnotateMode) || !isDrawing) return;
    if (editMode === 'text') return;

    setIsDrawing(false);
    hasInitializedCanvasRef.current = false;
    lastDrawnPointRef.current = null;

    if (currentStroke.length > 1) {
      const shapeType = isAnnotateMode && annotationMode ? annotationMode : 'line';

      // For rectangles, require minimum drag distance
      if (shapeType === 'rectangle') {
        const startPoint = currentStroke[0];
        const endPoint = currentStroke[currentStroke.length - 1];
        const dragDistance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        if (dragDistance < 10) {
          setCurrentStroke([]);
          return;
        }
      }

      const strokePoints = shapeType === 'rectangle'
        ? [currentStroke[0], currentStroke[currentStroke.length - 1]]
        : currentStroke;

      const newStroke: BrushStroke = {
        id: nanoid(),
        points: strokePoints,
        isErasing: isEraseMode,
        brushSize: brushSize,
        shapeType
      };

      // Limit to one rectangle in annotate mode
      console.log('[AnnotateDebug] 💾 SAVING STROKE', { isAnnotateMode, shapeType, existingCount: annotationStrokes.length });
      if (isAnnotateMode && shapeType === 'rectangle' && annotationStrokes.length > 0) {
        console.log('[AnnotateDebug] 💾 Replacing existing rectangle');
        setBrushStrokes([newStroke]);
      } else {
        console.log('[AnnotateDebug] 💾 Adding new stroke');
        setBrushStrokes(prev => [...prev, newStroke]);
      }

      // Auto-select rectangle after drawing
      if (isAnnotateMode && shapeType === 'rectangle') {
        setSelectedShapeId(newStroke.id);
      }

      console.log(isAnnotateMode ? '[AnnotateDebug] ✅ Stroke added' : '[AnnotateDebug] ✅ Stroke added', {
        strokeId: newStroke.id,
        shapeType,
        points: newStroke.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        mode: isAnnotateMode ? 'annotate' : 'inpaint',
      });
    }

    setCurrentStroke([]);
  }, [isInpaintMode, isDrawing, currentStroke, isEraseMode, brushSize, isAnnotateMode, annotationMode, isDraggingShape, editMode, setBrushStrokes, annotationStrokes.length]);

  const handleShapeClick = useCallback((strokeId: string, point: { x: number; y: number }) => {
    console.log('[AnnotateDebug] Shape clicked:', strokeId);
    setSelectedShapeId(strokeId);
  }, []);

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
      // Don't handle keyboard shortcuts if user is typing in an input field
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.contentEditable === 'true' ||
        target.isContentEditable
      );
      
      if (isTyping) return;
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInpaintMode, isAnnotateMode, selectedShapeId, handleDeleteSelected]);

  // Global pointerup listener to catch pointer release outside canvas
  // Prevents "stuck" drawing state when dragging off the edge of the screen
  useEffect(() => {
    if (!isDrawing && !isDraggingShape) return;

    const handleGlobalPointerUp = () => {
      if (isDrawing) {
        console.log('[Inpaint] Global pointerup - releasing stuck drawing state');
        setIsDrawing(false);
        hasInitializedCanvasRef.current = false;
        lastDrawnPointRef.current = null;
        setCurrentStroke([]);
      }
      if (isDraggingShape) {
        console.log('[Inpaint] Global pointerup - releasing stuck drag state');
        setIsDraggingShape(false);
        setDragOffset(null);
        setDraggingCornerIndex(null);
        selectedShapeRef.current = null;
      }
    };

    // Listen on window to catch events outside the canvas
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isDrawing, isDraggingShape]);

  // Redraw when strokes change (but not during active drag - that's handled manually)
  useEffect(() => {
    const effectId = Math.random().toString(36).slice(2, 6);
    // Skip redraw during drag - handlePointerMove redraws manually to prevent flicker
    if (isDraggingShape) {
      return;
    }
    
    if (isInpaintMode && redrawStrokesRef.current) {
      redrawStrokesRef.current(brushStrokes);
    }
  }, [brushStrokes, isInpaintMode, editMode, media.id, isDraggingShape, isDrawing]);

  // Handle entering inpaint mode
  const handleEnterInpaintMode = useCallback(() => {
    console.log('[AnnotateDebug] 🚀 handleEnterInpaintMode called');
    console.log('[AnnotateDebug] Before setIsInpaintMode - isInpaintMode:', isInpaintMode);
    setIsInpaintMode(true);
    console.log('[AnnotateDebug] ✅ Called setIsInpaintMode(true)');
  }, []);

  // Generate inpaint
  // Generate inpaint - uses Konva's native export for reliable mask generation
  const handleGenerateInpaint = useCallback(async () => {
    console.log('[Inpaint] 🚀 handleGenerateInpaint called', {
      selectedProjectId: selectedProjectId?.substring(0, 8),
      inpaintStrokesLength: inpaintStrokes.length,
      hasStrokeOverlayRef: !!strokeOverlayRef.current,
    });

    // Validation
    if (!selectedProjectId || isVideo) {
      toast.error('Cannot generate inpaint');
      return;
    }

    if (inpaintStrokes.length === 0) {
      toast.error('Please paint on the image first');
      return;
    }

    if (!inpaintPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!strokeOverlayRef.current) {
      toast.error('Paint overlay not ready');
      return;
    }

    setIsGeneratingInpaint(true);
    try {
      // Export mask directly from Konva - this uses the exact same strokes being displayed
      const maskImageData = strokeOverlayRef.current.exportMask({ pixelRatio: 1.5 });

      if (!maskImageData) {
        throw new Error('Failed to export mask from overlay');
      }

      console.log('[Inpaint] Mask exported from Konva');

      // Upload mask to storage
      const maskFile = await fetch(maskImageData)
        .then(res => res.blob())
        .then(blob => new File([blob], `inpaint_mask_${media.id}_${Date.now()}.png`, { type: 'image/png' }));

      const maskUrl = await uploadImageToStorage(maskFile);
      console.log('[Inpaint] Mask uploaded:', maskUrl);

      // Get source image URL
      const mediaUrl = (media as any).url || media.location || media.imageUrl;
      const sourceUrl = activeVariantLocation || mediaUrl;

      // Create inpaint task
      const actualGenerationId = (media as any).generation_id || media.id;

      console.log('[Inpaint] Creating task', {
        generation_id: actualGenerationId.substring(0, 8),
        prompt: inpaintPrompt.substring(0, 30),
      });

      await createImageInpaintTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: actualGenerationId,
        shot_id: shotId,
        tool_type: toolTypeOverride,
        loras: loras,
        create_as_generation: createAsGeneration,
        source_variant_id: activeVariantId || undefined,
        hires_fix: convertToHiresFixApiParams(advancedSettings),
      });

      console.log('[Inpaint] ✅ Task created successfully');

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
  }, [selectedProjectId, isVideo, inpaintStrokes, inpaintPrompt, inpaintNumGenerations, media, handleExitInpaintMode, shotId, toolTypeOverride, loras, activeVariantLocation, activeVariantId, createAsGeneration, advancedSettings]);

  // Generate annotated edit - uses Konva's native export for reliable mask generation
  const handleGenerateAnnotatedEdit = useCallback(async () => {
    console.log('[AnnotateEdit] 🚀 handleGenerateAnnotatedEdit called', {
      selectedProjectId: selectedProjectId?.substring(0, 8),
      annotationStrokesLength: annotationStrokes.length,
      hasStrokeOverlayRef: !!strokeOverlayRef.current,
    });

    // Validation
    if (!selectedProjectId || isVideo) {
      toast.error('Cannot generate annotated edit');
      return;
    }

    if (annotationStrokes.length === 0) {
      toast.error('Please draw an annotation rectangle');
      return;
    }

    if (!inpaintPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!strokeOverlayRef.current) {
      toast.error('Annotation overlay not ready');
      return;
    }

    setIsGeneratingInpaint(true);
    try {
      // Export mask directly from Konva - this uses the exact same strokes being displayed
      // No coordinate conversion needed, eliminating potential bugs
      const maskImageData = strokeOverlayRef.current.exportMask({ pixelRatio: 1.5 });

      if (!maskImageData) {
        throw new Error('Failed to export mask from overlay');
      }

      console.log('[AnnotateEdit] Mask exported from Konva');

      // Upload mask to storage
      const maskFile = await fetch(maskImageData)
        .then(res => res.blob())
        .then(blob => new File([blob], `annotated_edit_mask_${media.id}_${Date.now()}.png`, { type: 'image/png' }));

      const maskUrl = await uploadImageToStorage(maskFile);
      console.log('[AnnotateEdit] Mask uploaded:', maskUrl);

      // Get source image URL
      const mediaUrl = (media as any).url || media.location || media.imageUrl;
      const sourceUrl = activeVariantLocation || mediaUrl;

      // Create annotated image edit task
      const actualGenerationIdForAnnotate = (media as any).generation_id || media.id;

      console.log('[AnnotateEdit] Creating task', {
        generation_id: actualGenerationIdForAnnotate.substring(0, 8),
        prompt: inpaintPrompt.substring(0, 30),
      });

      await createAnnotatedImageEditTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: actualGenerationIdForAnnotate,
        shot_id: shotId,
        tool_type: toolTypeOverride,
        loras: loras,
        create_as_generation: createAsGeneration,
        source_variant_id: activeVariantId || undefined,
        hires_fix: convertToHiresFixApiParams(advancedSettings),
      });

      console.log('[AnnotateEdit] ✅ Task created successfully');

      // Show success state
      setInpaintGenerateSuccess(true);

      // Wait 1 second to show success, then exit
      setTimeout(() => {
        setInpaintGenerateSuccess(false);
        handleExitInpaintMode();
      }, 1000);

    } catch (error) {
      console.error('[AnnotateEdit] Error creating annotated edit task:', error);
      toast.error('Failed to create annotated edit task');
    } finally {
      setIsGeneratingInpaint(false);
    }
  }, [selectedProjectId, isVideo, annotationStrokes, inpaintPrompt, inpaintNumGenerations, media, handleExitInpaintMode, shotId, toolTypeOverride, loras, activeVariantLocation, activeVariantId, createAsGeneration, advancedSettings]);

  // Get delete button position for selected shape
  const getDeleteButtonPosition = useCallback((): { x: number; y: number } | null => {
    if (!selectedShapeId || !displayCanvasRef.current) return null;

    const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
    if (!selectedShape || !selectedShape.shapeType) return null;

    if (!canvasSize || !imageDimensions) return null;

    const canvas = displayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Get corners in image coordinates
    const imageCorners = getRectangleCorners(selectedShape);

    // Convert corners from image coordinates to canvas coordinates
    const canvasCorners = imageCorners.map(corner => imageToCanvas(corner.x, corner.y));

    const minY = Math.min(...canvasCorners.map(c => c.y));
    const maxY = Math.max(...canvasCorners.map(c => c.y));
    const minX = Math.min(...canvasCorners.map(c => c.x));
    const maxX = Math.max(...canvasCorners.map(c => c.x));

    const buttonWidth = 80; // Approximate width of delete button
    const padding = 10;

    // Place button at top center of rectangle (now in canvas coords)
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
  }, [selectedShapeId, brushStrokes, displayCanvasRef, getRectangleCorners, canvasSize, imageDimensions, imageToCanvas]);

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
    showTextModeHint,
    setIsInpaintMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsEraseMode,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    handleEnterInpaintMode,
    // Konva-based handlers
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
    handleUndo,
    handleClearMask,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,
    strokeOverlayRef,
    redrawStrokes,
    // Canvas-based rendering
    isImageLoaded,
    imageLoadError,
  };
};

