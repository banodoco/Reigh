/**
 * usePromptFieldState - Manages prompt field display and edit logic
 *
 * Handles the priority logic for displaying prompts from multiple sources:
 * 1. User edits (settings.prompt) - highest priority
 * 2. AI-enhanced prompt (enhancedPrompt) - shown when no user edit
 * 3. Shot defaults (shotDefaults.prompt) - fallback
 *
 * Also provides handlers for editing, clearing, and voice input.
 */

import { useCallback, useMemo } from 'react';

export type PromptBadgeType = 'enhanced' | 'default' | null;

export interface UsePromptFieldStateOptions {
  /** Current segment settings (contains user's prompt edit if any) */
  settingsPrompt: string | undefined;
  /** AI-generated enhanced prompt (from metadata) */
  enhancedPrompt: string | undefined;
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
   * Priority: settingsPrompt > enhancedPrompt > defaultPrompt > ''
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

  /** Whether user has explicitly set a prompt (for showing Use Default/Set as Default) */
  userHasSetPrompt: boolean;

  /**
   * Handle typing in the textarea.
   * Saves to settings.prompt, which takes priority over enhanced.
   */
  handleChange: (value: string) => void;

  /**
   * Handle clear button or "Use Default" action.
   * Clears BOTH user edit AND enhanced prompt → falls back to shot defaults.
   */
  handleClearAll: () => void;

  /**
   * Handle clearing just the enhanced prompt (from Enhanced badge hover).
   * Clears only enhanced → falls back to user edit or shot defaults.
   */
  handleClearEnhanced: () => void;

  /**
   * Handle voice input result.
   * Saves to settings.prompt (same as typing).
   */
  handleVoiceResult: (result: { prompt?: string; transcription?: string }) => void;
}

/**
 * Hook to manage prompt field state with priority logic.
 *
 * @example
 * ```tsx
 * const prompt = usePromptFieldState({
 *   settingsPrompt: settings.prompt,
 *   enhancedPrompt,
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
  defaultPrompt,
  onSettingsChange,
  onClearEnhancedPrompt,
}: UsePromptFieldStateOptions): PromptFieldState {
  // Derived state
  const hasEnhancedPrompt = !!enhancedPrompt?.trim();
  const userHasSetPrompt = settingsPrompt !== undefined;
  const hasDefaultPrompt = defaultPrompt !== undefined;

  // Calculate display value and badge type
  const { displayValue, badgeType } = useMemo(() => {
    if (userHasSetPrompt) {
      // User edit takes priority
      return { displayValue: settingsPrompt, badgeType: null as PromptBadgeType };
    }
    if (hasEnhancedPrompt) {
      // AI-enhanced prompt shown when no user edit
      return { displayValue: enhancedPrompt!, badgeType: 'enhanced' as PromptBadgeType };
    }
    if (hasDefaultPrompt) {
      // Fall back to shot defaults
      return { displayValue: defaultPrompt!, badgeType: 'default' as PromptBadgeType };
    }
    // Nothing set
    return { displayValue: '', badgeType: null as PromptBadgeType };
  }, [settingsPrompt, enhancedPrompt, defaultPrompt, userHasSetPrompt, hasEnhancedPrompt, hasDefaultPrompt]);

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
    // Only clear enhanced prompt, user edit (if any) remains
    onClearEnhancedPrompt?.();
  }, [onClearEnhancedPrompt]);

  const handleVoiceResult = useCallback((result: { prompt?: string; transcription?: string }) => {
    onSettingsChange(result.prompt || result.transcription || '');
  }, [onSettingsChange]);

  return {
    displayValue,
    badgeType,
    hasEnhancedPrompt,
    userHasSetPrompt,
    handleChange,
    handleClearAll,
    handleClearEnhanced,
    handleVoiceResult,
  };
}
