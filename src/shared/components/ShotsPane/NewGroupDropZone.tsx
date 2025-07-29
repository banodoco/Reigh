import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useHandleExternalImageDrop } from '@/shared/hooks/useShots';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useToast } from '@/shared/hooks/use-toast';
import { useListShots } from '@/shared/hooks/useShots';
import { useLocation } from 'react-router-dom';

const NEW_GROUP_DROPPABLE_ID = 'new-shot-group-dropzone';

interface NewGroupDropZoneProps {
  onZoneClick: () => void;
}

const NewGroupDropZone: React.FC<NewGroupDropZoneProps> = ({ onZoneClick }) => {
  const { selectedProjectId } = useProject();
  const { data: shots } = useListShots(selectedProjectId);
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const { toast } = useToast();
  const [isFileOver, setIsFileOver] = useState(false);
  const location = useLocation();
  const isOnTimelinePage = location.pathname === '/tools/travel-between-images';

  const { isOver: isDndKitOver, setNodeRef } = useDroppable({
    id: NEW_GROUP_DROPPABLE_ID,
    data: {
      type: 'new-group-zone',
    },
    disabled: isOnTimelinePage // Disable when on timeline page
  });

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsFileOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsFileOver(true);
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
    }
    setIsFileOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const shotCount = shots?.length ?? 0;
    
    const validFiles = files.filter(f => validImageTypes.includes(f.type));
    
    if (validFiles.length === 0) {
      toast({
        title: "No Valid Files Found",
        description: `Only JPEG, PNG, WEBP files can be used to create a new shot.`,
        variant: "destructive",
      });
      return;
    }

    try {
      if (!selectedProjectId) throw new Error("A project must be selected.");
      
      await handleExternalImageDropMutation.mutateAsync({
        imageFiles: validFiles,
        targetShotId: null, // Passing null to indicate a new shot should be created
        currentProjectQueryKey: selectedProjectId,
        currentShotCount: shotCount
      });

      toast({
        title: "New Shot Created",
        description: `Successfully created a new shot with ${validFiles.length} image(s).`,
      });
    } catch (error) {
      console.error(`Error creating new shot with ${validFiles.length} file(s):`, error);
      toast({
        title: "Error Creating Shot",
        description: `Could not create a new shot: ${(error as Error).message}`,
        variant: "destructive",
      });
    }
  };

  const isDropTarget = isDndKitOver || isFileOver;
  const style = {
    borderColor: isDropTarget ? '#22c55e' : '#4B5563', // gray-600
    backgroundColor: isDropTarget ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="new-group-drop-zone p-4 border-2 border-dashed rounded flex items-center justify-center min-w-[200px] transition-colors"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onZoneClick}
    >
      <p className="text-gray-400 text-center">
        {isDropTarget ? 'Release to create a new shot' : 'Drop image(s) here to create a new shot'}
      </p>
    </div>
  );
};

export default NewGroupDropZone;
export { NEW_GROUP_DROPPABLE_ID }; 