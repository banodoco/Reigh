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
  disabledReason?: string;
  shouldLoadImages?: boolean;
  shotIndex?: number;
  projectAspectRatio?: string;
}

const SortableShotItem: React.FC<SortableShotItemProps> = ({
  shot,
  onSelectShot,
  currentProjectId,
  isDragDisabled = false,
  disabledReason,
  shouldLoadImages = true,
  shotIndex = 0,
  projectAspectRatio,
}) => {
  // [ShotReorderDebug] Debug tag for shot reordering issues
  const REORDER_DEBUG_TAG = '[ShotReorderDebug]';
  
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

  // [ShotReorderDebug] Log dragging state changes (only when actually dragging to reduce noise)
  React.useEffect(() => {
    if (isDragging) {
      });
    }
  }, [isDragging]);

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
        dragDisabledReason={disabledReason}
        shouldLoadImages={shouldLoadImages}
        shotIndex={shotIndex}
        projectAspectRatio={projectAspectRatio}
      />
    </div>
  );
};

export default SortableShotItem; 