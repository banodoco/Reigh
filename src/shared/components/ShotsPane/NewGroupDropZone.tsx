import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useHandleExternalImageDrop } from '@/shared/hooks/useShots';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useToast } from '@/shared/hooks/use-toast';
import { useListShots } from '@/shared/hooks/useShots';

const NEW_GROUP_DROPPABLE_ID = 'new-shot-group-dropzone';

const NewGroupDropZone: React.FC = () => {
  const { selectedProjectId } = useProject();
  const { data: shots } = useListShots(selectedProjectId);
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const { toast } = useToast();
  const [isFileOver, setIsFileOver] = useState(false);

  const { isOver: isDndKitOver, setNodeRef } = useDroppable({
    id: NEW_GROUP_DROPPABLE_ID,
    data: {
      type: 'new-group-zone',
    }
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

    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const shotCount = shots?.length ?? 0;
    
    // Process only the first valid file to create the new shot
    const file = files.find(f => validImageTypes.includes(f.type));
    
    if (!file) {
      toast({
        title: "Invalid File Type",
        description: `Only JPEG, PNG, WEBP, or GIF files can be used to create a new shot.`,
        variant: "destructive",
      });
      return;
    }

    try {
      if (!selectedProjectId) throw new Error("A project must be selected.");
      
      await handleExternalImageDropMutation.handleDrop( 
        file,
        null, // Passing null to indicate a new shot should be created
        selectedProjectId,
        shotCount
      );

      toast({
        title: "New Shot Created",
        description: `Successfully created a new shot with '${file.name}'.`,
      });
    } catch (error) {
      console.error(`Error creating new shot with file ${file.name}:`, error);
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
    >
      <p className="text-gray-400 text-center">
        {isDropTarget ? 'Release to create a new shot' : 'Drop an image here to create a new shot'}
      </p>
    </div>
  );
};

export default NewGroupDropZone;
export { NEW_GROUP_DROPPABLE_ID }; 