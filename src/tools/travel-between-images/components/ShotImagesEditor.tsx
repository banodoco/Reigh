import React, { useState } from "react";
import { GenerationRow } from "@/types/shots";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import ShotImageManager from "@/shared/components/ShotImageManager";
import Timeline from "./Timeline"; // Main timeline component with drag/drop and image actions
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import FileInput from "@/shared/components/FileInput";
import { useEnhancedShotPositions } from "@/shared/hooks/useEnhancedShotPositions";
import { useEnhancedShotImageReorder } from "@/shared/hooks/useEnhancedShotImageReorder";
import PairPromptModal from "./Timeline/PairPromptModal";

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
  /** Frame spacing (frames between key-frames) */
  batchVideoFrames: number;
  /** Context frames value */
  batchVideoContext: number;
  /** Reordering callback – receives ordered ids */
  onImageReorder: (orderedIds: string[]) => void;
  /** Image saved callback (e.g. after in-place edit) */
  onImageSaved: (imageId: string, newImageUrl: string, createNew?: boolean) => Promise<void>;
  /** Context frames change */
  onContextFramesChange: (context: number) => void;
  /** Timeline frame positions change */
  onFramePositionsChange: (newPositions: Map<string, number>) => void;
  /** Callback when external images are dropped on the timeline */
  onImageDrop: (files: File[], targetFrame?: number) => Promise<void>;
  /** Map of pending frame positions coming from server */
  pendingPositions: Map<string, number>;
  /** Callback when pending position is applied */
  onPendingPositionApplied: (generationId: string) => void;
  /** Image deletion callback */
  onImageDelete: (shotImageEntryId: string) => void;
  /** Image duplication callback */
  onImageDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
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
}

// Force TypeScript to re-evaluate this interface

const ShotImagesEditor: React.FC<ShotImagesEditorProps> = ({
  isModeReady,
  settingsError,
  isMobile,
  generationMode,
  onGenerationModeChange,
  selectedShotId,
  batchVideoFrames,
  batchVideoContext,
  onImageReorder,
  onImageSaved,
  onContextFramesChange,
  onFramePositionsChange,
  onImageDrop,
  pendingPositions,
  onPendingPositionApplied,
  onImageDelete,
  onImageDuplicate,
  columns,
  skeleton,
  unpositionedGenerationsCount,
  onOpenUnpositionedPane,
  fileInputKey,
  onImageUpload,
  isUploadingImage,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  defaultPrompt = "",
  onDefaultPromptChange,
  defaultNegativePrompt = "",
  onDefaultNegativePromptChange,
}) => {
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
      } | null;
      endImage?: {
        id: string;
        url?: string;
        thumbUrl?: string;
        timeline_frame: number;
      } | null;
    } | null;
  }>({
    isOpen: false,
    pairData: null,
  });


  // Enhanced position management
  // Centralized position management - shared between Timeline and ShotImageManager
  const { 
    getImagesForMode, 
    isLoading: positionsLoading,
    shotGenerations,
    updateTimelineFrame,
    exchangePositions,
    batchExchangePositions,
    deleteItem,
    loadPositions,
    getPairPrompts,
    updatePairPromptsByIndex
  } = useEnhancedShotPositions(selectedShotId);
  
  // Get pair prompts from the enhanced shot positions hook
  const pairPrompts = getPairPrompts();
  
  // Enhanced reorder management for batch mode - pass parent hook to avoid duplication
  const { handleReorder, handleDelete } = useEnhancedShotImageReorder(selectedShotId, {
    shotGenerations,
    getImagesForMode,
    exchangePositions,
    batchExchangePositions,
    deleteItem,
    loadPositions,
    isLoading: positionsLoading
  });

  // Memoize images and shotGenerations to prevent infinite re-renders in Timeline
  const images = React.useMemo(() => {
    return getImagesForMode(generationMode);
  }, [getImagesForMode, generationMode]);

  // Memoize shotGenerations to prevent reference changes
  const memoizedShotGenerations = React.useMemo(() => {
    return shotGenerations;
  }, [shotGenerations]);

  // Note: Pair prompts cleanup is handled automatically by the database
  // when shot_generations are deleted, since prompts are stored in their metadata

    console.log('[ShotImagesEditor] Render:', {
    selectedShotId,
    generationMode,
    imagesCount: images.length,
    positionsLoading,
    isModeReady
  });

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg font-light">
            Input Images
            {settingsError && (
              <div className="text-sm text-destructive mt-1">
                {settingsError}
              </div>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Generation Mode Toggle */}
            <ToggleGroup
              type="single"
              value={generationMode}
              onValueChange={(value) => {
                if (value && (value === "batch" || value === "timeline")) {
                  onGenerationModeChange(value);
                }
              }}
              className="h-8"
            >
              <ToggleGroupItem value="timeline" className="text-xs px-2 h-8">
                Timeline
              </ToggleGroupItem>
              <ToggleGroupItem value="batch" className="text-xs px-2 h-8">
                Batch
              </ToggleGroupItem>
            </ToggleGroup>

          </div>
        </div>
      </CardHeader>

      {/* Content - Show skeleton if not ready, otherwise show actual content */}
      <CardContent>
        {!isModeReady || (positionsLoading && !memoizedShotGenerations.length) ? (
          <div className="p-1">
            {skeleton}
          </div>
        ) : (
          <div className="p-1">
            {generationMode === "timeline" ? (
              <>
                <Timeline
                shotId={selectedShotId}
                frameSpacing={batchVideoFrames}
                contextFrames={batchVideoContext}
                onImageReorder={onImageReorder}
                onImageSaved={onImageSaved}
                onContextFramesChange={onContextFramesChange}
                onFramePositionsChange={onFramePositionsChange}
                onImageDrop={onImageDrop}
                pendingPositions={pendingPositions}
                onPendingPositionApplied={onPendingPositionApplied}
                onImageDelete={onImageDelete}
                onImageDuplicate={onImageDuplicate}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                projectAspectRatio={projectAspectRatio}
                // Pass shared data to prevent reloading
                shotGenerations={memoizedShotGenerations}
                updateTimelineFrame={updateTimelineFrame}
                images={images}
                onTimelineChange={() => loadPositions({ silent: true })}
                onPairClick={(pairIndex, pairData) => {
                  setPairPromptModalData({
                    isOpen: true,
                    pairData,
                  });
                }}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
              />
              </>
            ) : (
              <ShotImageManager
                images={images}
                onImageDelete={handleDelete}
                onImageDuplicate={onImageDuplicate}
                onImageReorder={handleReorder}
                columns={columns}
                generationMode={isMobile ? "batch" : generationMode}
                onImageSaved={onImageSaved}
                onMagicEdit={(imageUrl, prompt, numImages) => {
                  // TODO: Wire through real magic-edit handler later.
                  console.log("Magic Edit:", { imageUrl, prompt, numImages });
                }}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                projectAspectRatio={projectAspectRatio}
              />
            )}
          </div>
        )}

        {/* Upload Input - Moved below images */}
        <div className="mt-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full">
                  <FileInput
                    key={fileInputKey}
                    onFileChange={(files) => { onImageUpload(files); }}
                    acceptTypes={["image"]}
                    multiple
                    disabled={isUploadingImage}
                    label={isUploadingImage ? "Uploading..." : "Add Images"}
                    className="w-full"
                    suppressAcceptedTypes
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Upload new images to this shot</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Helper for un-positioned generations - Reserve space during loading to prevent layout shift */}
        <div className="mx-1 mt-4" style={{ minHeight: unpositionedGenerationsCount > 0 ? '40px' : '0px' }}>
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
      </CardContent>

      {/* Pair Prompt Modal */}
      <PairPromptModal
        isOpen={pairPromptModalData.isOpen}
        onClose={() => setPairPromptModalData({ isOpen: false, pairData: null })}
        pairData={pairPromptModalData.pairData}
        pairPrompt={pairPromptModalData.pairData ? (pairPrompts[pairPromptModalData.pairData.index]?.prompt || "") : ""}
        pairNegativePrompt={pairPromptModalData.pairData ? (pairPrompts[pairPromptModalData.pairData.index]?.negativePrompt || "") : ""}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
          onSave={async (pairIndex, prompt, negativePrompt) => {
            try {
              await updatePairPromptsByIndex(pairIndex, prompt, negativePrompt);
              console.log(`[PairPrompts] Saved prompts for Pair ${pairIndex + 1}:`, { prompt, negativePrompt });
            } catch (error) {
              console.error(`[PairPrompts] Failed to save prompts for Pair ${pairIndex + 1}:`, error);
            }
                }}
              />
    </Card>
  );
};

export default ShotImagesEditor;
