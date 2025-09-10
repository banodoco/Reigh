import React from "react";
import { Button } from "@/shared/components/ui/button";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";

interface GenerateControlsProps {
  imagesPerPrompt: number;
  onChangeImagesPerPrompt: (value: number) => void;
  actionablePromptsCount: number;
  isGenerating: boolean;
  hasApiKey: boolean;
  justQueued: boolean;
}

export const GenerateControls: React.FC<GenerateControlsProps> = ({
  imagesPerPrompt,
  onChangeImagesPerPrompt,
  actionablePromptsCount,
  isGenerating,
  hasApiKey,
  justQueued,
}) => {
  return (
    <div className="mt-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg">
      <div className="flex justify-center">
        <div className="w-full md:w-2/3">
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
