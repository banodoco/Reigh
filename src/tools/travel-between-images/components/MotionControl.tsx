import React, { useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Info } from 'lucide-react';
import { PhaseConfig } from '../settings';
import { LoraModel, ActiveLora } from '@/shared/components/LoraSelectorModal';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { PresetsSelector } from './PresetsSelector';
import { PhaseConfigVertical } from './PhaseConfigVertical';

export interface MotionControlProps {
  // Motion mode selection
  motionMode: 'basic' | 'presets' | 'advanced';
  onMotionModeChange: (mode: 'basic' | 'presets' | 'advanced') => void;
  
  // Amount of Motion (for Basic mode)
  amountOfMotion: number;
  onAmountOfMotionChange: (value: number) => void;
  
  // LoRA management (for Basic mode)
  selectedLoras: ActiveLora[];
  availableLoras: LoraModel[];
  onAddLoraClick: () => void;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  onAddTriggerWord?: (trigger: string) => void;
  renderLoraHeaderActions?: () => React.ReactNode;
  
  // Phase preset props (for Presets mode)
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig) => void;
  onPhasePresetRemove: () => void;
  
  // Advanced mode props
  advancedMode: boolean;
  onAdvancedModeChange: (value: boolean) => void;
  phaseConfig?: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onBlurSave?: () => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  
  // Turbo mode affects availability
  turboMode?: boolean;
}

export const MotionControl: React.FC<MotionControlProps> = ({
  motionMode,
  onMotionModeChange,
  amountOfMotion,
  onAmountOfMotionChange,
  selectedLoras,
  availableLoras,
  onAddLoraClick,
  onRemoveLora,
  onLoraStrengthChange,
  onAddTriggerWord,
  renderLoraHeaderActions,
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  advancedMode,
  onAdvancedModeChange,
  phaseConfig,
  onPhaseConfigChange,
  onBlurSave,
  randomSeed,
  onRandomSeedChange,
  turboMode
}) => {
  // Sync motionMode with advancedMode state
  // When switching to advanced, enable advancedMode; when leaving, disable it
  useEffect(() => {
    if (motionMode === 'advanced' || motionMode === 'presets') {
      if (!advancedMode) {
        onAdvancedModeChange(true);
      }
    } else if (motionMode === 'basic') {
      if (advancedMode) {
        onAdvancedModeChange(false);
      }
    }
  }, [motionMode, advancedMode, onAdvancedModeChange]);

  // Handle mode change with validation
  const handleModeChange = useCallback((newMode: string) => {
    // Prevent switching to advanced/presets when turbo mode is active
    if (turboMode && (newMode === 'advanced' || newMode === 'presets')) {
      console.log('[MotionControl] Cannot switch to advanced/presets mode while turbo mode is active');
      return;
    }
    
    onMotionModeChange(newMode as 'basic' | 'presets' | 'advanced');
  }, [turboMode, onMotionModeChange]);

  // Handle switch to advanced from presets
  const handleSwitchToAdvanced = useCallback(() => {
    onMotionModeChange('advanced');
  }, [onMotionModeChange]);

  return (
    <div className="space-y-4">
      <Tabs value={motionMode} onValueChange={handleModeChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="presets" disabled={turboMode}>
            Presets
          </TabsTrigger>
          <TabsTrigger value="advanced" disabled={turboMode}>
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* Basic Mode: Amount of Motion + LoRAs */}
        <TabsContent value="basic" className="space-y-4 mt-4">
          {/* Amount of Motion Slider */}
          <div className="relative">
            <Label htmlFor="amountOfMotion" className="text-sm font-light block mb-1">
              Amount of motion: {amountOfMotion}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                  <Info className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Controls the amount of motion in the generated video. <br /> Applies a motion control LoRA at the specified strength. <br /> 0 = minimal motion, 100 = maximum motion.</p>
              </TooltipContent>
            </Tooltip>
            <Slider
              id="amountOfMotion"
              min={0}
              max={100}
              step={1}
              value={[amountOfMotion]}
              onValueChange={(value) => onAmountOfMotionChange(value[0])}
            />
          </div>

          {/* LoRA Controls */}
          <div className="space-y-4 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={onAddLoraClick}
            >
              Add or Manage LoRAs
            </Button>
            
            <ActiveLoRAsDisplay
              selectedLoras={selectedLoras}
              onRemoveLora={onRemoveLora}
              onLoraStrengthChange={onLoraStrengthChange}
              availableLoras={availableLoras}
              className="mt-4"
              onAddTriggerWord={onAddTriggerWord}
              renderHeaderActions={renderLoraHeaderActions}
            />
          </div>
        </TabsContent>

        {/* Presets Mode: Preset Selector */}
        <TabsContent value="presets" className="mt-4">
          <PresetsSelector
            selectedPhasePresetId={selectedPhasePresetId}
            onPhasePresetSelect={onPhasePresetSelect}
            onPhasePresetRemove={onPhasePresetRemove}
            phaseConfig={phaseConfig}
            onSwitchToAdvanced={handleSwitchToAdvanced}
          />
        </TabsContent>

        {/* Advanced Mode: Phase Configuration */}
        <TabsContent value="advanced" className="mt-4">
          {phaseConfig ? (
            <PhaseConfigVertical
              phaseConfig={phaseConfig}
              onPhaseConfigChange={onPhaseConfigChange}
              onBlurSave={onBlurSave}
              randomSeed={randomSeed}
              onRandomSeedChange={onRandomSeedChange}
              availableLoras={availableLoras}
              selectedPhasePresetId={selectedPhasePresetId}
              onPhasePresetSelect={onPhasePresetSelect}
              onPhasePresetRemove={onPhasePresetRemove}
            />
          ) : (
            <div className="text-sm text-muted-foreground p-4">
              No phase configuration available. Please enable advanced mode.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

