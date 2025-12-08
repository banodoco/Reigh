import React from "react";
import { Button } from "@/shared/components/ui/button";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { RefreshCw, Sparkles } from "lucide-react";
import { PromptMode } from "../types";

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
  // Prompt mode for slider label
  promptMode: PromptMode;
  // Automated mode with existing prompts
  onUseExistingPrompts?: () => void;
  onNewPromptsLikeExisting?: () => void;
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
  promptMode,
  onUseExistingPrompts,
  onNewPromptsLikeExisting,
}) => {
  // Normalize promptMode to handle invalid/empty values from persistence
  const normalizedPromptMode: PromptMode = 
    (promptMode === 'automated' || promptMode === 'managed') ? promptMode : 'automated';
    
  const showExistingPromptButtons = normalizedPromptMode === 'automated' && actionablePromptsCount > 0;
  return (
    <div className="mt-8 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg">
      <div className="flex justify-center">
        <div className="w-full md:w-2/3">
          {showStepsDropdown ? (
            // Show both images slider and steps dropdown side by side
            <div className="flex gap-6">
              <div className="flex-1">
                <SliderWithValue
                  label={normalizedPromptMode === 'automated' ? "Number of prompts" : "Images per prompt"}
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
              label={normalizedPromptMode === 'automated' ? "Number of prompts" : "Images per prompt"}
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
          disabled={isGenerating || !hasApiKey || (normalizedPromptMode === 'managed' && actionablePromptsCount === 0)}
        >
          {justQueued
            ? "Added to queue!"
            : isGenerating
              ? "Creating tasks..."
              : normalizedPromptMode === 'automated'
                ? `Generate ${imagesPerPrompt} New Prompts + Images`
                : `Generate ${imagesPerPrompt * actionablePromptsCount} ${imagesPerPrompt * actionablePromptsCount === 1 ? 'Image' : 'Images'}`}
        </Button>
      </div>

      {/* Existing prompts buttons - only shown in automated mode when there are non-empty prompts */}
      {showExistingPromptButtons && (
        <div className="flex flex-col sm:flex-row justify-center items-center mt-3 gap-1 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground text-xs sm:text-sm whitespace-nowrap"
            disabled={isGenerating || !hasApiKey}
            onClick={(e) => {
              e.preventDefault();
              onUseExistingPrompts?.();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
            Use Existing {actionablePromptsCount} {actionablePromptsCount === 1 ? 'Prompt' : 'Prompts'}
          </Button>
          <span className="text-muted-foreground/50 self-center hidden sm:inline">|</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground text-xs sm:text-sm whitespace-nowrap"
            disabled={isGenerating || !hasApiKey}
            onClick={(e) => {
              e.preventDefault();
              onNewPromptsLikeExisting?.();
            }}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
            New Prompts Like Existing
          </Button>
        </div>
      )}
    </div>
  );
};
