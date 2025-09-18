import React from "react";
import { GenerationRow } from "@/types/shots";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import ShotImageManager from "@/shared/components/ShotImageManager";
import Timeline from "@/tools/travel-between-images/components/Timeline";
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import FileInput from "@/shared/components/FileInput";

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
  /** Non-video images belonging to the shot */
  images: GenerationRow[];
  /** Selected shot id (needed by Timeline) */
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
  /** Notify parent when pending position has been applied */
  onPendingPositionApplied: (generationId: string) => void;
  /** Delete callback for ShotImageManager */
  onImageDelete: (shotImageEntryId: string) => void;
  /** Duplicate callback for ShotImageManager */
  onImageDuplicate: (shotImageEntryId: string, position: number) => void;
  /** Number of columns for ShotImageManager grid */
  columns: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  /** Selected mode for conditional UI */
  selectedMode?: 'Full Throttle' | 'Steady Sprint' | 'Zippy Supreme';
  /** Skeleton shown while data is loading */
  skeleton?: React.ReactNode;
  /** Count of generations without position – if >0 we’ll show the helper message */
  unpositionedGenerationsCount?: number;
  /** Handler to open the Generations pane when user clicks helper */
  onOpenUnpositionedPane?: () => void;
  /** File input key so the element can be reset */
  fileInputKey: number;
  /** Upload handler for adding new images */
  onImageUpload: (files: File[]) => void;
  /** Whether an upload is currently in progress */
  isUploadingImage: boolean;
  /** ID of image currently being duplicated (for loading state) */
  duplicatingImageId?: string | null;
  /** ID of image that was successfully duplicated (for success state) */
  duplicateSuccessImageId?: string | null;
  /** Project aspect ratio for proper placeholder dimensions */
  projectAspectRatio?: string;
}

const ShotImagesEditor: React.FC<ShotImagesEditorProps> = ({
  isModeReady,
  settingsError,
  isMobile,
  generationMode,
  onGenerationModeChange,
  images,
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
  selectedMode,
  skeleton,
  unpositionedGenerationsCount = 0,
  onOpenUnpositionedPane,
  fileInputKey,
  onImageUpload,
  isUploadingImage,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
}) => {
  // Light performance tracking - only log significant events
  const renderCountRef = React.useRef(0);
  const mountTimeRef = React.useRef(Date.now());

  React.useEffect(() => {
    renderCountRef.current++;
    // Only log every 10th render or when switching shots
    if (renderCountRef.current % 10 === 0 || renderCountRef.current === 1) {
      console.log('[PERF] ShotImagesEditor:', {
        renderCount: renderCountRef.current,
        selectedShotId,
        imagesCount: images.length,
        isModeReady,
        totalTime: Date.now() - mountTimeRef.current
      });
    }
  });
  /* ------------------------------------------------------------------ */
  /* Main card with immediate header rendering                          */
  /* ------------------------------------------------------------------ */
  return (
    <Card className="flex flex-col">
      {/* Header - Always render immediately (static content) */}
      <CardHeader>
        {settingsError && (
          <div className="mb-4 p-3 rounded bg-yellow-100 text-yellow-800 text-sm">
            {settingsError}
          </div>
        )}
        <div className="flex items-center justify-between">
          <CardTitle>Manage Shot</CardTitle>
          {!isMobile && (
            <div className="flex flex-col items-end space-y-1">
              <ToggleGroup
                type="single"
                value={generationMode}
                onValueChange={(value: "batch" | "timeline") => value && onGenerationModeChange(value)}
                size="sm"
                disabled={!isModeReady}
              >
                <ToggleGroupItem value="batch" aria-label="Toggle batch">
                  Batch
                </ToggleGroupItem>
                <ToggleGroupItem value="timeline" aria-label="Toggle timeline">
                  Timeline
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
      </CardHeader>

      {/* Content - Show skeleton if not ready, otherwise show actual content */}
      <CardContent>
        {!isModeReady ? (
          <div className="p-1">
            {skeleton}
          </div>
        ) : (
          <div className="p-1">
            {generationMode === "timeline" ? (
              <Timeline
                shotId={selectedShotId}
                images={images}
                frameSpacing={batchVideoFrames}
                contextFrames={batchVideoContext}
                onImageReorder={onImageReorder}
                onImageSaved={onImageSaved}
                onContextFramesChange={onContextFramesChange}
                onFramePositionsChange={onFramePositionsChange}
                onImageDrop={onImageDrop}
                pendingPositions={pendingPositions}
                onPendingPositionApplied={onPendingPositionApplied}
              />
            ) : (
              <ShotImageManager
                images={images}
                onImageDelete={onImageDelete}
                onImageDuplicate={onImageDuplicate}
                onImageReorder={onImageReorder}
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

        {/* Helper for un-positioned generations - Reserve space during loading to prevent layout shift */}
        <div className="mx-1 mt-4" style={{ minHeight: isModeReady && unpositionedGenerationsCount > 0 ? 'auto' : '0px' }}>
          {isModeReady && unpositionedGenerationsCount > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg flex items-center justify-between animate-in fade-in duration-300">
              <span className="text-sm text-muted-foreground">
                There {unpositionedGenerationsCount === 1 ? "is" : "are"} {unpositionedGenerationsCount} generation
                {unpositionedGenerationsCount === 1 ? "" : "s"} associated with this shot that {unpositionedGenerationsCount === 1 ? "doesn't" : "don't"} have a position
              </span>
              <Button variant="outline" size="sm" onClick={onOpenUnpositionedPane}>
                Open Pane
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {/* File input - Always visible, only disabled during uploads */}
      <div className="p-4 border-t space-y-3">
        <FileInput
          key={fileInputKey}
          onFileChange={onImageUpload}
          acceptTypes={["image"]}
          label="Add more images"
          disabled={isUploadingImage}
          multiple
        />
      </div>
    </Card>
  );
};

export default ShotImagesEditor; 