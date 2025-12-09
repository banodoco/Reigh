import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Slider } from "@/shared/components/ui/slider";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { Info, Plus, Sparkles, Eraser } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from './ShotEditor/state/types';
import { Project } from '@/types/project';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useProject } from '@/shared/contexts/ProjectContext';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '../settings';
import { framesToSeconds, quantizeFrameCount, getValidFrameCounts } from './Timeline/utils/time-utils';

interface BatchSettingsFormProps {
  batchVideoPrompt: string;
  onBatchVideoPromptChange: (value: string) => void;
  batchVideoFrames: number;
  onBatchVideoFramesChange: (value: number) => void;
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
  
  // Enhance prompt toggle (AI enhancement of prompts)
  enhancePrompt: boolean;
  onEnhancePromptChange: (value: boolean) => void;
  
  // Advanced mode (derived from motionMode in parent)
  advancedMode: boolean;
  
  // Blur save - triggers immediate save when user clicks away from field
  onBlurSave?: () => void;
  phaseConfig?: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  
  // Phase preset props
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect?: (presetId: string, config: PhaseConfig) => void;
  onPhasePresetRemove?: () => void;
  
  // Clear enhanced prompts handler
  onClearEnhancedPrompts?: () => Promise<void>;
  
  // Video control mode for conditional display
  videoControlMode?: 'individual' | 'batch';
  
  // Text before/after prompts
  textBeforePrompts?: string;
  onTextBeforePromptsChange?: (value: string) => void;
  textAfterPrompts?: string;
  onTextAfterPromptsChange?: (value: string) => void;
}

const BatchSettingsForm: React.FC<BatchSettingsFormProps> = ({
  batchVideoPrompt,
  onBatchVideoPromptChange,
  batchVideoFrames,
  onBatchVideoFramesChange,
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
  enhancePrompt,
  onEnhancePromptChange,
  advancedMode,
  phaseConfig = DEFAULT_PHASE_CONFIG,
  onPhaseConfigChange,
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  onBlurSave,
  onClearEnhancedPrompts,
  videoControlMode = 'batch',
  textBeforePrompts = '',
  onTextBeforePromptsChange,
  textAfterPrompts = '',
  onTextAfterPromptsChange,
}) => {
    // Get project context for persistent state
    const { selectedProjectId: contextProjectId } = useProject();
    // Mobile detection for touch-friendly tooltips
    const isMobile = useIsMobile();
    // Get generation location settings to conditionally show turbo mode
    const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
    const isCloudGenerationEnabled = generationMethods.inCloud && !generationMethods.onComputer;
    
    // Check if turbo mode should be disabled due to too many images
    const hasTooManyImages = imageCount > 2;
    const isTurboModeDisabled = hasTooManyImages;

    // Debug logging for toggle visibility
    console.log("[BatchSettingsForm] Toggle visibility:", {
      isTimelineMode,
      turboMode,
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
                {/* Left Column: Prompts with text before/after when applicable */}
                <div className="space-y-4">
                  {/* Main Prompt */}
                  <div className="relative">
                    <Label htmlFor="batchVideoPrompt" className="text-sm font-light block mb-1.5">
                      {(isTimelineMode || enhancePrompt)
                        ? 'Default/Base Prompt:'
                        : 'Prompt:'
                      }
                    </Label>
                    {isMobile ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button 
                            type="button" 
                            className="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0"
                          >
                            <Info className="h-4 w-4" />
                            <span className="sr-only">Info</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-sm" side="left" align="start">
                          <p>
                            {enhancePrompt
                              ? 'This text will be appended after AI-generated individual prompts for each pair.'
                              : 'This prompt guides the style and transition for all video segments.'
                            } Small changes can have a big impact.
                          </p>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                            <Info className="h-4 w-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {enhancePrompt
                              ? 'This text will be appended after AI-generated individual prompts for each pair.'
                              : 'This prompt guides the style and transition for all video segments.'
                            } <br /> Small changes can have a big impact.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Textarea 
                      id="batchVideoPrompt"
                      value={batchVideoPrompt}
                      onChange={(e) => onBatchVideoPromptChange(e.target.value)}
                      onBlur={() => onBlurSave?.()}
                      placeholder="Enter a global prompt for all video segments... (e.g., cinematic transition)"
                      className="min-h-[70px]"
                      rows={3}
                      clearable
                      onClear={() => onBatchVideoPromptChange('')}
                      voiceInput
                      voiceContext="This is a video generation prompt for AI video transitions between images. Describe the motion, transition style, or visual transformation you want. Focus on movement, camera motion, or how elements should animate."
                      onVoiceResult={(result) => {
                        onBatchVideoPromptChange(result.prompt || result.transcription);
                      }}
                    />
                  </div>
                  
                </div>
                
                {/* Right Column: Negative Prompt - same height as main prompt */}
                <div className="relative">
                  <Label htmlFor="negative_prompt" className="text-sm font-light block mb-1.5">
                    {isTimelineMode ? 'Default Negative Prompt:' : 'Negative prompt:'}
                  </Label>
                  {isMobile ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button 
                          type="button" 
                          className="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0"
                        >
                          <Info className="h-4 w-4" />
                          <span className="sr-only">Info</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 text-sm" side="left" align="start">
                        <p>Specify what you want to avoid in the generated videos, like 'blurry' or 'distorted'.</p>
                      </PopoverContent>
                    </Popover>
                  ) : (
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
                  )}
                  <Textarea
                    id="negative_prompt"
                    value={steerableMotionSettings.negative_prompt}
                    onChange={(e) => onSteerableMotionSettingsChange({ negative_prompt: e.target.value })}
                    onBlur={() => onBlurSave?.()}
                    placeholder="e.g., blurry, low quality"
                    className="min-h-[70px]"
                    rows={3}
                    clearable
                    onClear={() => onSteerableMotionSettingsChange({ negative_prompt: '' })}
                    voiceInput
                    voiceContext="This is a negative prompt - things to AVOID in the video generation. List unwanted qualities like 'blurry, distorted, low quality, shaky'. Keep it as a comma-separated list of terms to avoid."
                    onVoiceResult={(result) => {
                      onSteerableMotionSettingsChange({ negative_prompt: result.prompt || result.transcription });
                    }}
                  />
                </div>
            </div>
            
            {/* Enhance Prompt Toggle - show when turbo mode is disabled */}
            {!turboMode && (
              <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg border">
                <Switch
                  id="enhance-prompt"
                  checked={enhancePrompt}
                  onCheckedChange={onEnhancePromptChange}
                />
                <div className="flex-1">
                  <Label htmlFor="enhance-prompt" className="font-medium">
                    Enhance/Create Prompts
                  </Label>
                </div>
              </div>
            )}
            
            {/* Text Before/After Prompts - Always visible */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="textBeforePrompts" className="text-sm font-light block mb-1.5">
                  Before each prompt:
                </Label>
                <Input
                  id="textBeforePrompts"
                  value={textBeforePrompts}
                  onChange={(e) => onTextBeforePromptsChange?.(e.target.value)}
                  onBlur={() => onBlurSave?.()}
                  placeholder="Text to prepend to each prompt..."
                  className="w-full"
                  clearable
                  onClear={() => onTextBeforePromptsChange?.('')}
                  voiceInput
                  voiceContext="This is text that will be prepended to every video generation prompt. Keep it short - things like style prefixes or descriptions that apply to all video segments."
                  onVoiceResult={(result) => {
                    onTextBeforePromptsChange?.(result.prompt || result.transcription);
                  }}
                />
              </div>
              
              <div>
                <Label htmlFor="textAfterPrompts" className="text-sm font-light block mb-1.5">
                  After each prompt:
                </Label>
                <Input
                  id="textAfterPrompts"
                  value={textAfterPrompts}
                  onChange={(e) => onTextAfterPromptsChange?.(e.target.value)}
                  onBlur={() => onBlurSave?.()}
                  placeholder="Text to append to each prompt..."
                  className="w-full"
                  clearable
                  onClear={() => onTextAfterPromptsChange?.('')}
                  voiceInput
                  voiceContext="This is text that will be appended to every video generation prompt. Keep it short - things like quality suffixes or parameters that apply to all video segments."
                  onVoiceResult={(result) => {
                    onTextAfterPromptsChange?.(result.prompt || result.transcription);
                  }}
                />
              </div>
            </div>
            

            {/* Turbo Mode Toggle - DISABLED - keeping code for potential future use
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
            */}
            
            {/* Frames per pair - shown in both Timeline and Batch modes */}
            {/* Note: Frame counts must be in 4N+1 format (9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81) */}
            <div className="relative">
              <Label htmlFor="batchVideoFrames" className="text-sm font-light block mb-1">
                {isTimelineMode ? 'Duration per pair' : (imageCount === 1 ? 'Duration to generate' : 'Duration per pair')}: {framesToSeconds(batchVideoFrames)} ({batchVideoFrames} frames)
              </Label>
              {isMobile ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button 
                      type="button" 
                      className="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0"
                    >
                      <Info className="h-4 w-4" />
                      <span className="sr-only">Info</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 text-sm" side="left" align="start">
                    <p>Determines the duration of the video segment{imageCount === 1 ? '' : ' for each image'}. More frames result in a longer segment.</p>
                  </PopoverContent>
                </Popover>
              ) : (
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
              )}
              <Slider
                id="batchVideoFrames"
                min={9}
                max={81} 
                step={4}
                value={[quantizeFrameCount(batchVideoFrames, 9)]}
                onValueChange={(value) => onBatchVideoFramesChange(quantizeFrameCount(value[0], 9))}
                disabled={turboMode || isTimelineMode}
                className={(turboMode || isTimelineMode) ? 'opacity-50' : ''}
              />
            </div>

            
        </div>
    );
};

export default BatchSettingsForm; 