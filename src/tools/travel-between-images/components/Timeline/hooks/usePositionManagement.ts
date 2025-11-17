import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { toast } from 'sonner';
import { timelineDebugger } from '../utils/timeline-debug';
import type { ShotGeneration } from '@/shared/hooks/useEnhancedShotPositions';

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
  
  // State for stable positions during operations
  const [stablePositions, _setStablePositions] = useState<Map<string, number>>(new Map());
  
  // Track previous positions to detect unexpected changes
  const prevStablePositionsRef = useRef<Map<string, number>>(new Map());
  const framePositionsRenderCount = useRef(0);
  const prevDepsRef = useRef<{
    shotGenerations: any;
    images: any;
    frameSpacing: number;
    shotId: string;
  }>();

  // Position lock mechanism - stronger than timing-based protection
  const positionLockRef = useRef<{
    isLocked: boolean;
    lockedPositions: Map<string, number>;
    lockTimestamp: number;
  }>({
    isLocked: false,
    lockedPositions: new Map(),
    lockTimestamp: 0
  });

  // Store current framePositions in a ref so event listener can access latest value
  const framePositionsRef = useRef<Map<string, number>>(new Map());

  // Simple setStablePositions wrapper
  const setStablePositions = useCallback((newPositions: Map<string, number>, reason?: string) => {
    if (reason === 'position-update' || reason === 'drag-optimistic-update') {
      _setStablePositions(newPositions);
    }
  }, [shotId]);

  // Listen for delete/duplicate mutation start events to lock positions during refetch
  // Use a stable listener with no dependencies on changing data
  useEffect(() => {
    const handleMutationStart = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { shotId: mutationShotId, type } = customEvent.detail || {};
      
      console.log(`[TimelineVisibility] 🎯 MUTATION EVENT RECEIVED:`, {
        mutationShotId: mutationShotId?.substring(0, 8),
        currentShotId: shotId.substring(0, 8),
        type,
        matches: mutationShotId === shotId,
        timestamp: Date.now()
      });
      
      // Only lock if this mutation is for our shot
      if (mutationShotId === shotId && (type === 'delete' || type === 'duplicate')) {
        // Use the CURRENT framePositions from ref (most up-to-date)
        const currentPositions = new Map(framePositionsRef.current);
        
        console.log(`[TimelineVisibility] 🔒 MUTATION LOCK START - ${type.toUpperCase()}`, {
          shotId: shotId.substring(0, 8),
          type,
          lockedItemsCount: currentPositions.size,
          lockedItems: Array.from(currentPositions.entries())
            .sort((a, b) => a[1] - b[1]) // Sort by position for clarity
            .map(([id, pos]) => ({
              id: id.substring(0, 8),
              position: pos
            })),
          timestamp: Date.now()
        });
        
        // Lock positions to prevent glitches during refetch
        positionLockRef.current = {
          isLocked: true,
          lockedPositions: currentPositions,
          lockTimestamp: Date.now()
        };
        
        // Auto-unlock after 2 seconds as a safety measure
        setTimeout(() => {
          if (positionLockRef.current.isLocked) {
            console.log(`[TimelineVisibility] ⏰ AUTO-UNLOCK after 2s safety timeout`, {
              shotId: shotId.substring(0, 8)
            });
            positionLockRef.current.isLocked = false;
          }
        }, 2000);
      }
    };
    
    window.addEventListener('shot-mutation-start', handleMutationStart);
    return () => window.removeEventListener('shot-mutation-start', handleMutationStart);
  }, [shotId]); // Only depend on shotId, not changing data

  // Detect unexpected position changes (but ignore legitimate drag/persist operations)
  useEffect(() => {
    // Skip monitoring during drag or persist operations - these are expected changes
    if (isDragInProgress || isPersistingPositions) {
      // Update reference but don't check for changes
      prevStablePositionsRef.current = new Map(stablePositions);
      return;
    }

    const prevPositions = prevStablePositionsRef.current;
    const currentPositions = Array.from(stablePositions.entries());

    // Only check if we have previous data
    if (prevPositions.size > 0 && currentPositions.length > 0) {
      let positionChanged = false;
      const changes = [];

      // Check for changed positions
      for (const [id, pos] of currentPositions) {
        const prevPos = prevPositions.get(id);
        if (prevPos !== pos) {
          changes.push(`${id.substring(0, 8)}: ${prevPos}→${pos}`);
          positionChanged = true;
        }
      }

      // Check for removed positions
      for (const [id, pos] of prevPositions) {
        if (!stablePositions.has(id)) {
          changes.push(`${id.substring(0, 8)}: ${pos}→REMOVED`);
          positionChanged = true;
        }
      }

      if (positionChanged) {
        timelineDebugger.logPositionError('Unexpected position change detected', {
          shotId,
          changes: changes.join(', '),
          warning: 'This indicates positions are being reset by something other than drag operations'
        });
      }
    }

    // Update previous positions
    prevStablePositionsRef.current = new Map(stablePositions);
  }, [stablePositions, shotId, isDragInProgress, isPersistingPositions]);

  // Calculate frame positions from database
  const imagesByShotGenId = useMemo(() => {
    return new Map(
      images.map(img => [img.shotImageEntryId ?? img.id, img])
    );
  }, [images]);

  const framePositions = useMemo(() => {
    framePositionsRenderCount.current++;
    const currentDeps = { shotGenerations, images, frameSpacing, shotId };
    const prevDeps = prevDepsRef.current;
    
    // 🔒 POSITION LOCK: If positions are locked, return the locked positions instead of fresh data
    if (positionLockRef.current.isLocked) {
      const timeSinceLock = Date.now() - positionLockRef.current.lockTimestamp;
      if (timeSinceLock < 3000) { // 3 second maximum lock duration (covers refetch period)
        // IMPROVED FIX: Match by POSITION ORDER instead of ID
        // During refetch, IDs may change temporarily, so we match current images to locked positions by index
        // This keeps positions stable even when IDs are inconsistent during data transitions
        
        const lockedPositionsList = Array.from(positionLockRef.current.lockedPositions.entries())
          .sort((a, b) => a[1] - b[1]); // Sort by position value
        
        const rebuiltPositions = new Map<string, number>();
        
        // Detect if this is a duplicate (more items) or delete (fewer items)
        const isDuplicateOperation = images.length > positionLockRef.current.lockedPositions.size;
        const isDeleteOperation = images.length < positionLockRef.current.lockedPositions.size;
        
        console.log(`[TimelineVisibility] 🔒 LOCK ACTIVE - Operation type detected (${timeSinceLock}ms since lock)`, {
          lockedCount: positionLockRef.current.lockedPositions.size,
          currentCount: images.length,
          isDuplicate: isDuplicateOperation,
          isDelete: isDeleteOperation,
          isNeutral: !isDuplicateOperation && !isDeleteOperation,
          lockedPositions: lockedPositionsList.map(([id, pos]) => ({
            id: id?.substring(0, 8),
            pos
          })),
          currentImages: images.map((img, idx) => ({
            idx,
            id: (img.shotImageEntryId ?? img.id)?.substring(0, 8),
            timeline_frame: img.timeline_frame
          }))
        });
        
        // Match current images (by index) to locked positions (by index)
        images.forEach((img, idx) => {
          const imageKey = img.shotImageEntryId ?? img.id;
          if (idx < lockedPositionsList.length) {
            // Use the locked position at this index
            const [_, position] = lockedPositionsList[idx];
            rebuiltPositions.set(imageKey, position);
          } else {
            // NEW ITEM (duplicate case) - no locked position for this index
            console.log(`[TimelineVisibility] ⚠️ NEW ITEM at index ${idx} has no locked position`, {
              imageKey: imageKey?.substring(0, 8),
              timeline_frame: img.timeline_frame
            });
          }
        });
        
        console.log(`[TimelineVisibility] 🔒 LOCKED - Position-order matching complete (${timeSinceLock}ms since lock)`, {
          originalLockedCount: positionLockRef.current.lockedPositions.size,
          rebuiltCount: rebuiltPositions.size,
          currentImagesCount: images.length,
          strategy: 'position-order-matching',
          rebuiltItems: Array.from(rebuiltPositions.entries()).map(([id, pos]) => ({
            id: id?.substring(0, 8),
            position: pos
          }))
        });
        
        return rebuiltPositions;
      } else {
        // Auto-unlock after timeout
        console.log(`[TimelineVisibility] 🔓 AUTO-UNLOCK after ${timeSinceLock}ms`);
        positionLockRef.current.isLocked = false;
      }
    }
    
    // 🛡️ REFETCH PROTECTION: If we detect data is inconsistent during refetch, use previous positions
    // This prevents glitches when delete/duplicate operations trigger cache invalidation
    if (prevDeps && positionLockRef.current.lockedPositions.size > 0) {
      const timeSinceLock = Date.now() - positionLockRef.current.lockTimestamp;
      // If recent lock (within 500ms) and data is changing, maintain previous positions
      if (timeSinceLock < 500) {
        const isDataChanging = shotGenerations.length !== prevDeps.shotGenerations.length || 
                                images.length !== prevDeps.images.length;
        if (isDataChanging) {
          // Use position-order matching (same as main lock logic)
          const lockedPositionsList = Array.from(positionLockRef.current.lockedPositions.entries())
            .sort((a, b) => a[1] - b[1]); // Sort by position value
          
          const rebuiltPositions = new Map<string, number>();
          images.forEach((img, idx) => {
            const imageKey = img.shotImageEntryId ?? img.id;
            if (idx < lockedPositionsList.length) {
              const [_, position] = lockedPositionsList[idx];
              rebuiltPositions.set(imageKey, position);
            }
          });
          
          console.log(`[TimelineVisibility] 🛡️ REFETCH PROTECTION - Data changing, using position-order matching`, {
            shotId: shotId.substring(0, 8),
            prevShotGenerations: prevDeps.shotGenerations.length,
            newShotGenerations: shotGenerations.length,
            prevImages: prevDeps.images.length,
            newImages: images.length,
            originalLockedCount: positionLockRef.current.lockedPositions.size,
            rebuiltCount: rebuiltPositions.size,
            timeSinceLock,
            change: shotGenerations.length > prevDeps.shotGenerations.length ? 'ADDED' : 
                    shotGenerations.length < prevDeps.shotGenerations.length ? 'REMOVED' : 'CHANGED'
          });
          return rebuiltPositions;
        }
      }
    }
    
    timelineDebugger.logRender('Recalculating framePositions', {
      shotId,
      shotGenerationsLength: shotGenerations.length,
      imagesLength: images.length,
      frameSpacing,
      isLoading,
      // Dependency change analysis
      shotGenerationsChanged: prevDeps ? shotGenerations !== prevDeps.shotGenerations : true,
      imagesChanged: prevDeps ? images !== prevDeps.images : true,
      frameSpacingChanged: prevDeps ? frameSpacing !== prevDeps.frameSpacing : true,
      shotIdChanged: prevDeps ? shotId !== prevDeps.shotId : true,
      // Reference checks
      shotGenerationsRef: shotGenerations === prevDeps?.shotGenerations ? 'SAME_REF' : 'DIFF_REF',
      imagesRef: images === prevDeps?.images ? 'SAME_REF' : 'DIFF_REF',
      recalcCount: framePositionsRenderCount.current
    });
    
    prevDepsRef.current = currentDeps;
    
    const positions = new Map<string, number>();
    
    console.log(`[TimelineVisibility] 📊 CALCULATING framePositions:`, {
      shotId: shotId.substring(0, 8),
      shotGenerationsCount: shotGenerations.length,
      imagesCount: images.length,
      recalcCount: framePositionsRenderCount.current,
      isLocked: positionLockRef.current.isLocked,
      timestamp: Date.now()
    });
    
    shotGenerations.forEach(sg => {
      const matchingImage = imagesByShotGenId.get(sg.id);
      
      // [Position0Debug] Log the mapping process to find why position 0 items are lost
      if (sg.timeline_frame === 0) {
        console.log(`[Position0Debug] 🔍 Processing position 0 shotGeneration:`, {
          shotGenerationId: sg.id.substring(0, 8),
          generationId: sg.generation_id?.substring(0, 8),
          timeline_frame: sg.timeline_frame,
          matchingImage: matchingImage ? {
            id: matchingImage.id?.substring(0, 8),
            shotImageEntryId: (matchingImage.shotImageEntryId ?? matchingImage.id)?.substring(0, 8)
          } : null,
          allImageIds: images.map(img => ({
            id: img.id?.substring(0, 8),
            shotImageEntryId: (img.shotImageEntryId ?? img.id)?.substring(0, 8)
          }))
        });
      }
      
      if (matchingImage) {
        if (sg.timeline_frame !== null && sg.timeline_frame !== undefined) {
          const imageKey = matchingImage.shotImageEntryId ?? matchingImage.id;
          // [Position0Debug] Check if we're about to overwrite a position 0 item
          const existingPosition = positions.get(imageKey);
          if (existingPosition === 0 && sg.timeline_frame !== 0) {
            console.log(`[Position0Debug] 🚨 OVERWRITING POSITION 0! Item ${imageKey?.substring(0, 8)} had position 0, now setting to ${sg.timeline_frame}`, {
              shotGenerationId: sg.id.substring(0, 8),
              generationId: sg.generation_id?.substring(0, 8),
              oldPosition: existingPosition,
              newPosition: sg.timeline_frame
            });
          }
          
          positions.set(imageKey, sg.timeline_frame);
          
          // [Position0Debug] Log position 0 items being added to positions map
          if (sg.timeline_frame === 0) {
            console.log(`[Position0Debug] ✅ Position 0 item added to positions map:`, {
              shotImageEntryId: imageKey?.substring(0, 8),
              timeline_frame: sg.timeline_frame,
              positionsMapSize: positions.size
            });
          }
        } else {
          // Initialize with max existing frame + 50 if no timeline_frame
          const maxFrame = Math.max(0, ...Array.from(positions.values()));
          
          const imageKey = matchingImage.shotImageEntryId ?? matchingImage.id;
          // [Position0Debug] Check if we're about to overwrite a position 0 item with fallback
          const existingPosition = positions.get(imageKey);
          if (existingPosition === 0) {
            console.log(`[Position0Debug] 🚨 OVERWRITING POSITION 0 WITH FALLBACK! Item ${imageKey?.substring(0, 8)} had position 0, now setting to ${maxFrame + 50}`, {
              shotGenerationId: sg.id.substring(0, 8),
              generationId: sg.generation_id?.substring(0, 8),
              oldPosition: existingPosition,
              newPosition: maxFrame + 50
            });
          }
          
          positions.set(imageKey, maxFrame + 50);
        }
      } else if (sg.timeline_frame === 0) {
        console.log(`[Position0Debug] ❌ No matching image found for position 0 shotGeneration:`, {
          shotGenerationId: sg.id.substring(0, 8),
          generationId: sg.generation_id?.substring(0, 8),
          timeline_frame: sg.timeline_frame
        });
      }
    });

    // 🎯 MOVEMENT TRACKING: Log database position updates
    if (positions.size > 0) {
      const prevPositions = prevStablePositionsRef.current;
      const dbChanges: Array<{id: string, oldPos: number, newPos: number}> = [];
      
      for (const [id, newPos] of positions) {
        const oldPos = prevPositions.get(id);
        if (oldPos !== undefined && oldPos !== newPos) {
        dbChanges.push({
          id: id.substring(0, 8), // Use first 8 chars to match drag system
          oldPos,
          newPos
        });
        }
      }
      
      if (dbChanges.length > 0) {
        dbChanges.forEach(change => {
          console.log(`[TIMELINE_TRACK] [DB_UPDATE] 🗄️ Item ${change.id} position updated from database: ${change.oldPos} → ${change.newPos} (Δ${change.newPos - change.oldPos})`);
        });
      }
      
      // Update reference for next comparison
      prevStablePositionsRef.current = new Map(positions);
    }

    timelineDebugger.logPositionState(shotId, positions, 'database');
    
    // [Position0Debug] Log final positions map before returning
    const position0InFinalMap = Array.from(positions.entries()).filter(([id, pos]) => pos === 0);
    console.log(`[Position0Debug] 🏁 Final framePositions map before return:`, {
      totalItems: positions.size,
      position0Items: position0InFinalMap.map(([id, pos]) => ({
        shotImageEntryId: id?.substring(0, 8),
        position: pos
      })),
      allPositions: Array.from(positions.entries()).map(([id, pos]) => ({
        shotImageEntryId: id?.substring(0, 8),
        position: pos
      })).sort((a, b) => a.position - b.position)
    });
    
    console.log(`[TimelineVisibility] ✅ framePositions CALCULATED:`, {
      shotId: shotId.substring(0, 8),
      positionsCount: positions.size,
      positions: Array.from(positions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        position: pos
      })).slice(0, 10), // First 10 items
      totalPositions: positions.size,
      timestamp: Date.now()
    });
    
    // Store in ref so event listener can access latest positions
    framePositionsRef.current = positions;
    
    return positions;
  }, [shotGenerations, images, frameSpacing, shotId, isLoading]);

  // SIMPLIFIED: Use stable positions during drag/persist, otherwise use fresh positions
  const displayPositions = useMemo(() => {
    let selectedPositions: Map<string, number>;
    let source: string;

    // PRIORITY 1: During drag operations, always use stable positions
    if (isDragInProgress && stablePositions.size > 0) {
      selectedPositions = stablePositions;
      source = 'stable (drag)';
    }
    // PRIORITY 2: During persist operations, use stable positions to prevent jumps
    else if (isPersistingPositions && stablePositions.size > 0) {
      selectedPositions = stablePositions;
      source = 'stable (persist)';
    }
    // PRIORITY 3: If loading and we have stable positions, use them for consistency
    else if (isLoading && stablePositions.size > 0) {
      selectedPositions = stablePositions;
      source = 'stable (loading)';
    }
    // DEFAULT: Use fresh database positions
    else {
      selectedPositions = framePositions;
      source = 'database';
    }

    // 🎯 MOVEMENT TRACKING: Log display position source changes
    console.log(`[TimelineVisibility] 🎨 displayPositions UPDATE:`, {
      shotId: shotId.substring(0, 8),
      source,
      positionsCount: selectedPositions.size,
      isDragInProgress,
      isPersistingPositions,
      isLoading,
      positions: Array.from(selectedPositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        position: pos
      })).slice(0, 10), // First 10 items
      timestamp: Date.now()
    });

    // [Position0Debug] Only log if there are position 0 items or if we're missing expected position 0 items
    const position0Items = Array.from(selectedPositions.entries()).filter(([id, pos]) => pos === 0);
    
    if (position0Items.length > 0) {
      console.log(`[Position0Debug] 📊 POSITION 0 FOUND in ${source}:`, {
        position0Items: position0Items.map(([id, pos]) => ({ id: id.substring(0, 8), position: pos }))
      });
    } else {
      // Check if we should have position 0 items but don't
      const allPositions = Array.from(selectedPositions.entries()).sort((a, b) => a[1] - b[1]);
      console.log(`[Position0Debug] 📊 NO POSITION 0 in ${source}:`, {
        totalItems: selectedPositions.size,
        minPosition: allPositions.length > 0 ? allPositions[0][1] : null,
        first3Items: allPositions.slice(0, 3).map(([id, pos]) => ({ id: id.substring(0, 8), position: pos }))
      });
    }

    return selectedPositions;
  }, [isDragInProgress, isPersistingPositions, isLoading, stablePositions, framePositions, shotId]);

  // Enhanced position change analysis
  const analyzePositionChanges = useCallback((
    newPositions: Map<string, number>,
    framePositions: Map<string, number>,
    displayPositions: Map<string, number>,
    stablePositions: Map<string, number>
  ): PositionChangeAnalysis => {
    const allChanges: Array<[string, any]> = [];
    const significantChanges: Array<[string, any]> = [];
    const filteredOut: Array<[string, any]> = [];

    for (const [id, newPos] of newPositions) {
      const dbPos = framePositions.get(id);
      const displayPos = displayPositions.get(id);
      const stablePos = stablePositions.get(id);

      const analysis = {
        id: id.substring(0, 8),
        newPos,
        dbPos,
        displayPos,
        stablePos,
        vsDatabase: newPos - (dbPos ?? 0),
        vsDisplay: newPos - (displayPos ?? 0),
        vsStable: newPos - (stablePos ?? 0),
        isSignificant: Math.abs(newPos - (dbPos ?? 0)) > 0.1,
        positionSources: {
          database: dbPos !== undefined ? 'PRESENT' : 'MISSING',
          display: displayPos !== undefined ? 'PRESENT' : 'MISSING',
          stable: stablePos !== undefined ? 'PRESENT' : 'MISSING'
        },
        syncStatus: {
          db_vs_display: dbPos === displayPos ? 'SYNCED' : 'OUT_OF_SYNC',
          db_vs_stable: dbPos === stablePos ? 'SYNCED' : 'OUT_OF_SYNC',
          display_vs_stable: displayPos === stablePos ? 'SYNCED' : 'OUT_OF_SYNC'
        }
      };

      allChanges.push([id, analysis]);

      if (analysis.isSignificant) {
        significantChanges.push([id, analysis]);
        timelineDebugger.logPositionChange('Significant change detected', {
          shotId,
          itemId: id.substring(0, 8),
          change: `${dbPos ?? 'null'} → ${newPos} (Δ${analysis.vsDatabase})`,
          vsDisplay: `${displayPos ?? 'null'} → ${newPos} (Δ${analysis.vsDisplay})`,
          vsStable: `${stablePos ?? 'null'} → ${newPos} (Δ${analysis.vsStable})`,
          syncStatus: analysis.syncStatus,
          reason: 'significant_change_vs_database'
        });
      } else {
        filteredOut.push([id, analysis]);
        timelineDebugger.logPositionChange('Filtered out insignificant change', {
          shotId,
          itemId: id.substring(0, 8),
          change: `${dbPos ?? 'null'} → ${newPos} (Δ${analysis.vsDatabase})`,
          reason: 'change_too_small_or_already_at_database_position',
          threshold: 0.1
        });
      }
    }

    return {
      totalAnalyzed: newPositions.size,
      significantChanges,
      filteredOut,
      allChanges,
      syncSummary: {
        db_vs_display_synced: allChanges.filter(([, a]) => a.syncStatus.db_vs_display === 'SYNCED').length,
        db_vs_display_out_of_sync: allChanges.filter(([, a]) => a.syncStatus.db_vs_display === 'OUT_OF_SYNC').length,
        total_out_of_sync: allChanges.filter(([, a]) =>
          a.syncStatus.db_vs_display === 'OUT_OF_SYNC' ||
          a.syncStatus.db_vs_stable === 'OUT_OF_SYNC' ||
          a.syncStatus.display_vs_stable === 'OUT_OF_SYNC'
        ).length
      }
    };
  }, [shotId]);

  // Main position update function
  const setFramePositions = useCallback(async (newPositions: Map<string, number>) => {
    timelineDebugger.logPositionUpdate('Setting positions', {
      shotId,
      count: newPositions.size
    });

    // 🛡️ DUPLICATE PREVENTION: Validate no duplicate timeline_frame values
    const positionCounts = new Map<number, string[]>();
    for (const [id, pos] of newPositions) {
      if (!positionCounts.has(pos)) {
        positionCounts.set(pos, []);
      }
      positionCounts.get(pos)!.push(id.substring(0, 8));
    }
    
    const duplicates = Array.from(positionCounts.entries())
      .filter(([pos, ids]) => ids.length > 1);
    
    if (duplicates.length > 0) {
      console.error(`[TimelineDragFlow] [DUPLICATE_PREVENTION] ❌ Session: ${(window as any).__CURRENT_DRAG_SESSION__ || 'no-session'} | Attempted to set duplicate timeline_frame values:`, 
        duplicates.map(([pos, ids]) => `${pos}: [${ids.join(', ')}]`).join(', '));
      
      // Auto-resolve duplicates before proceeding
      const resolvedPositions = new Map(newPositions);
      for (const [duplicatePos, duplicateIds] of duplicates) {
        for (let i = 1; i < duplicateIds.length; i++) {
          const fullId = Array.from(newPositions.keys()).find(id => id.substring(0, 8) === duplicateIds[i]);
          if (fullId) {
            let newPos = duplicatePos + i;
            while (Array.from(resolvedPositions.values()).includes(newPos)) {
              newPos++;
            }
            console.log(`[TimelineDragFlow] [DUPLICATE_RESOLUTION] 📍 Session: ${(window as any).__CURRENT_DRAG_SESSION__ || 'no-session'} | Auto-resolving: ${duplicateIds[i]} ${duplicatePos} → ${newPos}`);
            resolvedPositions.set(fullId, newPos);
          }
        }
      }
      newPositions = resolvedPositions;
      
      console.log(`[TimelineDragFlow] [DUPLICATE_RESOLUTION_COMPLETE] ✅ Session: ${(window as any).__CURRENT_DRAG_SESSION__ || 'no-session'} | Resolved all duplicates, proceeding with ${newPositions.size} unique positions`);
    }

    // Find what actually changed
    const positionChanges: Array<{id: string, oldPos: number, newPos: number}> = [];
    
    for (const [id, newPos] of newPositions) {
      const currentPos = framePositions.get(id);
      if (currentPos !== newPos) {
        positionChanges.push({
          id: id.substring(0, 8), // Use first 8 chars to match drag system
          oldPos: currentPos ?? 0,
          newPos
        });
      }
    }

    if (positionChanges.length === 0) {
      timelineDebugger.logPositionUpdate('No changes needed', { shotId });
      return;
    }

    // 🎯 MOVEMENT TRACKING: Log every position change
    positionChanges.forEach(change => {
      console.log(`[TIMELINE_TRACK] [ITEM_MOVE] 📍 Item ${change.id} moved: ${change.oldPos} → ${change.newPos} (Δ${change.newPos - change.oldPos})`);
    });
    
    // 🎯 DEBUG: Log the full ID mapping to check for ID confusion
    if (positionChanges.length > 0) {
      console.log(`[TIMELINE_TRACK] [ID_MAPPING] 🔍 Full ID mapping for moved items:`, 
        positionChanges.map(change => {
          const fullId = Array.from(newPositions.keys()).find(id => id.substring(0, 8) === change.id);
          return `${change.id} → ${fullId}`;
        }).join(', '));
    }

    timelineDebugger.logPositionUpdate('Position changes detected', {
      shotId,
      changes: positionChanges.map(c => `${c.id}:${c.oldPos}→${c.newPos}`)
    });

    // 🔒 POSITION LOCK: Lock positions to prevent race conditions
    positionLockRef.current = {
      isLocked: true,
      lockedPositions: new Map(newPositions),
      lockTimestamp: Date.now()
    };
    console.log(`[TIMELINE_TRACK] [POSITION_LOCK] 🔒 Positions locked to prevent race conditions`);

    // Update UI immediately for smooth experience
    setStablePositions(new Map(newPositions), 'position-update');
    setIsPersistingPositions(true);

    try {
      // Update each changed position
      for (const change of positionChanges) {
        const matchingImage = images.find(img => {
          const imageKey = img.shotImageEntryId ?? img.id;
          return imageKey?.endsWith(change.id) || imageKey?.substring(0, 8) === change.id;
        });

        if (matchingImage && updateTimelineFrame) {
          const imageKey = matchingImage.shotImageEntryId ?? matchingImage.id;
          // Find the shot_generation.id that corresponds to this change
          const shotGeneration = shotGenerations.find(sg => 
            sg.generation_id === matchingImage.id || 
            imageKey === sg.id ||
            imageKey?.endsWith(change.id) ||
            sg.id.substring(0, 8) === change.id
          );
          
          if (shotGeneration) {
            timelineDebugger.logPositionUpdate(`Updating ${change.id}`, {
              shotId,
              shotGenerationId: shotGeneration.id.substring(0, 8),
              from: change.oldPos,
              to: change.newPos
            });
            
            await updateTimelineFrame(shotGeneration.id, change.newPos, {
              user_positioned: true,
              drag_source: 'timeline_drag',
              drag_session_id: (window as any).__CURRENT_DRAG_SESSION__ || 'unknown'
            });
          } else {
            console.error(`[TimelineDragFlow] [MAPPING_ERROR] ❌ Could not find shot_generation for change.id: ${change.id}, matchingImage.id: ${matchingImage.id}`);
          }
        }
      }

      timelineDebugger.logPositionUpdate('Updates completed', { shotId });

    } catch (error) {
      timelineDebugger.logPositionError('Update failed', { shotId, error });
      setStablePositions(displayPositions, 'error-reset');
      toast.error('Failed to update timeline positions');
      throw error;
    } finally {
      // Unlock positions after database operations complete
      setTimeout(() => {
        // 🔓 POSITION UNLOCK: Release the position lock
        positionLockRef.current.isLocked = false;
        console.log(`[TIMELINE_TRACK] [POSITION_UNLOCK] 🔓 Positions unlocked after database update completed`);
        
        setIsPersistingPositions(false);
        timelineDebugger.logPositionUpdate('Position persistence completed - invalidations now allowed', {
          shotId,
          delay: 250,
          reason: 'Prevents jump-back from stale cache data'
        });
        
        // CRITICAL: Clear stable positions after persist is complete to allow fresh positions
        // This prevents stale stable positions from being used indefinitely after multiple moves
        setTimeout(() => {
          _setStablePositions(new Map());
          timelineDebugger.logPositionUpdate('Stable positions cleared - switching to fresh database positions', {
            shotId,
            reason: 'prevent_stale_positions_after_persist'
          });
        }, 100);
      }, 500); // Increased to 500ms for more robust protection
    }

    timelineDebugger.logPositionUpdate('Operation completed', { shotId });

    // Call the original callback if provided
    if (onFramePositionsChange) {
      onFramePositionsChange(newPositions);
    }
  }, [
    shotId,
    framePositions,
    images,
    updateTimelineFrame,
    onFramePositionsChange,
    setStablePositions,
    setIsPersistingPositions,
    displayPositions
  ]);

  // Simplified position monitoring - only log when there are actual issues
  useEffect(() => {
    // Only check for major issues, not every state change
    if (shotGenerations.length === 0 || images.length === 0) return;

    // Only log if there are sync issues (reduced frequency)
    const db_vs_frame_synced = shotGenerations.every(sg =>
      framePositions.get(sg.generation_id) === sg.timeline_frame
    );

    if (!db_vs_frame_synced) {
      console.warn('[Timeline] Position sync issue detected', { shotId });
    }
  }, [shotGenerations, framePositions, shotId]);

  // Remove database trigger inspection - not needed in production

  return {
    framePositions,
    displayPositions,
    stablePositions,
    setStablePositions,
    setFramePositions,
    analyzePositionChanges
  };
}

export type { PositionChangeAnalysis };
