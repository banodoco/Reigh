import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { Trash2 } from "lucide-react";
import FileInput from "@/shared/components/FileInput";
import { SectionHeader } from "./SectionHeader";

interface ModelSectionProps {
  isGenerating: boolean;
  styleReferenceImage: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  isUploadingStyleReference: boolean;
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
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [showValidationError, setShowValidationError] = React.useState(false);
  const [lastValidationState, setLastValidationState] = React.useState<'valid' | 'invalid' | null>(null);
  const validationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const errorShowTimeRef = React.useRef<number | null>(null);

  // Helper function to show validation error with auto-hide (prevents flickering)
  const showValidationErrorMessage = React.useCallback((message: string) => {
    // Only show error if we're transitioning from valid to invalid state
    if (lastValidationState === 'invalid') {
      return; // Already showing error, don't restart animation
    }
    
    setLastValidationState('invalid');
    errorShowTimeRef.current = Date.now(); // Record when error was shown
    
    // Clear any existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    // Set the error message and show it
    setValidationError(message);
    setShowValidationError(true);
    
    // Auto-hide after 3 seconds
    validationTimeoutRef.current = setTimeout(() => {
      setShowValidationError(false);
      // Clear the message after fade out animation completes
      setTimeout(() => {
        setValidationError(null);
        setLastValidationState(null);
        errorShowTimeRef.current = null;
      }, 300); // Match the CSS transition duration
    }, 3000);
  }, [lastValidationState]);

  // Helper function to clear validation error (respects minimum 2-second display time)
  const clearValidationError = React.useCallback(() => {
    // Don't change validation state to 'valid' immediately - wait for the minimum time
    
    // Check if error has been shown for at least 2 seconds
    if (errorShowTimeRef.current && showValidationError) {
      const timeShown = Date.now() - errorShowTimeRef.current;
      const minimumDisplayTime = 2000; // 2 seconds
      
      if (timeShown < minimumDisplayTime) {
        // Wait for the remaining time before hiding
        const remainingTime = minimumDisplayTime - timeShown;
        
        if (validationTimeoutRef.current) {
          clearTimeout(validationTimeoutRef.current);
        }
        
        validationTimeoutRef.current = setTimeout(() => {
          setShowValidationError(false);
          setTimeout(() => {
            setValidationError(null);
            setLastValidationState(null);
            errorShowTimeRef.current = null;
          }, 300); // Match the CSS transition duration
        }, remainingTime);
        
        return; // Don't hide immediately
      }
    }
    
    // Error has been shown for 2+ seconds or not currently showing, hide immediately
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    if (showValidationError) {
      setShowValidationError(false);
      setTimeout(() => {
        setValidationError(null);
        setLastValidationState(null);
        errorShowTimeRef.current = null;
      }, 300); // Match the CSS transition duration
    } else {
      // Not currently showing, just reset state
      setLastValidationState(null);
      errorShowTimeRef.current = null;
    }
  }, [showValidationError]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

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
      {/* Always show the same layout with image on left, controls on right */}
      <div className="w-full">
        <div className="border-2 border-solid border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 relative">
          <div className="flex items-start space-x-4">
            <div className="relative w-48 flex-shrink-0">
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
                /* Upload area with same aspect ratio as image */
                <div className="w-full aspect-square relative">
                  {/* Custom square upload area that matches image dimensions */}
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
            </div>
            <div className={`flex-1 pt-2 space-y-4 ${!styleReferenceImage ? 'opacity-50 pointer-events-none' : ''}`}>
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
                    showValidationErrorMessage("Both strengths must add up to more than 0.5");
                    return;
                  }
                  console.log(`[StrengthValidationDebug] ✅ ALLOWED: Style change accepted (total = ${newTotal})`);
                  clearValidationError(); // Clear error on successful change
                  onStyleStrengthChange(value);
                }}
                min={0.0}
                max={2.0}
                step={0.1}
                disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                numberInputClassName="w-10"
              />
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
                    showValidationErrorMessage("Both strengths must add up to more than 0.5");
                    return;
                  }
                  console.log(`[StrengthValidationDebug] ✅ ALLOWED: Subject change accepted (total = ${newTotal})`);
                  clearValidationError(); // Clear error on successful change
                  onSubjectStrengthChange(value);
                }}
                min={0.0}
                max={2.0}
                step={0.1}
                disabled={isGenerating || isUploadingStyleReference || !styleReferenceImage}
                numberInputClassName="w-10"
              />
              {/* Validation error message with fade animation */}
              {validationError && (
                <div 
                  className={`text-red-500 text-sm font-medium transition-all duration-300 ease-in-out transform ${
                    showValidationError 
                      ? 'opacity-100 translate-y-0' 
                      : 'opacity-0 -translate-y-1'
                  }`}
                  style={{
                    maxHeight: showValidationError ? '2rem' : '0',
                    overflow: 'hidden'
                  }}
                >
                  {validationError}
                </div>
              )}
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
