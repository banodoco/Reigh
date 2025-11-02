import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { X, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useMediumModal } from '@/shared/hooks/useModal';
import { framesToSeconds } from "./utils/time-utils";

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
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  readOnly?: boolean;
}

const PairPromptModal: React.FC<PairPromptModalProps> = ({
  isOpen,
  readOnly = false,
  onClose,
  pairData,
  pairPrompt,
  pairNegativePrompt,
  defaultPrompt,
  defaultNegativePrompt,
  onSave,
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
}) => {
  const [prompt, setPrompt] = useState(pairPrompt);
  const [negativePrompt, setNegativePrompt] = useState(pairNegativePrompt);
  const isMobile = useIsMobile();
  const promptTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  // Modal styling
  const modal = useMediumModal();

  // Update state when modal opens with new data
  React.useEffect(() => {
    if (isOpen && pairData) {
      // Only set form values if there are actual custom prompts
      // Leave empty if using defaults to show faded placeholders
      setPrompt(pairPrompt?.trim() ? pairPrompt : '');
      setNegativePrompt(pairNegativePrompt?.trim() ? pairNegativePrompt : '');
      
      // Focus the prompt textarea when modal opens
      setTimeout(() => {
        promptTextareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, pairData, pairPrompt, pairNegativePrompt]);

  const handleSave = () => {
    if (pairData) {
      // Pass empty strings if fields are empty (will use defaults)
      // Pass actual values if user entered custom prompts
      onSave(pairData.index, prompt.trim(), negativePrompt.trim());
      onClose();
    }
  };

  const handleReset = () => {
    // Reset to defaults by clearing form fields and saving empty strings
    if (pairData) {
      setPrompt('');
      setNegativePrompt('');
      onSave(pairData.index, '', ''); // Save empty strings (will use defaults)
      onClose(); // Close modal since changes are saved
    }
  };

  const handleNavigatePrevious = () => {
    if (pairData && onNavigatePrevious) {
      // Save current changes before navigating
      onSave(pairData.index, prompt.trim(), negativePrompt.trim());
      onNavigatePrevious();
    }
  };

  const handleNavigateNext = () => {
    if (pairData && onNavigateNext) {
      // Save current changes before navigating
      onSave(pairData.index, prompt.trim(), negativePrompt.trim());
      onNavigateNext();
    }
  };

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab key opens next modal
      if (e.key === 'Tab' && !e.shiftKey && hasNext) {
        e.preventDefault();
        handleNavigateNext();
      }
      // Shift+Tab opens previous modal
      else if (e.key === 'Tab' && e.shiftKey && hasPrevious) {
        e.preventDefault();
        handleNavigatePrevious();
      }
      // Arrow keys for navigation (when not typing in textarea)
      else if (e.key === 'ArrowRight' && hasNext && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleNavigateNext();
      }
      else if (e.key === 'ArrowLeft' && hasPrevious && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleNavigatePrevious();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, hasNext, hasPrevious, handleNavigateNext, handleNavigatePrevious]);

  // Check if there are any custom prompts to reset
  const hasCustomPrompts = (prompt.trim() !== '') || (negativePrompt.trim() !== '');

  if (!pairData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={modal.className}
        style={modal.style}
        {...{...modal.props}}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-4 pt-2 pb-1' : 'px-6 pt-2 pb-1'} flex-shrink-0`}>
            <div className="flex items-start gap-4">
              {/* Images Preview - Left Side */}
              {(pairData.startImage || pairData.endImage) && (
                <div className="flex items-center gap-3 flex-shrink-0">
                  {pairData.startImage && (
                    <div className="relative">
                      <img
                        src={pairData.startImage.thumbUrl || pairData.startImage.url}
                        alt="Start image"
                        className={`${modal.isMobile ? 'w-12 h-12' : 'w-16 h-16'} rounded-lg object-cover border border-border shadow-sm`}
                      />
                      <div className="absolute -bottom-1 -left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded font-medium">
                        {pairData.startImage.position}
                      </div>
                    </div>
                  )}
                  
                  {pairData.startImage && pairData.endImage && (
                    <div className={`text-muted-foreground ${modal.isMobile ? 'text-base' : 'text-lg'}`}>→</div>
                  )}
                  
                  {pairData.endImage && (
                    <div className="relative">
                      <img
                        src={pairData.endImage.thumbUrl || pairData.endImage.url}
                        alt="End image"
                        className={`${modal.isMobile ? 'w-12 h-12' : 'w-16 h-16'} rounded-lg object-cover border border-border shadow-sm`}
                      />
                      <div className="absolute -bottom-1 -left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded font-medium">
                        {pairData.endImage.position}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Title - Right Side */}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className={modal.isMobile ? 'text-base' : 'text-lg'}>
                    Pair {pairData.index + 1} Prompts
                  </DialogTitle>
                  {/* Navigation Chevrons */}
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNavigatePrevious}
                      disabled={!hasPrevious}
                      className="h-7 w-7 p-0"
                      title="Previous pair"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNavigateNext}
                      disabled={!hasNext}
                      className="h-7 w-7 p-0"
                      title="Next pair"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <span className="text-sm font-normal text-muted-foreground">
                  {framesToSeconds(pairData.frames)} ({pairData.frames} frames) • {framesToSeconds(pairData.startFrame)} → {framesToSeconds(pairData.endFrame)}
                </span>
              </div>
            </div>
          </DialogHeader>
        </div>
        
        <div className={`flex-shrink-0 ${modal.isMobile ? 'px-4' : 'px-6'}`}>
          <div className="grid gap-4 py-3">
            {/* Pair Prompt */}
            <div>
              <Label htmlFor="pairPrompt" className="text-sm font-medium">
                Prompt
                {!readOnly && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (Leave empty to use default)
                  </span>
                )}
              </Label>
              <Textarea
                ref={promptTextareaRef}
                id="pairPrompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={prompt.trim() ? "Enter your custom prompt..." : `Default: ${defaultPrompt || "No default prompt"}`}
                className="min-h-[100px] mt-1"
                disabled={readOnly}
                readOnly={readOnly}
              />
            </div>

            {/* Pair Negative Prompt */}
            <div>
              <Label htmlFor="pairNegativePrompt" className="text-sm font-medium">
                Negative Prompt
                {!readOnly && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (Leave empty to use default)
                  </span>
                )}
              </Label>
              <Textarea
                id="pairNegativePrompt"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder={negativePrompt.trim() ? "Enter your custom negative prompt..." : `Default: ${defaultNegativePrompt || "No default negative prompt"}`}
                className="min-h-[100px] mt-1"
                disabled={readOnly}
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>
        
        <div className={modal.footerClass}>
          <DialogFooter className={`${modal.isMobile ? 'px-4 pt-4 pb-0 flex-col gap-3' : 'px-6 pt-5 pb-0'} border-t`}>
            {readOnly ? (
              <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
                Close
              </Button>
            ) : (
              <div className={`${modal.isMobile ? 'flex flex-col gap-3 w-full' : 'flex justify-between w-full'}`}>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={!hasCustomPrompts}
                  className={`flex items-center gap-2 ${modal.isMobile ? 'order-3' : ''}`}
                >
                  Reset to Defaults
                </Button>
                <div className={`flex gap-2 ${modal.isMobile ? 'order-1 justify-between' : ''}`}>
                  <Button variant="outline" onClick={onClose} className={modal.isMobile ? 'flex-1' : ''}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} className={`flex items-center gap-2 ${modal.isMobile ? 'flex-1' : ''}`}>
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PairPromptModal;
