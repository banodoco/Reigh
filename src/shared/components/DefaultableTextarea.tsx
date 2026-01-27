/**
 * DefaultableTextarea Component
 *
 * A textarea that can display a default value with a badge when no local value is set.
 * Handles the common pattern of showing shot-level defaults with visual indication.
 *
 * Semantics:
 * - `value === undefined` = show default value with badge
 * - `value === ''` = show empty (user explicitly cleared, no badge)
 * - `value === 'text'` = show user's value (no badge)
 */

import React from 'react';
import { Textarea, TextareaProps } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { RotateCcw, Save, Loader2 } from 'lucide-react';
import { getDefaultableField } from './segmentSettingsUtils';

export type BadgeType = 'default' | 'enhanced' | null;

export interface DefaultableTextareaProps extends Omit<TextareaProps, 'value' | 'onChange'> {
  /** Label text for the field */
  label: string;
  /** Current value (undefined = use default, '' = explicitly empty, string = user value) */
  value: string | undefined;
  /** Default value to show when value is undefined */
  defaultValue?: string;
  /** Whether there's a saved override in the database */
  hasDbOverride?: boolean;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when field is cleared */
  onClear?: () => void;
  /** Badge type to show (overrides automatic detection) */
  badgeType?: BadgeType;
  /** Custom badge label */
  badgeLabel?: string;
  /** Label size variant */
  labelSize?: 'xs' | 'sm';
  /** Additional class for the container */
  containerClassName?: string;
  /** Callback to use shot default value */
  onUseDefault?: () => void;
  /**
   * Callback to set current value as shot default.
   * Receives the actual displayed value (what the user sees in the field).
   */
  onSetAsDefault?: (displayValue: string) => void;
  /** Whether currently saving as default */
  isSavingDefault?: boolean;
}

/**
 * Badge component for showing field state, or action buttons when overridden
 */
const FieldBadge: React.FC<{
  type: BadgeType;
  label?: string;
  onUseDefault?: () => void;
  onSetAsDefault?: (displayValue: string) => void;
  isSaving?: boolean;
  displayValue?: string;
}> = ({ type, label, onUseDefault, onSetAsDefault, isSaving, displayValue }) => {
  // If using default, show badge
  if (type) {
    const styles = {
      default: 'bg-primary/15 text-primary',
      enhanced: 'bg-green-500/15 text-green-600 dark:text-green-400',
    };

    const labels = {
      default: 'Default',
      enhanced: 'Enhanced',
    };

    return (
      <span className={`text-[10px] ${styles[type]} px-1.5 py-0.5 rounded`}>
        {label || labels[type]}
      </span>
    );
  }

  // If not using default, show action buttons (if callbacks provided)
  if (!onUseDefault && !onSetAsDefault) return null;

  return (
    <div className="flex items-center gap-1">
      {onUseDefault && (
        <button
          type="button"
          onClick={onUseDefault}
          disabled={isSaving}
          className="text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors disabled:opacity-50"
          title="Use the shot default value"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          Use Default
        </button>
      )}
      {onSetAsDefault && (
        <button
          type="button"
          onClick={() => onSetAsDefault(displayValue ?? '')}
          disabled={isSaving}
          className="text-[10px] bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors disabled:opacity-50"
          title="Set this value as the shot default"
        >
          {isSaving ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <Save className="w-2.5 h-2.5" />
          )}
          Set as Default
        </button>
      )}
    </div>
  );
};

export const DefaultableTextarea: React.FC<DefaultableTextareaProps> = ({
  label,
  value,
  defaultValue,
  hasDbOverride,
  onChange,
  onClear,
  badgeType: explicitBadgeType,
  badgeLabel,
  labelSize = 'xs',
  containerClassName,
  clearable = true,
  onUseDefault,
  onSetAsDefault,
  isSavingDefault,
  ...textareaProps
}) => {
  // Compute display state using the helper
  const { isUsingDefault, displayValue } = getDefaultableField(
    value,
    defaultValue,
    hasDbOverride
  );

  // Determine badge type: explicit override > automatic detection
  const badgeType: BadgeType = explicitBadgeType !== undefined
    ? explicitBadgeType
    : (isUsingDefault ? 'default' : null);

  const labelSizeClass = labelSize === 'xs' ? 'text-xs' : 'text-sm';

  return (
    <div className={containerClassName}>
      <div className="flex items-center gap-2 mb-1">
        <Label className={`${labelSizeClass} font-medium`}>{label}</Label>
        <FieldBadge
          type={badgeType}
          label={badgeLabel}
          onUseDefault={onUseDefault}
          onSetAsDefault={onSetAsDefault}
          isSaving={isSavingDefault}
          displayValue={displayValue}
        />
      </div>
      <Textarea
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        clearable={clearable}
        onClear={onClear}
        {...textareaProps}
      />
    </div>
  );
};

export default DefaultableTextarea;
