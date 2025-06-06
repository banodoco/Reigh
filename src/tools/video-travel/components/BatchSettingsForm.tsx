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
import { SteerableMotionSettings } from './ShotEditor';
import { Project } from '@/types/project';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';

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
}) => {
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    return (
        <div className="space-y-6 mb-8">
          <div className="p-4 border rounded-lg bg-card shadow-md space-y-4">
            <h3 className="text-lg font-semibold">Batch Generation Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="batchVideoPrompt" className="text-sm font-medium block mb-1.5">Prompt</Label>
                <Textarea 
                  id="batchVideoPrompt"
                  value={batchVideoPrompt}
                  onChange={(e) => onBatchVideoPromptChange(e.target.value)}
                  placeholder="Enter a global prompt for all video segments... (e.g., cinematic transition)"
                  className="min-h-[70px] text-sm"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-2 px-1">
                  This prompt guides the style and content for all video segments. Small changes can have a big impact.
                </p>
              </div>
              <div>
                <Label htmlFor="negative_prompt" className="text-sm font-medium block mb-1.5">Negative Prompt</Label>
                <Textarea
                  id="negative_prompt"
                  value={steerableMotionSettings.negative_prompt}
                  onChange={(e) => onSteerableMotionSettingsChange({ negative_prompt: e.target.value })}
                  placeholder="e.g., blurry, low quality, watermark"
                  className="min-h-[70px] text-sm"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-2 px-1">
                  Specify elements or qualities to exclude from all video segments.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="batchVideoFrames" className="text-sm font-medium block mb-1">Frames per Image: {batchVideoFrames}</Label>
                <Slider
                  id="batchVideoFrames"
                  min={10}
                  max={81} 
                  step={1}
                  value={[batchVideoFrames]}
                  onValueChange={(value) => onBatchVideoFramesChange(value[0])}
                />
                <Input
                  id="batchVideoFramesInput"
                  type="number"
                  value={batchVideoFrames}
                  onChange={(e) => onBatchVideoFramesChange(parseInt(e.target.value, 10) || 0)}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2 px-1">
                  Controls the duration of the "pause" on each image. Higher values create a slower pace.
                </p>
              </div>
              <div>
                <Label htmlFor="batchVideoContext" className="text-sm font-medium block mb-1">Number of Context Frames: {batchVideoContext}</Label>
                <Slider
                  id="batchVideoContext"
                  min={0}
                  max={60}
                  step={1}
                  value={[batchVideoContext]}
                  onValueChange={(value) => onBatchVideoContextChange(value[0])}
                />
                <p className="text-xs text-muted-foreground mt-2 px-1">
                  How many frames from a previous clip are used to influence the next, ensuring a smoother transition.
                </p>
              </div>
            </div>
            <div className="relative">
              <Label htmlFor="batchVideoSteps" className="text-sm font-medium block mb-1">Generation Steps: {batchVideoSteps}</Label>
              <Slider
                id="batchVideoSteps"
                min={1}
                max={20}
                step={1}
                value={[batchVideoSteps]}
                onValueChange={(value) => onBatchVideoStepsChange(value[0])}
              />
               <p className="text-xs text-muted-foreground mt-2 px-1">
                More steps can improve detail and quality, but will take longer to generate. A good starting point is 4-8.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium block mb-2">Dimension Source</Label>
              <RadioGroup
                value={dimensionSource || 'firstImage'}
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
                className="flex space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="firstImage" id="r_firstImage" />
                  <Label htmlFor="r_firstImage">Use First Image Dimensions</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="project" id="r_project" />
                  <Label htmlFor="r_project">Use Project Dimensions</Label>
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
                  <div>
                    <Label htmlFor="model_name">Model Name</Label>
                    <Input
                      id="model_name"
                      value={steerableMotionSettings.model_name}
                      onChange={(e) => onSteerableMotionSettingsChange({ model_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="seed">Seed</Label>
                    <Input
                      id="seed"
                      type="number"
                      value={steerableMotionSettings.seed}
                      onChange={(e) => onSteerableMotionSettingsChange({ seed: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                    <Label htmlFor="saturation">Post-Gen Saturation: {steerableMotionSettings.after_first_post_generation_saturation}</Label>
                    <Slider
                      id="saturation"
                      min={0} max={2} step={0.05}
                      value={[steerableMotionSettings.after_first_post_generation_saturation]}
                      onValueChange={(v) => onSteerableMotionSettingsChange({ after_first_post_generation_saturation: v[0] })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="brightness">Post-Gen Brightness: {steerableMotionSettings.after_first_post_generation_brightness}</Label>
                    <Slider
                      id="brightness"
                      min={-1} max={1} step={0.05}
                      value={[steerableMotionSettings.after_first_post_generation_brightness]}
                      onValueChange={(v) => onSteerableMotionSettingsChange({ after_first_post_generation_brightness: v[0] })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="fade_in_duration">Fade-In Duration (JSON)</Label>
                  <Textarea
                    id="fade_in_duration"
                    value={steerableMotionSettings.fade_in_duration}
                    onChange={(e) => onSteerableMotionSettingsChange({ fade_in_duration: e.target.value })}
                    placeholder='e.g., {"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}'
                    className="font-mono text-xs"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="fade_out_duration">Fade-Out Duration (JSON)</Label>
                  <Textarea
                    id="fade_out_duration"
                    value={steerableMotionSettings.fade_out_duration}
                    onChange={(e) => onSteerableMotionSettingsChange({ fade_out_duration: e.target.value })}
                    placeholder='e.g., {"low_point":0.0,"high_point":0.8,"curve_type":"ease_in_out","duration_factor":0.0}'
                    className="font-mono text-xs"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="debug"
                      checked={steerableMotionSettings.debug ?? true}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ debug: v })}
                    />
                    <Label htmlFor="debug">Debug Mode</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="apply_reward_lora"
                      checked={steerableMotionSettings.apply_reward_lora ?? true}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ apply_reward_lora: v })}
                    />
                    <Label htmlFor="apply_reward_lora">Apply Reward LoRA</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="colour-match"
                      checked={steerableMotionSettings.colour_match_videos ?? true}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ colour_match_videos: v })}
                    />
                    <Label htmlFor="colour-match">Color Match Videos</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="apply-causvid"
                      checked={steerableMotionSettings.apply_causvid ?? true}
                      onCheckedChange={(v) => onSteerableMotionSettingsChange({ apply_causvid: v })}
                    />
                    <Label htmlFor="apply-causvid">Apply Causvid</Label>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
    );
};

export default BatchSettingsForm; 