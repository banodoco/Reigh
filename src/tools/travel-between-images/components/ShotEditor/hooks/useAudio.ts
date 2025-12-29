import { useState, useEffect, useCallback, useRef } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';

export interface AudioMetadata {
  duration: number;
  name?: string;
}

export interface UseAudioParams {
  projectId: string;
  shotId: string | undefined;
}

export interface UseAudioReturn {
  audioUrl: string | null;
  audioMetadata: AudioMetadata | null;
  handleAudioChange: (
    audioUrl: string | null,
    metadata: AudioMetadata | null
  ) => void;
  isLoading: boolean;
}

/**
 * Hook to manage audio state with database persistence
 * Handles loading from settings, auto-save on changes, and shot-switching
 */
export function useAudio({
  projectId,
  shotId,
}: UseAudioParams): UseAudioReturn {
  // Audio persistence using separate tool settings (per-shot basis)
  const {
    settings: audioSettings,
    update: updateAudioSettings,
    isLoading: isAudioSettingsLoading
  } = useToolSettings<{
    url?: string;
    metadata?: AudioMetadata;
  }>('travel-audio', {
    projectId,
    shotId: shotId,
    enabled: !!shotId
  });

  // Audio state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMetadata, setAudioMetadata] = useState<AudioMetadata | null>(null);
  const [hasInitializedAudio, setHasInitializedAudio] = useState<string | null>(null);

  // Reset initialization state when shot changes
  useEffect(() => {
    if (shotId !== hasInitializedAudio) {
      setHasInitializedAudio(null);
    }
  }, [shotId, hasInitializedAudio]);

  // Load audio from settings when shot loads
  useEffect(() => {
    if (!hasInitializedAudio && !isAudioSettingsLoading && shotId) {
      if (audioSettings?.url) {
        setAudioUrl(audioSettings.url);
        setAudioMetadata(audioSettings.metadata || null);
      } else {
        // No saved audio - initialize with defaults
        setAudioUrl(null);
        setAudioMetadata(null);
      }
      setHasInitializedAudio(shotId);
    }
  }, [audioSettings, isAudioSettingsLoading, shotId, hasInitializedAudio]);

  // Refs for stable callback
  const updateAudioSettingsRef = useRef(updateAudioSettings);
  updateAudioSettingsRef.current = updateAudioSettings;
  const shotIdRef = useRef(shotId);
  shotIdRef.current = shotId;

  // Handler for audio changes with auto-save
  const handleAudioChange = useCallback((
    url: string | null,
    metadata: AudioMetadata | null
  ) => {
    console.log('[useAudio] handleAudioChange called:', {
      url: url ? url.substring(0, 50) + '...' : null,
      hasMetadata: !!metadata,
      shotId: shotIdRef.current?.substring(0, 8)
    });

    setAudioUrl(url);
    setAudioMetadata(metadata);

    // Save to database
    if (url) {
      console.log('[useAudio] 💾 SAVING audio to database');
      updateAudioSettingsRef.current('shot', {
        url: url,
        metadata: metadata || null
      });
    } else {
      console.log('[useAudio] 🗑️ CLEARING audio from database');
      updateAudioSettingsRef.current('shot', {
        url: null,
        metadata: null
      });
    }
  }, []);

  return {
    audioUrl,
    audioMetadata,
    handleAudioChange,
    isLoading: isAudioSettingsLoading,
  };
}
