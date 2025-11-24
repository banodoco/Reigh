import React, { useState } from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { Info, RotateCcw, Trash2, Download, Search, Save, Library, FilePlus } from 'lucide-react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '../settings';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { PhaseConfigSelectorModal } from '@/shared/components/PhaseConfigSelectorModal';
import { PREDEFINED_LORAS, getDisplayNameFromUrl } from '../utils/loraDisplayUtils';

interface PhaseConfigVerticalProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onBlurSave?: () => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  availableLoras?: LoraModel[];
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect?: (presetId: string, config: PhaseConfig, presetMetadata?: any) => void;
  onPhasePresetRemove?: () => void;
  currentSettings?: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
}

export const PhaseConfigVertical: React.FC<PhaseConfigVerticalProps> = ({
  phaseConfig,
  onPhaseConfigChange,
  onBlurSave,
  randomSeed,
  onRandomSeedChange,
  availableLoras = [],
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  currentSettings
}) => {
  // State for LoRA selector modal for each phase
  const [activePhaseForLoraSelection, setActivePhaseForLoraSelection] = useState<number | null>(null);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [focusedLoraInput, setFocusedLoraInput] = useState<string | null>(null);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presetModalTab, setPresetModalTab] = useState<'browse' | 'add-new'>('browse');
  const [modalIntent, setModalIntent] = useState<'load' | 'overwrite'>('load');

  // Phase labels based on number of phases
  const phaseLabels2 = ["High Noise Sampler", "Low Noise Sampler"];
  const phaseLabels3 = ["High Noise Sampler 1", "High Noise Sampler 2", "Low Noise Sampler"];
  const phaseLabels = phaseConfig.num_phases === 2 ? phaseLabels2 : phaseLabels3;

  if (!phaseConfig) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No phase configuration available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with Load Preset, Save As Preset, Overwrite Preset and Restore Defaults */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-medium truncate">Phase Configuration</h3>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-8 h-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalIntent('load');
                  setPresetModalTab('browse');
                  setIsPresetModalOpen(true);
                }}
                type="button"
              >
                <Library className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Load Preset</p>
            </TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-8 h-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalIntent('load');
                  setPresetModalTab('add-new');
                  setIsPresetModalOpen(true);
                }}
                type="button"
              >
                <FilePlus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Save As Preset</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-8 h-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalIntent('overwrite');
                  setPresetModalTab('browse');
                  setIsPresetModalOpen(true);
                }}
                type="button"
              >
                <Save className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Overwrite Preset</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-8 h-8 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onPhaseConfigChange(DEFAULT_PHASE_CONFIG);
                }}
                type="button"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Restore Defaults</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Global Settings Card */}
      <Card className="bg-muted/20 relative">
        <div className="absolute top-3 left-3 z-10">
          <span className="text-sm font-medium border border-border rounded-md px-2 py-1 bg-background/50">
            Global Settings
          </span>
        </div>
        <CardContent className="pt-12 px-4 pb-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-3">
              {/* Number of Phases */}
              <div>
                <Label htmlFor="num_phases" className="text-sm font-light block mb-1.5">
                  Number of Phases
                </Label>
                <RadioGroup
                  value={String(phaseConfig.num_phases)}
                  onValueChange={(value) => {
                    const newNumPhases = parseInt(value);
                    const currentPhases = phaseConfig.phases || [];
                    const currentSteps = phaseConfig.steps_per_phase || [];
                    
                    // Adjust arrays to match the new number of phases
                    let newPhases = currentPhases.slice(0, newNumPhases);
                    let newSteps = currentSteps.slice(0, newNumPhases);
                    
                    // If we're increasing phases, fill with defaults
                    while (newPhases.length < newNumPhases) {
                      newPhases.push({
                        phase: newPhases.length + 1,
                        guidance_scale: 1.0,
                        loras: []
                      });
                    }
                    
                    while (newSteps.length < newNumPhases) {
                      newSteps.push(2);
                    }
                    
                    onPhaseConfigChange({
                      ...phaseConfig,
                      num_phases: newNumPhases,
                      phases: newPhases,
                      steps_per_phase: newSteps,
                      // Auto-set model_switch_phase to 1 when num_phases is 2
                      model_switch_phase: newNumPhases === 2 ? 1 : phaseConfig.model_switch_phase
                    });
                  }}
                  className="flex flex-row gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2" id="phases-2" />
                    <Label htmlFor="phases-2" className="text-sm">2</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3" id="phases-3" />
                    <Label htmlFor="phases-3" className="text-sm">3</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Sample Solver */}
              <div>
                <Label htmlFor="sample_solver" className="text-sm font-light block mb-1.5">Sample Solver</Label>
                <RadioGroup
                  value={phaseConfig.sample_solver}
                  onValueChange={(value) => onPhaseConfigChange({
                    ...phaseConfig,
                    sample_solver: value
                  })}
                  className="flex flex-row gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="euler" id="euler" />
                    <Label htmlFor="euler" className="text-sm">Euler</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unipc" id="unipc" />
                    <Label htmlFor="unipc" className="text-sm">UniPC</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dpm++" id="dpm++" />
                    <Label htmlFor="dpm++" className="text-sm">DPM++</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Total Steps */}
              <div className="text-sm text-muted-foreground pt-1.5 border-t mt-1">
                Total Steps: {phaseConfig.steps_per_phase.reduce((a, b) => a + b, 0)}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              {/* Flow Shift */}
              <div className="relative">
                <Label htmlFor="flow_shift" className="text-sm font-light block mb-1.5">
                  Flow Shift: {phaseConfig.flow_shift}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Higher values emphasize motion (range: 1.0-10.0)</p>
                  </TooltipContent>
                </Tooltip>
                <Slider
                  id="flow_shift"
                  min={1}
                  max={10}
                  step={0.1}
                  value={[phaseConfig.flow_shift]}
                  onValueChange={(value) => onPhaseConfigChange({
                    ...phaseConfig,
                    flow_shift: value[0]
                  })}
                />
              </div>

              {/* Random Seed */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="random-seed"
                  checked={randomSeed}
                  onCheckedChange={onRandomSeedChange}
                />
                <Label htmlFor="random-seed" className="text-sm">Random Seed</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Phase Settings - Side by Side Layout */}
      {phaseConfig.phases.map((phase, phaseIdx) => (
        <Card key={phaseIdx} className="bg-muted/30 relative">
          <div className="absolute top-3 left-3 z-10">
            <span className="text-sm font-medium border border-border rounded-md px-2 py-1 bg-background/50">
              {phaseLabels[phaseIdx] || `Phase ${phase.phase}`}
            </span>
          </div>
          <CardContent className="pt-12 px-4 pb-4">
            <div className="grid grid-cols-3 gap-6">
              {/* Left Column - Steps and Guidance Scale (1/3) */}
              <div className="space-y-3">
                {/* Steps */}
                <div>
                  <Label htmlFor={`steps_${phaseIdx}`} className="text-sm font-light block mb-1.5">
                    Steps: {phaseConfig.steps_per_phase[phaseIdx]}
                  </Label>
                  <Slider
                    id={`steps_${phaseIdx}`}
                    min={1}
                    max={20}
                    step={1}
                    value={[phaseConfig.steps_per_phase[phaseIdx]]}
                    onValueChange={(value) => {
                      const newSteps = [...phaseConfig.steps_per_phase];
                      newSteps[phaseIdx] = value[0];
                      onPhaseConfigChange({
                        ...phaseConfig,
                        steps_per_phase: newSteps
                      });
                    }}
                  />
                </div>

                {/* Guidance Scale */}
                <div>
                  <Label htmlFor={`guidance_scale_${phaseIdx}`} className="text-sm font-light block mb-1.5">
                    Guidance Scale
                  </Label>
                  <Input
                    id={`guidance_scale_${phaseIdx}`}
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={phase.guidance_scale}
                    onChange={(e) => {
                      const newPhases = [...phaseConfig.phases];
                      newPhases[phaseIdx].guidance_scale = parseFloat(e.target.value) || 0;
                      onPhaseConfigChange({
                        ...phaseConfig,
                        phases: newPhases
                      });
                    }}
                  />
                </div>
              </div>

              {/* Right Column - LoRAs (2/3) */}
              <div className="col-span-2">
                <Label className="text-sm font-medium mb-1.5 block">LoRAs</Label>
                <div className="grid grid-cols-2 gap-2 mb-1.5 w-full">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActivePhaseForLoraSelection(phaseIdx);
                      setIsLoraModalOpen(true);
                    }}
                    type="button"
                  >
                    <Search className="h-3 w-3 mr-1" /> Search
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                      >
                        <Download className="h-3 w-3 mr-1" /> Utility
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      {/* Group by category */}
                      {Object.entries(
                        PREDEFINED_LORAS.reduce((acc, lora) => {
                          if (!acc[lora.category]) acc[lora.category] = [];
                          acc[lora.category].push(lora);
                          return acc;
                        }, {} as Record<string, typeof PREDEFINED_LORAS>)
                      ).map(([category, loras], idx) => (
                        <React.Fragment key={category}>
                          {idx > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                            {category}
                          </DropdownMenuLabel>
                          {loras.map((predefinedLora) => (
                            <DropdownMenuItem
                              key={predefinedLora.url}
                              onClick={() => {
                                const newPhases = [...phaseConfig.phases];
                                // Shallow copy phase object before modifying
                                newPhases[phaseIdx] = { 
                                  ...newPhases[phaseIdx],
                                  loras: newPhases[phaseIdx].loras.filter(l => l.url && l.url.trim() !== "")
                                };

                                newPhases[phaseIdx].loras.push({
                                  url: predefinedLora.url,
                                  multiplier: "1.0"
                                });
                                onPhaseConfigChange({
                                  ...phaseConfig,
                                  phases: newPhases
                                });
                              }}
                              className="text-xs"
                            >
                              {predefinedLora.name}
                            </DropdownMenuItem>
                          ))}
                        </React.Fragment>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                {phase.loras.map((lora, loraIdx) => {
                  const inputId = `lora-${phaseIdx}-${loraIdx}`;
                  const isFocused = focusedLoraInput === inputId;
                  return (
                    <div key={loraIdx} className="flex items-center gap-2 mb-1.5">
                      <div className="relative flex-1 min-w-0">
                        <Input
                          placeholder="LoRA URL"
                          value={isFocused ? lora.url : getDisplayNameFromUrl(lora.url, availableLoras)}
                          onChange={(e) => {
                            const newPhases = [...phaseConfig.phases];
                            newPhases[phaseIdx].loras[loraIdx].url = e.target.value;
                            onPhaseConfigChange({
                              ...phaseConfig,
                              phases: newPhases
                            });
                          }}
                          onFocus={() => setFocusedLoraInput(inputId)}
                          onBlur={() => {
                            setFocusedLoraInput(null);
                            onBlurSave?.();
                          }}
                          className="pr-8"
                          title={lora.url} // Show full URL on hover
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              const newPhases = [...phaseConfig.phases];
                              newPhases[phaseIdx].loras.splice(loraIdx, 1);
                              onPhaseConfigChange({
                                ...phaseConfig,
                                phases: newPhases
                              });
                            }}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Input
                        type="number"
                        placeholder="Multiplier"
                        value={lora.multiplier}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={(e) => {
                          const newPhases = [...phaseConfig.phases];
                          newPhases[phaseIdx].loras[loraIdx].multiplier = e.target.value;
                          onPhaseConfigChange({
                            ...phaseConfig,
                            phases: newPhases
                          });
                        }}
                        onBlur={() => onBlurSave?.()}
                        className="w-16 sm:w-20 flex-shrink-0 text-center"
                      />
                    </div>
                  );
                })}
                
                {/* Add LoRA button */}
                <button
                  onClick={() => {
                    const newPhases = [...phaseConfig.phases];
                    // Shallow copy phase object before modifying
                    newPhases[phaseIdx] = { 
                      ...newPhases[phaseIdx],
                      loras: newPhases[phaseIdx].loras.filter(l => l.url && l.url.trim() !== "")
                    };

                    newPhases[phaseIdx].loras.push({
                      url: "",
                      multiplier: "1.0"
                    });
                    onPhaseConfigChange({
                      ...phaseConfig,
                      phases: newPhases
                    });
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
                  type="button"
                >
                  + Add LoRA
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* LoRA Selector Modal for Phase Config */}
      <LoraSelectorModal
        isOpen={isLoraModalOpen}
        onClose={() => {
          setIsLoraModalOpen(false);
          setActivePhaseForLoraSelection(null);
        }}
        selectedLoras={[]} // Don't pre-select anything
        loras={availableLoras || []}
        onAddLora={(lora) => {
          // Add the selected LoRA to the active phase
          if (activePhaseForLoraSelection !== null) {
            // Extract URL from the huggingface_url property
            const loraUrl = ((lora as any).huggingface_url as string) || '';
            
            console.log('[PhaseConfig] Adding LoRA from search:', { 
              lora, 
              loraUrl,
              loraKeys: Object.keys(lora)
            });
            
            const newPhases = [...phaseConfig.phases];
            // Shallow copy phase object before modifying
            newPhases[activePhaseForLoraSelection] = { 
              ...newPhases[activePhaseForLoraSelection],
              loras: newPhases[activePhaseForLoraSelection].loras.filter(l => l.url && l.url.trim() !== "")
            };

            newPhases[activePhaseForLoraSelection].loras.push({
              url: loraUrl,
              multiplier: "1.0"
            });
            onPhaseConfigChange({
              ...phaseConfig,
              phases: newPhases
            });
            setIsLoraModalOpen(false);
            setActivePhaseForLoraSelection(null);
          }
        }}
        onRemoveLora={() => {}}
        onUpdateLoraStrength={() => {}}
        lora_type="Wan 2.1 14b"
      />

      {/* Phase Config Preset Selector Modal (for loading/saving presets) */}
      {(() => { console.log('[PresetAutoPopulate] PhaseConfigVertical passing currentSettings to Modal:', currentSettings); return null; })()}
      <PhaseConfigSelectorModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        onSelectPreset={(preset) => {
          if (preset.metadata.phaseConfig && onPhasePresetSelect) {
            onPhasePresetSelect(preset.id, preset.metadata.phaseConfig, preset.metadata);
          }
          setIsPresetModalOpen(false);
        }}
        onRemovePreset={() => {
          if (onPhasePresetRemove) {
            onPhasePresetRemove();
          }
        }}
        selectedPresetId={selectedPhasePresetId || null}
        currentPhaseConfig={phaseConfig}
        initialTab={presetModalTab}
        currentSettings={currentSettings}
        intent={modalIntent}
      />
    </div>
  );
};

