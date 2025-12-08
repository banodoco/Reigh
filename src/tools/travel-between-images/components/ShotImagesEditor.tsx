import React, { useState, useCallback } from "react";
import { GenerationRow } from "@/types/shots";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import ShotImageManager from "@/shared/components/ShotImageManager";
import Timeline from "./Timeline"; // Main timeline component with drag/drop and image actions
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";
import { useEnhancedShotImageReorder } from "@/shared/hooks/useEnhancedShotImageReorder";
import { useTimelinePositionUtils } from "@/shared/hooks/useTimelinePositionUtils";
import PairPromptModal from "./Timeline/PairPromptModal";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getDisplayUrl } from '@/shared/lib/utils';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import { BatchGuidanceVideo } from './BatchGuidanceVideo';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Video } from 'lucide-react';
import { isVideoGeneration, isPositioned, isVideoAny } from '@/shared/lib/typeGuards';

interface ShotImagesEditorProps {
  /** Controls whether internal UI should render the skeleton */
  isModeReady: boolean;
  /** Optional error text shown at the top of the card */
  settingsError?: string | null;
  /** Whether the UI is currently on a mobile breakpoint */
  isMobile: boolean;
  /** Current generation mode */
  generationMode: "batch" | "timeline";
  /** Callback to switch modes */
  onGenerationModeChange: (mode: "batch" | "timeline") => void;
  /** Selected shot id */
  selectedShotId: string;
  /** Optional preloaded images (for read-only/share views) - bypasses database queries */
  preloadedImages?: any[];
  /** Read-only mode - disables all interactions */
  readOnly?: boolean;
  /** Project id for video uploads */
  projectId?: string;
  /** Shot name for download filename */
  shotName?: string;
  /** Frame spacing (frames between key-frames) */
  batchVideoFrames: number;
  /** Reordering callback – receives ordered ids */
  onImageReorder: (orderedIds: string[]) => void;
  /** Timeline frame positions change */
  onFramePositionsChange: (newPositions: Map<string, number>) => void;
  /** Callback when external images are dropped on the timeline */
  onImageDrop: (files: File[], targetFrame?: number) => Promise<void>;
  /** Callback when generations are dropped from GenerationsPane onto the timeline */
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  /** Callback when external images are dropped on batch mode grid */
  onBatchFileDrop?: (files: File[], targetPosition?: number) => Promise<void>;
  /** Callback when generations are dropped from GenerationsPane onto batch mode grid */
  onBatchGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number) => Promise<void>;
  /** Map of pending frame positions coming from server */
  pendingPositions: Map<string, number>;
  /** Callback when pending position is applied */
  onPendingPositionApplied: (generationId: string) => void;
  /** Image deletion callback - id is shot_generations.id (unique per entry) */
  onImageDelete: (id: string) => void;
  /** Batch image deletion callback - ids are shot_generations.id values */
  onBatchImageDelete?: (ids: string[]) => void;
  /** Image duplication callback - id is shot_generations.id */
  onImageDuplicate?: (id: string, timeline_frame: number) => void;
  /** Number of columns for batch mode grid */
  columns: 2 | 3 | 4 | 6;
  /** Skeleton component to show while loading */
  skeleton: React.ReactNode;
  /** Count of unpositioned generations */
  unpositionedGenerationsCount: number;
  /** Callback to open unpositioned pane */
  onOpenUnpositionedPane: () => void;
  /** File input key for resetting */
  fileInputKey: number;
  /** Image upload callback */
  onImageUpload: (files: File[]) => Promise<void>;
  /** Whether currently uploading image */
  isUploadingImage: boolean;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  /** ID of image currently being duplicated */
  duplicatingImageId?: string | null;
  /** ID of image that was just duplicated (for success indication) */
  duplicateSuccessImageId?: string | null;
  /** Project aspect ratio for display */
  projectAspectRatio?: string;
  /** Default prompt for timeline pairs (from existing generation settings) */
  defaultPrompt?: string;
  onDefaultPromptChange?: (prompt: string) => void;
  /** Default negative prompt for timeline pairs (from existing generation settings) */
  defaultNegativePrompt?: string;
  onDefaultNegativePromptChange?: (prompt: string) => void;
  /** Structure video props - passed from parent for task generation */
  structureVideoPath?: string | null;
  structureVideoMetadata?: VideoMetadata | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'flow' | 'canny' | 'depth';
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  /** Callback when selection state changes */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** Shot management for external generation viewing */
  allShots?: any[];
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (shotId: string, generationId: string, position: number) => Promise<void>;
  onAddToShotWithoutPosition?: (shotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (name: string) => Promise<string>;
}

// Force TypeScript to re-evaluate this interface

const ShotImagesEditor: React.FC<ShotImagesEditorProps> = ({
  isModeReady,
  settingsError,
  isMobile,
  generationMode,
  onGenerationModeChange,
  selectedShotId,
  preloadedImages,
  readOnly = false,
  projectId,
  shotName,
  batchVideoFrames,
  onImageReorder,
  onFramePositionsChange,
  onImageDrop,
  onGenerationDrop,
  onBatchFileDrop,
  onBatchGenerationDrop,
  pendingPositions,
  onPendingPositionApplied,
  onImageDelete,
  onBatchImageDelete,
  onImageDuplicate,
  columns,
  skeleton,
  unpositionedGenerationsCount,
  onOpenUnpositionedPane,
  fileInputKey,
  onImageUpload,
  isUploadingImage,
  uploadProgress = 0,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  defaultPrompt = "",
  onDefaultPromptChange,
  defaultNegativePrompt = "",
  onDefaultNegativePromptChange,
  // Structure video props
  structureVideoPath: propStructureVideoPath,
  structureVideoMetadata: propStructureVideoMetadata,
  structureVideoTreatment: propStructureVideoTreatment = 'adjust',
  structureVideoMotionStrength: propStructureVideoMotionStrength = 1.0,
  structureVideoType: propStructureVideoType = 'flow',
  onStructureVideoChange: propOnStructureVideoChange,
  onSelectionChange,
  // Shot management for external generation viewing
  allShots,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  onCreateShot,
}) => {
  // [ZoomDebug] Track ShotImagesEditor mounts to detect unwanted remounts
  const shotImagesEditorMountRef = React.useRef(0);
  React.useEffect(() => {
    shotImagesEditorMountRef.current++;
    console.log('[ZoomDebug] 🟡 ShotImagesEditor MOUNTED:', {
      mountCount: shotImagesEditorMountRef.current,
      selectedShotId: selectedShotId?.substring(0, 8),
      isModeReady,
      preloadedImagesCount: preloadedImages?.length || 0,
      timestamp: Date.now()
    });
    return () => {
      console.log('[ZoomDebug] 🟡 ShotImagesEditor UNMOUNTING:', {
        mountCount: shotImagesEditorMountRef.current,
        selectedShotId: selectedShotId?.substring(0, 8),
        timestamp: Date.now()
      });
    };
  }, []);

  // [RenderProfile] DETAILED PROFILING: Track what props are changing to cause re-renders
  const renderCount = React.useRef(0);
  renderCount.current += 1;
  
  // Track all props that could cause re-renders
  const prevPropsRef = React.useRef<{
    selectedShotId?: string;
    preloadedImagesLength: number;
    isModeReady: boolean;
    generationMode: string;
    readOnly: boolean;
    batchVideoFrames?: number;
    pendingPositionsSize: number;
    columns: number;
    unpositionedGenerationsCount: number;
    fileInputKey: number;
    isUploadingImage: boolean;
    uploadProgress: number;
    duplicatingImageId?: string | null;
    duplicateSuccessImageId?: string | null;
    defaultPrompt: string;
    defaultNegativePrompt: string;
    structureVideoPath?: string | null;
    structureVideoTreatment: string;
    structureVideoMotionStrength: number;
    structureVideoType: string;
    allShotsLength: number;
  }>({
    selectedShotId: undefined,
    preloadedImagesLength: 0,
    isModeReady: false,
    generationMode: '',
    readOnly: false,
    pendingPositionsSize: 0,
    columns: 2,
    unpositionedGenerationsCount: 0,
    fileInputKey: 0,
    isUploadingImage: false,
    uploadProgress: 0,
    duplicatingImageId: null,
    duplicateSuccessImageId: null,
    defaultPrompt: '',
    defaultNegativePrompt: '',
    structureVideoPath: null,
    structureVideoTreatment: 'adjust',
    structureVideoMotionStrength: 1.0,
    structureVideoType: 'flow',
    allShotsLength: 0,
  });
  
  React.useEffect(() => {
    const currentProps = {
      selectedShotId,
      preloadedImagesLength: preloadedImages?.length || 0,
      isModeReady,
      generationMode,
      readOnly,
      batchVideoFrames,
      pendingPositionsSize: pendingPositions.size,
      columns,
      unpositionedGenerationsCount,
      fileInputKey,
      isUploadingImage,
      uploadProgress,
      duplicatingImageId,
      duplicateSuccessImageId,
      defaultPrompt,
      defaultNegativePrompt,
      structureVideoPath: propStructureVideoPath,
      structureVideoTreatment: propStructureVideoTreatment,
      structureVideoMotionStrength: propStructureVideoMotionStrength,
      structureVideoType: propStructureVideoType,
      allShotsLength: allShots?.length || 0,
    };
    
    const prev = prevPropsRef.current;
    const changedProps: string[] = [];
    
    (Object.keys(currentProps) as Array<keyof typeof currentProps>).forEach(key => {
      if (prev[key] !== currentProps[key]) {
        changedProps.push(`${key}: ${JSON.stringify(prev[key])} → ${JSON.stringify(currentProps[key])}`);
      }
    });
    
    if (changedProps.length > 0) {
      console.log(`[RenderProfile] 📸 ShotImagesEditor RENDER #${renderCount.current} - Props changed:`, {
        changedProps,
        timestamp: Date.now()
      });
    } else if (renderCount.current > 1) {
      // Re-render with NO prop changes - this is the problem!
      console.warn(`[RenderProfile] ⚠️ ShotImagesEditor RENDER #${renderCount.current} - NO PROPS CHANGED (parent re-render)`, {
        timestamp: Date.now()
      });
    }
    
    prevPropsRef.current = currentProps;
  });
  
  // [RenderProfile] Track callback prop changes (these are often unstable)
  const prevCallbacksRef = React.useRef<{
    onGenerationModeChange?: any;
    onImageReorder?: any;
    onFramePositionsChange?: any;
    onImageDrop?: any;
    onGenerationDrop?: any;
    onBatchFileDrop?: any;
    onBatchGenerationDrop?: any;
    onPendingPositionApplied?: any;
    onImageDelete?: any;
    onBatchImageDelete?: any;
    onImageDuplicate?: any;
    onOpenUnpositionedPane?: any;
    onImageUpload?: any;
    onDefaultPromptChange?: any;
    onDefaultNegativePromptChange?: any;
    propOnStructureVideoChange?: any;
    onSelectionChange?: any;
    onShotChange?: any;
    onAddToShot?: any;
    onAddToShotWithoutPosition?: any;
    onCreateShot?: any;
  }>({});
  
  React.useEffect(() => {
    const callbacks = {
      onGenerationModeChange,
      onImageReorder,
      onFramePositionsChange,
      onImageDrop,
      onGenerationDrop,
      onBatchFileDrop,
      onBatchGenerationDrop,
      onPendingPositionApplied,
      onImageDelete,
      onBatchImageDelete,
      onImageDuplicate,
      onOpenUnpositionedPane,
      onImageUpload,
      onDefaultPromptChange,
      onDefaultNegativePromptChange,
      propOnStructureVideoChange,
      onSelectionChange,
      onShotChange,
      onAddToShot,
      onAddToShotWithoutPosition,
      onCreateShot,
    };
    
    const prev = prevCallbacksRef.current;
    const changedCallbacks: string[] = [];
    
    (Object.keys(callbacks) as Array<keyof typeof callbacks>).forEach(key => {
      if (prev[key] !== callbacks[key]) {
        changedCallbacks.push(key);
      }
    });
    
    if (changedCallbacks.length > 0) {
      console.warn(`[RenderProfile] 🔄 ShotImagesEditor RENDER #${renderCount.current} - Callback props changed (UNSTABLE):`, {
        changedCallbacks,
        hint: 'Parent should wrap these in useCallback',
        timestamp: Date.now()
      });
    }
    
    prevCallbacksRef.current = callbacks;
  });
  
  // Force mobile to use batch mode regardless of desktop setting
  const effectiveGenerationMode = isMobile ? 'batch' : generationMode;
  
  // State for download functionality
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  
  // Note: Pair prompts are retrieved from the enhanced shot positions hook below
  
  const [pairPromptModalData, setPairPromptModalData] = useState<{
    isOpen: boolean;
    pairData: { 
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
    } | null;
  }>({
    isOpen: false,
    pairData: null,
  });


  // Enhanced position management
  // Centralized position management - shared between Timeline and ShotImageManager
  // When preloadedImages is provided, use new utility hook; otherwise use legacy hook
  const legacyHookData = useEnhancedShotPositions(preloadedImages ? null : selectedShotId);
  
  // NEW: Use utility hook when preloaded images are provided
  // CRITICAL: Pass the same generations array that we use for display
  // Otherwise clearEnhancedPrompt will look in a different/empty array
  const utilsData = useTimelinePositionUtils({
    shotId: preloadedImages ? selectedShotId : null,
    generations: preloadedImages || legacyHookData.shotGenerations,  // Use legacyHookData as fallback
    projectId: projectId, // Pass projectId to invalidate ShotsPane cache
  });
  
  // Choose data source based on whether we have preloaded images
  const hookData: typeof legacyHookData = preloadedImages ? {
    // Use utility hook data when preloaded
    shotGenerations: utilsData.shotGenerations,
    pairPrompts: utilsData.pairPrompts,
    isLoading: utilsData.isLoading,
    error: utilsData.error ? utilsData.error.message : '',
    updateTimelineFrame: utilsData.updateTimelineFrame,
    batchExchangePositions: utilsData.batchExchangePositions,
    loadPositions: utilsData.loadPositions,
    updatePairPrompts: utilsData.updatePairPrompts,
    clearEnhancedPrompt: utilsData.clearEnhancedPrompt,
    initializeTimelineFrames: utilsData.initializeTimelineFrames,
    // Provide filtering function for mode-specific views
    getImagesForMode: (mode: 'batch' | 'timeline') => {
      // BOTH modes show only positioned non-video images
      // Uses canonical filters from typeGuards
      const positioned = preloadedImages
        .filter(img => isPositioned(img) && !isVideoGeneration(img))
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
      console.log('[TimelinePositionUtils] getImagesForMode:', {
        mode,
        total: preloadedImages.length,
        positioned: positioned.length,
        filtered: preloadedImages.length - positioned.length,
      });
      return positioned;
    },
    exchangePositions: async () => {},
    exchangePositionsNoReload: async () => {},
    deleteItem: async () => {},
    updatePairPromptsByIndex: async () => {},
    clearAllEnhancedPrompts: async () => {},
    isPersistingPositions: false,
    setIsPersistingPositions: () => {},
    getPositionsForMode: () => new Map(),
    addItem: async () => {},
    applyTimelineFrames: async () => {},
    getPairPrompts: () => utilsData.pairPrompts,
  } as any : legacyHookData;
  
  const {
    getImagesForMode,
    isLoading: positionsLoading,
    shotGenerations: dbShotGenerations,
    updateTimelineFrame,
    exchangePositions,
    exchangePositionsNoReload,
    batchExchangePositions,
    deleteItem,
    loadPositions,
    pairPrompts, // Use reactive pairPrompts value directly
    updatePairPrompts, // Direct update by shot_generation.id
    updatePairPromptsByIndex,
    clearEnhancedPrompt,
    clearAllEnhancedPrompts
  } = hookData;
  
  // Use preloaded images if provided, otherwise use database images
  const shotGenerations = preloadedImages || dbShotGenerations;
  
  // Log data source for debugging
  console.log('[UnifiedDataFlow] ShotImagesEditor data source:', {
    selectedShotId: selectedShotId.substring(0, 8),
    usingPreloadedImages: !!preloadedImages,
    dataSource: preloadedImages ? 'two-phase (from ShotEditor)' : 'legacy (useEnhancedShotPositions)',
    imageCount: shotGenerations.length,
    withMetadata: shotGenerations.filter((img: any) => img.metadata).length,
    withId: shotGenerations.filter((img: any) => img.id).length, // id is shot_generations.id
    positioned: shotGenerations.filter((img: any) => img.timeline_frame != null && img.timeline_frame !== -1).length,
    unpositioned: shotGenerations.filter((img: any) => img.timeline_frame == null || img.timeline_frame === -1).length,
    hookDataShotGensCount: hookData.shotGenerations.length,
  });
  
  // Enhanced reorder management for batch mode - pass parent hook to avoid duplication
  // When using preloaded images, still need shotId for mutations!
  const { handleReorder, handleDelete } = useEnhancedShotImageReorder(
    selectedShotId, // Always pass shotId - needed for mutations 
    preloadedImages ? {
      shotGenerations: utilsData.shotGenerations,
      getImagesForMode: hookData.getImagesForMode, // Use the filtering function we created
      exchangePositions: async (genIdA: string, genIdB: string) => {
        // Single exchange - just use batchExchangePositions with one item
        await utilsData.batchExchangePositions([
          { id: genIdA, newFrame: 0 }, // Placeholder, will be calculated
          { id: genIdB, newFrame: 0 }
        ]);
      },
      exchangePositionsNoReload: async (shotGenIdA: string, shotGenIdB: string) => {
        console.log('[ShotImagesEditor] exchangePositionsNoReload - swapping pair:', {
          shotGenIdA: shotGenIdA.substring(0, 8),
          shotGenIdB: shotGenIdB.substring(0, 8),
        });
        // Call utility's batchExchangePositions with pair swap format
        await utilsData.batchExchangePositions([{ shotGenerationIdA: shotGenIdA, shotGenerationIdB: shotGenIdB }] as any);
      },
      batchExchangePositions: utilsData.batchExchangePositions, // REAL function!
      deleteItem: async (shotGenerationId: string) => {
        console.log('[DELETE:ShotImagesEditor] 🔄 deleteItem stub forwarding to onImageDelete', {
          shotGenerationId: shotGenerationId.substring(0, 8),
          hasOnImageDelete: !!onImageDelete,
          timestamp: Date.now()
        });
        // Forward to the actual delete handler passed from parent
        if (onImageDelete) {
          onImageDelete(shotGenerationId);
        } else {
          console.error('[DELETE:ShotImagesEditor] ❌ No onImageDelete handler provided!');
        }
      },
      loadPositions: utilsData.loadPositions, // REAL function!
      moveItemsToMidpoint: utilsData.moveItemsToMidpoint, // NEW: Midpoint-based reordering (single or multi)
      isLoading: utilsData.isLoading
    } as any : {
      shotGenerations,
      getImagesForMode,
      exchangePositions,
      exchangePositionsNoReload,
      batchExchangePositions,
      deleteItem,
      loadPositions,
      isLoading: positionsLoading
    }
  );

  // Memoize images and shotGenerations to prevent infinite re-renders in Timeline
  const images = React.useMemo(() => {
    // ALWAYS use getImagesForMode to apply correct filtering for the mode
    const result = getImagesForMode(generationMode);
    
    console.log('[UnifiedDataFlow] ShotImagesEditor images memoization:', {
      selectedShotId: selectedShotId.substring(0, 8),
      generationMode,
      usingPreloaded: !!preloadedImages,
      totalImages: result.length,
      positioned: result.filter((img: any) => img.timeline_frame != null && img.timeline_frame !== -1).length,
      unpositioned: result.filter((img: any) => img.timeline_frame == null || img.timeline_frame === -1).length,
    });
    
    console.log('[DataTrace] 📤 ShotImagesEditor → passing to Timeline/Manager:', {
      shotId: selectedShotId.substring(0, 8),
      mode: generationMode,
      total: result.length,
      willBeDisplayed: result.length,
    });
    
    return result;
  }, [getImagesForMode, generationMode, selectedShotId]);

  // Memoize shotGenerations to prevent reference changes
  const memoizedShotGenerations = React.useMemo(() => {
    return shotGenerations;
  }, [shotGenerations]);

  // Track if we've ever had data to prevent unmounting Timeline during refetches
  // This prevents zoom reset when data is being refetched
  const hasEverHadDataRef = React.useRef(false);
  if (memoizedShotGenerations.length > 0) {
    hasEverHadDataRef.current = true;
  }
  // Reset when shot changes
  React.useEffect(() => {
    hasEverHadDataRef.current = memoizedShotGenerations.length > 0;
  }, [selectedShotId]);

  // Note: Pair prompts cleanup is handled automatically by the database
  // when shot_generations are deleted, since prompts are stored in their metadata

  // Download all shot images handler
  const handleDownloadAllImages = useCallback(async () => {
    if (!images || images.length === 0) {
      toast.error("No images to download");
      return;
    }

    setIsDownloadingImages(true);
    
    try {
      // Dynamic import JSZip
      const JSZipModule = await import('jszip');
      const zip = new JSZipModule.default();
      
      // Sort images by position for consistent ordering
      const sortedImages = [...images].sort((a, b) => {
        const posA = (a as any).position || 0;
        const posB = (b as any).position || 0;
        return posA - posB;
      });
      
      // Process images sequentially to avoid overwhelming the server
      for (let i = 0; i < sortedImages.length; i++) {
        const image = sortedImages[i];
        const accessibleImageUrl = getDisplayUrl(image.imageUrl || image.location || '');
        
        try {
          // Fetch the image blob
          const response = await fetch(accessibleImageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          
          // Determine file extension
          let fileExtension = 'png'; // Default fallback
          const contentType = blob.type || (image as any).metadata?.content_type;
          
          if (contentType && typeof contentType === 'string') {
            if (contentType.includes('jpeg') || contentType.includes('jpg')) {
              fileExtension = 'jpg';
            } else if (contentType.includes('png')) {
              fileExtension = 'png';
            } else if (contentType.includes('webp')) {
              fileExtension = 'webp';
            } else if (contentType.includes('gif')) {
              fileExtension = 'gif';
            }
          }
          
          // Generate zero-padded filename
          const paddedNumber = String(i + 1).padStart(3, '0');
          const filename = `${paddedNumber}.${fileExtension}`;
          
          // Add to zip
          zip.file(filename, blob);
        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error);
          // Continue with other images, don't fail the entire operation
          toast.error(`Failed to process image ${i + 1}, continuing with others...`);
        }
      }
      
      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Create download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Generate filename with shot name and timestamp
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '-');
      const sanitizedShotName = shotName ? shotName.replace(/[^a-zA-Z0-9-_]/g, '-') : 'shot';
      a.download = `${sanitizedShotName}-${timestamp}.zip`;
      
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error("Error downloading shot images:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Could not create zip file. ${errorMessage}`);
    } finally {
      setIsDownloadingImages(false);
    }
  }, [images]);

    console.log('[ShotImagesEditor] Render:', {
    selectedShotId,
    generationMode,
    imagesCount: images.length,
    positionsLoading,
    isModeReady
  });

  // Wrap onDefaultPromptChange to also clear all enhanced prompts when base prompt changes
  const handleDefaultPromptChange = React.useCallback(async (newPrompt: string) => {
    // First update the default prompt
    onDefaultPromptChange(newPrompt);
    
    // Then clear all enhanced prompts for the shot
    try {
      await clearAllEnhancedPrompts();
      console.log('[ShotImagesEditor] 🧹 Cleared all enhanced prompts after base prompt change');
    } catch (error) {
      console.error('[ShotImagesEditor] Error clearing enhanced prompts:', error);
    }
  }, [onDefaultPromptChange, clearAllEnhancedPrompts]);

  // Adapter functions to convert between ShotImageManager's signature and ShotEditor's signature
  // CRITICAL FIX: Now receives targetShotId from the callback, not from props!
  // This ensures the image is added to the shot the user SELECTED in the dropdown, not the shot being viewed
  const handleAddToShotAdapter = React.useCallback(async (
    targetShotId: string,
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    console.log('[ShotSelectorDebug] ShotImagesEditor handleAddToShotAdapter called', {
      component: 'ShotImagesEditor',
      hasOnAddToShot: !!onAddToShot,
      targetShotId: targetShotId?.substring(0, 8),
      viewedShotId: selectedShotId?.substring(0, 8),
      generationId: generationId?.substring(0, 8),
      isDifferentShot: targetShotId !== selectedShotId
    });

    if (!onAddToShot || !targetShotId) {
      console.warn('[ShotImagesEditor] Cannot add to shot: missing onAddToShot or targetShotId');
      return false;
    }

    try {
      // Pass position as undefined to let the mutation calculate the correct position for the TARGET shot
      // CRITICAL: We can't use `images` here because `images` are for the VIEWED shot, not the TARGET shot
      await onAddToShot(targetShotId, generationId, undefined as any);
      return true;
    } catch (error) {
      console.error('[ShotImagesEditor] Error adding to shot:', error);
      return false;
    }
  }, [onAddToShot, selectedShotId]);

  // CRITICAL FIX: Now receives targetShotId from the callback
  const handleAddToShotWithoutPositionAdapter = React.useCallback(async (
    targetShotId: string,
    generationId: string,
    imageUrl?: string,
    thumbUrl?: string
  ): Promise<boolean> => {
    if (!onAddToShotWithoutPosition || !targetShotId) {
      console.warn('[ShotImagesEditor] Cannot add to shot without position: missing handler or targetShotId');
      return false;
    }

    try {
      await onAddToShotWithoutPosition(targetShotId, generationId);
      return true;
    } catch (error) {
      console.error('[ShotImagesEditor] Error adding to shot without position:', error);
      return false;
    }
  }, [onAddToShotWithoutPosition]);

  // [ShotNavPerf] Removed redundant render completion log - use STATE CHANGED log instead

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg font-light">
              Guidance
              {settingsError && (
                <div className="text-sm text-destructive mt-1">
                  {settingsError}
                </div>
              )}
            </CardTitle>
            
            {/* Download All Images Button - Icon only, next to title (hidden in read-only mode) */}
            {!readOnly && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownloadAllImages}
                      disabled={isDownloadingImages || !images || images.length === 0}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      {isDownloadingImages ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download all images in this shot as a zip file</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Generation Mode Toggle - Hidden on mobile, disabled look in read-only mode */}
            {!isMobile && (
              <ToggleGroup
                type="single"
                value={generationMode}
                onValueChange={(value) => {
                  if (!readOnly && value && (value === "batch" || value === "timeline")) {
                    onGenerationModeChange(value);
                  }
                }}
                className={`h-9 border rounded-md ${readOnly ? 'bg-muted/30 opacity-60 cursor-not-allowed' : 'bg-muted/50'}`}
                disabled={readOnly}
              >
                <ToggleGroupItem 
                  value="timeline" 
                  disabled={readOnly}
                  className={`text-sm px-3 h-9 font-medium ${readOnly ? 'cursor-not-allowed' : 'transition-all duration-300 ease-in-out data-[state=on]:scale-105 data-[state=on]:shadow-sm'}`}
                >
                  Timeline
                </ToggleGroupItem>
                <ToggleGroupItem 
                  value="batch" 
                  disabled={readOnly}
                  className={`text-sm px-3 h-9 font-medium ${readOnly ? 'cursor-not-allowed' : 'transition-all duration-300 ease-in-out data-[state=on]:scale-105 data-[state=on]:shadow-sm'}`}
                >
                  Batch
                </ToggleGroupItem>
              </ToggleGroup>
            )}

          </div>
        </div>
      </CardHeader>

      {/* Content - Show skeleton if not ready, otherwise show actual content */}
      {/* IMPORTANT: Don't unmount Timeline during refetches - use hasEverHadDataRef to prevent zoom reset */}
      <CardContent>
        {(() => {
          const showSkeleton = !isModeReady || (positionsLoading && !memoizedShotGenerations.length && !hasEverHadDataRef.current);
          console.log('[ZoomDebug] 🔵 ShotImagesEditor skeleton condition:', {
            showSkeleton,
            isModeReady,
            positionsLoading,
            shotGensLength: memoizedShotGenerations.length,
            hasEverHadData: hasEverHadDataRef.current,
            timestamp: Date.now()
          });
          return showSkeleton;
        })() ? (
          <div className="p-1">
            {/* Show section headers even in skeleton mode for batch mode */}
            {effectiveGenerationMode === "batch" && (
              <>
                <div className="mb-4">
                  <SectionHeader title="Input Images" theme="blue" />
                </div>
                {skeleton}
                
                {/* Show Guidance Video header and skeleton if enabled */}
                {selectedShotId && projectId && propOnStructureVideoChange && (
                  <>
                    <div className="mb-4 mt-6">
                      <SectionHeader title="Guidance Video" theme="green" />
                    </div>
                    {/* Guidance Video Upload Skeleton */}
                    <div className="mb-4">
                      <div className="w-full sm:w-2/3 md:w-1/2 lg:w-1/3 p-4 border rounded-lg bg-muted/20">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <Video className="h-8 w-8 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Add a motion guidance video to control the animation
                          </p>
                          <Skeleton className="w-full h-9" />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {effectiveGenerationMode === "timeline" && skeleton}
          </div>
        ) : (
          <div className="p-1">
            {effectiveGenerationMode === "timeline" ? (
              <>
              <Timeline
                key={`timeline-${selectedShotId}`}
                shotId={selectedShotId}
                projectId={projectId}
                frameSpacing={batchVideoFrames}
                onImageReorder={onImageReorder}
                onFramePositionsChange={onFramePositionsChange}
                onImageDrop={onImageDrop}
                onGenerationDrop={onGenerationDrop}
                pendingPositions={pendingPositions}
                onPendingPositionApplied={onPendingPositionApplied}
                onImageDelete={onImageDelete}
                onImageDuplicate={onImageDuplicate}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                projectAspectRatio={projectAspectRatio}
                readOnly={readOnly}
                // Pass shared data to prevent reloading
                // Pass ALL generations for lookups, but filtered images for display
                shotGenerations={preloadedImages ? undefined : memoizedShotGenerations}
                updateTimelineFrame={updateTimelineFrame}
                allGenerations={preloadedImages}
                images={images}
                onTimelineChange={async () => {
                  await loadPositions({ silent: true });
                }}
                // Pass shared hook data to prevent creating duplicate instances
                // BUT: Only pass if not using preloaded images (to avoid filtering conflict)
                hookData={preloadedImages ? undefined : hookData}
                onPairClick={(pairIndex, pairData) => {
                  setPairPromptModalData({
                    isOpen: true,
                    pairData,
                  });
                }}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
                onClearEnhancedPrompt={async (pairIndex) => {
                  console.log('[ClearEnhancedPrompt-Timeline] 🔵 Starting clear for pair index:', pairIndex);
                  console.log('[ClearEnhancedPrompt-Timeline] Total shotGenerations:', shotGenerations.length);
                  if (shotGenerations.length > 0) {
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0] keys:', Object.keys(shotGenerations[0]));
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].id:', shotGenerations[0].id); // shot_generations.id
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].generation_id:', shotGenerations[0].generation_id);
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].type:', shotGenerations[0].type);
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].location:', shotGenerations[0].location);
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].generation?.type:', shotGenerations[0].generation?.type);
                    console.log('[ClearEnhancedPrompt-Timeline] Sample generation [0].generation?.location:', shotGenerations[0].generation?.location);
                  }
                  try {
                    // Convert pairIndex to generation ID using the same logic as pair prompts
                    // Filter out videos to match the timeline display
                    // Uses isVideoAny which handles both flattened and nested data structures
                    const filteredGenerations = shotGenerations.filter((sg, idx) => {
                      const video = isVideoAny(sg);
                      
                      if (idx === 0) {
                        console.log('[ClearEnhancedPrompt-Timeline] Filter [0] isVideo:', video);
                        console.log('[ClearEnhancedPrompt-Timeline] Filter [0] returning:', !video);
                      }
                      
                      return !video;
                    });
                    console.log('[ClearEnhancedPrompt-Timeline] Filtered generations count:', filteredGenerations.length);

                    const sortedGenerations = [...filteredGenerations]
                      .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));
                    console.log('[ClearEnhancedPrompt-Timeline] Sorted generations count:', sortedGenerations.length);

                    // Get the first item of the pair
                    const firstItem = sortedGenerations[pairIndex];
                    if (!firstItem) {
                      console.error('[ClearEnhancedPrompt-Timeline] ❌ No generation found for pair index:', pairIndex);
                      return;
                    }

                    console.log('[ClearEnhancedPrompt-Timeline] 🎯 Found generation at pairIndex:', pairIndex);
                    console.log('[ClearEnhancedPrompt-Timeline] firstItem.id:', firstItem.id); // shot_generations.id
                    console.log('[ClearEnhancedPrompt-Timeline] firstItem.generation_id:', firstItem.generation_id);
                    console.log('[ClearEnhancedPrompt-Timeline] firstItem.hasMetadata:', !!firstItem.metadata);
                    console.log('[ClearEnhancedPrompt-Timeline] firstItem.hasEnhancedPrompt:', !!firstItem.metadata?.enhanced_prompt);
                    
                    // firstItem.id IS the shot_generations.id (unique per entry)
                    const idToUse = firstItem.id;
                    console.log('[ClearEnhancedPrompt-Timeline] 📞 Calling clearEnhancedPrompt with id:', idToUse);
                    
                    await clearEnhancedPrompt(idToUse);
                  } catch (error) {
                    console.error('[ClearEnhancedPrompt-Timeline] ❌ Error:', error);
                  }
                }}
                // Structure video props
                structureVideoPath={propStructureVideoPath}
                structureVideoMetadata={propStructureVideoMetadata}
                structureVideoTreatment={propStructureVideoTreatment}
                structureVideoMotionStrength={propStructureVideoMotionStrength}
                structureVideoType={propStructureVideoType}
                onStructureVideoChange={propOnStructureVideoChange}
                // Image upload for empty state
                onImageUpload={onImageUpload}
                isUploadingImage={isUploadingImage}
                uploadProgress={uploadProgress}
                // Shot management for external generation viewing
                allShots={allShots}
                selectedShotId={selectedShotId}
                onShotChange={onShotChange}
                onAddToShot={onAddToShot ? handleAddToShotAdapter : undefined}
                onAddToShotWithoutPosition={onAddToShotWithoutPosition ? handleAddToShotWithoutPositionAdapter : undefined}
                onCreateShot={onCreateShot ? async (shotName: string, files: File[]) => {
                  const shotId = await onCreateShot(shotName);
                  return { shotId, shotName };
                } : undefined}
              />
              
              {/* Helper for un-positioned generations - in timeline mode, show after timeline */}
              <div className="mt-4" style={{ minHeight: unpositionedGenerationsCount > 0 ? '40px' : '0px' }}>
                {unpositionedGenerationsCount > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
                    <div className="text-sm text-muted-foreground">
                      {unpositionedGenerationsCount} unpositioned generation{unpositionedGenerationsCount !== 1 ? 's' : ''}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={onOpenUnpositionedPane}
                      className="text-xs"
                    >
                      View & Position
                    </Button>
                  </div>
                )}
              </div>
              </>
            ) : (
              <>
                {/* Subheader for input images */}
                <div className="mb-4">
                  <SectionHeader title="Input Images" theme="blue" />
                </div>
                
                <ShotImageManager
                  images={images}
                  onImageDelete={handleDelete}
                  onBatchImageDelete={onBatchImageDelete}
                  onImageDuplicate={onImageDuplicate}
                  onImageReorder={handleReorder}
                  columns={columns}
                  generationMode={isMobile ? "batch" : generationMode}
                  onMagicEdit={(imageUrl, prompt, numImages) => {
                    // TODO: Wire through real magic-edit handler later.
                    console.log("Magic Edit:", { imageUrl, prompt, numImages });
                  }}
                  duplicatingImageId={duplicatingImageId}
                  duplicateSuccessImageId={duplicateSuccessImageId}
                  projectAspectRatio={projectAspectRatio}
                  onImageUpload={onImageUpload}
                  isUploadingImage={isUploadingImage}
                  batchVideoFrames={batchVideoFrames}
                  onSelectionChange={onSelectionChange}
                  readOnly={readOnly}
                  onFileDrop={onBatchFileDrop}
                  onGenerationDrop={onBatchGenerationDrop}
                  shotId={selectedShotId}
                  toolTypeOverride="travel-between-images"
                  // Shot management for external generation viewing
                  allShots={allShots}
                  selectedShotId={selectedShotId}
                  onShotChange={onShotChange}
                  onAddToShot={(() => {
                    const result = onAddToShot ? handleAddToShotAdapter : undefined;
                    console.log('[ShotSelectorDebug] ShotImagesEditor -> ShotImageManager onAddToShot', {
                      component: 'ShotImagesEditor',
                      hasOnAddToShot: !!onAddToShot,
                      hasAdapter: !!handleAddToShotAdapter,
                      finalOnAddToShot: !!result,
                      allShotsLength: allShots?.length || 0,
                      selectedShotId: selectedShotId
                    });
                    return result;
                  })()}
                  onAddToShotWithoutPosition={onAddToShotWithoutPosition ? handleAddToShotWithoutPositionAdapter : undefined}
                  onCreateShot={onCreateShot ? async (shotName: string, files: File[]) => {
                    const shotId = await onCreateShot(shotName);
                    return { shotId, shotName };
                  } : undefined}
                  // Pair prompt props
                  onPairClick={(pairIndex, pairData) => {
                    console.log('[PairIndicatorDebug] ShotImagesEditor onPairClick called', { pairIndex, pairData });
                    setPairPromptModalData({
                      isOpen: true,
                      pairData,
                    });
                  }}
                  pairPrompts={(() => {
                    // Convert pairPrompts from useEnhancedShotPositions to the format expected by ShotImageManager
                    const result: Record<number, { prompt: string; negativePrompt: string }> = {};
                    shotGenerations.forEach((sg, index) => {
                      const prompt = sg.metadata?.pair_prompt || "";
                      const negativePrompt = sg.metadata?.pair_negative_prompt || "";
                      if (prompt || negativePrompt) {
                        result[index] = { prompt, negativePrompt };
                      }
                    });
                    console.log('[PairIndicatorDebug] ShotImagesEditor pairPrompts:', {
                      shotGenerationsCount: shotGenerations.length,
                      resultKeys: Object.keys(result),
                      result
                    });
                    return result;
                  })()}
                  enhancedPrompts={(() => {
                    // Convert enhanced prompts to index-based format
                    const result: Record<number, string> = {};
                    shotGenerations.forEach((sg, index) => {
                      const enhancedPrompt = sg.metadata?.enhanced_prompt;
                      if (enhancedPrompt) {
                        result[index] = enhancedPrompt;
                      }
                    });
                    console.log('[PairIndicatorDebug] ShotImagesEditor enhancedPrompts:', {
                      shotGenerationsCount: shotGenerations.length,
                      resultKeys: Object.keys(result),
                    });
                    return result;
                  })()}
                  defaultPrompt={defaultPrompt}
                  defaultNegativePrompt={defaultNegativePrompt}
                  onClearEnhancedPrompt={async (pairIndex) => {
                    try {
                      console.log('[ClearEnhancedPrompt-Batch] 🔵 Starting clear for pair index:', pairIndex);
                      console.log('[ClearEnhancedPrompt-Batch] Total shotGenerations:', shotGenerations.length);
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].id:', shotGenerations[0]?.id);
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].id:', shotGenerations[0]?.id); // shot_generations.id
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].generation_id:', shotGenerations[0]?.generation_id);
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].type:', shotGenerations[0]?.type);
                      console.log('[ClearEnhancedPrompt-Batch] Sample generation [0].generation?.type:', shotGenerations[0]?.generation?.type);
                      
                      // Convert pairIndex to generation ID using the same logic as pair prompts
                      // Filter out videos to match the display
                      // Uses isVideoAny which handles both flattened and nested data structures
                      const filteredGenerations = shotGenerations.filter(sg => !isVideoAny(sg));

                      console.log('[ClearEnhancedPrompt-Batch] Filtered generations count:', filteredGenerations.length);

                      const sortedGenerations = [...filteredGenerations]
                        .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));

                      console.log('[ClearEnhancedPrompt-Batch] Sorted generations count:', sortedGenerations.length);
                      sortedGenerations.forEach((sg, i) => {
                        console.log(`[ClearEnhancedPrompt-Batch] Sorted[${i}].id:`, sg.id?.substring(0, 8));
                        console.log(`[ClearEnhancedPrompt-Batch] Sorted[${i}].timeline_frame:`, sg.timeline_frame);
                        console.log(`[ClearEnhancedPrompt-Batch] Sorted[${i}].hasEnhancedPrompt:`, !!sg.metadata?.enhanced_prompt);
                      });

                      // Get the first item of the pair
                      const firstItem = sortedGenerations[pairIndex];
                      if (!firstItem) {
                        console.error('[ClearEnhancedPrompt-Batch] ❌ No generation found for pair index:', pairIndex);
                        return;
                      }

                      console.log('[ClearEnhancedPrompt-Batch] 🎯 Found generation at pairIndex:', pairIndex);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.id:', firstItem.id);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.id (short):', firstItem.id?.substring(0, 8));
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.generation_id:', firstItem.generation_id);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.id (short):', firstItem.id?.substring(0, 8)); // shot_generations.id
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.generation_id (short):', firstItem.generation_id?.substring(0, 8));
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.hasMetadata:', !!firstItem.metadata);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.hasEnhancedPrompt:', !!firstItem.metadata?.enhanced_prompt);
                      console.log('[ClearEnhancedPrompt-Batch] firstItem.enhancedPromptPreview:', firstItem.metadata?.enhanced_prompt?.substring(0, 50));
                      
                      // The clearEnhancedPrompt function expects shot_generation.id
                      // CRITICAL: firstItem.id IS the shot_generation.id (unique per entry)
                      const shotGenerationId = firstItem.id;
                      
                      console.log('[ClearEnhancedPrompt-Batch] 📞 Calling clearEnhancedPrompt with shot_generation.id:', shotGenerationId);
                      console.log('[ClearEnhancedPrompt-Batch] shot_generation.id (short):', shotGenerationId?.substring(0, 8));
                      await clearEnhancedPrompt(shotGenerationId);
                      console.log('[ClearEnhancedPrompt-Batch] ✅ clearEnhancedPrompt completed');
                    } catch (error) {
                      console.error('[ClearEnhancedPrompt-Batch] ❌ Error:', error);
                    }
                  }}
                />
                
                {/* Helper for un-positioned generations - in batch mode, show after input images */}
                <div className="mt-4" style={{ minHeight: unpositionedGenerationsCount > 0 ? '40px' : '0px' }}>
                  {unpositionedGenerationsCount > 0 && (
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
                      <div className="text-sm text-muted-foreground">
                        {unpositionedGenerationsCount} unpositioned generation{unpositionedGenerationsCount !== 1 ? 's' : ''}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={onOpenUnpositionedPane}
                        className="text-xs"
                      >
                        View & Position
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* Batch mode structure video (hidden in readOnly when no video exists) */}
                {selectedShotId && projectId && propOnStructureVideoChange && (propStructureVideoPath || !readOnly) && (
                  <>
                    <div className="mb-4 mt-6">
                      <SectionHeader title="Guidance Video" theme="green" />
                    </div>
                    <BatchGuidanceVideo
                      shotId={selectedShotId}
                      projectId={projectId}
                      videoUrl={propStructureVideoPath}
                      videoMetadata={propStructureVideoMetadata}
                      treatment={propStructureVideoTreatment}
                      motionStrength={propStructureVideoMotionStrength}
                      structureType={propStructureVideoType}
                      imageCount={images.length}
                      timelineFramePositions={images.map((img, index) => index * batchVideoFrames)}
                      onVideoUploaded={(videoUrl, metadata, resourceId) => {
                        propOnStructureVideoChange(
                          videoUrl,
                          metadata,
                          propStructureVideoTreatment,
                          propStructureVideoMotionStrength,
                          propStructureVideoType,
                          resourceId
                        );
                      }}
                      onTreatmentChange={(treatment) => {
                        if (propStructureVideoPath && propStructureVideoMetadata) {
                          propOnStructureVideoChange(
                            propStructureVideoPath,
                            propStructureVideoMetadata,
                            treatment,
                            propStructureVideoMotionStrength,
                            propStructureVideoType
                          );
                        }
                      }}
                      onMotionStrengthChange={(strength) => {
                        if (propStructureVideoPath && propStructureVideoMetadata) {
                          propOnStructureVideoChange(
                            propStructureVideoPath,
                            propStructureVideoMetadata,
                            propStructureVideoTreatment,
                            strength,
                            propStructureVideoType
                          );
                        }
                      }}
                      onStructureTypeChange={(type) => {
                        // Always save structure type selection, even if no video uploaded yet
                        // When video is uploaded, it will use the pre-selected type
                        propOnStructureVideoChange(
                          propStructureVideoPath,
                          propStructureVideoMetadata,
                          propStructureVideoTreatment,
                          propStructureVideoMotionStrength,
                          type
                        );
                      }}
                      readOnly={readOnly}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* Pair Prompt Modal */}
      <PairPromptModal
        isOpen={pairPromptModalData.isOpen}
        onClose={() => setPairPromptModalData({ isOpen: false, pairData: null })}
        pairData={pairPromptModalData.pairData}
        readOnly={readOnly}
        pairPrompt={(() => {
          // CRITICAL: Read prompt from the exact shot_generation being displayed
          // Look up by id (which is the shot_generation.id)
          if (!pairPromptModalData.pairData?.startImage?.id) {
            return "";
          }
          const shotGen = shotGenerations.find(sg => sg.id === pairPromptModalData.pairData.startImage.id);
          const prompt = shotGen?.metadata?.pair_prompt || "";
          
          // Only log when modal is actually open
          if (pairPromptModalData.isOpen) {
            console.log('[PairPromptFlow] 📖 Looking for ID:', pairPromptModalData.pairData.startImage.id.substring(0, 8));
            console.log('[PairPromptFlow] 📖 Total shotGenerations:', shotGenerations.length);
            console.log('[PairPromptFlow] 📖 Found in array?', !!shotGen);
            console.log('[PairPromptFlow] 📖 Source:', preloadedImages ? 'preloadedImages' : 'dbShotGenerations');
            console.log('[PairPromptFlow] 📖 Received prompt:', prompt || '(empty)');
            
            // Show ALL available IDs
            const allIds = shotGenerations.map((sg, i) => ({
              index: i,
              id: sg.id?.substring(0, 8), // shot_generations.id
              generation_id: sg.generation_id?.substring(0, 8),
              hasMetadata: !!sg.metadata,
              hasPairPrompt: !!sg.metadata?.pair_prompt,
            }));
            console.log('[PairPromptFlow] 📖 ALL IDs in shotGenerations:', allIds);
          }
          return prompt;
        })()}
        pairNegativePrompt={(() => {
          // CRITICAL: Read negative prompt from the exact shot_generation being displayed
          // Look up by id (which is the shot_generation.id)
          if (!pairPromptModalData.pairData?.startImage?.id) return "";
          const shotGen = shotGenerations.find(sg => sg.id === pairPromptModalData.pairData.startImage.id);
          return shotGen?.metadata?.pair_negative_prompt || "";
        })()}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
        onNavigatePrevious={(() => {
          if (!pairPromptModalData.pairData) return undefined;
          const currentIndex = pairPromptModalData.pairData.index;
          if (currentIndex <= 0) return undefined;
          
          // Calculate previous pair data
          return () => {
            const sortedImages = [...shotGenerations]
              .filter(sg => sg.timeline_frame != null && sg.timeline_frame >= 0)
              .sort((a, b) => a.timeline_frame! - b.timeline_frame!);
            
            if (sortedImages.length < 2) return;
            
            const prevIndex = currentIndex - 1;
            if (prevIndex < 0 || prevIndex >= sortedImages.length - 1) return;
            
            const startImage = sortedImages[prevIndex];
            const endImage = sortedImages[prevIndex + 1];
            
            // Access location from flattened GenerationRow structure
            const startLocation = startImage.imageUrl || startImage.location;
            const endLocation = endImage.imageUrl || endImage.location;
            
            setPairPromptModalData({
              isOpen: true,
              pairData: {
                index: prevIndex,
                frames: endImage.timeline_frame! - startImage.timeline_frame!,
                startFrame: startImage.timeline_frame!,
                endFrame: endImage.timeline_frame!,
                startImage: {
                  id: startImage.id, // shot_generations.id
                  url: startLocation,
                  thumbUrl: startLocation,
                  timeline_frame: startImage.timeline_frame!,
                  position: prevIndex + 1,
                },
                endImage: {
                  id: endImage.id, // shot_generations.id
                  url: endLocation,
                  thumbUrl: endLocation,
                  timeline_frame: endImage.timeline_frame!,
                  position: prevIndex + 2,
                },
              },
            });
          };
        })()}
        onNavigateNext={(() => {
          if (!pairPromptModalData.pairData) return undefined;
          const currentIndex = pairPromptModalData.pairData.index;
          
          // Calculate if there's a next pair
          const sortedImages = [...shotGenerations]
            .filter(sg => sg.timeline_frame != null && sg.timeline_frame >= 0)
            .sort((a, b) => a.timeline_frame! - b.timeline_frame!);
          
          if (currentIndex >= sortedImages.length - 2) return undefined;
          
          // Calculate next pair data
          return () => {
            const nextIndex = currentIndex + 1;
            if (nextIndex < 0 || nextIndex >= sortedImages.length - 1) return;
            
            const startImage = sortedImages[nextIndex];
            const endImage = sortedImages[nextIndex + 1];
            
            // Access location from flattened GenerationRow structure
            const startLocation = startImage.imageUrl || startImage.location;
            const endLocation = endImage.imageUrl || endImage.location;
            
            setPairPromptModalData({
              isOpen: true,
              pairData: {
                index: nextIndex,
                frames: endImage.timeline_frame! - startImage.timeline_frame!,
                startFrame: startImage.timeline_frame!,
                endFrame: endImage.timeline_frame!,
                startImage: {
                  id: startImage.id, // shot_generations.id
                  url: startLocation,
                  thumbUrl: startLocation,
                  timeline_frame: startImage.timeline_frame!,
                  position: nextIndex + 1,
                },
                endImage: {
                  id: endImage.id, // shot_generations.id
                  url: endLocation,
                  thumbUrl: endLocation,
                  timeline_frame: endImage.timeline_frame!,
                  position: nextIndex + 2,
                },
              },
            });
          };
        })()}
        hasPrevious={(() => {
          if (!pairPromptModalData.pairData) return false;
          return pairPromptModalData.pairData.index > 0;
        })()}
        hasNext={(() => {
          if (!pairPromptModalData.pairData) return false;
          const sortedImages = [...shotGenerations]
            .filter(sg => sg.timeline_frame != null && sg.timeline_frame >= 0)
            .sort((a, b) => a.timeline_frame! - b.timeline_frame!);
          
          console.log('[PairPromptFlow] 📊 hasNext calculation:', {
            currentPairIndex: pairPromptModalData.pairData.index,
            totalSortedImages: sortedImages.length,
            totalPairs: sortedImages.length - 1,
            hasNext: pairPromptModalData.pairData.index < sortedImages.length - 2,
          });
          
          return pairPromptModalData.pairData.index < sortedImages.length - 2;
        })()}
        onSave={async (pairIndex, prompt, negativePrompt) => {
          try {
            console.log('[PairPromptFlow] 📥 ONSAVE CALLBACK RECEIVED:', {
              pairIndex,
              promptLength: prompt?.length || 0,
              negativePromptLength: negativePrompt?.length || 0,
              hasPrompt: !!prompt,
              hasNegativePrompt: !!negativePrompt,
            });
            
            // CRITICAL FIX: Use the actual shot_generation.id from the timeline
            // instead of recalculating it from index (which can be wrong with duplicates)
            const shotGenerationId = pairPromptModalData.pairData?.startImage?.id;
            
            if (!shotGenerationId) {
              console.error('[PairPromptFlow] ❌ No shot_generation.id found in pairData:', pairPromptModalData.pairData);
              return;
            }
            
            console.log(`[PairPromptFlow] 🎯 CALLING updatePairPrompts for Pair ${pairIndex + 1}:`, {
              shotGenerationId: shotGenerationId.substring(0, 8),
              fullShotGenerationId: shotGenerationId,
              prompt: prompt?.substring(0, 50) + (prompt?.length > 50 ? '...' : ''),
              negativePrompt: negativePrompt?.substring(0, 50) + (negativePrompt?.length > 50 ? '...' : ''),
              startFrame: pairPromptModalData.pairData?.startFrame,
              endFrame: pairPromptModalData.pairData?.endFrame,
            });
            
            await updatePairPrompts(shotGenerationId, prompt, negativePrompt);
            
            console.log(`[PairPromptFlow] ✅ updatePairPrompts COMPLETED for Pair ${pairIndex + 1}`);
            // Timeline now uses shared hook data, so changes are reactive
          } catch (error) {
            console.error(`[PairPromptFlow] ❌ FAILED to save prompts for Pair ${pairIndex + 1}:`, error);
          }
        }}
      />
    </Card>
  );
};

// [PERFORMANCE] Wrap in React.memo to prevent re-renders when props haven't meaningfully changed
// This is critical because parent (ShotEditor) re-renders frequently due to settings queries
export default React.memo(ShotImagesEditor);
