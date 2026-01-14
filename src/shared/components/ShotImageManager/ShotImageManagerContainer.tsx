import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { ShotImageManagerProps } from './types';
import { useSelection } from './hooks/useSelection';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useOptimisticOrder } from './hooks/useOptimisticOrder';
import { useLightbox } from './hooks/useLightbox';
import { useExternalGenerations } from './hooks/useExternalGenerations';
import { useBatchOperations } from './hooks/useBatchOperations';
import { useMobileGestures } from './hooks/useMobileGestures';
import { getFramePositionForIndex } from './utils/image-utils';
import { DEFAULT_BATCH_VIDEO_FRAMES } from './constants';
import { EmptyState } from './components/EmptyState';
import { ShotImageManagerDesktop } from './ShotImageManagerDesktop.tsx';
import { ShotImageManagerMobileWrapper } from './ShotImageManagerMobileWrapper.tsx';
import { useSegmentOutputsForShot } from '@/tools/travel-between-images/hooks/useSegmentOutputsForShot';
import MediaLightbox from '../MediaLightbox';
import { GenerationRow } from '@/types/shots';
import { filterImagesForDisplay } from '@/shared/lib/typeGuards';

/**
 * Main container component for ShotImageManager
 * 
 * CRITICAL: All hooks MUST be called before any early returns to satisfy Rules of Hooks.
 * This prevents hook ordering violations that occur when responsive breakpoints change.
 */
export const ShotImageManagerContainer: React.FC<ShotImageManagerProps> = (props) => {
  const isMobile = useIsMobile();
  
  console.log('[DataTrace] 🎯 ShotImageManager received props.images:', {
    count: props.images?.length || 0,
    imageIds: props.images?.map(img => ((img as any).shotImageEntryId ?? (img as any).id)?.substring(0, 8)) || [],
  });
  
  // ============================================================================
  // HOOK INITIALIZATION (MUST BE BEFORE ANY EARLY RETURNS)
  // ============================================================================
  
  // Optimistic order management
  const optimistic = useOptimisticOrder({ images: props.images });
  
  // Ref indirection to avoid hook ordering issues when external gens want to set lightbox index
  const setLightboxIndexRef = useRef<(index: number) => void>(() => {});
  
  // External generations management
  const externalGens = useExternalGenerations({
    selectedShotId: props.selectedShotId,
    optimisticOrder: optimistic.optimisticOrder,
    images: props.images,
    setLightboxIndexRef
  });
  
  // Local state for shot selector dropdown (separate from the shot being viewed)
  const [lightboxSelectedShotId, setLightboxSelectedShotId] = React.useState<string | undefined>(props.selectedShotId);
  
  // Selection management
  const selection = useSelection({
    images: optimistic.optimisticOrder,
    isMobile,
    generationMode: props.generationMode,
    onSelectionChange: props.onSelectionChange
  });
  
  // Lightbox management
  const lightbox = useLightbox({
    images: optimistic.optimisticOrder,
    externalGenerations: externalGens.externalGenerations,
    tempDerivedGenerations: externalGens.tempDerivedGenerations,
    derivedNavContext: externalGens.derivedNavContext,
    handleOpenExternalGeneration: externalGens.handleOpenExternalGeneration
  });

  // Build local shot_generation positions from the current batch order
  // This keeps segment outputs aligned with the batch grid order.
  const localShotGenPositions = useMemo(() => {
    if (props.generationMode !== 'batch') return undefined;
    const orderedImages = filterImagesForDisplay(lightbox.currentImages);
    if (orderedImages.length === 0) return undefined;
    const map = new Map<string, number>();
    orderedImages.forEach((img, index) => {
      if (img.id) {
        map.set(img.id, index);
      }
    });
    console.log(`[BatchSegments] localShotGenPositions count=${map.size} order=${orderedImages.map((img, idx) => `${idx}:${img.id?.substring(0, 8)}`).join(' ')}`);
    return map;
  }, [props.generationMode, lightbox.currentImages]);

  // Segment video outputs for batch view (only when in batch mode)
  const {
    segmentSlots,
    selectedParentId,
  } = useSegmentOutputsForShot(
    props.generationMode === 'batch' ? props.shotId || null : null,
    props.generationMode === 'batch' ? props.projectId || null : null,
    props.generationMode === 'batch' ? localShotGenPositions : undefined
  );

  // Log what we're passing to the hook
  console.log(`[BatchSegments] HOOK INPUTS shotId=${props.shotId?.substring(0, 8) || 'NULL'} projectId=${props.projectId?.substring(0, 8) || 'NULL'} mode=${props.generationMode}`);
  
  // Flat log for each slot
  console.log(`[BatchSegments] segmentSlots count=${segmentSlots.length}`);
  segmentSlots.forEach((slot) => {
    const childId = slot.type === 'child' ? slot.child.id?.substring(0, 8) : 'n/a';
    const hasLoc = slot.type === 'child' ? !!slot.child.location : false;
    console.log(`[BatchSegments]   slot[${slot.index}] type=${slot.type} childId=${childId} hasLoc=${hasLoc}`);
  });
  
  // Segment video lightbox state
  const [segmentLightboxIndex, setSegmentLightboxIndex] = useState<number | null>(null);
  
  // Handle segment video click - open lightbox
  const handleSegmentClick = useCallback((slotIndex: number) => {
    setSegmentLightboxIndex(slotIndex);
  }, []);
  
  // Get current segment lightbox media
  const currentSegmentSlot = segmentLightboxIndex !== null ? segmentSlots[segmentLightboxIndex] : null;
  const currentSegmentMedia = currentSegmentSlot?.type === 'child' ? currentSegmentSlot.child : null;
  
  // Segment lightbox navigation
  const segmentChildSlotIndices = useMemo(() => 
    segmentSlots
      .map((slot, idx) => slot.type === 'child' && slot.child.location ? idx : null)
      .filter((idx): idx is number => idx !== null),
    [segmentSlots]
  );
  
  const handleSegmentLightboxNext = useCallback(() => {
    if (segmentLightboxIndex === null || segmentChildSlotIndices.length === 0) return;
    const currentPos = segmentChildSlotIndices.indexOf(segmentLightboxIndex);
    const nextPos = (currentPos + 1) % segmentChildSlotIndices.length;
    setSegmentLightboxIndex(segmentChildSlotIndices[nextPos]);
  }, [segmentLightboxIndex, segmentChildSlotIndices]);
  
  const handleSegmentLightboxPrev = useCallback(() => {
    if (segmentLightboxIndex === null || segmentChildSlotIndices.length === 0) return;
    const currentPos = segmentChildSlotIndices.indexOf(segmentLightboxIndex);
    const prevPos = (currentPos - 1 + segmentChildSlotIndices.length) % segmentChildSlotIndices.length;
    setSegmentLightboxIndex(segmentChildSlotIndices[prevPos]);
  }, [segmentLightboxIndex, segmentChildSlotIndices]);
  
  // Update externalGens setLightboxIndex with the real one from lightbox
  useEffect(() => {
    setLightboxIndexRef.current = lightbox.setLightboxIndex;
  }, [lightbox.setLightboxIndex]);
  
  // Drag and drop management
  const dragAndDrop = useDragAndDrop({
    images: lightbox.currentImages,
    selectedIds: selection.selectedIds,
    onImageReorder: props.onImageReorder,
    isMobile,
    setSelectedIds: selection.setSelectedIds,
    setLastSelectedIndex: selection.setLastSelectedIndex,
    setOptimisticOrder: optimistic.setOptimisticOrder,
    setIsOptimisticUpdate: optimistic.setIsOptimisticUpdate,
    setReconciliationId: optimistic.setReconciliationId,
    onDragStateChange: props.onDragStateChange
  });
  
  // Batch operations management
  const batchOps = useBatchOperations({
    currentImages: lightbox.currentImages,
    onImageDelete: props.onImageDelete,
    onBatchImageDelete: props.onBatchImageDelete,
    onSelectionChange: props.onSelectionChange,
    setSelectedIds: selection.setSelectedIds,
    setMobileSelectedIds: selection.setMobileSelectedIds,
    setLastSelectedIndex: selection.setLastSelectedIndex
  });
  
  // Mobile gestures management
  const mobileGestures = useMobileGestures({
    currentImages: lightbox.currentImages,
    mobileSelectedIds: selection.mobileSelectedIds,
    onImageReorder: props.onImageReorder,
    setMobileSelectedIds: selection.setMobileSelectedIds,
    setLightboxIndex: lightbox.setLightboxIndex
  });
  
  // Frame position calculator (memoized for performance)
  const getFramePosition = useMemo(() => {
    return (index: number) => getFramePositionForIndex(
      index,
      lightbox.currentImages,
      props.batchVideoFrames || DEFAULT_BATCH_VIDEO_FRAMES
    );
  }, [lightbox.currentImages, props.batchVideoFrames]);
  
  // ============================================================================
  // CONDITIONAL RENDERING (SAFE NOW THAT ALL HOOKS ARE CALLED)
  // ============================================================================
  
  console.log(`[DEBUG] Checking images condition - images.length=${props.images?.length} selectedIds.length=${selection.selectedIds.length}`);
  
  console.log('[DataTrace] 🎨 ShotImageManager about to render:', {
    propsImages: props.images?.length || 0,
    optimisticOrder: optimistic.optimisticOrder.length,
    lightboxCurrentImages: lightbox.currentImages.length,
    isOptimisticUpdate: optimistic.isOptimisticUpdate,
    displayingWhich: optimistic.isOptimisticUpdate ? 'optimistic' : 'props',
  });
  
  if (!props.images || props.images.length === 0) {
    console.log(`[DEBUG] EARLY RETURN - No images`);
    return (
      <EmptyState
        onImageUpload={props.onImageUpload}
        isUploadingImage={props.isUploadingImage}
        shotId={props.selectedShotId}
        onGenerationDrop={props.onGenerationDrop ? 
          (generationId, imageUrl, thumbUrl) => props.onGenerationDrop!(generationId, imageUrl, thumbUrl, 0, 0) 
          : undefined
        }
      />
    );
  }
  
  console.log(`[DEBUG] Checking mobile condition - isMobile=${isMobile} generationMode=${props.generationMode} selectedIds.length=${selection.selectedIds.length}`);
  
  if (isMobile && props.generationMode === 'batch') {
    console.log(`[DEBUG] EARLY RETURN - Using dedicated mobile component`);
    return (
      <>
        <ShotImageManagerMobileWrapper
          {...props}
          selection={selection}
          lightbox={lightbox}
          batchOps={batchOps}
          mobileGestures={mobileGestures}
          optimistic={optimistic}
          externalGens={externalGens}
          lightboxSelectedShotId={lightboxSelectedShotId}
          setLightboxSelectedShotId={setLightboxSelectedShotId}
          segmentSlots={segmentSlots}
          onSegmentClick={handleSegmentClick}
        />
        
        {/* Segment video lightbox */}
        {currentSegmentMedia && (
          <MediaLightbox
            media={{
              ...currentSegmentMedia,
              parent_generation_id: selectedParentId,
            } as GenerationRow}
            onClose={() => setSegmentLightboxIndex(null)}
            onNext={handleSegmentLightboxNext}
            onPrevious={handleSegmentLightboxPrev}
            showNavigation={true}
            showImageEditTools={false}
            showDownload={true}
            hasNext={segmentChildSlotIndices.length > 1}
            hasPrevious={segmentChildSlotIndices.length > 1}
            starred={(currentSegmentMedia as any).starred ?? false}
            shotId={props.shotId}
            showTaskDetails={true}
            showVideoTrimEditor={true}
            fetchVariantsForSelf={true}
          />
        )}
      </>
    );
  }
  
  // Desktop rendering
  return (
    <>
      <ShotImageManagerDesktop
        {...props}
        selection={selection}
        dragAndDrop={dragAndDrop}
        lightbox={lightbox}
        batchOps={batchOps}
        optimistic={optimistic}
        externalGens={externalGens}
        getFramePosition={getFramePosition}
        lightboxSelectedShotId={lightboxSelectedShotId}
        setLightboxSelectedShotId={setLightboxSelectedShotId}
        segmentSlots={segmentSlots}
        onSegmentClick={handleSegmentClick}
      />
      
      {/* Segment video lightbox */}
      {currentSegmentMedia && (
        <MediaLightbox
          media={{
            ...currentSegmentMedia,
            parent_generation_id: selectedParentId,
          } as GenerationRow}
          onClose={() => setSegmentLightboxIndex(null)}
          onNext={handleSegmentLightboxNext}
          onPrevious={handleSegmentLightboxPrev}
          showNavigation={true}
          showImageEditTools={false}
          showDownload={true}
          hasNext={segmentChildSlotIndices.length > 1}
          hasPrevious={segmentChildSlotIndices.length > 1}
          starred={(currentSegmentMedia as any).starred ?? false}
          shotId={props.shotId}
          showTaskDetails={true}
          showVideoTrimEditor={true}
          fetchVariantsForSelf={true}
        />
      )}
    </>
  );
};

export default ShotImageManagerContainer;

