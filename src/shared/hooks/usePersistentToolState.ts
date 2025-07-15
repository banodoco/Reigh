import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { deepEqual, deepMerge } from '../lib/deepEqual';

export interface StateMapping<T> {
  [key: string]: [T[keyof T], React.Dispatch<React.SetStateAction<T[keyof T]>>];
}

export type SettingsScope = 'project' | 'shot';

export interface UsePersistentToolStateOptions<T> {
  debounceMs?: number;
  scope?: SettingsScope;
  enabled?: boolean;
  defaults: T;
}

export interface UsePersistentToolStateResult {
  ready: boolean;
  isSaving: boolean;
  saveError?: Error;
  hasUserInteracted: boolean;
  markAsInteracted: () => void;
}

export function usePersistentToolState<T extends Record<string, any>>(
  toolId: string,
  context: { projectId?: string; shotId?: string },
  stateMapping: StateMapping<T>,
  options?: UsePersistentToolStateOptions<T>
): UsePersistentToolStateResult {
  const { debounceMs = 500, scope = 'project', enabled = true, defaults } = options || {} as UsePersistentToolStateOptions<T>;

  // If defaults is undefined, use an empty object to avoid errors in deepMerge operations later
  const resolvedDefaults: T = (defaults || ({} as unknown as T));
  const [ready, setReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | undefined>();
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const hasHydratedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteractedRef = useRef(false);
  const lastSavedSettingsRef = useRef<T | null>(null);
  const hydratedForEntityRef = useRef<string | null>(null);

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
    if (!hasHydratedRef.current && entityKey) {
      const fetchSettings = async () => {
        const { data, error } = await supabase
          .from('tool_settings')
          .select('settings')
          .eq('tool_id', toolId)
          .eq('entity_id', entityKey)
          .eq('scope', scope)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error('[usePersistentToolState] Failed to fetch settings:', error);
          // Fallback to defaults if fetch fails
          const effectiveSettings = deepMerge(resolvedDefaults, {});
          Object.entries(stateMapping).forEach(([key, [_, setter]]) => {
            setter(effectiveSettings[key as keyof T] as any);
          });
          hasHydratedRef.current = true;
          setReady(true);
          return;
        }

        const effectiveSettings = deepMerge(resolvedDefaults, (data?.settings as Partial<T>) || {});

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
      };

      fetchSettings();
    }
  }, [toolId, entityKey, scope, resolvedDefaults, stateMapping]);

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
    if (!entityKey || !hasHydratedRef.current || !userHasInteractedRef.current) {
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
          deepEqual(currentState, lastSavedSettingsRef.current)) {
        return;
      }

      // Fetch current settings to merge with patch
      const { data: currentSettingsData, error: fetchError } = await supabase
        .from('tool_settings')
        .select('settings')
        .eq('tool_id', toolId)
        .eq('entity_id', entityKey)
        .eq('scope', scope)
        .single();

      if (fetchError) {
        console.error('[usePersistentToolState] Failed to fetch current settings for update:', fetchError);
        setSaveError(fetchError as Error);
        return;
      }

      const currentSettings = deepMerge(resolvedDefaults, (currentSettingsData?.settings as Partial<T>) || {});

      // Merge current settings with the new state to create the patch
      const patch = deepMerge(currentSettings, currentState);

      // Upsert the new settings
      const { error: upsertError } = await supabase
        .from('tool_settings')
        .upsert({
          tool_id: toolId,
          entity_id: entityKey,
          scope: scope,
          settings: patch,
        })
        .select()
        .single();

      if (upsertError) {
        console.error('[usePersistentToolState] Failed to upsert settings:', upsertError);
        setSaveError(upsertError as Error);
      } else {
        lastSavedSettingsRef.current = currentState;
        setSaveError(undefined);
      }
    }, debounceMs);

    // Cleanup timeout on unmount or dependencies change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    toolId,
    entityKey,
    scope,
    resolvedDefaults,
    getCurrentState,
    debounceMs,
    // Include all state values to trigger saves on change
    ...Object.entries(stateMapping).map(([_, [value]]) => value)
  ]);

  return {
    ready,
    isSaving: isSaving,
    saveError,
    hasUserInteracted,
    markAsInteracted
  };
} 