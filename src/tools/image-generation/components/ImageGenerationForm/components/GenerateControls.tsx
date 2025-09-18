import React from "react";
import { Button } from "@/shared/components/ui/button";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

interface GenerateControlsProps {
  imagesPerPrompt: number;
  onChangeImagesPerPrompt: (value: number) => void;
  actionablePromptsCount: number;
  isGenerating: boolean;
  hasApiKey: boolean;
  justQueued: boolean;
  // Steps props for local generation
  steps?: number;
  onChangeSteps?: (value: number) => void;
  showStepsDropdown?: boolean;
}

export const GenerateControls: React.FC<GenerateControlsProps> = ({
  imagesPerPrompt,
  onChangeImagesPerPrompt,
  actionablePromptsCount,
  isGenerating,
  hasApiKey,
  justQueued,
  steps = 12,
  onChangeSteps,
  showStepsDropdown = false,
}) => {
  return (
    <div className="mt-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg">
      <div className="flex justify-center">
        <div className="w-full md:w-2/3">
          {showStepsDropdown ? (
            // Show both images slider and steps dropdown side by side
            <div className="flex gap-6">
              <div className="flex-1">
                <SliderWithValue
                  label={actionablePromptsCount <= 1 ? "Images" : "Images per Prompt"}
                  value={imagesPerPrompt}
                  onChange={onChangeImagesPerPrompt}
                  min={1}
                  max={16}
                  step={1}
                  disabled={!hasApiKey || isGenerating}
                />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Steps
                </label>
                <Select
                  value={steps.toString()}
                  onValueChange={(value) => onChangeSteps?.(parseInt(value, 10))}
                  disabled={!hasApiKey || isGenerating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="12">12</SelectItem>
                    <SelectItem value="16">16</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="24">24</SelectItem>
                    <SelectItem value="28">28</SelectItem>
                    <SelectItem value="32">32</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            // Show only images slider
            <SliderWithValue
              label={actionablePromptsCount <= 1 ? "Images" : "Images per Prompt"}
              value={imagesPerPrompt}
              onChange={onChangeImagesPerPrompt}
              min={1}
              max={16}
              step={1}
              disabled={!hasApiKey || isGenerating}
            />
          )}
        </div>
      </div>

      <div className="flex justify-center mt-4">
        <Button
          type="submit"
          className="w-full md:w-1/2 transition-none disabled:opacity-100 disabled:saturate-100 disabled:brightness-100"
          variant={justQueued ? "success" : "default"}
          disabled={isGenerating || !hasApiKey || actionablePromptsCount === 0}
        >
          {justQueued
            ? "Added to queue!"
            : isGenerating
              ? "Creating tasks..."
              : `Generate ${imagesPerPrompt * actionablePromptsCount} ${imagesPerPrompt * actionablePromptsCount === 1 ? 'Image' : 'Images'}`}
        </Button>
      </div>
    </div>
  );
};
