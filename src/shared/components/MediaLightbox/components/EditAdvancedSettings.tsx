import React, { useCallback } from 'react';
import { CollapsibleSection } from '@/shared/components/ui/collapsible-section';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { RotateCcw } from 'lucide-react';
import type { EditAdvancedSettings as EditAdvancedSettingsType } from '../hooks/useGenerationEditSettings';
import { DEFAULT_ADVANCED_SETTINGS } from '../hooks/useGenerationEditSettings';

interface EditAdvancedSettingsProps {
  /** Current advanced settings configuration */
  settings: EditAdvancedSettingsType;
  /** Callback when settings change */
  onSettingsChange: (updates: Partial<EditAdvancedSettingsType>) => void;
  /** Whether inputs should be disabled */
  disabled?: boolean;
}

/**
 * Advanced settings panel for edit mode tasks (text edit, inpaint, annotate, reposition).
 * Controls two-pass generation quality settings similar to image generation.
 */
export const EditAdvancedSettings: React.FC<EditAdvancedSettingsProps> = ({
  settings,
  onSettingsChange,
  disabled = false,
}) => {
  // Update a single field
  const updateField = <K extends keyof EditAdvancedSettingsType>(
    field: K,
    value: EditAdvancedSettingsType[K]
  ) => {
    onSettingsChange({ [field]: value });
  };

  // Reset to defaults
  const handleResetDefaults = useCallback(() => {
    onSettingsChange(DEFAULT_ADVANCED_SETTINGS);
  }, [onSettingsChange]);

  const resetButton = (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) handleResetDefaults();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled) handleResetDefaults();
        }
      }}
      className={`inline-flex items-center text-xs text-muted-foreground hover:text-foreground h-7 px-2 rounded cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <RotateCcw className="w-3 h-3 mr-1" />
      Reset
    </div>
  );

  return (
    <CollapsibleSection title="Advanced settings" headerAction={resetButton}>
      <div className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="advanced-enabled" className="text-sm font-medium">
            Enable two-pass generation
          </Label>
          <Switch
            id="advanced-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateField('enabled', checked)}
            disabled={disabled}
          />
        </div>

        {/* Settings only shown when enabled */}
        {settings.enabled && (
          <>
            {/* Phase 1: Base Generation */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide">Phase 1</span>
                <span className="text-xs text-muted-foreground">Base Generation</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SliderWithValue
                  label="Steps"
                  value={settings.base_steps}
                  onChange={(v) => updateField('base_steps', Math.round(v))}
                  min={1}
                  max={16}
                  step={1}
                  disabled={disabled}
                  numberInputClassName="w-20"
                />
                <SliderWithValue
                  label="Lightning LoRA"
                  value={settings.lightning_lora_strength_phase_1}
                  onChange={(v) => updateField('lightning_lora_strength_phase_1', v)}
                  min={0}
                  max={1.0}
                  step={0.01}
                  disabled={disabled}
                  numberInputClassName="w-20"
                />
              </div>
            </div>

            {/* Phase 2: Hires Refinement */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide">Phase 2</span>
                <span className="text-xs text-muted-foreground">Hires Refinement</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SliderWithValue
                  label="Steps"
                  value={settings.hires_steps}
                  onChange={(v) => updateField('hires_steps', Math.round(v))}
                  min={1}
                  max={16}
                  step={1}
                  disabled={disabled}
                  numberInputClassName="w-20"
                />
                <SliderWithValue
                  label="Upscale Factor"
                  value={settings.hires_scale}
                  onChange={(v) => updateField('hires_scale', v)}
                  min={1.0}
                  max={2.0}
                  step={0.1}
                  disabled={disabled}
                  numberInputClassName="w-20"
                />
                <SliderWithValue
                  label="Denoise"
                  value={settings.hires_denoise}
                  onChange={(v) => updateField('hires_denoise', v)}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  disabled={disabled}
                  numberInputClassName="w-20"
                />
                <SliderWithValue
                  label="Lightning LoRA"
                  value={settings.lightning_lora_strength_phase_2}
                  onChange={(v) => updateField('lightning_lora_strength_phase_2', v)}
                  min={0}
                  max={1.0}
                  step={0.01}
                  disabled={disabled}
                  numberInputClassName="w-20"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default EditAdvancedSettings;


