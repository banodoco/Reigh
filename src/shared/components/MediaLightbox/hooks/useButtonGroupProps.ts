/**
 * useButtonGroupProps Hook
 *
 * Centralizes the props for all four button group components (TopLeft, TopRight,
 * BottomLeft, BottomRight) to ensure consistency across layout branches.
 *
 * This prevents prop divergence bugs where one layout branch gets updated
 * but others don't.
 */

import { useMemo } from 'react';

interface UseButtonGroupPropsParams {
  // Shared base props
  isVideo: boolean;
  readOnly: boolean;
  isSpecialEditMode: boolean;
  selectedProjectId: string | undefined;
  isCloudMode: boolean;
  mediaId: string;

  // TopLeft & BottomLeft - Edit mode
  handleEnterMagicEditMode: () => void;

  // TopRight - Download & Delete
  showDownload: boolean;
  handleDownload: () => Promise<void>;
  onDelete?: (id: string) => void;
  handleDelete?: () => void;
  isDeleting?: string | null;
  onClose: () => void;

  // BottomLeft - Upscale
  isUpscaling: boolean;
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  showingUpscaled: boolean;
  handleUpscale: () => Promise<void>;
  handleToggleUpscaled: () => void;

  // BottomRight - Star & References
  localStarred: boolean;
  handleToggleStar: () => void;
  toggleStarPending: boolean;
  isAddingToReferences: boolean;
  addToReferencesSuccess: boolean;
  handleAddToReferences: () => Promise<void>;
  handleAddToJoin?: () => void;
  isAddingToJoin?: boolean;
  addToJoinSuccess?: boolean;
  onGoToJoin?: () => void;
}

export function useButtonGroupProps({
  // Shared base props
  isVideo,
  readOnly,
  isSpecialEditMode,
  selectedProjectId,
  isCloudMode,
  mediaId,

  // TopLeft & BottomLeft
  handleEnterMagicEditMode,

  // TopRight
  showDownload,
  handleDownload,
  onDelete,
  handleDelete,
  isDeleting,
  onClose,

  // BottomLeft - Upscale
  isUpscaling,
  isPendingUpscale,
  hasUpscaledVersion,
  showingUpscaled,
  handleUpscale,
  handleToggleUpscaled,

  // BottomRight
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
}: UseButtonGroupPropsParams) {
  return useMemo(() => ({
    topLeft: {
      isVideo,
      readOnly,
      isSpecialEditMode,
      selectedProjectId,
      isCloudMode,
      handleEnterMagicEditMode,
    },

    topRight: {
      isVideo,
      readOnly,
      isSpecialEditMode,
      selectedProjectId,
      isCloudMode,
      showDownload,
      handleDownload,
      onDelete,
      handleDelete,
      isDeleting,
      mediaId,
      onClose,
    },

    bottomLeft: {
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
    },

    bottomRight: {
      isVideo,
      readOnly,
      isSpecialEditMode,
      selectedProjectId,
      isCloudMode,
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
    },
  }), [
    isVideo,
    readOnly,
    isSpecialEditMode,
    selectedProjectId,
    isCloudMode,
    mediaId,
    handleEnterMagicEditMode,
    showDownload,
    handleDownload,
    onDelete,
    handleDelete,
    isDeleting,
    onClose,
    isUpscaling,
    isPendingUpscale,
    hasUpscaledVersion,
    showingUpscaled,
    handleUpscale,
    handleToggleUpscaled,
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
  ]);
}
