import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shot } from '@/types/shots';
import { useUpdateShotName, useHandleExternalImageDrop, useAddImageToShot } from '@/shared/hooks/useShots';
import { getDisplayUrl } from '@/shared/lib/utils';
import { ChevronDown, ChevronUp, Video } from 'lucide-react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { VideoGenerationModal } from '@/shared/components/VideoGenerationModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { toast } from 'sonner';
import { isValidDropTarget, getGenerationDropData, isFileDrag, type GenerationDropData } from '@/shared/lib/dragDrop';

interface ShotGroupProps {
  shot: Shot;
  highlighted?: boolean;
}

const ShotGroup: React.FC<ShotGroupProps> = ({ shot, highlighted = false }) => {
  const { navigateToShot } = useShotNavigation();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const addImageToShotMutation = useAddImageToShot();
  const updateShotNameMutation = useUpdateShotName();
  const isMobile = useIsMobile();

  const [isEditing, setIsEditing] = useState(false);
  const [currentName, setCurrentName] = useState(shot.name || 'Unnamed Shot');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  const IMAGES_PER_ROW = 4;
  const allImages = (shot.images || []).filter(img => !isVideoGeneration(img));
  const hasMultipleRows = allImages.length > IMAGES_PER_ROW;

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (shot.name !== currentName && !isEditing) {
      setCurrentName(shot.name || 'Unnamed Shot');
    }
  }, [shot.name, currentName, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleNameDoubleClick = () => {
    setIsEditing(true);
  };

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentName(event.target.value);
  };

  const saveName = () => {
    setIsEditing(false);
    const trimmedName = currentName.trim();
    if (trimmedName && trimmedName !== shot.name) {
      updateShotNameMutation.mutate({ shotId: shot.id, newName: trimmedName, projectId: shot.project_id });
    } else if (!trimmedName && shot.name) {
      setCurrentName(shot.name || 'Unnamed Shot'); 
    } else if (!trimmedName && !shot.name) {
      setCurrentName('Unnamed Shot');
    }
  };

  const handleInputBlur = () => {
    saveName();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      saveName();
    } else if (event.key === 'Escape') {
      setIsEditing(false);
      setCurrentName(shot.name || 'Unnamed Shot');
    }
  };

  // Drag and drop handlers for generations from ImageGallery and files
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
      setIsDragOver(true);
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're leaving the element entirely (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Check for generation drop (from ImageGallery) using shared utility
    const generationData = getGenerationDropData(e);
    if (generationData) {
      console.log('[ShotGroup] Generation dropped:', {
        shotId: shot.id.substring(0, 8),
        shotName: shot.name,
        generationId: generationData.generationId?.substring(0, 8),
      });

      if (!shot.project_id) {
        toast.error('Shot has no associated project');
        return;
      }

      try {
        await addImageToShotMutation.mutateAsync({
          shot_id: shot.id,
          generation_id: generationData.generationId,
          project_id: shot.project_id,
          imageUrl: generationData.imageUrl,
          thumbUrl: generationData.thumbUrl,
        });
      } catch (error) {
        console.error('[ShotGroup] Failed to add generation to shot:', error);
        toast.error(`Failed to add to shot: ${(error as Error).message}`);
      }
      return;
    }

    // Check for file drop
    if (isFileDrag(e)) {
      const files = Array.from(e.dataTransfer.files);
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const validFiles = files.filter(file => {
        if (validImageTypes.includes(file.type)) {
          return true;
        }
        toast.error(`Skipped '${file.name}'. Only JPEG, PNG, WEBP are allowed.`);
        return false;
      });

      if (validFiles.length === 0) return;

      try {
        if (!shot.project_id) throw new Error("This shot has no associated project.");
        
        await handleExternalImageDropMutation.mutateAsync({
          imageFiles: validFiles, 
          targetShotId: shot.id, 
          currentProjectQueryKey: shot.project_id, 
          currentShotCount: 0
        });
      } catch (error) {
        console.error('[ShotGroup] handleDrop: Error processing files:', error);
        toast.error(`Could not add images: ${(error as Error).message}`);
      }
    }
  }, [shot.id, shot.name, shot.project_id, addImageToShotMutation, handleExternalImageDropMutation]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    
    // Prevent navigation when interacting with editable elements or modal dialogs
    // Also check for Radix dialog overlay (backdrop) - it has z-index classes and bg-black/80
    // The overlay doesn't have role="dialog" but we can detect it by its attributes
    const isDialogOverlay = target.hasAttribute('data-radix-dialog-overlay') || 
                            target.className.includes('bg-black/80') ||
                            target.closest('[data-radix-dialog-overlay]');
    
    if (isEditing || 
        isDialogOverlay ||
        target.closest('input, button, a, textarea, select, [role="dialog"], [role="menu"], [role="listbox"], [data-radix-portal], [data-radix-dialog-overlay]')) {
      return;
    }
    
    // Don't navigate if the video modal is open - any click should stay in context
    if (isVideoModalOpen) {
      return;
    }
    
    navigateToShot(shot);
  };

  return (
    <div 
      className={`shot-group p-3 border-2 rounded-lg min-w-[200px] max-w-[300px] shadow-lg flex flex-col space-y-2 transition-all duration-300 ease-in-out relative cursor-pointer ${
        isDragOver
          ? 'border-green-400 bg-green-900/30 scale-105'
          : highlighted 
            ? 'border-sky-400 bg-sky-900/20 hover:bg-sky-800/30 ring-2 ring-sky-400/50 ring-offset-2 ring-offset-zinc-900' 
            : 'border-zinc-700 bg-zinc-800/90 hover:bg-zinc-700/50 hover:border-zinc-600'
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div 
          className="absolute inset-0 bg-green-500/20 flex items-center justify-center rounded-lg pointer-events-none z-10"
          style={{ backdropFilter: 'blur(2px)' }}
        >
          <p className="text-white text-sm font-medium p-2 bg-black/60 rounded">Drop to add</p>
        </div>
      )}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={currentName}
          onChange={handleNameChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          className="bg-zinc-700 text-white p-1 rounded border border-zinc-600 text-sm focus:ring-1 focus:ring-sky-500 outline-none w-full"
          maxLength={30}
        />
      ) : (
        <p
          onClick={(e) => {
            // Prevent title clicks from selecting the shot
            e.stopPropagation();
          }}
          onDoubleClick={handleNameDoubleClick}
          className="text-white text-sm font-medium tracking-wide truncate cursor-pointer hover:bg-zinc-700/70 p-1 rounded transition-colors"
          title={currentName}
        >
          {currentName}
        </p>
      )}
      
      {/* Thumbnail mosaic area */}
      <div className={`relative ${isExpanded ? '' : 'h-14'}`}>
        {allImages.length > 0 ? (
          <>
            <div
              className="grid grid-cols-4 gap-1 p-1 transition-all duration-300 ease-in-out"
              style={{
                maxHeight: isExpanded ? undefined : 56, // approx height of one row (48px img + 8px gap)
                overflow: isExpanded ? 'visible' : 'hidden',
              }}
            >
              {allImages.map((image, index) => (
                <img
                  // Use URL + index as key: URL provides stability (no remount when temp ID → real ID),
                  // index provides uniqueness (handles duplicate images with same URL)
                  key={`${image.thumbUrl || image.imageUrl || 'img'}-${index}`}
                  src={getDisplayUrl(image.thumbUrl || image.imageUrl)} // Keep thumbnail-only for small cells
                  alt={`Shot image ${index + 1}`}
                  className="w-12 h-12 object-cover rounded border border-zinc-700 bg-zinc-600 shadow"
                  title={`Entry ID: ${image.id} (Gen: ${image.generation_id || 'N/A'})`}
                />
              ))}
            </div>

            {hasMultipleRows && !isExpanded && (
              <button
                className="absolute bottom-1 right-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
              >
                Show All <ChevronDown className="w-3 h-3" />
              </button>
            )}

            {isExpanded && (
              <button
                className="absolute bottom-1 right-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 rounded flex items-center gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
              >
                Hide <ChevronUp className="w-3 h-3" />
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-zinc-500">
            Drop images here
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-700/50">
        <span className="text-zinc-500">Total: {allImages.length} image(s)</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`flex items-center justify-center w-6 h-6 rounded text-white transition-all duration-200 ${
                  allImages.length === 0 
                    ? 'bg-zinc-600 cursor-not-allowed opacity-30' 
                    : 'bg-violet-600/50 opacity-60 hover:opacity-100 hover:bg-violet-500 hover:scale-110'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (allImages.length > 0) {
                    setIsVideoModalOpen(true);
                  }
                }}
                disabled={allImages.length === 0}
              >
                <Video className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{allImages.length === 0 ? 'Add images to generate video' : 'Generate Video'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Video Generation Modal */}
      <VideoGenerationModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        shot={shot}
      />
    </div>
  );
};

export default ShotGroup; 