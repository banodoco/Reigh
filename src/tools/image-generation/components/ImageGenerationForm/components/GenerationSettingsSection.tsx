import React, { useEffect, useCallback } from 'react';
import { CollapsibleSection } from '@/shared/components/ui/collapsible-section';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { Button } from '@/shared/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { HiresFixConfig, DEFAULT_HIRES_FIX_CONFIG } from '../types';

interface GenerationSettingsSectionProps {
  /** Current hires fix configuration */
  hiresFixConfig: HiresFixConfig;
  /** Callback when config changes */
  onHiresFixConfigChange: (config: HiresFixConfig) => void;
  /** Whether inputs should be disabled */
  disabled?: boolean;
}

/**
 * Generation Settings section for local image generation.
 * Provides two-pass hires fix configuration.
 */
export const GenerationSettingsSection: React.FC<GenerationSettingsSectionProps> = ({
  hiresFixConfig,
  onHiresFixConfigChange,
  disabled = false,
}) => {
  // Update a single field
  const updateField = <K extends keyof HiresFixConfig>(
    field: K,
    value: HiresFixConfig[K]
  ) => {
    onHiresFixConfigChange({
      ...hiresFixConfig,
      [field]: value,
    });
  };

  // Auto-enable when this section is shown
  useEffect(() => {
    if (hiresFixConfig && !hiresFixConfig.enabled) {
      onHiresFixConfigChange({ ...hiresFixConfig, enabled: true });
    }
  }, [hiresFixConfig, onHiresFixConfigChange]);

  // Reset to defaults
  const handleResetDefaults = useCallback(() => {
    onHiresFixConfigChange(DEFAULT_HIRES_FIX_CONFIG);
  }, [onHiresFixConfigChange]);

  // Don't render if hiresFixConfig is not available
  if (!hiresFixConfig) {
    return null;
  }

  const resetButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleResetDefaults}
      disabled={disabled}
      className="text-xs text-muted-foreground hover:text-foreground h-7"
    >
      <RotateCcw className="w-3 h-3 mr-1" />
      Reset
    </Button>
  );

  return (
    <CollapsibleSection title="Generation settings" headerAction={resetButton}>
      <div className="space-y-4">
        {/* Phase 1: Base Generation */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide">Phase 1</span>
            <span className="text-xs text-muted-foreground">Base Generation</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SliderWithValue
              label="Steps"
              value={hiresFixConfig.base_steps ?? 8}
              onChange={(v) => updateField('base_steps', Math.round(v))}
              min={1}
              max={16}
              step={1}
              disabled={disabled}
              numberInputClassName="w-20"
            />
            <SliderWithValue
              label="Lightning LoRA"
              value={hiresFixConfig.lightning_lora_strength_phase_1 ?? 0.8}
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
              value={hiresFixConfig.hires_steps ?? 8}
              onChange={(v) => updateField('hires_steps', Math.round(v))}
              min={1}
              max={16}
              step={1}
              disabled={disabled}
              numberInputClassName="w-20"
            />
            <SliderWithValue
              label="Scale Multiplier"
              value={hiresFixConfig.hires_scale ?? 1.3}
              onChange={(v) => updateField('hires_scale', v)}
              min={1.0}
              max={4.0}
              step={0.1}
              disabled={disabled}
              numberInputClassName="w-20"
            />
            <SliderWithValue
              label="Denoise"
              value={hiresFixConfig.hires_denoise ?? 0.6}
              onChange={(v) => updateField('hires_denoise', v)}
              min={0.1}
              max={1.0}
              step={0.05}
              disabled={disabled}
              numberInputClassName="w-20"
            />
            <SliderWithValue
              label="Lightning LoRA"
              value={hiresFixConfig.lightning_lora_strength_phase_2 ?? 0.2}
              onChange={(v) => updateField('lightning_lora_strength_phase_2', v)}
              min={0}
              max={1.0}
              step={0.01}
              disabled={disabled}
              numberInputClassName="w-20"
            />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
};

export default GenerationSettingsSection;
