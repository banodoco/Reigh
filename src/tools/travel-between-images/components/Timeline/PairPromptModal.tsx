import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { X, Save } from "lucide-react";

interface PairPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  pairData: {
    index: number;
    frames: number;
    startFrame: number;
    endFrame: number;
    startImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      position: number;
    } | null;
    endImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      position: number;
    } | null;
  } | null;
  pairPrompt: string;
  pairNegativePrompt: string;
  defaultPrompt: string;
  defaultNegativePrompt: string;
  onSave: (pairIndex: number, prompt: string, negativePrompt: string) => void;
}

const PairPromptModal: React.FC<PairPromptModalProps> = ({
  isOpen,
  onClose,
  pairData,
  pairPrompt,
  pairNegativePrompt,
  defaultPrompt,
  defaultNegativePrompt,
  onSave,
}) => {
  const [prompt, setPrompt] = useState(pairPrompt);
  const [negativePrompt, setNegativePrompt] = useState(pairNegativePrompt);

  // Update state when modal opens with new data
  React.useEffect(() => {
    if (isOpen && pairData) {
      setPrompt(pairPrompt || defaultPrompt);
      setNegativePrompt(pairNegativePrompt || defaultNegativePrompt);
    }
  }, [isOpen, pairData, pairPrompt, pairNegativePrompt, defaultPrompt, defaultNegativePrompt]);

  const handleSave = () => {
    if (pairData) {
      onSave(pairData.index, prompt, negativePrompt);
      onClose();
    }
  };

  const handleReset = () => {
    // Reset to defaults by saving empty strings (which causes fallback to defaults)
    if (pairData) {
      setPrompt('');
      setNegativePrompt('');
      onSave(pairData.index, '', ''); // Immediately save the reset to database
      onClose(); // Close modal since changes are saved
    }
  };

  if (!pairData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-4">
            {/* Images Preview - Left Side */}
            {(pairData.startImage || pairData.endImage) && (
              <div className="flex items-center gap-3 flex-shrink-0">
                {pairData.startImage && (
                  <div className="relative">
                    <img
                      src={pairData.startImage.thumbUrl || pairData.startImage.url}
                      alt="Start image"
                      className="w-16 h-16 rounded-lg object-cover border border-border shadow-sm"
                    />
                    <div className="absolute -bottom-1 -left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded font-medium">
                      {pairData.startImage.position}
                    </div>
                  </div>
                )}
                
                {pairData.startImage && pairData.endImage && (
                  <div className="text-muted-foreground text-lg">→</div>
                )}
                
                {pairData.endImage && (
                  <div className="relative">
                    <img
                      src={pairData.endImage.thumbUrl || pairData.endImage.url}
                      alt="End image"
                      className="w-16 h-16 rounded-lg object-cover border border-border shadow-sm"
                    />
                    <div className="absolute -bottom-1 -left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded font-medium">
                      {pairData.endImage.position}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Title - Right Side */}
            <div className="flex flex-col gap-1 min-w-0">
              <DialogTitle className="text-lg">
                Pair {pairData.index + 1} Prompts
              </DialogTitle>
              <span className="text-sm font-normal text-muted-foreground">
                {pairData.frames} frames • {pairData.startFrame} → {pairData.endFrame}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pair Prompt */}
          <div>
            <Label htmlFor="pairPrompt" className="text-sm font-medium">
              Prompt
              <span className="text-xs text-muted-foreground ml-2">
                (Leave empty to use default)
              </span>
            </Label>
            <Textarea
              id="pairPrompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={defaultPrompt || "Enter prompt for this pair..."}
              className="min-h-[100px] mt-1"
            />
          </div>

          {/* Pair Negative Prompt */}
          <div>
            <Label htmlFor="pairNegativePrompt" className="text-sm font-medium">
              Negative Prompt
              <span className="text-xs text-muted-foreground ml-2">
                (Leave empty to use default)
              </span>
            </Label>
            <Textarea
              id="pairNegativePrompt"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder={defaultNegativePrompt || "Enter negative prompt for this pair..."}
              className="min-h-[100px] mt-1"
            />
          </div>

        </div>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={handleReset}
            className="flex items-center gap-2"
          >
            Reset to Defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PairPromptModal;
