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
  Paintbrush,
  ArrowUpCircle,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface MediaControlsProps {
  // Media info
  mediaId: string;
  isVideo: boolean;
  shotImageEntryId: string | undefined;
  
  // Display props
  readOnly: boolean;
  showDownload: boolean;
  showImageEditTools: boolean;
  showMagicEdit: boolean;
  selectedProjectId: string | undefined;
  isCloudMode: boolean;
  toolTypeOverride?: string;
  imageDimensions: { width: number; height: number } | null;
  sourceUrlForTasks: string;
  
  // Mode states
  isSpecialEditMode?: boolean;
  
  // Star functionality
  localStarred: boolean;
  handleToggleStar: () => void;
  
  // References functionality
  isAddingToReferences: boolean;
  addToReferencesSuccess: boolean;
  handleAddToReferences: () => Promise<void>;
  
  // Inpainting functionality
  handleEnterInpaintMode: () => void;
  
  // Upscale functionality
  isUpscaling: boolean;
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  showingUpscaled: boolean;
  handleUpscale: () => Promise<void>;
  handleToggleUpscaled: () => void;
  
  // Image flip functionality
  hasChanges: boolean;
  isSaving: boolean;
  handleFlip: () => void;
  handleSave: () => Promise<void>;
  
  // Download functionality
  handleDownload: () => Promise<void>;
  
  // Delete functionality
  onDelete?: (id: string) => void;
  handleDelete?: () => void;
  isDeleting?: boolean;
}

/**
 * MediaControls Component
 * Renders the top control bar with star, add to references, inpaint, upscale,
 * magic edit, flip, save, and download buttons
 */
export const MediaControls: React.FC<MediaControlsProps> = ({
  mediaId,
  isVideo,
  shotImageEntryId,
  readOnly,
  showDownload,
  showImageEditTools,
  showMagicEdit,
  selectedProjectId,
  isCloudMode,
  toolTypeOverride,
  imageDimensions,
  sourceUrlForTasks,
  isSpecialEditMode,
  localStarred,
  handleToggleStar,
  isAddingToReferences,
  addToReferencesSuccess,
  handleAddToReferences,
  handleEnterInpaintMode,
  isUpscaling,
  isPendingUpscale,
  hasUpscaledVersion,
  showingUpscaled,
  handleUpscale,
  handleToggleUpscaled,
  hasChanges,
  isSaving,
  handleFlip,
  handleSave,
  handleDownload,
  onDelete,
  handleDelete,
  isDeleting,
}) => {
  return (
    <div className="absolute top-4 right-4 flex items-center space-x-2 z-10">
      {/* Star Button (hidden in readOnly and special edit modes) */}
      {!readOnly && !isSpecialEditMode && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleToggleStar}
          className="transition-colors bg-black/50 hover:bg-black/70 text-white"
        >
          <Star className={`h-4 w-4 ${localStarred ? 'fill-current' : ''}`} />
        </Button>
      )}

      {/* Add to References Button (hidden in readOnly and special edit modes) */}
      {!readOnly && !isVideo && selectedProjectId && !isSpecialEditMode && (
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

      {/* Inpaint Button (hidden in readOnly, only shown in cloud mode) */}
      {!readOnly && !isVideo && selectedProjectId && isCloudMode && !isSpecialEditMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleEnterInpaintMode}
              className="transition-colors bg-black/50 hover:bg-black/70 text-white"
            >
              <Paintbrush className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">Inpaint image</TooltipContent>
        </Tooltip>
      )}

      {/* Upscale Button (hidden in readOnly, only shown in cloud mode) */}
      {!readOnly && !isVideo && selectedProjectId && isCloudMode && !isSpecialEditMode && (
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

      {/* Image Edit Tools: Flip and Save */}
      {!isVideo && showImageEditTools && !readOnly && !isSpecialEditMode && (
        <>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-green-600/80 hover:bg-green-600 text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="z-[100001]">{isSaving ? 'Saving...' : 'Save changes'}</TooltipContent>
            </Tooltip>
          )}
        </>
      )}

      {/* Download Button */}
      {showDownload && !readOnly && !isSpecialEditMode && (
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
      
      {/* Delete Button */}
      {onDelete && handleDelete && !readOnly && !isVideo && !isSpecialEditMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-red-600/80 hover:bg-red-600 text-white"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">Delete from timeline</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

