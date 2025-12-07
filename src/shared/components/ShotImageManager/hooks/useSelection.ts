import { useState, useEffect, useCallback, useRef } from 'react';
import { GenerationRow } from '@/types/shots';
import { getImageRange } from '../utils/image-utils';
import { logSelectionEvent } from '../utils/selection-debug';
import { SELECTION_BAR_DELAY } from '../constants';

interface UseSelectionProps {
  images: GenerationRow[];
  isMobile: boolean;
  generationMode: 'batch' | 'timeline';
  onSelectionChange?: (hasSelection: boolean) => void;
}

export function useSelection({
  images,
  isMobile,
  generationMode,
  onSelectionChange
}: UseSelectionProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mobileSelectedIds, setMobileSelectedIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [showSelectionBar, setShowSelectionBar] = useState(false);
  const [renderCounter, setRenderCounter] = useState(0);
  
  // Refs to always access latest state - fix for stale closure issues
  const selectedIdsRef = useRef<string[]>([]);
  const mobileSelectedIdsRef = useRef<string[]>([]);
  
  // Update refs synchronously during render
  selectedIdsRef.current = selectedIds;
  mobileSelectedIdsRef.current = mobileSelectedIds;
  
  // Show selection bar with a delay after items are selected
  useEffect(() => {
    const hasSelection = selectedIds.length > 0 || mobileSelectedIds.length > 0;
    
    if (hasSelection) {
      const timer = setTimeout(() => {
        setShowSelectionBar(true);
      }, SELECTION_BAR_DELAY);
      return () => clearTimeout(timer);
    } else {
      setShowSelectionBar(false);
    }
  }, [selectedIds.length, mobileSelectedIds.length]);
  
  // Dispatch selection state to hide pane controls on mobile
  useEffect(() => {
    if (isMobile) {
      const hasSelection = mobileSelectedIds.length > 0;
      window.dispatchEvent(new CustomEvent('mobileSelectionActive', { detail: hasSelection }));
    }
    
    // Cleanup: ensure pane controls are restored when component unmounts
    return () => {
      if (isMobile) {
        window.dispatchEvent(new CustomEvent('mobileSelectionActive', { detail: false }));
      }
    };
  }, [mobileSelectedIds.length, isMobile]);
  
  // Wrap setSelectedIds to force re-render
  const setSelectedIdsWithRerender = useCallback((newIds: string[] | ((prev: string[]) => string[])) => {
    setSelectedIds(newIds);
    setRenderCounter(prev => prev + 1);
  }, []);
  
  // Clear selection
  const clearSelection = useCallback(() => {
    logSelectionEvent('Clearing selection', {
      desktopCount: selectedIds.length,
      mobileCount: mobileSelectedIds.length
    });
    setSelectedIds([]);
    setMobileSelectedIds([]);
    setLastSelectedIndex(null);
    onSelectionChange?.(false);
  }, [selectedIds.length, mobileSelectedIds.length, onSelectionChange]);
  
  // Handle item click (desktop)
  const handleItemClick = useCallback((imageKey: string, event: React.MouseEvent) => {
    logSelectionEvent('handleItemClick called', {
      imageKey: imageKey.substring(0, 8),
      isMobile,
      generationMode,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey
    });
    
    event.preventDefault();
    
    // Mobile behavior for batch mode
    if (isMobile && generationMode === 'batch') {
      const wasSelected = mobileSelectedIds.includes(imageKey);
      
      if (wasSelected) {
        setMobileSelectedIds(prev => {
          const newSelection = prev.filter(selectedId => selectedId !== imageKey);
          onSelectionChange?.(newSelection.length > 0);
          return newSelection;
        });
      } else {
        setMobileSelectedIds(prev => {
          const newSelection = [...prev, imageKey];
          onSelectionChange?.(true);
          return newSelection;
        });
      }
      return;
    }
    
    // Find the current image index
    // img.id is shot_generations.id - unique per entry
    const currentIndex = images.findIndex(img => img.id === imageKey);
    
    // Desktop behavior
    if (event.metaKey || event.ctrlKey) {
      // Command+click behavior
      const isCurrentlySelected = selectedIds.includes(imageKey);
      
      if (lastSelectedIndex !== null && lastSelectedIndex !== currentIndex && selectedIds.length > 0) {
        // Range operation: select or deselect range between lastSelectedIndex and currentIndex
        const rangeIds = getImageRange(lastSelectedIndex, currentIndex, images);
        
        if (isCurrentlySelected) {
          // Deselect range
          setSelectedIds((prev) => {
            const newSelection = prev.filter(selectedId => !rangeIds.includes(selectedId));
            if (newSelection.length === 0) {
              setLastSelectedIndex(null);
            }
            onSelectionChange?.(newSelection.length > 0);
            return newSelection;
          });
        } else {
          // Select range
          setSelectedIdsWithRerender((prev) => {
            const newSelection = Array.from(new Set([...prev, ...rangeIds]));
            onSelectionChange?.(true);
            return newSelection;
          });
          setLastSelectedIndex(currentIndex);
        }
      } else {
        // Regular Ctrl/Cmd+click: Toggle individual selection
        setSelectedIds((prev) => {
          if (isCurrentlySelected) {
            const newSelection = prev.filter((selectedId) => selectedId !== imageKey);
            if (newSelection.length === 0) {
              setLastSelectedIndex(null);
            }
            onSelectionChange?.(newSelection.length > 0);
            return newSelection;
          } else {
            setLastSelectedIndex(currentIndex);
            const newSelection = [...prev, imageKey];
            onSelectionChange?.(true);
            return newSelection;
          }
        });
      }
    } else {
      // Single click: Toggle individual selection
      setSelectedIdsWithRerender((prev) => {
        const isSelected = prev.includes(imageKey);
        if (isSelected) {
          const newSelection = prev.filter((selectedId) => selectedId !== imageKey);
          if (newSelection.length === 0) {
            setLastSelectedIndex(null);
          }
          onSelectionChange?.(newSelection.length > 0);
          return newSelection;
        } else {
          setLastSelectedIndex(currentIndex);
          const newSelection = [...prev, imageKey];
          onSelectionChange?.(true);
          return newSelection;
        }
      });
    }
  }, [isMobile, generationMode, mobileSelectedIds, images, lastSelectedIndex, selectedIds, onSelectionChange, setSelectedIdsWithRerender]);
  
  return {
    selectedIds,
    setSelectedIds,
    mobileSelectedIds,
    setMobileSelectedIds,
    lastSelectedIndex,
    setLastSelectedIndex,
    showSelectionBar,
    renderCounter,
    selectedIdsRef,
    mobileSelectedIdsRef,
    setSelectedIdsWithRerender,
    clearSelection,
    handleItemClick
  };
}

