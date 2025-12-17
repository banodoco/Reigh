import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Info, Library, Settings, Pencil } from 'lucide-react';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { PhaseConfigVertical } from '@/tools/travel-between-images/components/PhaseConfigVertical';
import { PhaseConfigSelectorModal } from '@/shared/components/PhaseConfigSelectorModal';
import { PhaseConfig } from '@/tools/travel-between-images/settings';
import { SelectedPresetCard } from './SelectedPresetCard';
import { useMotionPresets } from './useMotionPresets';
import type { MotionPresetSelectorProps, Preset, MotionMode, PresetMetadata } from './types';

// Re-export types for convenience
export type { 
  MotionPresetSelectorProps, 
  BuiltinPreset, 
  MotionMode, 
  GenerationTypeMode,
  PresetMetadata,
} from './types';

/**
 * Shared component for Basic/Advanced motion settings with preset selection.
 * 
 * Features:
 * - Basic mode: Preset chips for quick selection + optional custom content (e.g., LoRAs)
 * - Advanced mode: Full PhaseConfigVertical editor
 * - Browse modal for discovering more presets
 * - Persists selections via callbacks
 * 
 * @example
 * ```tsx
 * <MotionPresetSelector
 *   builtinPreset={BUILTIN_JOIN_CLIPS_PRESET}
 *   generationTypeMode="vace"
 *   selectedPhasePresetId={selectedPhasePresetId}
 *   phaseConfig={phaseConfig}
 *   motionMode={motionMode}
 *   onPresetSelect={handlePresetSelect}
 *   onPresetRemove={handlePresetRemove}
 *   onModeChange={handleModeChange}
 *   onPhaseConfigChange={handlePhaseConfigChange}
 *   renderBasicModeContent={() => (
 *     <LoraManager ... />
 *   )}
 * />
 * ```
 */
export const MotionPresetSelector: React.FC<MotionPresetSelectorProps> = ({
  // Core config
  builtinPreset,
  featuredPresetIds = [],
  generationTypeMode,
  
  // State
  selectedPhasePresetId,
  phaseConfig,
  motionMode,
  
  // Callbacks
  onPresetSelect,
  onPresetRemove,
  onModeChange,
  onPhaseConfigChange,
  onRestoreDefaults,
  
  // Advanced mode props
  availableLoras = [],
  randomSeed = true,
  onRandomSeedChange,
  
  // Optional behavior
  advancedDisabled = false,
  advancedDisabledReason,
  presetTooltip = 'Select a motion preset to control generation settings.\nUse "Custom" to configure your own settings in Advanced mode.',
  renderBasicModeContent,
  queryKeyPrefix = 'motion-presets',
}) => {
  // Preset modal state
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

  // Use shared preset hook
  const {
    allPresets,
    shouldShowPresetChips,
    isCustomConfig,
  } = useMotionPresets({
    builtinPreset,
    featuredPresetIds,
    selectedPhasePresetId,
    queryKeyPrefix,
  });

  // Handle motion mode change
  const handleModeChange = useCallback((newMode: string) => {
    if (newMode === motionMode) return;
    if (advancedDisabled && newMode === 'advanced') return;
    onModeChange(newMode as MotionMode);
  }, [motionMode, advancedDisabled, onModeChange]);

  // Handle editing a preset (load its config and switch to advanced)
  const handleEditPreset = useCallback((presetPhaseConfig: PhaseConfig | undefined) => {
    if (presetPhaseConfig) {
      onPhaseConfigChange(presetPhaseConfig);
    }
    onPresetRemove();
    onModeChange('advanced');
  }, [onPhaseConfigChange, onPresetRemove, onModeChange]);

  // Handle preset selection (from chips or modal)
  const handlePresetSelect = useCallback((preset: Preset) => {
    if (preset.metadata?.phaseConfig) {
      onPresetSelect(preset.id, preset.metadata.phaseConfig, preset.metadata);
    }
    setIsPresetModalOpen(false);
  }, [onPresetSelect]);

  // Adapter for modal's onSelectPreset (it passes a Resource type)
  const handleModalPresetSelect = useCallback((resource: { id: string; metadata: PresetMetadata }) => {
    handlePresetSelect(resource as Preset);
  }, [handlePresetSelect]);

  // Handle switching to custom/advanced mode
  const handleCustomClick = useCallback(() => {
    onPresetRemove();
    onModeChange('advanced');
  }, [onPresetRemove, onModeChange]);

  // Handle restore defaults for phase config
  const handleRestorePhaseConfigDefaults = useCallback(() => {
    onPhaseConfigChange(builtinPreset.metadata.phaseConfig);
    onPresetSelect(builtinPreset.id, builtinPreset.metadata.phaseConfig, builtinPreset.metadata);
  }, [builtinPreset, onPhaseConfigChange, onPresetSelect]);

  return (
    <div className="space-y-4">
      <Tabs value={motionMode} onValueChange={handleModeChange}>
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium">Motion Settings</Label>
          <TabsList className="grid w-40 grid-cols-2">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger 
              value="advanced" 
              disabled={advancedDisabled}
              title={advancedDisabled ? advancedDisabledReason : undefined}
            >
              Advanced
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Basic Mode: Preset Selector + Optional Custom Content */}
        <TabsContent value="basic" className="mt-0 space-y-4">
          {/* Preset Selection Section */}
          <div className="space-y-3">
            {/* Header with label and Browse button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Motion Preset:</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="whitespace-pre-line">{presetTooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPresetModalOpen(true)}
                className="gap-1 text-xs h-7"
              >
                <Library className="h-3.5 w-3.5" />
                Browse Presets
              </Button>
            </div>

            {/* Preset chips - show if no selection or selection is a known preset */}
            {shouldShowPresetChips ? (
              <div className="grid grid-cols-3 gap-2 items-stretch">
                {/* Built-in + additional presets */}
                {allPresets.map((preset) => {
                  const isSelected = !isCustomConfig && selectedPhasePresetId === preset.id;
                  const isBuiltinDefault = preset.id === builtinPreset.id;
                  const metadata = preset.metadata;
                  const sampleVideo = metadata?.sample_generations?.find((g) => g.type === 'video');
                  
                  return (
                    <div key={preset.id} className="relative group h-full">
                      <button
                        onClick={() => handlePresetSelect(preset)}
                        className={`
                          w-full h-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
                          ${isSelected 
                            ? 'bg-primary/20 border-primary text-primary ring-2 ring-primary/30' 
                            : isBuiltinDefault
                              ? 'bg-muted border-primary/30 hover:border-primary/50 hover:bg-muted/80'
                              : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted'
                          }
                        `}
                      >
                        {/* Thumbnail for database presets with sample video */}
                        {sampleVideo && (
                          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                            <HoverScrubVideo
                              src={sampleVideo.url}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex min-w-0 flex-col justify-center items-start text-left flex-1">
                          {isBuiltinDefault ? (
                            <span className="text-sm font-medium leading-tight">
                              {metadata?.name || 'Preset'}{' '}
                              <span className="font-normal text-muted-foreground">(default)</span>
                            </span>
                          ) : (
                            <span className="text-sm font-medium leading-tight line-clamp-2">
                              {metadata?.name || 'Preset'}
                            </span>
                          )}
                        </div>
                      </button>
                      {/* Edit button - appears on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditPreset(metadata?.phaseConfig);
                        }}
                        className="absolute top-1 right-1 p-1 rounded bg-muted/80 border border-border opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground transition-all"
                        title="Edit in Advanced mode"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}

                {/* Custom chip - explicitly goes to advanced mode */}
                <button
                  onClick={handleCustomClick}
                  className={`
                    relative group flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors
                    ${isCustomConfig
                      ? 'bg-primary/20 border-primary text-primary ring-2 ring-primary/30' 
                      : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted'
                    }
                  `}
                >
                  <Settings className="h-4 w-4" />
                  <span className="text-sm font-medium">Custom</span>
                </button>
              </div>
            ) : (
              // Non-known preset selected (from Browse) - show selected preset info
              <SelectedPresetCard
                presetId={selectedPhasePresetId!}
                onSwitchToAdvanced={handleCustomClick}
                onChangePreset={() => setIsPresetModalOpen(true)}
                onRemove={onPresetRemove}
                queryKeyPrefix={queryKeyPrefix}
              />
            )}
          </div>

          {/* Optional custom content for Basic mode (e.g., LoRA manager) */}
          {renderBasicModeContent && (
            <div className="pt-4 border-t">
              {renderBasicModeContent()}
            </div>
          )}
        </TabsContent>

        {/* Advanced Mode: Phase Configuration */}
        <TabsContent value="advanced" className="mt-0">
          {phaseConfig ? (
            <PhaseConfigVertical
              phaseConfig={phaseConfig}
              onPhaseConfigChange={onPhaseConfigChange}
              randomSeed={randomSeed}
              onRandomSeedChange={onRandomSeedChange || (() => {})}
              availableLoras={availableLoras}
              generationTypeMode={generationTypeMode}
              hasStructureVideo={generationTypeMode === 'vace'}
              onRestoreDefaults={onRestoreDefaults || handleRestorePhaseConfigDefaults}
              selectedPhasePresetId={selectedPhasePresetId}
              onPhasePresetSelect={onPresetSelect}
              onPhasePresetRemove={onPresetRemove}
            />
          ) : (
            <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-muted/30">
              No phase configuration available. Switch to Basic mode to select a preset.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Phase Config Selector Modal */}
      <PhaseConfigSelectorModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        onSelectPreset={handleModalPresetSelect}
        onRemovePreset={onPresetRemove}
        selectedPresetId={selectedPhasePresetId}
        currentPhaseConfig={phaseConfig}
        generationTypeMode={generationTypeMode}
      />
    </div>
  );
};

// Also export sub-components and hooks for granular usage
export { SelectedPresetCard } from './SelectedPresetCard';
export { useMotionPresets } from './useMotionPresets';
