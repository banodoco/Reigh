import React, { useState } from 'react';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import FileInput from "@/shared/components/FileInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Slider } from "@/shared/components/ui/slider";
import { PromptEntry } from "@/tools/image-generation/components/ImageGenerationForm";
import { Wand2 } from 'lucide-react';

// This component might be very light or not used, 
// as many controls are directly on the EditTravelToolPage.
// It's created for structural consistency if needed later.

interface EditTravelFormProps {
  prompts: PromptEntry[];
  onManagePrompts: () => void;
  openaiApiKey: string | null;
  falApiKey: string | null;
  onFileChange: (files: File[]) => void;
  onFileRemove: () => void;
  inputFilePreviewUrl: string | null;
  inputFileName: string | undefined;
  isOverallGenerating: boolean;
  videoDuration: number | null;
  effectiveFps: number;
  reconstructVideo: boolean;
  onReconstructVideoChange: (checked: boolean) => void;
  isClientSideReconstructing: boolean;
  imagesPerPrompt: number;
  onImagesPerPromptChange: (value: number) => void;
  generationMode: 'kontext' | 'flux';
  onGenerationModeChange: (value: 'kontext' | 'flux') => void;
  fluxSoftEdgeStrength: number;
  onFluxSoftEdgeStrengthChange: (value: number) => void;
  fluxDepthStrength: number;
  onFluxDepthStrengthChange: (value: number) => void;
  onGenerate: () => void;
  canGenerate: boolean;
  isCreatingTask: boolean;
  inputFile: File | null;
}

const EditTravelForm: React.FC<EditTravelFormProps> = ({
  prompts,
  onManagePrompts,
  openaiApiKey,
  falApiKey,
  onFileChange,
  onFileRemove,
  inputFilePreviewUrl,
  inputFileName,
  isOverallGenerating,
  videoDuration,
  effectiveFps,
  reconstructVideo,
  onReconstructVideoChange,
  isClientSideReconstructing,
  imagesPerPrompt,
  onImagesPerPromptChange,
  generationMode,
  onGenerationModeChange,
  fluxSoftEdgeStrength,
  onFluxSoftEdgeStrengthChange,
  fluxDepthStrength,
  onFluxDepthStrengthChange,
  onGenerate,
  canGenerate,
  isCreatingTask,
  inputFile,
}) => {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Prompts</CardTitle>
            <CardDescription>Add or edit prompts for the image editing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={onManagePrompts} 
              className="w-full mb-4" 
              disabled={!(openaiApiKey || falApiKey)}
            >
              <Wand2 className="mr-2 h-4 w-4" /> Manage Prompts ({prompts.length})
            </Button>
            <ScrollArea className="h-[200px] border rounded-md p-2">
              {prompts.length === 0 && <p className="text-sm text-muted-foreground">No prompts added yet.</p>}
              {prompts.map(p => (
                <div key={p.id} className="text-sm p-1 border-b truncate" title={p.fullPrompt}>
                  {p.shortPrompt || p.fullPrompt}
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Input Image & Settings</CardTitle>
            <CardDescription>Upload an image and configure generation settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileInput
                onFileChange={onFileChange}
                onFileRemove={onFileRemove}
                acceptTypes={['image', 'video']}
                label="Input Image or Video"
                currentFilePreviewUrl={inputFilePreviewUrl}
                currentFileName={inputFileName}
                disabled={isOverallGenerating}
              />
             {inputFile && inputFile.type.startsWith('video/') && videoDuration && prompts.length > 0 && (
                <div className="text-sm text-muted-foreground mt-1">
                  {`Generating ${prompts.length} frame${prompts.length === 1 ? '' : 's'} from this ${videoDuration.toFixed(1)}s video`}
                  {prompts.length > 1 && effectiveFps > 0 && 
                    ` (~${effectiveFps.toFixed(1)} FPS).`
                  }
                  {prompts.length === 1 && ` (using first available frame).`}
                  {prompts.length > 1 && videoDuration === 0 && ` (video duration is 0s, cannot determine FPS, will use first frame for all prompts).`}
                  {prompts.length > 1 && effectiveFps === 0 && videoDuration > 0 && ` (effective FPS is 0, likely too short or too few prompts for >0 FPS).`}
                </div>
            )}
            {inputFile && inputFile.type.startsWith('video/') && (
              <div className="flex items-center space-x-2 mt-3">
                <Checkbox 
                  id="reconstruct-video" 
                  checked={reconstructVideo} 
                  onCheckedChange={(checked) => onReconstructVideoChange(checked as boolean)}
                  disabled={isOverallGenerating || !inputFile || !inputFile.type.startsWith('video/') || isClientSideReconstructing}
                />
                <Label 
                    htmlFor="reconstruct-video" 
                    className={`text-sm font-medium ${isOverallGenerating || !inputFile || !inputFile.type.startsWith('video/') || isClientSideReconstructing ? 'text-muted-foreground' : ''}`}
                >
                  Reconstruct as video (Beta)
                </Label>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 pt-4">
                <div>
                    <Label htmlFor="images-per-prompt" className={isOverallGenerating ? 'text-muted-foreground' : ''}>Images per Prompt</Label>
                    <Input 
                    id="images-per-prompt" 
                    type="number" 
                    value={imagesPerPrompt} 
                    onChange={(e) => onImagesPerPromptChange(Math.max(1, parseInt(e.target.value) || 1))} 
                    min="1"
                    disabled={isOverallGenerating}
                    />
                </div>
            </div>

            <div className="pt-4">
              <Label className="text-sm font-medium">Generation Mode</Label>
              <RadioGroup 
                defaultValue="kontext" 
                value={generationMode} 
                onValueChange={(value: string) => onGenerationModeChange(value as 'kontext' | 'flux')}
                className="flex items-center space-x-4 mt-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="kontext" id="mode-kontext" disabled={isOverallGenerating} />
                  <Label htmlFor="mode-kontext" className={`font-normal ${isOverallGenerating ? 'text-muted-foreground' : ''}`}>Kontext (Creative Edit)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="flux" id="mode-flux" disabled={isOverallGenerating} />
                  <Label htmlFor="mode-flux" className={`font-normal ${isOverallGenerating ? 'text-muted-foreground' : ''}`}>Flux Control (Retain Structure)</Label>
                </div>
              </RadioGroup>

              {generationMode === 'flux' && (
                <>
                  <div className="pt-3">
                    <Label htmlFor="flux-soft-edge-strength" className={`text-sm font-medium ${isOverallGenerating ? 'text-muted-foreground' : ''}`}>
                      Soft Edge Strength: {Math.round(fluxSoftEdgeStrength * 100)}%
                    </Label>
                    <Slider
                      id="flux-soft-edge-strength"
                      min={0}
                      max={1}
                      step={0.05}
                      value={[fluxSoftEdgeStrength]}
                      onValueChange={(value) => onFluxSoftEdgeStrengthChange(value[0])}
                      className="mt-1"
                      disabled={isOverallGenerating}
                    />
                  </div>
                  <div className="pt-3">
                    <Label htmlFor="flux-depth-strength" className={`text-sm font-medium ${isOverallGenerating ? 'text-muted-foreground' : ''}`}>
                      Depth Strength: {Math.round(fluxDepthStrength * 100)}%
                    </Label>
                    <Slider
                      id="flux-depth-strength"
                      min={0}
                      max={1}
                      step={0.05}
                      value={[fluxDepthStrength]}
                      onValueChange={(value) => onFluxDepthStrengthChange(value[0])}
                      className="mt-1"
                      disabled={isOverallGenerating}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="mb-8 text-center">
        <Button 
          onClick={onGenerate} 
          disabled={!canGenerate} 
          size="lg"
        >
          {isCreatingTask ? "Creating Task..." : 
           isOverallGenerating ? "Generating..." : 
           `Generate Edits (${generationMode === 'flux' ? 'Flux' : 'Kontext'})`}
        </Button>
      </div>
    </>
  );
};

export default EditTravelForm; 