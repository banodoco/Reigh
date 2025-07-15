import React, { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
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
import { cn } from '@/shared/lib/utils';
import { MultiImagePreview, SingleImagePreview } from './ImageDragPreview';
import { PairConfig } from '@/tools/travel-between-images/components/ShotEditor';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Button } from './ui/button';
import { ArrowRight } from 'lucide-react';

export interface ShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (shotImageEntryId: string) => void;
  onImageReorder: (orderedShotGenerationIds: string[]) => void;
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  generationMode: 'batch' | 'by-pair' | 'timeline';
  pairConfigs: PairConfig[];
  onPairConfigChange: (id: string, field: 'prompt' | 'frames' | 'negativePrompt' | 'context', value: string | number) => void;
  onImageSaved?: (imageId: string, newImageUrl: string) => void; // Callback when image is saved with changes
}

const ShotImageManager: React.FC<ShotImageManagerProps> = ({
  images,
  onImageDelete,
  onImageReorder,
  columns = 4,
  generationMode,
  pairConfigs,
  onPairConfigChange,
  onImageSaved,
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileSelectedId, setMobileSelectedId] = useState<string | null>(null);
  const isMobile = useIsMobile();

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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    if (!selectedIds.includes(active.id as string)) {
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
      if (mobileSelectedId === id) {
        // Clicking on selected image deselects it
        setMobileSelectedId(null);
      } else {
        // Select the image
        setMobileSelectedId(id);
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
      setMobileSelectedId(null); // Clear selection when opening lightbox
    }
  };

  const handleMoveHere = (targetIndex: number) => {
    if (!mobileSelectedId) return;
    
    const selectedIndex = images.findIndex(img => img.shotImageEntryId === mobileSelectedId);
    if (selectedIndex === -1) return;
    
    let newOrder = [...images];
    const [removed] = newOrder.splice(selectedIndex, 1);
    
    // Adjust target index if moving from before to after
    const adjustedIndex = selectedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newOrder.splice(adjustedIndex, 0, removed);
    
    onImageReorder(newOrder.map(img => img.shotImageEntryId));
    setMobileSelectedId(null); // Clear selection after move
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
        No images to display - <Link to="/tools/image-generation" className="text-primary hover:underline">generate images</Link>
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
                              onDoubleClick={() => {
                                const imageIndex = images.findIndex(img => img.id === pair.imageA.id);
                                if (imageIndex >= 0) setLightboxIndex(imageIndex);
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <SortableImageItem
                              image={pair.imageB}
                              isSelected={selectedIds.includes(pair.imageB.shotImageEntryId)}
                              onClick={(e) => handleItemClick(pair.imageB.shotImageEntryId, e)}
                              onDelete={() => onImageDelete(pair.imageB.shotImageEntryId)}
                              onDoubleClick={() => {
                                const imageIndex = images.findIndex(img => img.id === pair.imageB.id);
                                if (imageIndex >= 0) setLightboxIndex(imageIndex);
                              }}
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
        {lightboxIndex !== null && (
          <MediaLightbox
            media={images[lightboxIndex]}
            onClose={() => setLightboxIndex(null)}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onImageSaved={onImageSaved ? (newImageUrl: string) => onImageSaved(images[lightboxIndex].id, newImageUrl) : undefined}
            showNavigation={true}
            showImageEditTools={true}
            showDownload={true}
            videoPlayerComponent="hover-scrub"
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
  if (isMobile && generationMode === 'batch' && mobileSelectedId) {
    const mobileColumns = 3; // Always use 3 columns on mobile
    const itemsPerRow = mobileColumns;
    
    return (
      <div className="relative">
        <div className={cn("grid gap-3 grid-cols-3")}>
          {images.map((image, index) => {
            const isSelected = image.shotImageEntryId === mobileSelectedId;
            const isLastItem = index === images.length - 1;
            
            return (
              <React.Fragment key={image.shotImageEntryId}>
                {/* Move here button before first item */}
                {index === 0 && (
                  <div className="absolute left-0 top-0 -translate-x-1/2 h-full flex items-center z-10">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-6 w-6 rounded-full p-0"
                      onClick={() => handleMoveHere(0)}
                      title="Move here"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                
                <div className="relative">
                  <SortableImageItem
                    image={image}
                    isSelected={isSelected}
                    onClick={(e) => handleItemClick(image.shotImageEntryId, e)}
                    onDelete={() => onImageDelete(image.shotImageEntryId)}
                    onDoubleClick={() => handleMobileDoubleClick(index)}
                    isDragDisabled={true} // Disable drag on mobile when in selection mode
                  />
                  
                  {/* Move here button after this item */}
                  <div 
                    className="absolute top-1/2 -right-1 -translate-y-1/2 translate-x-1/2 z-10"
                  >
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-6 w-6 rounded-full p-0"
                      onClick={() => handleMoveHere(index + 1)}
                      title="Move here"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        
        {lightboxIndex !== null && (
          <MediaLightbox
            media={images[lightboxIndex]}
            onClose={() => setLightboxIndex(null)}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onImageSaved={onImageSaved ? (newImageUrl: string) => onImageSaved(images[lightboxIndex].id, newImageUrl) : undefined}
            showNavigation={true}
            showImageEditTools={true}
            showDownload={true}
            videoPlayerComponent="hover-scrub"
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
        <div className={cn("grid gap-3 grid-cols-3 sm:"+gridColsClass[columns])}>
          {images.map((image, index) => (
            <SortableImageItem
              key={image.shotImageEntryId}
              image={image}
              isSelected={isMobile && generationMode === 'batch' ? image.shotImageEntryId === mobileSelectedId : selectedIds.includes(image.shotImageEntryId)}
              onClick={(e) => handleItemClick(image.shotImageEntryId, e)}
              onDelete={() => onImageDelete(image.shotImageEntryId)}
              onDoubleClick={() => isMobile && generationMode === 'batch' ? handleMobileDoubleClick(index) : setLightboxIndex(index)}
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
      {lightboxIndex !== null && (
        <MediaLightbox
          media={images[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onImageSaved={onImageSaved ? (newImageUrl: string) => onImageSaved(images[lightboxIndex].id, newImageUrl) : undefined}
          showNavigation={true}
          showImageEditTools={true}
          showDownload={true}
          videoPlayerComponent="hover-scrub"
        />
      )}
    </DndContext>
  );
};

export default ShotImageManager; 