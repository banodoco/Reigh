import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { GenerationRow } from '@/types/shots';
import { GeneratedImageWithMetadata } from '../index';

export interface UseImageGalleryStateProps {
  images: GeneratedImageWithMetadata[];
  currentShotId?: string;
  lastShotId?: string;
  simplifiedShotOptions: { id: string; name: string }[];
  isServerPagination?: boolean;
  serverPage?: number;
}

export interface UseImageGalleryStateReturn {
  // Lightbox state
  activeLightboxMedia: GenerationRow | null;
  setActiveLightboxMedia: (media: GenerationRow | null) => void;
  
  // Task details state
  selectedImageForDetails: GenerationRow | null;
  setSelectedImageForDetails: (image: GenerationRow | null) => void;
  showTaskDetailsModal: boolean;
  setShowTaskDetailsModal: (show: boolean) => void;
  
  // Optimistic state
  optimisticUnpositionedIds: Set<string>;
  optimisticPositionedIds: Set<string>;
  optimisticDeletedIds: Set<string>;
  markOptimisticUnpositioned: (imageId: string) => void;
  markOptimisticPositioned: (imageId: string) => void;
  markOptimisticDeleted: (imageId: string) => void;
  removeOptimisticDeleted: (imageId: string) => void;
  
  // Shot selection state
  selectedShotIdLocal: string;
  setSelectedShotIdLocal: (id: string) => void;
  
  // UI state
  showTickForImageId: string | null;
  setShowTickForImageId: (id: string | null) => void;
  showTickForSecondaryImageId: string | null;
  setShowTickForSecondaryImageId: (id: string | null) => void;
  addingToShotImageId: string | null;
  setAddingToShotImageId: (id: string | null) => void;
  addingToShotWithoutPositionImageId: string | null;
  setAddingToShotWithoutPositionImageId: (id: string | null) => void;
  downloadingImageId: string | null;
  setDownloadingImageId: (id: string | null) => void;
  isDownloadingStarred: boolean;
  setIsDownloadingStarred: (downloading: boolean) => void;
  
  // Mobile state
  mobileActiveImageId: string | null;
  setMobileActiveImageId: (id: string | null) => void;
  mobilePopoverOpenImageId: string | null;
  setMobilePopoverOpenImageId: (id: string | null) => void;
  
  // Pagination state
  pendingLightboxTarget: 'first' | 'last' | null;
  setPendingLightboxTarget: (target: 'first' | 'last' | null) => void;
  
  // Backfill state
  isBackfillLoading: boolean;
  setIsBackfillLoading: (loading: boolean) => void;
  backfillSkeletonCount: number;
  setBackfillSkeletonCount: (count: number) => void;
  
  // Refs
  mainTickTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  secondaryTickTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  lastTouchTimeRef: React.MutableRefObject<number>;
  lastTappedImageIdRef: React.MutableRefObject<string | null>;
  doubleTapTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  galleryTopRef: React.MutableRefObject<HTMLDivElement | null>;
  safetyTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export const useImageGalleryState = ({
  images,
  currentShotId,
  lastShotId,
  simplifiedShotOptions,
  isServerPagination = false,
  serverPage
}: UseImageGalleryStateProps): UseImageGalleryStateReturn => {
  
  // Lightbox state
  const [activeLightboxMedia, setActiveLightboxMedia] = useState<GenerationRow | null>(null);
  
  // Debug logging for lightbox state changes
  useEffect(() => {
    console.log('[MobileDebug] activeLightboxMedia state changed:', {
      hasMedia: !!activeLightboxMedia,
      mediaId: activeLightboxMedia?.id?.substring(0, 8),
      mediaType: activeLightboxMedia?.type,
      timestamp: Date.now()
    });
  }, [activeLightboxMedia]);
  
  // Task details state for mobile modal
  const [selectedImageForDetails, setSelectedImageForDetails] = useState<GenerationRow | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  
  // State for tracking which item to open after page navigation
  const [pendingLightboxTarget, setPendingLightboxTarget] = useState<'first' | 'last' | null>(null);
  
  // Backfill loading state
  const [isBackfillLoading, setIsBackfillLoading] = useState<boolean>(false);
  const [backfillSkeletonCount, setBackfillSkeletonCount] = useState<number>(0);
  
  // Debug skeleton state changes
  useEffect(() => {
    console.log('[SKELETON_DEBUG] State changed:', {
      isBackfillLoading,
      backfillSkeletonCount,
      timestamp: Date.now()
    });
  }, [isBackfillLoading, backfillSkeletonCount]);
  
  // Shot selection state
  const [selectedShotIdLocal, setSelectedShotIdLocal] = useState<string>(() => {
    const initial = currentShotId || lastShotId || (simplifiedShotOptions.length > 0 ? simplifiedShotOptions[0].id : "");
    console.log('[GenerationsPane] ImageGallery initial selectedShotIdLocal:', {
      initial,
      currentShotId,
      lastShotId,
      simplifiedShotOptionsLength: simplifiedShotOptions.length,
      firstShotId: simplifiedShotOptions[0]?.id
    });
    return initial;
  });
  
  // UI state
  const [showTickForImageId, setShowTickForImageId] = useState<string | null>(null);
  const [showTickForSecondaryImageId, setShowTickForSecondaryImageId] = useState<string | null>(null);
  const [addingToShotImageId, setAddingToShotImageId] = useState<string | null>(null);
  const [addingToShotWithoutPositionImageId, setAddingToShotWithoutPositionImageId] = useState<string | null>(null);
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(null);
  const [isDownloadingStarred, setIsDownloadingStarred] = useState<boolean>(false);
  
  // Optimistic state to bridge server refresh latency
  const [optimisticUnpositionedIds, setOptimisticUnpositionedIds] = useState<Set<string>>(new Set());
  const [optimisticPositionedIds, setOptimisticPositionedIds] = useState<Set<string>>(new Set());
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(new Set());

  // Mobile-only state
  const [mobileActiveImageId, setMobileActiveImageId] = useState<string | null>(null);
  const [mobilePopoverOpenImageId, setMobilePopoverOpenImageId] = useState<string | null>(null);
  
  // Optimistic state handlers
  const markOptimisticUnpositioned = useCallback((imageId: string) => {
    setOptimisticUnpositionedIds(prev => {
      const next = new Set(prev);
      next.add(imageId);
      return next;
    });
    setOptimisticPositionedIds(prev => {
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
  }, []);

  const markOptimisticPositioned = useCallback((imageId: string) => {
    setOptimisticPositionedIds(prev => {
      const next = new Set(prev);
      next.add(imageId);
      return next;
    });
    setOptimisticUnpositionedIds(prev => {
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
  }, []);

  const markOptimisticDeleted = useCallback((imageId: string) => {
    setOptimisticDeletedIds(prev => {
      const next = new Set(prev);
      next.add(imageId);
      return next;
    });
  }, []);

  const removeOptimisticDeleted = useCallback((imageId: string) => {
    setOptimisticDeletedIds(prev => {
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
  }, []);
  
  // Refs
  const mainTickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const secondaryTickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const lastTappedImageIdRef = useRef<string | null>(null);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const galleryTopRef = useRef<HTMLDivElement | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fix race condition: Update selectedShotIdLocal when shots data loads or context changes
  // NOTE: Do NOT auto-sync when external filter control is enabled (e.g., GenerationsPane manages its own filter)
  useEffect(() => {
    // SKIP auto-sync entirely - let the external filter control (ShotFilter component) manage the state
    // The external filter can set selectedShotIdLocal directly via setSelectedShotIdLocal
    // This prevents fighting between the dropdown and the auto-sync logic
    
    // Only fix invalid selections (empty or shot no longer exists)
    const isCurrentSelectionValid = selectedShotIdLocal && simplifiedShotOptions.find(shot => shot.id === selectedShotIdLocal);
    
    if (!isCurrentSelectionValid) {
      const newSelection = lastShotId || (simplifiedShotOptions.length > 0 ? simplifiedShotOptions[0].id : "");
      if (newSelection && newSelection !== selectedShotIdLocal) {
        console.log('[ShotSelectionDebug] Fixing invalid selectedShotIdLocal:', {
          oldSelection: selectedShotIdLocal,
          newSelection,
          lastShotId,
          availableShots: simplifiedShotOptions.length,
          firstShotId: simplifiedShotOptions[0]?.id,
          context: 'invalid selection'
        });
        setSelectedShotIdLocal(newSelection);
      }
    }
  }, [lastShotId, simplifiedShotOptions, selectedShotIdLocal]);

  // 🚀 PERFORMANCE FIX: Memoize image IDs to prevent unnecessary effect triggers
  const currentImageIds = useMemo(() => 
    new Set(images.map(img => img.id)), 
    [images]
  );

  // Track previous image count for backfill skeleton clearing
  const prevImageCountRef = useRef<number>(images.length);
  
  // Reconcile optimistic state when images update
  useEffect(() => {
    
    // Clear backfill skeleton immediately when new images arrive (server pagination only)
    if (isServerPagination && isBackfillLoading && images.length > prevImageCountRef.current) {
      console.log('[SKELETON_DEBUG] State reconciliation - clearing skeleton (new images detected):', {
        prevCount: prevImageCountRef.current,
        newCount: images.length,
        serverPage,
        isBackfillLoading,
        timestamp: Date.now()
      });
      setIsBackfillLoading(false);
      setBackfillSkeletonCount(0);
    }
    prevImageCountRef.current = images.length;
    
    // Clean up optimistic sets - remove IDs for images no longer in the list
    setOptimisticUnpositionedIds(prev => {
      const next = new Set<string>();
      for (const id of prev) {
        if (currentImageIds.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
    
    setOptimisticPositionedIds(prev => {
      const next = new Set<string>();
      for (const id of prev) {
        if (currentImageIds.has(id)) {
          next.add(id);
        }
      }
      return next;
    });

    // Clean up optimistic deleted IDs - remove IDs for images that are actually deleted from the server
    setOptimisticDeletedIds(prev => {
      const next = new Set<string>();
      for (const id of prev) {
        if (currentImageIds.has(id)) {
          // If the image is still in the list, keep it in optimistic deleted state
          next.add(id);
        }
        // If the image is no longer in the list, it was successfully deleted on the server
        // so we don't need to keep tracking it in optimistic state
      }
      return next;
    });
  }, [currentImageIds, images.length, isServerPagination, isBackfillLoading, serverPage, setIsBackfillLoading, setBackfillSkeletonCount]); // 🚀 PERFORMANCE FIX: Use memoized IDs instead of raw images array

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
    // Lightbox state
    activeLightboxMedia,
    setActiveLightboxMedia,
    
    // Task details state
    selectedImageForDetails,
    setSelectedImageForDetails,
    showTaskDetailsModal,
    setShowTaskDetailsModal,
    
    // Optimistic state
    optimisticUnpositionedIds,
    optimisticPositionedIds,
    optimisticDeletedIds,
    markOptimisticUnpositioned,
    markOptimisticPositioned,
    markOptimisticDeleted,
    removeOptimisticDeleted,
    
    // Shot selection state
    selectedShotIdLocal,
    setSelectedShotIdLocal,
    
    // UI state
    showTickForImageId,
    setShowTickForImageId,
    showTickForSecondaryImageId,
    setShowTickForSecondaryImageId,
    addingToShotImageId,
    setAddingToShotImageId,
    addingToShotWithoutPositionImageId,
    setAddingToShotWithoutPositionImageId,
    downloadingImageId,
    setDownloadingImageId,
    isDownloadingStarred,
    setIsDownloadingStarred,
    
    // Mobile state
    mobileActiveImageId,
    setMobileActiveImageId,
    mobilePopoverOpenImageId,
    setMobilePopoverOpenImageId,
    
    // Pagination state
    pendingLightboxTarget,
    setPendingLightboxTarget,
    
    // Backfill state
    isBackfillLoading,
    setIsBackfillLoading,
    backfillSkeletonCount,
    setBackfillSkeletonCount,
    
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
