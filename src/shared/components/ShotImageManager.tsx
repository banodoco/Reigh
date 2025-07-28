import React, { useState, Fragment, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { GenerationRow } from '@/types/shots';
import { SortableImageItem } from '@/tools/travel-between-images/components/SortableImageItem'; // Adjust path as needed
import MediaLightbox from './MediaLightbox';
import { cn, getDisplayUrl } from '@/shared/lib/utils';
import { MultiImagePreview, SingleImagePreview } from './ImageDragPreview';
import { PairConfig } from '@/tools/travel-between-images/components/ShotEditor';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Button } from './ui/button';
import { ArrowDown } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel, AlertDialogOverlay } from "@/shared/components/ui/alert-dialog";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Trash2 } from 'lucide-react';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

// Removed legacy sessionStorage key constant now that setting is persisted in DB

export interface ShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (shotImageEntryId: string) => void;
  onImageDuplicate?: (generationId: string, position: number) => void;
  onImageReorder: (orderedShotGenerationIds: string[]) => void;
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  generationMode: 'batch' | 'by-pair' | 'timeline';
  pairConfigs: PairConfig[];
  onPairConfigChange: (id: string, field: 'prompt' | 'frames' | 'negativePrompt' | 'context', value: string | number) => void;
  onImageSaved?: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>; // Callback when image is saved with changes
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
}

const ShotImageManager: React.FC<ShotImageManagerProps> = ({
  images,
  onImageDelete,
  onImageDuplicate,
  onImageReorder,
  columns = 4,
  generationMode,
  pairConfigs,
  onPairConfigChange,
  onImageSaved,
  onMagicEdit,
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileSelectedIds, setMobileSelectedIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  const currentDialogSkipChoiceRef = useRef(false);
  const isMobile = useIsMobile();
  const outerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { value: imageDeletionSettings, update: updateImageDeletionSettings } = useUserUIState('imageDeletion', { skipConfirmation: false });

  // Sync visual state with database state when it loads
  useEffect(() => {
    if (imageDeletionSettings.skipConfirmation) {
      setSkipConfirmationNextTimeVisual(true);
      currentDialogSkipChoiceRef.current = true;
    }
  }, [imageDeletionSettings.skipConfirmation]);

  // Notify other components (e.g., PaneControlTab) when mobile selection is active
  useEffect(() => {
    if (!isMobile) return;

    const active = mobileSelectedIds.length > 0;
    const event = new CustomEvent('mobileSelectionActive', { detail: active });
    window.dispatchEvent(event);

    return () => {
      // On cleanup, ensure we reset to inactive if component unmounts
      window.dispatchEvent(new CustomEvent('mobileSelectionActive', { detail: false }));
    };
  }, [mobileSelectedIds.length, isMobile]);

  // Batch delete function - hoisted to top level to survive re-renders
  const performBatchDelete = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      
      // Clear selection first for immediate UI feedback
      setMobileSelectedIds([]);
      setConfirmOpen(false);
      
      // Execute deletions
      ids.forEach(id => onImageDelete(id));
    },
    [onImageDelete]
  );

  // Deselect when clicking outside the entire image manager area (mobile selection mode)
  useEffect(() => {
    if (!isMobile) return;

    const handleDocClick = (e: MouseEvent) => {
      if (mobileSelectedIds.length === 0) return;
      if (outerRef.current && !outerRef.current.contains(e.target as Node)) {
        setMobileSelectedIds([]);
      }
    };

    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [mobileSelectedIds.length, isMobile]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Increased distance to prevent accidental drags and reduce performance load
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      // Reduced delay for better responsiveness but with tolerance
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Preserve multi-selection when initiating a drag with ⌘/Ctrl pressed
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;

    // Record the item being dragged so we can show a preview
    setActiveId(active.id as string);

    // If the drag was started while the modifier key (⌘ on macOS, Ctrl on Windows/Linux)
    // is pressed we **do not** clear the existing selection. This allows users to
    // Command/Ctrl-click multiple images and then drag the whole group in one go.
    // `activatorEvent` is the original pointer/mouse event that triggered the drag.
    // See: https://docs.dndkit.com/6.0.x/api-documentation/dnd-context#events
    // Casting to `any` so we can safely access `activatorEvent`.
    const activatorEvent = (event as any)?.activatorEvent as (MouseEvent | PointerEvent | undefined);

    const isModifierPressed = activatorEvent?.metaKey || activatorEvent?.ctrlKey;

    if (!isModifierPressed && !selectedIds.includes(active.id as string)) {
      // Starting a regular drag on an un-selected item -> clear previous selection
      setSelectedIds([]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeIsSelected = selectedIds.includes(active.id as string);

    if (!activeIsSelected || selectedIds.length <= 1) {
      const oldIndex = images.findIndex((img) => img.shotImageEntryId === active.id);
      const newIndex = images.findIndex((img) => img.shotImageEntryId === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(images, oldIndex, newIndex);
        onImageReorder(newOrder.map((img) => img.shotImageEntryId));
      }
      setSelectedIds([]);
      return;
    }

    // Multi-drag logic
    if (selectedIds.includes(over.id as string)) {
      return; // Avoid dropping a selection onto part of itself
    }

    const overIndex = images.findIndex((img) => img.shotImageEntryId === over.id);
    const activeIndex = images.findIndex((img) => img.shotImageEntryId === active.id);

    const selectedItems = images.filter((img) => selectedIds.includes(img.shotImageEntryId));
    const remainingItems = images.filter((img) => !selectedIds.includes(img.shotImageEntryId));

    const overInRemainingIndex = remainingItems.findIndex((img) => img.shotImageEntryId === over.id);

    let newItems: GenerationRow[];
    if (activeIndex > overIndex) {
      // Dragging up
      newItems = [
        ...remainingItems.slice(0, overInRemainingIndex),
        ...selectedItems,
        ...remainingItems.slice(overInRemainingIndex),
      ];
    } else {
      // Dragging down
      newItems = [
        ...remainingItems.slice(0, overInRemainingIndex + 1),
        ...selectedItems,
        ...remainingItems.slice(overInRemainingIndex + 1),
      ];
    }

    onImageReorder(newItems.map((img) => img.shotImageEntryId));
    setSelectedIds([]);
  };

  const handleItemClick = (id: string, event: React.MouseEvent) => {
    event.preventDefault(); // Prevent any default behavior like navigation
    
    // Mobile behavior for batch mode
    if (isMobile && generationMode === 'batch') {
      if (mobileSelectedIds.includes(id)) {
        // Clicking on selected image deselects it
        setMobileSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      } else {
        // Add to selection
        setMobileSelectedIds(prev => [...prev, id]);
      }
      return;
    }
    
    // Desktop behavior
    if (event.metaKey || event.ctrlKey) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id],
      );
    } else {
      setSelectedIds([id]);
    }
  };

  const handleMobileDoubleClick = (index: number) => {
    if (isMobile && generationMode === 'batch') {
      setLightboxIndex(index);
      setMobileSelectedIds([]); // Clear selection when opening lightbox
    }
  };

  const handleMoveHere = (targetIndex: number) => {
    if (mobileSelectedIds.length === 0) return;
    
    // Get selected items and remaining items
    const selectedItems = images.filter(img => mobileSelectedIds.includes(img.shotImageEntryId));
    const remainingItems = images.filter(img => !mobileSelectedIds.includes(img.shotImageEntryId));
    
    // Calculate adjusted target index based on selected items before target
    const selectedIndicesBefore = mobileSelectedIds
      .map(id => images.findIndex(img => img.shotImageEntryId === id))
      .filter(idx => idx < targetIndex).length;
    const adjustedTargetIndex = Math.max(0, targetIndex - selectedIndicesBefore);
    
    // Insert selected items at target position
    const newOrder = [
      ...remainingItems.slice(0, adjustedTargetIndex),
      ...selectedItems,
      ...remainingItems.slice(adjustedTargetIndex)
    ];
    
    onImageReorder(newOrder.map(img => img.shotImageEntryId));
    setMobileSelectedIds([]); // Clear selection after move
  };

  const handleNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % images.length);
    }
  };

  const handlePrevious = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
    }
  };

  const activeImage = activeId ? images.find((img) => img.shotImageEntryId === activeId) : null;

  if (!images || images.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No images to display - <span 
          onPointerUp={() => navigate("/tools/image-generation")}
          className="text-primary hover:underline cursor-pointer"
        >generate images</span>
      </p>
    );
  }

  if (generationMode === 'by-pair') {
    const imagePairs = images.slice(0, -1).map((image, index) => {
      const nextImage = images[index + 1];
      const pairId = `${image.id}-${nextImage.id}`;
      const config = pairConfigs.find(p => p.id === pairId) || { 
        prompt: '', 
        frames: 30, 
        negativePrompt: '', 
        context: 16 
      };

      return {
        id: pairId,
        imageA: image,
        imageB: nextImage,
        config: config,
        isFirstPair: index === 0,
        pairNumber: index + 1,
      };
    });

    // Group pairs into rows of 2
    const pairRows: Array<Array<typeof imagePairs[0]>> = [];
    for (let i = 0; i < imagePairs.length; i += 2) {
      pairRows.push(imagePairs.slice(i, i + 2));
    }

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={images.map((img) => img.shotImageEntryId)} strategy={rectSortingStrategy}>
          <div className="space-y-6">
            {pairRows.map((row, rowIndex) => (
              <div key={rowIndex} className="space-y-4">
                {/* Row with pairs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {row.map((pair, pairIndex) => (
                    <div key={pair.id} className="space-y-3">
                      {/* Pair Header */}
                      <div className="flex items-center justify-center">
                        <h3 className="text-sm font-semibold text-center px-3 py-1 bg-muted rounded-md">
                          Pair {pair.pairNumber}
                        </h3>
                      </div>
                      
                      {/* Pair Content */}
                      <div className="p-4 border rounded-lg bg-card shadow-sm">
                        <div className="flex space-x-4 mb-4">
                          <div className="flex-1">
                            <SortableImageItem
                              image={pair.imageA}
                              isSelected={selectedIds.includes(pair.imageA.shotImageEntryId)}
                              onClick={(e) => handleItemClick(pair.imageA.shotImageEntryId, e)}
                              onDelete={() => onImageDelete(pair.imageA.shotImageEntryId)}
                              onDuplicate={onImageDuplicate}
                              position={images.findIndex(img => img.id === pair.imageA.id)}
                              onDoubleClick={() => {
                                const imageIndex = images.findIndex(img => img.id === pair.imageA.id);
                                if (imageIndex >= 0) setLightboxIndex(imageIndex);
                              }}
                              skipConfirmation={imageDeletionSettings.skipConfirmation}
                              onSkipConfirmationSave={() => updateImageDeletionSettings({ skipConfirmation: true })}
                            />
                          </div>
                          <div className="flex-1">
                            <SortableImageItem
                              image={pair.imageB}
                              isSelected={selectedIds.includes(pair.imageB.shotImageEntryId)}
                              onClick={(e) => handleItemClick(pair.imageB.shotImageEntryId, e)}
                              onDelete={() => onImageDelete(pair.imageB.shotImageEntryId)}
                              onDuplicate={onImageDuplicate}
                              position={images.findIndex(img => img.id === pair.imageB.id)}
                              onDoubleClick={() => {
                                const imageIndex = images.findIndex(img => img.id === pair.imageB.id);
                                if (imageIndex >= 0) setLightboxIndex(imageIndex);
                              }}
                              skipConfirmation={imageDeletionSettings.skipConfirmation}
                              onSkipConfirmationSave={() => updateImageDeletionSettings({ skipConfirmation: true })}
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <Label htmlFor={`prompt-${pair.id}`}>Prompt Per Pair:</Label>
                              <Textarea
                                id={`prompt-${pair.id}`}
                                value={pair.config.prompt}
                                onChange={e => onPairConfigChange(pair.id, 'prompt', e.target.value)}
                                placeholder="e.g., cinematic transition"
                                className="min-h-[70px] text-sm"
                                rows={3}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`negative-prompt-${pair.id}`}>Negative Prompt Per Pair:</Label>
                              <Textarea
                                id={`negative-prompt-${pair.id}`}
                                value={pair.config.negativePrompt}
                                onChange={e => onPairConfigChange(pair.id, 'negativePrompt', e.target.value)}
                                placeholder="e.g., blurry, low quality"
                                className="min-h-[70px] text-sm"
                                rows={3}
                              />
                            </div>
                          </div>
                          <div className={pair.isFirstPair ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
                            <div>
                              <Label htmlFor={`frames-${pair.id}`}>Frames per pair: {pair.config.frames}</Label>
                              <Slider
                                id={`frames-${pair.id}`}
                                min={10}
                                max={82}
                                step={1}
                                value={[pair.config.frames]}
                                onValueChange={([value]) => onPairConfigChange(pair.id, 'frames', value)}
                              />
                            </div>
                            {!pair.isFirstPair && (
                              <div>
                                <Label htmlFor={`context-${pair.id}`}>Context Frames Per Pair: {pair.config.context}</Label>
                                <Slider
                                  id={`context-${pair.id}`}
                                  min={0}
                                  max={60}
                                  step={1}
                                  value={[pair.config.context]}
                                  onValueChange={([value]) => onPairConfigChange(pair.id, 'context', value)}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Vertical separator line between rows (not after the last row) */}
                {rowIndex < pairRows.length - 1 && (
                  <div className="flex justify-center">
                    <div className="w-px h-8 bg-border"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId && activeImage ? (
            <>
              {selectedIds.length > 1 && selectedIds.includes(activeId) ? (
                <MultiImagePreview count={selectedIds.length} image={activeImage} />
              ) : (
                <SingleImagePreview image={activeImage} />
              )}
            </>
          ) : null}
        </DragOverlay>
        {lightboxIndex !== null && images[lightboxIndex] && (
          <MediaLightbox
            media={images[lightboxIndex]}
            onClose={() => setLightboxIndex(null)}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onImageSaved={onImageSaved ? async (newImageUrl: string, createNew?: boolean) => await onImageSaved(images[lightboxIndex].id, newImageUrl, createNew) : undefined}
            showNavigation={true}
            showImageEditTools={true}
            showDownload={true}
            showMagicEdit={true}
            videoPlayerComponent="hover-scrub"
            onMagicEdit={onMagicEdit}
          />
        )}
      </DndContext>
    );
  }

  const gridColsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    7: 'grid-cols-7',
    8: 'grid-cols-8',
    9: 'grid-cols-9',
    10: 'grid-cols-10',
    11: 'grid-cols-11',
    12: 'grid-cols-12',
  };

  // Mobile batch mode with selection
  if (isMobile && generationMode === 'batch') {
    const mobileColumns = 3; // Always use 3 columns on mobile
    const itemsPerRow = mobileColumns;
    
    const shouldSkipConfirmation = imageDeletionSettings.skipConfirmation;

    const handleDeleteTrigger = () => {
      if (mobileSelectedIds.length === 0) return;
      if (shouldSkipConfirmation) {
        performBatchDelete(mobileSelectedIds);
      } else {
        setSkipConfirmationNextTimeVisual(false);
        currentDialogSkipChoiceRef.current = false;
        setConfirmOpen(true);
      }
    };
    
    return (
      <div ref={outerRef} className="relative"
        onClick={(e)=>{
          const target=e.target as HTMLElement;
          if(!target.closest('[data-mobile-item]')){
            setMobileSelectedIds([]);
          }
        }}>
        
        <div className={cn("grid gap-3 grid-cols-3")}>
          {images.map((image, index) => {
            const isSelected = mobileSelectedIds.includes(image.shotImageEntryId);
            const isLastItem = index === images.length - 1;
            
            return (
              <React.Fragment key={image.shotImageEntryId}>
                <div className="relative">
                  <MobileImageItem
                     image={image}
                     isSelected={isSelected}
                     onClick={(e) => handleItemClick(image.shotImageEntryId, e)}
                     onDoubleClick={() => handleMobileDoubleClick(index)}
                     onDelete={() => onImageDelete(image.shotImageEntryId)}
                     hideDeleteButton={mobileSelectedIds.length > 0}
                   />
                   
                  {/* Move button before first image */}
                  {index === 0 && mobileSelectedIds.length > 0 && (
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 -translate-x-1/2 z-10">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-12 w-6 rounded-full p-0"
                        onClick={() => handleMoveHere(0)}
                        onPointerDown={e=>e.stopPropagation()}
                        title="Move to beginning"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {/* Move here button after this item */}
                  {mobileSelectedIds.length > 0 && (
                    <div 
                      className="absolute top-1/2 -right-1 -translate-y-1/2 translate-x-1/2 z-10"
                    >
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-12 w-6 rounded-full p-0"
                        onClick={() => handleMoveHere(index + 1)}
                        onPointerDown={e=>e.stopPropagation()}
                        title="Move here"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* {mobileSelectedIds.length > 0 && (
          <div className="fixed bottom-4 right-4 z-40">
            <Button
              variant="destructive"
              size="lg"
              onClick={handleDeleteTrigger}
              className="shadow-lg"
            >
              {mobileSelectedIds.length > 1 ? `Delete ${mobileSelectedIds.length}` : 'Delete'}
            </Button>
          </div>
        )} */}

        {/* Confirmation dialog rendered outside the conditional so it persists through unmounts */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogOverlay onPointerDown={(e) => e.stopPropagation()} />
          <AlertDialogContent
            onPointerDown={(e)=>e.stopPropagation()}
            onClick={(e)=>e.stopPropagation()}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Image{mobileSelectedIds.length > 1 ? 's' : ''}</AlertDialogTitle>
              <AlertDialogDescription>
                Do you want to permanently remove {mobileSelectedIds.length > 1 ? 'these images' : 'this image'} from the shot? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex items-center space-x-2 my-4">
              <Checkbox
                id="skip-confirm"
                checked={skipConfirmationNextTimeVisual}
                onCheckedChange={(checked)=>{
                  const v = Boolean(checked);
                  setSkipConfirmationNextTimeVisual(v);
                  currentDialogSkipChoiceRef.current = v;
                }}
              />
              <Label htmlFor="skip-confirm" className="text-sm font-medium leading-none">
                Delete without confirmation in the future
              </Label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={()=>{
                if (currentDialogSkipChoiceRef.current) {
                  updateImageDeletionSettings({ skipConfirmation: true });
                }
                performBatchDelete(mobileSelectedIds);
              }}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {lightboxIndex !== null && images[lightboxIndex] && (
          <MediaLightbox
            media={images[lightboxIndex]}
            onClose={() => setLightboxIndex(null)}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onImageSaved={onImageSaved ? async (newImageUrl: string, createNew?: boolean) => await onImageSaved(images[lightboxIndex].id, newImageUrl, createNew) : undefined}
            showNavigation={true}
            showImageEditTools={true}
            showDownload={true}
            showMagicEdit={true}
            videoPlayerComponent="hover-scrub"
            onMagicEdit={onMagicEdit}
          />
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={images.map((img) => img.shotImageEntryId)} strategy={rectSortingStrategy}>
        <div className={cn("grid gap-3", isMobile ? "grid-cols-3" : gridColsClass[columns])}>
          {images.map((image, index) => (
            <SortableImageItem
              key={image.shotImageEntryId}
              image={image}
              isSelected={isMobile && generationMode === 'batch' ? mobileSelectedIds.includes(image.shotImageEntryId) : selectedIds.includes(image.shotImageEntryId)}
              onPointerDown={(e) => {
                // Capture modifier key state ASAP to avoid losing it if the user releases before click fires
                if (isMobile) return; // desktop-only multi-select enhancement
                if (e.metaKey || e.ctrlKey) {
                  setSelectedIds(prev =>
                    prev.includes(image.shotImageEntryId)
                      ? prev.filter(id => id !== image.shotImageEntryId)
                      : [...prev, image.shotImageEntryId]
                  );
                }
              }}
              onClick={(e) => handleItemClick(image.shotImageEntryId, e)}
              onDelete={() => onImageDelete(image.shotImageEntryId)}
              onDuplicate={onImageDuplicate}
              position={index}
              onDoubleClick={() => isMobile && generationMode === 'batch' ? handleMobileDoubleClick(index) : setLightboxIndex(index)}
              skipConfirmation={imageDeletionSettings.skipConfirmation}
              onSkipConfirmationSave={() => updateImageDeletionSettings({ skipConfirmation: true })}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId && activeImage ? (
          <>
            {selectedIds.length > 1 && selectedIds.includes(activeId) ? (
              <MultiImagePreview count={selectedIds.length} image={activeImage} />
            ) : (
              <SingleImagePreview image={activeImage} />
            )}
          </>
        ) : null}
      </DragOverlay>
      {lightboxIndex !== null && images[lightboxIndex] && (
        <MediaLightbox
          media={images[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onImageSaved={onImageSaved ? async (newImageUrl: string, createNew?: boolean) => await onImageSaved(images[lightboxIndex].id, newImageUrl, createNew) : undefined}
          showNavigation={true}
          showImageEditTools={true}
          showDownload={true}
          showMagicEdit={true}
          videoPlayerComponent="hover-scrub"
          onMagicEdit={onMagicEdit}
        />
      )}
    </DndContext>
  );
};

// Lightweight non-sortable image item used in mobile batch mode to avoid
// relying on dnd-kit context (which isn’t mounted in that view).
interface MobileImageItemProps {
  image: GenerationRow;
  isSelected: boolean;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDelete: () => void; // Add this
  hideDeleteButton?: boolean;
}

const MobileImageItem: React.FC<MobileImageItemProps> = ({
  image,
  isSelected,
  onClick,
  onDoubleClick,
  onDelete, // Add this
  hideDeleteButton,
}) => {
  const imageUrl = image.thumbUrl || image.imageUrl;
  const displayUrl = getDisplayUrl(imageUrl);

  return (
    <div
      className={cn(
        'relative bg-muted/50 rounded border p-1 flex flex-col items-center justify-center aspect-square overflow-hidden shadow-sm cursor-pointer',
        { 'ring-2 ring-offset-2 ring-blue-500 border-blue-500': isSelected },
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-mobile-item="true"
    >
      <img
        src={displayUrl}
        alt={`Image ${image.id}`}
        className="max-w-full max-h-full object-contain rounded-sm"
      />
      {!hideDeleteButton && (
        <Button
          variant="destructive"
          size="icon"
          className="absolute top-1 right-1 h-7 w-7 p-0 rounded-full opacity-70 hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Remove image from shot"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

export default ShotImageManager; 