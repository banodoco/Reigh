import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import {
  Star,
  Download,
  CheckCircle,
  Loader2,
  ImagePlus,
  ArrowUpCircle,
  Trash2,
  Film,
  ArrowRight,
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
// TOP LEFT CONTROLS - Edit Button
// ============================================================================

interface TopLeftControlsProps extends BaseButtonGroupProps {
  handleEnterMagicEditMode?: () => void;
}

export const TopLeftControls: React.FC<TopLeftControlsProps> = () => {
  // Edit button removed - no longer shown in top left
  return null;
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

    </div>
  );
};

// ============================================================================
// BOTTOM LEFT CONTROLS - Upscale Only (Edit moved to top-left)
// ============================================================================

interface BottomLeftControlsProps extends BaseButtonGroupProps {
  handleEnterMagicEditMode: () => void; // Kept for backwards compatibility, but not used here
  isUpscaling: boolean;
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  showingUpscaled: boolean; // Kept for API compatibility, but not used
  handleUpscale: () => Promise<void>;
  handleToggleUpscaled: () => void; // Kept for API compatibility, but not used
}

export const BottomLeftControls: React.FC<BottomLeftControlsProps> = () => {
  // Upscale button removed
  return null;
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
  // Add to Join Clips
  handleAddToJoin?: () => void;
  isAddingToJoin?: boolean;
  addToJoinSuccess?: boolean;
  onGoToJoin?: () => void;
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
  handleAddToJoin,
  isAddingToJoin,
  addToJoinSuccess,
  onGoToJoin,
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

      {/* Add to Join Clips Button (videos only) */}
      {!readOnly && isVideo && handleAddToJoin && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={addToJoinSuccess && onGoToJoin ? onGoToJoin : handleAddToJoin}
              disabled={isAddingToJoin}
              className={`transition-colors ${
                addToJoinSuccess
                  ? 'bg-green-600/80 hover:bg-green-600 text-white'
                  : 'bg-black/50 hover:bg-black/70 text-white'
              }`}
            >
              {isAddingToJoin ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : addToJoinSuccess ? (
                <ArrowRight className="h-4 w-4" />
              ) : (
                <Film className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[100001]">
            {isAddingToJoin ? 'Adding...' : addToJoinSuccess ? 'Added! Go to Join Clips' : 'Add to Join Clips'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

