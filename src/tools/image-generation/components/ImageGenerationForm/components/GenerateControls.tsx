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
  // Prompt mode for slider label
  promptMode: PromptMode;
  // Automated mode with existing prompts
  onUseExistingPrompts?: () => void;
  onNewPromptsLikeExisting?: () => void;
  // Prompt multiplier (automated mode only)
  promptMultiplier?: number;
  onChangePromptMultiplier?: (value: number) => void;
}

export const GenerateControls: React.FC<GenerateControlsProps> = ({
  imagesPerPrompt,
  onChangeImagesPerPrompt,
  actionablePromptsCount,
  isGenerating,
  hasApiKey,
  justQueued,
  promptMode,
  onUseExistingPrompts,
  onNewPromptsLikeExisting,
  promptMultiplier = 1,
  onChangePromptMultiplier,
}) => {
  // Normalize promptMode to handle invalid/empty values from persistence
  const normalizedPromptMode: PromptMode =
    (promptMode === 'automated' || promptMode === 'managed') ? promptMode : 'automated';

  const showExistingPromptButtons = normalizedPromptMode === 'automated' && actionablePromptsCount > 0;
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Slider row - compact inline with button */}
      <div className="w-full max-w-md">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <SliderWithValue
              label={normalizedPromptMode === 'automated' ? "Number of prompts" : "Images per prompt"}
              value={imagesPerPrompt}
              onChange={onChangeImagesPerPrompt}
              min={1}
              max={32}
              step={1}
              disabled={!hasApiKey || isGenerating}
            />
          </div>
          {normalizedPromptMode === 'automated' && (
            <div className="w-14 flex-shrink-0">
              <Select
                value={promptMultiplier.toString()}
                onValueChange={(value) => onChangePromptMultiplier?.(parseInt(value, 10))}
                disabled={!hasApiKey || isGenerating}
              >
                <SelectTrigger variant="retro" className="h-9">
                  <span className="text-muted-foreground">×</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent variant="retro">
                  <SelectItem variant="retro" value="1">1</SelectItem>
                  <SelectItem variant="retro" value="2">2</SelectItem>
                  <SelectItem variant="retro" value="3">3</SelectItem>
                  <SelectItem variant="retro" value="4">4</SelectItem>
                  <SelectItem variant="retro" value="5">5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <Button
        type="submit"
        className="w-full max-w-md transition-none disabled:opacity-100 disabled:saturate-100 disabled:brightness-100"
        variant={justQueued ? "success" : "retro"}
        size="retro-default"
        disabled={isGenerating || !hasApiKey || (normalizedPromptMode === 'managed' && actionablePromptsCount === 0)}
      >
        {justQueued
          ? "Creating tasks!"
          : isGenerating
            ? "Submitting..."
            : normalizedPromptMode === 'automated'
              ? `Generate ${imagesPerPrompt * promptMultiplier} New ${imagesPerPrompt * promptMultiplier === 1 ? 'Image' : 'Images'}`
              : `Generate ${imagesPerPrompt * actionablePromptsCount} New ${imagesPerPrompt * actionablePromptsCount === 1 ? 'Image' : 'Images'}`}
      </Button>

      {/* Existing prompts buttons - only shown in automated mode when there are non-empty prompts */}
      {showExistingPromptButtons && (
        <div className="flex flex-row justify-center items-center gap-1 sm:gap-2">
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
            Use Existing {actionablePromptsCount}
          </Button>
          <span className="text-muted-foreground/50 self-center">|</span>
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
            More Like Existing
          </Button>
        </div>
      )}
    </div>
  );
};
