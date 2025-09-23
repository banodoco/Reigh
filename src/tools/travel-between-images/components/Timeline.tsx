import React, { useState, useEffect, useRef, useCallback } from "react";
import { GenerationRow } from "@/types/shots";
import { toast } from "sonner";
import MediaLightbox from "@/shared/components/MediaLightbox";
import { useIsMobile } from "@/shared/hooks/use-mobile";

// Clear legacy timeline cache on import
import "@/utils/clearTimelineCache";

// Import hooks
import { useZoom } from "./Timeline/hooks/useZoom";
import { useFileDrop } from "./Timeline/hooks/useFileDrop";
import { useTimelineDrag } from "./Timeline/hooks/useTimelineDrag";
// Import our database-backed position management
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";

// Import components
import TimelineControls from "./Timeline/TimelineControls";
import TimelineRuler from "./Timeline/TimelineRuler";
import DropIndicator from "./Timeline/DropIndicator";
import PairRegion from "./Timeline/PairRegion";
import TimelineItem from "./Timeline/TimelineItem";

// Import utils
import { 
  getTimelineDimensions, 
  calculateMaxGap, 
  getPairInfo 
} from "./Timeline/utils/timeline-utils";

// Main Timeline component props
export interface TimelineProps {
  shotId: string;
  frameSpacing: number;
  contextFrames: number;
  onImageReorder: (orderedIds: string[]) => void;
  onImageSaved: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>;
  onContextFramesChange: (context: number) => void;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
  onImageDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  pendingPositions?: Map<string, number>;
  onPendingPositionApplied?: (generationId: string) => void;
  // Shared data props to prevent hook re-instantiation
  shotGenerations?: import("@/shared/hooks/useEnhancedShotPositions").ShotGeneration[];
  updateTimelineFrame?: (generationId: string, frame: number) => Promise<void>;
  images?: GenerationRow[];
  // Callback to reload parent data after timeline changes
  onTimelineChange?: () => Promise<void>;
  // Shared hook data to prevent creating duplicate hook instances
  hookData?: import("@/shared/hooks/useEnhancedShotPositions").UseEnhancedShotPositionsReturn;
  // Pair-specific prompt editing
  onPairClick?: (pairIndex: number, pairData: {
    index: number;
    frames: number;
    startFrame: number;
    endFrame: number;
    startImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      timeline_frame: number;
      position: number;
    } | null;
    endImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      timeline_frame: number;
      position: number;
    } | null;
  }) => void;
  // Pair prompt data for display (optional - will use database if not provided)
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  // Action handlers
  onImageDelete: (imageId: string) => void;
  onImageDuplicate: (imageId: string, timeline_frame: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  projectAspectRatio?: string;
}

/**
 * Refactored Timeline component with hooks and smaller components
 */
const Timeline: React.FC<TimelineProps> = ({
  shotId,
  frameSpacing,
  contextFrames,
  onImageReorder,
  onImageSaved,
  onContextFramesChange,
  onFramePositionsChange,
  onImageDrop,
  pendingPositions,
  onPendingPositionApplied,
  // Shared data props
  shotGenerations: propShotGenerations,
  updateTimelineFrame: propUpdateTimelineFrame,
  images: propImages,
  onTimelineChange,
  hookData: propHookData,
  onPairClick,
  pairPrompts,
  defaultPrompt,
  defaultNegativePrompt,
  onImageDelete,
  onImageDuplicate,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio
}) => {
  // State to track context visibility with delay
  const [showContext, setShowContext] = useState(false);
  const contextTimerRef = useRef<NodeJS.Timeout | null>(null);


  // Enhanced Timeline performance tracking with prop change detection
  const renderCountRef = React.useRef(0);
  const prevPropsRef = React.useRef<any>();

  React.useEffect(() => {
    renderCountRef.current++;
    const currentProps = {
      shotId,
      frameSpacing,
      contextFrames,
      propShotGenerations: propShotGenerations ? propShotGenerations.length : null,
      propUpdateTimelineFrame: !!propUpdateTimelineFrame,
      propImages: propImages ? propImages.length : null
    };
    
    const prevProps = prevPropsRef.current;
    // Only log the first few renders to debug mount issues
    if (renderCountRef.current <= 5) {
      console.log('[PositionSystemDebug] 🔄 TIMELINE RENDER #' + renderCountRef.current, {
        ...currentProps,
        // Prop change analysis (only show if previous props exist)
        ...(prevProps ? {
          shotIdChanged: shotId !== prevProps.shotId,
          frameSpacingChanged: frameSpacing !== prevProps.frameSpacing,
          contextFramesChanged: contextFrames !== prevProps.contextFrames,
          propShotGenerationsChanged: propShotGenerations !== prevProps.propShotGenerations,
          propUpdateTimelineFrameChanged: propUpdateTimelineFrame !== prevProps.propUpdateTimelineFrame,
          propImagesChanged: propImages !== prevProps.propImages,
          // Reference equality checks
          propShotGenerationsRef: propShotGenerations === prevProps.propShotGenerations ? 'SAME' : 'DIFFERENT',
          propImagesRef: propImages === prevProps.propImages ? 'SAME' : 'DIFFERENT'
        } : { firstRender: true })
      });
    }
    
    prevPropsRef.current = currentProps;
  });
  // Core state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isPersistingPositions, setIsPersistingPositions] = useState<boolean>(false);
  const [isDragInProgress, setIsDragInProgress] = useState<boolean>(false);

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialContextFrames = useRef(contextFrames);

  // Use shared hook data if provided, otherwise create new instance (for backward compatibility)
  const hookData = propHookData || useEnhancedShotPositions(shotId, isDragInProgress);
  const shotGenerations = propShotGenerations || hookData.shotGenerations;
  const updateTimelineFrame = propUpdateTimelineFrame || hookData.updateTimelineFrame;
  const batchExchangePositions = hookData.batchExchangePositions; // Always use hook for exchanges
  const initializeTimelineFrames = hookData.initializeTimelineFrames;

  // Track previous positions to detect unexpected changes
  const prevStablePositionsRef = useRef<Map<string, number>>(new Map());


  // DISABLED: Cache clear events were causing timeline position resets
  // The cache cleanup was triggering data reloads that override user drag positions
  //
  // // Listen for cache clear events and force reload
  // useEffect(() => {
  //   const handleCacheCleared = () => {
  //     console.log('[Timeline] Cache cleared event received - forcing data reload');
  //     hookData.loadPositions({ reason: 'invalidation' });
  //   };
  //
  //   window.addEventListener('timeline-cache-cleared', handleCacheCleared);
  //   return () => window.removeEventListener('timeline-cache-cleared', handleCacheCleared);
  // }, [hookData.loadPositions]);
  
  // Get pair prompts from database instead of props (now reactive)
  const databasePairPrompts = hookData.pairPrompts;
  const actualPairPrompts = pairPrompts || databasePairPrompts; // Fallback to props for backward compatibility
  const isLoading = propShotGenerations ? false : hookData.isLoading; // If props provided, never show loading (shared data)
  
  // Important: If using shared data, we need to ensure parent reloads when we make changes
  const parentLoadPositions = propShotGenerations ? hookData.loadPositions : null;
  
  // Use provided images or generate from shotGenerations
  const images = React.useMemo(() => {
    if (propImages) return propImages;
    
    const imagesWithPositions = shotGenerations
      .filter(sg => sg.generation)
      .map(sg => ({
        id: sg.generation_id,
        shotImageEntryId: sg.id,
        imageUrl: sg.generation?.location,
        thumbUrl: sg.generation?.location,
        location: sg.generation?.location,
        type: sg.generation?.type,
        createdAt: sg.generation?.created_at,
        timeline_frame: sg.timeline_frame,
        metadata: sg.metadata
      } as GenerationRow & { timeline_frame?: number }));

    // Sort by timeline_frame only (no position fallback needed)
    return imagesWithPositions.sort((a, b) => {
      const frameA = a.timeline_frame ?? 0;
      const frameB = b.timeline_frame ?? 0;
      return frameA - frameB;
    });
  }, [shotGenerations, frameSpacing, propImages]);
  
  // Convert database timeline_frame values to Timeline-compatible Map
  // Keep previous positions during loading to prevent flicker
  const [stablePositions, _setStablePositions] = React.useState<Map<string, number>>(new Map());
  
  // Controlled setStablePositions wrapper to prevent unwanted resets
  const setStablePositions = React.useCallback((newPositions: Map<string, number>, reason?: string) => {
    const stack = new Error().stack;
    const isFromDragOperation = stack?.includes('setFramePositions') || stack?.includes('handleMouseUp') || reason;
    
    console.log('[TimelineDragFix] 🎯 setStablePositions WRAPPER CALLED:', {
      shotId: shotId ? shotId.substring(0, 8) : 'undefined',
      reason: reason || 'unknown',
      isFromDragOperation,
      positionsCount: newPositions.size,
      positions: Array.from(newPositions.entries()).map(([id, pos]) => `${id.substring(0, 8)}:${pos}`).join(', '),
      stackSnippet: stack?.split('\n').slice(1, 4).join(' → ')
    });
    
    if (isFromDragOperation || reason) {
      console.log('[TimelineDragFix] ✅ ALLOWING setStablePositions:', reason || 'drag operation');
      _setStablePositions(newPositions);
    } else {
      console.log('[TimelineDragFix] 🚫 BLOCKING unwanted setStablePositions call');
    }
  }, [shotId]);


  // Detect unexpected position changes
  useEffect(() => {
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
        console.log('[TimelineResetDebug] 🚨 UNEXPECTED POSITION CHANGE DETECTED:', {
          shotId: shotId ? shotId.substring(0, 8) : 'undefined',
          changes: changes.join(', '),
          timestamp: new Date().toISOString(),
          warning: 'This indicates positions are being reset by something other than drag operations'
        });
      }
    }

    // Update previous positions
    prevStablePositionsRef.current = new Map(stablePositions);
  }, [stablePositions, shotId]);

  // Track dependency changes with refs
  const prevDepsRef = React.useRef<{
    shotGenerations: any;
    images: any;
    frameSpacing: number;
    shotId: string;
  }>();

  // [TimelineJumpDebug] Track what's causing repeated framePositions recalculations
  const framePositionsRenderCount = React.useRef(0);

  const framePositions = React.useMemo(() => {
    framePositionsRenderCount.current++;
    const currentDeps = { shotGenerations, images, frameSpacing, shotId };
    const prevDeps = prevDepsRef.current;
    
    console.log('[PositionSystemDebug] 🔄 RECALCULATING framePositions useMemo:', {
      shotId: shotId ? shotId.substring(0, 8) : 'undefined',
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
      imagesRef: images === prevDeps?.images ? 'SAME_REF' : 'DIFF_REF'
    });

    // [TimelineJumpDebug] Track repeated recalculations
    console.log('[TimelineJumpDebug] 🔢 FRAMEPOSITIONS RECALC COUNT:', {
      shotId: shotId ? shotId.substring(0, 8) : 'undefined',
      recalcCount: framePositionsRenderCount.current,
      trigger: prevDeps ? {
        shotGenerationsChanged: shotGenerations !== prevDeps.shotGenerations,
        imagesChanged: images !== prevDeps.images,
        frameSpacingChanged: frameSpacing !== prevDeps.frameSpacing,
        shotIdChanged: shotId !== prevDeps.shotId
      } : { firstRender: true },
      timestamp: new Date().toISOString()
    });
    
    prevDepsRef.current = currentDeps;
    
    const positions = new Map<string, number>();
    
    shotGenerations.forEach(sg => {
      const matchingImage = images.find(img => img.id === sg.generation_id);
      if (matchingImage) {
        if (sg.timeline_frame !== null && sg.timeline_frame !== undefined) {
          positions.set(matchingImage.shotImageEntryId, sg.timeline_frame);
        } else {
          // Initialize with max existing frame + 50 if no timeline_frame
          const maxFrame = Math.max(0, ...Array.from(positions.values()));
          positions.set(matchingImage.shotImageEntryId, maxFrame + 50);
        }
      }
    });

    console.log('[PositionSystemDebug] 📊 TIMELINE frame positions from database:', {
      shotId: shotId.substring(0, 8),
      positionsCount: positions.size,
      positions: Array.from(positions.entries()).map(([id, frame]) => ({
        id: id.substring(0, 8),
        frame
      })),
      isLoading
    });
    
    return positions;
  }, [shotGenerations, images, frameSpacing, shotId]);



  // Use stable positions during loading or drag operations to prevent flicker
  const displayPositions = React.useMemo(() => {
    // [TimelineResetDebug] CRITICAL: Track when displayPositions changes after drag
    const callStack = new Error().stack;
    const isAfterDrag = callStack?.includes('handleMouseUp') || callStack?.includes('dragState');
    const stackLines = callStack?.split('\n').slice(0, 10).join('\n') || 'No stack';

    // Only log if this is happening frequently or after drag
    const shouldLog = isAfterDrag || stablePositions.size > 0;

    if (shouldLog) {
      console.log('[TimelineResetDebug] 🔄 DISPLAY POSITIONS RECALCULATING:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        isAfterDrag,
        isLoading,
        isDragInProgress,
        stackTrace: stackLines,
        timestamp: new Date().toISOString(),
        stablePositionsSize: stablePositions.size,
        framePositionsSize: framePositions.size,
        isPersistingPositions,
        willUseStable: (isLoading && stablePositions.size > 0) ||
                       (stablePositions.size > 0 && framePositions.size === 0) ||
                       (isPersistingPositions && stablePositions.size > 0) ||
                       (isDragInProgress && stablePositions.size > 0),
        stablePositionsData: Array.from(stablePositions.entries()).map(([id, pos]) =>
          `${id.substring(0, 8)}:${pos}`).join(', '),
        framePositionsData: Array.from(framePositions.entries()).map(([id, pos]) =>
          `${id.substring(0, 8)}:${pos}`).join(', ')
      });
    }

    // [TimelineJumpDebug] Log every displayPositions recalculation with triggers
    const triggers = {
      isLoadingChanged: 'unknown', // We'd need prev state to compare
      stablePositionsChanged: 'unknown', // We'd need prev state to compare
      framePositionsChanged: 'unknown', // We'd need prev state to compare
      isPersistingPositionsChanged: 'unknown', // We'd need prev state to compare
      isDragInProgressChanged: 'unknown' // We'd need prev state to compare
    };

    console.log('[TimelineJumpDebug] 🎯 DISPLAY POSITIONS RECALC TRIGGER:', {
      shotId: shotId.substring(0, 8),
      isLoading,
      isDragInProgress,
      stablePositionsSize: stablePositions.size,
      framePositionsSize: framePositions.size,
      isPersistingPositions,
      triggers,
      timestamp: new Date().toISOString()
    });

    // Use stable positions if we have them and we're loading, persisting, or during drag
    const useStable = (isLoading && stablePositions.size > 0) ||
                     (stablePositions.size > 0 && framePositions.size === 0) ||
                     (isPersistingPositions && stablePositions.size > 0) ||
                     (isDragInProgress && stablePositions.size > 0);

    if (useStable) {
      console.log('[PositionSystemDebug] ⏳ TIMELINE keeping stable positions:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        stableCount: stablePositions.size,
        freshCount: framePositions.size,
        isLoading,
        isDragInProgress,
        reason: isLoading ? 'loading' : isDragInProgress ? 'drag_in_progress' : 'fresh_positions_empty'
      });
      console.log('[TimelineJumpDebug] 📍 DISPLAY POSITIONS - Using Stable:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        positions: Array.from(stablePositions.entries()).map(([id, pos]) => ({
          id: id.substring(0, 8),
          position: pos
        })),
        reason: useStable ? 'stable_fallback' : 'fresh_available',
        timestamp: new Date().toISOString()
      });
      return stablePositions;
    }

    // If fresh positions are available and different from stable, use fresh
    if (framePositions.size > 0) {
      console.log('[PositionSystemDebug] 🔄 TIMELINE using fresh positions:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        freshCount: framePositions.size,
        isLoading
      });
      console.log('[TimelineJumpDebug] 📍 DISPLAY POSITIONS - Using Fresh:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        positions: Array.from(framePositions.entries()).map(([id, pos]) => ({
          id: id.substring(0, 8),
          position: pos
        })),
        reason: 'fresh_available',
        timestamp: new Date().toISOString()
      });
    }

    return framePositions;
  }, [isLoading, isPersistingPositions, isDragInProgress, stablePositions, framePositions, shotId]);

  // Atomic database-backed setFramePositions function using new RPC
  const setFramePositions = React.useCallback(async (newPositions: Map<string, number>) => {
    // [DragPositionReset] Track which system is calling setFramePositions
    const callStack = new Error().stack;
    const isDragCall = callStack?.includes('useTimelineDrag');
    const isBatchCall = callStack?.includes('batchExchange') || callStack?.includes('handleReorder');

    const callSource = isDragCall ? 'TIMELINE_DRAG' : isBatchCall ? 'BATCH_REORDER' : 'UNKNOWN';
    console.log(`[TimelineDragFix] 🎯 setFramePositions CALLED FROM: ${callSource} (${newPositions.size} positions) - ${shotId.substring(0, 8)}`);

    // Set drag in progress flag to prevent query invalidation reloads
    if (isDragCall) {
      console.log('[TimelineDragFix] 🎯 Setting isDragInProgress = true to prevent position resets');
      setIsDragInProgress(true);
    }

    let dragCallForFinally = isDragCall;

    console.log('[TimelineMoveFlow] 🎯 TIMELINE setFramePositions CALLED - Processing position update:', {
      shotId: shotId.substring(0, 8),
      positionsCount: newPositions.size,
      positions: Array.from(newPositions.entries()).map(([id, frame]) => ({
        id: id.substring(0, 8),
        frame
      })),
      stackTrace: new Error().stack?.split('\n').slice(1, 5),
      timestamp: new Date().toISOString()
    });
    
    console.log('[PositionResetDebug] 🎯 TIMELINE setFramePositions CALLED (ATOMIC):', {
      shotId: shotId.substring(0, 8),
      positionsCount: newPositions.size,
      positions: Array.from(newPositions.entries()).map(([id, frame]) => ({
        id: id.substring(0, 8),
        frame
      })),
      stackTrace: new Error().stack?.split('\n').slice(1, 5),
      timestamp: new Date().toISOString()
    });

    // [TimelineJumpDebug] Check for duplicate frames in the incoming positions
    const incomingFrames = Array.from(newPositions.values());
    const uniqueIncomingFrames = new Set(incomingFrames);
    if (incomingFrames.length !== uniqueIncomingFrames.size) {
      console.error('[TimelineJumpDebug] ❌ DUPLICATE FRAMES IN INCOMING POSITIONS:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        allFrames: incomingFrames,
        uniqueFrames: [...uniqueIncomingFrames],
        duplicates: incomingFrames.filter((frame, index) => incomingFrames.indexOf(frame) !== index),
        positionsDetail: Array.from(newPositions.entries()).map(([id, frame]) => ({
          id: id.substring(0, 8),
          frame
        })),
        timestamp: new Date().toISOString()
      });
    }

    // [TimelineItemMoveSummary] Check if this update might be causing cascading issues
    const updateSource = new Error().stack?.includes('useTimelineDrag') ? 'drag' : 'programmatic';
    console.log('[TimelineItemMoveSummary] Position update source:', {
      source: updateSource,
      shotId: shotId.substring(0, 8),
      timestamp: new Date().toISOString()
    });

    // Calculate what actually changed
    const positionChanges = [...newPositions.entries()]
      .filter(([id, newPos]) => {
        const currentPos = displayPositions.get(id);
        const isActualChange = currentPos !== newPos;
        
        // [TimelineJumpDebug] Log items that are being filtered out as no-change
        if (!isActualChange) {
          console.log('[TimelineJumpDebug] 🚫 FILTERING OUT NO-CHANGE ITEM:', {
            shotId: shotId ? shotId.substring(0, 8) : 'undefined',
            itemId: id.substring(0, 8),
            currentPos,
            requestedPos: newPos,
            reason: 'already_at_target_position',
            timestamp: new Date().toISOString()
          });
        }
        
        return isActualChange;
      })
      .map(([id, newPos]) => {
        const currentPos = displayPositions.get(id) ?? 0;
        const imageIndex = images.findIndex(img => img.shotImageEntryId === id);
        return {
          id: id.slice(-8),
          imageIdx: imageIndex,
          oldPos: currentPos,
          newPos,
          delta: newPos - currentPos
        };
      });

    // [TimelineJumpDebug] Log the filtering results
    console.log('[TimelineJumpDebug] 📊 POSITION CHANGE FILTERING RESULTS:', {
      shotId: shotId.substring(0, 8),
      totalIncoming: newPositions.size,
      actualChanges: positionChanges.length,
      filteredOut: newPositions.size - positionChanges.length,
      timestamp: new Date().toISOString()
    });

    // [DragBoundaryDebug] Analyze drag direction and boundary conditions
    if (positionChanges.length > 0) {
      const dragDirections = positionChanges.map(change => ({
        id: change.id,
        direction: change.delta > 0 ? 'RIGHT' : change.delta < 0 ? 'LEFT' : 'NO_MOVE',
        magnitude: Math.abs(change.delta),
        atBoundary: change.newPos <= fullMin || change.newPos >= fullMax
      }));

      const hasLeftMovement = dragDirections.some(d => d.direction === 'LEFT');
      const hasRightMovement = dragDirections.some(d => d.direction === 'RIGHT');
      const hasBoundaryHits = dragDirections.some(d => d.atBoundary);

      console.log('[DragBoundaryDebug] 🎯 DRAG DIRECTION ANALYSIS:', {
        shotId: shotId.substring(0, 8),
        totalChanges: positionChanges.length,
        directions: dragDirections,
        summary: {
          hasLeftMovement,
          hasRightMovement,
          hasBoundaryHits,
          primaryDirection: hasLeftMovement && !hasRightMovement ? 'LEFT_DOMINANT' :
                           hasRightMovement && !hasLeftMovement ? 'RIGHT_DOMINANT' :
                           'MIXED_DIRECTION'
        },
        boundaryContext: {
          fullMin,
          fullMax,
          fullRange,
          maxAllowedGap
        },
        timestamp: new Date().toISOString()
      });

      // [DragBoundaryDebug] Track asymmetric behavior patterns
      const leftBoundaryHits = dragDirections.filter(d => d.direction === 'LEFT' && d.atBoundary);
      const rightBoundaryHits = dragDirections.filter(d => d.direction === 'RIGHT' && d.atBoundary);

      if (hasBoundaryHits) {
        console.log('[DragBoundaryDebug] 🚨 BOUNDARY HIT DETECTED:', {
          shotId: shotId.substring(0, 8),
          leftBoundaryHits: leftBoundaryHits.map(h => ({
            id: h.id,
            magnitude: h.magnitude,
            position: positionChanges.find(c => c.id === h.id)?.newPos
          })),
          rightBoundaryHits: rightBoundaryHits.map(h => ({
            id: h.id,
            magnitude: h.magnitude,
            position: positionChanges.find(c => c.id === h.id)?.newPos
          })),
          asymmetricPattern: leftBoundaryHits.length !== rightBoundaryHits.length ? 'ASYMMETRIC' : 'SYMMETRIC',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Log the move summary for debugging
    if (positionChanges.length > 0) {
      const positionsBefore = [...displayPositions.entries()]
        .sort(([, a], [, b]) => a - b)
        .map(([id, pos]) => {
          const imageIndex = images.findIndex(img => img.shotImageEntryId === id);
          return {
            id: id.slice(-8),
            imageIdx: imageIndex,
            frame: pos
          };
        });

      const positionsAfter = [...newPositions.entries()]
        .sort(([, a], [, b]) => a - b)
        .map(([id, pos]) => {
          const imageIndex = images.findIndex(img => img.shotImageEntryId === id);
          return {
            id: id.slice(-8),
            imageIdx: imageIndex,
            frame: pos
          };
        });

      console.log('[TimelineItemMoveSummary] Timeline atomic move initiated', {
        moveType: 'atomic_rpc',
        positionsBefore,
        positionsAfter,
        changes: {
          totalChanges: positionChanges.length,
          positionChanges
        },
        metadata: {
          shotId: shotId ? shotId.substring(0, 8) : 'undefined',
          totalImages: images.length,
          timestamp: new Date().toISOString()
        }
      });
    }

      // 🚨 IMMEDIATE DEBUG: Check if drag operation is working at all
      console.log('[TimelineDragFix] 🎯 DRAG OPERATION STARTED - position changes detected:', {
        positionChangesCount: positionChanges.length,
        positionChanges: positionChanges.map(c => `${c.id}:${c.oldPos}→${c.newPos}`),
        timestamp: new Date().toISOString()
      });

      // IMMEDIATELY update stable positions to prevent visual glitches during database update
      console.log('[TimelineDragFix] 🎯 setStablePositions CALL #1 - setFramePositions optimistic update');
      setStablePositions(new Map(newPositions), 'drag-optimistic-update');
      setIsPersistingPositions(true);
      console.log('[PositionSystemDebug] 🎭 TIMELINE immediately updated stable positions for smooth transition');

    // 🚨 CRITICAL: Check if drag operation is reaching this point at all
    console.log('[TimelineDragFix] ⚠️ DRAG OPERATION TRIGGERED - checking if database update will be attempted:', {
      shotId: shotId ? shotId.substring(0, 8) : 'undefined',
      positionChangesCount: positionChanges.length,
      updateTimelineFrameAvailable: !!updateTimelineFrame,
      timestamp: new Date().toISOString()
    });
    console.log('[TimelineJumpDebug] 🎭 STABLE POSITIONS UPDATED (pre-database):', {
      shotId: shotId.substring(0, 8),
      newStablePositions: Array.from(newPositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        position: pos
      })),
      timestamp: new Date().toISOString()
    });

      // DEBUG: Check if we're reaching the database update code
      console.log('[TimelineDragFix] 🔍 DRAG OPERATION REACHED DATABASE UPDATE ATTEMPT:', {
        positionChangesCount: positionChanges.length,
        positionChanges: positionChanges.map(c => `${c.id}:${c.oldPos}→${c.newPos}`),
        isPersistingPositions,
        updateTimelineFrame: !!updateTimelineFrame,
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        images: images.map(img => img.shotImageEntryId.substring(0, 8)),
        timestamp: new Date().toISOString()
      });

      // IMMEDIATE DEBUG: Check if the issue is the positionChanges.length === 0 check
      if (positionChanges.length === 0) {
        console.log('[TimelineDragFix] 🚨 POSITION CHANGES IS EMPTY - THIS IS THE ISSUE:', {
          positionChanges,
          stablePositionsSize: stablePositions.size,
          framePositionsSize: framePositions.size,
          timestamp: new Date().toISOString()
        });
      }

      // Only proceed if there are actual changes
      if (positionChanges.length === 0) {
        setIsPersistingPositions(false);
        console.log('[PositionSystemDebug] ✅ No changes needed - positions already match');
        return;
      }

      // [DragBoundaryDebug] Pre-database update boundary analysis
      console.log('[DragBoundaryDebug] 🎯 PRE-UPDATE BOUNDARY ANALYSIS:', {
        shotId: shotId.substring(0, 8),
        positionChanges: positionChanges.map(c => ({
          id: c.id,
          oldPos: c.oldPos,
          newPos: c.newPos,
          delta: c.delta,
          direction: c.delta > 0 ? 'RIGHT' : c.delta < 0 ? 'LEFT' : 'STATIONARY',
          boundaryHit: c.newPos <= fullMin || c.newPos >= fullMax,
          boundaryType: c.newPos <= fullMin ? 'LEFT_EDGE' : c.newPos >= fullMax ? 'RIGHT_EDGE' : 'MIDDLE'
        })),
        boundaryContext: {
          fullMin,
          fullMax,
          fullRange,
          totalImages: images.length,
          maxAllowedGap
        },
        analysis: {
          leftEdgeHits: positionChanges.filter(c => c.newPos <= fullMin).length,
          rightEdgeHits: positionChanges.filter(c => c.newPos >= fullMax).length,
          middleChanges: positionChanges.filter(c => c.newPos > fullMin && c.newPos < fullMax).length,
          dominantDirection: positionChanges.every(c => c.delta > 0) ? 'ALL_RIGHT' :
                           positionChanges.every(c => c.delta < 0) ? 'ALL_LEFT' :
                           'MIXED',
          asymmetricPattern: positionChanges.filter(c => c.newPos <= fullMin).length !==
                           positionChanges.filter(c => c.newPos >= fullMax).length ? 'ASYMMETRIC' : 'SYMMETRIC'
        },
        timestamp: new Date().toISOString()
      });

    // DEBUG: Log the state before database update
    console.log('[TimelineDragFix] 🔍 PRE-UPDATE STATE CHECK:', {
      positionChangesCount: positionChanges.length,
      positionChanges: positionChanges.map(c => `${c.id}:${c.oldPos}→${c.newPos}`),
      imagesCount: images.length,
      updateTimelineFrameAvailable: !!updateTimelineFrame,
      shotId: shotId ? shotId.substring(0, 8) : 'undefined',
      timestamp: new Date().toISOString()
    });

    try {
      // Use updateTimelineFrame for arbitrary positioning (not exchange/batch operations)
      console.log(`[TimelineDragFix] 🚀 USING updateTimelineFrame for arbitrary positioning - ${shotId ? shotId.substring(0, 8) : 'undefined'} - ${positionChanges.length} changes`);
      console.log(`[TimelineDragFix] 📋 CHANGES: ${positionChanges.map(c => `${c.id}:${c.oldPos}→${c.newPos}`).join(', ')}`);
      console.log(`[TimelineDragFix] 📊 DRAG STATE:`, {
        positionChanges,
        imagesCount: images.length,
        updateTimelineFrame: !!updateTimelineFrame,
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        timestamp: new Date().toISOString()
      });

      // Process each position change individually using updateTimelineFrame
      for (const change of positionChanges) {
        // [DragBoundaryDebug] Individual change boundary analysis
        console.log('[DragBoundaryDebug] 🔄 PROCESSING INDIVIDUAL CHANGE:', {
          shotId: shotId.substring(0, 8),
          changeId: change.id,
          changeDetails: {
            oldPos: change.oldPos,
            newPos: change.newPos,
            delta: change.delta,
            direction: change.delta > 0 ? 'RIGHT' : change.delta < 0 ? 'LEFT' : 'STATIONARY',
            boundaryHit: change.newPos <= fullMin || change.newPos >= fullMax,
            boundaryType: change.newPos <= fullMin ? 'LEFT_EDGE' : change.newPos >= fullMax ? 'RIGHT_EDGE' : 'MIDDLE',
            magnitude: Math.abs(change.delta)
          },
          boundaryContext: {
            fullMin,
            fullMax,
            isAtLeftEdge: change.newPos <= fullMin,
            isAtRightEdge: change.newPos >= fullMax,
            distanceFromLeftEdge: change.newPos - fullMin,
            distanceFromRightEdge: fullMax - change.newPos
          },
          timestamp: new Date().toISOString()
        });

        // Find the correct image by matching the shotImageEntryId directly
        // change.id is the last 8 chars of shotImageEntryId, so we need to find the full ID
        const matchingImage = images.find(img =>
          img.shotImageEntryId.endsWith(change.id) || img.shotImageEntryId.substring(0, 8) === change.id
        );

        console.log(`[TimelineDragFix] 🔍 IMAGE MATCHING DEBUG:`, {
          changeId: change.id,
          changeOldPos: change.oldPos,
          changeNewPos: change.newPos,
          availableImages: images.map(img => ({
            shotEntry: img.shotImageEntryId.substring(0, 8),
            genId: img.id.substring(0, 8),
            currentFrame: (img as GenerationRow & { timeline_frame?: number }).timeline_frame,
            endsWith: img.shotImageEntryId.endsWith(change.id),
            startsWith: img.shotImageEntryId.substring(0, 8) === change.id
          })),
          matchedImage: matchingImage ? {
            shotEntry: matchingImage.shotImageEntryId.substring(0, 8),
            genId: matchingImage.id.substring(0, 8),
            currentFrame: (matchingImage as GenerationRow & { timeline_frame?: number }).timeline_frame
          } : null,
          updateTimelineFrame: !!updateTimelineFrame
        });

        if (matchingImage && updateTimelineFrame) {
          console.log(`[TimelineDragFix] 📡 UPDATING ITEM: shotEntry=${matchingImage.shotImageEntryId.substring(0, 8)} genId=${matchingImage.id.substring(0, 8)} from ${change.oldPos} to ${change.newPos}`);

          try {
            await updateTimelineFrame(matchingImage.id, change.newPos, {
              user_positioned: true,
              drag_source: 'timeline_drag'
            });

            console.log(`[TimelineDragFix] ✅ ITEM UPDATE COMPLETED: ${(matchingImage as GenerationRow & { timeline_frame?: number }).id.substring(0, 8)} now at ${change.newPos}`);
          } catch (error) {
            console.error(`[TimelineDragFix] ❌ UPDATE FAILED: ${error instanceof Error ? error.message : error}`);
            console.error(`[TimelineDragFix] 📋 FAILED UPDATE DETAILS:`, {
              generationId: matchingImage.id.substring(0, 8),
              fromFrame: change.oldPos,
              toFrame: change.newPos,
              error: error instanceof Error ? error.message : error
            });
          }
        } else {
          console.error(`[TimelineDragFix] ❌ NO MATCHING IMAGE FOUND for change.id: ${change.id}`);
          console.error(`[TimelineDragFix] 📋 Available images:`, images.map(img => ({
            shotEntry: img.shotImageEntryId.substring(0, 8),
            genId: img.id.substring(0, 8),
            currentFrame: (img as GenerationRow & { timeline_frame?: number }).timeline_frame
          })));
          console.error(`[TimelineDragFix] 🔍 MATCHING DEBUG:`, {
            changeId: change.id,
            changeOldPos: change.oldPos,
            changeNewPos: change.newPos,
            matchingImageFound: !!matchingImage,
            updateTimelineFrameAvailable: !!updateTimelineFrame
          });
        }
      }

      // [DragBoundaryDebug] Post-update boundary success analysis
      console.log('[DragBoundaryDebug] ✅ POST-UPDATE BOUNDARY ANALYSIS:', {
        shotId: shotId.substring(0, 8),
        updateResults: {
          successfulUpdates: positionChanges.filter(c => {
            const matchingImage = images.find(img =>
              img.shotImageEntryId.endsWith(c.id) || img.shotImageEntryId.substring(0, 8) === c.id
            );
            return !!matchingImage;
          }).length,
          failedUpdates: positionChanges.filter(c => {
            const matchingImage = images.find(img =>
              img.shotImageEntryId.endsWith(c.id) || img.shotImageEntryId.substring(0, 8) === c.id
            );
            return !matchingImage;
          }).length,
          leftBoundarySuccesses: positionChanges.filter(c =>
            c.newPos <= fullMin &&
            images.find(img => img.shotImageEntryId.endsWith(c.id) || img.shotImageEntryId.substring(0, 8) === c.id)
          ).length,
          rightBoundarySuccesses: positionChanges.filter(c =>
            c.newPos >= fullMax &&
            images.find(img => img.shotImageEntryId.endsWith(c.id) || img.shotImageEntryId.substring(0, 8) === c.id)
          ).length
        },
        boundaryPattern: {
          leftBoundaryItems: positionChanges.filter(c => c.newPos <= fullMin).map(c => ({
            id: c.id,
            finalPosition: c.newPos,
            wasAtBoundary: c.newPos <= fullMin
          })),
          rightBoundaryItems: positionChanges.filter(c => c.newPos >= fullMax).map(c => ({
            id: c.id,
            finalPosition: c.newPos,
            wasAtBoundary: c.newPos >= fullMax
          })),
          asymmetricBoundaryBehavior: positionChanges.filter(c => c.newPos <= fullMin).length !==
                                     positionChanges.filter(c => c.newPos >= fullMax).length ? 'ASYMMETRIC' : 'SYMMETRIC'
        },
        timestamp: new Date().toISOString()
      });

      console.log('[TimelineItemMoveSummary] Timeline individual updates completed successfully', {
        moveType: 'updateTimelineFrame',
        changesApplied: positionChanges.length,
        metadata: {
          shotId: shotId ? shotId.substring(0, 8) : 'undefined',
          totalImages: images.length,
          timestamp: new Date().toISOString()
        }
      });

      console.log('[TimelineJumpDebug] ✅ DATABASE UPDATE COMPLETED:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        changesApplied: positionChanges.length,
        willReloadParent: !!(propShotGenerations && onTimelineChange),
        timestamp: new Date().toISOString()
      });

      // 🚨 CRITICAL FIX: Don't trigger parent reload for simple drag operations
      // The parent reload is fetching stale data and overriding our successful update
      // Let the Timeline handle its own state updates
      if (propShotGenerations && onTimelineChange) {
        console.log('[TimelineDragFix] ⚠️ SKIPPING PARENT RELOAD - Timeline will handle position updates');
        console.log('[TimelineDragFix] 💡 This prevents stale data from overriding fresh drag positions');

        // Instead of parent reload, update our own stable positions
        // This keeps the UI consistent without fetching potentially stale data
        const updatedPositions = new Map(stablePositions);
        positionChanges.forEach(change => {
          const matchingImage = images.find(img => img.shotImageEntryId.endsWith(change.id) || img.shotImageEntryId.substring(0, 8) === change.id);
          if (matchingImage) {
            updatedPositions.set(matchingImage.shotImageEntryId, change.newPos);
          }
        });

        console.log('[TimelineDragFix] 🎯 setStablePositions CALL #2 - optimistic parent update');
        setStablePositions(updatedPositions, 'drag-parent-update');
        console.log('[TimelineDragFix] ✅ UPDATED STABLE POSITIONS OPTIMISTICALLY');

      } else {
        console.log('[TimelineDragFix] 📝 No parent reload needed - using prop data or callback not provided');
      }

      console.log('[TimelineResetDebug] 🎯 DRAG OPERATION COMPLETED - checking position integrity:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        positionChanges: positionChanges.map(c => `${c.id.substring(0, 8)}: ${c.oldPos}→${c.newPos}`),
        stablePositionsBefore: Array.from(stablePositions.entries()).map(([id, pos]) => `${id.substring(0, 8)}:${pos}`).join(', '),
        timestamp: new Date().toISOString()
      });

      // [DragBoundaryDebug] Final boundary behavior summary
      console.log('[DragBoundaryDebug] 🎯 FINAL DRAG BOUNDARY SUMMARY:', {
        shotId: shotId.substring(0, 8),
        operationSummary: {
          totalChanges: positionChanges.length,
          leftMovements: positionChanges.filter(c => c.delta < 0).length,
          rightMovements: positionChanges.filter(c => c.delta > 0).length,
          leftBoundaryHits: positionChanges.filter(c => c.newPos <= fullMin).length,
          rightBoundaryHits: positionChanges.filter(c => c.newPos >= fullMax).length,
          successfulUpdates: positionChanges.filter(c => {
            const matchingImage = images.find(img =>
              img.shotImageEntryId.endsWith(c.id) || img.shotImageEntryId.substring(0, 8) === c.id
            );
            return !!matchingImage;
          }).length
        },
        boundaryAsymmetry: {
          leftBoundaryBehavior: positionChanges.filter(c => c.newPos <= fullMin).length > 0 ? 'ACTIVE' : 'INACTIVE',
          rightBoundaryBehavior: positionChanges.filter(c => c.newPos >= fullMax).length > 0 ? 'ACTIVE' : 'INACTIVE',
          asymmetryDetected: positionChanges.filter(c => c.newPos <= fullMin).length !==
                           positionChanges.filter(c => c.newPos >= fullMax).length,
          asymmetryDirection: positionChanges.filter(c => c.newPos <= fullMin).length >
                           positionChanges.filter(c => c.newPos >= fullMax).length ? 'LEFT_DOMINANT' : 'RIGHT_DOMINANT'
        },
        patternAnalysis: {
          expectedBehavior: 'When dragging LEFT and hitting boundary, RIGHT items should move LEFT with dragged item',
          actualLeftBehavior: 'UNKNOWN - Check if right items moved when left boundary hit',
          expectedRightBehavior: 'When dragging RIGHT and hitting boundary, LEFT items should move RIGHT with dragged item',
          actualRightBehavior: 'UNKNOWN - Check if left items moved when right boundary hit',
          asymmetryEvidence: 'Compare left vs right boundary hit counts and success rates'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`[TimelineDragFix] ❌ TIMELINE UPDATE FAILED: ${error instanceof Error ? error.message : error} - ${shotId ? shotId.substring(0, 8) : 'undefined'}`);

      console.error('[PositionSystemDebug] ❌ Timeline position update failed:', error);
      console.error('[TimelineDragFix] 📋 FAILURE DETAILS:', {
        positionChanges,
        imagesCount: images.length,
        updateTimelineFrame: !!updateTimelineFrame,
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        error: error instanceof Error ? error.message : error,
        timestamp: new Date().toISOString()
      });
      // Reset stable positions on error
      console.log('[TimelineDragFix] 🎯 setStablePositions CALL #3 - error handler reset');
      setStablePositions(displayPositions, 'error-reset');
      // Show user-friendly error message
      toast.error(`Failed to update timeline positions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error; // Re-throw to let caller handle
    } finally {
      setIsPersistingPositions(false);

      // Reset drag in progress flag after database operations complete
      if (dragCallForFinally) {
        console.log('[TimelineDragFix] 🎯 Resetting isDragInProgress = false after database operations');
        setIsDragInProgress(false);
      }
    }

    console.log('[PositionResetDebug] ✅ TIMELINE setFramePositions COMPLETED (ATOMIC):', {
      shotId: shotId.substring(0, 8),
      success: true,
      timestamp: new Date().toISOString()
    });

    // Also call the original callback if provided
    if (onFramePositionsChange) {
      onFramePositionsChange(newPositions);
    }
  }, [displayPositions, images, updateTimelineFrame, onFramePositionsChange, shotId, propShotGenerations, onTimelineChange]);

  // Calculate dimensions - use stable coordinate system during dragging
  // Use original positions for coordinate system to prevent feedback loop during drag
  // Note: This is defined after dragState is available

  // Zoom and File Drop hooks - defined after coordinate system is available

  // Drag hook - defined after coordinate system is available

  // Global event listeners will be set up after drag hook is defined

  // Calculate dimensions - use display positions initially, will be updated after drag hook
  const { fullMin, fullMax, fullRange } = getTimelineDimensions(displayPositions);

  // [DragBoundaryDebug] Track coordinate system changes and drag boundaries
  const prevCoordinatesRef = React.useRef({ fullMin, fullMax, fullRange });
  const prevDragBoundaryRef = React.useRef({ fullMin, fullMax, fullRange });
  React.useEffect(() => {
    const prev = prevCoordinatesRef.current;
    const current = { fullMin, fullMax, fullRange };

    if (prev.fullMin !== current.fullMin || prev.fullMax !== current.fullMax || prev.fullRange !== current.fullRange) {
      console.log('[TimelineJumpDebug] 📐 COORDINATE SYSTEM CHANGED:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        previous: prev,
        current: current,
        delta: {
          minShift: current.fullMin - prev.fullMin,
          maxShift: current.fullMax - prev.fullMax,
          rangeShift: current.fullRange - prev.fullRange
        },
        timestamp: new Date().toISOString()
      });

      // [DragBoundaryDebug] Track boundary changes for drag behavior analysis
      const prevBoundary = prevDragBoundaryRef.current;
      console.log('[DragBoundaryDebug] 📐 BOUNDARY SYSTEM CHANGED:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
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
                  current.fullRange > prevBoundary.fullRange ? 'RANGE_EXPANSION' : 'CONTRACTION',
        timestamp: new Date().toISOString()
      });
    }

    prevCoordinatesRef.current = current;
    prevDragBoundaryRef.current = current;
  }, [fullMin, fullMax, fullRange, shotId]);

  // Get actual container dimensions for ground truth calculations
  const containerRect = containerRef.current?.getBoundingClientRect() || null;

  // Drag hook
  const {
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    dragDistances,
    dynamicPositions,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useTimelineDrag({
    framePositions: displayPositions,
    setFramePositions,
    images,
    onImageReorder,
    contextFrames,
    fullMin,
    fullMax,
    fullRange,
    containerRect,
  });

  // [TimelineJumpDebug] Track drag state changes
  const prevDragStateRef = React.useRef(dragState);
  React.useEffect(() => {
    const prev = prevDragStateRef.current;
    const current = dragState;
    
    if (prev.isDragging !== current.isDragging || prev.activeId !== current.activeId) {
      console.log('[TimelineJumpDebug] 🎭 DRAG STATE CHANGE:', {
        shotId: shotId ? shotId.substring(0, 8) : 'undefined',
        transition: `${prev.isDragging ? 'DRAGGING' : 'IDLE'} → ${current.isDragging ? 'DRAGGING' : 'IDLE'}`,
        activeId: current.activeId?.substring(0, 8) || 'none',
        prevActiveId: prev.activeId?.substring(0, 8) || 'none',
        timestamp: new Date().toISOString()
      });
      
      // Log positions when drag starts/ends
      if (!prev.isDragging && current.isDragging) {
        console.log('[TimelineJumpDebug] 🚀 DRAG STARTED - Current Positions:', {
          shotId: shotId ? shotId.substring(0, 8) : 'undefined',
          displayPositions: Array.from(displayPositions.entries()).map(([id, pos]) => ({
            id: id.substring(0, 8),
            position: pos
          })),
          dynamicPositions: Array.from(dynamicPositions().entries()).map(([id, pos]) => ({
            id: id.substring(0, 8),
            position: pos
          })),
          coordinateSystem: { fullMin, fullMax, fullRange },
          timestamp: new Date().toISOString()
        });
      } else if (prev.isDragging && !current.isDragging) {
        console.log('[TimelineJumpDebug] 🛑 DRAG ENDED - Final Positions:', {
          shotId: shotId ? shotId.substring(0, 8) : 'undefined',
          displayPositions: Array.from(displayPositions.entries()).map(([id, pos]) => ({
            id: id.substring(0, 8),
            position: pos
          })),
          dynamicPositions: Array.from(dynamicPositions().entries()).map(([id, pos]) => ({
            id: id.substring(0, 8),
            position: pos
          })),
          coordinateSystem: { fullMin, fullMax, fullRange },
          timestamp: new Date().toISOString()
        });
      }
    }
    
    prevDragStateRef.current = current;
  }, [dragState, displayPositions, dynamicPositions, fullMin, fullMax, fullRange, shotId]);

  // Effect to handle context visibility delay when not dragging
  useEffect(() => {
    if (!dragState.isDragging) {
      // Clear any existing timer
      if (contextTimerRef.current) {
        clearTimeout(contextTimerRef.current);
      }
      
      // Set a 100ms delay before showing context
      contextTimerRef.current = setTimeout(() => {
        setShowContext(true);
      }, 100);
    } else {
      // Hide context immediately when dragging starts
      setShowContext(false);
      if (contextTimerRef.current) {
        clearTimeout(contextTimerRef.current);
      }
    }

    // Cleanup timer on unmount
    return () => {
      if (contextTimerRef.current) {
        clearTimeout(contextTimerRef.current);
      }
    };
  }, [dragState.isDragging]);

  // Log coordinate system changes for debugging
  React.useEffect(() => {
    if (dragState.isDragging) {
      console.log('[CoordinateSystemDebug] 🎯 COORDINATE SYSTEM STABILITY:', {
        isDragging: dragState.isDragging,
        fullMin,
        fullMax,
        fullRange,
        timestamp: new Date().toISOString()
      });
    }
  }, [dragState.isDragging, fullMin, fullMax, fullRange]);

  // Zoom hook
  const {
    zoomLevel,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
    handleWheel,
  } = useZoom({ fullMin, fullMax, fullRange });

  // File drop hook
  const {
    isFileOver,
    dropTargetFrame,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useFileDrop({ onImageDrop, fullMin, fullRange });

  // Set up global mouse event listeners for drag
  useEffect(() => {
    if (dragState.isDragging) {
      console.log('[TimelineGlobalEvents] 🎧 SETTING UP GLOBAL EVENT LISTENERS:', {
        isDragging: dragState.isDragging,
        activeId: dragState.activeId?.substring(0, 8),
        timestamp: new Date().toISOString()
      });

      const moveHandler = (e: MouseEvent) => {
        console.log('[TimelineGlobalEvents] 🖱️ GLOBAL MOUSE MOVE:', {
          clientX: e.clientX,
          clientY: e.clientY,
          timestamp: e.timeStamp
        });
        handleMouseMove(e);
      };

      const upHandler = (e: MouseEvent) => {
        console.log('[TimelineGlobalEvents] 🖱️ GLOBAL MOUSE UP:', {
          clientX: e.clientX,
          clientY: e.clientY,
          timestamp: e.timeStamp,
          willCallHandleMouseUp: true
        });
        handleMouseUp(e, containerRef);
      };

      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);

      return () => {
        console.log('[TimelineGlobalEvents] 🧹 CLEANING UP GLOBAL EVENT LISTENERS');
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
      };
    }
  }, [dragState.isDragging, dragState.activeId, handleMouseMove, handleMouseUp]);

  // Auto-adjust positions when context frames change
  useEffect(() => {
    if (initialContextFrames.current === contextFrames) {
      initialContextFrames.current = contextFrames;
      return;
    }

    const maxGap = calculateMaxGap(contextFrames);
    const sortedPositions = [...framePositions.entries()]
      .map(([id, pos]) => ({ id, pos }))
      .sort((a, b) => a.pos - b.pos);

    let needsAdjustment = false;
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      const currentGap = sortedPositions[i + 1].pos - sortedPositions[i].pos;
      if (currentGap > maxGap) {
        needsAdjustment = true;
        break;
      }
    }

    if (needsAdjustment) {
      const adjustedPositions = new Map(framePositions);
      let currentPos = 0;
      for (let i = 0; i < sortedPositions.length; i++) {
        adjustedPositions.set(sortedPositions[i].id, currentPos);
        if (i < sortedPositions.length - 1) {
          currentPos += Math.min(maxGap, frameSpacing);
        }
      }

      setFramePositions(adjustedPositions);
      toast.info(`Timeline positions auto-adjusted due to context frame changes (max gap: ${maxGap} frames)`);
    }

    initialContextFrames.current = contextFrames;
  }, [contextFrames, framePositions, frameSpacing, setFramePositions]);

  // Lightbox navigation
  const goNext = () => setLightboxIndex(i => (i === null ? null : (i + 1) % images.length));
  const goPrev = () => setLightboxIndex(i => (i === null ? null : (i - 1 + images.length) % images.length));

  // Prepare data
  const currentPositions = dynamicPositions();
  const pairInfo = getPairInfo(currentPositions, contextFrames);
  const numPairs = Math.max(0, images.length - 1);
  const maxAllowedGap = calculateMaxGap(contextFrames);
  const containerWidth = containerRef.current?.clientWidth || 1000;

  const isMobile = useIsMobile();

  // Mobile double-tap detection refs
  const lastTouchTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  // Handle mobile double-tap detection for image lightbox
  const handleMobileTap = (idx: number) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // This is a double-tap, clear any pending timeout and open lightbox
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      setLightboxIndex(idx);
    } else {
      // This is a single tap, set a timeout to handle it if no second tap comes
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      doubleTapTimeoutRef.current = setTimeout(() => {
        // Single tap on mobile - you could add single tap behavior here if needed
        doubleTapTimeoutRef.current = null;
      }, 300);
    }
    
    lastTouchTimeRef.current = currentTime;
  };

  // Handle resetting frames to evenly spaced intervals
  const handleResetFrames = useCallback(async (gap: number) => {
    console.log('[FrameReset] 🔄 RESETTING FRAMES:', {
      shotId: shotId.substring(0, 8),
      gap,
      imagesCount: images.length,
      timestamp: new Date().toISOString()
    });

    // Create new positions: 0, gap, gap*2, gap*3, etc.
    const newPositions = new Map<string, number>();
    images.forEach((image, index) => {
      newPositions.set(image.shotImageEntryId, index * gap);
    });

    console.log('[FrameReset] 📊 NEW POSITIONS:', {
      shotId: shotId.substring(0, 8),
      positions: Array.from(newPositions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        position: pos
      })),
      timestamp: new Date().toISOString()
    });

    try {
      await setFramePositions(newPositions);
      console.log('[FrameReset] ✅ FRAME RESET COMPLETED');
    } catch (error) {
      console.error('[FrameReset] ❌ FRAME RESET FAILED:', error);
    }
  }, [images, setFramePositions, shotId]);

  return (
    <div className="w-full overflow-x-hidden">
      {/* Controls */}
      <TimelineControls
        contextFrames={contextFrames}
        onContextFramesChange={onContextFramesChange}
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onZoomToStart={handleZoomToStart}
        onResetFrames={handleResetFrames}
      />

      {/* Timeline */}
      <div
        ref={timelineRef}
        className={`timeline-scroll relative bg-muted/20 border rounded-lg p-4 overflow-x-auto mb-6 ${zoomLevel <= 1 ? 'no-scrollbar' : ''} ${
          isFileOver ? 'ring-2 ring-primary bg-primary/5' : ''
        }`}
        style={{ minHeight: "200px", paddingBottom: "3rem" }}
        onWheel={handleWheel}
        onDragEnter={handleDragEnter}
        onDragOver={(e) => handleDragOver(e, containerRef)}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop position indicator */}
        <DropIndicator
          isVisible={isFileOver}
          dropTargetFrame={dropTargetFrame}
          fullMin={fullMin}
          fullRange={fullRange}
        />

        {/* Ruler */}
        <TimelineRuler
          fullMin={fullMin}
          fullMax={fullMax}
          fullRange={fullRange}
          zoomLevel={zoomLevel}
        />

        {/* Timeline container */}
        <div
          ref={containerRef}
          id="timeline-container"
          className="relative h-32 mb-8"
          onDoubleClick={(e) => handleTimelineDoubleClick(e, containerRef)}
          style={{
            width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
            minWidth: "100%",
            userSelect: 'none',
          }}
        >
          {/* Pair visualizations */}
          {pairInfo.map((pair, index) => {
            // Build sorted positions array with id for pixel calculations
            const sortedDynamicPositions = [...currentPositions.entries()].sort((a, b) => a[1] - b[1]);
            const [startEntry, endEntry] = [sortedDynamicPositions[index], sortedDynamicPositions[index + 1]];

            // Hide context for pairs involving the dragged item
            if (dragState.isDragging && dragState.activeId) {
              const isDraggedItemInPair = startEntry?.[0] === dragState.activeId || endEntry?.[0] === dragState.activeId;
              if (isDraggedItemInPair) {
                return null; // Skip rendering context for dragged item
              }
            }

            // Hide context with delay for non-dragged pairs when not dragging
            if (!dragState.isDragging && !showContext) {
              return null; // Skip rendering until delay period is over
            }

            // Only calculate pixels for non-dragged items
            const getPixel = (entry: [string, number] | undefined): number => {
              if (!entry) return 0;
              const [id, framePos] = entry;

              // Skip DOM-based positioning for dragged items since we're not rendering their context
              if (dragState.isDragging && id === dragState.activeId) {
                console.log('[ContextSkip] 🎯 SKIPPING CONTEXT CALCULATION FOR DRAGGED ITEM:', {
                  itemId: id.substring(0, 8),
                  framePos,
                  reason: 'context_hidden_for_dragged_item',
                  timestamp: new Date().toISOString()
                });
                return 0; // Return 0 since this won't be used anyway
              }

              // GROUND TRUTH: Use actual container dimensions
              const basePixel = ((framePos - fullMin) / fullRange) * containerWidth;

              return basePixel;
            };

            const startPixel = getPixel(startEntry);
            const endPixel = getPixel(endEntry);

            const actualStartFrame = startEntry?.[1] ?? pair.startFrame;
            const actualEndFrame = endEntry?.[1] ?? pair.endFrame;
            const actualFrames = actualEndFrame - actualStartFrame;

            const startPercent = (startPixel / containerWidth) * 100;
            const endPercent = (endPixel / containerWidth) * 100;

            const contextStartFrameUnclipped = actualEndFrame - contextFrames;
            const contextStartFrame = Math.max(0, contextStartFrameUnclipped);
            const visibleContextFrames = Math.max(0, actualEndFrame - contextStartFrame);
            
            const contextStartPixel = ((contextStartFrame - fullMin) / fullRange) * containerWidth;
            const contextStartPercent = (contextStartPixel / containerWidth) * 100;

            const generationStartPixel = ((pair.generationStart - fullMin) / fullRange) * containerWidth;
            const generationStartPercent = (generationStartPixel / containerWidth) * 100;

            return (
              <PairRegion
                key={`pair-${index}`}
                index={index}
                startPercent={startPercent}
                endPercent={endPercent}
                contextStartPercent={contextStartPercent}
                generationStartPercent={generationStartPercent}
                actualFrames={actualFrames}
                visibleContextFrames={visibleContextFrames}
                isDragging={dragState.isDragging}
                contextFrames={contextFrames}
                numPairs={numPairs}
                startFrame={pair.startFrame}
                endFrame={pair.endFrame}
                onPairClick={onPairClick ? (pairIndex, pairData) => {
                  // Get the images for this pair
                  const startImage = images.find(img => img.shotImageEntryId === startEntry?.[0]);
                  const endImage = images.find(img => img.shotImageEntryId === endEntry?.[0]);
                  
                  // Calculate actual position numbers (1-based)
                  const startPosition = index + 1; // First image in pair
                  const endPosition = index + 2;   // Second image in pair
                  
                  // Call the original onPairClick with enhanced data
                  onPairClick(pairIndex, {
                    ...pairData,
                    startImage: startImage ? {
                      id: startImage.shotImageEntryId,
                      url: startImage.imageUrl || startImage.thumbUrl,
                      thumbUrl: startImage.thumbUrl,
                      timeline_frame: (startImage as GenerationRow & { timeline_frame?: number }).timeline_frame ?? 0,
                      position: startPosition
                    } : null,
                    endImage: endImage ? {
                      id: endImage.shotImageEntryId,
                      url: endImage.imageUrl || endImage.thumbUrl,
                      thumbUrl: endImage.thumbUrl,
                      timeline_frame: (endImage as GenerationRow & { timeline_frame?: number }).timeline_frame ?? 0,
                      position: endPosition
                    } : null
                  });
                } : undefined}
                pairPrompt={actualPairPrompts?.[index]?.prompt}
                pairNegativePrompt={actualPairPrompts?.[index]?.negativePrompt}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
              />
            );
          })}

          {/* Timeline items */}
          {images.map((image, idx) => {
            const framePosition = currentPositions.get(image.shotImageEntryId) ?? idx * frameSpacing;
            const isDragging = dragState.isDragging && dragState.activeId === image.shotImageEntryId;

            return (
              <TimelineItem
                key={image.shotImageEntryId}
                image={image}
                framePosition={framePosition}
                isDragging={isDragging}
                isSwapTarget={swapTargetId === image.shotImageEntryId}
                dragOffset={isDragging ? dragOffset : null}
                onMouseDown={(e) => handleMouseDown(e, image.shotImageEntryId, containerRef)}
                onDoubleClick={isMobile ? undefined : () => setLightboxIndex(idx)}
                onMobileTap={isMobile ? () => handleMobileTap(idx) : undefined}
                zoomLevel={zoomLevel}
                timelineWidth={containerWidth}
                fullMinFrames={fullMin}
                fullRange={fullRange}
                currentDragFrame={isDragging ? currentDragFrame : null}
                dragDistances={isDragging ? dragDistances : null}
                maxAllowedGap={maxAllowedGap}
                originalFramePos={displayPositions.get(image.shotImageEntryId) ?? 0}
                onDelete={onImageDelete}
                onDuplicate={onImageDuplicate}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                projectAspectRatio={projectAspectRatio}
              />
            );
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <MediaLightbox
          media={images[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onNext={images.length > 1 ? goNext : undefined}
          onPrevious={images.length > 1 ? goPrev : undefined}
          onImageSaved={async (newUrl: string, createNew?: boolean) => await onImageSaved(images[lightboxIndex].id, newUrl, createNew)}
          showNavigation={true}
          showMagicEdit={true}
          hasNext={lightboxIndex < images.length - 1}
          hasPrevious={lightboxIndex > 0}
          onMagicEdit={(imageUrl, prompt, numImages) => {
            // TODO: Implement magic edit generation
            console.log('Magic Edit from Timeline:', { imageUrl, prompt, numImages });
          }}
        />
      )}
    </div>
  );
};

export default Timeline; 