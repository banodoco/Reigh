import { useState, useCallback, useEffect, useRef } from 'react';
import { GenerationRow } from '@/types/shots';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

interface UseBatchOperationsProps {
  currentImages: GenerationRow[];
  onImageDelete: (id: string) => void;
  onBatchImageDelete?: (ids: string[]) => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  setSelectedIds: (ids: string[]) => void;
  setMobileSelectedIds: (ids: string[]) => void;
  setLastSelectedIndex: (index: number | null) => void;
}

export function useBatchOperations({
  currentImages,
  onImageDelete,
  onBatchImageDelete,
  onSelectionChange,
  setSelectedIds,
  setMobileSelectedIds,
  setLastSelectedIndex
}: UseBatchOperationsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  const currentDialogSkipChoiceRef = useRef(false);
  
  const { value: imageDeletionSettings, update: updateImageDeletionSettings } = 
    useUserUIState('imageDeletion', { skipConfirmation: false });
  
  // Sync visual state with database state when it loads
  useEffect(() => {
    if (imageDeletionSettings.skipConfirmation) {
      setSkipConfirmationNextTimeVisual(true);
      currentDialogSkipChoiceRef.current = true;
    }
  }, [imageDeletionSettings.skipConfirmation]);
  
  // Batch delete function
  const performBatchDelete = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    
    console.log('[OPTIMISTIC_DELETE] Starting optimistic batch delete', {
      idsToDelete: ids.map(id => id.substring(0, 8)),
      totalCount: ids.length,
      currentImagesCount: currentImages.length
    });
    
    // Clear selection and UI state for immediate feedback
    console.log('[CLEAR_TRACE] Clearing selection in performBatchDelete');
    setMobileSelectedIds([]);
    setSelectedIds([]);
    setLastSelectedIndex(null);
    setConfirmOpen(false);
    setPendingDeleteIds([]);
    onSelectionChange?.(false);
    
    // Use batch delete handler if available, otherwise fall back to individual deletes
    if (onBatchImageDelete) {
      onBatchImageDelete(ids);
    } else {
      ids.forEach(id => onImageDelete(id));
    }
  }, [onImageDelete, onBatchImageDelete, currentImages, setMobileSelectedIds, setSelectedIds, setLastSelectedIndex, onSelectionChange]);
  
  // Individual delete function that clears selection if needed
  const handleIndividualDelete = useCallback((id: string) => {
    console.log('[OPTIMISTIC_DELETE] Starting optimistic individual delete', {
      idToDelete: id.substring(0, 8),
      currentImagesCount: currentImages.length
    });
    
    // Clear selection if the deleted item was selected
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    setMobileSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    
    // Execute deletion
    onImageDelete(id);
  }, [onImageDelete, currentImages, setSelectedIds, setMobileSelectedIds]);
  
  // Handle batch delete request
  const handleBatchDelete = useCallback((ids: string[]) => {
    setPendingDeleteIds([...ids]);
    
    if (imageDeletionSettings.skipConfirmation) {
      performBatchDelete(ids);
    } else {
      setConfirmOpen(true);
    }
  }, [imageDeletionSettings.skipConfirmation, performBatchDelete]);
  
  return {
    confirmOpen,
    setConfirmOpen,
    pendingDeleteIds,
    setPendingDeleteIds,
    skipConfirmationNextTimeVisual,
    currentDialogSkipChoiceRef,
    imageDeletionSettings,
    updateImageDeletionSettings,
    performBatchDelete,
    handleIndividualDelete,
    handleBatchDelete
  };
}

