import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Slider } from "@/shared/components/ui/slider";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { ChevronsUpDown, Info } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from './ShotEditor/state/types';
import { Project } from '@/types/project';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraModel } from '@/shared/components/LoraSelectorModal';

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
  
  // Image count for conditional UI
  imageCount?: number;
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
  imageCount = 0,
}) => {
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    return (
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-card shadow-md space-y-4">


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Label htmlFor="batchVideoPrompt" className="text-sm font-medium block mb-1.5">Prompt:</Label>
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
                  />
                </div>
                <div className="relative">
                  <Label htmlFor="negative_prompt" className="text-sm font-medium block mb-1.5">Negative Prompt:</Label>
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
                  />
                </div>
            </div>
            

            
            <div className={`grid grid-cols-1 gap-4 ${!isTimelineMode && imageCount > 2 ? 'md:grid-cols-2' : ''}`}>
                {!isTimelineMode && (
                  <div className="relative">
                    <Label htmlFor="batchVideoFrames" className="text-sm font-medium block mb-1">
                      {imageCount === 1 ? 'Frames to generate' : 'Frames per pair'}: {batchVideoFrames}
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
                    />
                  </div>
                )}
                {!isTimelineMode && imageCount > 2 && (
                  <div className="relative">
                    <Label htmlFor="batchVideoContext" className="text-sm font-medium block mb-1">Number of Context Frames: {batchVideoContext}</Label>
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

            {/* Toggles row */}
            <div className="flex flex-wrap gap-4 items-center">
              {/* Only show Accelerated Mode toggle if not using Wan 2.2 */}
              {steerableMotionSettings.model_name !== 'vace_14B_fake_cocktail_2_2' && (
                <div className="relative">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="accelerated"
                          checked={accelerated}
                          onCheckedChange={onAcceleratedChange}
                        />
                        <Label htmlFor="accelerated" className="text-sm cursor-help">Enable Accelerated Mode</Label>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Accelerated mode enables the lighti2x LoRA for faster generation but may affect motion quality.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              
              {/* Style Boost LoRAs toggle */}
              <div className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="styleboost"
                        checked={steerableMotionSettings.use_styleboost_loras}
                        onCheckedChange={(value) => onSteerableMotionSettingsChange({ use_styleboost_loras: value })}
                      />
                      <Label htmlFor="styleboost" className="text-sm cursor-help">Apply Style Boost LoRAs</Label>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Applies curated style enhancement LoRAs to improve visual quality and aesthetic appeal.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Steps slider in its own row */}
            <div className="grid grid-cols-1 gap-4 items-end">
              <div className="relative">
                <Label htmlFor="batchVideoSteps" className="text-sm font-medium block mb-1">Generation Steps: {batchVideoSteps}</Label>
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
                    {steerableMotionSettings.model_name === 'vace_14B_fake_cocktail_2_2'
                      ? 'Note: We recommend 10 steps for Wan 2.2'
                      : `Note: We recommend ${accelerated ? '8' : '20'} steps for ${accelerated ? 'Accelerated' : 'Normal'} mode`
                    }
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium block mb-2">Dimension Source</Label>
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
            
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-center text-sm">
                  <ChevronsUpDown className="h-4 w-4 mr-2" />
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="debug"
                      checked={steerableMotionSettings.debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ debug: v })}
                    />
                    <Label htmlFor="debug">Debug Mode</Label>
                  </div>
                  
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
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
    );
};

export default BatchSettingsForm; 