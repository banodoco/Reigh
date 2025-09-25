import { useReducer, useRef, useCallback, useEffect, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { GeneratedImageWithMetadata } from '../index';

// Consolidated state interface
export interface ImageGalleryState {
  // Lightbox state
  activeLightboxMedia: GenerationRow | null;
  selectedImageForDetails: GenerationRow | null;
  showTaskDetailsModal: boolean;
  pendingLightboxTarget: 'first' | 'last' | null;
  
  // Optimistic state
  optimisticUnpositionedIds: Set<string>;
  optimisticPositionedIds: Set<string>;
  optimisticDeletedIds: Set<string>;
  
  // Shot selection state
  selectedShotIdLocal: string;
  
  // UI state
  showTickForImageId: string | null;
  showTickForSecondaryImageId: string | null;
  addingToShotImageId: string | null;
  addingToShotWithoutPositionImageId: string | null;
  downloadingImageId: string | null;
  
  // Mobile state
  mobileActiveImageId: string | null;
  mobilePopoverOpenImageId: string | null;
  
  // Backfill state
  isBackfillLoading: boolean;
  backfillSkeletonCount: number;
}

// Action types for the reducer
export type ImageGalleryStateAction =
  | { type: 'SET_LIGHTBOX_MEDIA'; payload: GenerationRow | null }
  | { type: 'SET_SELECTED_IMAGE_FOR_DETAILS'; payload: GenerationRow | null }
  | { type: 'SET_SHOW_TASK_DETAILS_MODAL'; payload: boolean }
  | { type: 'SET_PENDING_LIGHTBOX_TARGET'; payload: 'first' | 'last' | null }
  | { type: 'MARK_OPTIMISTIC_UNPOSITIONED'; payload: string }
  | { type: 'MARK_OPTIMISTIC_POSITIONED'; payload: string }
  | { type: 'MARK_OPTIMISTIC_DELETED'; payload: string }
  | { type: 'REMOVE_OPTIMISTIC_DELETED'; payload: string }
  | { type: 'RECONCILE_OPTIMISTIC_STATE'; payload: Set<string> }
  | { type: 'SET_SELECTED_SHOT_ID_LOCAL'; payload: string }
  | { type: 'SET_SHOW_TICK_FOR_IMAGE_ID'; payload: string | null }
  | { type: 'SET_SHOW_TICK_FOR_SECONDARY_IMAGE_ID'; payload: string | null }
  | { type: 'SET_ADDING_TO_SHOT_IMAGE_ID'; payload: string | null }
  | { type: 'SET_ADDING_TO_SHOT_WITHOUT_POSITION_IMAGE_ID'; payload: string | null }
  | { type: 'SET_DOWNLOADING_IMAGE_ID'; payload: string | null }
  | { type: 'SET_MOBILE_ACTIVE_IMAGE_ID'; payload: string | null }
  | { type: 'SET_MOBILE_POPOVER_OPEN_IMAGE_ID'; payload: string | null }
  | { type: 'SET_BACKFILL_LOADING'; payload: boolean }
  | { type: 'SET_BACKFILL_SKELETON_COUNT'; payload: number }
  | { type: 'CLEAR_BACKFILL_SKELETON' }
  | { type: 'RESET_UI_STATE' };

// Initial state factory
const createInitialState = (
  currentShotId?: string,
  lastShotId?: string,
  simplifiedShotOptions: { id: string; name: string }[] = []
): ImageGalleryState => ({
  // Lightbox state
  activeLightboxMedia: null,
  selectedImageForDetails: null,
  showTaskDetailsModal: false,
  pendingLightboxTarget: null,
  
  // Optimistic state
  optimisticUnpositionedIds: new Set(),
  optimisticPositionedIds: new Set(),
  optimisticDeletedIds: new Set(),
  
  // Shot selection state
  selectedShotIdLocal: currentShotId || lastShotId || (simplifiedShotOptions.length > 0 ? simplifiedShotOptions[0].id : ""),
  
  // UI state
  showTickForImageId: null,
  showTickForSecondaryImageId: null,
  addingToShotImageId: null,
  addingToShotWithoutPositionImageId: null,
  downloadingImageId: null,
  
  // Mobile state
  mobileActiveImageId: null,
  mobilePopoverOpenImageId: null,
  
  // Backfill state
  isBackfillLoading: false,
  backfillSkeletonCount: 0,
});

// Optimized reducer with batched updates
const imageGalleryStateReducer = (
  state: ImageGalleryState,
  action: ImageGalleryStateAction
): ImageGalleryState => {
  switch (action.type) {
    case 'SET_LIGHTBOX_MEDIA':
      return { ...state, activeLightboxMedia: action.payload };
      
    case 'SET_SELECTED_IMAGE_FOR_DETAILS':
      return { ...state, selectedImageForDetails: action.payload };
      
    case 'SET_SHOW_TASK_DETAILS_MODAL':
      return { ...state, showTaskDetailsModal: action.payload };
      
    case 'SET_PENDING_LIGHTBOX_TARGET':
      return { ...state, pendingLightboxTarget: action.payload };
      
    case 'MARK_OPTIMISTIC_UNPOSITIONED': {
      const newUnpositioned = new Set(state.optimisticUnpositionedIds);
      const newPositioned = new Set(state.optimisticPositionedIds);
      newUnpositioned.add(action.payload);
      newPositioned.delete(action.payload);
      return {
        ...state,
        optimisticUnpositionedIds: newUnpositioned,
        optimisticPositionedIds: newPositioned,
      };
    }
    
    case 'MARK_OPTIMISTIC_POSITIONED': {
      const newPositioned = new Set(state.optimisticPositionedIds);
      const newUnpositioned = new Set(state.optimisticUnpositionedIds);
      newPositioned.add(action.payload);
      newUnpositioned.delete(action.payload);
      return {
        ...state,
        optimisticPositionedIds: newPositioned,
        optimisticUnpositionedIds: newUnpositioned,
      };
    }
    
    case 'MARK_OPTIMISTIC_DELETED': {
      const newDeleted = new Set(state.optimisticDeletedIds);
      newDeleted.add(action.payload);
      return { ...state, optimisticDeletedIds: newDeleted };
    }
    
    case 'REMOVE_OPTIMISTIC_DELETED': {
      const newDeleted = new Set(state.optimisticDeletedIds);
      newDeleted.delete(action.payload);
      return { ...state, optimisticDeletedIds: newDeleted };
    }
    
    case 'RECONCILE_OPTIMISTIC_STATE': {
      const currentImageIds = action.payload;
      
      // Clean up optimistic sets - remove IDs for images no longer in the list
      const newUnpositioned = new Set<string>();
      for (const id of state.optimisticUnpositionedIds) {
        if (currentImageIds.has(id)) {
          newUnpositioned.add(id);
        }
      }
      
      const newPositioned = new Set<string>();
      for (const id of state.optimisticPositionedIds) {
        if (currentImageIds.has(id)) {
          newPositioned.add(id);
        }
      }
      
      const newDeleted = new Set<string>();
      for (const id of state.optimisticDeletedIds) {
        if (currentImageIds.has(id)) {
          newDeleted.add(id);
        }
      }
      
      return {
        ...state,
        optimisticUnpositionedIds: newUnpositioned,
        optimisticPositionedIds: newPositioned,
        optimisticDeletedIds: newDeleted,
      };
    }
    
    case 'SET_SELECTED_SHOT_ID_LOCAL':
      return { ...state, selectedShotIdLocal: action.payload };
      
    case 'SET_SHOW_TICK_FOR_IMAGE_ID':
      return { ...state, showTickForImageId: action.payload };
      
    case 'SET_SHOW_TICK_FOR_SECONDARY_IMAGE_ID':
      return { ...state, showTickForSecondaryImageId: action.payload };
      
    case 'SET_ADDING_TO_SHOT_IMAGE_ID':
      return { ...state, addingToShotImageId: action.payload };
      
    case 'SET_ADDING_TO_SHOT_WITHOUT_POSITION_IMAGE_ID':
      return { ...state, addingToShotWithoutPositionImageId: action.payload };
      
    case 'SET_DOWNLOADING_IMAGE_ID':
      return { ...state, downloadingImageId: action.payload };
      
    case 'SET_MOBILE_ACTIVE_IMAGE_ID':
      return { ...state, mobileActiveImageId: action.payload };
      
    case 'SET_MOBILE_POPOVER_OPEN_IMAGE_ID':
      return { ...state, mobilePopoverOpenImageId: action.payload };
      
    case 'SET_BACKFILL_LOADING':
      return { ...state, isBackfillLoading: action.payload };
      
    case 'SET_BACKFILL_SKELETON_COUNT':
      return { ...state, backfillSkeletonCount: action.payload };
      
    case 'CLEAR_BACKFILL_SKELETON':
      return { ...state, isBackfillLoading: false, backfillSkeletonCount: 0 };
      
    case 'RESET_UI_STATE':
      return {
        ...state,
        showTickForImageId: null,
        showTickForSecondaryImageId: null,
        addingToShotImageId: null,
        addingToShotWithoutPositionImageId: null,
        downloadingImageId: null,
        mobileActiveImageId: null,
        mobilePopoverOpenImageId: null,
      };
      
    default:
      return state;
  }
};

export interface UseImageGalleryStateOptimizedProps {
  images: GeneratedImageWithMetadata[];
  currentShotId?: string;
  lastShotId?: string;
  simplifiedShotOptions: { id: string; name: string }[];
  isServerPagination?: boolean;
  serverPage?: number;
}

export interface UseImageGalleryStateOptimizedReturn {
  // State
  state: ImageGalleryState;
  
  // Actions
  setActiveLightboxMedia: (media: GenerationRow | null) => void;
  setSelectedImageForDetails: (image: GenerationRow | null) => void;
  setShowTaskDetailsModal: (show: boolean) => void;
  setPendingLightboxTarget: (target: 'first' | 'last' | null) => void;
  markOptimisticUnpositioned: (imageId: string) => void;
  markOptimisticPositioned: (imageId: string) => void;
  markOptimisticDeleted: (imageId: string) => void;
  removeOptimisticDeleted: (imageId: string) => void;
  setSelectedShotIdLocal: (id: string) => void;
  setShowTickForImageId: (id: string | null) => void;
  setShowTickForSecondaryImageId: (id: string | null) => void;
  setAddingToShotImageId: (id: string | null) => void;
  setAddingToShotWithoutPositionImageId: (id: string | null) => void;
  setDownloadingImageId: (id: string | null) => void;
  setMobileActiveImageId: (id: string | null) => void;
  setMobilePopoverOpenImageId: (id: string | null) => void;
  setIsBackfillLoading: (loading: boolean) => void;
  setBackfillSkeletonCount: (count: number) => void;
  clearBackfillSkeleton: () => void;
  resetUIState: () => void;
  
  // Refs (unchanged)
  mainTickTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  secondaryTickTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  lastTouchTimeRef: React.MutableRefObject<number>;
  lastTappedImageIdRef: React.MutableRefObject<string | null>;
  doubleTapTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  galleryTopRef: React.MutableRefObject<HTMLDivElement | null>;
  safetyTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export const useImageGalleryStateOptimized = ({
  images,
  currentShotId,
  lastShotId,
  simplifiedShotOptions,
  isServerPagination = false,
  serverPage
}: UseImageGalleryStateOptimizedProps): UseImageGalleryStateOptimizedReturn => {
  
  // Initialize state with useReducer instead of multiple useState calls
  const [state, dispatch] = useReducer(
    imageGalleryStateReducer,
    createInitialState(currentShotId, lastShotId, simplifiedShotOptions)
  );
  
  // Debug logging for lightbox state changes (reduced frequency)
  useEffect(() => {
    console.log('[MobileDebug] activeLightboxMedia state changed:', {
      hasMedia: !!state.activeLightboxMedia,
      mediaId: state.activeLightboxMedia?.id?.substring(0, 8),
      mediaType: state.activeLightboxMedia?.type,
      timestamp: Date.now()
    });
  }, [state.activeLightboxMedia]);
  
  // Debug skeleton state changes
  useEffect(() => {
    console.log('[SKELETON_DEBUG] State changed:', {
      isBackfillLoading: state.isBackfillLoading,
      backfillSkeletonCount: state.backfillSkeletonCount,
      timestamp: Date.now()
    });
  }, [state.isBackfillLoading, state.backfillSkeletonCount]);
  
  // Memoized action creators to prevent unnecessary re-renders
  const actions = useMemo(() => ({
    setActiveLightboxMedia: (media: GenerationRow | null) => 
      dispatch({ type: 'SET_LIGHTBOX_MEDIA', payload: media }),
    setSelectedImageForDetails: (image: GenerationRow | null) => 
      dispatch({ type: 'SET_SELECTED_IMAGE_FOR_DETAILS', payload: image }),
    setShowTaskDetailsModal: (show: boolean) => 
      dispatch({ type: 'SET_SHOW_TASK_DETAILS_MODAL', payload: show }),
    setPendingLightboxTarget: (target: 'first' | 'last' | null) => 
      dispatch({ type: 'SET_PENDING_LIGHTBOX_TARGET', payload: target }),
    markOptimisticUnpositioned: (imageId: string) => 
      dispatch({ type: 'MARK_OPTIMISTIC_UNPOSITIONED', payload: imageId }),
    markOptimisticPositioned: (imageId: string) => 
      dispatch({ type: 'MARK_OPTIMISTIC_POSITIONED', payload: imageId }),
    markOptimisticDeleted: (imageId: string) => 
      dispatch({ type: 'MARK_OPTIMISTIC_DELETED', payload: imageId }),
    removeOptimisticDeleted: (imageId: string) => 
      dispatch({ type: 'REMOVE_OPTIMISTIC_DELETED', payload: imageId }),
    setSelectedShotIdLocal: (id: string) => 
      dispatch({ type: 'SET_SELECTED_SHOT_ID_LOCAL', payload: id }),
    setShowTickForImageId: (id: string | null) => 
      dispatch({ type: 'SET_SHOW_TICK_FOR_IMAGE_ID', payload: id }),
    setShowTickForSecondaryImageId: (id: string | null) => 
      dispatch({ type: 'SET_SHOW_TICK_FOR_SECONDARY_IMAGE_ID', payload: id }),
    setAddingToShotImageId: (id: string | null) => 
      dispatch({ type: 'SET_ADDING_TO_SHOT_IMAGE_ID', payload: id }),
    setAddingToShotWithoutPositionImageId: (id: string | null) => 
      dispatch({ type: 'SET_ADDING_TO_SHOT_WITHOUT_POSITION_IMAGE_ID', payload: id }),
    setDownloadingImageId: (id: string | null) => 
      dispatch({ type: 'SET_DOWNLOADING_IMAGE_ID', payload: id }),
    setMobileActiveImageId: (id: string | null) => 
      dispatch({ type: 'SET_MOBILE_ACTIVE_IMAGE_ID', payload: id }),
    setMobilePopoverOpenImageId: (id: string | null) => 
      dispatch({ type: 'SET_MOBILE_POPOVER_OPEN_IMAGE_ID', payload: id }),
    setIsBackfillLoading: (loading: boolean) => 
      dispatch({ type: 'SET_BACKFILL_LOADING', payload: loading }),
    setBackfillSkeletonCount: (count: number) => 
      dispatch({ type: 'SET_BACKFILL_SKELETON_COUNT', payload: count }),
    clearBackfillSkeleton: () => 
      dispatch({ type: 'CLEAR_BACKFILL_SKELETON' }),
    resetUIState: () => 
      dispatch({ type: 'RESET_UI_STATE' }),
  }), []);
  
  // Refs (unchanged from original)
  const mainTickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const secondaryTickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const lastTappedImageIdRef = useRef<string | null>(null);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const galleryTopRef = useRef<HTMLDivElement | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fix race condition: Update selectedShotIdLocal when shots data loads or context changes
  useEffect(() => {
    // When viewing a specific shot (currentShotId exists), always prioritize that shot for the selector
    if (currentShotId && simplifiedShotOptions.find(shot => shot.id === currentShotId)) {
      if (state.selectedShotIdLocal !== currentShotId) {
        console.log('[ShotSelectionDebug] Setting shot selector to current shot (GenerationsPane context):', {
          oldSelection: state.selectedShotIdLocal,
          newSelection: currentShotId,
          context: 'viewing specific shot'
        });
        actions.setSelectedShotIdLocal(currentShotId);
      }
      return;
    }
    
    // Only update if current selection is empty/invalid and we're not viewing a specific shot
    const isCurrentSelectionValid = state.selectedShotIdLocal && simplifiedShotOptions.find(shot => shot.id === state.selectedShotIdLocal);
    
    if (!isCurrentSelectionValid) {
      const newSelection = lastShotId || (simplifiedShotOptions.length > 0 ? simplifiedShotOptions[0].id : "");
      if (newSelection && newSelection !== state.selectedShotIdLocal) {
        console.log('[ShotSelectionDebug] Fixing selectedShotIdLocal race condition:', {
          oldSelection: state.selectedShotIdLocal,
          newSelection,
          lastShotId,
          availableShots: simplifiedShotOptions.length,
          firstShotId: simplifiedShotOptions[0]?.id,
          context: 'no specific shot context'
        });
        actions.setSelectedShotIdLocal(newSelection);
      }
    }
  }, [currentShotId, lastShotId, simplifiedShotOptions, state.selectedShotIdLocal, actions]);

  // Memoize image IDs to prevent unnecessary effect triggers
  const currentImageIds = useMemo(() => 
    new Set(images.map(img => img.id)), 
    [images]
  );

  // Track previous image count for backfill skeleton clearing
  const prevImageCountRef = useRef<number>(images.length);
  
  // Reconcile optimistic state when images update
  useEffect(() => {
    // Clear backfill skeleton immediately when new images arrive (server pagination only)
    if (isServerPagination && state.isBackfillLoading && images.length > prevImageCountRef.current) {
      console.log('[SKELETON_DEBUG] State reconciliation - clearing skeleton (new images detected):', {
        prevCount: prevImageCountRef.current,
        newCount: images.length,
        serverPage,
        isBackfillLoading: state.isBackfillLoading,
        timestamp: Date.now()
      });
      actions.clearBackfillSkeleton();
    }
    prevImageCountRef.current = images.length;
    
    // Clean up optimistic sets using the consolidated action
    dispatch({ type: 'RECONCILE_OPTIMISTIC_STATE', payload: currentImageIds });
  }, [currentImageIds, images.length, isServerPagination, state.isBackfillLoading, serverPage, actions]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (mainTickTimeoutRef.current) {
        clearTimeout(mainTickTimeoutRef.current);
      }
      if (secondaryTickTimeoutRef.current) {
        clearTimeout(secondaryTickTimeoutRef.current);
      }
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    ...actions,
    
    // Refs
    mainTickTimeoutRef,
    secondaryTickTimeoutRef,
    lastTouchTimeRef,
    lastTappedImageIdRef,
    doubleTapTimeoutRef,
    galleryTopRef,
    safetyTimeoutRef,
  };
};
