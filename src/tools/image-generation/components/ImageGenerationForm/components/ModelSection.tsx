import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Trash2, Images, Plus, Check, X, Upload } from "lucide-react";
import FileInput from "@/shared/components/FileInput";
import { SectionHeader } from "./SectionHeader";
import { DatasetBrowserModal } from "@/shared/components/DatasetBrowserModal";
import { cn } from "@/shared/lib/utils";
import { ReferenceImage, ReferenceMode } from "../types";

interface ModelSectionProps {
  isGenerating: boolean;
  styleReferenceImage: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  isUploadingStyleReference: boolean;
  isMobile?: boolean;
  onStyleUpload: (files: File[]) => void;
  onStyleRemove: () => void;
  onStyleStrengthChange: (value: number) => void;
  onSubjectStrengthChange: (value: number) => void;
  onSubjectDescriptionChange: (value: string) => void;
  onInThisSceneChange: (value: boolean) => void;
  // New multiple references props
  references?: ReferenceImage[];
  selectedReferenceId?: string | null;
  onSelectReference?: (id: string) => void;
  onDeleteReference?: (id: string) => void;
  onUpdateReferenceName?: (id: string, name: string) => void;
}

// ReferenceSelector Component - shows thumbnail gallery of references
interface ReferenceSelectorProps {
  references: ReferenceImage[];
  selectedReferenceId: string | null;
  onSelectReference: (id: string) => void;
  onAddReference: (files: File[]) => void;
  onDeleteReference: (id: string) => void;
  isGenerating: boolean;
  isUploadingStyleReference: boolean;
}

const ReferenceSelector: React.FC<ReferenceSelectorProps> = ({
  references,
  selectedReferenceId,
  onSelectReference,
  onAddReference,
  onDeleteReference,
  isGenerating,
  isUploadingStyleReference,
}) => {
  const [isDraggingOverAdd, setIsDraggingOverAdd] = React.useState(false);
  
  return (
    <div className="space-y-3">
      {/* Thumbnail gallery */}
      <div className="grid grid-cols-4 gap-2">
        {references.map(ref => {
          const isSelected = selectedReferenceId === ref.id;
          const imageUrl = ref.styleReferenceImageOriginal || ref.styleReferenceImage;
          
          return (
            <div
              key={ref.id}
              className={cn(
                "relative cursor-pointer rounded-lg border-2 overflow-hidden group",
                "aspect-square transition-all hover:scale-105",
                isSelected 
                  ? "border-purple-500 ring-2 ring-purple-500 shadow-lg" 
                  : "border-gray-300 hover:border-purple-300"
              )}
              onClick={() => !isGenerating && onSelectReference(ref.id)}
              title={ref.name}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={ref.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <Images className="h-6 w-6 text-gray-400" />
                </div>
              )}
              
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center pointer-events-none">
                  <div className="bg-purple-600 rounded-full p-1">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
              
              {/* Delete button - show on hover or always on mobile */}
              {!isGenerating && references.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onDeleteReference(ref.id);
                  }}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 
                             opacity-0 group-hover:opacity-100 transition-opacity
                             hover:bg-red-600 z-10"
                  title="Delete reference"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
        
        {/* Add reference button */}
        <label 
          className={cn(
            "aspect-square flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200",
            isGenerating || isUploadingStyleReference
              ? "border-gray-200 cursor-not-allowed opacity-50"
              : isDraggingOverAdd
                ? "border-purple-500 bg-purple-500/20 dark:bg-purple-500/30 scale-105 shadow-lg"
                : "border-gray-300 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950"
          )}
          title="Add new reference"
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isGenerating && !isUploadingStyleReference) {
              setIsDraggingOverAdd(true);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOverAdd(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOverAdd(false);
            if (!isGenerating && !isUploadingStyleReference) {
              const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
              if (files.length > 0) {
                onAddReference(files);
              }
            }
          }}
        >
          {isDraggingOverAdd ? (
            <Upload className="h-6 w-6 text-purple-600 dark:text-purple-400 animate-bounce" />
          ) : (
            <Plus className="h-6 w-6 text-gray-400" />
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) onAddReference(files);
              e.target.value = ''; // Reset input
            }}
            disabled={isGenerating || isUploadingStyleReference}
          />
        </label>
      </div>
    </div>
  );
};

const StyleReferenceSection: React.FC<{
  styleReferenceImage: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  isUploadingStyleReference: boolean;
  isGenerating: boolean;
  isMobile?: boolean;
  onStyleUpload: (files: File[]) => void;
  onStyleRemove: () => void;
  onStyleStrengthChange: (value: number) => void;
  onSubjectStrengthChange: (value: number) => void;
  onSubjectDescriptionChange: (value: string) => void;
  onInThisSceneChange: (value: boolean) => void;
  referenceMode?: ReferenceMode;
  onReferenceModeChange?: (mode: ReferenceMode) => void;
  // New multiple references props
  references?: ReferenceImage[];
  selectedReferenceId?: string | null;
  onSelectReference?: (id: string) => void;
  onDeleteReference?: (id: string) => void;
  onUpdateReferenceName?: (id: string, name: string) => void;
}> = ({
  styleReferenceImage,
  styleReferenceStrength,
  subjectStrength,
  subjectDescription,
  inThisScene,
  isUploadingStyleReference,
  isGenerating,
  isMobile = false,
  onStyleUpload,
  onStyleRemove,
  onStyleStrengthChange,
  onSubjectStrengthChange,
  onSubjectDescriptionChange,
  onInThisSceneChange,
  referenceMode = 'custom',
  onReferenceModeChange,
  references = [],
  selectedReferenceId = null,
  onSelectReference,
  onDeleteReference,
  onUpdateReferenceName,
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
    <div className="space-y-1">
      <SectionHeader title="Reference" theme="purple" />
    </div>

    {/* New Multiple References UI - Two column layout when reference exists */}
    {showMultiReference && references.length > 0 && styleReferenceImage && (
      <div className={`flex gap-4 ${isMobile ? 'flex-col' : 'flex-row'}`}>
        {/* Left side - Thumbnails and Settings */}
        <div className="flex-1 space-y-4">
          <ReferenceSelector
            references={references}
            selectedReferenceId={selectedReferenceId}
            onSelectReference={onSelectReference}
            onAddReference={onStyleUpload}
            onDeleteReference={onDeleteReference}
            isGenerating={isGenerating}
            isUploadingStyleReference={isUploadingStyleReference}
          />
          
          {/* Settings below thumbnails */}
          <div className="space-y-4">
            {/* Reference Mode Selector */}
            <div className="space-y-2">
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
                  <RadioGroupItem value="style-character" id="mode-style-character" />
                  <Label htmlFor="mode-style-character" className="cursor-pointer font-normal">Style + subject</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="mode-custom" />
                  <Label htmlFor="mode-custom" className="cursor-pointer font-normal">Custom</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Style and Subject strength sliders - only show in custom mode */}
            {referenceMode === 'custom' && (
            <div className="flex gap-4">
              <div className="flex-1">
                <SliderWithValue
                  label="Style strength"
                  value={styleReferenceStrength}
                  onChange={(value) => {
                    // Validation: style + subject must ALWAYS be >= 0.5 (no exceptions)
                    const newTotal = value + subjectStrength;
                    if (newTotal < 0.5) {
                      return;
                    }
                    onStyleStrengthChange(value);
                  }}
                  min={0.0}
                  max={2.0}
                  step={0.1}
                  disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                  numberInputClassName="w-10"
                />
              </div>
              <div className="flex-1">
                <SliderWithValue
                  label="Subject strength"
                  value={subjectStrength}
                  onChange={(value) => {
                    // Validation: style + subject must ALWAYS be >= 0.5 (no exceptions)
                    const newTotal = styleReferenceStrength + value;
                    if (newTotal < 0.5) {
                      return;
                    }
                    onSubjectStrengthChange(value);
                  }}
                  min={0.0}
                  max={2.0}
                  step={0.1}
                  disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                  numberInputClassName="w-10"
                />
              </div>
            </div>
            )}
            
            {/* Show subject description only when subject strength > 0 */}
            {subjectStrength > 0 && styleReferenceImage && (
            <div className="space-y-2">
              <Label htmlFor="subject-description" className="text-sm font-medium">
                Which character from this image?
              </Label>
              <div className="flex items-center space-x-3">
                <Input
                  id="subject-description"
                  type="text"
                  value={subjectDescription}
                  onChange={(e) => onSubjectDescriptionChange(e.target.value)}
                  placeholder="girl, monster, teapot..."
                  disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                  className="flex-1"
                />
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="in-this-scene"
                    checked={inThisScene}
                    onCheckedChange={onInThisSceneChange}
                    disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                  />
                  <Label 
                    htmlFor="in-this-scene" 
                    className="text-sm font-medium cursor-pointer whitespace-nowrap"
                  >
                    In this scene
                  </Label>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
        
        {/* Right side - Large preview (hidden on mobile) */}
        {!isMobile && (
          <div className="flex-1">
            <div className="border-2 border-solid border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden aspect-square">
              <img
                src={styleReferenceImage}
                alt="Selected reference"
                className="w-full h-full object-contain"
                style={{ objectFit: 'contain' }}
              />
            </div>
          </div>
        )}
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
        isGenerating={isGenerating}
        isUploadingStyleReference={isUploadingStyleReference}
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
          <div className={`flex items-start ${isMobile ? 'flex-col space-y-4' : 'space-x-4'}`}>
            <div className={`relative flex-shrink-0 ${isMobile ? 'w-full' : 'w-48'}`}>
              {styleReferenceImage ? (
                showSkeleton ? (
                  /* Skeleton loading state */
                  <div className="w-full aspect-square rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 dark:from-gray-700 dark:via-gray-800 dark:to-gray-700 animate-pulse relative overflow-hidden">
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-gray-600/20 to-transparent animate-shimmer transform -skew-x-12"></div>
                    {/* <div className="absolute top-2 left-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded px-2 py-1 border border-gray-200 dark:border-gray-600 z-10">
                      <p className="text-xs font-light text-gray-600 dark:text-gray-400">Style</p>
                    </div> */}
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
                    {/* <div className="absolute top-2 left-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded px-2 py-1 border border-gray-200 dark:border-gray-600 z-10">
                      <p className="text-xs font-light text-gray-600 dark:text-gray-400">Style</p>
                    </div> */}
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
              
              {/* Browse Dataset Images Button - Always visible */}
              <div className="mt-3">
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
            </div>
          </div>
        </div>
      </div>
    </div>
    )}
    {/* End legacy single reference section */}
    
    {/* Dataset Browser Modal */}
    <DatasetBrowserModal
      isOpen={showDatasetBrowser}
      onOpenChange={setShowDatasetBrowser}
      onImageSelect={onStyleUpload}
    />
  </div>
  );
};

export const ModelSection: React.FC<ModelSectionProps & {
  referenceMode?: ReferenceMode;
  onReferenceModeChange?: (mode: ReferenceMode) => void;
}> = ({
  isGenerating,
  styleReferenceImage,
  styleReferenceStrength,
  subjectStrength,
  subjectDescription,
  inThisScene,
  isUploadingStyleReference,
  isMobile = false,
  onStyleUpload,
  onStyleRemove,
  onStyleStrengthChange,
  onSubjectStrengthChange,
  onSubjectDescriptionChange,
  onInThisSceneChange,
  referenceMode,
  onReferenceModeChange,
  references,
  selectedReferenceId,
  onSelectReference,
  onDeleteReference,
  onUpdateReferenceName,
}) => {
  return (
    <div className="flex-1">
      {/* Always show Style Reference Section (defaulting to qwen-image model) */}
      <StyleReferenceSection
        styleReferenceImage={styleReferenceImage}
        styleReferenceStrength={styleReferenceStrength}
        subjectStrength={subjectStrength}
        subjectDescription={subjectDescription}
        inThisScene={inThisScene}
        isUploadingStyleReference={isUploadingStyleReference}
        isGenerating={isGenerating}
        isMobile={isMobile}
        onStyleUpload={onStyleUpload}
        onStyleRemove={onStyleRemove}
        onStyleStrengthChange={onStyleStrengthChange}
        onSubjectStrengthChange={onSubjectStrengthChange}
        onSubjectDescriptionChange={onSubjectDescriptionChange}
        onInThisSceneChange={onInThisSceneChange}
        referenceMode={referenceMode}
        onReferenceModeChange={onReferenceModeChange}
        references={references}
        selectedReferenceId={selectedReferenceId}
        onSelectReference={onSelectReference}
        onDeleteReference={onDeleteReference}
        onUpdateReferenceName={onUpdateReferenceName}
      />
    </div>
  );
};
