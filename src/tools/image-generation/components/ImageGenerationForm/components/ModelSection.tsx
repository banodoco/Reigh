import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Trash2, Images, Plus, X, Upload, Search, Globe, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import FileInput from "@/shared/components/FileInput";
import { SectionHeader } from "./SectionHeader";
import { DatasetBrowserModal } from "@/shared/components/DatasetBrowserModal";
import { cn } from "@/shared/lib/utils";
import { HydratedReferenceImage, ReferenceMode, GenerationSource, TextToImageModel, TEXT_TO_IMAGE_MODELS } from "../types";
import { Resource } from "@/shared/hooks/useResources";
import { ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";
import { LoraModel } from "@/shared/components/LoraSelectorModal";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import HoverScrubVideo from "@/shared/components/HoverScrubVideo";

// Reusable LoRA Grid component (no pagination)
interface LoraGridProps {
  selectedLoras: ActiveLora[];
  onOpenLoraModal: () => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  isGenerating: boolean;
}

const LoraGrid: React.FC<LoraGridProps> = ({
  selectedLoras,
  onOpenLoraModal,
  onRemoveLora,
  onUpdateLoraStrength,
  isGenerating,
}) => {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">LoRAs {selectedLoras.length > 0 && `(${selectedLoras.length})`}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenLoraModal}
          disabled={isGenerating}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add LoRA
        </Button>
      </div>

      {selectedLoras.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {selectedLoras.map((lora) => {
            // Check if preview is a video based on file extension
            const isVideo = lora.previewImageUrl &&
              lora.previewImageUrl.match(/\.(mp4|webm|mov|avi)(\?|$)/i);

            return (
              <div
                key={lora.id}
                className="relative group rounded-lg border bg-muted/30 overflow-hidden"
              >
                {/* Thumbnail */}
                <div className="aspect-video relative">
                  {lora.previewImageUrl ? (
                    isVideo ? (
                      <HoverScrubVideo
                        src={lora.previewImageUrl}
                        className="w-full h-full object-cover"
                        videoClassName="object-cover"
                        autoplayOnHover
                        loop
                        muted
                      />
                    ) : (
                      <img
                        src={lora.previewImageUrl}
                        alt={lora.name}
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Images className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  {/* Remove button overlay */}
                  <button
                    type="button"
                    onClick={() => onRemoveLora(lora.id)}
                    disabled={isGenerating}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {/* Name and strength */}
                <div className="p-2 space-y-2">
                  <p className="text-xs font-medium truncate preserve-case" title={lora.name}>
                    {lora.name}
                  </p>
                  <SliderWithValue
                    label="Strength"
                    value={lora.strength}
                    onChange={(value) => onUpdateLoraStrength(lora.id, value)}
                    min={0}
                    max={2}
                    step={0.05}
                    disabled={isGenerating}
                    hideLabel
                    numberInputClassName="w-14"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No LoRAs selected. Add LoRAs to customize the generation style.
        </p>
      )}
    </div>
  );
};

interface ModelSectionProps {
  isGenerating: boolean;
  styleReferenceImage: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  isUploadingStyleReference: boolean;
  onStyleUpload: (files: File[]) => void;
  onStyleRemove: () => void;
  onStyleStrengthChange: (value: number) => void;
  onSubjectStrengthChange: (value: number) => void;
  onSubjectDescriptionChange: (value: string) => void;
  onSubjectDescriptionFocus?: () => void;
  onSubjectDescriptionBlur?: () => void;
  onInThisSceneChange: (value: boolean) => void;
  onInThisSceneStrengthChange: (value: number) => void;
  // New multiple references props (uses hydrated references with full data)
  references?: HydratedReferenceImage[];
  selectedReferenceId?: string | null;
  onSelectReference?: (id: string) => void;
  onDeleteReference?: (id: string) => void;
  onUpdateReferenceName?: (id: string, name: string) => void;
  onResourceSelect?: (resource: Resource) => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
  // Generation source toggle
  generationSource?: GenerationSource;
  onGenerationSourceChange?: (source: GenerationSource) => void;
  // Just-text mode props
  selectedTextModel?: TextToImageModel;
  onTextModelChange?: (model: TextToImageModel) => void;
  selectedLoras?: ActiveLora[];
  onOpenLoraModal?: () => void;
  onRemoveLora?: (loraId: string) => void;
  onUpdateLoraStrength?: (loraId: string, strength: number) => void;
}

// ReferenceSelector Component - shows thumbnail gallery of references
interface ReferenceSelectorProps {
  references: HydratedReferenceImage[];
  selectedReferenceId: string | null;
  onSelectReference: (id: string) => void;
  onAddReference: (files: File[]) => void;
  onDeleteReference: (id: string) => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
  isGenerating: boolean;
  isUploadingStyleReference: boolean;
  onOpenDatasetBrowser: () => void;
  // Loading state - show placeholders when we have pointers but no hydrated data yet
  isLoadingReferenceData?: boolean;
  referenceCount?: number; // Number of references from cache (for skeleton)
}

const REFS_PER_PAGE = 11; // 11 refs per page + 1 for add button

const ReferenceSelector: React.FC<ReferenceSelectorProps> = ({
  references,
  selectedReferenceId,
  onSelectReference,
  onAddReference,
  onDeleteReference,
  onToggleVisibility,
  isGenerating,
  isUploadingStyleReference,
  onOpenDatasetBrowser,
  isLoadingReferenceData = false,
  referenceCount = 0,
}) => {
  const [isDraggingOverAdd, setIsDraggingOverAdd] = React.useState(false);
  // Track loading state for each reference image
  const [loadedImages, setLoadedImages] = React.useState<Set<string>>(new Set());
  // Track touch interactions to prevent hover interfering with tap
  const [touchedRef, setTouchedRef] = React.useState<string | null>(null);
  // Track touch start position to distinguish taps from scrolls/drags
  const touchStartPos = React.useRef<{ x: number; y: number; refId: string } | null>(null);
  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(0);

  // Calculate pagination - sort by createdAt descending so newest are on page 1 (stable ordering)
  const sortedRefs = React.useMemo(() =>
    [...references].sort((a, b) => {
      // Sort by createdAt descending (newest first)
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    }),
    [references]
  );
  const totalPages = Math.ceil(sortedRefs.length / REFS_PER_PAGE);
  const startIdx = currentPage * REFS_PER_PAGE;
  const visibleReferences = React.useMemo(
    () => sortedRefs.slice(startIdx, startIdx + REFS_PER_PAGE),
    [sortedRefs, startIdx]
  );

  // Reset to last valid page if references are removed
  React.useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [references.length, currentPage, totalPages]);
  
  const handleImageLoad = React.useCallback((refId: string) => {
    setLoadedImages(prev => new Set(prev).add(refId));
  }, []);
  
  // Reset loaded state when references change (new references added/removed)
  React.useEffect(() => {
    const currentRefIds = new Set(references.map(ref => ref.id));
    setLoadedImages(prev => {
      const filtered = new Set<string>();
      prev.forEach(id => {
        if (currentRefIds.has(id)) {
          filtered.add(id);
        }
      });
      return filtered;
    });
  }, [references]);
  
  // Debug logging for ReferenceSelector rendering decision
  // [GridDebug] Log EVERY render to catch the disappearance
  const renderCount = React.useRef(0);
  renderCount.current++;
  
  const shouldShowSkeletonsComputed = references.length === 0 && (referenceCount > 0 || isLoadingReferenceData);
  const skeletonCountComputed = Math.max(referenceCount, isLoadingReferenceData ? 1 : 0);
  
  console.log('[GridDebug] 🔲 ModelSection RENDER #' + renderCount.current, {
    references_length: references.length,
    referenceCount,
    isLoadingReferenceData,
    shouldShowSkeletons: shouldShowSkeletonsComputed,
    skeletonCount: skeletonCountComputed,
    willRenderNothing: !shouldShowSkeletonsComputed && references.length === 0,
    selectedReferenceId: selectedReferenceId?.substring(0, 8) || 'null',
  });
  
  // Aggressively preload thumbnail images as soon as we have them
  React.useEffect(() => {
    if (!isLoadingReferenceData && references.length > 0) {
      console.log('[RefLoadingDebug] 📥 Preloading', references.length, 'thumbnail images with high priority');
      
      references.forEach(ref => {
        const thumbnailUrl = ref.thumbnailUrl || ref.styleReferenceImageOriginal || ref.styleReferenceImage;
        if (thumbnailUrl) {
          const img = new Image();
          img.fetchPriority = 'high'; // Request high priority from browser
          img.loading = 'eager'; // Load immediately, don't wait for viewport
          img.src = thumbnailUrl;
          // Don't need to track these - just trigger the download
        }
      });
    }
  }, [isLoadingReferenceData, references]);
  
  return (
    <div className="space-y-3">
      {/* Thumbnail gallery */}
      <div className="grid grid-cols-4 gap-2">
        {/* Add reference button with search button - NOW FIRST */}
        <div className="relative aspect-square">
          <label
            className={cn(
              'w-full h-full flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg transition-all duration-200',
              isGenerating || isUploadingStyleReference
                ? 'border-gray-200 cursor-not-allowed opacity-50'
                : isDraggingOverAdd
                ? 'border-purple-500 bg-purple-500/20 dark:bg-purple-500/30 scale-105 shadow-lg cursor-pointer'
                : 'border-gray-300 cursor-pointer'
            )}
            title="Click to upload or drag & drop"
            onDragEnter={e => {
              e.preventDefault()
              e.stopPropagation()
              if (!isGenerating && !isUploadingStyleReference) {
                setIsDraggingOverAdd(true)
              }
            }}
            onDragOver={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDragLeave={e => {
              e.preventDefault()
              e.stopPropagation()
              setIsDraggingOverAdd(false)
            }}
            onDrop={e => {
              e.preventDefault()
              e.stopPropagation()
              setIsDraggingOverAdd(false)
              if (!isGenerating && !isUploadingStyleReference) {
                const files = Array.from(e.dataTransfer.files).filter(f =>
                  f.type.startsWith('image/')
                )
                if (files.length > 0) {
                  onAddReference(files)
                }
              }
            }}
          >
            {isDraggingOverAdd ? (
              <Upload className="h-6 w-6 text-purple-600 dark:text-purple-400 animate-bounce" />
            ) : (
              <div className="relative w-full h-full">
                {/* Diagonal divider line */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[141%] h-px bg-gray-300 dark:bg-gray-600 rotate-45 transform origin-center" />
                </div>

                {/* Plus icon - top right - pointer-events-none so clicks pass through to label */}
                <div className="absolute top-[15%] right-[15%] pointer-events-none">
                  <Plus className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || [])
                if (files.length > 0) onAddReference(files)
                e.target.value = '' // Reset input
              }}
              disabled={isGenerating || isUploadingStyleReference}
            />
          </label>

          {/* Search icon - bottom left */}
          {!isDraggingOverAdd && (
            <button
              type="button"
              className={cn(
                'absolute bottom-[15%] left-[15%] p-0.5 rounded',
                (isGenerating || isUploadingStyleReference) &&
                  'cursor-not-allowed opacity-40'
              )}
              title="Search reference images"
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                if (!isGenerating && !isUploadingStyleReference) {
                  onOpenDatasetBrowser()
                }
              }}
              disabled={isGenerating || isUploadingStyleReference}
            >
              <Search className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* Show skeleton placeholders OR actual references */}
        {(() => {
          // If we have NO refs yet, show all skeletons
          if (references.length === 0 && (referenceCount > 0 || isLoadingReferenceData)) {
            const skeletonCount = Math.min(Math.max(referenceCount, 1), REFS_PER_PAGE);
            console.log('[GridDebug] 💀 All skeletons:', skeletonCount);
            return Array.from({ length: skeletonCount }).map((_, idx) => (
              <div
                key={`skeleton-${idx}`}
                className="relative rounded-lg border-2 border-border overflow-hidden aspect-square"
              >
                <div className="w-full h-full bg-muted/40 flex items-center justify-center animate-pulse">
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-muted-foreground/60"></div>
                </div>
              </div>
            ));
          }

          // We have SOME refs - render them (already reversed at pagination level) + placeholder skeletons for remaining
          const remainingSkeletons = Math.max(0, referenceCount - references.length);
          console.log('[GridDebug] 🖼️ Rendering', visibleReferences.length, 'refs (page', currentPage + 1, 'of', totalPages, ') +', remainingSkeletons, 'skeletons');

          return (
            <>
              {visibleReferences.map(ref => {
            const isSelected = selectedReferenceId === ref.id;
            // Use thumbnail for grid display, fallback to original or processed
            const imageUrl = ref.thumbnailUrl || ref.styleReferenceImageOriginal || ref.styleReferenceImage;
            const isLoaded = loadedImages.has(ref.id);
            
            return (
              <div
                key={ref.id}
                className={cn(
                  "relative cursor-pointer rounded-lg border-2 overflow-hidden group",
                  "aspect-square transition-all hover:scale-105",
                  isSelected
                    ? "border-purple-500 dark:border-purple-400 ring-2 ring-purple-500 dark:ring-purple-400 shadow-lg"
                    : "border-border hover:border-purple-300 dark:hover:border-purple-600"
                )}
                onClick={() => !isGenerating && onSelectReference(ref.id)}
                onTouchStart={(e) => {
                  setTouchedRef(ref.id);
                  // Store initial touch position to detect scrolls vs taps
                  const touch = e.touches[0];
                  if (touch) {
                    touchStartPos.current = {
                      x: touch.clientX,
                      y: touch.clientY,
                      refId: ref.id
                    };
                  }
                }}
                onTouchMove={(e) => {
                  // If touch moved significantly, it's a scroll/drag, not a tap
                  if (touchStartPos.current && touchStartPos.current.refId === ref.id) {
                    const touch = e.touches[0];
                    if (touch) {
                      const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
                      const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);
                      // If moved more than 10px, clear the touch start (prevent selection)
                      if (deltaX > 10 || deltaY > 10) {
                        touchStartPos.current = null;
                      }
                    }
                  }
                }}
                onTouchEnd={(e) => {
                  // Handle touch to ensure single-tap selection works
                  if (!isGenerating) {
                    // Don't select if tapping the delete button
                    const target = e.changedTouches[0];
                    if (target && touchStartPos.current && touchStartPos.current.refId === ref.id) {
                      // Check if this was a tap (minimal movement) vs a scroll/drag
                      const deltaX = Math.abs(target.clientX - touchStartPos.current.x);
                      const deltaY = Math.abs(target.clientY - touchStartPos.current.y);
                      const isTap = deltaX <= 10 && deltaY <= 10;
                      
                      if (isTap) {
                        const htmlTarget = e.target as HTMLElement;
                        if (!htmlTarget.closest('button')) {
                          onSelectReference(ref.id);
                        }
                      }
                    }
                  }
                  setTouchedRef(null);
                  touchStartPos.current = null;
                }}
                onTouchCancel={() => {
                  setTouchedRef(null);
                  touchStartPos.current = null;
                }}
                title={ref.name.split('\n')[0]}
              >
                {imageUrl ? (
                  <>
                    {/* Visible image - only shown when loaded */}
                    {isLoaded && (
                      <img
                        src={imageUrl}
                        alt={ref.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    )}
                    
                    {/* Hidden image for loading */}
                    {!isLoaded && (
                      <img
                        src={imageUrl}
                        alt={ref.name}
                        style={{ display: 'none' }}
                        onLoad={() => handleImageLoad(ref.id)}
                        draggable={false}
                      />
                    )}
                    
                    {/* Loading skeleton */}
                    {!isLoaded && (
                      <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center animate-pulse">
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400"></div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <Images className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                
                {/* Action buttons - show on hover or when touched on mobile */}
                {!isGenerating && (
                  <div className={cn(
                    "absolute top-1 right-1 flex gap-1 transition-opacity z-10",
                    touchedRef === ref.id || isSelected
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  )}>
                    {/* Visibility toggle - only show for owned references */}
                    {onToggleVisibility && ref.resourceId && ref.isOwner && (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onToggleVisibility(ref.resourceId, ref.isPublic);
                              }}
                              onTouchEnd={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onToggleVisibility(ref.resourceId, ref.isPublic);
                              }}
                              className={cn(
                                "rounded-full p-1 transition-colors",
                                ref.isPublic
                                  ? "bg-green-500 text-white hover:bg-green-600"
                                  : "bg-gray-500 text-white hover:bg-gray-600"
                              )}
                            >
                              {ref.isPublic ? (
                                <Globe className="h-3 w-3" />
                              ) : (
                                <Lock className="h-3 w-3" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            {ref.isPublic 
                              ? "Public - visible to others. Click to make private." 
                              : "Private - only you can see this. Click to make public."}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    
                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onDeleteReference(ref.id);
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onDeleteReference(ref.id);
                      }}
                      className="bg-red-500 text-white rounded-full p-1 transition-colors hover:bg-red-600"
                      title="Delete reference"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
            </div>
          );
        })}
              {/* Placeholder skeletons for refs still loading */}
              {Array.from({ length: remainingSkeletons }).map((_, idx) => (
                <div
                  key={`loading-skeleton-${idx}`}
                  className="relative rounded-lg border-2 border-border overflow-hidden aspect-square"
                >
                  <div className="w-full h-full bg-muted/40 flex items-center justify-center animate-pulse">
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-muted-foreground/60"></div>
                  </div>
                </div>
              ))}
            </>
          );
        })()}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0 || isGenerating}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentPage + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1 || isGenerating}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

const StyleReferenceSection: React.FC<{
  styleReferenceImage: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  isUploadingStyleReference: boolean;
  isGenerating: boolean;
  onStyleUpload: (files: File[]) => void;
  onStyleRemove: () => void;
  onStyleStrengthChange: (value: number) => void;
  onSubjectStrengthChange: (value: number) => void;
  onSubjectDescriptionChange: (value: string) => void;
  onSubjectDescriptionFocus?: () => void;
  onSubjectDescriptionBlur?: () => void;
  onInThisSceneChange: (value: boolean) => void;
  onInThisSceneStrengthChange: (value: number) => void;
  referenceMode?: ReferenceMode;
  onReferenceModeChange?: (mode: ReferenceMode) => void;
  styleBoostTerms?: string;
  onStyleBoostTermsChange?: (value: string) => void;
  // New multiple references props (uses hydrated references with full data)
  references?: HydratedReferenceImage[];
  selectedReferenceId?: string | null;
  onSelectReference?: (id: string) => void;
  onDeleteReference?: (id: string) => void;
  onUpdateReferenceName?: (id: string, name: string) => void;
  onResourceSelect?: (resource: Resource) => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
  // Loading state props
  isLoadingReferenceData?: boolean;
  referenceCount?: number;
  // LoRA props
  selectedLoras?: ActiveLora[];
  onOpenLoraModal?: () => void;
  onRemoveLora?: (loraId: string) => void;
  onUpdateLoraStrength?: (loraId: string, strength: number) => void;
}> = ({
  styleReferenceImage,
  styleReferenceStrength,
  subjectStrength,
  subjectDescription,
  inThisScene,
  inThisSceneStrength,
  isUploadingStyleReference,
  isGenerating,
  onStyleUpload,
  onStyleRemove,
  onStyleStrengthChange,
  onSubjectStrengthChange,
  onSubjectDescriptionChange,
  onSubjectDescriptionFocus,
  onSubjectDescriptionBlur,
  onInThisSceneChange,
  onInThisSceneStrengthChange,
  referenceMode = 'style',
  onReferenceModeChange,
  styleBoostTerms = '',
  onStyleBoostTermsChange,
  references = [],
  selectedReferenceId = null,
  onSelectReference,
  onDeleteReference,
  onUpdateReferenceName,
  onResourceSelect,
  onToggleVisibility,
  isLoadingReferenceData = false,
  referenceCount = 0,
  // LoRA props
  selectedLoras = [],
  onOpenLoraModal,
  onRemoveLora,
  onUpdateLoraStrength,
}) => {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const [showDatasetBrowser, setShowDatasetBrowser] = React.useState(false);

  // Reset loading states when image changes
  React.useEffect(() => {
    if (styleReferenceImage) {
      setImageLoaded(false);
      setImageError(false);
    } else {
      // If no image, reset states
      setImageLoaded(false);
      setImageError(false);
    }
  }, [styleReferenceImage]);

  // Only show skeleton during upload process, not during normal image loading
  const showSkeleton = isUploadingStyleReference;

  // Show the new multi-reference UI if handlers are provided
  const showMultiReference = onSelectReference && onDeleteReference;

  return (
  <div className="space-y-2">
    {/* New Multiple References UI - Two column layout when reference exists OR loading */}
    {showMultiReference && (referenceCount > 0 || references.length > 0) && (
      <div className="space-y-4">
        {/* First Row: Settings in Two Columns */}
        <div className="flex gap-4 flex-col md:flex-row">
          {/* Left column - Reference Mode Selector */}
          <div className="flex-1 space-y-2">
            <Label className="text-sm font-medium">How would you like to use this reference?</Label>
            <RadioGroup
              value={referenceMode}
              onValueChange={(value) => {
                if (!onReferenceModeChange) return;
                const mode = value as ReferenceMode;
                // onReferenceModeChange now handles mode + auto-setting strength values in one batch
                onReferenceModeChange(mode);
              }}
              className="flex flex-wrap gap-3"
              disabled={isGenerating || isUploadingStyleReference}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="style" id="mode-style" />
                <Label htmlFor="mode-style" className="cursor-pointer font-normal">Style</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="subject" id="mode-subject" />
                <Label htmlFor="mode-subject" className="cursor-pointer font-normal">Subject</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="scene" id="mode-scene" />
                <Label htmlFor="mode-scene" className="cursor-pointer font-normal">Scene</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="mode-custom" />
                <Label htmlFor="mode-custom" className="cursor-pointer font-normal">Custom</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Right column - Strength sliders and subject description */}
          <div className="flex-1 space-y-4">
            {/* Scene strength slider - only show in scene mode */}
            {referenceMode === 'scene' && (
              <SliderWithValue
                label="Scene strength"
                value={inThisSceneStrength}
                onChange={onInThisSceneStrengthChange}
                min={0.0}
                max={2.0}
                step={0.1}
                disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                numberInputClassName="w-16"
              />
            )}

            {/* Style, Subject, and Scene strength sliders - only show in custom mode */}
            {referenceMode === 'custom' && (
              <div className="space-y-3">
                <SliderWithValue
                  label="Style strength"
                  value={styleReferenceStrength}
                  onChange={(value) => {
                    // Validation: style + subject + scene must be >= 0.5
                    const newTotal = value + subjectStrength + inThisSceneStrength;
                    if (newTotal < 0.5) {
                      return;
                    }
                    onStyleStrengthChange(value);
                  }}
                  min={0.0}
                  max={2.0}
                  step={0.1}
                  disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                  numberInputClassName="w-16"
                />
                <SliderWithValue
                  label="Subject strength"
                  value={subjectStrength}
                  onChange={(value) => {
                    // Validation: style + subject + scene must be >= 0.5
                    const newTotal = styleReferenceStrength + value + inThisSceneStrength;
                    if (newTotal < 0.5) {
                      return;
                    }
                    onSubjectStrengthChange(value);
                  }}
                  min={0.0}
                  max={2.0}
                  step={0.1}
                  disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                  numberInputClassName="w-16"
                />
                <SliderWithValue
                  label="Scene strength"
                  value={inThisSceneStrength}
                  onChange={(value) => {
                    // Validation: style + subject + scene must be >= 0.5
                    const newTotal = styleReferenceStrength + subjectStrength + value;
                    if (newTotal < 0.5) {
                      return;
                    }
                    onInThisSceneStrengthChange(value);
                  }}
                  min={0.0}
                  max={2.0}
                  step={0.1}
                  disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                  numberInputClassName="w-16"
                />
              </div>
            )}

            {/* Show subject description and/or style-boost terms based on mode */}
            {styleReferenceImage && (referenceMode === 'style' || referenceMode === 'subject') && (
              <div className="space-y-4">
                {/* Show subject description when subject strength > 0 (excludes scene mode and custom mode) */}
                {subjectStrength > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="subject-description" className="text-sm font-medium">
                      Which subject from this image?
                    </Label>
                    <Input
                      id="subject-description"
                      type="text"
                      value={subjectDescription}
                      onChange={(e) => onSubjectDescriptionChange(e.target.value)}
                      onFocus={onSubjectDescriptionFocus}
                      onBlur={onSubjectDescriptionBlur}
                      placeholder="man, woman, cactus"
                      disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                    />
                  </div>
                )}

                {/* Show style-boost terms field when in style mode */}
                {referenceMode === 'style' && (
                  <div className="space-y-2">
                    <Label htmlFor="style-boost-terms" className="text-sm font-medium">
                      Style-boost terms:
                    </Label>
                    <Input
                      id="style-boost-terms"
                      type="text"
                      value={styleBoostTerms}
                      onChange={(e) => onStyleBoostTermsChange?.(e.target.value)}
                      placeholder="oil painting, impressionist"
                      disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Second Row: Thumbnails and Preview */}
        <div className="flex gap-4 flex-col md:flex-row">
          {/* Left side - Thumbnails */}
          <div className="flex-[2]">
            <ReferenceSelector
              references={references}
              selectedReferenceId={selectedReferenceId}
              onSelectReference={onSelectReference}
              onAddReference={onStyleUpload}
              onDeleteReference={onDeleteReference}
              onToggleVisibility={onToggleVisibility}
              isGenerating={isGenerating}
              isUploadingStyleReference={isUploadingStyleReference}
              onOpenDatasetBrowser={() => setShowDatasetBrowser(true)}
              isLoadingReferenceData={isLoadingReferenceData}
              referenceCount={referenceCount}
            />
          </div>

          {/* Right side - Large preview (hidden on small screens) */}
          <div className="flex-1 hidden md:block">
            <div className="border-2 border-solid border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden aspect-square">
              {isLoadingReferenceData ? (
                // Show skeleton while loading
                <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center animate-pulse">
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-gray-400"></div>
                </div>
              ) : styleReferenceImage ? (
                // Show actual image once loaded
                <img
                  src={styleReferenceImage}
                  alt="Selected reference"
                  className="w-full h-full object-contain"
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                // Fallback if no image but references exist
                <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Images className="h-8 w-8 text-gray-400" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    
    {/* Show thumbnails only when no image selected */}
    {showMultiReference && references.length > 0 && !styleReferenceImage && (
      <ReferenceSelector
        references={references}
        selectedReferenceId={selectedReferenceId}
        onSelectReference={onSelectReference}
        onAddReference={onStyleUpload}
        onDeleteReference={onDeleteReference}
        onToggleVisibility={onToggleVisibility}
        isGenerating={isGenerating}
        isUploadingStyleReference={isUploadingStyleReference}
        onOpenDatasetBrowser={() => setShowDatasetBrowser(true)}
      />
    )}
    
    {/* Show add first reference button if no references exist */}
    {showMultiReference && references.length === 0 && (
      <div className="space-y-3">
        <FileInput
          onFileChange={onStyleUpload}
          acceptTypes={['image']}
          disabled={isGenerating || isUploadingStyleReference}
          label="Upload your first reference image"
          className="w-full"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowDatasetBrowser(true)}
          disabled={isGenerating || isUploadingStyleReference}
          className="w-full"
        >
          <Images className="h-4 w-4 mr-2" />
          Browse images
        </Button>
      </div>
    )}

    {/* Legacy Single Reference Upload (fallback when multi-reference not available) */}
    {!showMultiReference && (
    <div className="space-y-3">
      {/* Responsive layout: horizontal on desktop, vertical on mobile */}
      <div className="w-full">
        <div className="border-2 border-solid border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 relative">
          <div className="flex items-start flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
            <div className="relative flex-shrink-0 w-full md:w-48">
              {styleReferenceImage || isUploadingStyleReference ? (
                showSkeleton || isUploadingStyleReference ? (
                  /* Skeleton loading state - show during upload or initial load */
                  <div className="w-full aspect-square rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-700 dark:via-gray-800 dark:to-gray-700 animate-pulse relative overflow-hidden">
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-gray-600/20 to-transparent animate-shimmer transform -skew-x-12"></div>
                    {isUploadingStyleReference && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded px-3 py-2 border border-gray-200 dark:border-gray-600">
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Uploading...</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <img
                      src={styleReferenceImage}
                      alt="Style Reference"
                      className="w-full aspect-square object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                      style={{ objectFit: 'cover' }}
                      onLoad={() => setImageLoaded(true)}
                      onError={() => {
                        setImageError(true);
                        setImageLoaded(true);
                      }}
                    />
                    <div className="absolute top-2 right-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full p-0.5 border border-gray-200 dark:border-gray-600 z-10">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onStyleRemove}
                        disabled={isGenerating}
                        className="h-5 w-5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </>
                )
              ) : (
                /* Simple file upload area */
                <div className="w-full aspect-square relative">
                  <div 
                    className={`w-full h-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors p-4
                      ${isDraggingOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'}
                      ${isGenerating ? 'cursor-not-allowed bg-muted/50' : 'hover:border-muted-foreground/50'}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingOver(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingOver(false);
                      if (!isGenerating) {
                        const files = Array.from(e.dataTransfer.files);
                        if (files.length > 0) {
                          onStyleUpload(files);
                        }
                      }
                    }}
                    onClick={() => !isGenerating && document.getElementById('style-file-input')?.click()}
                  >
                    <input
                      id="style-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          onStyleUpload(Array.from(e.target.files));
                        }
                      }}
                      className="hidden"
                      disabled={isGenerating}
                    />
                    {isUploadingStyleReference ? (
                      <div className="flex flex-col items-center space-y-2 text-muted-foreground">
                        <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm">Processing file...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-2 text-muted-foreground">
                        <div className="w-10 h-10">
                          <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <p className="text-sm text-center">Drag & drop or click to upload</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Browse Style References Button - Always visible */}
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDatasetBrowser(true)}
                  disabled={isGenerating || isUploadingStyleReference}
                  className="w-full"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Browse references
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    )}
    {/* End legacy single reference section */}

    {/* LoRA Grid - shown in by-reference mode */}
    {onOpenLoraModal && onRemoveLora && onUpdateLoraStrength && (
      <LoraGrid
        selectedLoras={selectedLoras}
        onOpenLoraModal={onOpenLoraModal}
        onRemoveLora={onRemoveLora}
        onUpdateLoraStrength={onUpdateLoraStrength}
        isGenerating={isGenerating}
      />
    )}

    {/* Dataset Browser Modal */}
    <DatasetBrowserModal
      isOpen={showDatasetBrowser}
      onOpenChange={setShowDatasetBrowser}
      onResourceSelect={onResourceSelect}
    />
  </div>
  );
};

// Component for "Just Text" mode - model selector and LoRAs
const JustTextSection: React.FC<{
  isGenerating: boolean;
  selectedTextModel: TextToImageModel;
  onTextModelChange: (model: TextToImageModel) => void;
  selectedLoras: ActiveLora[];
  onOpenLoraModal: () => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
}> = ({
  isGenerating,
  selectedTextModel,
  onTextModelChange,
  selectedLoras,
  onOpenLoraModal,
  onRemoveLora,
  onUpdateLoraStrength,
}) => {
  return (
    <div className="space-y-4">
      {/* Model Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Model</Label>
        <RadioGroup
          value={selectedTextModel}
          onValueChange={(value) => onTextModelChange(value as TextToImageModel)}
          className="flex flex-wrap gap-3"
          disabled={isGenerating}
        >
          {TEXT_TO_IMAGE_MODELS.map((model) => (
            <div key={model.id} className="flex items-center space-x-2">
              <RadioGroupItem value={model.id} id={`model-${model.id}`} />
              <Label
                htmlFor={`model-${model.id}`}
                className="cursor-pointer font-normal preserve-case"
                title={model.description}
              >
                {model.name}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* LoRA Grid */}
      <LoraGrid
        selectedLoras={selectedLoras}
        onOpenLoraModal={onOpenLoraModal}
        onRemoveLora={onRemoveLora}
        onUpdateLoraStrength={onUpdateLoraStrength}
        isGenerating={isGenerating}
      />
    </div>
  );
};

export const ModelSection: React.FC<ModelSectionProps & {
  referenceMode?: ReferenceMode;
  onReferenceModeChange?: (mode: ReferenceMode) => void;
  styleBoostTerms?: string;
  onStyleBoostTermsChange?: (value: string) => void;
  isLoadingReferenceData?: boolean;
  referenceCount?: number;
}> = ({
  isGenerating,
  styleReferenceImage,
  styleReferenceStrength,
  subjectStrength,
  subjectDescription,
  inThisScene,
  inThisSceneStrength,
  isUploadingStyleReference,
  onStyleUpload,
  onStyleRemove,
  onStyleStrengthChange,
  onSubjectStrengthChange,
  onSubjectDescriptionChange,
  onSubjectDescriptionFocus,
  onSubjectDescriptionBlur,
  onInThisSceneChange,
  onInThisSceneStrengthChange,
  referenceMode,
  onReferenceModeChange,
  styleBoostTerms,
  onStyleBoostTermsChange,
  references,
  selectedReferenceId,
  onSelectReference,
  onDeleteReference,
  onUpdateReferenceName,
  onResourceSelect,
  onToggleVisibility,
  isLoadingReferenceData,
  referenceCount,
  // Generation source props
  generationSource = 'by-reference',
  onGenerationSourceChange,
  selectedTextModel = 'flux-dev',
  onTextModelChange,
  selectedLoras = [],
  onOpenLoraModal,
  onRemoveLora,
  onUpdateLoraStrength,
}) => {
  return (
    <div className="flex-1 space-y-4">
      {/* Settings Header with generation source toggle */}
      <div className="flex flex-row justify-between items-center">
        <SectionHeader title="Settings" theme="purple" />
        {onGenerationSourceChange && (
          <SegmentedControl
            value={generationSource}
            onValueChange={(value) => onGenerationSourceChange(value as GenerationSource)}
            size="sm"
          >
            <SegmentedControlItem value="by-reference">
              By reference
            </SegmentedControlItem>
            <SegmentedControlItem value="just-text">
              Just text
            </SegmentedControlItem>
          </SegmentedControl>
        )}
      </div>

      {/* Conditional content based on generation source */}
      {generationSource === 'by-reference' ? (
        <StyleReferenceSection
          styleReferenceImage={styleReferenceImage}
          styleReferenceStrength={styleReferenceStrength}
          subjectStrength={subjectStrength}
          subjectDescription={subjectDescription}
          inThisScene={inThisScene}
          inThisSceneStrength={inThisSceneStrength}
          isUploadingStyleReference={isUploadingStyleReference}
          isGenerating={isGenerating}
          onStyleUpload={onStyleUpload}
          onStyleRemove={onStyleRemove}
          onStyleStrengthChange={onStyleStrengthChange}
          onSubjectStrengthChange={onSubjectStrengthChange}
          onSubjectDescriptionChange={onSubjectDescriptionChange}
          onSubjectDescriptionFocus={onSubjectDescriptionFocus}
          onSubjectDescriptionBlur={onSubjectDescriptionBlur}
          onInThisSceneChange={onInThisSceneChange}
          onInThisSceneStrengthChange={onInThisSceneStrengthChange}
          referenceMode={referenceMode}
          onReferenceModeChange={onReferenceModeChange}
          styleBoostTerms={styleBoostTerms}
          onStyleBoostTermsChange={onStyleBoostTermsChange}
          references={references}
          selectedReferenceId={selectedReferenceId}
          onSelectReference={onSelectReference}
          onDeleteReference={onDeleteReference}
          onUpdateReferenceName={onUpdateReferenceName}
          onResourceSelect={onResourceSelect}
          onToggleVisibility={onToggleVisibility}
          isLoadingReferenceData={isLoadingReferenceData}
          referenceCount={referenceCount}
          // LoRA props
          selectedLoras={selectedLoras}
          onOpenLoraModal={onOpenLoraModal}
          onRemoveLora={onRemoveLora}
          onUpdateLoraStrength={onUpdateLoraStrength}
        />
      ) : (
        onTextModelChange && onOpenLoraModal && onRemoveLora && onUpdateLoraStrength && (
          <JustTextSection
            isGenerating={isGenerating}
            selectedTextModel={selectedTextModel}
            onTextModelChange={onTextModelChange}
            selectedLoras={selectedLoras}
            onOpenLoraModal={onOpenLoraModal}
            onRemoveLora={onRemoveLora}
            onUpdateLoraStrength={onUpdateLoraStrength}
          />
        )
      )}
    </div>
  );
};
