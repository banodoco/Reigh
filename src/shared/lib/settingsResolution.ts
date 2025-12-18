/**
 * Shared utilities for resolving tool settings across different scopes.
 * 
 * IMPORTANT: This is the single source of truth for settings priority.
 * If you need to change the priority order, update it here and all consumers
 * will automatically get the update.
 * 
 * Priority order (highest to lowest): shot → project → user → defaults
 */

export type GenerationModeRaw = 'batch' | 'timeline' | 'by-pair' | undefined;
export type GenerationModeNormalized = 'batch' | 'timeline';

/**
 * Normalize generation mode to the two UI-supported values.
 * - 'by-pair' is treated as 'batch' (both show individual videos, not timeline)
 * - undefined defaults to 'timeline'
 */
export function normalizeGenerationMode(mode: GenerationModeRaw): GenerationModeNormalized {
  return mode === 'batch' || mode === 'by-pair' ? 'batch' : 'timeline';
}

/**
 * Settings sources for resolution.
 * Each source should contain tool-specific settings (already extracted from the parent object).
 */
export interface SettingsSources {
  defaults?: Record<string, any>;
  user?: Record<string, any>;
  project?: Record<string, any>;
  shot?: Record<string, any>;
}

/**
 * Resolve a single settings field using standard priority.
 * Priority: shot → project → user → defaults
 * 
 * @param field - The field name to resolve
 * @param sources - Settings from each scope (should be tool-specific settings)
 * @returns The resolved value, or undefined if not found in any source
 */
export function resolveSettingField<T>(
  field: string,
  sources: SettingsSources
): T | undefined {
  // Priority order: shot → project → user → defaults
  // Use explicit undefined checks because null/false/0 are valid values
  if (sources.shot?.[field] !== undefined) return sources.shot[field];
  if (sources.project?.[field] !== undefined) return sources.project[field];
  if (sources.user?.[field] !== undefined) return sources.user[field];
  if (sources.defaults?.[field] !== undefined) return sources.defaults[field];
  return undefined;
}

/**
 * Resolve generation mode using standard priority and normalization.
 * This is a convenience wrapper for the common case of resolving generationMode.
 * 
 * @param sources - Settings from each scope (should be tool-specific settings)
 * @returns Normalized generation mode ('batch' or 'timeline')
 */
export function resolveGenerationMode(sources: SettingsSources): GenerationModeNormalized {
  const raw = resolveSettingField<GenerationModeRaw>('generationMode', sources);
  return normalizeGenerationMode(raw);
}

/**
 * Extract tool-specific settings from a full settings object.
 * Handles the common pattern of settings being nested under tool ID.
 * 
 * @param settings - Full settings object (e.g., from DB)
 * @param toolId - Tool identifier
 * @returns Tool-specific settings or empty object
 */
export function extractToolSettings(
  settings: Record<string, any> | null | undefined,
  toolId: string
): Record<string, any> {
  return (settings?.[toolId] as Record<string, any>) ?? {};
}
