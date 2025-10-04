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
import PairPromptModal from "./Timeline/PairPromptModal";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getDisplayUrl } from '@/shared/lib/utils';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import { BatchGuidanceVideo } from './BatchGuidanceVideo';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';

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
  /** Project id for video uploads */
  projectId?: string;
  /** Shot name for download filename */
  shotName?: string;
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
  /** Batch image deletion callback */
  onBatchImageDelete?: (shotImageEntryIds: string[]) => void;
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
    structureType: 'flow' | 'canny' | 'depth'
  ) => void;
}

// Force TypeScript to re-evaluate this interface

const ShotImagesEditor: React.FC<ShotImagesEditorProps> = ({
  isModeReady,
  settingsError,
  isMobile,
  generationMode,
  onGenerationModeChange,
  selectedShotId,
  projectId,
  shotName,
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
  onBatchImageDelete,
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
  // Structure video props
  structureVideoPath: propStructureVideoPath,
  structureVideoMetadata: propStructureVideoMetadata,
  structureVideoTreatment: propStructureVideoTreatment = 'adjust',
  structureVideoMotionStrength: propStructureVideoMotionStrength = 1.0,
  structureVideoType: propStructureVideoType = 'flow',
  onStructureVideoChange: propOnStructureVideoChange,
}) => {
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
  const hookData = useEnhancedShotPositions(selectedShotId);
  const {
    getImagesForMode,
    isLoading: positionsLoading,
    shotGenerations,
    updateTimelineFrame,
    exchangePositions,
    exchangePositionsNoReload,
    batchExchangePositions,
    deleteItem,
    loadPositions,
    pairPrompts, // Use reactive pairPrompts value directly
    updatePairPromptsByIndex
  } = hookData;
  
  // Enhanced reorder management for batch mode - pass parent hook to avoid duplication
  const { handleReorder, handleDelete } = useEnhancedShotImageReorder(selectedShotId, {
    shotGenerations,
    getImagesForMode,
    exchangePositions,
    exchangePositionsNoReload,
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
            
            {/* Download All Images Button - Icon only, next to title */}
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
          </div>
          
          <div className="flex items-center gap-2">
            {/* Generation Mode Toggle - Hidden on mobile */}
            {!isMobile && (
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
            )}

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
            {effectiveGenerationMode === "timeline" ? (
              <>
              <Timeline
                key={`timeline-${selectedShotId}-${memoizedShotGenerations.length}-${images.length}`}
                shotId={selectedShotId}
                projectId={projectId}
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
                onTimelineChange={async () => {
                  console.log('[ShotImagesEditor] 🔄 TIMELINE CHANGE - Reloading parent data');
                  await loadPositions({ silent: true });
                }}
                // Pass shared hook data to prevent creating duplicate instances
                hookData={hookData}
                onPairClick={(pairIndex, pairData) => {
                  setPairPromptModalData({
                    isOpen: true,
                    pairData,
                  });
                }}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
                // Structure video props
                structureVideoPath={propStructureVideoPath}
                structureVideoMetadata={propStructureVideoMetadata}
                structureVideoTreatment={propStructureVideoTreatment}
                structureVideoMotionStrength={propStructureVideoMotionStrength}
                structureVideoType={propStructureVideoType}
                onStructureVideoChange={propOnStructureVideoChange}
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
                  onImageSaved={onImageSaved}
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
                
                {/* Batch mode structure video */}
                {selectedShotId && projectId && propOnStructureVideoChange && (
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
                    onVideoUploaded={(videoUrl, metadata) => {
                      propOnStructureVideoChange(
                        videoUrl,
                        metadata,
                        propStructureVideoTreatment,
                        propStructureVideoMotionStrength,
                        propStructureVideoType
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
        pairPrompt={pairPromptModalData.pairData ? (pairPrompts[pairPromptModalData.pairData.index]?.prompt || "") : ""}
        pairNegativePrompt={pairPromptModalData.pairData ? (pairPrompts[pairPromptModalData.pairData.index]?.negativePrompt || "") : ""}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
          onSave={async (pairIndex, prompt, negativePrompt) => {
            try {
              await updatePairPromptsByIndex(pairIndex, prompt, negativePrompt);
              console.log(`[PairPrompts] Saved prompts for Pair ${pairIndex + 1}:`, { prompt, negativePrompt });
              // Timeline now uses shared hook data, so changes are reactive
            } catch (error) {
              console.error(`[PairPrompts] Failed to save prompts for Pair ${pairIndex + 1}:`, error);
            }
                }}
              />
    </Card>
  );
};

export default ShotImagesEditor;
