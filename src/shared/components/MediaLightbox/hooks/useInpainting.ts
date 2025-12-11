import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { createAnnotatedImageEditTask } from '@/shared/lib/tasks/annotatedImageEdit';
import { supabase } from '@/integrations/supabase/client';

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
  // Create as new generation instead of variant
  createAsGeneration?: boolean;
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
  editMode: 'text' | 'inpaint' | 'annotate' | 'reposition';
  annotationMode: 'rectangle' | null;
  selectedShapeId: string | null;
  showTextModeHint: boolean;
  setIsInpaintMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInpaintPrompt: (prompt: string) => void;
  setInpaintNumGenerations: (num: number) => void;
  setBrushSize: (size: number) => void;
  setIsEraseMode: (isErasing: boolean) => void;
  setIsAnnotateMode: (isAnnotate: boolean | ((prev: boolean) => boolean)) => void;
  setEditMode: (mode: 'text' | 'inpaint' | 'annotate' | 'reposition' | ((prev: 'text' | 'inpaint' | 'annotate' | 'reposition') => 'text' | 'inpaint' | 'annotate' | 'reposition')) => void;
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
  activeVariantId,
  createAsGeneration,
}: UseInpaintingProps): UseInpaintingReturn => {
  console.log('[InpaintDebug] 🎣 useInpainting hook received props:', {
    shotId: shotId?.substring(0, 8),
    toolTypeOverride,
    selectedProjectId: selectedProjectId?.substring(0, 8),
    mediaId: media.id.substring(0, 8),
    activeVariantId: activeVariantId?.substring(0, 8),
  });
  
  // Storage key uses variant ID if available, otherwise falls back to generation ID
  // This allows different strokes per variant
  const storageKey = activeVariantId 
    ? `inpaint-data-${media.id}-variant-${activeVariantId}`
    : `inpaint-data-${media.id}`;
  
  // Track previous storage key to detect variant changes
  const prevStorageKeyRef = useRef<string>(storageKey);
  
  // Per-media state storage (persists across media switches)
  const mediaStateRef = useRef<Map<string, {
    editMode: 'text' | 'inpaint' | 'annotate' | 'reposition';
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
  const lastUsedEditModeRef = useRef<'text' | 'inpaint' | 'annotate' | 'reposition'>('text');
  
  // Helper: Load edit mode from database
  const loadEditModeFromDB = useCallback(async (generationId: string): Promise<'text' | 'inpaint' | 'annotate' | 'reposition' | null> => {
    try {
      const { data, error } = await supabase
        .from('generations')
        .select('params')
        .eq('id', generationId)
        .single();
      
      if (error) {
        console.warn('[EditMode] Failed to load edit mode from DB:', error);
        return null;
      }
      
      const savedMode = (data?.params as any)?.ui?.editMode;
      if (savedMode && ['text', 'inpaint', 'annotate', 'reposition'].includes(savedMode)) {
        console.log('[EditMode] ✅ Loaded from DB:', { generationId: generationId.substring(0, 8), mode: savedMode });
        return savedMode as 'text' | 'inpaint' | 'annotate' | 'reposition';
      }
      
      return null;
    } catch (err) {
      console.warn('[EditMode] Error loading from DB:', err);
      return null;
    }
  }, []);
  
  // Helper: Save edit mode to database
  const saveEditModeToDB = useCallback(async (generationId: string, mode: 'text' | 'inpaint' | 'annotate' | 'reposition') => {
    try {
      // First, fetch current params to merge
      const { data: current, error: fetchError } = await supabase
        .from('generations')
        .select('params')
        .eq('id', generationId)
        .single();
      
      if (fetchError) {
        console.warn('[EditMode] Failed to fetch current params:', fetchError);
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
  const [editMode, setEditModeInternal] = useState<'text' | 'inpaint' | 'annotate' | 'reposition'>('text');
  const [annotationMode, setAnnotationModeInternal] = useState<'rectangle' | null>(null);
  
  // Debug state for production
  // Debug logging removed - no longer needed
  
  // Computed: backwards compatibility
  const isAnnotateMode = editMode === 'annotate';
  
  // Computed: current brush strokes based on mode (memoized to prevent redraw loops)
  const brushStrokes = useMemo(() => {
    const strokes = editMode === 'annotate' ? annotationStrokes : editMode === 'inpaint' ? inpaintStrokes : [];
    console.log('[InpaintRender] 🎨 brushStrokes recomputed', {
      mode: editMode,
      inpaintCount: inpaintStrokes.length,
      annotationCount: annotationStrokes.length,
      activeCount: strokes.length,
      mediaId: media.id.substring(0, 8)
    });
    return strokes;
  }, [editMode, annotationStrokes, inpaintStrokes, media.id]);
  
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
  const prevEditModeRef = useRef<'text' | 'inpaint' | 'annotate' | 'reposition'>('text');
  const prevMediaIdRef = useRef(media.id); // Track media ID changes
  const prevModeForSelectionRef = useRef<'text' | 'inpaint' | 'annotate' | 'reposition'>(editMode); // Track mode changes for selection
  const prevCanvasSizeRef = useRef<{ width: number; height: number } | null>(null); // Track canvas size for scaling

  // Wrapper setters that persist to mediaStateRef and database
  const setEditMode = useCallback((value: 'text' | 'inpaint' | 'annotate' | 'reposition' | ((prev: 'text' | 'inpaint' | 'annotate' | 'reposition') => 'text' | 'inpaint' | 'annotate' | 'reposition')) => {
    setEditModeInternal(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      const currentState = mediaStateRef.current.get(media.id) || { editMode: 'text', annotationMode: null };
      mediaStateRef.current.set(media.id, { ...currentState, editMode: newValue });
      
      // Update global last-used mode (for inheritance)
      lastUsedEditModeRef.current = newValue;
      
      // Save to database (async, non-blocking)
      saveEditModeToDB(media.id, newValue);
      
      return newValue;
    });
  }, [media.id, saveEditModeToDB]);

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
    
    console.log('[Media] 🔄 Media switching (synchronous)', { 
      from: oldMediaId.substring(0, 8), 
      to: newMediaId.substring(0, 8) 
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
          setInpaintNumGenerations(parsed.numGenerations || 4);
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
      console.log('[Media] No cached UI state, loading from database', { mediaId: newMediaId.substring(0, 8) });
      
      // Load asynchronously to avoid blocking UI
      loadEditModeFromDB(newMediaId).then(dbMode => {
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
            // Save to DB for next time
            saveEditModeToDB(newMediaId, inheritedMode);
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
  
  console.log('[InpaintPaint] 🔍 Hook initialized with refs', {
    hasDisplayCanvasRef: !!displayCanvasRef,
    hasDisplayCanvas: !!displayCanvasRef?.current,
    hasMaskCanvasRef: !!maskCanvasRef,
    hasMaskCanvas: !!maskCanvasRef?.current,
    hasImageContainerRef: !!imageContainerRef,
    hasImageContainer: !!imageContainerRef?.current
  });

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
          setInpaintNumGenerations(parsed.numGenerations || 4);
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
  
  // Initialize canvas when entering inpaint mode OR when media changes while in inpaint mode
  useEffect(() => {
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
      
        const rect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        const canvas = displayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        
        const newWidth = Math.round(rect.width);
        const newHeight = Math.round(rect.height);
        
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
        canvas.style.left = `${rect.left - containerRect.left}px`;
        canvas.style.top = `${rect.top - containerRect.top}px`;
        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;
        
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

  // Handle window resize to keep canvas aligned with image
  const handleResize = useCallback(() => {
    if (!isInpaintMode || isMediaTransitioningRef.current) return;

    if (displayCanvasRef.current && imageContainerRef.current) {
      const container = imageContainerRef.current;
      const img = container.querySelector('img');

      if (img) {
        const rect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const canvas = displayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;

        if (!maskCanvas) return;

        const newWidth = rect.width;
        const newHeight = rect.height;

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

          canvas.width = newWidth;
          canvas.height = newHeight;
          canvas.style.left = `${rect.left - containerRect.left}px`;
          canvas.style.top = `${rect.top - containerRect.top}px`;
          canvas.style.width = `${newWidth}px`;
          canvas.style.height = `${newHeight}px`;

          maskCanvas.width = newWidth;
          maskCanvas.height = newHeight;

          prevCanvasSizeRef.current = { width: newWidth, height: newHeight };
        }
      }
    }
  }, [isInpaintMode, displayCanvasRef, imageContainerRef, maskCanvasRef, scaleStrokes, setInpaintStrokes, setAnnotationStrokes]);

  useEffect(() => {
    if (!isInpaintMode || isMediaTransitioningRef.current) return;

    // Use ResizeObserver for better performance and accuracy
    let resizeObserver: ResizeObserver | null = null;

    if (imageContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        // Debounce with requestAnimationFrame for smooth resizing
        requestAnimationFrame(handleResize);
      });

      resizeObserver.observe(imageContainerRef.current);
    }

    // Fallback to window resize event
    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [isInpaintMode, handleResize, imageContainerRef]);

  // Helper function to detect if a point is near a shape
  const isPointOnShape = (x: number, y: number, stroke: BrushStroke, threshold: number = 15): boolean => {
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
  const redrawStrokes = useCallback((strokes: BrushStroke[], immediate = false) => {
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
    strokes.forEach((stroke, index) => {
      if (stroke.points.length < 2) {
        console.log('[InpaintDraw] ⚠️ Skipping stroke with < 2 points', { strokeId: stroke.id });
        return;
      }
      
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
          ctx.fill(); // Fill first
          ctx.stroke(); // Then stroke
          
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
          
          // Fill and stroke rectangle (fill makes it visible even with light backgrounds)
          ctx.fillRect(x, y, width, height);
          ctx.strokeRect(x, y, width, height);
          
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
  }, [selectedShapeId]);
  
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

  // Handle mouse/touch drawing (canvas coordinate system)
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = displayCanvasRef.current;
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
    
    // Prevent drawing in text edit mode - canvas should be non-interactive
    if (editMode === 'text') {
      console.log('[MobilePaintDebug] ❌ In text edit mode, canvas drawing disabled');
      
      // Show tooltip hint to switch modes
      setShowTextModeHint(true);
      
      // Clear any existing timeout
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
      }
      
      // Auto-hide tooltip after 2 seconds
      hintTimeoutRef.current = setTimeout(() => {
        setShowTextModeHint(false);
        hintTimeoutRef.current = null;
      }, 2000);
      
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
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
      
      // Note: Don't clear existing rectangles here on click
      // They will be cleared when a new rectangle is successfully drawn (in handlePointerUp)
    }
    
    // Capture the pointer to receive events even when outside canvas
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    setIsDrawing(true);
    // Reset canvas initialization flag for new stroke
    hasInitializedCanvasRef.current = false;
    lastDrawnPointRef.current = null;
    
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
      // Check if event is cancelable before attempting to preventDefault
      if (e.cancelable) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventTouchMove);
    };
  }, [isDrawing]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInpaintMode) return;
    
    // Prevent drawing in text edit mode (but allow shape dragging for existing shapes)
    if (editMode === 'text' && !isDraggingShape) return;
    
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
        
        console.log('[Drag] Moving shape', {
          shapeId: shape.id.substring(0, 8),
          delta: { x: deltaX, y: deltaY },
          newPos: { x: newStartX, y: newStartY }
        });
        
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
        // Only redraw directly, don't wait for effect (prevents flicker)
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
    
    // Draw current stroke on display canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Disable image smoothing for crisp edges
    ctx.imageSmoothingEnabled = false;
    
    // Initialize canvas with existing strokes only once at the start of drawing
    if (!hasInitializedCanvasRef.current) {
      redrawStrokes(brushStrokes);
      hasInitializedCanvasRef.current = true;
      lastDrawnPointRef.current = null;
    }
    
    // In annotation mode, redraw with the updated shape preview
    if (isAnnotateMode && annotationMode) {
      // For rectangles, we need to redraw the preview each time
      // But we can optimize by only clearing the preview area
      const startPoint = currentStroke[0];
      if (startPoint) {
        // Save context state
        ctx.save();
        
        // Redraw existing strokes (excluding current preview)
        redrawStrokes(brushStrokes);
        
        // Draw the current shape preview
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
        
        ctx.restore();
      }
      
      // Update stroke state
      setCurrentStroke(prev => [...prev, { x, y }]);
    } else {
      // Optimized line drawing: only draw the incremental segment
      const lastPoint = lastDrawnPointRef.current || (currentStroke.length > 0 ? currentStroke[currentStroke.length - 1] : null);
      
      ctx.save();
      ctx.globalCompositeOperation = isEraseMode ? 'destination-out' : 'source-over';
      ctx.strokeStyle = isEraseMode ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (lastPoint) {
        // Draw only the new segment from last point to current point
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (currentStroke.length === 0) {
        // First point - just set up for next segment
        setCurrentStroke([{ x, y }]);
        lastDrawnPointRef.current = { x, y };
        ctx.restore();
        return;
      } else {
        // Draw from first point to current (for the initial segment)
        ctx.beginPath();
        ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      
      ctx.restore();
      
      // Update stroke state and last drawn point
      setCurrentStroke(prev => [...prev, { x, y }]);
      lastDrawnPointRef.current = { x, y };
    }
  }, [isInpaintMode, isDrawing, isEraseMode, currentStroke, brushSize, isAnnotateMode, annotationMode, brushStrokes, redrawStrokes, isDraggingShape, isDraggingControlPoint, dragOffset, dragMode, draggingCornerIndex, displayCanvasRef, maskCanvasRef, setBrushStrokes]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    console.log('[InpaintPointer] 🛑 handlePointerUp called', {
      isDraggingShape,
      isDrawing,
      currentStrokeLength: currentStroke.length,
      editMode,
      annotationMode
    });
    
    // Control point drag handling removed (rectangles don't have control points)
    
    // Handle finishing drag operation
    if (isDraggingShape) {
      console.log('[Drag] ✅ Finished dragging shape');
      setIsDraggingShape(false);
      setDragOffset(null);
      setDraggingCornerIndex(null); // Reset free-form corner dragging
      selectedShapeRef.current = null;
      
      // [MobileHeatDebug] Do a final immediate redraw when drag ends to ensure clean state
      if (brushStrokes.length > 0) {
        redrawStrokes(brushStrokes, true); // immediate=true for final render
      }
      
      // Release pointer capture
      if (e && e.target) {
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch (err) {
          console.log('[Drag] Could not release pointer capture', err);
        }
        
        // Prevent event from bubbling to overlay which might close the lightbox
        e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
          e.nativeEvent.stopImmediatePropagation();
        }
      }
      return;
    }
    
    if (!isInpaintMode || !isDrawing) return;
    
    // Prevent drawing in text edit mode
    if (editMode === 'text') return;
    
    console.log('[MobilePaintDebug] 🛑 Finishing stroke');
    
    // Release pointer capture if event is provided
    if (e && e.target) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore errors if pointer capture wasn't active
        console.log('[MobilePaintDebug] ⚠️ Could not release pointer capture', err);
      }
      
      // Prevent event from bubbling to overlay which might close the lightbox
      e.preventDefault();
      e.stopPropagation();
      if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
        e.nativeEvent.stopImmediatePropagation();
      }
    }
    
    setIsDrawing(false);
    // Reset canvas initialization flag when drawing ends
    hasInitializedCanvasRef.current = false;
    lastDrawnPointRef.current = null;
    
    if (currentStroke.length > 1) {
      const shapeType = isAnnotateMode && annotationMode ? annotationMode : 'line';
      
      console.log('[InpaintPointer] 📝 Creating new stroke', {
        shapeType,
        pointCount: currentStroke.length,
        isEraseMode,
        brushSize,
        isAnnotateMode,
        annotationMode
      });
      
      // For rectangles, require minimum drag distance (prevent accidental clicks from creating shapes)
      if (shapeType === 'rectangle') {
        const startPoint = currentStroke[0];
        const endPoint = currentStroke[currentStroke.length - 1];
        const dragDistance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        const MIN_DRAG_DISTANCE = 10; // pixels
        
        if (dragDistance < MIN_DRAG_DISTANCE) {
          console.log('[Rectangle] ⚠️ Drag too short, not creating rectangle', { dragDistance });
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
      
      const canvas = displayCanvasRef.current;
      
      // Clear opposite mode's strokes when starting to draw (prevents cross-over)
      if (isAnnotateMode && inpaintStrokes.length > 0) {
        console.log('[ModeSeparation] Drawing in annotate mode - clearing inpaint strokes');
        setInpaintStrokes([]);
      } else if (!isAnnotateMode && annotationStrokes.length > 0) {
        console.log('[ModeSeparation] Drawing in inpaint mode - clearing annotation strokes');
        setAnnotationStrokes([]);
      }
      
      // LIMIT TO ONE RECTANGLE: Clear existing rectangles when successfully drawing a new one
      if (isAnnotateMode && shapeType === 'rectangle' && annotationStrokes.length > 0) {
        console.log('[Annotate] 🔄 Clearing existing rectangle - new one successfully drawn', {
          oldCount: annotationStrokes.length,
          newStrokeId: newStroke.id.substring(0, 8)
        });
        // Replace all existing rectangles with just the new one
        setBrushStrokes([newStroke]);
      } else {
        console.log('[InpaintPointer] ➕ Adding stroke to existing', {
          existingCount: brushStrokes.length,
          newStrokeId: newStroke.id.substring(0, 8)
        });
        setBrushStrokes(prev => [...prev, newStroke]);
      }
      
      // Auto-select rectangle after drawing (shows delete button immediately)
      if (isAnnotateMode && shapeType === 'rectangle') {
        setSelectedShapeId(newStroke.id);
        console.log('[Selection] ✅ Auto-selecting newly drawn rectangle:', newStroke.id.substring(0, 8));
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

      // Scale mask to 1.5x the actual image size
      const actualWidth = imageDimensions?.width || maskCanvas.width;
      const actualHeight = imageDimensions?.height || maskCanvas.height;
      const scaledWidth = Math.round(actualWidth * 1.5);
      const scaledHeight = Math.round(actualHeight * 1.5);
      
      console.log('[Inpaint] Scaling mask', {
        displaySize: { width: maskCanvas.width, height: maskCanvas.height },
        actualSize: { width: actualWidth, height: actualHeight },
        scaledSize: { width: scaledWidth, height: scaledHeight }
      });

      // Create a temporary canvas at 1.5x original resolution
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        throw new Error('Could not create temporary canvas context');
      }
      
      // Disable image smoothing for crisp, sharp mask edges (no jaggedness)
      tempCtx.imageSmoothingEnabled = false;
      
      // Scale up the mask canvas content
      tempCtx.drawImage(maskCanvas, 0, 0, scaledWidth, scaledHeight);
      
      // Apply binary threshold to eliminate any anti-aliasing artifacts
      // This ensures pure black/white mask with no gray/semi-transparent pixels
      const imageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);
      const data = imageData.data;
      const threshold = 128; // Mid-point threshold
      
      for (let i = 0; i < data.length; i += 4) {
        // Check alpha channel - if pixel has any opacity, make it fully opaque white
        if (data[i + 3] > threshold) {
          data[i] = 255;     // R
          data[i + 1] = 255; // G
          data[i + 2] = 255; // B
          data[i + 3] = 255; // A
        } else {
          // Otherwise make it fully transparent black
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
      
      tempCtx.putImageData(imageData, 0, 0);
      
      // Create mask image from scaled canvas
      const maskImageData = tempCanvas.toDataURL('image/png');
      
      // Upload mask to storage
      const maskFile = await fetch(maskImageData)
        .then(res => res.blob())
        .then(blob => new File([blob], `inpaint_mask_${media.id}_${Date.now()}.png`, { type: 'image/png' }));
      
      const maskUrl = await uploadImageToStorage(maskFile);
      console.log('[Inpaint] Mask uploaded:', maskUrl);

      // Get source image URL - location already contains the best version
      // FIX: Use 'url' field which is what the media object actually has
      const sourceUrl = (media as any).url || media.location || media.imageUrl;

      // Create inpaint task
      // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
      // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
      const actualGenerationId = (media as any).generation_id || media.id;
      
      console.log('[InpaintDebug] 📤 About to call createImageInpaintTask with:', {
        project_id: selectedProjectId?.substring(0, 8),
        shot_id: shotId?.substring(0, 8),
        tool_type: toolTypeOverride,
        generation_id: actualGenerationId.substring(0, 8),
        prompt: inpaintPrompt.substring(0, 30)
      });
      
      await createImageInpaintTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: actualGenerationId, // Must be generations.id, not shot_generations.id
        shot_id: shotId, // Pass shot_id so complete_task can link results to the shot
        tool_type: toolTypeOverride, // Override tool_type if provided (e.g., 'image-generation' when used in different contexts)
        loras: loras, // Pass loras if provided (e.g., In-Scene Boost)
        create_as_generation: createAsGeneration, // If true, create a new generation instead of a variant
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
  }, [selectedProjectId, isVideo, inpaintStrokes, inpaintPrompt, inpaintNumGenerations, media, handleExitInpaintMode, shotId, toolTypeOverride, loras, imageDimensions, displayCanvasRef, maskCanvasRef]);

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

      // Scale mask to 1.5x the actual image size
      const actualWidth = imageDimensions?.width || maskCanvas.width;
      const actualHeight = imageDimensions?.height || maskCanvas.height;
      const scaledWidth = Math.round(actualWidth * 1.5);
      const scaledHeight = Math.round(actualHeight * 1.5);
      
      console.log('[AnnotatedEdit] Scaling mask', {
        displaySize: { width: maskCanvas.width, height: maskCanvas.height },
        actualSize: { width: actualWidth, height: actualHeight },
        scaledSize: { width: scaledWidth, height: scaledHeight }
      });

      // Create a temporary canvas at 1.5x original resolution
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        throw new Error('Could not create temporary canvas context');
      }
      
      // Disable image smoothing for crisp, sharp mask edges (no jaggedness)
      tempCtx.imageSmoothingEnabled = false;
      
      // Scale up the mask canvas content
      tempCtx.drawImage(maskCanvas, 0, 0, scaledWidth, scaledHeight);
      
      // Apply binary threshold to eliminate any anti-aliasing artifacts
      // This ensures pure black/white mask with no gray/semi-transparent pixels
      const imageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);
      const data = imageData.data;
      const threshold = 128; // Mid-point threshold
      
      for (let i = 0; i < data.length; i += 4) {
        // Check alpha channel - if pixel has any opacity, make it fully opaque white
        if (data[i + 3] > threshold) {
          data[i] = 255;     // R
          data[i + 1] = 255; // G
          data[i + 2] = 255; // B
          data[i + 3] = 255; // A
        } else {
          // Otherwise make it fully transparent black
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
      
      tempCtx.putImageData(imageData, 0, 0);
      
      // Create mask image from scaled canvas
      const maskImageData = tempCanvas.toDataURL('image/png');
      
      // Upload mask to storage
      const maskFile = await fetch(maskImageData)
        .then(res => res.blob())
        .then(blob => new File([blob], `annotated_edit_mask_${media.id}_${Date.now()}.png`, { type: 'image/png' }));
      
      const maskUrl = await uploadImageToStorage(maskFile);
      console.log('[AnnotatedEdit] Mask uploaded:', maskUrl);

      // Get source image URL - location already contains the best version
      // FIX: Use 'url' field which is what the media object actually has
      const sourceUrl = (media as any).url || media.location || media.imageUrl;

      // Create annotated image edit task
      // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
      // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
      const actualGenerationIdForAnnotate = (media as any).generation_id || media.id;
      
      console.log('[AnnotatedEdit] 📤 About to call createAnnotatedImageEditTask with:', {
        project_id: selectedProjectId?.substring(0, 8),
        shot_id: shotId?.substring(0, 8),
        tool_type: toolTypeOverride,
        generation_id: actualGenerationIdForAnnotate.substring(0, 8),
        prompt: inpaintPrompt.substring(0, 30)
      });
      
      await createAnnotatedImageEditTask({
        project_id: selectedProjectId,
        image_url: sourceUrl,
        mask_url: maskUrl,
        prompt: inpaintPrompt,
        num_generations: inpaintNumGenerations,
        generation_id: actualGenerationIdForAnnotate, // Must be generations.id, not shot_generations.id
        shot_id: shotId, // Pass shot_id so complete_task can link results to the shot
        tool_type: toolTypeOverride, // Override tool_type if provided
        loras: loras, // Pass loras if provided (e.g., In-Scene Boost)
        create_as_generation: createAsGeneration, // If true, create a new generation instead of a variant
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

