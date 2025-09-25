import { useMemo, useRef, useEffect } from 'react';
import { getTimelineDimensions } from '../utils/timeline-utils';
import { timelineDebugger } from '../utils/timeline-debug';

interface CoordinateSystemProps {
  positions: Map<string, number>;
  shotId: string;
  isDragInProgress?: boolean;
}

interface CoordinateSystemData {
  fullMin: number;
  fullMax: number;
  fullRange: number;
}

export function useCoordinateSystem({ positions, shotId, isDragInProgress = false }: CoordinateSystemProps) {
  
  // Track previous coordinate system for change detection
  const prevCoordinatesRef = useRef<CoordinateSystemData>({ fullMin: 0, fullMax: 0, fullRange: 0 });
  const prevDragBoundaryRef = useRef<CoordinateSystemData>({ fullMin: 0, fullMax: 0, fullRange: 0 });

  // Calculate dimensions from positions
  const coordinateSystem = useMemo(() => {
    const { fullMin, fullMax, fullRange } = getTimelineDimensions(positions);
    
    timelineDebugger.logCoordinateSystem(shotId, fullMin, fullMax, fullRange, 'calculated');
    
    return { fullMin, fullMax, fullRange };
  }, [positions, shotId]);

  // Track coordinate system changes
  useEffect(() => {
    const prev = prevCoordinatesRef.current;
    const current = coordinateSystem;

    if (prev.fullMin !== current.fullMin || prev.fullMax !== current.fullMax || prev.fullRange !== current.fullRange) {
      timelineDebugger.logCoordinateChange('Coordinate system changed', {
        shotId,
        previous: prev,
        current: current,
        delta: {
          minShift: current.fullMin - prev.fullMin,
          maxShift: current.fullMax - prev.fullMax,
          rangeShift: current.fullRange - prev.fullRange
        }
      });

      // Track boundary changes for drag behavior analysis
      const prevBoundary = prevDragBoundaryRef.current;
      timelineDebugger.logBoundaryHit('Boundary system changed', {
        shotId,
        boundaryChanged: {
          minChanged: current.fullMin !== prevBoundary.fullMin,
          maxChanged: current.fullMax !== prevBoundary.fullMax,
          rangeChanged: current.fullRange !== prevBoundary.fullRange
        },
        previousBoundary: prevBoundary,
        currentBoundary: current,
        deltas: {
          minDelta: current.fullMin - prevBoundary.fullMin,
          maxDelta: current.fullMax - prevBoundary.fullMax,
          rangeDelta: current.fullRange - prevBoundary.fullRange
        },
        direction: current.fullMin < prevBoundary.fullMin ? 'LEFT_EXPANSION' :
                  current.fullMax > prevBoundary.fullMax ? 'RIGHT_EXPANSION' :
                  current.fullRange > prevBoundary.fullRange ? 'RANGE_EXPANSION' : 'CONTRACTION'
      });
    }

    prevCoordinatesRef.current = current;
    prevDragBoundaryRef.current = current;
  }, [coordinateSystem, shotId]);

  // Log coordinate system stability during drag operations
  useEffect(() => {
    if (isDragInProgress) {
      timelineDebugger.logCoordinateChange('Coordinate system stability check', {
        shotId,
        isDragging: isDragInProgress,
        fullMin: coordinateSystem.fullMin,
        fullMax: coordinateSystem.fullMax,
        fullRange: coordinateSystem.fullRange
      });
    }
  }, [isDragInProgress, coordinateSystem, shotId]);

  return coordinateSystem;
}

export type { CoordinateSystemData };
