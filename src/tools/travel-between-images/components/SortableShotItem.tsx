import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shot } from '@/types/shots';
import VideoShotDisplay from './VideoShotDisplay';

interface SortableShotItemProps {
  shot: Shot;
  onSelectShot: () => void;
  currentProjectId: string | null;
  isDragDisabled?: boolean;
  shouldLoadImages?: boolean;
  shotIndex?: number;
}

const SortableShotItem: React.FC<SortableShotItemProps> = ({
  shot,
  onSelectShot,
  currentProjectId,
  isDragDisabled = false,
  shouldLoadImages = true,
  shotIndex = 0,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: shot.id,
    disabled: isDragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
    >
      <VideoShotDisplay
        shot={shot}
        onSelectShot={onSelectShot}
        currentProjectId={currentProjectId}
        dragHandleProps={{
          ...attributes,
          ...listeners,
          disabled: isDragDisabled,
        }}
        shouldLoadImages={shouldLoadImages}
        shotIndex={shotIndex}
      />
    </div>
  );
};

export default SortableShotItem; 