import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Slider } from "@/shared/components/ui/slider";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { Info, Plus, Trash2, Search, Download, ChevronDown, ChevronLeft, Sparkles, RotateCcw } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/shared/components/ui/dropdown-menu";
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from './ShotEditor/state/types';
import { Project } from '@/types/project';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraModel, LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useProject } from '@/shared/contexts/ProjectContext';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '../settings';
import { toast } from 'sonner';
import { framesToSeconds } from './Timeline/utils/time-utils';

// Pre-defined LoRA options for quick selection
const PREDEFINED_LORAS = [
  {
    name: "High Noise Model (250928)",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
    category: "Lightning Official"
  },
  {
    name: "Low Noise Model (250928)",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors",
    category: "Lightning Official"
  },
  {
    name: "Fun InP High Noise HPS2.1",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Fun-A14B-InP-high-noise-HPS2.1.safetensors",
    category: "Fun InP"
  },
  {
    name: "Fun InP High Noise MPS",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors",
    category: "Fun InP"
  },
  {
    name: "Fun InP Low Noise HPS2.1",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors",
    category: "Fun InP"
  },
  {
    name: "Fun InP Low Noise MPS",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Fun-A14B-InP-low-noise-MPS.safetensors",
    category: "Fun InP"
  },
  {
    name: "Lightning T2V HIGH (fp16)",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16.safetensors",
    category: "Lightning Accelerators"
  },
  {
    name: "Lightning T2V v1.1 HIGH (fp16)",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Lightning_T2V-v1.1-A14B-4steps-lora_HIGH_fp16.safetensors",
    category: "Lightning Accelerators"
  },
  {
    name: "Lightning T2V v1.1 LOW (fp16)",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan2.2-Lightning_T2V-v1.1-A14B-4steps-lora_LOW_fp16.safetensors",
    category: "Lightning Accelerators"
  },
  {
    name: "HIGH Lightning 250928 (rank128, fp16)",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan22_A14B_T2V_HIGH_Lightning_4steps_lora_250928_rank128_fp16.safetensors",
    category: "Lightning Accelerators"
  },
  {
    name: "LOW Lightning 250928 (rank64, fp16)",
    url: "https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/loras_accelerators/Wan22_A14B_T2V_LOW_Lightning_4steps_lora_250928_rank64_fp16.safetensors",
    category: "Lightning Accelerators"
  },
];

interface BatchSettingsFormProps {
  batchVideoPrompt: string;
  onBatchVideoPromptChange: (value: string) => void;
  batchVideoFrames: number;
  onBatchVideoFramesChange: (value: number) => void;
  batchVideoContext: number;
  onBatchVideoContextChange: (value: number) => void;
  batchVideoSteps: number;
  onBatchVideoStepsChange: (value: number) => void;
  dimensionSource: 'project' | 'firstImage' | 'custom';
  onDimensionSourceChange: (source: 'project' | 'firstImage' | 'custom') => void;
  customWidth?: number;
  onCustomWidthChange: (v: number | undefined) => void;
  customHeight?: number;
  onCustomHeightChange: (v: number | undefined) => void;
  steerableMotionSettings: SteerableMotionSettings;
  onSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  projects: Project[];
  selectedProjectId: string | null;
  isTimelineMode?: boolean; // Add timeline mode flag

  selectedLoras?: ActiveLora[];
  availableLoras?: LoraModel[];
  
  // New accelerated props
  accelerated: boolean;
  onAcceleratedChange: (value: boolean) => void;
  showStepsNotification?: boolean;
  
  // Random seed props  
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  
  // Turbo mode props
  turboMode: boolean;
  onTurboModeChange: (value: boolean) => void;
  
  // Image count for conditional UI
  imageCount?: number;
  
  // Amount of motion props (0-100 range for UI)
  amountOfMotion: number;
  onAmountOfMotionChange: (value: number) => void;
  // selectedMode removed - now hardcoded to use specific model
  
  // Auto-create individual prompts toggle
  autoCreateIndividualPrompts: boolean;
  onAutoCreateIndividualPromptsChange: (value: boolean) => void;
  
  // Advanced mode props
  advancedMode: boolean;
  onAdvancedModeChange: (value: boolean) => void;
  phaseConfig?: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  
  // Clear enhanced prompts handler
  onClearEnhancedPrompts?: () => Promise<void>;
}

const BatchSettingsForm: React.FC<BatchSettingsFormProps> = ({
  batchVideoPrompt,
  onBatchVideoPromptChange,
  batchVideoFrames,
  onBatchVideoFramesChange,
  batchVideoContext,
  onBatchVideoContextChange,
  batchVideoSteps,
  onBatchVideoStepsChange,
  dimensionSource,
  onDimensionSourceChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  steerableMotionSettings,
  onSteerableMotionSettingsChange,
  projects,
  selectedProjectId,
  isTimelineMode,
  selectedLoras,
  availableLoras,
  accelerated,
  onAcceleratedChange,
  showStepsNotification,
  randomSeed,
  onRandomSeedChange,
  turboMode,
  onTurboModeChange,
  imageCount = 0,
  amountOfMotion,
  onAmountOfMotionChange,
  autoCreateIndividualPrompts,
  onAutoCreateIndividualPromptsChange,
  advancedMode,
  onAdvancedModeChange,
  phaseConfig = DEFAULT_PHASE_CONFIG,
  onPhaseConfigChange,
  onClearEnhancedPrompts,
}) => {
    // Get project context for persistent state
    const { selectedProjectId: contextProjectId } = useProject();
    const effectiveProjectId = selectedProjectId || contextProjectId;
    
    // Persistent state for advanced section expansion (project-level)
    // Using sessionStorage for instant UI like Image Generation form
    const [advancedSectionExpanded, setAdvancedSectionExpanded] = React.useState<boolean>(() => {
      try {
        const key = `travel-advanced-expanded-${effectiveProjectId}`;
        const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null;
        if (raw === 'true') return true;
        if (raw === 'false') return false;
      } catch {}
      return true; // Default to expanded
    });
    
    // Save expanded state to sessionStorage whenever it changes
    React.useEffect(() => {
      try {
        const key = `travel-advanced-expanded-${effectiveProjectId}`;
        window.sessionStorage.setItem(key, String(advancedSectionExpanded));
      } catch {}
    }, [advancedSectionExpanded, effectiveProjectId]);
    
    // State for LoRA selector modal for each phase
    const [activePhaseForLoraSelection, setActivePhaseForLoraSelection] = React.useState<number | null>(null);
    const [isLoraModalOpen, setIsLoraModalOpen] = React.useState(false);
    
    // Track which LoRA URL input is focused
    const [focusedLoraInput, setFocusedLoraInput] = React.useState<string | null>(null);
    
    // Helper function to extract filename from URL
    const getFilenameFromUrl = (url: string) => {
      if (!url) return '';
      const parts = url.split('/');
      return parts[parts.length - 1] || url;
    };

    // Get generation location settings to conditionally show turbo mode
    const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
    const isCloudGenerationEnabled = generationMethods.inCloud && !generationMethods.onComputer;
    
    // Check if turbo mode should be disabled due to too many images
    const hasTooManyImages = imageCount > 2;
    const isTurboModeDisabled = hasTooManyImages;

    // Debug logging for toggle visibility
    console.log("[BatchSettingsForm] Auto-Create Individual Prompts toggle visibility:", {
      isTimelineMode,
      turboMode,
      autoCreateIndividualPrompts,
      shouldShow: !turboMode,
      imageCount
    });

    // Validation: Check for phaseConfig inconsistencies and warn
    React.useEffect(() => {
      if (phaseConfig && advancedMode) {
        const phasesLength = phaseConfig.phases?.length || 0;
        const stepsLength = phaseConfig.steps_per_phase?.length || 0;
        const numPhases = phaseConfig.num_phases;
        
        if (numPhases !== phasesLength || numPhases !== stepsLength) {
          console.error('[BatchSettingsForm] INCONSISTENT PHASE CONFIG:', {
            num_phases: numPhases,
            phases_array_length: phasesLength,
            steps_array_length: stepsLength,
            phases_data: phaseConfig.phases?.map(p => ({ 
              phase: p.phase, 
              guidance_scale: p.guidance_scale, 
              loras_count: p.loras?.length 
            })),
            steps_per_phase: phaseConfig.steps_per_phase,
            WARNING: 'num_phases does not match array lengths! This will cause backend errors.'
          });
        }
      }
    }, [phaseConfig, advancedMode]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Label htmlFor="batchVideoPrompt" className="text-sm font-light block mb-1.5">
                    {isTimelineMode 
                      ? 'Default/Base Prompt:'
                      : 'Prompt:'
                    }
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {autoCreateIndividualPrompts && isTimelineMode 
                          ? 'This text will be appended after AI-generated individual prompts for each pair.'
                          : 'This prompt guides the style and transition for all video segments.'
                        } <br /> Small changes can have a big impact.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <Textarea 
                    id="batchVideoPrompt"
                    value={batchVideoPrompt}
                    onChange={(e) => onBatchVideoPromptChange(e.target.value)}
                    placeholder={
                      autoCreateIndividualPrompts && isTimelineMode
                        ? "e.g., cinematic style, high quality"
                        : "Enter a global prompt for all video segments... (e.g., cinematic transition)"
                    }
                    className="min-h-[70px]"
                    rows={3}
                    clearable
                    onClear={() => onBatchVideoPromptChange('')}
                  />
                </div>
                <div className="relative">
                  <Label htmlFor="negative_prompt" className="text-sm font-light block mb-1.5">
                    {isTimelineMode ? 'Default Negative Prompt:' : 'Negative prompt:'}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Specify what you want to avoid in the generated videos, <br /> like 'blurry' or 'distorted'.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Textarea
                    id="negative_prompt"
                    value={steerableMotionSettings.negative_prompt}
                    onChange={(e) => onSteerableMotionSettingsChange({ negative_prompt: e.target.value })}
                    placeholder="e.g., blurry, low quality"
                    className="min-h-[70px]"
                    rows={3}
                    clearable
                    onClear={() => onSteerableMotionSettingsChange({ negative_prompt: '' })}
                  />
                </div>
            </div>
            
            {/* Auto-Create Individual Prompts Toggle - show when turbo mode is disabled */}
            {!turboMode && (
              <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg border">
                <Switch
                  id="auto-create-individual-prompts"
                  checked={autoCreateIndividualPrompts}
                  onCheckedChange={onAutoCreateIndividualPromptsChange}
                />
                <div className="flex-1">
                  <Label htmlFor="auto-create-individual-prompts" className="font-medium">
                    Enhance/Create Prompts
                  </Label>
                </div>
                {onClearEnhancedPrompts && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await onClearEnhancedPrompts();
                        toast.success('Enhanced prompts cleared');
                      } catch (error) {
                        console.error('Error clearing enhanced prompts:', error);
                        toast.error('Failed to clear enhanced prompts');
                      }
                    }}
                    className="text-[11px] leading-tight"
                  >
                    <span className="text-center">
                      Clear current
                      <br />
                      enhanced prompts
                    </span>
                  </Button>
                )}
              </div>
            )}
            

            {/* Turbo Mode Toggle - only show when cloud generation is enabled and 2 or fewer images */}
            {isCloudGenerationEnabled && !isTurboModeDisabled && (
              <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg border">
                <Switch
                  id="turbo-mode"
                  checked={turboMode}
                  onCheckedChange={(checked) => {
                    onTurboModeChange(checked);
                    // Auto-set frames to 81 when turbo mode is enabled
                    if (checked && batchVideoFrames !== 81) {
                      onBatchVideoFramesChange(81);
                    }
                  }}
                />
                <div className="flex-1">
                  <Label htmlFor="turbo-mode" className="font-medium">
                    Turbo Mode
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Using fast WAN 2.2 model for quick results ({framesToSeconds(81)})
                  </p>
                </div>
              </div>
            )}
            
            {/* Frames per pair and Context frames - shown in both Timeline and Batch modes */}
            <div className={`grid grid-cols-1 gap-4 ${(isTimelineMode || imageCount >= 2) ? 'md:grid-cols-2' : ''}`}>
              <div className="relative">
                <Label htmlFor="batchVideoFrames" className="text-sm font-light block mb-1">
                  {isTimelineMode ? 'Duration per pair' : (imageCount === 1 ? 'Duration to generate' : 'Duration per pair')}: {framesToSeconds(batchVideoFrames)} ({batchVideoFrames} frames)
                  {turboMode && <span className="text-sm text-muted-foreground ml-2">(Fixed at {framesToSeconds(81)} in Turbo Mode)</span>}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                      <p>Determines the duration of the video segment{imageCount === 1 ? '' : ' for each image'}. <br /> More frames result in a longer segment.</p>
                  </TooltipContent>
                </Tooltip>
                <Slider
                  id="batchVideoFrames"
                  min={10}
                  max={81} 
                  step={1}
                  value={[batchVideoFrames]}
                  onValueChange={(value) => onBatchVideoFramesChange(value[0])}
                  disabled={turboMode || isTimelineMode}
                  className={(turboMode || isTimelineMode) ? 'opacity-50' : ''}
                />
              </div>
              {(isTimelineMode || imageCount >= 2) && (
                <div className="relative">
                  <Label htmlFor="batchVideoContext" className="text-sm font-light block mb-1">Context: {framesToSeconds(batchVideoContext)} ({batchVideoContext} frames)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>How many frames from one segment to reference for the next. <br /> Helps create smoother transitions.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Slider
                    id="batchVideoContext"
                    min={1}
                    max={24}
                    step={1}
                    value={[batchVideoContext]}
                    onValueChange={(value) => onBatchVideoContextChange(value[0])}
                  />
                </div>
              )}
            </div>


            {/* Advanced Mode Toggle */}
            <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg border">
              <Switch
                id="advanced-mode-toggle"
                checked={advancedMode}
                onCheckedChange={(checked) => {
                  onAdvancedModeChange(checked);
                  // When enabling, open the section and set debug to false; when disabling, close it
                  if (checked) {
                    setAdvancedSectionExpanded(true);
                    onSteerableMotionSettingsChange({ debug: false });
                  } else {
                    setAdvancedSectionExpanded(false);
                  }
                }}
              />
              <div className="flex-1">
                <Label htmlFor="advanced-mode-toggle" className="font-medium">
                  Advanced Mode
                </Label>
              </div>
            </div>
            
            {/* Advanced Mode Collapsible Section - only openable when advancedMode is true */}
            <Collapsible 
              open={advancedSectionExpanded && advancedMode} 
              onOpenChange={(open) => {
                // Only allow opening if advancedMode is true
                if (advancedMode) {
                  setAdvancedSectionExpanded(open);
                }
              }}
            >
              {advancedMode && (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between px-6 py-3 hover:bg-accent/30 bg-accent/10 border rounded-lg shadow-sm transition-all duration-300"
                    type="button"
                  >
                    <span className="font-light">
                      {advancedSectionExpanded ? 'Hide' : 'Show'} Phase Configuration
                    </span>
                    <div className="transition-transform duration-300">
                      {advancedSectionExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronLeft className="h-4 w-4" />
                      )}
                    </div>
                  </Button>
                </CollapsibleTrigger>
              )}

              <CollapsibleContent className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 transition-all duration-700 ease-in-out overflow-hidden">
                {/* Phase Config Settings - Full width section inside collapsible */}
                <Card className="mt-0">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Phase Configuration</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPhaseConfigChange(DEFAULT_PHASE_CONFIG);
                      }}
                      type="button"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore Defaults
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                  {/* Core Settings - Vertically aligned */}
                  <div className="space-y-4">
                    <div className="flex items-end gap-6">
                      <div className="w-44">
                        <Label htmlFor="num_phases" className="text-sm font-light block mb-2">
                          Number of Phases
                        </Label>
                        {/* Fixed to 3 phases - this is the optimal configuration */}
                        <Input
                          id="num_phases"
                          type="number"
                          className="h-10"
                          value={3}
                          disabled
                          readOnly
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="sample_solver" className="text-sm font-light block mb-2">Sample Solver</Label>
                        <RadioGroup
                          value={phaseConfig.sample_solver}
                          onValueChange={(value) => onPhaseConfigChange({
                            ...phaseConfig,
                            sample_solver: value
                          })}
                          className="flex flex-row gap-6 h-10 items-center"
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
                      
                      <div className="relative w-72">
                        <Label htmlFor="flow_shift" className="text-sm font-light block mb-2">Flow Shift: {phaseConfig.flow_shift}</Label>
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
                        <div className="h-10 flex items-center pr-4">
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
                      </div>
                      
                      <div className="flex-1" />
                      
                      <div className="flex items-center space-x-2 h-10">
                        <Switch
                          id="random-seed"
                          checked={randomSeed}
                          onCheckedChange={onRandomSeedChange}
                        />
                        <Label htmlFor="random-seed" className="text-sm whitespace-nowrap">Random Seed</Label>
                      </div>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      Total Steps: {phaseConfig.steps_per_phase.reduce((a, b) => a + b, 0)}
                    </div>
                  </div>
                  
                  {/* Per-Phase Settings - 3 side by side when space available */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {phaseConfig.phases.map((phase, phaseIdx) => {
                    // Fixed 3-phase labels
                    const phaseLabels = ["High Noise Sampler 1", "High Noise Sampler 2", "Low Noise Sampler"];
                    return (
                    <Card key={phaseIdx} className="bg-muted/30">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg font-semibold">{phaseLabels[phaseIdx] || `Phase ${phase.phase}`}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Steps and Guidance Scale side by side */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* Steps as slider */}
                          <div>
                            <Label htmlFor={`steps_${phaseIdx}`} className="text-sm font-light block mb-1">
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
                          
                          {/* Guidance scale as number input */}
                          <div>
                            <Label htmlFor={`guidance_scale_${phaseIdx}`} className="text-sm font-light block mb-1">
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
                        
                        {/* LoRAs */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">LoRAs</Label>
                          <div className="flex gap-2 mb-2 w-full">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setActivePhaseForLoraSelection(phaseIdx);
                                setIsLoraModalOpen(true);
                              }}
                            >
                              <Search className="h-3 w-3 mr-1" /> Search
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                const newPhases = [...phaseConfig.phases];
                                newPhases[phaseIdx].loras.push({
                                  url: "",
                                  multiplier: "1.0"
                                });
                                onPhaseConfigChange({
                                  ...phaseConfig,
                                  phases: newPhases
                                });
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add LoRA
                            </Button>
                          </div>
                          
                          {phase.loras.map((lora, loraIdx) => {
                            const inputId = `lora-${phaseIdx}-${loraIdx}`;
                            const isFocused = focusedLoraInput === inputId;
                            return (
                            <div key={loraIdx} className="flex gap-2 mb-2">
                              <div className="relative flex-1">
                                <Input
                                  placeholder="LoRA URL"
                                  value={isFocused ? lora.url : getFilenameFromUrl(lora.url)}
                                  onChange={(e) => {
                                    const newPhases = [...phaseConfig.phases];
                                    newPhases[phaseIdx].loras[loraIdx].url = e.target.value;
                                    onPhaseConfigChange({
                                      ...phaseConfig,
                                      phases: newPhases
                                    });
                                  }}
                                  onFocus={() => setFocusedLoraInput(inputId)}
                                  onBlur={() => setFocusedLoraInput(null)}
                                  className="pr-16"
                                  title={lora.url} // Show full URL on hover
                                />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 hover:bg-accent"
                                      >
                                        <Download className="h-4 w-4" />
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
                                                newPhases[phaseIdx].loras[loraIdx].url = predefinedLora.url;
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
                                className="w-16"
                              />
                            </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                  })}
                  </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
            
            {/* Steps and Amount of Motion sliders - shown when NOT in turbo mode and NOT in advanced mode */}
            {!turboMode && !advancedMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div className="relative">
                  <Label htmlFor="batchVideoSteps" className="text-sm font-light block mb-1">Generation steps: {batchVideoSteps}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Number of processing steps for each frame. <br /> Higher values can improve quality but increase generation time.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Slider
                    id="batchVideoSteps"
                    min={3}
                    max={12}
                    step={3}
                    value={[batchVideoSteps]}
                    onValueChange={(value) => onBatchVideoStepsChange(value[0])}
                  />
                </div>
                
                <div className="relative">
                  <Label htmlFor="amountOfMotion" className="text-sm font-light block mb-1">Amount of motion: {amountOfMotion}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Controls the amount of motion in the generated video. <br /> 0 = minimal motion, 100 = maximum motion.</p>
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
              </div>
            )}
            
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
              lora_type="image"
            />
        </div>
    );
};

export default BatchSettingsForm; 