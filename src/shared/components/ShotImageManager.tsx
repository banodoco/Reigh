import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { GenerationRow } from '@/types/shots';
import { SortableImageItem } from '@/tools/video-travel/components/SortableImageItem'; // Adjust path as needed
import MediaLightbox from './MediaLightbox';
import { cn } from '@/shared/lib/utils';

export interface ShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (generationId: string) => void;
  onImageReorder: (activeId: string, overId: string) => void; // Simplified for now, parent will handle array move
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12; // Add a columns prop
  // We might need projectId and shotId if delete/reorder logic is complex and internal,
  // but passing callbacks for actions is generally cleaner.
}

const ShotImageManager: React.FC<ShotImageManagerProps> = ({
  images,
  onImageDelete,
  onImageReorder,
  columns = 4, // Default to 4 columns
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onImageReorder(active.id as string, over.id as string);
    }
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

  if (!images || images.length === 0) {
    return <p className="text-sm text-muted-foreground">No images to display.</p>;
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={images.map(img => img.id)} strategy={rectSortingStrategy}>
        <div className={cn("grid gap-3", gridColsClass[columns])}>
          {images.map((image, index) => (
            <SortableImageItem
              key={image.id}
              image={image}
              onDelete={() => onImageDelete(image.id)}
              onDoubleClick={() => setLightboxIndex(index)}
            />
          ))}
        </div>
      </SortableContext>
      {lightboxIndex !== null && (
        <MediaLightbox
          media={images[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onNext={handleNext}
          onPrevious={handlePrevious}
        />
      )}
    </DndContext>
  );
};

export default ShotImageManager; 