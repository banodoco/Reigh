import React, { useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group';
import { Info, AlertTriangle } from 'lucide-react';
import { PhaseConfig } from '../settings';
import { LoraModel, ActiveLora } from '@/shared/components/LoraSelectorModal';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { PresetsSelector } from './PresetsSelector';
import { PhaseConfigVertical } from './PhaseConfigVertical';

export interface MotionControlProps {
  // Motion mode selection
  motionMode: 'basic' | 'presets' | 'advanced';
  onMotionModeChange: (mode: 'basic' | 'presets' | 'advanced') => void;
  
  // Generation type mode (I2V vs VACE)
  generationTypeMode?: 'i2v' | 'vace';
  onGenerationTypeModeChange?: (mode: 'i2v' | 'vace') => void;
  hasStructureVideo?: boolean; // Whether a structure video is currently set
  
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
  currentSettings: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
  
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
  
  // Loading state - prevents sync effects from running during initial load
  settingsLoading?: boolean;
  
  // Restore defaults handler (for Advanced mode - respects I2V/VACE mode)
  onRestoreDefaults?: () => void;
}

export const MotionControl: React.FC<MotionControlProps> = ({
  motionMode,
  onMotionModeChange,
  generationTypeMode = 'i2v',
  onGenerationTypeModeChange,
  hasStructureVideo = false,
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
  currentSettings,
  advancedMode,
  onAdvancedModeChange,
  phaseConfig,
  onPhaseConfigChange,
  onBlurSave,
  randomSeed,
  onRandomSeedChange,
  turboMode,
  settingsLoading,
  onRestoreDefaults,
}) => {
  // Sync motionMode with advancedMode state
  // When switching to advanced, enable advancedMode; when leaving, disable it
  // CRITICAL: Skip sync during initial load to prevent race condition where
  // default 'basic' motionMode triggers onAdvancedModeChange(false) before
  // the actual settings are loaded from the database
  useEffect(() => {
    if (settingsLoading) {
      console.log('[MotionControl] Skipping sync - settings still loading');
      return;
    }
    
    if (motionMode === 'advanced' || motionMode === 'presets') {
      if (!advancedMode) {
        onAdvancedModeChange(true);
      }
    } else if (motionMode === 'basic') {
      if (advancedMode) {
        onAdvancedModeChange(false);
      }
    }
  }, [motionMode, advancedMode, onAdvancedModeChange, settingsLoading]);

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
          {/* Model Type Toggle (I2V vs VACE) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-light">Model Type</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p><strong>I2V (Image-to-Video):</strong> Generate video from images only.<br />
                  <strong>VACE:</strong> Use a structure/guidance video for motion control.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <ToggleGroup
              type="single"
              value={generationTypeMode}
              onValueChange={(value) => {
                if (value && onGenerationTypeModeChange) {
                  onGenerationTypeModeChange(value as 'i2v' | 'vace');
                }
              }}
              className="h-9 border rounded-md bg-muted/50 w-fit"
            >
              <ToggleGroupItem 
                value="i2v" 
                className="text-sm px-4 h-9 font-medium transition-all duration-300 ease-in-out data-[state=on]:scale-105 data-[state=on]:shadow-sm"
              >
                I2V
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="vace" 
                className="text-sm px-4 h-9 font-medium transition-all duration-300 ease-in-out data-[state=on]:scale-105 data-[state=on]:shadow-sm"
              >
                VACE
              </ToggleGroupItem>
            </ToggleGroup>
            
            {/* Warning when I2V mode is selected but structure video exists */}
            {generationTypeMode === 'i2v' && hasStructureVideo && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Structure video is set but won't be used in I2V mode. Switch to VACE to use it.</span>
              </div>
            )}
          </div>

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
          {console.log('[PresetAutoPopulate] MotionControl passing currentSettings to PresetsSelector:', currentSettings)}
          <PresetsSelector
            selectedPhasePresetId={selectedPhasePresetId}
            onPhasePresetSelect={onPhasePresetSelect}
            onPhasePresetRemove={onPhasePresetRemove}
            phaseConfig={phaseConfig}
            onSwitchToAdvanced={handleSwitchToAdvanced}
            currentSettings={currentSettings}
          />
        </TabsContent>

        {/* Advanced Mode: Phase Configuration */}
        <TabsContent value="advanced" className="mt-4">
          {console.log('[PresetAutoPopulate] MotionControl passing currentSettings to PhaseConfigVertical:', currentSettings)}
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
              currentSettings={currentSettings}
              generationTypeMode={generationTypeMode}
              onGenerationTypeModeChange={onGenerationTypeModeChange}
              hasStructureVideo={hasStructureVideo}
              amountOfMotion={amountOfMotion}
              onRestoreDefaults={onRestoreDefaults}
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

