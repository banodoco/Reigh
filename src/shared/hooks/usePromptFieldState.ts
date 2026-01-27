/**
 * usePromptFieldState - Manages prompt field display and edit logic
 *
 * Handles the priority logic for displaying prompts from multiple sources.
 * Uses basePromptForEnhancement to distinguish between:
 * - settings.prompt that was the base for enhancement (should NOT hide enhanced)
 * - settings.prompt that is a user edit after enhancement (SHOULD show instead of enhanced)
 *
 * Priority logic:
 * 1. If settings.prompt exists AND differs from basePromptForEnhancement → user edited after enhancement, show their edit
 * 2. If enhancedPrompt exists → show AI-enhanced version with badge
 * 3. If settings.prompt exists (same as base, or no enhanced) → show it
 * 4. Fall back to shot defaults
 */

import { useCallback, useMemo } from 'react';

export type PromptBadgeType = 'enhanced' | 'default' | null;

export interface UsePromptFieldStateOptions {
  /** Current segment settings (contains user's prompt edit if any) */
  settingsPrompt: string | undefined;
  /** AI-generated enhanced prompt (from metadata) */
  enhancedPrompt: string | undefined;
  /** The base prompt that was used when enhanced prompt was created */
  basePromptForEnhancement: string | undefined;
  /** Shot-level default prompt */
  defaultPrompt: string | undefined;
  /** Callback to update settings */
  onSettingsChange: (prompt: string | undefined) => void;
  /** Callback to clear the enhanced prompt from metadata */
  onClearEnhancedPrompt?: () => void;
}

export interface PromptFieldState {
  /**
   * The value to display in the textarea.
   */
  displayValue: string;

  /**
   * Badge to show next to the label:
   * - 'enhanced': AI-enhanced prompt is being displayed
   * - 'default': Shot default is being displayed
   * - null: User edit is being displayed (or nothing)
   */
  badgeType: PromptBadgeType;

  /** Whether an AI-enhanced prompt exists (for toggle default state) */
  hasEnhancedPrompt: boolean;

  /** Whether settings.prompt is defined (for showing Use Default/Set as Default controls) */
  userHasSetPrompt: boolean;

  /** Whether user has made an edit that diverges from the base (after enhancement) */
  userHasEditedAfterEnhancement: boolean;

  /**
   * Handle typing in the textarea.
   * Saves to settings.prompt. If this differs from basePromptForEnhancement,
   * the user's edit will take priority over the enhanced prompt.
   */
  handleChange: (value: string) => void;

  /**
   * Handle clear button or "Use Default" action.
   * Clears BOTH user edit AND enhanced prompt → falls back to shot defaults.
   */
  handleClearAll: () => void;

  /**
   * Handle clearing just the enhanced prompt (from Enhanced badge hover).
   * Clears enhanced → reveals the base prompt (settings.prompt or shot default).
   */
  handleClearEnhanced: () => void;

  /**
   * Handle voice input result.
   * Saves to settings.prompt (same as typing).
   */
  handleVoiceResult: (result: { prompt?: string; transcription?: string }) => void;
}

/**
 * Hook to manage prompt field state with smart priority logic.
 *
 * The key insight is using basePromptForEnhancement to distinguish:
 * - "settings.prompt is the original base" → show enhanced prompt
 * - "settings.prompt is a user edit" → show user's edit
 *
 * @example
 * ```tsx
 * const prompt = usePromptFieldState({
 *   settingsPrompt: settings.prompt,
 *   enhancedPrompt,
 *   basePromptForEnhancement,
 *   defaultPrompt: shotDefaults?.prompt,
 *   onSettingsChange: (value) => onChange({ prompt: value }),
 *   onClearEnhancedPrompt,
 * });
 *
 * return (
 *   <>
 *     {prompt.badgeType === 'enhanced' && <EnhancedBadge onClear={prompt.handleClearEnhanced} />}
 *     <Textarea
 *       value={prompt.displayValue}
 *       onChange={(e) => prompt.handleChange(e.target.value)}
 *       onClear={prompt.handleClearAll}
 *     />
 *   </>
 * );
 * ```
 */
export function usePromptFieldState({
  settingsPrompt,
  enhancedPrompt,
  basePromptForEnhancement,
  defaultPrompt,
  onSettingsChange,
  onClearEnhancedPrompt,
}: UsePromptFieldStateOptions): PromptFieldState {
  // Derived state
  const hasEnhancedPrompt = !!enhancedPrompt?.trim();
  const hasSettingsPrompt = settingsPrompt !== undefined;
  const hasDefaultPrompt = defaultPrompt !== undefined;

  // Check if user has edited AFTER enhancement was created
  // This is true if:
  // 1. settings.prompt exists
  // 2. AND it's different from the base that was used for enhancement
  const userHasEditedAfterEnhancement = useMemo(() => {
    if (!hasSettingsPrompt) return false;
    if (!hasEnhancedPrompt) return false; // No enhancement to compare against
    if (basePromptForEnhancement === undefined) return false; // No base stored, can't compare

    // User has edited if their prompt differs from what was used for enhancement
    return settingsPrompt.trim() !== basePromptForEnhancement.trim();
  }, [hasSettingsPrompt, hasEnhancedPrompt, settingsPrompt, basePromptForEnhancement]);

  // Calculate display value and badge type
  const { displayValue, badgeType } = useMemo(() => {
    // Priority 1: User edited after enhancement → show their edit
    if (userHasEditedAfterEnhancement) {
      return { displayValue: settingsPrompt!, badgeType: null as PromptBadgeType };
    }

    // Priority 2: Enhanced prompt exists → show it
    if (hasEnhancedPrompt) {
      return { displayValue: enhancedPrompt!, badgeType: 'enhanced' as PromptBadgeType };
    }

    // Priority 3: settings.prompt exists (no enhancement, or same as base)
    if (hasSettingsPrompt) {
      return { displayValue: settingsPrompt!, badgeType: null as PromptBadgeType };
    }

    // Priority 4: Fall back to shot defaults
    if (hasDefaultPrompt) {
      return { displayValue: defaultPrompt!, badgeType: 'default' as PromptBadgeType };
    }

    // Nothing set
    return { displayValue: '', badgeType: null as PromptBadgeType };
  }, [
    userHasEditedAfterEnhancement,
    settingsPrompt,
    enhancedPrompt,
    defaultPrompt,
    hasEnhancedPrompt,
    hasSettingsPrompt,
    hasDefaultPrompt,
  ]);

  // Handlers
  const handleChange = useCallback((value: string) => {
    onSettingsChange(value);
  }, [onSettingsChange]);

  const handleClearAll = useCallback(() => {
    // Clear user edit (undefined = use defaults)
    onSettingsChange(undefined);
    // Also clear enhanced prompt
    onClearEnhancedPrompt?.();
  }, [onSettingsChange, onClearEnhancedPrompt]);

  const handleClearEnhanced = useCallback(() => {
    // Only clear enhanced prompt
    // This reveals the base prompt (settings.prompt or shot default)
    onClearEnhancedPrompt?.();
  }, [onClearEnhancedPrompt]);

  const handleVoiceResult = useCallback((result: { prompt?: string; transcription?: string }) => {
    onSettingsChange(result.prompt || result.transcription || '');
  }, [onSettingsChange]);

  return {
    displayValue,
    badgeType,
    hasEnhancedPrompt,
    userHasSetPrompt: hasSettingsPrompt,
    userHasEditedAfterEnhancement,
    handleChange,
    handleClearAll,
    handleClearEnhanced,
    handleVoiceResult,
  };
}
