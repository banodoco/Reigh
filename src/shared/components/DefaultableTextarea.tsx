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
}

/**
 * Badge component for showing field state
 */
const FieldBadge: React.FC<{ type: BadgeType; label?: string }> = ({ type, label }) => {
  if (!type) return null;

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
        <FieldBadge type={badgeType} label={badgeLabel} />
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
