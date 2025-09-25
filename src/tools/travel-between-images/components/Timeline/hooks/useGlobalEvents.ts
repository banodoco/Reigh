import { useEffect, useCallback } from 'react';
import { timelineDebugger } from '../utils/timeline-debug';

interface GlobalEventsProps {
  isDragging: boolean;
  activeId?: string;
  shotId: string;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useGlobalEvents({
  isDragging,
  activeId,
  shotId,
  handleMouseMove,
  handleMouseUp,
  containerRef
}: GlobalEventsProps) {

  // Create wrapped event handlers with logging
  const createMoveHandler = useCallback((moveHandler: (e: MouseEvent) => void) => {
    return (e: MouseEvent) => {
      timelineDebugger.logGlobalEvent('Global mouse move', {
        shotId,
        clientX: e.clientX,
        clientY: e.clientY,
        timestamp: e.timeStamp,
        activeId: activeId?.substring(0, 8)
      });
      moveHandler(e);
    };
  }, [shotId, activeId]);

  const createUpHandler = useCallback((upHandler: (e: MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => void) => {
    return (e: MouseEvent) => {
      timelineDebugger.logGlobalEvent('Global mouse up', {
        shotId,
        clientX: e.clientX,
        clientY: e.clientY,
        timestamp: e.timeStamp,
        activeId: activeId?.substring(0, 8),
        willCallHandleMouseUp: true
      });
      upHandler(e, containerRef);
    };
  }, [shotId, activeId, containerRef]);

  // Set up global mouse event listeners for drag
  useEffect(() => {
    if (isDragging) {
      timelineDebugger.logEvent('Setting up global event listeners', {
        shotId,
        isDragging,
        activeId: activeId?.substring(0, 8)
      });

      const moveHandler = createMoveHandler(handleMouseMove);
      const upHandler = createUpHandler(handleMouseUp);

      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);

      return () => {
        timelineDebugger.logEvent('Cleaning up global event listeners', {
          shotId,
          activeId: activeId?.substring(0, 8)
        });
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
      };
    }
  }, [
    isDragging, 
    activeId, 
    shotId,
    handleMouseMove, 
    handleMouseUp, 
    createMoveHandler, 
    createUpHandler
  ]);

  // Track drag state changes
  useEffect(() => {
    timelineDebugger.logEvent('Drag state changed', {
      shotId,
      isDragging,
      activeId: activeId?.substring(0, 8),
      hasGlobalListeners: isDragging
    });
  }, [isDragging, activeId, shotId]);

  return {
    // This hook doesn't return anything, it just manages global events
    // But we could return utilities if needed in the future
    isListening: isDragging
  };
}
