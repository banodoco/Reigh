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

export interface ShotImageManagerProps {
  images: GenerationRow[];
  onImageDelete: (generationId: string) => void;
  onImageReorder: (activeId: string, overId: string) => void; // Simplified for now, parent will handle array move
  // We might need projectId and shotId if delete/reorder logic is complex and internal,
  // but passing callbacks for actions is generally cleaner.
}

const ShotImageManager: React.FC<ShotImageManagerProps> = ({
  images,
  onImageDelete,
  onImageReorder,
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={images.map(img => img.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
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