import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToolSettings, updateToolSettingsSupabase } from './useToolSettings';
import { deepEqual } from '@/shared/lib/deepEqual';

/**
 * Status states for the auto-save settings lifecycle
 */
export type AutoSaveStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

/**
 * Options for useAutoSaveSettings hook
 */
export interface UseAutoSaveSettingsOptions<T> {
  /** Tool identifier for storage */
  toolId: string;
  /** Shot ID for shot-scoped settings */
  shotId?: string | null;
  /** Project ID for project-scoped settings */
  projectId?: string | null;
  /** Scope of settings - determines which DB column is used */
  scope?: 'shot' | 'project';
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Default settings when none exist in DB */
  defaults: T;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Return type for useAutoSaveSettings hook
 */
export interface UseAutoSaveSettingsReturn<T> {
  /** Current settings (merged from DB + defaults) */
  settings: T;
  /** Current status of the settings lifecycle */
  status: AutoSaveStatus;
  /** The entity ID these settings are confirmed for (null if not yet loaded) */
  entityId: string | null;
  /** Whether settings have been modified since last save */
  isDirty: boolean;
  /** Error if status is 'error' */
  error: Error | null;
  /** Whether the shot had settings stored in DB (vs just defaults/project settings) */
  hasShotSettings: boolean;

  /** Update a single field */
  updateField: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Update multiple fields at once */
  updateFields: (updates: Partial<T>) => void;
  /** Force an immediate save (bypasses debounce) */
  saveImmediate: () => Promise<void>;
  /** Revert to last saved settings */
  revert: () => void;
}

/**
 * Generic hook for auto-saving entity settings to the database.
 * 
 * Features:
 * - Loads settings from DB with scope cascade (defaults → user → project → shot)
 * - Debounced auto-save on field changes
 * - Flushes pending saves on unmount/navigation
 * - Dirty tracking for unsaved changes indicator
 * - Status machine for loading states
 * 
 * CRITICAL: During loading (status !== 'ready'), updates only affect local UI state.
 * This prevents auto-initialization effects from blocking DB values.
 * 
 * @example
 * ```typescript
 * const settings = useAutoSaveSettings({
 *   toolId: 'my-tool',
 *   shotId: selectedShotId,
 *   scope: 'shot',
 *   defaults: { prompt: '', mode: 'basic' },
 * });
 * 
 * // Update a field (auto-saves after debounce)
 * settings.updateField('prompt', 'new prompt');
 * 
 * // Check if ready before rendering
 * if (settings.status !== 'ready') return <Loading />;
 * ```
 */
export function useAutoSaveSettings<T extends Record<string, any>>(
  options: UseAutoSaveSettingsOptions<T>
): UseAutoSaveSettingsReturn<T> {
  const {
    toolId,
    shotId,
    projectId,
    scope = 'shot',
    debounceMs = 300,
    defaults,
    enabled = true,
  } = options;

  const queryClient = useQueryClient();

  // Determine the entity ID based on scope
  const entityId = scope === 'shot' ? shotId : projectId;
  const isEntityValid = !!entityId;

  // Local state - single source of truth for UI
  const [settings, setSettings] = useState<T>(defaults);
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Refs for tracking state without triggering re-renders
  const loadedSettingsRef = useRef<T | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSettingsRef = useRef<T | null>(null);
  const pendingEntityIdRef = useRef<string | null>(null);
  const currentEntityIdRef = useRef<string | null>(null);
  const isUnmountingRef = useRef(false);
  
  // Edit version counter - increments on each edit, used to detect if newer edits happened during save
  const editVersionRef = useRef<number>(0);

  // Fetch settings from database
  const {
    settings: dbSettings,
    isLoading,
    update: updateSettings,
    hasShotSettings,
  } = useToolSettings<T>(toolId, {
    shotId: scope === 'shot' ? (shotId || undefined) : undefined,
    projectId: projectId || undefined,
    enabled: enabled && isEntityValid,
  });

  // Dirty flag - has user changed anything since load?
  const isDirty = useMemo(
    () => (loadedSettingsRef.current ? !deepEqual(settings, loadedSettingsRef.current) : false),
    [settings]
  );

  // Save implementation
  const saveImmediate = useCallback(async (settingsToSave?: T): Promise<void> => {
    if (!entityId) {
      console.warn('[useAutoSaveSettings] Cannot save - no entity selected');
      return;
    }

    const toSave = settingsToSave ?? settings;

    // Don't save if nothing changed
    if (deepEqual(toSave, loadedSettingsRef.current)) {
      console.log('[useAutoSaveSettings] ⏭️ Skipping save - no changes');
      return;
    }

    console.log('[useAutoSaveSettings] 💾 Saving settings:', {
      toolId,
      entityId: entityId.substring(0, 8),
    });

    setStatus('saving');

    try {
      await updateSettings(scope, toSave);

      // Update our "clean" reference
      loadedSettingsRef.current = JSON.parse(JSON.stringify(toSave));
      
      // NOTE: Don't clear pendingSettingsRef here - it's now handled in the timeout callback
      // with edit version checking to avoid race conditions when user types fast
      
      setStatus('ready');
      setError(null);

      console.log('[useAutoSaveSettings] ✅ Save successful');
    } catch (err) {
      console.error('[useAutoSaveSettings] ❌ Save failed:', err);
      setStatus('error');
      setError(err as Error);
      throw err;
    }
  }, [entityId, settings, updateSettings, scope, toolId]);

  // Ref to hold latest saveImmediate to avoid effect dependency churn
  const saveImmediateRef = useRef(saveImmediate);
  saveImmediateRef.current = saveImmediate;

  /**
   * Flush pending settings on entity change/unmount.
   *
   * IMPORTANT: this runs in the *cleanup* for the previous entity render.
   * We call updateToolSettingsSupabase directly with the explicit entity ID
   * to avoid drift issues when the hook's internal refs have already changed.
   */
  useEffect(() => {
    // Capture values for this effect instance
    const currentEntityId = entityId;
    const currentScope = scope;
    const currentToolId = toolId;
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const pending = pendingSettingsRef.current;
      const pendingForEntity = pendingEntityIdRef.current;

      if (pending && pendingForEntity && pendingForEntity === currentEntityId) {
        console.log('[useAutoSaveSettings] 🚿 Flushing pending save in cleanup:', {
          toolId: currentToolId,
          entityId: pendingForEntity.substring(0, 8),
        });

        // Fire-and-forget; cleanup cannot be async.
        // Call updateToolSettingsSupabase directly with explicit entity ID
        // to avoid drift issues with hook refs
        // Use 'immediate' mode to bypass debounce - we need to flush NOW
        updateToolSettingsSupabase({
          scope: currentScope,
          id: pendingForEntity,
          toolId: currentToolId,
          patch: pending,
        }, undefined, 'immediate')
          .then(() => {
            // CRITICAL: Invalidate the React Query cache for this entity after save completes.
            // This ensures that when we switch back to this entity, we fetch fresh data
            // from the DB instead of serving stale cached data.
            const cacheKey = currentScope === 'shot'
              ? ['toolSettings', currentToolId, projectId, pendingForEntity]
              : ['toolSettings', currentToolId, pendingForEntity, undefined];
            queryClient.invalidateQueries({ queryKey: cacheKey });
            console.log('[useAutoSaveSettings] ✅ Cleanup flush succeeded, cache invalidated');
          })
          .catch(err => {
            console.error('[useAutoSaveSettings] Cleanup flush failed:', err);
          });
      }

      // Always clear pending refs for the entity we are leaving
      if (pendingForEntity === currentEntityId) {
        pendingSettingsRef.current = null;
        pendingEntityIdRef.current = null;
      }
    };
    // Only re-run when entityId changes
  }, [entityId, scope, toolId, projectId, queryClient]);

  /**
   * Handle page close/navigation - save pending settings directly to DB.
   * This is a best-effort save; browsers typically allow ~50-100ms for async ops.
   * If the browser kills the request, we accept that minor data loss (user closed
   * within the debounce window).
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      const pending = pendingSettingsRef.current;
      const pendingForEntity = pendingEntityIdRef.current;

      if (pending && pendingForEntity) {
        console.log('[useAutoSaveSettings] 🚿 Flushing pending save on page unload:', {
          toolId,
          entityId: pendingForEntity.substring(0, 8),
        });
        
        // Fire-and-forget save directly to DB
        // Most browsers will wait a bit for this to complete
        // Use 'immediate' mode to bypass debounce - page is closing
        updateToolSettingsSupabase({
          scope,
          id: pendingForEntity,
          toolId,
          patch: pending,
        }, undefined, 'immediate').catch(err => {
          console.error('[useAutoSaveSettings] Unload flush failed:', err);
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [toolId, scope]);

  // Update single field
  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    // Increment edit version - allows detecting if newer edits happened during save
    editVersionRef.current += 1;
    const editVersionAtStart = editVersionRef.current;
    
    setSettings(prev => {
      const updated = { ...prev, [key]: value };

      // Always track pending settings - this protects user input from being overwritten by DB load
      pendingSettingsRef.current = updated;
      pendingEntityIdRef.current = entityId ?? null;

      // During loading, don't schedule saves - just update local state
      // The pending ref will prevent DB load from overwriting user input
      if (status !== 'ready' && status !== 'saving') {
        console.log('[useAutoSaveSettings] 📝 updateField during loading - UI only (protected):', {
          key,
          status,
        });
        return updated;
      }

      // Trigger auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const timeoutId = setTimeout(async () => {
        try {
          // Get the LATEST settings at save time (not the captured 'updated' which could be stale)
          const latestSettings = await new Promise<T>((resolve) => {
            setSettings(current => {
              resolve(current);
              return current; // Don't modify, just read
            });
          });
          
          await saveImmediate(latestSettings);
          
          // CRITICAL: Only clear pending if no newer edits happened during the save
          // This prevents race conditions when user types fast
          if (editVersionRef.current === editVersionAtStart) {
            pendingSettingsRef.current = null;
            pendingEntityIdRef.current = null;
          }
        } catch (err) {
          console.error('[useAutoSaveSettings] Debounced save failed:', err);
        }
      }, debounceMs);
      saveTimeoutRef.current = timeoutId;

      return updated;
    });
  }, [status, saveImmediate, debounceMs, entityId]);

  // Update multiple fields at once
  const updateFields = useCallback((updates: Partial<T>) => {
    // Increment edit version - allows detecting if newer edits happened during save
    editVersionRef.current += 1;
    const editVersionAtStart = editVersionRef.current;
    
    setSettings(prev => {
      const updated = { ...prev, ...updates };

      // Always track pending settings - this protects user input from being overwritten by DB load
      pendingSettingsRef.current = updated;
      pendingEntityIdRef.current = entityId ?? null;

      // During loading, don't schedule saves - just update local state
      if (status !== 'ready' && status !== 'saving') {
        console.log('[useAutoSaveSettings] 📝 updateFields during loading - UI only (protected):', {
          keys: Object.keys(updates),
          status,
        });
        return updated;
      }

      // Trigger auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const timeoutId = setTimeout(async () => {
        try {
          // Get the LATEST settings at save time (not the captured 'updated' which could be stale)
          const latestSettings = await new Promise<T>((resolve) => {
            setSettings(current => {
              resolve(current);
              return current; // Don't modify, just read
            });
          });
          
          await saveImmediate(latestSettings);
          
          // CRITICAL: Only clear pending if no newer edits happened during the save
          // This prevents race conditions when user types fast
          if (editVersionRef.current === editVersionAtStart) {
            pendingSettingsRef.current = null;
            pendingEntityIdRef.current = null;
          }
        } catch (err) {
          console.error('[useAutoSaveSettings] Debounced save failed:', err);
        }
      }, debounceMs);
      saveTimeoutRef.current = timeoutId;

      return updated;
    });
  }, [status, saveImmediate, debounceMs, entityId]);

  // Revert to last saved settings
  const revert = useCallback(() => {
    if (loadedSettingsRef.current) {
      setSettings(loadedSettingsRef.current);
      pendingSettingsRef.current = null;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }
  }, []);

  // Handle entity changes - flush and reset
  useEffect(() => {
    const previousEntityId = currentEntityIdRef.current;

    if (!entityId) {
      // Reset state
      currentEntityIdRef.current = null;
      setSettings(defaults);
      setStatus('idle');
      loadedSettingsRef.current = null;
      pendingSettingsRef.current = null;
      pendingEntityIdRef.current = null;
      editVersionRef.current = 0;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      return;
    }

    // Entity changed to a different one
    if (previousEntityId && previousEntityId !== entityId) {
      console.log('[useAutoSaveSettings] 🔄 Entity changed:', {
        from: previousEntityId.substring(0, 8),
        to: entityId.substring(0, 8),
      });

      // Reset for new entity
      setSettings(defaults);
      setStatus('idle');
      loadedSettingsRef.current = null;
      pendingSettingsRef.current = null;
      pendingEntityIdRef.current = null;
      editVersionRef.current = 0;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }

    currentEntityIdRef.current = entityId;
  }, [entityId, defaults]);

  // Load settings from DB when available
  useEffect(() => {
    if (!entityId || !enabled) return;

    // Show loading state while fetching
    if (isLoading) {
      if (status === 'idle') {
        setStatus('loading');
      }
      return;
    }

    // Don't overwrite if we're in the middle of saving
    if (status === 'saving') {
      return;
    }

    // Log what we received from useToolSettings
    console.log('[useAutoSaveSettings] 🔍 dbSettings received:', {
      toolId,
      entityId: entityId?.substring(0, 8),
      dbPrompt: (dbSettings as any)?.prompt?.substring(0, 30) || '(none)',
      dbLoraCount: (dbSettings as any)?.loras?.length ?? 0,
      status,
    });

    // Don't overwrite if user has pending edits for THIS entity (debounce hasn't fired yet)
    // This prevents React Query refetches from "unwriting" user input
    // IMPORTANT: We now protect pending edits even on first load - losing user's typing
    // is worse than the theoretical risk of saving defaults over DB values
    if (pendingSettingsRef.current && pendingEntityIdRef.current === entityId) {
      console.log('[useAutoSaveSettings] ⏳ Skipping DB load - user has pending edits for this entity');
      // Still transition to ready and schedule save for pending edits
      if (status !== 'ready') {
        setStatus('ready');
        // Schedule save for input that happened during loading
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        const toSave = pendingSettingsRef.current;
        saveTimeoutRef.current = setTimeout(async () => {
          try {
            await saveImmediateRef.current(toSave);
          } catch (err) {
            console.error('[useAutoSaveSettings] Pending save failed:', err);
          }
        }, debounceMs);
      }
      return;
    }

    // Apply settings from DB
    const loadedSettings: T = {
      ...defaults,
      ...(dbSettings || {}),
    };

    // Deep clone to prevent React Query cache reference sharing
    const clonedSettings = JSON.parse(JSON.stringify(loadedSettings));

    // Avoid setState loops when dbSettings identity changes but values don't.
    if (loadedSettingsRef.current && deepEqual(clonedSettings, loadedSettingsRef.current)) {
      console.log('[useAutoSaveSettings] ⏭️ Skipping DB load - settings unchanged:', {
        toolId,
        entityId: entityId.substring(0, 8),
        promptInLoaded: (loadedSettingsRef.current as any)?.prompt?.substring(0, 30) || '(none)',
        promptInNew: (clonedSettings as any)?.prompt?.substring(0, 30) || '(none)',
      });
      if (status !== 'ready') {
        setStatus('ready');
      }
      return;
    }

    // No pending edits for this entity - safe to apply DB settings
    console.log('[useAutoSaveSettings] 📥 Loaded from DB:', {
      toolId,
      entityId: entityId.substring(0, 8),
      promptInNew: (clonedSettings as any)?.prompt?.substring(0, 30) || '(none)',
      loraCountInNew: (clonedSettings as any)?.loras?.length ?? 0,
    });

    setSettings(clonedSettings);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(clonedSettings));
    setStatus('ready');
    setError(null);
  }, [entityId, isLoading, dbSettings, defaults, enabled, status, toolId, debounceMs]);

  // Memoize return value to prevent object recreation on every render
  // NOTE: entityId uses currentEntityIdRef.current which is a ref value, so it updates
  // without triggering memo recalculation. Consumers should check status === 'ready' 
  // alongside entityId to ensure settings are actually loaded for that entity.
  return useMemo(() => ({
    settings,
    status,
    entityId: currentEntityIdRef.current,
    isDirty,
    error,
    hasShotSettings,
    updateField,
    updateFields,
    saveImmediate: () => saveImmediate(),
    revert,
  }), [settings, status, isDirty, error, hasShotSettings, updateField, updateFields, saveImmediate, revert]);
}
