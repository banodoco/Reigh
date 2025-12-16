import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToolSettings } from './useToolSettings';
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
  /** Whether settings have been modified since last save */
  isDirty: boolean;
  /** Error if status is 'error' */
  error: Error | null;
  
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

  // Fetch settings from database
  const {
    settings: dbSettings,
    isLoading,
    update: updateSettings,
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
      pendingSettingsRef.current = null;
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

  /**
   * Flush pending settings on entity change/unmount.
   *
   * IMPORTANT: this runs in the *cleanup* for the previous entity render, so `updateSettings`
   * is still bound to the previous `shotId/projectId`. This avoids accidentally saving shot A's
   * pending settings into shot B when switching entities quickly.
   */
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const pending = pendingSettingsRef.current;
      const pendingForEntity = pendingEntityIdRef.current;

      if (pending && pendingForEntity && pendingForEntity === entityId) {
        console.log('[useAutoSaveSettings] 🚿 Flushing pending save in cleanup:', {
          toolId,
          entityId: pendingForEntity.substring(0, 8),
        });

        // Fire-and-forget; cleanup cannot be async.
        updateSettings(scope, pending).catch(err => {
          console.error('[useAutoSaveSettings] Cleanup flush failed:', err);
        });
      }

      // Always clear pending refs for the entity we are leaving
      if (pendingForEntity === entityId) {
        pendingSettingsRef.current = null;
        pendingEntityIdRef.current = null;
      }
    };
    // Intentionally depends on entityId so cleanup runs per-entity.
  }, [entityId, updateSettings, scope, toolId]);

  // Update single field
  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    // CRITICAL: During loading, don't set tracking refs or pending state.
    // Changes during loading are ephemeral (from auto-switch effects etc.) and will be 
    // overwritten by DB values. Setting refs would block the DB load from applying.
    if (status !== 'ready' && status !== 'saving') {
      console.log('[useAutoSaveSettings] 📝 updateField during loading - UI only:', {
        key,
        status,
      });
      setSettings(prev => ({ ...prev, [key]: value }));
      return;
    }

    setSettings(prev => {
      const updated = { ...prev, [key]: value };

      // Track pending settings for flush-on-navigation
      pendingSettingsRef.current = updated;
      pendingEntityIdRef.current = entityId ?? null;

      // Trigger auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveImmediate(updated);
          pendingSettingsRef.current = null;
          pendingEntityIdRef.current = null;
        } catch (err) {
          console.error('[useAutoSaveSettings] Debounced save failed:', err);
        }
      }, debounceMs);

      return updated;
    });
  }, [status, saveImmediate, debounceMs, entityId]);

  // Update multiple fields at once
  const updateFields = useCallback((updates: Partial<T>) => {
    // CRITICAL: During loading, don't set tracking refs or pending state.
    if (status !== 'ready' && status !== 'saving') {
      console.log('[useAutoSaveSettings] 📝 updateFields during loading - UI only:', {
        keys: Object.keys(updates),
        status,
      });
      setSettings(prev => ({ ...prev, ...updates }));
      return;
    }

    setSettings(prev => {
      const updated = { ...prev, ...updates };

      // Track pending settings for flush-on-navigation
      pendingSettingsRef.current = updated;
      pendingEntityIdRef.current = entityId ?? null;

      // Trigger auto-save with debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveImmediate(updated);
          pendingSettingsRef.current = null;
          pendingEntityIdRef.current = null;
        } catch (err) {
          console.error('[useAutoSaveSettings] Debounced save failed:', err);
        }
      }, debounceMs);

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

    // Apply settings from DB
    const loadedSettings: T = {
      ...defaults,
      ...(dbSettings || {}),
    };

    // Deep clone to prevent React Query cache reference sharing
    const clonedSettings = JSON.parse(JSON.stringify(loadedSettings));

    // Avoid setState loops when dbSettings identity changes but values don't.
    if (loadedSettingsRef.current && deepEqual(clonedSettings, loadedSettingsRef.current)) {
      if (status !== 'ready') {
        setStatus('ready');
      }
      return;
    }

    console.log('[useAutoSaveSettings] 📥 Loaded from DB:', {
      toolId,
      entityId: entityId.substring(0, 8),
    });

    setSettings(clonedSettings);
    loadedSettingsRef.current = JSON.parse(JSON.stringify(clonedSettings));
    setStatus('ready');
    setError(null);
  }, [entityId, isLoading, dbSettings, defaults, enabled, status, toolId]);

  // Memoize return value to prevent object recreation on every render
  return useMemo(() => ({
    settings,
    status,
    isDirty,
    error,
    updateField,
    updateFields,
    saveImmediate: () => saveImmediate(),
    revert,
  }), [settings, status, isDirty, error, updateField, updateFields, saveImmediate, revert]);
}
