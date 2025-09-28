import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { Trash2, Images } from "lucide-react";
import FileInput from "@/shared/components/FileInput";
import { SectionHeader } from "./SectionHeader";
import { DatasetBrowserModal } from "@/shared/components/DatasetBrowserModal";

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
}


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

  return (
  <div className="space-y-2">
    <div className="space-y-1">
      <SectionHeader title="Reference" theme="purple" />
    </div>

    {/* Style Reference Upload */}
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
            <div className={`${isMobile ? 'w-full' : 'flex-1'} space-y-4 ${isMobile ? '' : 'pt-2'} ${!styleReferenceImage ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* Style and Subject strength sliders - side by side on mobile, stacked on desktop */}
              <div className={`${isMobile ? 'flex gap-4' : 'space-y-4'}`}>
                <div className={isMobile ? 'flex-1' : ''}>
                  <SliderWithValue
                    label="Style strength"
                    value={styleReferenceStrength}
                    onChange={(value) => {
                      // Validation: style + subject must ALWAYS be >= 0.5 (no exceptions)
                      const newTotal = value + subjectStrength;
                      console.log(`[StrengthValidationDebug] Style change attempt:`, {
                        newStyleValue: value,
                        currentSubjectValue: subjectStrength,
                        newTotal: newTotal,
                        isNewTotalInvalid: newTotal < 0.5,
                        shouldBlock: newTotal < 0.5
                      });
                      
                      // Block if total < 0.5 (no exceptions)
                      if (newTotal < 0.5) {
                        console.log(`[StrengthValidationDebug] 🚫 BLOCKED: Style change would make total < 0.5 (${newTotal})`);
                        // Simple console warning instead of UI validation
                        return;
                      }
                      console.log(`[StrengthValidationDebug] ✅ ALLOWED: Style change accepted (total = ${newTotal})`);
                      onStyleStrengthChange(value);
                    }}
                    min={0.0}
                    max={2.0}
                    step={0.1}
                    disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                    numberInputClassName="w-10"
                  />
                </div>
                <div className={isMobile ? 'flex-1' : ''}>
                  <SliderWithValue
                    label="Subject strength"
                    value={subjectStrength}
                    onChange={(value) => {
                      // Validation: style + subject must ALWAYS be >= 0.5 (no exceptions)
                      const newTotal = styleReferenceStrength + value;
                      console.log(`[StrengthValidationDebug] Subject change attempt:`, {
                        currentStyleValue: styleReferenceStrength,
                        newSubjectValue: value,
                        newTotal: newTotal,
                        isNewTotalInvalid: newTotal < 0.5,
                        shouldBlock: newTotal < 0.5
                      });
                      
                      // Block if total < 0.5 (no exceptions)
                      if (newTotal < 0.5) {
                        console.log(`[StrengthValidationDebug] 🚫 BLOCKED: Subject change would make total < 0.5 (${newTotal})`);
                        // Simple console warning instead of UI validation
                        return;
                      }
                      console.log(`[StrengthValidationDebug] ✅ ALLOWED: Subject change accepted (total = ${newTotal})`);
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
              {/* Show subject description only when subject strength > 0 AND image is uploaded */}
              {subjectStrength > 0 && styleReferenceImage && (
                <div className="space-y-2">
                  <Label htmlFor="subject-description" className="text-sm font-medium">
                    Subject description
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
        </div>
      </div>
    </div>
    
    {/* Dataset Browser Modal */}
    <DatasetBrowserModal
      isOpen={showDatasetBrowser}
      onOpenChange={setShowDatasetBrowser}
      onImageSelect={onStyleUpload}
    />
  </div>
  );
};

export const ModelSection: React.FC<ModelSectionProps> = ({
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
      />
    </div>
  );
};
