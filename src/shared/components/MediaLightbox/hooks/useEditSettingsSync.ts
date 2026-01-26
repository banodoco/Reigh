/**
 * useEditSettingsSync Hook
 *
 * Handles bidirectional sync between persisted edit settings and
 * the active inpainting UI state. Syncs on initial load and on changes.
 */

import { useRef, useEffect } from 'react';
import type { EditMode } from './useGenerationEditSettings';

export interface UseEditSettingsSyncProps {
  /** Current generation ID for tracking changes */
  actualGenerationId: string | undefined;
  /** Whether edit settings are ready to use */
  isEditSettingsReady: boolean;
  /** Whether there are persisted settings for this generation */
  hasPersistedSettings: boolean;

  // Persisted values
  persistedEditMode: EditMode | undefined;
  persistedNumGenerations: number | undefined;
  persistedPrompt: string | undefined;

  // Current UI values
  editMode: EditMode;
  inpaintNumGenerations: number;
  inpaintPrompt: string;

  // Setters for UI values
  setEditMode: (mode: EditMode) => void;
  setInpaintNumGenerations: (num: number) => void;
  setInpaintPrompt: (prompt: string) => void;

  // Setters for persisted values
  setPersistedEditMode: (mode: EditMode) => void;
  setPersistedNumGenerations: (num: number) => void;
  setPersistedPrompt: (prompt: string) => void;
}

export interface UseEditSettingsSyncReturn {
  /** Whether initial sync from persistence to UI has completed */
  hasInitializedFromPersistence: boolean;
}

/**
 * Syncs edit settings bidirectionally between persistence layer and UI state.
 * - On load: applies persisted settings to UI (once per generation)
 * - On change: syncs UI changes back to persistence
 */
export function useEditSettingsSync({
  actualGenerationId,
  isEditSettingsReady,
  hasPersistedSettings,
  persistedEditMode,
  persistedNumGenerations,
  persistedPrompt,
  editMode,
  inpaintNumGenerations,
  inpaintPrompt,
  setEditMode,
  setInpaintNumGenerations,
  setInpaintPrompt,
  setPersistedEditMode,
  setPersistedNumGenerations,
  setPersistedPrompt,
}: UseEditSettingsSyncProps): UseEditSettingsSyncReturn {
  // Track if we've synced initial values from persistence to inpainting
  const hasInitializedFromPersistenceRef = useRef(false);
  const lastSyncedGenerationIdRef = useRef<string | null>(null);

  // Reset sync tracking when generation changes
  useEffect(() => {
    if (actualGenerationId !== lastSyncedGenerationIdRef.current) {
      hasInitializedFromPersistenceRef.current = false;
      lastSyncedGenerationIdRef.current = actualGenerationId ?? null;
    }
  }, [actualGenerationId]);

  // Initialize inpainting state from persisted/lastUsed settings (once per generation)
  // IMPORTANT: Wait for isEditSettingsReady to ensure effective values are computed correctly
  useEffect(() => {
    if (
      isEditSettingsReady &&
      !hasInitializedFromPersistenceRef.current &&
      actualGenerationId
    ) {
      hasInitializedFromPersistenceRef.current = true;

      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: Applying settings to inpainting state');
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: generationId:', actualGenerationId.substring(0, 8));
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: hasPersistedSettings:', hasPersistedSettings);
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: persistedEditMode:', persistedEditMode);
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: persistedNumGenerations:', persistedNumGenerations);
      console.log('[EditSettingsPersist] 🔄 SYNC TO UI: persistedPrompt:', persistedPrompt ? `"${persistedPrompt.substring(0, 30)}..."` : '(empty)');

      // Sync edit mode
      if (persistedEditMode && persistedEditMode !== editMode) {
        console.log('[EditSettingsPersist] 🔄 SYNC TO UI: Setting editMode from', editMode, 'to', persistedEditMode);
        setEditMode(persistedEditMode);
      }

      // Sync numGenerations
      if (persistedNumGenerations && persistedNumGenerations !== inpaintNumGenerations) {
        console.log('[EditSettingsPersist] 🔄 SYNC TO UI: Setting numGenerations from', inpaintNumGenerations, 'to', persistedNumGenerations);
        setInpaintNumGenerations(persistedNumGenerations);
      }

      // Sync prompt (only if has persisted settings - otherwise leave empty)
      if (hasPersistedSettings && persistedPrompt && persistedPrompt !== inpaintPrompt) {
        console.log('[EditSettingsPersist] 🔄 SYNC TO UI: Setting prompt');
        setInpaintPrompt(persistedPrompt);
      }
    }
  }, [
    isEditSettingsReady,
    actualGenerationId,
    hasPersistedSettings,
    persistedEditMode,
    persistedNumGenerations,
    persistedPrompt,
    editMode,
    inpaintNumGenerations,
    inpaintPrompt,
    setEditMode,
    setInpaintNumGenerations,
    setInpaintPrompt,
  ]);

  // Sync changes FROM inpainting TO persistence (debounced via the persistence hook)
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;

    // Sync editMode changes
    if (editMode !== persistedEditMode) {
      console.log('[EditSettingsPersist] 💾 SYNC FROM UI: editMode changed to:', editMode);
      setPersistedEditMode(editMode);
    }
  }, [editMode, persistedEditMode, setPersistedEditMode, isEditSettingsReady]);

  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;

    // Sync numGenerations changes
    if (inpaintNumGenerations !== persistedNumGenerations) {
      console.log('[EditSettingsPersist] 💾 SYNC FROM UI: numGenerations changed to:', inpaintNumGenerations);
      setPersistedNumGenerations(inpaintNumGenerations);
    }
  }, [inpaintNumGenerations, persistedNumGenerations, setPersistedNumGenerations, isEditSettingsReady]);

  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;

    // Sync prompt changes
    if (inpaintPrompt !== persistedPrompt) {
      console.log('[EditSettingsPersist] 💾 SYNC FROM UI: prompt changed to:', inpaintPrompt ? `"${inpaintPrompt.substring(0, 30)}..."` : '(empty)');
      setPersistedPrompt(inpaintPrompt);
    }
  }, [inpaintPrompt, persistedPrompt, setPersistedPrompt, isEditSettingsReady]);

  return {
    hasInitializedFromPersistence: hasInitializedFromPersistenceRef.current,
  };
}
