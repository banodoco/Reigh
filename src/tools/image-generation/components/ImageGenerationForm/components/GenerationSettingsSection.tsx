import React, { useCallback, useMemo } from 'react';
import { CollapsibleSection } from '@/shared/components/ui/collapsible-section';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { Switch } from '@/shared/components/ui/switch';
import { RotateCcw } from 'lucide-react';
import { HiresFixConfig, DEFAULT_HIRES_FIX_CONFIG, ResolutionMode } from '../types';
import { AspectRatioSelector } from '@/shared/components/AspectRatioSelector';
import { AspectRatioVisualizer } from '@/shared/components/AspectRatioVisualizer';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group';

interface GenerationSettingsSectionProps {
  /** Current hires fix configuration */
  hiresFixConfig: HiresFixConfig;
  /** Callback when config changes */
  onHiresFixConfigChange: (config: HiresFixConfig) => void;
  /** Project resolution string (e.g., "512x512") for calculating scaled resolution */
  projectResolution?: string;
  /** Project aspect ratio (e.g., "16:9") for display */
  projectAspectRatio?: string;
  /** Whether inputs should be disabled */
  disabled?: boolean;
  /** Whether local generation is enabled (shows Phase 1/2 settings) */
  isLocalGeneration?: boolean;
}

/**
 * Generation Settings section for local image generation.
 * Provides resolution scaling and two-pass hires fix configuration.
 */
export const GenerationSettingsSection: React.FC<GenerationSettingsSectionProps> = ({
  hiresFixConfig,
  onHiresFixConfigChange,
  projectResolution,
  projectAspectRatio,
  disabled = false,
  isLocalGeneration = false,
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

  const isEnabled = hiresFixConfig?.enabled ?? true;

  // Reset to defaults
  const handleResetDefaults = useCallback(() => {
    onHiresFixConfigChange(DEFAULT_HIRES_FIX_CONFIG);
  }, [onHiresFixConfigChange]);

  // Don't render if hiresFixConfig is not available
  if (!hiresFixConfig) {
    return null;
  }

  const headerAction = (
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

  // Calculate the resulting resolution based on current settings
  const calculatedResolution = useMemo(() => {
    let baseWidth: number;
    let baseHeight: number;

    if (hiresFixConfig.resolution_mode === 'custom' && hiresFixConfig.custom_aspect_ratio) {
      const customRes = ASPECT_RATIO_TO_RESOLUTION[hiresFixConfig.custom_aspect_ratio];
      if (customRes) {
        [baseWidth, baseHeight] = customRes.split('x').map(Number);
      } else {
        return null;
      }
    } else if (projectResolution) {
      [baseWidth, baseHeight] = projectResolution.split('x').map(Number);
    } else {
      return null;
    }

    const scale = hiresFixConfig.resolution_scale ?? 1.5;
    const scaledWidth = Math.round(baseWidth * scale);
    const scaledHeight = Math.round(baseHeight * scale);
    return `${scaledWidth}x${scaledHeight}`;
  }, [hiresFixConfig.resolution_mode, hiresFixConfig.custom_aspect_ratio, hiresFixConfig.resolution_scale, projectResolution]);

  return (
    <CollapsibleSection title="Advanced generation settings" headerAction={headerAction}>
      <div className="space-y-4">
        {/* Resolution Configuration - single row on desktop */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide">Dimensions</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <ToggleGroup
              type="single"
              value={hiresFixConfig.resolution_mode ?? 'project'}
              onValueChange={(value) => {
                if (value) updateField('resolution_mode', value as ResolutionMode);
              }}
              disabled={disabled}
            >
              <ToggleGroupItem value="project" className="text-xs h-7 px-2">
                Project
              </ToggleGroupItem>
              <ToggleGroupItem value="custom" className="text-xs h-7 px-2">
                Custom
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="hidden md:block h-6 w-px bg-border" />

            <div className="flex items-center gap-3">
              {hiresFixConfig.resolution_mode === 'custom' ? (
                <AspectRatioSelector
                  value={hiresFixConfig.custom_aspect_ratio ?? '16:9'}
                  onValueChange={(ratio) => updateField('custom_aspect_ratio', ratio)}
                  disabled={disabled}
                />
              ) : projectAspectRatio && (
                <>
                  <div className="h-10 px-3 flex items-center border border-border rounded-md bg-card text-muted-foreground">
                    {projectAspectRatio}
                  </div>
                  <AspectRatioVisualizer aspectRatio={projectAspectRatio} className="h-8" />
                </>
              )}
            </div>

            <div className="hidden md:block h-6 w-px bg-border" />

            <div className="flex-1 max-w-xs">
              <SliderWithValue
                label="Scale"
                value={hiresFixConfig.resolution_scale ?? 1.5}
                onChange={(v) => updateField('resolution_scale', v)}
                min={1.0}
                max={2.5}
                step={0.1}
                disabled={disabled}
                numberInputClassName="w-20"
              />
            </div>

            <div className="hidden md:block h-6 w-px bg-border" />

            <div className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-md">
              <div className="text-lg font-bold text-primary tabular-nums">
                {calculatedResolution ?? '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Phase 1 & 2: Only shown for local generation */}
        {isLocalGeneration && (
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
                  value={hiresFixConfig.lightning_lora_strength_phase_1 ?? 0.9}
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">Phase 2</span>
                  <span className="text-xs text-muted-foreground">Hires Refinement</span>
                </div>
                <Switch
                  size="sm"
                  checked={isEnabled}
                  onCheckedChange={(checked) => updateField('enabled', checked)}
                  disabled={disabled}
                />
              </div>
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <SliderWithValue
                  label="Steps"
                  value={hiresFixConfig.hires_steps ?? 8}
                  onChange={(v) => updateField('hires_steps', Math.round(v))}
                  min={1}
                  max={16}
                  step={1}
                  disabled={disabled || !isEnabled}
                  numberInputClassName="w-20"
                />
                <SliderWithValue
                  label="Upscale Factor"
                  value={hiresFixConfig.hires_scale ?? 1.1}
                  onChange={(v) => updateField('hires_scale', v)}
                  min={1.0}
                  max={4.0}
                  step={0.1}
                  disabled={disabled || !isEnabled}
                  numberInputClassName="w-20"
                />
                <SliderWithValue
                  label="Denoise"
                  value={hiresFixConfig.hires_denoise ?? 0.55}
                  onChange={(v) => updateField('hires_denoise', v)}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  disabled={disabled || !isEnabled}
                  numberInputClassName="w-20"
                />
                <SliderWithValue
                  label="Lightning LoRA"
                  value={hiresFixConfig.lightning_lora_strength_phase_2 ?? 0.5}
                  onChange={(v) => updateField('lightning_lora_strength_phase_2', v)}
                  min={0}
                  max={1.0}
                  step={0.01}
                  disabled={disabled || !isEnabled}
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

export default GenerationSettingsSection;
