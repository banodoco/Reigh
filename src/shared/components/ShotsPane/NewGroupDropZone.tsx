import React, { useState, useCallback } from 'react';
import { useHandleExternalImageDrop } from '@/shared/hooks/useShots';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useListShots } from '@/shared/hooks/useShots';
import { toast } from 'sonner';
import { isValidDropTarget, getGenerationDropData, isFileDrag, type GenerationDropData } from '@/shared/lib/dragDrop';
import { Plus } from 'lucide-react';

const NEW_GROUP_DROPPABLE_ID = 'new-shot-group-dropzone';

interface NewGroupDropZoneProps {
  onZoneClick: () => void;
  onGenerationDrop?: (data: GenerationDropData) => Promise<void>;
}

const NewGroupDropZone: React.FC<NewGroupDropZoneProps> = ({ onZoneClick, onGenerationDrop }) => {
  const { selectedProjectId } = useProject();
  const { data: shots } = useListShots(selectedProjectId);
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isValidDropTarget(e)) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isValidDropTarget(e)) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Check for generation drop first
    const generationData = getGenerationDropData(e);
    if (generationData && onGenerationDrop) {
      try {
        await onGenerationDrop(generationData);
      } catch (error) {
        console.error('[NewGroupDropZone] Error creating shot from generation:', error);
        toast.error(`Failed to create shot: ${(error as Error).message}`);
      }
      return;
    }

    // Check for file drop
    if (isFileDrag(e)) {
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const shotCount = shots?.length ?? 0;
      
      const validFiles = files.filter(f => validImageTypes.includes(f.type));
      
      if (validFiles.length === 0) {
        toast.error('Only JPEG, PNG, WEBP files can be used to create a new shot.');
        return;
      }

      try {
        if (!selectedProjectId) throw new Error("A project must be selected.");
        
        await handleExternalImageDropMutation.mutateAsync({
          imageFiles: validFiles,
          targetShotId: null,
          currentProjectQueryKey: selectedProjectId,
          currentShotCount: shotCount
        });
      } catch (error) {
        console.error('[NewGroupDropZone] Error creating shot from files:', error);
        toast.error(`Could not create a new shot: ${(error as Error).message}`);
      }
    }
  }, [selectedProjectId, shots?.length, handleExternalImageDropMutation, onGenerationDrop]);

  const isDropTarget = isDragOver;
  return (
    <div 
      className={`new-group-drop-zone group p-4 border-2 border-dashed rounded-lg flex items-center justify-center gap-3 min-w-[200px] transition-all duration-200 cursor-pointer ${
        isDropTarget 
          ? 'border-green-500 bg-green-500/10 scale-105' 
          : 'border-zinc-600'
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onZoneClick}
    >
      <div className="plus-icon-container flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-zinc-500 group-hover:border-[hsl(40,55%,58%)] transition-all duration-200 group-hover:bg-[hsl(40,55%,58%,0.15)] group-hover:shadow-[0_0_16px_hsl(40,55%,58%,0.4)]">
        <Plus className="w-4 h-4 text-zinc-400 group-hover:text-[hsl(40,55%,58%)] transition-all duration-200" />
      </div>
      <p className="text-zinc-400 text-center text-sm group-hover:text-zinc-200 transition-colors duration-200">
        {isDropTarget ? 'Release to create new shot' : 'Create new shot'}
      </p>
    </div>
  );
};

export default NewGroupDropZone;
export { NEW_GROUP_DROPPABLE_ID }; 