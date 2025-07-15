import { useRef, useEffect, useState, useCallback } from 'react';
import { useToolSettings, SettingsScope } from './useToolSettings';
import { deepEqual, sanitizeSettings } from '../lib/deepEqual';

export interface StateMapping<T> {
  [key: string]: [T[keyof T], React.Dispatch<React.SetStateAction<T[keyof T]>>];
}

export interface UsePersistentToolStateOptions {
  debounceMs?: number;
  scope?: SettingsScope;
  /**
   * If false, the hook will skip fetching/saving settings and immediately report ready=true.
   * Useful when the relevant entity (e.g. project) has not been selected yet.
   */
  enabled?: boolean;
}

export interface UsePersistentToolStateResult {
  ready: boolean;
  isSaving: boolean;
  saveError?: Error;
  hasUserInteracted: boolean;
  markAsInteracted: () => void;
}

/**
 * Hook that synchronizes local React state with persistent tool settings in the database.
 * Provides automatic hydration, debounced saves, and deep equality checks.
 * 
 * @param toolId - The tool identifier (e.g., 'image-generation', 'video-travel')
 * @param context - Context for settings resolution (projectId, shotId, etc.)
 * @param stateMapping - Object mapping setting keys to [value, setter] tuples
 * @param options - Additional options for behavior customization
 * @returns Object with ready state, saving state, and interaction tracking
 * 
 * @example
 * const { ready, isSaving } = usePersistentToolState(
 *   'image-generation',
 *   { projectId },
 *   {
 *     generationMode: [generationMode, setGenerationMode],
 *     imagesPerPrompt: [imagesPerPrompt, setImagesPerPrompt],
 *   }
 * );
 */
export function usePersistentToolState<T extends Record<string, any>>(
  toolId: string,
  context: { projectId?: string; shotId?: string },
  stateMapping: StateMapping<T>,
  options: UsePersistentToolStateOptions = {}
): UsePersistentToolStateResult {
  const { debounceMs = 500, scope = 'project', enabled = true } = options;
  
  // Fast-path: if persistence is disabled, provide a noop implementation so the UI can render immediately.
  if (!enabled) {
    const noop = () => {};
    return {
      ready: true,
      isSaving: false,
      saveError: undefined,
      hasUserInteracted: false,
      markAsInteracted: noop,
    } as UsePersistentToolStateResult;
  }

  // Obtain current settings and mutation helpers
  const {
    settings,
    isLoading: isLoadingSettings,
    update: updateSettings,
    isUpdating,
  } = useToolSettings<T>(toolId, { ...context, enabled });

  // Track hydration and interaction state
  const hasHydratedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteractedRef = useRef(false);
  const lastSavedSettingsRef = useRef<T | null>(null);
  const hydratedForEntityRef = useRef<string | null>(null);

  // Public state for consumers
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<Error | undefined>();
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Get a unique key for the current entity (project/shot)
  const entityKey = scope === 'shot' ? context.shotId : context.projectId;

  // Reset hydration when entity changes
  useEffect(() => {
    if (entityKey !== hydratedForEntityRef.current) {
      hasHydratedRef.current = false;
      userHasInteractedRef.current = false;
      lastSavedSettingsRef.current = null;
      hydratedForEntityRef.current = entityKey || null;
      setReady(false);
      setHasUserInteracted(false);
    }
  }, [entityKey]);

  // Hydrate local state from persisted settings
  useEffect(() => {
    if (!isLoadingSettings && !hasHydratedRef.current && entityKey) {
      // Use an empty object if settings could not be fetched (e.g. first time or API failure)
      const effectiveSettings: Partial<T> = (settings as Partial<T>) || {};
      
      hasHydratedRef.current = true;
      userHasInteractedRef.current = false;
      
      // Apply each setting to its corresponding setter
      Object.entries(stateMapping).forEach(([key, [_, setter]]) => {
        if (effectiveSettings[key as keyof T] !== undefined) {
          setter(effectiveSettings[key as keyof T] as any);
        }
      });

      // Mark as ready after hydration
      setReady(true);
    }
  }, [settings, isLoadingSettings, stateMapping, entityKey]);

  // Collect current state values from the mapping
  const getCurrentState = useCallback((): T => {
    const currentState: any = {};
    Object.entries(stateMapping).forEach(([key, [value]]) => {
      currentState[key] = value;
    });
    return currentState as T;
  }, [stateMapping]);

  // Function to mark that user has interacted
  const markAsInteracted = useCallback(() => {
    userHasInteractedRef.current = true;
    setHasUserInteracted(true);
  }, []);

  // Save settings with debouncing and deep comparison
  useEffect(() => {
    if (!entityKey || !settings || !hasHydratedRef.current || !userHasInteractedRef.current) {
      return;
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(async () => {
      const currentState = getCurrentState();
      
      // Check if we just saved these exact settings
      if (lastSavedSettingsRef.current && 
          deepEqual(sanitizeSettings(currentState), sanitizeSettings(lastSavedSettingsRef.current))) {
        return;
      }

      // Check if settings actually changed from what's in the database
      if (!isUpdating && !deepEqual(sanitizeSettings(currentState), sanitizeSettings(settings))) {
        try {
          lastSavedSettingsRef.current = currentState;
          await updateSettings(scope, currentState);
          setSaveError(undefined);
        } catch (error) {
          setSaveError(error as Error);
          console.error('[usePersistentToolState] Save error:', error);
        }
      }
    }, debounceMs);

    // Cleanup timeout on unmount or dependencies change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    entityKey,
    settings,
    getCurrentState,
    updateSettings,
    isUpdating,
    scope,
    debounceMs,
    // Include all state values to trigger saves on change
    ...Object.entries(stateMapping).map(([_, [value]]) => value)
  ]);

  return {
    ready,
    isSaving: isUpdating,
    saveError,
    hasUserInteracted,
    markAsInteracted
  };
} 