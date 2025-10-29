import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import {
  Star,
  Download,
  FlipHorizontal,
  Save,
  CheckCircle,
  Loader2,
  ImagePlus,
  Pencil,
  ArrowUpCircle,
  Eye,
  EyeOff,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// ============================================================================
// SHARED TYPES
// ============================================================================

interface BaseButtonGroupProps {
  isVideo: boolean;
  readOnly: boolean;
  isSpecialEditMode: boolean;
  selectedProjectId: string | undefined;
  isCloudMode: boolean;
  mediaId?: string;
}

// ============================================================================
// TOP LEFT CONTROLS - Flip & Save
// ============================================================================

interface TopLeftControlsProps extends BaseButtonGroupProps {
  showImageEditTools: boolean;
  hasChanges: boolean;
  isSaving: boolean;
  handleFlip: () => void;
  handleSave: (url: string) => Promise<void>;
  effectiveImageUrl: string;
}

export const TopLeftControls: React.FC<TopLeftControlsProps> = ({
  isVideo,
  readOnly,
  isSpecialEditMode,
  showImageEditTools,
  hasChanges,
  isSaving,
  handleFlip,
  handleSave,
  effectiveImageUrl,
}) => {
  if (isVideo || readOnly || isSpecialEditMode || !showImageEditTools) {
    return null;
  }

  return (
    <div className="absolute top-4 left-4 flex items-center space-x-2 z-10">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleFlip}
            className="bg-black/50 hover:bg-black/70 text-white"
          >
            <FlipHorizontal className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="z-[100001]">Flip horizontally</TooltipContent>
      </Tooltip>

      {hasChanges && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleSave(effectiveImageUrl)}
          disabled={isSaving}
          className="bg-green-600/80 hover:bg-green-600 text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

// ============================================================================
// TOP RIGHT CONTROLS - Download & Delete (no Save - Save is top-left)
// ============================================================================

interface TopRightControlsProps extends BaseButtonGroupProps {
  showDownload: boolean;
  handleDownload: () => Promise<void>;
  onDelete?: (id: string) => void;
  handleDelete?: () => void;
  isDeleting?: string | null;
  onClose: () => void;
}

export const TopRightControls: React.FC<TopRightControlsProps> = ({
  isVideo,
  readOnly,
  isSpecialEditMode,
  showDownload,
  handleDownload,
  onDelete,
  handleDelete,
  isDeleting,
  mediaId,
  onClose,
}) => {
  return (
    <div className="absolute top-4 right-4 flex items-center space-x-2 z-[70]">
      {/* Download Button - Keep visible in edit mode */}
      {showDownload && !readOnly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="bg-black/50 hover:bg-black/70 text-white"
            >
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">Download {isVideo ? 'video' : 'image'}</TooltipContent>
        </Tooltip>
      )}

      {/* Delete Button - Keep visible in edit mode */}
      {onDelete && !readOnly && !isVideo && handleDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              disabled={isDeleting === mediaId}
              className="bg-red-600/80 hover:bg-red-600 text-white"
            >
              {isDeleting === mediaId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">Delete from timeline</TooltipContent>
        </Tooltip>
      )}

      {/* Close Button - Removed per user request (close button in task details panel is sufficient) */}
    </div>
  );
};

// ============================================================================
// BOTTOM LEFT CONTROLS - Edit & Upscale
// ============================================================================

interface BottomLeftControlsProps extends BaseButtonGroupProps {
  handleEnterMagicEditMode: () => void;
  isUpscaling: boolean;
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  showingUpscaled: boolean;
  handleUpscale: () => Promise<void>;
  handleToggleUpscaled: () => void;
}

export const BottomLeftControls: React.FC<BottomLeftControlsProps> = ({
  isVideo,
  readOnly,
  isSpecialEditMode,
  selectedProjectId,
  isCloudMode,
  handleEnterMagicEditMode,
  isUpscaling,
  isPendingUpscale,
  hasUpscaledVersion,
  showingUpscaled,
  handleUpscale,
  handleToggleUpscaled,
}) => {
  if (isSpecialEditMode) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-4 flex items-center space-x-2 z-10">
      {/* Unified Edit Button */}
      {!isVideo && !readOnly && selectedProjectId && isCloudMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleEnterMagicEditMode}
              className="bg-black/50 hover:bg-black/70 text-white"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">Edit image</TooltipContent>
        </Tooltip>
      )}

      {/* Upscale Button */}
      {!readOnly && !isVideo && selectedProjectId && isCloudMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="secondary"
                size="sm"
                onClick={hasUpscaledVersion ? handleToggleUpscaled : handleUpscale}
                disabled={isUpscaling || isPendingUpscale}
                className={cn(
                  "transition-colors text-white",
                  isPendingUpscale ? "bg-green-600/80 hover:bg-green-600" : "bg-black/50 hover:bg-black/70"
                )}
              >
                {isUpscaling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPendingUpscale ? (
                  <CheckCircle className="h-4 w-4" />
                ) : hasUpscaledVersion ? (
                  showingUpscaled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />
                ) : (
                  <ArrowUpCircle className="h-4 w-4" />
                )}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">
            {isUpscaling ? 'Creating upscale...' : isPendingUpscale ? 'Upscaling in process' : hasUpscaledVersion ? (showingUpscaled ? 'Upscaled version. Show original.' : 'Original version. Show upscaled.') : 'Upscale image'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

// ============================================================================
// BOTTOM RIGHT CONTROLS - Star & Add to References
// ============================================================================

interface BottomRightControlsProps extends BaseButtonGroupProps {
  localStarred: boolean;
  handleToggleStar: () => void;
  toggleStarPending?: boolean;
  isAddingToReferences: boolean;
  addToReferencesSuccess: boolean;
  handleAddToReferences: () => Promise<void>;
}

export const BottomRightControls: React.FC<BottomRightControlsProps> = ({
  isVideo,
  readOnly,
  isSpecialEditMode,
  selectedProjectId,
  localStarred,
  handleToggleStar,
  toggleStarPending,
  isAddingToReferences,
  addToReferencesSuccess,
  handleAddToReferences,
}) => {
  // Keep visible in edit mode - users can star and add to references while editing
  return (
    <div className="absolute bottom-4 right-4 flex items-center space-x-2 z-10">
      {/* Star Button */}
      {!readOnly && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleToggleStar}
          disabled={toggleStarPending}
          className="transition-colors bg-black/50 hover:bg-black/70 text-white"
        >
          <Star className={`h-4 w-4 ${localStarred ? 'fill-current' : ''}`} />
        </Button>
      )}

      {/* Add to References Button */}
      {!readOnly && !isVideo && selectedProjectId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddToReferences}
              disabled={isAddingToReferences || addToReferencesSuccess}
              className={`transition-colors ${
                addToReferencesSuccess 
                  ? 'bg-green-600/80 hover:bg-green-600 text-white' 
                  : 'bg-black/50 hover:bg-black/70 text-white'
              }`}
            >
              {isAddingToReferences ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : addToReferencesSuccess ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">
            {isAddingToReferences ? 'Adding...' : addToReferencesSuccess ? 'Added!' : 'Add to references'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

