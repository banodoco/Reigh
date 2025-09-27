import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Slider } from "@/shared/components/ui/slider";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { ChevronRight, ChevronDown, Info } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from './ShotEditor/state/types';
import { Project } from '@/types/project';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

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
}) => {
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    // Get generation location settings to conditionally show turbo mode
    const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
    const isCloudGenerationEnabled = generationMethods.inCloud && !generationMethods.onComputer;
    
    // Check if turbo mode should be disabled due to too many images
    const hasTooManyImages = imageCount > 2;
    const isTurboModeDisabled = hasTooManyImages;

    return (
        <div className="space-y-4">


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Label htmlFor="batchVideoPrompt" className="text-sm font-light block mb-1.5">
                    {isTimelineMode ? 'Default Prompt:' : 'Prompt:'}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Info className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This prompt guides the style and transition for all video segments. <br /> Small changes can have a big impact.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Textarea 
                    id="batchVideoPrompt"
                    value={batchVideoPrompt}
                    onChange={(e) => onBatchVideoPromptChange(e.target.value)}
                    placeholder="Enter a global prompt for all video segments... (e.g., cinematic transition)"
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
            

            {/* Turbo Mode Toggle - only show when cloud generation is enabled */}
            {isCloudGenerationEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center space-x-2 p-3 bg-muted/30 rounded-lg border ${isTurboModeDisabled ? 'opacity-50' : ''}`}>
                    <Switch
                      id="turbo-mode"
                      checked={turboMode && !isTurboModeDisabled}
                      disabled={isTurboModeDisabled}
                      onCheckedChange={(checked) => {
                        if (isTurboModeDisabled) return;
                        onTurboModeChange(checked);
                        // Auto-set frames to 81 when turbo mode is enabled
                        if (checked && batchVideoFrames !== 81) {
                          onBatchVideoFramesChange(81);
                        }
                      }}
                    />
                    <div className="flex-1">
                      <Label htmlFor="turbo-mode" className={`font-medium ${isTurboModeDisabled ? 'cursor-not-allowed' : ''}`}>
                        Turbo Mode
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {isTurboModeDisabled 
                          ? 'Turbo mode requires 1-2 images only'
                          : turboMode 
                            ? 'Using fast WAN 2.2 model for quick results (81 frames)' 
                            : 'Using high-quality Lightning model for best results'
                        }
                      </p>
                    </div>
                  </div>
                </TooltipTrigger>
                {isTurboModeDisabled && (
                  <TooltipContent>
                    <p>Turbo mode is only possible with 1-2 images</p>
                  </TooltipContent>
                )}
              </Tooltip>
            )}
            
            <div className={`grid grid-cols-1 gap-4 ${!isTimelineMode && imageCount > 2 ? 'md:grid-cols-2' : ''}`}>
                {!isTimelineMode && (
                  <div className="relative">
                    <Label htmlFor="batchVideoFrames" className="text-sm font-light block mb-1">
                      {imageCount === 1 ? 'Frames to generate' : 'Frames per pair'}: {batchVideoFrames}
                      {turboMode && <span className="text-sm text-muted-foreground ml-2">(Fixed at 81 in Turbo Mode)</span>}
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
                      disabled={turboMode}
                      className={turboMode ? 'opacity-50' : ''}
                    />
                  </div>
                )}
                {!isTimelineMode && imageCount > 2 && (
                  <div className="relative">
                    <Label htmlFor="batchVideoContext" className="text-sm font-light block mb-1">Context frames: {batchVideoContext}</Label>
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


            {/* Steps and Amount of Motion sliders in a row - hidden in turbo mode */}
            {!turboMode && (
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
                    min={1}
                    max={30}
                    step={1}
                    value={[batchVideoSteps]}
                    onValueChange={(value) => onBatchVideoStepsChange(value[0])}
                  />
                  {showStepsNotification && (
                    <p className="text-sm text-yellow-600 mt-1">
                      Note: We recommend 6 steps for optimal performance
                    </p>
                  )}
                </div>
                
                <div className="relative">
                  <Label htmlFor="amountOfMotion" className="text-sm font-light block mb-1">Amount of motion (experimental): {amountOfMotion}</Label>
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
            
            <div className="pt-6 pb-8 sm:pt-4 sm:pb-0">
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-center text-sm border border-input hover:bg-muted/80">
                   {showAdvanced ? (
                     <ChevronDown className="h-4 w-4 mr-2" />
                   ) : (
                     <ChevronRight className="h-4 w-4 mr-2" />
                   )}
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                  </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-0">
                <Card>
                  <CardContent className="space-y-4 pt-6">
                    <div>
                      <Label className="text-sm font-light block mb-2">Dimension source:</Label>
                  <RadioGroup
                    value={dimensionSource || 'project'}
                    onValueChange={(value) => {
                      const newSource = value as 'project' | 'firstImage' | 'custom';
                      onDimensionSourceChange(newSource);
                      if (newSource === 'custom' && (!customWidth || !customHeight)) {
                        const project = projects.find(p => p.id === selectedProjectId);
                        if (project && project.aspectRatio) {
                          const res = ASPECT_RATIO_TO_RESOLUTION[project.aspectRatio];
                          if (res) {
                            const [width, height] = res.split('x').map(Number);
                            onCustomWidthChange(width);
                            onCustomHeightChange(height);
                          }
                        }
                      }
                    }}
                    className="flex flex-wrap gap-x-4 gap-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="project" id="r_project" />
                      <Label htmlFor="r_project">Use Project Dimensions</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="firstImage" id="r_firstImage" />
                      <Label htmlFor="r_firstImage">Use First Image Dimensions</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="custom" id="r_custom" />
                      <Label htmlFor="r_custom">Custom</Label>
                    </div>
                  </RadioGroup>
                </div>
                {dimensionSource === 'custom' && (
                  <div className="grid grid-cols-2 gap-4 p-4 border rounded-md bg-muted/20">
                    <div>
                      <Label htmlFor="customWidth">Width</Label>
                      <Input
                        id="customWidth"
                        type="number"
                        value={customWidth || ''}
                        onChange={(e) => onCustomWidthChange(parseInt(e.target.value, 10) || undefined)}
                        placeholder="e.g., 1024"
                      />
                    </div>
                    <div>
                      <Label htmlFor="customHeight">Height</Label>
                      <Input
                        id="customHeight"
                        type="number"
                        value={customHeight || ''}
                        onChange={(e) => onCustomHeightChange(parseInt(e.target.value, 10) || undefined)}
                        placeholder="e.g., 576"
                      />
                    </div>
                    {(customWidth || 0) > 2048 || (customHeight || 0) > 2048 ? (
                      <p className="col-span-2 text-sm text-destructive">Warning: Very large dimensions may lead to slow generation or failures.</p>
                    ) : null}
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="random-seed"
                      checked={randomSeed}
                      onCheckedChange={onRandomSeedChange}
                    />
                    <Label htmlFor="random-seed">Random Seed</Label>
                    {!randomSeed && (
                      <span className="text-sm text-muted-foreground ml-2">
                        (Using seed: {steerableMotionSettings.seed})
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="debug"
                      checked={steerableMotionSettings.debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ debug: v })}
                    />
                    <Label htmlFor="debug">Debug Mode</Label>
                  </div>
                </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
            </div>
        </div>
    );
};

export default BatchSettingsForm; 