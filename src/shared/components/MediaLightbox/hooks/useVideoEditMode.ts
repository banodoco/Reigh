import { useState, useRef, useCallback, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';

export type VideoEditSubMode = 'trim' | 'replace' | 'regenerate' | null;

interface UseVideoEditModeProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  initialVideoTrimMode?: boolean;
  /** Setter from editSettingsPersistence to persist the mode */
  setPersistedVideoEditSubMode?: (mode: VideoEditSubMode) => void;
  /** Persisted mode from editSettingsPersistence (for logging) */
  persistedVideoEditSubMode?: VideoEditSubMode;
}

interface UseVideoEditModeReturn {
  /** Current video edit sub-mode */
  videoEditSubMode: VideoEditSubMode;
  /** Set the video edit sub-mode (also persists) */
  setVideoEditSubMode: (mode: VideoEditSubMode) => void;
  /** Whether currently in trim mode */
  isVideoTrimMode: boolean;
  /** Whether in any video edit mode */
  isInVideoEditMode: boolean;
  /** Ref to the trim video element */
  trimVideoRef: React.RefObject<HTMLVideoElement>;
  /** Current time in the trim video */
  trimCurrentTime: number;
  /** Set the current time in the trim video */
  setTrimCurrentTime: (time: number) => void;
  /** Whether to create as a new generation (vs variant) */
  createAsGeneration: boolean;
  /** Toggle create as generation */
  setCreateAsGeneration: (value: boolean) => void;
  /** Variant params to load into regenerate form */
  variantParamsToLoad: Record<string, any> | null;
  /** Set variant params to load */
  setVariantParamsToLoad: (params: Record<string, any> | null) => void;
}

/**
 * Hook to manage video edit mode state.
 * Handles trim, replace, and regenerate sub-modes for video editing.
 * Persists mode to localStorage for restoration on re-entry.
 */
export function useVideoEditMode({
  media,
  selectedProjectId,
  initialVideoTrimMode,
  setPersistedVideoEditSubMode,
  persistedVideoEditSubMode,
}: UseVideoEditModeProps): UseVideoEditModeReturn {
  // Video edit mode state
  // Initialize from localStorage directly to prevent flash (editSettingsPersistence isn't available yet)
  const [videoEditSubMode, setVideoEditSubModeLocal] = useState<VideoEditSubMode>(() => {
    if (initialVideoTrimMode) return 'trim';

    // Check if this is a video
    const mediaIsVideo = media.type === 'video' ||
      (media.location?.endsWith('.mp4') || media.location?.endsWith('.webm'));
    if (!mediaIsVideo) return null;

    // Check if we should restore to edit mode from localStorage
    try {
      const projectKey = selectedProjectId ? `lightbox-edit-last-used-${selectedProjectId}` : null;
      const stored = projectKey
        ? localStorage.getItem(projectKey)
        : localStorage.getItem('lightbox-edit-last-used-global');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.panelMode === 'edit' && parsed.videoEditSubMode) {
          console.log('[PanelRestore] Initializing videoEditSubMode from localStorage:', parsed.videoEditSubMode);
          return parsed.videoEditSubMode;
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return null;
  });

  // Derived states for compatibility with existing code
  const isVideoTrimMode = videoEditSubMode === 'trim';
  const isInVideoEditMode = videoEditSubMode !== null;

  // Video ref and currentTime for trim mode
  const trimVideoRef = useRef<HTMLVideoElement>(null);
  const [trimCurrentTime, setTrimCurrentTime] = useState(0);

  // Create as variant toggle - when false (createAsGeneration=true), creates new generation instead of variant
  const [createAsGeneration, setCreateAsGeneration] = useState(false);

  // Variant params to load into regenerate form (triggered from VariantSelector hover)
  const [variantParamsToLoad, setVariantParamsToLoad] = useState<Record<string, any> | null>(null);

  // Wrapper for setVideoEditSubMode that also persists to localStorage/DB
  const setVideoEditSubMode = useCallback((mode: VideoEditSubMode) => {
    console.log('[EDIT_DEBUG] 🎬 setVideoEditSubMode called:', mode, '(persisted was:', persistedVideoEditSubMode, ')');
    setVideoEditSubModeLocal(mode);
    if (mode && setPersistedVideoEditSubMode) {
      // Persist when entering a sub-mode (not when exiting to null)
      setPersistedVideoEditSubMode(mode);
    }
  }, [setPersistedVideoEditSubMode, persistedVideoEditSubMode]);

  return {
    videoEditSubMode,
    setVideoEditSubMode,
    isVideoTrimMode,
    isInVideoEditMode,
    trimVideoRef,
    trimCurrentTime,
    setTrimCurrentTime,
    createAsGeneration,
    setCreateAsGeneration,
    variantParamsToLoad,
    setVariantParamsToLoad,
  };
}
