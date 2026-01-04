import React, { useEffect, useCallback } from 'react';
import { CollapsibleSection } from '@/shared/components/ui/collapsible-section';
import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { Button } from '@/shared/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { HiresFixConfig, PhaseLoraStrength, ActiveLora, DEFAULT_HIRES_FIX_CONFIG } from '../types';

interface GenerationSettingsSectionProps {
  /** Currently selected LoRAs from the main form */
  selectedLoras: ActiveLora[];
  /** Current hires fix configuration */
  hiresFixConfig: HiresFixConfig;
  /** Callback when config changes */
  onHiresFixConfigChange: (config: HiresFixConfig) => void;
  /** Whether inputs should be disabled */
  disabled?: boolean;
}

/**
 * Generation Settings section for local image generation.
 * Provides two-pass hires fix configuration with per-phase LoRA strength controls.
 */
export const GenerationSettingsSection: React.FC<GenerationSettingsSectionProps> = ({
  selectedLoras,
  hiresFixConfig,
  onHiresFixConfigChange,
  disabled = false,
}) => {
  // Sync phaseLoraStrengths with selectedLoras
  // - Add new LoRAs with default strengths (pass1=pass2=baseStrength)
  // - Remove LoRAs no longer in selectedLoras
  // - Keep existing overrides for unchanged LoRAs
  useEffect(() => {
    const phaseLoraStrengths = hiresFixConfig?.phaseLoraStrengths ?? [];
    const currentLoraIds = new Set(phaseLoraStrengths.map(l => l.loraId));
    const selectedLoraIds = new Set(selectedLoras.map(l => l.id));

    // Check if we need to update
    const needsUpdate =
      selectedLoras.length !== phaseLoraStrengths.length ||
      selectedLoras.some(lora => !currentLoraIds.has(lora.id)) ||
      phaseLoraStrengths.some(lora => !selectedLoraIds.has(lora.loraId));

    if (!needsUpdate) return;

    // Build new phaseLoraStrengths array
    const newPhaseLoraStrengths: PhaseLoraStrength[] = selectedLoras.map(lora => {
      // Check if we have existing override
      const existing = phaseLoraStrengths.find(p => p.loraId === lora.id);
      if (existing) {
        // Keep existing override, but update name/path in case they changed
        return {
          ...existing,
          loraPath: lora.path,
          loraName: lora.name,
        };
      }
      // New LoRA - use base strength for both passes
      return {
        loraId: lora.id,
        loraPath: lora.path,
        loraName: lora.name,
        pass1Strength: lora.strength,
        pass2Strength: lora.strength,
      };
    });

    onHiresFixConfigChange({
      ...hiresFixConfig,
      phaseLoraStrengths: newPhaseLoraStrengths,
    });
  }, [selectedLoras, hiresFixConfig, onHiresFixConfigChange]);

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

  // Update a single LoRA's phase strength
  const updateLoraStrength = (
    loraId: string,
    pass: 'pass1Strength' | 'pass2Strength',
    value: number
  ) => {
    const newStrengths = (hiresFixConfig?.phaseLoraStrengths ?? []).map(lora =>
      lora.loraId === loraId
        ? { ...lora, [pass]: value }
        : lora
    );
    onHiresFixConfigChange({
      ...hiresFixConfig,
      phaseLoraStrengths: newStrengths,
    });
  };

  // Has LoRAs to configure?
  const hasLoras = (hiresFixConfig?.phaseLoraStrengths?.length ?? 0) > 0;

  // Auto-enable when this section is shown
  useEffect(() => {
    if (hiresFixConfig && !hiresFixConfig.enabled) {
      onHiresFixConfigChange({ ...hiresFixConfig, enabled: true });
    }
  }, [hiresFixConfig, onHiresFixConfigChange]);

  // Reset to defaults (preserving phaseLoraStrengths)
  const handleResetDefaults = useCallback(() => {
    onHiresFixConfigChange({
      ...DEFAULT_HIRES_FIX_CONFIG,
      phaseLoraStrengths: hiresFixConfig?.phaseLoraStrengths ?? [],
    });
  }, [hiresFixConfig?.phaseLoraStrengths, onHiresFixConfigChange]);

  // Don't render if hiresFixConfig is not available
  if (!hiresFixConfig) {
    return null;
  }

  return (
    <CollapsibleSection title="Generation settings">
      <div className="space-y-4">
        {/* Header with reset button */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset defaults
          </Button>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Base Steps */}
          <SliderWithValue
            label="Base Steps"
            value={hiresFixConfig.base_steps ?? 6}
            onChange={(v) => updateField('base_steps', Math.round(v))}
            min={1}
            max={16}
            step={1}
            disabled={disabled}
            numberInputClassName="w-20"
          />

          {/* Hires Steps */}
          <SliderWithValue
            label="Hires Steps"
            value={hiresFixConfig.hires_steps ?? 6}
            onChange={(v) => updateField('hires_steps', Math.round(v))}
            min={1}
            max={16}
            step={1}
            disabled={disabled}
            numberInputClassName="w-20"
          />

          {/* Hires Scale Multiplier */}
          <SliderWithValue
            label="Hires Scale Multiplier"
            value={hiresFixConfig.hires_scale ?? 2.0}
            onChange={(v) => updateField('hires_scale', v)}
            min={1.0}
            max={4.0}
            step={0.1}
            disabled={disabled}
            numberInputClassName="w-20"
          />

          {/* Denoise */}
          <SliderWithValue
            label="Denoise"
            value={hiresFixConfig.hires_denoise ?? 0.5}
            onChange={(v) => updateField('hires_denoise', v)}
            min={0.1}
            max={1.0}
            step={0.05}
            disabled={disabled}
            numberInputClassName="w-20"
          />

          {/* Lightning LoRA Strength */}
          <SliderWithValue
            label="Lightning LoRA Strength"
            value={hiresFixConfig.lightning_lora_strength ?? 0.85}
            onChange={(v) => updateField('lightning_lora_strength', v)}
            min={0}
            max={1.0}
            step={0.01}
            disabled={disabled}
            numberInputClassName="w-20"
          />
        </div>

        {/* Per-Phase LoRA Strengths */}
        {hasLoras && (
          <div className="mt-4">
            <Label className="text-xs text-muted-foreground mb-2 block">
              Per-phase LoRA strengths
            </Label>
            <div className="border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <div>LoRA</div>
                <div className="text-center">Pass 1</div>
                <div className="text-center">Pass 2</div>
              </div>
              {/* Rows */}
              <div className="divide-y">
                {(hiresFixConfig?.phaseLoraStrengths ?? []).map((lora) => (
                  <div
                    key={lora.loraId}
                    className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 items-center"
                  >
                    <div className="text-sm truncate" title={lora.loraName}>
                      {lora.loraName}
                    </div>
                    <Input
                      type="number"
                      value={lora.pass1Strength}
                      onChange={(e) => updateLoraStrength(lora.loraId, 'pass1Strength', parseFloat(e.target.value) || 0)}
                      min={0}
                      max={2}
                      step={0.1}
                      disabled={disabled}
                      className="h-8 text-center text-sm"
                    />
                    <Input
                      type="number"
                      value={lora.pass2Strength}
                      onChange={(e) => updateLoraStrength(lora.loraId, 'pass2Strength', parseFloat(e.target.value) || 0)}
                      min={0}
                      max={2}
                      step={0.1}
                      disabled={disabled}
                      className="h-8 text-center text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Set 0 to disable a LoRA for that pass. Values &gt;1 increase strength.
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default GenerationSettingsSection;
