import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { toast } from 'sonner';
import { timelineDebugger } from '../utils/timeline-debug';
import type { ShotGeneration } from '@/shared/hooks/useEnhancedShotPositions';
import { useTimelinePositions } from './useTimelinePositions';

interface PositionManagementProps {
  shotId: string;
  shotGenerations: ShotGeneration[];
  images: GenerationRow[];
  frameSpacing: number;
  isLoading: boolean;
  isPersistingPositions: boolean;
  isDragInProgress: boolean;
  updateTimelineFrame?: (shotGenerationId: string, frame: number, metadata?: any) => Promise<void>;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
  setIsPersistingPositions: (persisting: boolean) => void;
}

// Feature flag - set to true to use the new simplified position system
const USE_NEW_POSITION_SYSTEM = true;

interface PositionChangeAnalysis {
  totalAnalyzed: number;
  significantChanges: Array<[string, any]>;
  filteredOut: Array<[string, any]>;
  allChanges: Array<[string, any]>;
  syncSummary: {
    db_vs_display_synced: number;
    db_vs_display_out_of_sync: number;
    total_out_of_sync: number;
  };
}

export function usePositionManagement({
  shotId,
  shotGenerations,
  images,
  frameSpacing,
  isLoading,
  isPersistingPositions,
  isDragInProgress,
  updateTimelineFrame,
  onFramePositionsChange,
  setIsPersistingPositions
}: PositionManagementProps) {
  
  // =========================================================================
  // NEW POSITION SYSTEM (when feature flag enabled)
  // =========================================================================
  
  const newPositionSystem = useTimelinePositions({
    shotId,
    shotGenerations,
    images,
    frameSpacing,
    onPositionsChange: onFramePositionsChange,
  });
  
  // Lock/unlock positions during drag operations
  useEffect(() => {
    if (USE_NEW_POSITION_SYSTEM) {
      if (isDragInProgress) {
        newPositionSystem.lockPositions();
      } else {
        newPositionSystem.unlockPositions();
      }
    }
  }, [isDragInProgress, newPositionSystem]);
  
  // If using new system, return its interface wrapped for compatibility
  if (USE_NEW_POSITION_SYSTEM) {
    // Wrapper for setFramePositions that handles the persisting state
    const wrappedSetFramePositions = async (newPositions: Map<string, number>) => {
      setIsPersistingPositions(true);
      try {
        await newPositionSystem.updatePositions(newPositions, { operation: 'drag' });
      } finally {
        // Small delay before clearing to allow UI to settle
        setTimeout(() => setIsPersistingPositions(false), 100);
      }
    };
    
    // Simple analyze function for backwards compatibility
    const analyzePositionChanges = (
      newPositions: Map<string, number>,
      framePositions: Map<string, number>,
      displayPositions: Map<string, number>,
      stablePositions: Map<string, number>
    ) => {
      const changes: Array<[string, any]> = [];
      for (const [id, newPos] of newPositions) {
        const oldPos = framePositions.get(id);
        if (oldPos !== newPos) {
          changes.push([id, { oldPos, newPos, delta: newPos - (oldPos ?? 0) }]);
        }
      }
      return {
        totalAnalyzed: newPositions.size,
        significantChanges: changes,
        filteredOut: [],
        allChanges: changes,
        syncSummary: { db_vs_display_synced: 0, db_vs_display_out_of_sync: 0, total_out_of_sync: 0 }
      };
    };
    
    console.log('[PositionManagement] 🆕 Using new position system');
    
    return {
      framePositions: newPositionSystem.positions,
      displayPositions: newPositionSystem.positions,
      stablePositions: newPositionSystem.positions,
      setStablePositions: () => {}, // No-op, new system handles this
      setFramePositions: wrappedSetFramePositions,
      analyzePositionChanges,
    };
  }
  
// Remove unused legacy code and return the simplified interface
  // This effectively replaces the entire legacy implementation
  return {
    framePositions: newPositionSystem.positions,
    displayPositions: newPositionSystem.positions,
    stablePositions: newPositionSystem.positions,
    setStablePositions: () => {}, // No-op, new system handles this
    setFramePositions: wrappedSetFramePositions,
    analyzePositionChanges: () => ({
      totalAnalyzed: 0,
      significantChanges: [],
      filteredOut: [],
      allChanges: [],
      syncSummary: { db_vs_display_synced: 0, db_vs_display_out_of_sync: 0, total_out_of_sync: 0 }
    }),
  };
}

export type { PositionChangeAnalysis };
