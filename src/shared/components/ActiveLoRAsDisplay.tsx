import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import HoverScrubVideo from "@/shared/components/HoverScrubVideo";
import { X, Plus } from "lucide-react";

export interface ActiveLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
  trigger_word?: string;
}

interface ActiveLoRAsDisplayProps {
  selectedLoras: ActiveLora[];
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, newStrength: number) => void;
  isGenerating?: boolean;
  availableLoras?: any[]; // For video detection logic
  className?: string;
  onAddTriggerWord?: (triggerWord: string) => void;
  renderHeaderActions?: () => React.ReactNode;
}

const ActiveLoRAsDisplayComponent: React.FC<ActiveLoRAsDisplayProps> = ({
  selectedLoras,
  onRemoveLora,
  onLoraStrengthChange,
  isGenerating = false,
  availableLoras = [],
  className = "",
  onAddTriggerWord,
  renderHeaderActions,
}) => {
  return (
    <div className={`space-y-4 pt-2 ${className}`}>
      <div className="flex items-center justify-between">
        <Label>Active LoRAs:</Label>
        {renderHeaderActions && renderHeaderActions()}
      </div>
      
      {selectedLoras.length === 0 ? (
        <div className="p-4 border rounded-md shadow-sm bg-slate-50/50 dark:bg-slate-800/30 text-center">
          <p className="text-sm text-muted-foreground">None selected</p>
        </div>
      ) : (
        selectedLoras.map((lora) => {
          // Check if preview is a video based on file extension or type
          const isVideo = lora.previewImageUrl && (
            lora.previewImageUrl.match(/\.(mp4|webm|mov|avi)(\?|$)/i) ||
            availableLoras.find(l => l["Model ID"] === lora.id)?.Images?.some(img => img.type?.startsWith('video'))
          );

          return (
            <div key={lora.id} className="p-3 border rounded-md shadow-sm bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-start gap-3">
                {lora.previewImageUrl && (
                  <div className="h-16 w-16 flex-shrink-0">
                    {isVideo ? (
                      <HoverScrubVideo
                        src={lora.previewImageUrl}
                        className="h-16 w-16 object-cover rounded-md border"
                        videoClassName="object-cover"
                        
                        loop
                        muted
                      />
                    ) : (
                      <img 
                        src={lora.previewImageUrl} 
                        alt={`Preview for ${lora.name}`} 
                        className="h-16 w-16 object-cover rounded-md border"
                      />
                    )}
                  </div>
                )}
                <div className="flex-grow min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex-grow min-w-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label htmlFor={`lora-strength-${lora.id}`} className="text-sm font-light truncate pr-2 cursor-help block">
                            {lora.name}
                          </Label>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{lora.name}</p>
                        </TooltipContent>
                      </Tooltip>
                      {(() => {
                        // Get trigger word from lora object or from availableLoras
                        const triggerWord = lora.trigger_word || 
                          availableLoras.find(l => l["Model ID"] === lora.id)?.trigger_word;
                        
                        return triggerWord ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground">
                              Trigger words: <span className="font-mono text-foreground">"{triggerWord}"</span>
                            </p>
                            {onAddTriggerWord && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                                                <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => onAddTriggerWord(triggerWord)}
                                className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                                disabled={isGenerating}
                              >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Add after prompt</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => onRemoveLora(lora.id)}
                      className="text-destructive hover:bg-destructive/10 h-7 w-7 flex-shrink-0 ml-2" 
                      disabled={isGenerating}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <SliderWithValue 
                    label={`Strength`}
                    value={lora.strength}
                    onChange={(newStrength) => onLoraStrengthChange(lora.id, newStrength)}
                    min={0} 
                    max={2} 
                    step={0.05}
                    disabled={isGenerating}
                  />
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export const ActiveLoRAsDisplay = React.memo(
  ActiveLoRAsDisplayComponent,
  (prev, next) => {
    // Re-render only if selected loras, isGenerating flag, availableLoras length, OR header actions changed
    return (
      prev.isGenerating === next.isGenerating &&
      prev.availableLoras?.length === next.availableLoras?.length &&
      prev.selectedLoras.length === next.selectedLoras.length &&
      prev.selectedLoras.every((l, idx) =>
        l.id === next.selectedLoras[idx]?.id && l.strength === next.selectedLoras[idx]?.strength
      ) &&
      prev.renderHeaderActions === next.renderHeaderActions
    );
  }
);